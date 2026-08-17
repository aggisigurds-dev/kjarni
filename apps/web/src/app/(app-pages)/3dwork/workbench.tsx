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
  Cylinder,
  Download,
  FileDown,
  FolderPlus,
  Loader2,
  Maximize,
  PanelLeft,
  PanelRight,
  CircleDot,
  Combine,
  Save,
  Scissors,
  Sparkles,
  Trash2,
  Upload,
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
  deleteProject,
  listProjects,
  loadGeometry,
  saveGeometry,
  saveProject,
} from '@/lib/3dwork/storage';
import {
  HARDWARE_LABELS,
  HARDWARE_PRESETS,
  THREAD_STANDARDS,
  defaultSpec,
  hardwareLabel,
  hardwareMesh,
  type HardwareKind,
  type HardwareSpec,
} from '@/lib/3dwork/hardware';
import { makeSolid, type CylinderCut, type SolidifyReport } from '@/lib/3dwork/solidify';
import { slicePlane } from '@/lib/3dwork/slice';
import { boreCylinder } from '@/lib/3dwork/bore';
import { outerHull } from '@/lib/3dwork/outerhull';
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
import { Menu, MenuBar, MenuCheckItem, MenuItem, MenuLabel, MenuScroll, MenuSeparator } from './menu';
import { ACTION_GHOST, ACTION_PRIMARY, FIELD, LABEL, PANEL } from './ui';

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
  const [solidReport, setSolidReport] = useState<SolidifyReport | null>(null);
  const [showWeld, setShowWeld] = useState(false);
  const [showSlice, setShowSlice] = useState(false);
  const [showBore, setShowBore] = useState(false);
  const [sliceSpec, setSliceSpec] = useState({ axis: 'x' as 'x' | 'y' | 'z', position: 0, keepBoth: true });
  const [boreSpec, setBoreSpec] = useState({ axis: 'x' as 'x' | 'y' | 'z', diameter: 28, cu: 0, cv: 0 });
  const [weldBore, setWeldBore] = useState({ diameter: 28, axis: 'x' as 'x' | 'y' | 'z' });
  const [frameToken, setFrameToken] = useState(0);
  const [dragging, setDragging] = useState(false);

  const [projectList, setProjectList] = useState<{ id: string; name: string; parts: number }[]>([]);
  const [showGallery, setShowGallery] = useState(true);
  const [showInspector, setShowInspector] = useState(true);
  const [clipboard, setClipboard] = useState<{ soup: Float32Array; part: Part } | null>(null);

  const [workspace, setWorkspace] = useState<Workspace>('bench');
  const [xray, setXray] = useState(false);
  const [showCallouts, setShowCallouts] = useState(true);
  const [sketch, setSketch] = useState<Sketch>(() => emptySketch());
  const [sketchPlane, setSketchPlane] = useState<ViewPlane>('xy');
  const [outline, setOutline] = useState<{ name: string; data: Outline2D } | null>(null);
  const [outlineBusy, setOutlineBusy] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const loadedRef = useRef(false);

  const refreshProjectList = useCallback(async () => {
    const saved = await listProjects();
    setProjectList(
      saved.map((entry) => ({ id: entry.id, name: entry.name, parts: entry.parts.length }))
    );
  }, []);

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
        void refreshProjectList();
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
      void refreshProjectList();
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshProjectList]);

  // Autosave, debounced so dragging a slider does not hammer IndexedDB.
  useEffect(() => {
    if (!loadedRef.current) return;
    const timer = setTimeout(() => void saveProject(project), 800);
    return () => clearTimeout(timer);
  }, [project]);

  /** Load a saved project and every version of every part it references. */
  const openProject = useCallback(
    async (projectId: string) => {
      if (projectId === project.id) return;

      setBusy('Opening project…');
      const saved = await listProjects();
      const target = saved.find((entry) => entry.id === projectId);
      if (!target) {
        setBusy(null);
        toast.error('That project could not be found.');
        return;
      }

      const loaded = new Map<string, Float32Array>();
      for (const part of target.parts) {
        for (const version of part.versions ?? []) {
          const soup = await loadGeometry(version.id);
          if (soup) loaded.set(version.id, soup);
        }
      }

      setProject({
        ...target,
        parts: target.parts.filter((part) => loaded.has(part.activeVersionId)),
      });
      setGeometries(loaded);
      setSelectedId(null);
      setOutline(null);
      setFixReport(null);
      setSimplifyReport(null);
      setFrameToken((token) => token + 1);
      setBusy(null);
    },
    [project.id]
  );

  const createProjectFolder = useCallback(() => {
    // The current project is already saved by the autosave effect.
    setProject({ ...createProject('New build', newProjectId()) });
    setGeometries(new Map());
    setSelectedId(null);
    setOutline(null);
    setCutItems([]);
    setSketch(emptySketch());
    toast.success('Started a new project.');
    void refreshProjectList();
  }, [refreshProjectList]);

  const deleteProjectFolder = useCallback(
    async (projectId: string) => {
      const saved = await listProjects();
      const target = saved.find((entry) => entry.id === projectId);
      if (target) {
        for (const part of target.parts) {
          for (const version of part.versions ?? []) void deleteGeometry(version.id);
        }
      }
      await deleteProject(projectId);
      await refreshProjectList();

      if (projectId === project.id) createProjectFolder();
      else toast.success('Project deleted.');
    },
    [project.id, refreshProjectList, createProjectFolder]
  );

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

  /**
   * Rebuild a part as a watertight solid, optionally boring a hole through it.
   * This is the route for meshes too damaged for edge repair to touch.
   */
  const runMakeSolid = useCallback(
    (
      partId: string,
      options: { resolution: number; sealMm: number; bore: CylinderCut | null }
    ) => {
      const soup = soupOfPart(partId);
      if (!soup) return;

      setBusy('Rebuilding as a solid…');
      setTimeout(() => {
        try {
          const result = makeSolid(soup, {
            resolution: options.resolution,
            sealMm: options.sealMm,
            cuts: options.bore ? [options.bore] : [],
          });

          if (result.report.trianglesAfter === 0) {
            toast.error('Nothing solid was found — try a larger seal distance.');
            return;
          }

          addVersion(
            partId,
            result.soup,
            options.bore ? 'solid + bore' : 'solid',
            `${result.report.voxelSize.toFixed(2)} mm voxels`
          );
          setSolidReport(result.report);
          toast.success(
            `Rebuilt watertight · ${formatCount(result.report.trianglesAfter)} triangles · ` +
              `${result.report.after.boundaryEdges} open edges`
          );
        } catch {
          toast.error('Could not rebuild that mesh.');
        } finally {
          setBusy(null);
        }
      }, 30);
    },
    [soupOfPart, addVersion]
  );

  /**
   * Cut the selected part with a plane. Nothing is resampled: the half that is
   * kept is made of the original triangles, and only the ones the plane crosses
   * are split.
   */
  const runSlice = useCallback(
    (spec: { axis: 'x' | 'y' | 'z'; position: number; keepBoth: boolean }) => {
      const part = selectedPart;
      const soup = part ? soupOfPart(part.id) : undefined;
      if (!part || !soup) return;

      setBusy('Cutting…');
      setTimeout(() => {
        try {
          const result = slicePlane(soup, { axis: spec.axis, position: spec.position, cap: true });
          if (result.keep.triangles === 0 || result.cut.triangles === 0) {
            toast.error('The plane misses the part — nothing was cut.');
            return;
          }

          // The half on the near side replaces the part; the other half becomes
          // its own part so both can be printed or exported separately.
          addVersion(part.id, result.cut.soup, 'cut', `Sliced on ${spec.axis.toUpperCase()}`);

          if (spec.keepBoth) {
            const id = newPartId();
            const versionId = newVersionId();
            setGeometries((current) => new Map(current).set(versionId, result.keep.soup));
            void saveGeometry(versionId, result.keep.soup);
            patchProject((current) => ({
              ...current,
              parts: [
                ...current.parts,
                {
                  ...part,
                  id,
                  name: `${part.name} (other half)`,
                  slotId: '',
                  triangles: result.keep.triangles,
                  versions: [
                    {
                      id: versionId,
                      label: 'v1 cut',
                      note: `Other half of ${part.name}`,
                      triangles: result.keep.triangles,
                      createdAt: Date.now(),
                    },
                  ],
                  activeVersionId: versionId,
                  thumbnail: renderThumbnail(result.keep.soup, part.color),
                  addedAt: Date.now(),
                },
              ],
            }));
          }

          toast.success(
            `Cut · ${formatCount(result.report.trianglesSplit)} triangles split · ` +
              `${result.report.capLoops} face(s) closed` +
              (result.report.openLoops > 0 ? `, ${result.report.openLoops} left open` : '')
          );
        } catch {
          toast.error('Could not cut that part.');
        } finally {
          setBusy(null);
        }
      }, 30);
    },
    [selectedPart, soupOfPart, addVersion, patchProject]
  );

  /**
   * Bore a round hole through the selected part, cut against the original
   * triangles rather than a voxel grid, so nothing else is touched.
   */
  const runBore = useCallback(
    (spec: { axis: 'x' | 'y' | 'z'; diameter: number; cu: number; cv: number }) => {
      const part = selectedPart;
      const soup = part ? soupOfPart(part.id) : undefined;
      if (!part || !soup) return;

      setBusy('Boring…');
      setTimeout(() => {
        try {
          const result = boreCylinder(soup, {
            axis: spec.axis,
            diameter: spec.diameter,
            center: [spec.cu, spec.cv],
          });

          if (result.report.trianglesRemoved === 0 && result.report.trianglesSplit === 0) {
            toast.error('The bore misses the part — nothing was cut.');
            return;
          }

          if (!result.walled) {
            // Material came out but the rims never closed around the cylinder,
            // which happens on a hollow or many-chambered part. Saving that
            // would just be a hole with no wall.
            toast.error(
              'Cut a path but could not wall the hole — the part is hollow along that axis. ' +
                'Nothing was changed. Make Solid first, then bore.'
            );
            return;
          }

          addVersion(
            part.id,
            result.soup,
            'bored',
            `⌀${spec.diameter} mm through ${spec.axis.toUpperCase()}`
          );
          toast.success(
            `Bored ⌀${spec.diameter} mm · ${formatCount(result.report.wallTriangles)} wall triangles` +
              (result.report.openLoops > 0
                ? ` · ${result.report.openLoops} rim(s) left open`
                : '')
          );
        } catch {
          toast.error('Could not bore that part.');
        } finally {
          setBusy(null);
        }
      }, 30);
    },
    [selectedPart, soupOfPart, addVersion]
  );

  /**
   * Delete the geometry sealed inside the part, keeping the visible surface
   * exactly as it is. Useful before anything else, since buried walls are what
   * produce most non-manifold edges.
   */
  const runOuterHull = useCallback(
    (partId: string) => {
      const soup = soupOfPart(partId);
      if (!soup) return;

      setBusy('Stripping buried geometry…');
      setTimeout(() => {
        try {
          const result = outerHull(soup, { resolution: 220, sealMm: 0.6 });
          if (result.report.trianglesAfter === 0) {
            toast.error('Nothing visible was found — try a larger seal distance.');
            return;
          }
          addVersion(
            partId,
            result.soup,
            'hulled',
            `${Math.round((100 * result.report.trianglesRemoved) / Math.max(1, result.report.trianglesBefore))}% buried geometry removed`
          );
          toast.success(
            `Removed ${formatCount(result.report.trianglesRemoved)} buried triangles. ` +
              'The visible surface is untouched, but this opens the shell where they met it.'
          );
        } catch {
          toast.error('Could not process that part.');
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

  /** Bounding box of the selected part, for centring a cut or a bore. */
  const selectedBounds = useCallback(() => {
    if (!selectedPart) return null;
    const soup = soupOfPart(selectedPart.id);
    return soup ? computeBounds(soup) : null;
  }, [selectedPart, soupOfPart]);

  /** Bounding box of the fitted assembly, used to centre a bore through it. */
  const assemblyBounds = useCallback(() => {
    const baked = bakedAssembly();
    let total = 0;
    for (const entry of baked) total += entry.soup.length;
    const merged = new Float32Array(total);
    let offset = 0;
    for (const entry of baked) {
      merged.set(entry.soup, offset);
      offset += entry.soup.length;
    }
    return computeBounds(merged);
  }, [bakedAssembly]);

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

  /**
   * Weld every fitted part into a single watertight solid, optionally with a
   * bore through it. Voxelising several meshes at once *is* the union, so the
   * parts fuse where they touch and the overlaps are absorbed rather than left
   * as surfaces crossing each other.
   */
  const weldAssembly = useCallback(
    (options: { resolution: number; sealMm: number; bore: CylinderCut | null }) => {
      const baked = bakedAssembly();
      if (baked.length === 0) {
        toast.error('Nothing is fitted to the blaster yet.');
        return;
      }

      setBusy(`Welding ${baked.length} parts into one solid…`);
      setTimeout(() => {
        try {
          let total = 0;
          for (const entry of baked) total += entry.soup.length;
          const merged = new Float32Array(total);
          let offset = 0;
          for (const entry of baked) {
            merged.set(entry.soup, offset);
            offset += entry.soup.length;
          }

          const result = makeSolid(merged, {
            resolution: options.resolution,
            sealMm: options.sealMm,
            cuts: options.bore ? [options.bore] : [],
          });
          setSolidReport(result.report);

          download(
            new Blob([exportBinaryStl([result.soup], `${project.name} welded`)], {
              type: 'model/stl',
            }),
            `${project.name.replace(/\s+/g, '_')}_welded_solid.stl`
          );
          toast.success(
            `Welded ${baked.length} parts · ${formatCount(result.report.trianglesAfter)} triangles · ` +
              `${result.report.after.boundaryEdges} open edges`
          );
        } catch {
          toast.error('Could not weld the assembly.');
        } finally {
          setBusy(null);
        }
      }, 30);
    },
    [bakedAssembly, project.name]
  );

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

  const copySelected = useCallback(() => {
    if (!selectedPart || !selectedSoup) return;
    setClipboard({ soup: selectedSoup, part: selectedPart });
    toast.success(`Copied ${selectedPart.name}.`);
  }, [selectedPart, selectedSoup]);

  /**
   * Paste the copied part as a new one. It shares nothing with the original —
   * the geometry is written under a fresh version so editing one never touches
   * the other.
   */
  const pasteClipboard = useCallback(() => {
    if (!clipboard) return;

    const id = newPartId();
    const versionId = newVersionId();
    const source = clipboard.part;

    setGeometries((current) => new Map(current).set(versionId, clipboard.soup));
    void saveGeometry(versionId, clipboard.soup);

    patchProject((current) => ({
      ...current,
      parts: [
        ...current.parts,
        {
          ...source,
          id,
          name: `${source.name} copy`,
          transform: {
            position: { ...source.transform.position },
            rotation: { ...source.transform.rotation },
            scale: { ...source.transform.scale },
          },
          versions: [
            {
              id: versionId,
              label: 'v1 pasted',
              note: `Pasted from ${source.name}`,
              triangles: Math.floor(clipboard.soup.length / 9),
              createdAt: Date.now(),
            },
          ],
          activeVersionId: versionId,
          addedAt: Date.now(),
        },
      ],
    }));

    setSelectedId(id);
    toast.success(`Pasted ${source.name}.`);
  }, [clipboard, patchProject]);

  // Keyboard shortcuts. Anything typed into a field belongs to the field.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      const meta = event.metaKey || event.ctrlKey;

      if (meta && event.key.toLowerCase() === 'c') {
        copySelected();
        return;
      }
      if (meta && event.key.toLowerCase() === 'v') {
        pasteClipboard();
        return;
      }
      if (meta && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        if (selectedId) duplicatePart(selectedId);
        return;
      }
      if (meta) return;

      switch (event.key) {
        case 'Delete':
        case 'Backspace':
          if (selectedId) removePart(selectedId);
          break;
        case 'Escape':
          setSelectedId(null);
          setMeasuring(false);
          break;
        case 'f':
          setFrameToken((token) => token + 1);
          break;
        case 'g':
          setShowGrid((value) => !value);
          break;
        case 'x':
          setXray((value) => !value);
          break;
        case 'w':
          setWireframe((value) => !value);
          break;
        case 'a':
          setMode((current) => (current === 'assembled' ? 'scattered' : 'assembled'));
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [copySelected, pasteClipboard, duplicatePart, removePart, selectedId]);

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

      <div className={`${PANEL} flex flex-wrap items-center gap-x-2 gap-y-1 px-2 py-1.5`}>
        <div className="flex items-center gap-2 pr-1">
          <Boxes className="h-5 w-5 text-emerald-600" />
          <input
            value={project.name}
            onChange={(event) =>
              patchProject((current) => ({ ...current, name: event.target.value }))
            }
            className="w-40 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm font-bold text-slate-900 outline-none hover:border-slate-300 focus:border-emerald-500"
            aria-label="Project name"
          />
        </div>

        <MenuBar>
          <Menu label="Project">
            <MenuItem onClick={createProjectFolder} icon={FolderPlus}>
              New project
            </MenuItem>
            <MenuItem
              onClick={() => fileInputRef.current?.click()}
              icon={Upload}
              shortcut="drop"
              hint="Or drag STL files onto the table"
            >
              Import STL…
            </MenuItem>
            <MenuSeparator />
            <MenuLabel>Open</MenuLabel>
            <MenuScroll>
              {projectList.length === 0 && (
                <div className="px-3 py-1.5 text-[0.7rem] text-slate-500">
                  Nothing saved yet.
                </div>
              )}
              {projectList.map((entry) => (
                <MenuCheckItem
                  key={entry.id}
                  checked={entry.id === project.id}
                  onClick={() => void openProject(entry.id)}
                >
                  {entry.name} · {entry.parts}
                </MenuCheckItem>
              ))}
            </MenuScroll>
            <MenuSeparator />
            <MenuItem
              tone="danger"
              icon={Trash2}
              onClick={() => void deleteProjectFolder(project.id)}
              hint="Deletes this project and its meshes"
            >
              Delete this project
            </MenuItem>
          </Menu>

          <Menu label="Add">
            <MenuLabel>Stock presets</MenuLabel>
            {HARDWARE_PRESETS.map((preset) => (
              <MenuItem key={preset.name} onClick={() => addHardware(preset.spec)} icon={Cylinder}>
                {preset.name}
              </MenuItem>
            ))}
            <MenuSeparator />
            <MenuLabel>Blank stock</MenuLabel>
            {(['pipe', 'rod', 'bolt', 'screw'] as HardwareKind[]).map((kind) => (
              <MenuItem key={kind} onClick={() => addHardware(defaultSpec(kind))}>
                {HARDWARE_LABELS[kind]}
              </MenuItem>
            ))}
            <MenuSeparator />
            <MenuLabel>Threaded bolt</MenuLabel>
            <MenuScroll>
              {THREAD_STANDARDS.map((thread) => (
                <MenuItem
                  key={thread.id}
                  onClick={() =>
                    addHardware({
                      kind: 'bolt',
                      length: 60,
                      diameter: thread.majorDiameter,
                      threadPitch: thread.pitch,
                      threaded: true,
                      threadStandardId: thread.id,
                      headDiameter: thread.majorDiameter * 1.6,
                      headHeight: thread.majorDiameter * 0.65,
                    })
                  }
                  hint={`⌀${thread.majorDiameter} mm · ${thread.pitch} mm pitch`}
                >
                  {thread.name}
                </MenuItem>
              ))}
            </MenuScroll>
          </Menu>

          <Menu label="Edit">
            <MenuItem
              onClick={() => selectedId && duplicatePart(selectedId)}
              disabled={!selectedId}
              shortcut="⌘D"
            >
              Duplicate as variant
            </MenuItem>
            <MenuItem onClick={copySelected} disabled={!selectedId} shortcut="⌘C">
              Copy
            </MenuItem>
            <MenuItem onClick={pasteClipboard} disabled={!clipboard} shortcut="⌘V">
              Paste
            </MenuItem>
            <MenuItem
              tone="danger"
              onClick={() => selectedId && removePart(selectedId)}
              disabled={!selectedId}
              shortcut="⌫"
            >
              Delete part
            </MenuItem>
            <MenuSeparator />
            <MenuLabel>Repair</MenuLabel>
            <MenuItem
              onClick={fixEveryPart}
              disabled={Boolean(busy) || project.parts.length === 0}
              icon={Sparkles}
              tone="primary"
              hint="Auto fix over every loaded part"
            >
              Fix all parts
            </MenuItem>
            <MenuSeparator />
            <MenuLabel>Weld the build</MenuLabel>
            <MenuItem
              onClick={() =>
                weldAssembly({ resolution: 200, sealMm: 0.8, bore: null })
              }
              disabled={Boolean(busy) || assemblyTotals.parts === 0}
              icon={Combine}
              tone="primary"
              hint="Fuses every fitted part into one watertight solid"
            >
              Weld fitted parts into one solid
            </MenuItem>
            <MenuItem
              onClick={() => setShowWeld(true)}
              disabled={Boolean(busy) || assemblyTotals.parts === 0}
              icon={Combine}
              hint="Same, with a pipe bore straight through"
            >
              Weld around a bore…
            </MenuItem>
            <MenuSeparator />
            <MenuLabel>Cut the selected part</MenuLabel>
            <MenuItem
              onClick={() => {
                const box = selectedBounds();
                if (box) {
                  const index = { x: 0, y: 1, z: 2 }[sliceSpec.axis];
                  setSliceSpec((current) => ({ ...current, position: box.center[index] }));
                }
                setShowSlice(true);
              }}
              disabled={!selectedId || Boolean(busy)}
              icon={Scissors}
              hint="Keeps the original triangles — nothing is resampled"
            >
              Slice through…
            </MenuItem>
            <MenuItem
              onClick={() => {
                const box = selectedBounds();
                if (box) {
                  const index = { x: 0, y: 1, z: 2 }[boreSpec.axis];
                  const others = [0, 1, 2].filter((i) => i !== index);
                  setBoreSpec((current) => ({
                    ...current,
                    cu: box.center[others[0]],
                    cv: box.center[others[1]],
                  }));
                }
                setShowBore(true);
              }}
              disabled={!selectedId || Boolean(busy)}
              icon={CircleDot}
              hint="Perfectly round hole, rest of the part untouched"
            >
              Bore a pipe hole…
            </MenuItem>
            <MenuItem
              onClick={() => selectedId && runOuterHull(selectedId)}
              disabled={!selectedId || Boolean(busy)}
              hint="Deletes walls sealed inside; opens the shell where they met it"
            >
              Strip buried geometry
            </MenuItem>
            <MenuSeparator />
            <MenuLabel>Not built yet</MenuLabel>
            <MenuItem disabled hint="Needs multi-select first">
              Group / ungroup
            </MenuItem>
          </Menu>

          <Menu label="View">
            <MenuItem onClick={() => setFrameToken((t) => t + 1)} icon={Maximize} shortcut="F">
              Fit to view
            </MenuItem>
            <MenuSeparator />
            <MenuCheckItem checked={showGrid} onClick={() => setShowGrid((v) => !v)} shortcut="G">
              Table grid
            </MenuCheckItem>
            <MenuCheckItem checked={wireframe} onClick={() => setWireframe((v) => !v)} shortcut="W">
              Wireframe
            </MenuCheckItem>
            <MenuCheckItem checked={xray} onClick={() => setXray((v) => !v)} shortcut="X">
              X-ray isolate
            </MenuCheckItem>
            <MenuCheckItem checked={showCallouts} onClick={() => setShowCallouts((v) => !v)}>
              Mount-point callouts
            </MenuCheckItem>
            <MenuCheckItem checked={measuring} onClick={() => setMeasuring((v) => !v)}>
              Ruler
            </MenuCheckItem>
            <MenuSeparator />
            <MenuLabel>Panels</MenuLabel>
            <MenuCheckItem checked={showGallery} onClick={() => setShowGallery((v) => !v)}>
              Parts gallery
            </MenuCheckItem>
            <MenuCheckItem checked={showInspector} onClick={() => setShowInspector((v) => !v)}>
              Inspector
            </MenuCheckItem>
            <MenuCheckItem checked={showSteel} onClick={() => setShowSteel((v) => !v)}>
              Steel take-off
            </MenuCheckItem>
            <MenuSeparator />
            <MenuLabel>Units</MenuLabel>
            <MenuCheckItem checked={unit === 'mm'} onClick={() => setUnit('mm')}>
              Millimetres
            </MenuCheckItem>
            <MenuCheckItem checked={unit === 'in'} onClick={() => setUnit('in')}>
              Inches
            </MenuCheckItem>
            <MenuSeparator />
            <MenuCheckItem checked={zUp} onClick={() => setZUp((v) => !v)}>
              Rotate Z-up on import
            </MenuCheckItem>
          </Menu>

          <Menu label="Export">
            <MenuItem
              onClick={mergeAndClean}
              disabled={Boolean(busy)}
              tone="primary"
              icon={Sparkles}
              hint="One repaired STL of the whole build"
            >
              Merge &amp; clean assembly
            </MenuItem>
            <MenuItem onClick={exportCombined} icon={Download} hint="Fitted parts, as they are">
              Combined STL
            </MenuItem>
            <MenuItem
              onClick={exportSplitZip}
              disabled={Boolean(busy)}
              icon={FileDown}
              hint="Every part on its own bed"
            >
              Split print-bed zip
            </MenuItem>
            <MenuSeparator />
            <MenuItem onClick={exportMeasurementsCsv} icon={Save}>
              Measurements CSV
            </MenuItem>
            <MenuItem onClick={exportCutListCsv} disabled={cutItems.length === 0} icon={Save}>
              Cut list CSV
            </MenuItem>
            <MenuItem onClick={exportSketchSvg} icon={Save} hint="True 1:1 scale">
              Sketch SVG
            </MenuItem>
          </Menu>
        </MenuBar>

        <div className="mx-1 h-5 w-px bg-slate-300" />

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

        {workspace === 'bench' && (
          <div className="flex overflow-hidden rounded border border-slate-300">
            {(['assembled', 'scattered'] as Mode[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setMode(option)}
                title="Toggle with A"
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
        )}

        <div className="ml-auto flex items-center gap-3 pr-1 font-mono text-[0.65rem] text-slate-500">
          <span>
            <span className={LABEL}>parts </span>
            {formatCount(project.parts.length)}
          </span>
          <span>
            <span className={LABEL}>fitted </span>
            {assemblyTotals.parts}/{project.slots.length}
          </span>
          <span>
            <span className={LABEL}>mass </span>
            {formatMass(assemblyTotals.mass)}
          </span>
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
      <div
        className="grid min-h-0 flex-1 gap-2"
        style={{
          gridTemplateColumns: [
            showGallery ? 'minmax(220px, 300px)' : null,
            'minmax(0, 1fr)',
            showInspector ? 'minmax(260px, 330px)' : null,
          ]
            .filter(Boolean)
            .join(' '),
        }}
      >
        {showGallery && (
        <div className="min-h-0">
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
        )}

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

          <div className="absolute left-2 top-2 flex gap-1">
            <button
              type="button"
              onClick={() => setShowGallery((v) => !v)}
              title={showGallery ? 'Hide parts gallery' : 'Show parts gallery'}
              className="rounded border border-slate-300 bg-white/90 p-1.5 text-slate-500 transition-colors hover:text-slate-900"
            >
              <PanelLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setShowInspector((v) => !v)}
              title={showInspector ? 'Hide inspector' : 'Show inspector'}
              className="rounded border border-slate-300 bg-white/90 p-1.5 text-slate-500 transition-colors hover:text-slate-900"
            >
              <PanelRight className="h-3.5 w-3.5" />
            </button>
          </div>

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

        {showInspector && (
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
            onMakeSolid={runMakeSolid}
            solidReport={solidReport}
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
        )}
      </div>
      )}

      {showSlice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className={`${PANEL} w-full max-w-md p-4`}>
            <h2 className="mb-1 text-sm font-bold text-slate-900">Slice through the part</h2>
            <p className="mb-3 text-[0.7rem] text-slate-500">
              Every triangle the plane misses is kept exactly as it is — only the ones it crosses
              are split, and the cut face is closed flat. Nothing is resampled.
            </p>

            <div className="mb-3 grid grid-cols-2 gap-2">
              <label className="block">
                <span className={`${LABEL} mb-1 block`}>Axis</span>
                <select
                  className={FIELD}
                  value={sliceSpec.axis}
                  onChange={(event) => {
                    const axis = event.target.value as 'x' | 'y' | 'z';
                    const box = selectedBounds();
                    const index = { x: 0, y: 1, z: 2 }[axis];
                    setSliceSpec((current) => ({
                      ...current,
                      axis,
                      position: box ? box.center[index] : current.position,
                    }));
                  }}
                >
                  <option value="x">X</option>
                  <option value="y">Y</option>
                  <option value="z">Z</option>
                </select>
              </label>
              <label className="block">
                <span className={`${LABEL} mb-1 block`}>Position (mm)</span>
                <input
                  type="number"
                  className={FIELD}
                  value={Number(sliceSpec.position.toFixed(3))}
                  onChange={(event) =>
                    setSliceSpec((current) => ({ ...current, position: Number(event.target.value) }))
                  }
                />
              </label>
            </div>

            <label className="mb-3 flex items-center gap-2 text-[0.7rem] text-slate-700">
              <input
                type="checkbox"
                checked={sliceSpec.keepBoth}
                onChange={(event) =>
                  setSliceSpec((current) => ({ ...current, keepBoth: event.target.checked }))
                }
                className="accent-emerald-600"
              />
              Keep both halves as separate parts
            </label>

            <div className="flex justify-end gap-2">
              <button type="button" className={ACTION_GHOST} onClick={() => setShowSlice(false)}>
                Cancel
              </button>
              <button
                type="button"
                className={ACTION_PRIMARY}
                onClick={() => {
                  setShowSlice(false);
                  runSlice(sliceSpec);
                }}
              >
                Cut
              </button>
            </div>
          </div>
        </div>
      )}

      {showBore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className={`${PANEL} w-full max-w-md p-4`}>
            <h2 className="mb-1 text-sm font-bold text-slate-900">Bore a hole for a pipe</h2>
            <p className="mb-3 text-[0.7rem] text-slate-500">
              The hole is cut against the original triangles and its wall is generated
              mathematically, so it comes out perfectly round however coarse the part is. Everything
              the pipe does not touch is left alone.
            </p>

            <div className="mb-3 grid grid-cols-2 gap-2">
              <label className="block">
                <span className={`${LABEL} mb-1 block`}>Diameter (mm)</span>
                <input
                  type="number"
                  step="0.1"
                  className={FIELD}
                  value={boreSpec.diameter}
                  onChange={(event) =>
                    setBoreSpec((current) => ({ ...current, diameter: Number(event.target.value) }))
                  }
                />
              </label>
              <label className="block">
                <span className={`${LABEL} mb-1 block`}>Along axis</span>
                <select
                  className={FIELD}
                  value={boreSpec.axis}
                  onChange={(event) => {
                    const axis = event.target.value as 'x' | 'y' | 'z';
                    const box = selectedBounds();
                    const index = { x: 0, y: 1, z: 2 }[axis];
                    const others = [0, 1, 2].filter((i) => i !== index);
                    setBoreSpec((current) => ({
                      ...current,
                      axis,
                      cu: box ? box.center[others[0]] : current.cu,
                      cv: box ? box.center[others[1]] : current.cv,
                    }));
                  }}
                >
                  <option value="x">X</option>
                  <option value="y">Y</option>
                  <option value="z">Z</option>
                </select>
              </label>
            </div>

            <span className={`${LABEL} mb-1 block`}>
              Centre on the other two axes (mm)
            </span>
            <div className="mb-3 grid grid-cols-2 gap-2">
              <input
                type="number"
                step="0.1"
                className={FIELD}
                value={Number(boreSpec.cu.toFixed(3))}
                onChange={(event) =>
                  setBoreSpec((current) => ({ ...current, cu: Number(event.target.value) }))
                }
              />
              <input
                type="number"
                step="0.1"
                className={FIELD}
                value={Number(boreSpec.cv.toFixed(3))}
                onChange={(event) =>
                  setBoreSpec((current) => ({ ...current, cv: Number(event.target.value) }))
                }
              />
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" className={ACTION_GHOST} onClick={() => setShowBore(false)}>
                Cancel
              </button>
              <button
                type="button"
                className={ACTION_PRIMARY}
                onClick={() => {
                  setShowBore(false);
                  runBore(boreSpec);
                }}
              >
                Bore
              </button>
            </div>
          </div>
        </div>
      )}

      {showWeld && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className={`${PANEL} w-full max-w-md p-4`}>
            <h2 className="mb-1 text-sm font-bold text-slate-900">Weld the build around a bore</h2>
            <p className="mb-3 text-[0.7rem] text-slate-500">
              Every fitted part is fused into one watertight solid and the bore is cut straight
              through it. The parts do not need to be valid meshes — they are rebuilt, not merged.
            </p>

            <div className="mb-3 grid grid-cols-2 gap-2">
              <label className="block">
                <span className={`${LABEL} mb-1 block`}>Bore ⌀ (mm)</span>
                <input
                  type="number"
                  className={FIELD}
                  value={weldBore.diameter}
                  onChange={(event) =>
                    setWeldBore((current) => ({
                      ...current,
                      diameter: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label className="block">
                <span className={`${LABEL} mb-1 block`}>Along axis</span>
                <select
                  className={FIELD}
                  value={weldBore.axis}
                  onChange={(event) =>
                    setWeldBore((current) => ({
                      ...current,
                      axis: event.target.value as 'x' | 'y' | 'z',
                    }))
                  }
                >
                  <option value="x">X — along the barrel</option>
                  <option value="y">Y — vertical</option>
                  <option value="z">Z — across</option>
                </select>
              </label>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                className={ACTION_GHOST}
                onClick={() => setShowWeld(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={ACTION_PRIMARY}
                onClick={() => {
                  setShowWeld(false);
                  // Bore through the centre of everything currently fitted.
                  const index = { x: 0, y: 1, z: 2 }[weldBore.axis];
                  const others = [0, 1, 2].filter((i) => i !== index);
                  const box = assemblyBounds();
                  weldAssembly({
                    resolution: 200,
                    sealMm: 0.8,
                    bore: {
                      axis: weldBore.axis,
                      diameter: weldBore.diameter,
                      center: [box.center[others[0]], box.center[others[1]]],
                    },
                  });
                }}
              >
                Weld &amp; bore
              </button>
            </div>
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
