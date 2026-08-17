'use client';

/**
 * 3dwork — the STL bench.
 *
 * Holds the project state and wires the four pieces together: the gallery of
 * parts on the left, the table in the middle, the inspector on the right, and
 * the steel take-off underneath. Everything lives in the browser; nothing is
 * uploaded.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Boxes,
  Download,
  FileDown,
  Grid3x3,
  Loader2,
  Maximize,
  Package,
  Ruler,
  Save,
  ScanEye,
  Sparkles,
  Tags,
  Upload,
  Wrench,
} from 'lucide-react';
import {
  autoFix,
  computeBounds,
  recenter,
  simplify,
  zUpToYUp,
  type FixReport,
  type SimplifyReport,
} from '@/lib/3dwork/mesh';
import {
  PROFILE_LABELS,
  describePart,
  evaluateCutItem,
  massGrams,
  materialById,
  type CutItem,
} from '@/lib/3dwork/measure';
import { exportBinaryStl, parseStl } from '@/lib/3dwork/stl';
import {
  assembledPlacement,
  createProject,
  guessSlot,
  newProjectId,
  nextColor,
  scatterPlacement,
  type Part,
  type PartSize,
  type Placement,
  type Project,
  type Transform,
} from '@/lib/3dwork/project';
import {
  deleteGeometry,
  listProjects,
  loadGeometry,
  saveGeometry,
  saveProject,
} from '@/lib/3dwork/storage';
import {
  HARDWARE_PRESETS,
  THREAD_STANDARDS,
  defaultSpec,
  hardwareLabel,
  hardwareMesh,
  type HardwareKind,
  type HardwareSpec,
} from '@/lib/3dwork/hardware';
import { createZip, safeFileName } from '@/lib/3dwork/zip';
import { emptySketch, toSvg, type Sketch } from '@/lib/3dwork/sketch';
import { silhouette, type Outline2D, type ViewPlane } from '@/lib/3dwork/silhouette';
import { formatCount, formatMass, type Unit } from '@/lib/3dwork/format';
import { bakeTransform, scaleSoup } from './bake';
import { Gallery } from './gallery';
import { Inspector, type InspectorTab } from './inspector';
import { SketchBoard } from './sketch-board';
import { SteelPanel, makeCutItem } from './steel';
import { renderThumbnail } from './thumbnail';
import { Viewport, type ViewportCallout, type ViewportPart } from './viewport';
import { ACTION_GHOST, ACTION_PRIMARY, LABEL, PANEL } from './ui';

type Mode = 'assembled' | 'scattered';
type Workspace = 'bench' | 'sketch';

const newPartId = () =>
  `part_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

const newVersionId = () =>
  `ver_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

function download(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke on the next tick so the download has definitely started.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ToolbarToggle({
  active,
  onClick,
  icon: Icon,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 text-[0.65rem] font-extrabold uppercase tracking-[0.03em] transition-colors ${
        active
          ? 'bg-emerald-600 text-white'
          : 'border border-slate-300 text-slate-500 hover:border-slate-400 hover:text-slate-900'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}

export function Workbench() {
  const [project, setProject] = useState<Project>(() => createProject());
  const [geometries, setGeometries] = useState<Map<string, Float32Array>>(() => new Map());
  const [mode, setMode] = useState<Mode>('scattered');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<InspectorTab>('modify');
  const [wireframe, setWireframe] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [measuring, setMeasuring] = useState(false);
  const [measurePoints, setMeasurePoints] = useState<[number, number, number][]>([]);
  const [zUp, setZUp] = useState(true);
  const [unit, setUnit] = useState<Unit>('mm');
  const [cutItems, setCutItems] = useState<CutItem[]>([]);
  const [showSteel, setShowSteel] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [fixReport, setFixReport] = useState<FixReport | null>(null);
  const [simplifyReport, setSimplifyReport] = useState<SimplifyReport | null>(null);
  const [frameToken, setFrameToken] = useState(0);
  const [dragging, setDragging] = useState(false);

  const [workspace, setWorkspace] = useState<Workspace>('bench');
  const [xray, setXray] = useState(false);
  const [showCallouts, setShowCallouts] = useState(true);
  const [sketch, setSketch] = useState<Sketch>(() => emptySketch());
  const [sketchPlane, setSketchPlane] = useState<ViewPlane>('xy');
  const [outline, setOutline] = useState<{ name: string; data: Outline2D } | null>(null);
  const [outlineBusy, setOutlineBusy] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const loadedRef = useRef(false);

  // Restore the most recent project, geometry included.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const saved = await listProjects();
      if (cancelled) return;

      if (saved.length === 0) {
        // Nothing to restore: give the blank draft a real id now that we are
        // on the client, so autosave has something stable to write against.
        setProject((current) => ({ ...current, id: newProjectId() }));
        loadedRef.current = true;
        return;
      }

      const restored = saved[0];
      const loaded = new Map<string, Float32Array>();
      for (const part of restored.parts) {
        // Every version is restored, not just the active one, so the history
        // survives a reload and you can still flip back to the damaged mesh.
        for (const version of part.versions ?? []) {
          const soup = await loadGeometry(version.id);
          if (soup) loaded.set(version.id, soup);
        }
      }
      if (cancelled) return;

      // A part whose geometry did not survive would render as nothing at all.
      const usable = {
        ...restored,
        parts: restored.parts.filter((part) => loaded.has(part.activeVersionId)),
      };
      setProject(usable);
      setGeometries(loaded);
      setFrameToken((token) => token + 1);
      loadedRef.current = true;
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Autosave, debounced so dragging a slider does not hammer IndexedDB.
  useEffect(() => {
    if (!loadedRef.current) return;
    const timer = setTimeout(() => void saveProject(project), 800);
    return () => clearTimeout(timer);
  }, [project]);

  const selectedPart = useMemo(
    () => project.parts.find((part) => part.id === selectedId) ?? null,
    [project.parts, selectedId]
  );
  const selectedSoup = selectedPart ? (geometries.get(selectedPart.activeVersionId) ?? null) : null;

  /** Bounding sizes drive the scatter layout; cheap enough to redo on change. */
  const sizes = useMemo(() => {
    const map = new Map<string, PartSize>();
    for (const part of project.parts) {
      const soup = geometries.get(part.activeVersionId);
      if (!soup) continue;
      const bounds = computeBounds(soup);
      map.set(part.id, {
        width: Math.max(1, bounds.size[0] * Math.abs(part.transform.scale.x)),
        height: Math.max(1, bounds.size[1] * Math.abs(part.transform.scale.y)),
        depth: Math.max(1, bounds.size[2] * Math.abs(part.transform.scale.z)),
      });
    }
    return map;
  }, [project.parts, geometries]);

  const placements = useMemo<Placement[]>(
    () => (mode === 'assembled' ? assembledPlacement(project) : scatterPlacement(project, sizes)),
    [mode, project, sizes]
  );

  const viewportParts = useMemo<ViewportPart[]>(() => {
    const byId = new Map(placements.map((placement) => [placement.partId, placement]));
    const parts: ViewportPart[] = [];

    for (const part of project.parts) {
      const soup = geometries.get(part.activeVersionId);
      const placement = byId.get(part.id);
      if (!soup || !placement || !part.visible) continue;

      parts.push({
        id: part.id,
        color: part.color,
        soup,
        target: placement.position,
        rotation: part.transform.rotation,
        scale: part.transform.scale,
        dimmed: placement.dimmed,
      });
    }
    return parts;
  }, [project.parts, geometries, placements]);

  // Volume and mass are expensive (they weld the mesh), so results are cached
  // against the geometry and scale they were computed from.
  const statsCache = useRef(new Map<string, { volume: number; triangles: number }>());
  const assemblyTotals = useMemo(() => {
    let triangles = 0;
    let volume = 0;
    let mass = 0;
    let count = 0;

    for (const slot of project.slots) {
      const part = project.parts.find((candidate) => candidate.id === slot.activePartId);
      const soup = part ? geometries.get(part.activeVersionId) : undefined;
      if (!part || !soup || !part.visible) continue;

      const scale =
        Math.abs(part.transform.scale.x * part.transform.scale.y * part.transform.scale.z) || 1;
      const key = `${part.activeVersionId}:${soup.length}`;
      let stats = statsCache.current.get(key);
      if (!stats) {
        const measured = describePart(soup);
        stats = { volume: measured.volume, triangles: measured.triangles };
        statsCache.current.set(key, stats);
      }

      count++;
      triangles += stats.triangles;
      volume += stats.volume * scale;
      mass += massGrams(stats.volume * scale, materialById(part.materialId).density);
    }

    return { parts: count, triangles, volume, mass };
  }, [project.slots, project.parts, geometries]);

  /** The live mesh of a part, i.e. whichever version is currently selected. */
  const soupOfPart = useCallback(
    (partId: string): Float32Array | undefined => {
      const part = project.parts.find((candidate) => candidate.id === partId);
      return part ? geometries.get(part.activeVersionId) : undefined;
    },
    [project.parts, geometries]
  );

  const patchProject = useCallback((patch: (current: Project) => Project) => {
    setProject((current) => patch(current));
  }, []);

  const importFiles = useCallback(
    async (files: File[]) => {
      const stls = files.filter((file) => /\.stl$/i.test(file.name));
      if (stls.length === 0) {
        toast.error('No STL files in that drop.');
        return;
      }

      setBusy(`Reading ${stls.length} file${stls.length > 1 ? 's' : ''}…`);
      const addedParts: Part[] = [];
      const addedGeometry = new Map<string, Float32Array>();
      let failures = 0;

      for (const file of stls) {
        try {
          const raw = parseStl(await file.arrayBuffer());
          if (raw.triangles === 0) {
            failures++;
            continue;
          }

          // Land every part on its own origin so the slot anchors mean the
          // same thing regardless of where it sat in its source file.
          const soup = recenter(zUp ? zUpToYUp(raw.positions) : raw.positions);

          const id = newPartId();
          const versionId = newVersionId();
          const color = nextColor({
            ...project,
            parts: [...project.parts, ...addedParts],
          } as Project);

          addedGeometry.set(versionId, soup);
          addedParts.push({
            id,
            name: file.name.replace(/\.stl$/i, ''),
            fileName: file.name,
            slotId: guessSlot(file.name),
            color,
            visible: true,
            transform: {
              position: { x: 0, y: 0, z: 0 },
              rotation: { x: 0, y: 0, z: 0 },
              scale: { x: 1, y: 1, z: 1 },
            },
            triangles: raw.triangles,
            materialId: project.materialId,
            notes: '',
            // The file as it arrived is v1 and is never written over.
            versions: [
              {
                id: versionId,
                label: 'v1 imported',
                note: file.name,
                triangles: raw.triangles,
                createdAt: Date.now(),
              },
            ],
            activeVersionId: versionId,
            thumbnail: renderThumbnail(soup, color),
            addedAt: Date.now(),
          });
        } catch {
          failures++;
        }
      }

      if (addedParts.length > 0) {
        setGeometries((current) => {
          const next = new Map(current);
          for (const [id, soup] of addedGeometry) next.set(id, soup);
          return next;
        });

        patchProject((current) => {
          const slots = current.slots.map((slot) => {
            // Fit the first part that lands in an empty slot, so a fresh
            // import shows an assembled blaster rather than an empty frame.
            if (slot.activePartId) return slot;
            const candidate = addedParts.find((part) => part.slotId === slot.id);
            return candidate ? { ...slot, activePartId: candidate.id } : slot;
          });
          return { ...current, slots, parts: [...current.parts, ...addedParts] };
        });

        for (const [id, soup] of addedGeometry) void saveGeometry(id, soup);
        setSelectedId(addedParts[addedParts.length - 1].id);
        setFrameToken((token) => token + 1);
      }

      setBusy(null);
      if (failures > 0) toast.error(`${failures} file(s) could not be read as STL.`);
      if (addedParts.length > 0) toast.success(`Added ${addedParts.length} part(s).`);
    },
    [project, patchProject, zUp]
  );

  const patchPart = useCallback(
    (partId: string, patch: Partial<Part>) => {
      patchProject((current) => ({
        ...current,
        parts: current.parts.map((part) => (part.id === partId ? { ...part, ...patch } : part)),
      }));
    },
    [patchProject]
  );

  const patchTransform = useCallback(
    (partId: string, patch: Partial<Transform>) => {
      patchProject((current) => ({
        ...current,
        parts: current.parts.map((part) =>
          part.id === partId ? { ...part, transform: { ...part.transform, ...patch } } : part
        ),
      }));
    },
    [patchProject]
  );

  const fitPart = useCallback(
    (slotId: string, partId: string | null) => {
      patchProject((current) => ({
        ...current,
        slots: current.slots.map((slot) =>
          slot.id === slotId ? { ...slot, activePartId: partId } : slot
        ),
      }));
    },
    [patchProject]
  );

  /** Clicking a part on the table fits it — this is the swap gesture. */
  const selectPart = useCallback(
    (partId: string | null) => {
      setSelectedId(partId);
      if (!partId) return;

      const part = project.parts.find((candidate) => candidate.id === partId);
      if (part?.slotId) fitPart(part.slotId, partId);
    },
    [project.parts, fitPart]
  );

  const removePart = useCallback(
    (partId: string) => {
      patchProject((current) => ({
        ...current,
        parts: current.parts.filter((part) => part.id !== partId),
        slots: current.slots.map((slot) =>
          slot.activePartId === partId ? { ...slot, activePartId: null } : slot
        ),
      }));
      const part = project.parts.find((candidate) => candidate.id === partId);
      const versionIds = part?.versions.map((version) => version.id) ?? [];

      setGeometries((current) => {
        const next = new Map(current);
        for (const versionId of versionIds) next.delete(versionId);
        return next;
      });
      for (const versionId of versionIds) void deleteGeometry(versionId);
      setSelectedId((current) => (current === partId ? null : current));
    },
    [project.parts, patchProject]
  );

  const duplicatePart = useCallback(
    (partId: string) => {
      const source = project.parts.find((part) => part.id === partId);
      const soup = soupOfPart(partId);
      if (!source || !soup) return;

      const id = newPartId();
      // The copy starts from the mesh you can currently see, as its own v1.
      const versionId = newVersionId();
      const copy: Part = {
        ...source,
        id,
        name: `${source.name} alt`,
        versions: [
          {
            id: versionId,
            label: 'v1 copied',
            note: `Copied from ${source.name}`,
            triangles: Math.floor(soup.length / 9),
            createdAt: Date.now(),
          },
        ],
        activeVersionId: versionId,
        transform: {
          position: { ...source.transform.position },
          rotation: { ...source.transform.rotation },
          scale: { ...source.transform.scale },
        },
        addedAt: Date.now(),
      };

      setGeometries((current) => new Map(current).set(versionId, soup));
      void saveGeometry(versionId, soup);
      patchProject((current) => ({ ...current, parts: [...current.parts, copy] }));
      setSelectedId(id);
      toast.success('Duplicated as a new variant in the same slot.');
    },
    [project.parts, soupOfPart, patchProject]
  );

  /**
   * Add a new version of a part and switch to it. Nothing is ever overwritten:
   * the previous geometry stays under its own version id, so a repair that goes
   * wrong is one click away from being undone.
   */
  const addVersion = useCallback(
    (partId: string, soup: Float32Array, kind: string, note: string) => {
      const versionId = newVersionId();
      setGeometries((current) => new Map(current).set(versionId, soup));
      void saveGeometry(versionId, soup);

      const triangles = Math.floor(soup.length / 9);
      patchProject((current) => ({
        ...current,
        parts: current.parts.map((part) => {
          if (part.id !== partId) return part;
          return {
            ...part,
            triangles,
            thumbnail: renderThumbnail(soup, part.color),
            activeVersionId: versionId,
            versions: [
              ...part.versions,
              {
                id: versionId,
                label: `v${part.versions.length + 1} ${kind}`,
                note,
                triangles,
                createdAt: Date.now(),
              },
            ],
          };
        }),
      }));

      return versionId;
    },
    [patchProject]
  );

  /**
   * Overwrite the active version's mesh. Used for origin moves — centring and
   * dropping to the table — which are housekeeping rather than edits worth
   * keeping a separate version of.
   */
  const updateActiveGeometry = useCallback(
    (partId: string, soup: Float32Array) => {
      const part = project.parts.find((candidate) => candidate.id === partId);
      if (!part) return;
      const versionId = part.activeVersionId;

      setGeometries((current) => new Map(current).set(versionId, soup));
      void saveGeometry(versionId, soup);
      statsCache.current.delete(`${versionId}:${soup.length}`);
      patchPart(partId, { thumbnail: renderThumbnail(soup, part.color) });
    },
    [project.parts, patchPart]
  );

  /** Switch which saved version of a part is the live one. */
  const selectVersion = useCallback(
    (partId: string, versionId: string) => {
      patchProject((current) => ({
        ...current,
        parts: current.parts.map((part) => {
          if (part.id !== partId || !part.versions.some((v) => v.id === versionId)) return part;
          const version = part.versions.find((v) => v.id === versionId);
          return {
            ...part,
            activeVersionId: versionId,
            triangles: version?.triangles ?? part.triangles,
          };
        }),
      }));
    },
    [patchProject]
  );

  const deleteVersion = useCallback(
    (partId: string, versionId: string) => {
      patchProject((current) => ({
        ...current,
        parts: current.parts.map((part) => {
          // Never drop the last version — that would leave a part with no mesh.
          if (part.id !== partId || part.versions.length < 2) return part;
          const remaining = part.versions.filter((v) => v.id !== versionId);
          if (remaining.length === part.versions.length) return part;
          const active =
            part.activeVersionId === versionId ? remaining[remaining.length - 1] : undefined;
          return {
            ...part,
            versions: remaining,
            activeVersionId: active ? active.id : part.activeVersionId,
            triangles: active ? active.triangles : part.triangles,
          };
        }),
      }));
      void deleteGeometry(versionId);
      setGeometries((current) => {
        const next = new Map(current);
        next.delete(versionId);
        return next;
      });
    },
    [patchProject]
  );

  const runAutoFix = useCallback(
    (partId: string, options: { fillHoles: boolean; maxHoleEdges: number }) => {
      const soup = soupOfPart(partId);
      if (!soup) return;

      setBusy('Repairing mesh…');
      // Yield a frame so the busy state paints before the synchronous work.
      setTimeout(() => {
        try {
          const result = autoFix(soup, {
            fillHoles: options.fillHoles,
            maxHoleEdges: options.maxHoleEdges,
          });
          addVersion(partId, result.soup, 'repaired', 'Auto fix');
          setFixReport(result.report);
          toast.success(
            result.report.after.watertight
              ? 'Repaired — mesh is watertight.'
              : `Repaired, but ${result.report.unfilledHoles} opening(s) were too large to patch.`
          );
        } catch {
          toast.error('Could not repair that mesh.');
        } finally {
          setBusy(null);
        }
      }, 30);
    },
    [soupOfPart, addVersion]
  );

  /** Slot callouts for the gunsmith overlay, anchored at each mount point. */
  const callouts = useMemo<ViewportCallout[]>(() => {
    if (!showCallouts || mode !== 'assembled') return [];

    return project.slots.map((slot) => {
      const variants = project.parts.filter((part) => part.slotId === slot.id);
      const fitted = variants.find((part) => part.id === slot.activePartId);
      return {
        id: slot.id,
        label: slot.name,
        detail: fitted ? fitted.name : 'Empty',
        anchor: slot.anchor,
        filled: Boolean(fitted),
        index: fitted ? variants.indexOf(fitted) : 0,
        variants: variants.length,
      };
    });
  }, [project.slots, project.parts, showCallouts, mode]);

  const cycleSlot = useCallback(
    (slotId: string, direction: 1 | -1) => {
      const variants = project.parts.filter((part) => part.slotId === slotId);
      if (variants.length === 0) return;

      const slot = project.slots.find((candidate) => candidate.id === slotId);
      const current = variants.findIndex((part) => part.id === slot?.activePartId);
      // Wrap in both directions; an empty slot starts at the first variant.
      const next = variants[(current + direction + variants.length) % variants.length];

      fitPart(slotId, next.id);
      setSelectedId(next.id);
    },
    [project.parts, project.slots, fitPart]
  );

  const selectSlot = useCallback(
    (slotId: string) => {
      const slot = project.slots.find((candidate) => candidate.id === slotId);
      if (slot?.activePartId) setSelectedId(slot.activePartId);
      else cycleSlot(slotId, 1);
    },
    [project.slots, cycleSlot]
  );

  const dropToTable = useCallback(
    (partId: string) => {
      const soup = soupOfPart(partId);
      if (!soup) return;
      updateActiveGeometry(partId, recenter(soup, true));
      patchTransform(partId, { position: { x: 0, y: 0, z: 0 } });
    },
    [soupOfPart, updateActiveGeometry, patchTransform]
  );

  const centerPart = useCallback(
    (partId: string) => {
      const soup = soupOfPart(partId);
      if (!soup) return;
      updateActiveGeometry(partId, recenter(soup));
      patchTransform(partId, { position: { x: 0, y: 0, z: 0 } });
    },
    [soupOfPart, updateActiveGeometry, patchTransform]
  );

  const runSimplify = useCallback(
    (partId: string, options: { strength: number; alsoFix: boolean }) => {
      const soup = soupOfPart(partId);
      if (!soup) return;

      setBusy('Simplifying mesh…');
      setTimeout(() => {
        try {
          const result = simplify(soup, {
            strength: options.strength,
            fillHoles: options.alsoFix,
          });
          let next = result.soup;

          if (options.alsoFix) {
            // Clustering first means the repair pass works on a far smaller
            // mesh, which is both quicker and more likely to close up.
            const fixed = autoFix(next, { fillHoles: true, maxHoleEdges: 200 });
            next = fixed.soup;
            setFixReport(fixed.report);
          }

          addVersion(
            partId,
            next,
            options.alsoFix ? 'simplified + fixed' : 'simplified',
            `${Math.round(result.report.reduction * 100)}% fewer triangles`
          );
          setSimplifyReport(result.report);
          toast.success(
            `${formatCount(result.report.trianglesBefore)} → ${formatCount(
              Math.floor(next.length / 9)
            )} triangles (${Math.round(result.report.reduction * 100)}% off).`
          );
        } catch {
          toast.error('Could not simplify that mesh.');
        } finally {
          setBusy(null);
        }
      }, 30);
    },
    [soupOfPart, addVersion]
  );

  const revertPart = useCallback(
    (partId: string) => {
      const part = project.parts.find((candidate) => candidate.id === partId);
      if (!part || part.versions.length === 0) return;
      selectVersion(partId, part.versions[0].id);
      setSimplifyReport(null);
      setFixReport(null);
      toast.success('Back to the mesh as imported. Later versions are still saved.');
    },
    [project.parts, selectVersion]
  );

  /** Repair every loaded part in one pass — 50-part projects need this. */
  const fixEveryPart = useCallback(() => {
    const targets = project.parts.filter((part) => geometries.has(part.activeVersionId));
    if (targets.length === 0) return;

    setBusy(`Repairing ${targets.length} parts…`);
    setTimeout(() => {
      let repaired = 0;
      let stillOpen = 0;

      for (const part of targets) {
        const soup = geometries.get(part.activeVersionId);
        if (!soup) continue;
        try {
          const result = autoFix(soup, { fillHoles: true, maxHoleEdges: 200 });
          addVersion(part.id, result.soup, 'repaired', 'Auto fix (batch)');
          repaired++;
          if (!result.report.after.watertight) stillOpen++;
        } catch {
          /* keep going; one bad part must not stop the batch */
        }
      }

      setBusy(null);
      toast.success(
        `Repaired ${repaired} part(s).` +
          (stillOpen > 0 ? ` ${stillOpen} still have open or non-manifold edges.` : '')
      );
    }, 30);
  }, [project.parts, geometries, addVersion]);

  const traceOutline = useCallback(() => {
    if (!selectedPart || !selectedSoup) {
      toast.error('Select a part on the bench first.');
      return;
    }

    setOutlineBusy(true);
    setTimeout(() => {
      try {
        const scaled = scaleSoup(
          selectedSoup,
          selectedPart.transform.scale.x,
          selectedPart.transform.scale.y,
          selectedPart.transform.scale.z
        );
        setOutline({ name: selectedPart.name, data: silhouette(scaled, sketchPlane) });
      } catch {
        toast.error('Could not trace that part.');
      } finally {
        setOutlineBusy(false);
      }
    }, 30);
  }, [selectedPart, selectedSoup, sketchPlane]);

  const exportSketchSvg = useCallback(() => {
    const svg = toSvg(sketch, {
      title: `${project.name} — ${outline?.name ?? 'sketch'}`,
      outline: outline?.data.segments,
    });
    download(
      new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }),
      `${project.name.replace(/\s+/g, '_')}_sketch.svg`
    );
  }, [sketch, outline, project.name]);

  /** The fitted parts, baked into world space, ready to write out. */
  const bakedAssembly = useCallback((): { name: string; soup: Float32Array }[] => {
    const baked: { name: string; soup: Float32Array }[] = [];

    for (const slot of project.slots) {
      const part = project.parts.find((candidate) => candidate.id === slot.activePartId);
      const soup = part ? geometries.get(part.activeVersionId) : undefined;
      if (!part || !soup || !part.visible) continue;

      baked.push({
        name: part.name,
        soup: bakeTransform(soup, {
          ...part.transform,
          position: {
            x: slot.anchor.x + part.transform.position.x,
            y: slot.anchor.y + part.transform.position.y,
            z: slot.anchor.z + part.transform.position.z,
          },
        }),
      });
    }

    return baked;
  }, [project, geometries]);

  const exportCombined = useCallback(() => {
    const baked = bakedAssembly();
    if (baked.length === 0) {
      toast.error('Nothing is fitted to the blaster yet.');
      return;
    }
    download(
      new Blob([exportBinaryStl(baked.map((entry) => entry.soup), project.name)], {
        type: 'model/stl',
      }),
      `${project.name.replace(/\s+/g, '_')}_assembly.stl`
    );
    toast.success(`Combined ${baked.length} part(s) into one STL.`);
  }, [bakedAssembly, project.name]);

  const mergeAndClean = useCallback(() => {
    const baked = bakedAssembly();
    if (baked.length === 0) {
      toast.error('Nothing is fitted to the blaster yet.');
      return;
    }

    setBusy('Merging and cleaning assembly…');
    setTimeout(() => {
      try {
        // Concatenate first, then repair the whole thing as one shell so that
        // seams between touching parts get welded rather than left as cracks.
        let total = 0;
        for (const entry of baked) total += entry.soup.length;
        const merged = new Float32Array(total);
        let offset = 0;
        for (const entry of baked) {
          merged.set(entry.soup, offset);
          offset += entry.soup.length;
        }

        const result = autoFix(merged, { fillHoles: true, maxHoleEdges: 200 });
        setFixReport(result.report);
        download(
          new Blob([exportBinaryStl([result.soup], `${project.name} merged`)], {
            type: 'model/stl',
          }),
          `${project.name.replace(/\s+/g, '_')}_merged.stl`
        );
        toast.success(
          `Merged ${baked.length} parts · ${formatCount(result.report.after.triangles)} triangles · ` +
            (result.report.after.watertight ? 'watertight' : `${result.report.unfilledHoles} opening(s) left`)
        );
      } catch {
        toast.error('Could not merge the assembly.');
      } finally {
        setBusy(null);
      }
    }, 30);
  }, [bakedAssembly, project.name]);

  const exportSplitZip = useCallback(() => {
    const parts = project.parts.filter((part) => geometries.has(part.activeVersionId));
    if (parts.length === 0) {
      toast.error('No parts to export.');
      return;
    }

    setBusy('Building print-bed zip…');
    setTimeout(() => {
      try {
        const taken = new Set<string>();
        const entries = parts.map((part) => {
          const soup = geometries.get(part.activeVersionId) as Float32Array;
          // Each file is written at the origin, sitting on the bed, with only
          // rotation and scale baked in — position belongs to the assembly.
          const oriented = bakeTransform(soup, {
            position: { x: 0, y: 0, z: 0 },
            rotation: part.transform.rotation,
            scale: part.transform.scale,
          });
          return {
            name: safeFileName(part.name, taken),
            data: exportBinaryStl([recenter(oriented, true)], part.name),
          };
        });

        download(
          createZip(entries),
          `${project.name.replace(/\s+/g, '_')}_print_bed.zip`
        );
        toast.success(`Exported ${entries.length} print-ready STL(s).`);
      } catch {
        toast.error('Could not build the zip.');
      } finally {
        setBusy(null);
      }
    }, 30);
  }, [project.parts, project.name, geometries]);

  const exportMeasurementsCsv = useCallback(() => {
    const rows = [
      [
        'Part',
        'Slot',
        'Fitted',
        'Width mm',
        'Height mm',
        'Depth mm',
        'Volume cm3',
        'Mass g',
        'Material',
        'Triangles',
        'Watertight',
      ].join(','),
    ];

    for (const part of project.parts) {
      const soup = geometries.get(part.activeVersionId);
      if (!soup) continue;

      const measured = describePart(soup);
      const scale =
        Math.abs(part.transform.scale.x * part.transform.scale.y * part.transform.scale.z) || 1;
      const volume = measured.volume * scale;
      const slot = project.slots.find((candidate) => candidate.id === part.slotId);

      rows.push(
        [
          `"${part.name.replace(/"/g, '""')}"`,
          `"${slot?.name ?? ''}"`,
          slot?.activePartId === part.id ? 'yes' : 'no',
          (measured.bounds.size[0] * Math.abs(part.transform.scale.x)).toFixed(2),
          (measured.bounds.size[1] * Math.abs(part.transform.scale.y)).toFixed(2),
          (measured.bounds.size[2] * Math.abs(part.transform.scale.z)).toFixed(2),
          (volume / 1000).toFixed(2),
          massGrams(volume, materialById(part.materialId).density).toFixed(1),
          `"${materialById(part.materialId).name}"`,
          measured.triangles,
          measured.watertight ? 'yes' : 'no',
        ].join(',')
      );
    }

    download(
      new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' }),
      `${project.name.replace(/\s+/g, '_')}_measurements.csv`
    );
  }, [project, geometries]);

  const exportCutListCsv = useCallback(() => {
    const rows = [
      ['Item', 'Profile', 'A mm', 'B mm', 'T mm', 'Length mm', 'Qty', 'Material', 'Mass kg'].join(
        ','
      ),
    ];

    for (const item of cutItems) {
      const result = evaluateCutItem(item);
      rows.push(
        [
          `"${item.label.replace(/"/g, '""')}"`,
          `"${PROFILE_LABELS[item.profile.kind]}"`,
          item.profile.a,
          item.profile.b ?? '',
          item.profile.t ?? '',
          item.length,
          item.quantity,
          `"${materialById(item.materialId).name}"`,
          result.massTotal.toFixed(3),
        ].join(',')
      );
    }

    download(
      new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' }),
      `${project.name.replace(/\s+/g, '_')}_cutlist.csv`
    );
  }, [cutItems, project.name]);

  const addCutFromSelection = useCallback(() => {
    if (!selectedPart || !selectedSoup) return;
    const measured = describePart(selectedSoup);

    setCutItems((current) => [
      ...current,
      makeCutItem({
        label: selectedPart.name,
        length: Math.round(measured.bounds.size[0]),
      }),
    ]);
    setShowSteel(true);
    toast.success('Added a cut-list row from the selected part.');
  }, [selectedPart, selectedSoup]);

  /**
   * Add a length of pipe, rod or bolt as a real part. It is generated from the
   * spec rather than a file, so its numbers stay editable afterwards.
   */
  const addHardware = useCallback(
    (spec: HardwareSpec) => {
      const soup = hardwareMesh(spec);
      const id = newPartId();
      const versionId = newVersionId();
      const color = nextColor(project);

      setGeometries((current) => new Map(current).set(versionId, soup));
      void saveGeometry(versionId, soup);

      patchProject((current) => ({
        ...current,
        parts: [
          ...current.parts,
          {
            id,
            name: hardwareLabel(spec),
            fileName: '',
            slotId: '',
            color,
            visible: true,
            transform: {
              position: { x: 0, y: 0, z: 0 },
              rotation: { x: 0, y: 0, z: 0 },
              scale: { x: 1, y: 1, z: 1 },
            },
            triangles: Math.floor(soup.length / 9),
            materialId: 'steel',
            notes: '',
            versions: [
              {
                id: versionId,
                label: 'v1 generated',
                note: hardwareLabel(spec),
                triangles: Math.floor(soup.length / 9),
                createdAt: Date.now(),
              },
            ],
            activeVersionId: versionId,
            hardware: spec,
            thumbnail: renderThumbnail(soup, color),
            addedAt: Date.now(),
          },
        ],
      }));

      setSelectedId(id);
      setFrameToken((token) => token + 1);
      toast.success(`Added ${hardwareLabel(spec)}.`);
    },
    [project, patchProject]
  );

  /** Re-generate a hardware part after its numbers change. */
  const updateHardware = useCallback(
    (partId: string, spec: HardwareSpec) => {
      const soup = hardwareMesh(spec);
      patchPart(partId, { hardware: spec, name: hardwareLabel(spec) });
      updateActiveGeometry(partId, soup);
      patchPart(partId, { triangles: Math.floor(soup.length / 9) });
    },
    [patchPart, updateActiveGeometry]
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setDragging(false);
      void importFiles(Array.from(event.dataTransfer.files));
    },
    [importFiles]
  );

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col gap-2 bg-slate-200 p-2 text-slate-800">
      <input
        ref={fileInputRef}
        type="file"
        accept=".stl"
        multiple
        className="hidden"
        onChange={(event) => {
          void importFiles(Array.from(event.target.files ?? []));
          event.target.value = '';
        }}
      />

      <div className={`${PANEL} flex flex-wrap items-center gap-2 px-3 py-2`}>
        <div className="flex items-center gap-2">
          <Boxes className="h-5 w-5 text-emerald-600" />
          <input
            value={project.name}
            onChange={(event) => patchProject((current) => ({ ...current, name: event.target.value }))}
            className="w-44 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm font-bold text-slate-900 outline-none hover:border-slate-300 focus:border-emerald-500"
            aria-label="Project name"
          />
        </div>

        <div className="h-5 w-px bg-slate-700" />

        <button type="button" className={ACTION_PRIMARY} onClick={() => fileInputRef.current?.click()}>
          <Upload className="mr-1 inline h-3 w-3" />
          Import STL
        </button>

        <div className="flex overflow-hidden rounded border border-slate-300">
          {(['bench', 'sketch'] as Workspace[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setWorkspace(option)}
              className={`px-3 py-1.5 text-[0.65rem] font-extrabold uppercase tracking-[0.03em] transition-colors ${
                workspace === option
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {option === 'bench' ? '3D bench' : '2D sketch'}
            </button>
          ))}
        </div>

        <div className="flex overflow-hidden rounded border border-slate-300">
          {(['assembled', 'scattered'] as Mode[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setMode(option)}
              className={`px-3 py-1.5 text-[0.65rem] font-extrabold uppercase tracking-[0.03em] transition-colors ${
                mode === option
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {option}
            </button>
          ))}
        </div>

        <ToolbarToggle active={false} onClick={() => setFrameToken((t) => t + 1)} icon={Maximize}>
          Fit
        </ToolbarToggle>
        <ToolbarToggle active={showGrid} onClick={() => setShowGrid((v) => !v)} icon={Grid3x3}>
          Grid
        </ToolbarToggle>
        <ToolbarToggle active={wireframe} onClick={() => setWireframe((v) => !v)} icon={Package}>
          Wire
        </ToolbarToggle>
        <ToolbarToggle
          active={xray}
          onClick={() => setXray((v) => !v)}
          icon={ScanEye}
          title="Ghost every part except the selected one"
        >
          X-ray
        </ToolbarToggle>
        <ToolbarToggle
          active={showCallouts}
          onClick={() => setShowCallouts((v) => !v)}
          icon={Tags}
          title="Mount-point labels, shown on the assembled blaster"
        >
          Callouts
        </ToolbarToggle>
        <ToolbarToggle
          active={measuring}
          onClick={() => setMeasuring((v) => !v)}
          icon={Ruler}
          title="Click points on the model to measure between them"
        >
          Ruler
        </ToolbarToggle>
        <ToolbarToggle active={showSteel} onClick={() => setShowSteel((v) => !v)} icon={Wrench}>
          Steel
        </ToolbarToggle>

        <div className="relative">
          <select
            className="cursor-pointer rounded border border-slate-300 bg-slate-200 px-2 py-1.5 text-[0.65rem] font-extrabold uppercase tracking-[0.03em] text-slate-500 hover:border-slate-400"
            value=""
            onChange={(event) => {
              const value = event.target.value;
              if (!value) return;
              event.target.value = '';

              const preset = HARDWARE_PRESETS.find((entry) => entry.name === value);
              if (preset) {
                addHardware(preset.spec);
                return;
              }
              const thread = THREAD_STANDARDS.find((entry) => entry.id === value);
              if (thread) {
                addHardware({
                  kind: 'bolt',
                  length: 60,
                  diameter: thread.majorDiameter,
                  threadPitch: thread.pitch,
                  threaded: true,
                  threadStandardId: thread.id,
                  headDiameter: thread.majorDiameter * 1.6,
                  headHeight: thread.majorDiameter * 0.65,
                });
                return;
              }
              addHardware(defaultSpec(value as HardwareKind));
            }}
            aria-label="Add stock"
          >
            <option value="">+ Add stock</option>
            <optgroup label="Presets">
              {HARDWARE_PRESETS.map((preset) => (
                <option key={preset.name} value={preset.name}>
                  {preset.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Blank">
              {(['pipe', 'rod', 'bolt', 'screw'] as HardwareKind[]).map((kind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </optgroup>
            <optgroup label="Threaded bolt">
              {THREAD_STANDARDS.map((thread) => (
                <option key={thread.id} value={thread.id}>
                  {thread.name}
                </option>
              ))}
            </optgroup>
          </select>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5" title="Rotate imported models from Z-up to Y-up">
            <input
              type="checkbox"
              checked={zUp}
              onChange={(event) => setZUp(event.target.checked)}
              className="accent-emerald-500"
            />
            <span className={LABEL}>Z-up import</span>
          </label>

          <select
            value={unit}
            onChange={(event) => setUnit(event.target.value as Unit)}
            className="rounded border border-slate-300 bg-slate-200 px-2 py-1 text-[0.65rem] font-bold uppercase text-slate-700"
            aria-label="Display unit"
          >
            <option value="mm">mm</option>
            <option value="in">inch</option>
          </select>

          <button
            type="button"
            className={ACTION_GHOST}
            onClick={fixEveryPart}
            disabled={Boolean(busy) || project.parts.length === 0}
            title="Run auto fix over every loaded part"
          >
            <Sparkles className="mr-1 inline h-3 w-3" />
            Fix all parts
          </button>
          <button type="button" className={ACTION_PRIMARY} onClick={mergeAndClean} disabled={Boolean(busy)}>
            Merge &amp; clean full assembly
          </button>
          <button type="button" className={ACTION_GHOST} onClick={exportCombined}>
            <Download className="mr-1 inline h-3 w-3" />
            Combined STL
          </button>
          <button type="button" className={ACTION_GHOST} onClick={exportSplitZip} disabled={Boolean(busy)}>
            <FileDown className="mr-1 inline h-3 w-3" />
            Split print-bed zip
          </button>
          <button type="button" className={ACTION_GHOST} onClick={exportMeasurementsCsv}>
            <Save className="mr-1 inline h-3 w-3" />
            Measurements CSV
          </button>
        </div>
      </div>

      {workspace === 'sketch' ? (
        <div className="min-h-0 flex-1">
          <SketchBoard
            sketch={sketch}
            onChange={setSketch}
            outline={outline?.data ?? null}
            outlineBusy={outlineBusy}
            plane={sketchPlane}
            onPlaneChange={setSketchPlane}
            traceName={outline?.name ?? null}
            onTrace={traceOutline}
            onClearTrace={() => setOutline(null)}
            onExportSvg={exportSketchSvg}
            onSendToCutList={(length) => {
              setCutItems((current) => [
                ...current,
                makeCutItem({ label: 'From sketch', length: Math.round(length) }),
              ]);
              setShowSteel(true);
              toast.success('Added the drawn length to the cut list.');
            }}
          />
        </div>
      ) : (
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 lg:grid-cols-[300px_minmax(0,1fr)_330px]">
        <div className="hidden min-h-0 lg:block">
          <Gallery
            project={project}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onFit={fitPart}
            onToggleVisible={(partId) => {
              const part = project.parts.find((candidate) => candidate.id === partId);
              if (part) patchPart(partId, { visible: !part.visible });
            }}
            onDelete={removePart}
            onAssignSlot={(partId, slotId) => patchPart(partId, { slotId })}
          />
        </div>

        <div
          className={`${PANEL} relative min-h-[420px] overflow-hidden ${
            dragging ? 'border-emerald-500' : ''
          }`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <Viewport
            parts={viewportParts}
            selectedId={selectedId}
            onSelect={selectPart}
            wireframe={wireframe}
            showGrid={showGrid}
            xray={xray}
            measuring={measuring}
            measurePoints={measurePoints}
            onMeasurePoint={(point) => setMeasurePoints((current) => [...current, point])}
            callouts={callouts}
            onCalloutSelect={selectSlot}
            onCalloutCycle={cycleSlot}
            frameToken={frameToken}
          />

          {project.parts.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
              <Upload className="h-8 w-8 text-slate-700" />
              <p className="text-sm font-bold text-slate-500">Drop STL files here</p>
              <p className="max-w-xs text-[0.75rem] text-slate-400">
                Load every part of your build. They land in lanes by name — barrel, grip, magazine —
                and you swap between them by clicking.
              </p>
            </div>
          )}

          <div className="pointer-events-none absolute bottom-2 left-2 flex flex-wrap gap-3 rounded bg-white px-2 py-1 font-mono text-[0.65rem] text-slate-500">
            <span>
              <span className={LABEL}>fitted </span>
              {assemblyTotals.parts}/{project.slots.length}
            </span>
            <span>
              <span className={LABEL}>tri </span>
              {formatCount(assemblyTotals.triangles)}
            </span>
            <span>
              <span className={LABEL}>mass </span>
              {formatMass(assemblyTotals.mass)}
            </span>
          </div>

          {busy && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/90">
              <div className="flex items-center gap-2 rounded border border-slate-300 bg-white px-4 py-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
                {busy}
              </div>
            </div>
          )}
        </div>

        <div className="min-h-0">
          <Inspector
            project={project}
            part={selectedPart}
            soup={selectedSoup}
            unit={unit}
            tab={tab}
            onTabChange={setTab}
            onPatchPart={patchPart}
            onPatchTransform={patchTransform}
            onDropToTable={dropToTable}
            onCenter={centerPart}
            onDuplicate={duplicatePart}
            onAutoFix={runAutoFix}
            onSimplify={runSimplify}
            onRevert={revertPart}
            onSelectVersion={selectVersion}
            onDeleteVersion={deleteVersion}
            onUpdateHardware={updateHardware}
            canRevert={Boolean(selectedPart && selectedPart.versions.length > 1)}
            fixReport={fixReport}
            simplifyReport={simplifyReport}
            busy={Boolean(busy)}
            measurePoints={measurePoints}
            measuring={measuring}
            onToggleMeasuring={() => setMeasuring((v) => !v)}
            onClearMeasure={() => setMeasurePoints([])}
            assemblyTotals={assemblyTotals}
          />
        </div>
      </div>
      )}

      {showSteel && (
        <div className="h-80 shrink-0">
          <SteelPanel
            items={cutItems}
            onChange={setCutItems}
            onExportCsv={exportCutListCsv}
            onClose={() => setShowSteel(false)}
            onAddFromSelection={selectedPart ? addCutFromSelection : null}
          />
        </div>
      )}
    </div>
  );
}
