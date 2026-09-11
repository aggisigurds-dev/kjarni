'use client';

/**
 * 3dwork — the STL bench.
 *
 * Holds the project state and wires the four pieces together: the gallery of
 * parts on the left, the table in the middle, the inspector on the right, and
 * the steel take-off underneath. The bench autosaves locally; Save on Supabase
 * is what opens the same build on a phone or another computer.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Boxes,
  Cylinder,
  Download,
  Eye,
  EyeOff,
  FileDown,
  FolderPlus,
  Group,
  Loader2,
  Magnet,
  ArrowDownToLine,
  Maximize,
  PanelLeft,
  PanelRight,
  CircleDot,
  Combine,
  Save,
  Scissors,
  Undo2,
  Redo2,
  Ungroup,
  Layers,
  Spline,
  Sparkles,
  Trash2,
  Upload,
  Paintbrush,
  ScanSearch,
  Cloud,
  Github,
  HardDrive,
} from 'lucide-react';
import {
  alignPaintedVertices,
  autoFix,
  computeBounds,
  diagnose,
  fillPaintedHoles,
  fixMisalignment,
  inspect,
  recenter,
  simplify,
  toSoup,
  verticesInRadius,
  weld,
  zUpToYUp,
  type Diagnosis,
  type FixReport,
  type MisalignReport,
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
import { exportColored3mf, is3mf, parse3mf } from '@/lib/3dwork/threemf';
import { lookFor } from '@/lib/3dwork/finish';
import {
  applyPrintTexture,
  TEXTURE_LABELS,
  textureForFinish,
  type PrintTextureSpec,
} from '@/lib/3dwork/texture';
import { DEFAULT_BEND, bendLabel, bendMesh, bendReport, type BendSpec } from '@/lib/3dwork/bend';
import {
  DEFAULT_SHELL,
  SHELL_LABELS,
  shellSurface,
  type ShellDirection,
  type ShellOptions,
} from '@/lib/3dwork/shell';
import {
  assembledPlacement,
  assemblyOn,
  benchPlacement,
  createProject,
  guessKit,
  guessSlot,
  newProjectId,
  nextColor,
  scatterPlacement,
  freePlacement,
  setAssembly,
  type Part,
  type PartSize,
  type Placement,
  type Project,
  type Transform,
  flattenGroupMembers,
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
import { makeSolid, subtractMesh, unionMesh, type CylinderCut, type SolidifyReport } from '@/lib/3dwork/solidify';
import { fitTogether } from '@/lib/3dwork/fit';
import { settleOnFloor } from '@/lib/3dwork/settle';
import {
  githubConnect,
  githubDisconnect,
  githubListProjects,
  githubLoadProject,
  githubSaveProject,
  githubStatus,
  type GithubStatus,
} from '@/lib/3dwork/github-cloud';
import {
  cloudProjectStamp,
  deleteFromCloud,
  listCloudDeletedIds,
  listCloudProjects,
  loadCloudGeometry,
  loadFromCloud,
  saveToCloud,
} from '@/lib/3dwork/supabase-sync';
import { activeVersionIds } from '@/lib/3dwork/github-sync';
import { runOnePiece } from '@/lib/3dwork/one-piece-client';
import type { OnePieceBody, OnePiecePipe, OnePieceReport } from '@/lib/3dwork/one-piece';
import {
  cloudIsNewer,
  mergeGeometries,
  mergeProjectLists,
  mergeProjects,
  sinceLabel,
  type ProjectListEntry,
} from '@/lib/3dwork/project-sync';
import { slicePlane } from '@/lib/3dwork/slice';
import { boreCylinder } from '@/lib/3dwork/bore';
import { boxSoup, sphereSoup, cylinderSoup, coneSoup } from '@/lib/3dwork/primitives';
import { outerHull } from '@/lib/3dwork/outerhull';
import { createZip, safeFileName } from '@/lib/3dwork/zip';
import { emptySketch, toSvg, type Sketch } from '@/lib/3dwork/sketch';
import { silhouette, type Outline2D, type ViewPlane } from '@/lib/3dwork/silhouette';
import { formatCount, formatMass, type Unit } from '@/lib/3dwork/format';
import {
  DEFAULT_MAGNET_MM,
  DEFAULT_MOVE_STEP,
  DEFAULT_ROTATE_STEP,
  aabbOverlap,
  orientedAabb,
} from '@/lib/3dwork/snap';
import { applyMatrix, bakeTransform, scaleSoup, transformMatrix } from './bake';
import { Gallery } from './gallery';
import { Inspector, type InspectorTab } from './inspector';
import { SketchBoard } from './sketch-board';
import { SteelPanel, makeCutItem } from './steel';
import { renderThumbnail } from './thumbnail';
import { Viewport, type ViewportCallout, type ViewportPart } from './viewport';
import { RevivePanel } from './revive';
import { ManipBar, type MoveAxis, type RotateAxis } from './manip-bar';
import { PaintBar } from './paint-bar';
import { Menu, MenuBar, MenuCheckItem, MenuItem, MenuLabel, MenuScroll, MenuSeparator } from './menu';
import { ACTION_GHOST, ACTION_PRIMARY, FIELD, LABEL, PANEL, TOOL_BTN, TOOL_BTN_PRIMARY } from './ui';
import { useIsMobile } from '@/hooks/use-mobile';
import { DriveBrowser } from './drive-browser';
import { KitBoard } from './kit-board';
import { CloudPicker } from './cloud-picker';
import { OnePieceDialog, type OnePieceSettings } from './one-piece-dialog';

type Mode = 'assembled' | 'scattered' | 'free';
type Workspace = 'kits' | 'bench' | 'sketch';

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

/** Whether several meshes together span the same box as one mesh, to half a millimetre. */
function sameBounds(pieces: Float32Array[], whole: Float32Array): boolean {
  const target = computeBounds(whole);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const soup of pieces) {
    const bounds = computeBounds(soup);
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], bounds.min[axis]);
      max[axis] = Math.max(max[axis], bounds.max[axis]);
    }
  }
  return [0, 1, 2].every(
    (axis) =>
      Math.abs(min[axis] - target.min[axis]) < 0.5 && Math.abs(max[axis] - target.max[axis]) < 0.5
  );
}

/** One point on the undo timeline: the project, and the meshes it referred to. */
interface HistoryStep {
  project: Project;
  geometries: Map<string, Float32Array>;
}

export function Workbench({
  initialWorkspace = 'kits',
  pendingImport,
  pendingCloudId,
  onPendingConsumed,
}: {
  initialWorkspace?: Workspace;
  pendingImport?: { files: File[]; tags: Record<string, { slotId: string; kitId: string }> } | null;
  pendingCloudId?: string | null;
  onPendingConsumed?: () => void;
} = {}) {
  const [project, setProject] = useState<Project>(() => createProject());
  const [geometries, setGeometries] = useState<Map<string, Float32Array>>(() => new Map());
  const [layoutChoice, setMode] = useState<Mode>('scattered');
  // With the blaster slots off there is one layout — every part where it was
  // put — and everything below that branches on the layout treats it as
  // 'free': each part at its own table position, mounts and offsets untouched.
  const assembly = assemblyOn(project);
  const mode: Mode = assembly ? layoutChoice : 'free';
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<InspectorTab>('modify');
  const [wireframe, setWireframe] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [measuring, setMeasuring] = useState(false);
  const [measurePoints, setMeasurePoints] = useState<[number, number, number][]>([]);
  const [painting, setPainting] = useState(false);
  const [paintRadiusMm, setPaintRadiusMm] = useState(2);
  const [painted, setPainted] = useState<Set<number>>(() => new Set());
  const [zUp, setZUp] = useState(true);
  const [unit, setUnit] = useState<Unit>('mm');
  const [cutItems, setCutItems] = useState<CutItem[]>([]);
  const [showSteel, setShowSteel] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [fixReport, setFixReport] = useState<FixReport | null>(null);
  const [simplifyReport, setSimplifyReport] = useState<SimplifyReport | null>(null);
  const [misalignReport, setMisalignReport] = useState<MisalignReport | null>(null);
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [solidReport, setSolidReport] = useState<SolidifyReport | null>(null);
  const [showSlice, setShowSlice] = useState(false);
  const [showBore, setShowBore] = useState(false);
  const [showBend, setShowBend] = useState(false);
  const [showRevive, setShowRevive] = useState(false);
  const [showSubtract, setShowSubtract] = useState(false);
  /**
   * Parts picked out alongside the selected one. The selected part is always
   * part of the selection; this holds only the extras, so nothing that reads
   * `selectedId` has to change.
   */
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [showShell, setShowShell] = useState(false);
  const [shellSpec, setShellSpec] = useState<ShellOptions>(DEFAULT_SHELL);
  const [bendSpec, setBendSpec] = useState<BendSpec>(DEFAULT_BEND);
  const [sliceSpec, setSliceSpec] = useState({ axis: 'x' as 'x' | 'y' | 'z', position: 0, keepBoth: true });
  const [boreSpec, setBoreSpec] = useState({ axis: 'x' as 'x' | 'y' | 'z', diameter: 28, cu: 0, cv: 0 });
  const [showOnePiece, setShowOnePiece] = useState(false);
  /** What the one-piece worker is doing; null while it is not running. */
  const [onePieceProgress, setOnePieceProgress] = useState<string | null>(null);
  const [onePieceReport, setOnePieceReport] = useState<OnePieceReport | null>(null);
  const [onePieceError, setOnePieceError] = useState<string | null>(null);
  /** The part the last run made, so the dialog can download it. */
  const [onePieceResultId, setOnePieceResultId] = useState<string | null>(null);
  const [frameToken, setFrameToken] = useState(0);
  const [dragging, setDragging] = useState(false);
  /** The part currently in move mode (double-tapped), and how a grab acts. */
  const [moveModeId, setMoveModeId] = useState<string | null>(null);
  const [manip, setManip] = useState<'move' | 'rotate'>('move');
  const [rotateAxis, setRotateAxis] = useState<RotateAxis>('y');
  const [moveAxis, setMoveAxis] = useState<MoveAxis>('xyz');
  const [moveStep, setMoveStep] = useState(DEFAULT_MOVE_STEP);
  const [rotateStep, setRotateStep] = useState(DEFAULT_ROTATE_STEP);
  const [snapHint, setSnapHint] = useState<string | null>(null);
  const [multiSelect, setMultiSelect] = useState(false);
  const [subtractSpec, setSubtractSpec] = useState({
    resolution: 220,
    clearanceMm: 0.3,
    removeTool: false,
  });
  const isMobile = useIsMobile();

  const [projectList, setProjectList] = useState<ProjectListEntry[]>([]);
  const [showGallery, setShowGallery] = useState(true);
  const [showInspector, setShowInspector] = useState(true);
  /** Copied parts (⌘C) — every marked part, with the mesh you could see at the time. */
  const [clipboard, setClipboard] = useState<{ soup: Float32Array; part: Part }[]>([]);

  const [workspace, setWorkspace] = useState<Workspace>(initialWorkspace);
  const [xray, setXray] = useState(false);
  /** When set, the table shows only this part. Uncheck View → Focus to restore the rest. */
  const [focusId, setFocusId] = useState<string | null>(null);
  const [showCallouts, setShowCallouts] = useState(true);
  const [sketch, setSketch] = useState<Sketch>(() => emptySketch());
  const [sketchPlane, setSketchPlane] = useState<ViewPlane>('xy');
  const [outline, setOutline] = useState<{ name: string; data: Outline2D } | null>(null);
  const [outlineBusy, setOutlineBusy] = useState(false);
  const [showGithub, setShowGithub] = useState(false);
  const [showCloud, setShowCloud] = useState(false);
  const [showDrive, setShowDrive] = useState(false);
  const [githubToken, setGithubToken] = useState('');
  const [githubOwner, setGithubOwner] = useState('');
  const [github, setGithub] = useState<GithubStatus>({
    connected: false,
    login: null,
    repo: null,
    mode: null,
  });
  const [githubNote, setGithubNote] = useState<string>('Not connected');
  const [cloudNote, setCloudNote] = useState<string>('Saves to Supabase as you work');
  // Every project with parts is kept on Supabase, so it opens on the next
  // computer. The flag only drives the badge now; there is no opt-in.
  const [cloudAttached, setCloudAttached] = useState(true);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const loadedRef = useRef(false);
  // Flips once this tab's saved project is back in state. A part opened from
  // the kit board waits for it, so the restore cannot land on top of the import.
  const [restored, setRestored] = useState(false);
  const pendingImportRef = useRef(pendingImport);
  pendingImportRef.current = pendingImport;
  // Always points at the latest project, so a flush save (tab hidden/closed or
  // unmount) writes the current state without waiting on the debounce timer.
  const projectRef = useRef(project);
  projectRef.current = project;
  const githubRef = useRef(github);
  githubRef.current = github;
  const githubBusyRef = useRef(false);
  const cloudAttachedRef = useRef(true);
  const cloudBusyRef = useRef(false);
  const attachCloud = useCallback((note?: string) => {
    cloudAttachedRef.current = true;
    setCloudAttached(true);
    if (note) setCloudNote(note);
  }, []);
  // Cloud bookkeeping. `dirty` = edited here since the last push. `lastCloudSync`
  // = the Supabase stamp this browser last pushed or pulled, so a newer stamp
  // means another computer saved. `cleanState` = the exact objects that came
  // from disk or Supabase: seeing them in the autosync effect means "nothing
  // changed yet", not "push this".
  const cloudDirtyRef = useRef(false);
  const lastCloudSyncRef = useRef<{ id: string; at: number }>({ id: '', at: 0 });
  const cleanStateRef = useRef<{
    project: Project | null;
    geometries: Map<string, Float32Array> | null;
  }>({ project: null, geometries: null });
  const lastCloudCheckRef = useRef(0);
  const projectListRef = useRef<ProjectListEntry[]>([]);
  // Set once createProjectFolder exists; lets the list refresh move off a
  // project that was deleted on another computer.
  const startFreshProjectRef = useRef<(reason?: string) => void>(() => {});

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.innerWidth >= 768) {
      setShowGallery(true);
      setShowInspector(true);
    }
  }, []);

  const refreshProjectList = useCallback(async () => {
    let saved = await listProjects();
    let cloud: Awaited<ReturnType<typeof listCloudProjects>> = [];
    try {
      cloud = await listCloudProjects();
      // Deleted on another computer → drop the copy here too. The one being
      // edited right now is kept: its next push brings it back on purpose.
      const gone = await listCloudDeletedIds(saved.map((entry) => entry.id));
      const removable = gone.filter(
        (id) => !(id === projectRef.current.id && cloudDirtyRef.current)
      );
      for (const id of removable) {
        const target = saved.find((entry) => entry.id === id);
        for (const part of target?.parts ?? []) {
          for (const version of part.versions ?? []) void deleteGeometry(version.id);
        }
        await deleteProject(id);
      }
      if (removable.length > 0) {
        saved = saved.filter((entry) => !removable.includes(entry.id));
        if (removable.includes(projectRef.current.id)) {
          startFreshProjectRef.current(
            `${projectRef.current.name} was deleted on another computer.`
          );
        }
      }
    } catch {
      /* cloud list is optional — local still shows */
    }
    const local = saved.map((entry) => ({
      id: entry.id,
      name: entry.name,
      parts: entry.parts.length,
      updatedAt: entry.updatedAt ?? 0,
    }));
    const merged = mergeProjectLists(local, cloud);
    if (githubRef.current.connected) {
      try {
        const remote = await githubListProjects();
        for (const entry of remote) {
          if (!merged.some((row) => row.id === entry.id)) {
            merged.push({ ...entry, cloud: false, local: false });
          }
        }
      } catch {
        /* keep what we have */
      }
    }
    projectListRef.current = merged;
    setProjectList(merged);
  }, []);

  const persistLocal = useCallback(
    async (next: Project, meshes: Map<string, Float32Array>, stamp?: number) => {
      await saveProject(next, stamp);
      for (const [id, soup] of meshes) await saveGeometry(id, soup);
    },
    []
  );

  /** Show a Supabase copy as-is: it is the newest state, nothing to push back. */
  const applyCloudProject = useCallback(
    async (cloud: { project: Project; geometries: Map<string, Float32Array> }, note: string) => {
      cleanStateRef.current = { project: cloud.project, geometries: cloud.geometries };
      cloudDirtyRef.current = false;
      lastCloudSyncRef.current = { id: cloud.project.id, at: cloud.project.updatedAt || Date.now() };
      setProject(cloud.project);
      setGeometries(cloud.geometries);
      setSelectedId(null);
      setMarked(new Set());
      setFrameToken((token) => token + 1);
      await persistLocal(cloud.project, cloud.geometries, cloud.project.updatedAt || undefined);
      attachCloud(note);
    },
    [persistLocal, attachCloud]
  );

  const pushCloud = useCallback(
    async (reason: 'auto' | 'manual' = 'auto') => {
      if (!loadedRef.current || cloudBusyRef.current) return;
      if (reason === 'auto' && !cloudDirtyRef.current) return;
      if (projectRef.current.parts.length === 0) {
        if (reason === 'manual') toast.error('Add a part before saving to Supabase.');
        return;
      }
      // Never push a part list whose meshes this tab does not hold yet — that
      // is how a build once reached the cloud with its parts and no geometry.
      // Only the meshes on the table count: a group's member meshes may live on
      // the computer that imported it, and must not hold every push hostage —
      // nor may a mesh already confirmed missing everywhere.
      const unloaded = () =>
        projectRef.current.parts.filter(
          (part) =>
            !renderedGeometriesRef.current.has(part.activeVersionId) &&
            !missingVersionsRef.current.has(part.activeVersionId)
        ).length;
      if (unloaded() > 0) {
        if (reason === 'manual') {
          const count = unloaded();
          toast.error(`Still loading ${count} mesh${count === 1 ? '' : 'es'} — try again in a moment.`);
        }
        return;
      }
      cloudBusyRef.current = true;
      setCloudNote('Saving to Supabase…');
      try {
        // Another computer may have pushed this project since this browser last
        // synced it. Fold its parts in first, so neither side's upload is lost;
        // a part edited here keeps this computer's version.
        const id = projectRef.current.id;
        const known =
          lastCloudSyncRef.current.id === id ? lastCloudSyncRef.current.at : projectRef.current.updatedAt;
        const stamp = await cloudProjectStamp(id).catch(() => null);
        if (stamp !== null && cloudIsNewer(known, stamp)) {
          const cloud = await loadFromCloud(id);
          const merged = mergeProjects(projectRef.current, cloud.project);
          if (merged.addedFromCloud.length > 0) {
            const meshes = mergeGeometries(renderedGeometriesRef.current, cloud.geometries);
            cleanStateRef.current = { project: merged.project, geometries: meshes };
            projectRef.current = merged.project;
            geometriesRef.current = meshes;
            renderedGeometriesRef.current = meshes;
            setProject(merged.project);
            setGeometries(meshes);
            setFrameToken((token) => token + 1);
            const count = merged.addedFromCloud.length;
            toast.success(`${count} part${count === 1 ? '' : 's'} from another computer added to ${merged.project.name}.`);
          }
        }
        const pushedProject = projectRef.current;
        const pushedGeometries = renderedGeometriesRef.current;
        if (unloaded() > 0) {
          // A part landed while the stamp was being checked and its mesh is not
          // in this render yet. The push that follows its mesh carries both.
          setCloudNote('Waiting for meshes to load…');
          return;
        }
        const result = await saveToCloud(pushedProject, pushedGeometries);
        lastCloudSyncRef.current = { id: pushedProject.id, at: result.updatedAt };
        // What the cloud holds now is the clean state. Measured against the copy
        // first loaded instead, undoing back to it never pushed — and the cloud
        // kept the edits that had just been undone.
        cleanStateRef.current = { project: pushedProject, geometries: pushedGeometries };
        if (
          projectRef.current === pushedProject &&
          renderedGeometriesRef.current === pushedGeometries
        ) {
          cloudDirtyRef.current = false;
        }
        // Mirror the cloud stamp onto the local copy, so the next start does not
        // mistake this computer's copy for a newer one and push it all over again.
        await saveProject(pushedProject, result.updatedAt);
        attachCloud(
          reason === 'manual'
            ? 'Saved to Supabase — open this on your phone'
            : `Saved to Supabase ${new Date().toLocaleTimeString()}`
        );
        if (reason === 'manual') toast.success('Saved to Supabase. Same build on your phone or another computer.');
        void refreshProjectList();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Supabase save failed';
        setCloudNote(message);
        if (reason === 'manual') toast.error(message);
      } finally {
        cloudBusyRef.current = false;
      }
    },
    [refreshProjectList, attachCloud]
  );

  const pushCloudRef = useRef(pushCloud);
  pushCloudRef.current = pushCloud;

  const openCloudProject = useCallback(
    async (projectId: string) => {
      setBusy('Loading from Supabase…');
      try {
        const cloud = await loadFromCloud(projectId);
        await applyCloudProject(cloud, `Loaded from Supabase · ${cloud.project.name}`);
        setShowCloud(false);
        setWorkspace('bench');
        toast.success(`Opened ${cloud.project.name} from Supabase.`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not open that cloud build.');
      } finally {
        setBusy(null);
      }
    },
    [applyCloudProject]
  );

  const pushGithub = useCallback(async (reason: 'auto' | 'manual' = 'auto') => {
    if (!loadedRef.current || !githubRef.current.connected || githubBusyRef.current) return;
    githubBusyRef.current = true;
    setGithubNote('Saving to GitHub…');
    try {
      const result = await githubSaveProject(projectRef.current, geometriesRef.current);
      projectRef.current = { ...projectRef.current, updatedAt: result.updatedAt };
      setGithubNote(
        reason === 'manual'
          ? `Saved to GitHub · ${githubRef.current.repo}`
          : `GitHub saved ${new Date().toLocaleTimeString()}`
      );
      void refreshProjectList();
    } catch (error) {
      setGithubNote(error instanceof Error ? error.message : 'GitHub save failed');
      if (reason === 'manual') {
        toast.error(error instanceof Error ? error.message : 'GitHub save failed');
      }
    } finally {
      githubBusyRef.current = false;
    }
  }, [refreshProjectList]);

  const pushGithubRef = useRef(pushGithub);
  pushGithubRef.current = pushGithub;

  // Restore: local first, then Supabase (phone / other computer). GitHub is
  // optional leftover — never preferred over the company cloud.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (pendingCloudId) {
        try {
          setBusy('Loading from Supabase…');
          const cloud = await loadFromCloud(pendingCloudId);
          if (cancelled) return;
          await applyCloudProject(cloud, `Loaded from Supabase · ${cloud.project.name}`);
          setWorkspace('bench');
        } catch (error) {
          if (!cancelled) {
            setCloudNote(error instanceof Error ? error.message : 'Supabase unavailable');
            toast.error(error instanceof Error ? error.message : 'Could not open that cloud build.');
          }
        } finally {
          if (!cancelled) setBusy(null);
        }
        loadedRef.current = true;
        setRestored(true);
        void refreshProjectList();
        return;
      }

      const importing = Boolean(pendingImportRef.current?.files.length);
      const saved = await listProjects();
      if (cancelled) return;

      let current: Project;
      if (saved.length === 0) {
        // Nothing to restore: give the blank draft a real id now that we are
        // on the client, so autosave has something stable to write against.
        const draft = { ...projectRef.current, id: newProjectId() };
        const none = new Map<string, Float32Array>();
        cleanStateRef.current = { project: draft, geometries: none };
        setProject(draft);
        setGeometries(none);
        current = draft;
      } else {
        const restored = saved[0];
        const loaded = new Map<string, Float32Array>();
        for (const part of restored.parts) {
          for (const version of part.versions ?? []) {
            const soup = await loadGeometry(version.id);
            if (soup) loaded.set(version.id, soup);
          }
        }
        if (cancelled) return;
        cleanStateRef.current = { project: restored, geometries: loaded };
        setProject(restored);
        setGeometries(loaded);
        setFrameToken((token) => token + 1);
        current = restored;
      }

      loadedRef.current = true;
      setRestored(true);
      void refreshProjectList();

      let usedCloud = false;
      try {
        const remote = await listCloudProjects();
        if (cancelled) return;
        const remoteThis = remote.find((entry) => entry.id === current.id);
        const newest = remote[0];
        // Another computer saved this build more recently → show that copy.
        // A blank bench → open whatever was worked on last, wherever that was.
        // A part being opened from the kit board belongs on this bench, so the
        // newest cloud build is not swapped in underneath it.
        const takeId =
          remoteThis && cloudIsNewer(current.updatedAt, remoteThis.updatedAt)
            ? current.id
            : current.parts.length === 0 && newest && !importing
              ? newest.id
              : null;
        if (takeId) {
          setBusy('Loading from Supabase…');
          const cloud = await loadFromCloud(takeId);
          if (cancelled) return;
          if (projectRef.current !== current) {
            // Edited while the download ran — an import landed, a part moved.
            // Keep that work; the next push folds the cloud's parts in.
            setBusy(null);
          } else {
            await applyCloudProject(cloud, `Loaded from Supabase · ${cloud.project.name}`);
            setBusy(null);
            usedCloud = true;
          }
        } else if (remoteThis) {
          lastCloudSyncRef.current = { id: current.id, at: remoteThis.updatedAt };
          // Edited here after the last push (offline, or the tab was closed
          // inside the debounce) → push it now.
          cloudDirtyRef.current = cloudIsNewer(remoteThis.updatedAt, current.updatedAt);
          attachCloud('Supabase · this build');
          if (cloudDirtyRef.current) void pushCloudRef.current('auto');
        } else if (current.parts.length > 0) {
          // On this computer only so far — push it, so the others get it too.
          cloudDirtyRef.current = true;
          void pushCloudRef.current('auto');
        } else {
          setCloudNote('Saves to Supabase once it has parts');
        }
        void refreshProjectList();
      } catch (error) {
        if (!cancelled) {
          setCloudNote(error instanceof Error ? error.message : 'Supabase unavailable');
          setBusy(null);
        }
      }

      try {
        const status = await githubStatus();
        if (cancelled) return;
        setGithub(status);
        if (!status.connected) {
          setGithubNote('Not connected');
          return;
        }
        setGithubNote(`Connected · ${status.repo}`);
        if (usedCloud || projectRef.current.parts.length > 0) {
          void refreshProjectList();
          return;
        }
        const remote = await githubListProjects();
        if (cancelled) return;
        const newest = remote[0];
        if (newest) {
          setBusy('Loading from GitHub…');
          const cloud = await githubLoadProject(newest.id);
          if (cancelled) return;
          setProject(cloud.project);
          setGeometries(cloud.geometries);
          setFrameToken((token) => token + 1);
          await persistLocal(cloud.project, cloud.geometries);
          setGithubNote(`Loaded from GitHub · ${status.repo}`);
          setBusy(null);
        }
        void refreshProjectList();
      } catch (error) {
        if (!cancelled) {
          setGithubNote(error instanceof Error ? error.message : 'GitHub unavailable');
          setBusy(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshProjectList, persistLocal, applyCloudProject, pendingCloudId, attachCloud]);

  // Autosave, debounced so dragging a slider does not hammer IndexedDB.
  useEffect(() => {
    if (!loadedRef.current) return;
    const timer = setTimeout(() => {
      void saveProject(project).then(() => {
        // A brand-new project shows up in the switcher as soon as it is on
        // disk, not only once Supabase has it.
        if (!projectListRef.current.some((entry) => entry.id === project.id)) {
          void refreshProjectList();
        }
      });
    }, 800);
    return () => clearTimeout(timer);
  }, [project, refreshProjectList]);

  useEffect(() => {
    if (!loadedRef.current) return;
    // The objects that came from disk or Supabase are not an edit.
    if (
      project === cleanStateRef.current.project &&
      geometries === cleanStateRef.current.geometries
    ) {
      return;
    }
    cloudDirtyRef.current = true;
    const timer = setTimeout(() => void pushCloud('auto'), 2500);
    return () => clearTimeout(timer);
  }, [project, geometries, pushCloud]);

  /**
   * Another computer may have saved this build while this tab sat in the
   * background. Coming back to the tab pulls that copy in — unless something
   * was edited here meanwhile, in which case the next push folds both together.
   */
  const pullNewerFromCloud = useCallback(async () => {
    if (!loadedRef.current || cloudBusyRef.current) return;
    const now = Date.now();
    if (now - lastCloudCheckRef.current < 8000) return;
    lastCloudCheckRef.current = now;
    const current = projectRef.current;
    try {
      const stamp = await cloudProjectStamp(current.id);
      void refreshProjectList();
      if (stamp === null) return;
      const known =
        lastCloudSyncRef.current.id === current.id ? lastCloudSyncRef.current.at : current.updatedAt;
      if (!cloudIsNewer(known, stamp)) return;
      if (cloudDirtyRef.current) {
        void pushCloud('auto');
        return;
      }
      if (projectRef.current !== current) return;
      const cloud = await loadFromCloud(current.id);
      if (projectRef.current !== current || cloudDirtyRef.current) return;
      await applyCloudProject(cloud, `Updated from another computer ${new Date().toLocaleTimeString()}`);
      toast.success(`${cloud.project.name}: updated from another computer.`);
    } catch {
      /* offline — the local copy stays */
    }
  }, [pushCloud, applyCloudProject, refreshProjectList]);
  const pullNewerRef = useRef(pullNewerFromCloud);
  pullNewerRef.current = pullNewerFromCloud;

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void pullNewerRef.current();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);

  useEffect(() => {
    if (!loadedRef.current || !github.connected) return;
    const timer = setTimeout(() => void pushGithub('auto'), 2500);
    return () => clearTimeout(timer);
  }, [project, geometries, github.connected, pushGithub]);

  // Belt-and-braces persistence so the bench always comes back exactly as you
  // left it. The debounce above is cancelled on unmount and never fires if you
  // close within its window, so we also:
  //   · flush immediately when the tab is hidden or the page is being closed
  //     (visibilitychange/pagehide — the reliable "app is going away" signals,
  //     pagehide covering the mobile/bfcache case beforeunload misses), and
  //   · save on a slow 15s interval as a periodic backstop, and on unmount.
  // projectRef keeps this reading the latest state without re-registering.
  useEffect(() => {
    const flush = () => {
      if (loadedRef.current) {
        void saveProject(projectRef.current);
        if (cloudAttachedRef.current) void pushCloudRef.current('auto');
        if (githubRef.current.connected) void pushGithubRef.current('auto');
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    const interval = window.setInterval(flush, 15000);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);

  /** Load a saved project and every version of every part it references. */
  const openProject = useCallback(
    async (projectId: string) => {
      if (projectId === project.id) return;

      setBusy('Opening project…');
      const saved = await listProjects();
      let target = saved.find((entry) => entry.id === projectId);
      const loaded = new Map<string, Float32Array>();
      let cloudAt = 0;

      if (target) {
        // The copy on this computer can be older than what another computer
        // saved since — in that case the Supabase copy is the one to open.
        try {
          const stamp = await cloudProjectStamp(projectId);
          cloudAt = stamp ?? 0;
          if (stamp !== null && cloudIsNewer(target.updatedAt, stamp)) {
            const cloud = await loadFromCloud(projectId);
            target = cloud.project;
            for (const [id, soup] of cloud.geometries) loaded.set(id, soup);
            await persistLocal(cloud.project, cloud.geometries, cloud.project.updatedAt || undefined);
            cloudAt = cloud.project.updatedAt || stamp;
            attachCloud(`Loaded from Supabase · ${cloud.project.name}`);
          }
        } catch {
          /* offline — the local copy is what we have */
        }
      }

      if (!target) {
        try {
          const cloud = await loadFromCloud(projectId);
          target = cloud.project;
          for (const [id, soup] of cloud.geometries) loaded.set(id, soup);
          await persistLocal(cloud.project, cloud.geometries, cloud.project.updatedAt || undefined);
          cloudAt = cloud.project.updatedAt || Date.now();
          attachCloud(`Loaded from Supabase · ${cloud.project.name}`);
        } catch {
          /* fall through */
        }
      }

      if (!target && githubRef.current.connected) {
        try {
          const cloud = await githubLoadProject(projectId);
          target = cloud.project;
          for (const [id, soup] of cloud.geometries) loaded.set(id, soup);
          await persistLocal(cloud.project, cloud.geometries);
        } catch {
          /* fall through */
        }
      }

      if (!target) {
        setBusy(null);
        toast.error('That project could not be found.');
        return;
      }

      if (loaded.size === 0) {
        const pending = [...target.parts];
        for (let i = 0; i < pending.length; i++) {
          const part = pending[i];
          for (const version of part.versions ?? []) {
            const soup = await loadGeometry(version.id);
            if (soup) loaded.set(version.id, soup);
          }
          if (part.group) pending.push(...part.group.members);
        }
      }

      // Keep every part (see the restore-on-mount note) — a geometry that did
      // not load back is hidden by the viewport, never deleted from the build.
      cleanStateRef.current = { project: target, geometries: loaded };
      lastCloudSyncRef.current = { id: projectId, at: cloudAt };
      // Newer here than on Supabase (or not there at all) → push once opened.
      cloudDirtyRef.current = cloudIsNewer(cloudAt, target.updatedAt) || (cloudAt === 0 && target.parts.length > 0);
      setProject(target);
      setGeometries(loaded);
      setSelectedId(null);
      setMarked(new Set());
      setOutline(null);
      setFixReport(null);
      setSimplifyReport(null);
      setFrameToken((token) => token + 1);
      setBusy(null);
      if (cloudDirtyRef.current) setTimeout(() => void pushCloudRef.current('auto'), 1200);
    },
    [project.id, persistLocal, attachCloud]
  );

  const createProjectFolder = useCallback(
    (reason?: string) => {
      // The current project is already saved by the autosave effect.
      const fresh = { ...createProject('New build', newProjectId()) };
      const none = new Map<string, Float32Array>();
      cleanStateRef.current = { project: fresh, geometries: none };
      cloudDirtyRef.current = false;
      lastCloudSyncRef.current = { id: fresh.id, at: 0 };
      setCloudNote('New build — saved to Supabase once it has parts');
      setProject(fresh);
      setGeometries(none);
      setSelectedId(null);
      setOutline(null);
      setCutItems([]);
      setSketch(emptySketch());
      if (reason) toast.info(`${reason} Started a new project.`);
      else toast.success('Started a new project.');
      void refreshProjectList();
    },
    [refreshProjectList]
  );
  startFreshProjectRef.current = createProjectFolder;

  const deleteProjectFolder = useCallback(
    async (projectId: string) => {
      const name =
        projectList.find((entry) => entry.id === projectId)?.name ??
        (projectId === project.id ? project.name : 'this project');
      if (
        typeof window !== 'undefined' &&
        !window.confirm(`Delete “${name}” here and on Supabase? It disappears from every computer.`)
      ) {
        return;
      }
      const saved = await listProjects();
      const target = saved.find((entry) => entry.id === projectId);
      if (target) {
        for (const part of target.parts) {
          for (const version of part.versions ?? []) void deleteGeometry(version.id);
        }
      }
      await deleteProject(projectId);
      try {
        await deleteFromCloud(projectId);
      } catch {
        toast.error('Deleted on this computer, but Supabase did not answer — it may still show up in the list.');
      }
      await refreshProjectList();

      if (projectId === project.id) createProjectFolder();
      else toast.success(`Deleted ${name}.`);
    },
    [project.id, project.name, projectList, refreshProjectList, createProjectFolder]
  );

  const connectGithub = useCallback(async () => {
    const token = githubToken.trim();
    if (!token) {
      toast.error('Paste a GitHub token first.');
      return;
    }
    setBusy('Connecting GitHub…');
    try {
      const status = await githubConnect(token, githubOwner);
      setGithub(status);
      setGithubToken('');
      setShowGithub(false);
      setGithubNote(`Connected · ${status.repo}`);
      toast.success(`Connected to ${status.repo}. Optional GitHub backup — parts still live in Supabase.`);
      loadedRef.current = true;
      await pushGithub('manual');
      void refreshProjectList();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not connect GitHub.');
    } finally {
      setBusy(null);
    }
  }, [githubToken, githubOwner, pushGithub, refreshProjectList]);

  const disconnectGithub = useCallback(async () => {
    try {
      const status = await githubDisconnect();
      setGithub(status);
      setGithubNote(status.connected ? `Connected · ${status.repo}` : 'Not connected');
      toast.success(status.connected ? 'Switched back to the shared GitHub save.' : 'GitHub disconnected. Saves stay on this computer.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not disconnect.');
    }
  }, []);

  const selectedPart = useMemo(
    () => project.parts.find((part) => part.id === selectedId) ?? null,
    [project.parts, selectedId]
  );
  const selectedSoup = selectedPart ? (geometries.get(selectedPart.activeVersionId) ?? null) : null;
  const paintMesh = useMemo(
    () => (selectedSoup ? weld(selectedSoup).mesh : null),
    [selectedSoup]
  );
  const paintLocal = useMemo(() => {
    if (!paintMesh || painted.size === 0) return new Float32Array(0);
    const out = new Float32Array(painted.size * 3);
    let offset = 0;
    for (const index of painted) {
      out[offset] = paintMesh.positions[index * 3];
      out[offset + 1] = paintMesh.positions[index * 3 + 1];
      out[offset + 2] = paintMesh.positions[index * 3 + 2];
      offset += 3;
    }
    return out;
  }, [paintMesh, painted]);

  useEffect(() => {
    setPainted(new Set());
  }, [selectedId, selectedSoup]);

  useEffect(() => {
    setDiagnosis(null);
  }, [selectedId]);

  useEffect(() => {
    if (!isMobile) return;
    setShowGallery(false);
    setShowInspector(false);
  }, [isMobile]);

  useEffect(() => {
    if (focusId && !project.parts.some((part) => part.id === focusId)) setFocusId(null);
  }, [focusId, project.parts]);

  useEffect(() => {
    if (!focusId || !selectedId || selectedId === focusId) return;
    setFocusId(selectedId);
    setFrameToken((token) => token + 1);
  }, [selectedId, focusId]);

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
    () => {
      if (workspace !== 'bench') return [];
      if (!assembly) return benchPlacement(project);
      return mode === 'assembled'
        ? assembledPlacement(project)
        : mode === 'free'
          ? freePlacement(project)
          : scatterPlacement(project, sizes);
    },
    [assembly, mode, project, sizes, workspace]
  );

  const viewportParts = useMemo<ViewportPart[]>(() => {
    if (workspace !== 'bench') return [];
    const byId = new Map(placements.map((placement) => [placement.partId, placement]));
    const parts: ViewportPart[] = [];

    for (const part of project.parts) {
      const soup = geometries.get(part.activeVersionId);
      const placement = byId.get(part.id);
      if (!soup || !placement) continue;
      if (focusId ? part.id !== focusId : !part.visible) continue;

      const look = lookFor(part);
      parts.push({
        id: part.id,
        color: look.color,
        metalness: look.metalness,
        roughness: look.roughness,
        soup,
        target: placement.position,
        rotation: part.transform.rotation,
        scale: part.transform.scale,
        dimmed: placement.dimmed,
      });
    }
    return parts;
  }, [project.parts, geometries, placements, focusId, workspace]);

  const partWorldPos = useCallback(
    (part: Part) => {
      const placement = placements.find((entry) => entry.partId === part.id);
      if (placement) return placement.position;
      const anchor = project.slots.find((slot) => slot.activePartId === part.id)?.anchor;
      const mounted = {
        x: part.transform.position.x + (anchor?.x ?? 0),
        y: part.transform.position.y + (anchor?.y ?? 0),
        z: part.transform.position.z + (anchor?.z ?? 0),
      };
      return mode === 'free' ? (part.freePos ?? mounted) : mounted;
    },
    [placements, mode, project.slots]
  );

  const snapNeighbors = useMemo(
    () => {
      if (workspace !== 'bench') return [];
      return project.parts.flatMap((part) => {
        if (focusId ? part.id !== focusId : !part.visible) return [];
        const soup = geometries.get(part.activeVersionId);
        if (!soup) return [];
        const local = computeBounds(soup);
        return [
          {
            id: part.id,
            box: orientedAabb(
              { min: local.min, max: local.max },
              partWorldPos(part),
              part.transform.rotation,
              part.transform.scale
            ),
          },
        ];
      });
    },
    [project.parts, geometries, partWorldPos, focusId, workspace]
  );

  const snapAnchors = useMemo(
    () => (assembly ? project.slots.map((slot) => slot.anchor) : []),
    [assembly, project.slots]
  );

  // Volume and mass are expensive (they weld the mesh), so results are cached
  // against the geometry and scale they were computed from. Count everything
  // on the table — not only parts assigned to a blaster slot — so a four-piece
  // body you just dropped still shows mass and triangle counts.
  const statsCache = useRef(new Map<string, { volume: number; triangles: number }>());
  const tableTotals = useMemo(() => {
    let triangles = 0;
    let volume = 0;
    let mass = 0;
    let count = 0;

    for (const part of project.parts) {
      const soup = geometries.get(part.activeVersionId);
      if (!soup || part.visible === false) continue;

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
  }, [project.parts, geometries]);

  const fittedCount = useMemo(
    () => project.slots.filter((slot) => Boolean(slot.activePartId)).length,
    [project.slots]
  );

  /** Same numbers the HUD and weld-disabled checks read. */
  const assemblyTotals = tableTotals;

  /** The live mesh of a part, i.e. whichever version is currently selected. */
  const soupOfPart = useCallback(
    (partId: string): Float32Array | undefined => {
      const part = project.parts.find((candidate) => candidate.id === partId);
      return part ? geometries.get(part.activeVersionId) : undefined;
    },
    [project.parts, geometries]
  );

  /**
   * Undo depth, each way. Every step holds one project snapshot and a shallow
   * copy of the geometry map — the meshes themselves are shared, not copied,
   * so twenty steps costs a few thousand pointers rather than a few hundred
   * megabytes of triangles.
   */
  const UNDO_DEPTH = 50;

  const past = useRef<HistoryStep[]>([]);
  const futureSteps = useRef<HistoryStep[]>([]);
  // Bumped whenever the stacks change, purely so the menu can grey the items
  // out; the stacks themselves live in refs so recording never re-renders.
  const [historyToken, setHistoryToken] = useState(0);

  /**
   * The geometry map as it was before the current patch.
   *
   * The effect runs after render, so during a patch this still holds the map
   * from before it — which is exactly the snapshot undo needs, whether the
   * caller wrote geometry before calling patchProject (an import) or after
   * (a delete).
   */
  const geometriesRef = useRef(geometries);
  useEffect(() => {
    geometriesRef.current = geometries;
  }, [geometries]);
  // The meshes as of the latest render, in step with projectRef. geometriesRef
  // above lags a render behind on purpose, for undo snapshots, so a push must
  // not read it: between a render and its effects it would pair a new part list
  // with the old meshes.
  const renderedGeometriesRef = useRef(geometries);
  renderedGeometriesRef.current = geometries;

  /**
   * Fetch any mesh the project points at that this tab does not hold — after
   * an import raced the restore, a cloud download that skipped a file, or an
   * undo back past a delete. This computer's store first, then Supabase. It
   * only ever adds to the map, so it cannot knock out anything already loaded.
   */
  const fetchingVersions = useRef(new Set<string>());
  /** Meshes looked for everywhere and not found. A push does not wait for these. */
  const missingVersionsRef = useRef(new Set<string>());
  const [meshRetry, setMeshRetry] = useState(0);
  useEffect(() => {
    const missing = activeVersionIds(project).filter(
      (id) => !geometries.has(id) && !fetchingVersions.current.has(id)
    );
    if (missing.length === 0) return;
    for (const id of missing) fetchingVersions.current.add(id);
    const projectId = project.id;
    const onTable = new Set(project.parts.map((part) => part.activeVersionId));

    void (async () => {
      const found = new Map<string, Float32Array>();
      let retry = false;
      let lost = 0;
      for (const id of missing) {
        let soup: Float32Array | null;
        try {
          soup = await loadGeometry(id);
          if (!soup) {
            soup = await loadCloudGeometry(projectId, id);
            if (soup) void saveGeometry(id, soup);
          }
        } catch {
          // Offline, or the server stumbled: not an answer. Try again shortly.
          fetchingVersions.current.delete(id);
          retry = true;
          continue;
        }
        if (soup) {
          found.set(id, soup);
        } else if (!missingVersionsRef.current.has(id)) {
          // Stays marked, so a mesh that exists nowhere is not re-fetched on every render.
          missingVersionsRef.current.add(id);
          if (onTable.has(id)) lost++;
        }
      }
      if (retry) setTimeout(() => setMeshRetry((count) => count + 1), 15_000);
      if (lost > 0) {
        toast.error(
          lost === 1
            ? 'A part has no mesh saved on this computer or in the cloud. Import it again, or remove it.'
            : `${lost} parts have no mesh saved on this computer or in the cloud. Import them again, or remove them.`
        );
      }
      if (found.size === 0) return;
      for (const id of found.keys()) fetchingVersions.current.delete(id);

      setGeometries((current) => {
        let next = current;
        for (const [id, soup] of found) {
          if (next.has(id)) continue;
          if (next === current) next = new Map(current);
          next.set(id, soup);
        }
        // Filling meshes in is not an edit: if the map was the clean copy from
        // disk or Supabase, the filled one is the clean copy now.
        if (next !== current && cleanStateRef.current.geometries === current) {
          cleanStateRef.current = { ...cleanStateRef.current, geometries: next };
        }
        return next;
      });
    })();
  }, [project, geometries, meshRetry]);

  const patchProject = useCallback(
    (patch: (current: Project) => Project, options?: { history?: boolean }) => {
      setProject((current) => {
        const next = patch(current);
        // A patch that changed nothing is not a step worth undoing.
        if (next === current) return current;

        if (options?.history !== false) {
          past.current.push({ project: current, geometries: geometriesRef.current });
          if (past.current.length > UNDO_DEPTH) past.current.shift();
          // Any new edit abandons the redo branch, as everywhere else.
          futureSteps.current = [];
          setHistoryToken((token) => token + 1);
        }
        return next;
      });
    },
    []
  );

  /**
   * Move one step along the history in either direction.
   *
   * Geometry is re-saved on the way: deleting a part removes its mesh from
   * storage, so stepping back over a delete has to put it back or the part
   * would return as an empty shell after a reload.
   */
  const step = useCallback(
    (from: React.RefObject<HistoryStep[]>, to: React.RefObject<HistoryStep[]>, label: string) => {
      const entry = from.current.pop();
      if (!entry) {
        toast.error(`Nothing to ${label}.`);
        return;
      }

      setProject((current) => {
        to.current.push({ project: current, geometries: geometriesRef.current });
        if (to.current.length > UNDO_DEPTH) to.current.shift();
        return entry.project;
      });
      setGeometries(entry.geometries);

      for (const part of entry.project.parts) {
        for (const version of part.versions) {
          const soup = entry.geometries.get(version.id);
          if (soup) void saveGeometry(version.id, soup);
        }
      }

      setSelectedId((current) =>
        entry.project.parts.some((part) => part.id === current) ? current : null
      );
      setMarked(new Set());
      setHistoryToken((token) => token + 1);
    },
    []
  );

  const undo = useCallback(() => step(past, futureSteps, 'undo'), [step]);
  const redo = useCallback(() => step(futureSteps, past, 'redo'), [step]);

  const canUndo = past.current.length > 0;
  const canRedo = futureSteps.current.length > 0;
  // historyToken only exists to make the two flags above recompute.
  void historyToken;

  const importFiles = useCallback(
    async (
      files: File[],
      opts?: {
        autoFit?: boolean;
        classifyHint?: string;
        tags?: Record<string, { slotId: string; kitId: string }>;
      }
    ) => {
      const accepted = files.filter((file) => /\.stl$/i.test(file.name) || is3mf(file.name));
      if (accepted.length === 0) {
        toast.error('No STL or 3MF files in that drop.');
        return;
      }

      setBusy(`Reading ${accepted.length} file${accepted.length > 1 ? 's' : ''}…`);
      const addedParts: Part[] = [];
      const addedGeometry = new Map<string, Float32Array>();
      let failures = 0;

      // A file that arrived as one built object stays one object: its meshes
      // become a group so importing does not scatter it into loose parts
      // (Ungroup splits it later). A single-mesh file stays a single part.
      type Incoming = {
        fileName: string;
        base: string;
        meshes: { name: string; positions: Float32Array; triangles: number }[];
      };
      const sources: Incoming[] = [];

      for (const file of accepted) {
        try {
          if (is3mf(file.name)) {
            const meshes = await parse3mf(await file.arrayBuffer());
            const base = file.name.replace(/\.3mf$/i, '');
            const kept = meshes
              .filter((mesh) => mesh.triangles > 0)
              .map((mesh) => ({ name: mesh.name || base, positions: mesh.soup, triangles: mesh.triangles }));
            if (kept.length > 0) sources.push({ fileName: file.name, base, meshes: kept });
          } else {
            const raw = parseStl(await file.arrayBuffer());
            if (raw.triangles > 0) {
              const base = file.name.replace(/\.stl$/i, '');
              sources.push({
                fileName: file.name,
                base,
                meshes: [{ name: base, positions: raw.positions, triangles: raw.triangles }],
              });
            }
          }
        } catch {
          failures++;
        }
      }

      if (sources.length === 0) {
        setBusy(null);
        toast.error('Nothing readable in those files.');
        return;
      }

      const centerOf = (soup: Float32Array): [number, number, number] => {
        let minX = Infinity;
        let minY = Infinity;
        let minZ = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        let maxZ = -Infinity;
        for (let i = 0; i + 2 < soup.length; i += 3) {
          const x = soup[i];
          const y = soup[i + 1];
          const z = soup[i + 2];
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (z < minZ) minZ = z;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
          if (z > maxZ) maxZ = z;
        }
        return [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
      };
      const shift = (soup: Float32Array, dx: number, dy: number, dz: number) =>
        bakeTransform(soup, {
          position: { x: dx, y: dy, z: dz },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        });
      const mkPart = (
        name: string,
        fileName: string,
        soup: Float32Array,
        position: { x: number; y: number; z: number },
        slotId: string,
        kitId = ''
      ): Part => {
        const versionId = newVersionId();
        const color = nextColor({ ...project, parts: [...project.parts, ...addedParts] } as Project);
        const triangles = Math.floor(soup.length / 9);
        addedGeometry.set(versionId, soup);
        return {
          id: newPartId(),
          name,
          fileName,
          slotId,
          kitId,
          color,
          visible: true,
          transform: { position, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
          triangles,
          materialId: project.materialId,
          notes: '',
          // The file as it arrived is v1 and is never written over.
          versions: [{ id: versionId, label: 'v1 imported', note: fileName, triangles, createdAt: Date.now() }],
          activeVersionId: versionId,
          thumbnail: renderThumbnail(soup, color),
          addedAt: Date.now(),
        };
      };

      for (const file of sources) {
        try {
          const prepared = file.meshes.map((mesh) => ({
            name: mesh.name,
            soup: zUp ? zUpToYUp(mesh.positions) : mesh.positions,
          }));

          if (prepared.length === 1) {
            const tagged = opts?.tags?.[file.fileName];
            const slotId = tagged?.slotId || guessSlot(prepared[0].name, opts?.classifyHint);
            const kitId =
              tagged?.kitId ||
              guessKit(`${opts?.classifyHint ?? ''} ${file.fileName} ${prepared[0].name}`);
            addedParts.push(
              mkPart(
                prepared[0].name,
                file.fileName,
                recenter(prepared[0].soup),
                { x: 0, y: 0, z: 0 },
                slotId,
                kitId
              )
            );
            continue;
          }

          // Multi-mesh file → one grouped part; the meshes keep their relative
          // placement (baked into member offsets and the group's own geometry).
          let minX = Infinity;
          let minY = Infinity;
          let minZ = Infinity;
          let maxX = -Infinity;
          let maxY = -Infinity;
          let maxZ = -Infinity;
          for (const mesh of prepared) {
            for (let i = 0; i + 2 < mesh.soup.length; i += 3) {
              const x = mesh.soup[i];
              const y = mesh.soup[i + 1];
              const z = mesh.soup[i + 2];
              if (x < minX) minX = x;
              if (y < minY) minY = y;
              if (z < minZ) minZ = z;
              if (x > maxX) maxX = x;
              if (y > maxY) maxY = y;
              if (z > maxZ) maxZ = z;
            }
          }
          const gcx = (minX + maxX) / 2;
          const gcy = (minY + maxY) / 2;
          const gcz = (minZ + maxZ) / 2;

          const members: Part[] = [];
          const pieces: Float32Array[] = [];
          for (const mesh of prepared) {
            const [mcx, mcy, mcz] = centerOf(mesh.soup);
            members.push(
              mkPart(
                mesh.name,
                file.fileName,
                shift(mesh.soup, -mcx, -mcy, -mcz),
                { x: mcx - gcx, y: mcy - gcy, z: mcz - gcz },
                ''
              )
            );
            pieces.push(shift(mesh.soup, -gcx, -gcy, -gcz));
          }

          let total = 0;
          for (const piece of pieces) total += piece.length;
          const combined = new Float32Array(total);
          let at = 0;
          for (const piece of pieces) {
            combined.set(piece, at);
            at += piece.length;
          }

          const groupPart = mkPart(
            file.base,
            file.fileName,
            combined,
            { x: 0, y: 0, z: 0 },
            opts?.tags?.[file.fileName]?.slotId || guessSlot(file.base, opts?.classifyHint),
            opts?.tags?.[file.fileName]?.kitId ||
              guessKit(`${opts?.classifyHint ?? ''} ${file.fileName} ${file.base}`)
          );
          groupPart.group = { members, fitted: [] };
          groupPart.notes = members.map((part) => part.name).join('\n');
          addedParts.push(groupPart);
        } catch {
          failures++;
        }
      }

      if (addedParts.length > 0) {
        if (!assemblyOn(project)) {
          // A plain bench has no lanes to spread parts into, so new parts line
          // up to the right of what is already there instead of piling up at
          // the origin. The first part on an empty bench stays centred.
          let right = snapNeighbors.reduce(
            (edge, entry) => Math.max(edge, entry.box.max[0]),
            Number.NEGATIVE_INFINITY
          );
          for (const part of addedParts) {
            const soup = addedGeometry.get(part.activeVersionId);
            const width = soup ? computeBounds(soup).size[0] : 0;
            if (!Number.isFinite(right)) {
              right = width / 2;
              continue;
            }
            // A table position, not a mount offset: switching the slots on later
            // still fits the part straight onto its mount.
            part.freePos = { x: right + 40 + width / 2, y: 0, z: 0 };
            right += 40 + width;
          }
        }
        setGeometries((current) => {
          const next = new Map(current);
          for (const [id, soup] of addedGeometry) next.set(id, soup);
          return next;
        });

        patchProject((current) => {
          const autoFit = opts?.autoFit !== false && assemblyOn(current);
          const slots = autoFit
            ? current.slots.map((slot) => {
                if (slot.activePartId) return slot;
                const candidate = addedParts.find((part) => part.slotId === slot.id);
                return candidate ? { ...slot, activePartId: candidate.id } : slot;
              })
            : current.slots;
          return { ...current, slots, parts: [...current.parts, ...addedParts] };
        });

        for (const [id, soup] of addedGeometry) void saveGeometry(id, soup);
        setSelectedId(addedParts[addedParts.length - 1].id);
        setFrameToken((token) => token + 1);
      }

      setBusy(null);
      if (failures > 0) toast.error(`${failures} file(s) could not be read.`);
      if (addedParts.length > 0) toast.success(`Added ${addedParts.length} part(s).`);
      return addedParts;
    },
    [project, patchProject, zUp, snapNeighbors]
  );

  const pendingConsumed = useRef(false);
  useEffect(() => {
    if (!restored || pendingConsumed.current || !pendingImport?.files.length) return;
    pendingConsumed.current = true;
    void (async () => {
      const added = await importFiles(pendingImport.files, {
        autoFit: true,
        tags: pendingImport.tags,
      });
      onPendingConsumed?.();
      if (!added?.length) return;
      setWorkspace('bench');
      setMode('assembled');
      setShowGallery(true);
    })();
  }, [restored, importFiles, pendingImport, onPendingConsumed]);

  const patchPart = useCallback(
    (partId: string, patch: Partial<Part>) => {
      patchProject((current) => ({
        ...current,
        parts: current.parts.map((part) => {
          if (part.id !== partId) return part;
          const next = { ...part, ...patch };
          if (patch.color !== undefined || 'finishId' in patch) {
            const soup = geometries.get(part.activeVersionId);
            if (soup) {
              const look = lookFor(next);
              next.thumbnail = renderThumbnail(soup, look.color, look);
            }
          }
          return next;
        }),
      }));
    },
    [patchProject, geometries]
  );

  const togglePartVisible = useCallback(
    (partId: string) => {
      patchProject((current) => ({
        ...current,
        parts: current.parts.map((part) =>
          part.id === partId ? { ...part, visible: !part.visible } : part
        ),
      }));
      setMoveModeId((current) => {
        if (current !== partId) return current;
        const part = project.parts.find((candidate) => candidate.id === partId);
        // Visible now means the toggle just hid it — drop the grab handles.
        return part?.visible ? null : current;
      });
    },
    [patchProject, project.parts]
  );

  const showAllParts = useCallback(() => {
    patchProject((current) => {
      if (current.parts.every((part) => part.visible)) return current;
      return {
        ...current,
        parts: current.parts.map((part) => (part.visible ? part : { ...part, visible: true })),
      };
    });
  }, [patchProject]);

  /** Hide every other part on the table. A second click on the same part restores them. */
  const isolatePart = useCallback((partId: string) => {
    setSelectedId(partId);
    setFocusId((current) => (current === partId ? null : partId));
    setFrameToken((token) => token + 1);
  }, []);

  const toggleFocus = useCallback(() => {
    if (focusId) {
      setFocusId(null);
      setFrameToken((token) => token + 1);
      return;
    }
    if (!selectedId) {
      toast.error('Select a part first.');
      return;
    }
    setFocusId(selectedId);
    setFrameToken((token) => token + 1);
  }, [focusId, selectedId]);

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

  /**
   * Commit a viewport grab-to-move. In free mode the part carries an absolute
   * position of its own; everywhere else the delta lands on its offset from the
   * mount.
   */
  const nudgePart = useCallback(
    (id: string, delta: { x: number; y: number; z: number }) => {
      patchProject((current) => ({
        ...current,
        parts: current.parts.map((part) => {
          if (part.id !== id) return part;
          if (mode === 'free') {
            // A part never placed by hand starts from where it is drawn, not the origin.
            const fp = part.freePos ?? partWorldPos(part);
            return { ...part, freePos: { x: fp.x + delta.x, y: fp.y + delta.y, z: fp.z + delta.z } };
          }
          return {
            ...part,
            transform: {
              ...part.transform,
              position: {
                x: part.transform.position.x + delta.x,
                y: part.transform.position.y + delta.y,
                z: part.transform.position.z + delta.z,
              },
            },
          };
        }),
      }));
    },
    [patchProject, mode, partWorldPos]
  );

  /** Commit a viewport grab-to-rotate: add the degree delta to the rotation. */
  const spinPart = useCallback(
    (id: string, delta: { x: number; y: number; z: number }) => {
      patchProject((current) => ({
        ...current,
        parts: current.parts.map((part) =>
          part.id === id
            ? {
                ...part,
                transform: {
                  ...part.transform,
                  rotation: {
                    x: part.transform.rotation.x + delta.x,
                    y: part.transform.rotation.y + delta.y,
                    z: part.transform.rotation.z + delta.z,
                  },
                },
              }
            : part
        ),
      }));
    },
    [patchProject]
  );

  /** Open the free-arrange workspace, seeding positions from the current layout. */
  const goFree = useCallback(() => {
    patchProject((current) => {
      // Nothing to seed if every part already has a free position.
      if (!current.parts.some((part) => !part.freePos)) return current;
      const placements =
        mode === 'assembled' ? assembledPlacement(current) : scatterPlacement(current, sizes);
      const posById = new Map(placements.map((placement) => [placement.partId, placement.position]));
      return {
        ...current,
        parts: current.parts.map((part) =>
          part.freePos
            ? part
            : { ...part, freePos: posById.get(part.id) ?? { ...part.transform.position } }
        ),
      };
    });
    setMode('free');
  }, [mode, sizes, patchProject]);

  /**
   * Double-tap a part in the view: select it and arm move mode on it. From the
   * auto-arranged "scattered" mode this also drops into free-placement — goFree
   * seeds every part's position from the current layout, so nothing jumps; the
   * part just becomes hand-movable. In assembled/free it only arms move mode.
   */
  const enterMoveMode = useCallback((id: string) => {
    setSelectedId(id);
    setMoveModeId(id);
    if (mode === 'scattered') goFree();
  }, [mode, goFree]);

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

      if (!assembly) return;
      const part = project.parts.find((candidate) => candidate.id === partId);
      if (part?.slotId) fitPart(part.slotId, partId);
    },
    [assembly, project.parts, fitPart]
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

  /** The selected part plus anything marked alongside it, in gallery order. */
  const selection = useMemo(() => {
    const ids = new Set(marked);
    if (selectedId) ids.add(selectedId);
    return project.parts.filter((part) => ids.has(part.id));
  }, [project.parts, marked, selectedId]);

  const toggleMarked = useCallback((partId: string) => {
    setMarked((current) => {
      const next = new Set(current);
      if (next.has(partId)) next.delete(partId);
      else next.add(partId);
      return next;
    });
  }, []);

  /**
   * Bundle the selected parts into one.
   *
   * Each member's transform is baked into its geometry first, so the bundle
   * holds them exactly where they sat, and the members themselves are kept
   * whole inside the group rather than merged away — ungrouping gives back
   * what went in rather than an approximation of it.
   */
  const groupSelection = useCallback(() => {
    if (selection.length < 2) {
      toast.error('Pick two or more parts to group — turn on Multi or hold ⌘/Ctrl.');
      return;
    }
    const members = flattenGroupMembers(selection);
    if (members.length < 2) {
      toast.error('Need two real parts after unwrapping groups.');
      return;
    }

    const selectedIds = new Set(selection.map((part) => part.id));
    const pieces: Float32Array[] = [];
    for (const selected of selection) {
      if (selected.group && selected.group.members.length > 0) {
        const parentXform: Transform = {
          ...selected.transform,
          position: partWorldPos(selected),
        };
        for (const member of flattenGroupMembers([selected])) {
          const soup = geometries.get(member.activeVersionId);
          if (!soup) continue;
          const fitted = selected.group.fitted.find((entry) => entry.partId === member.id);
          const anchor = fitted
            ? project.slots.find((slot) => slot.id === fitted.slotId)?.anchor
            : undefined;
          const innerPos = {
            x: member.transform.position.x + (anchor?.x ?? 0),
            y: member.transform.position.y + (anchor?.y ?? 0),
            z: member.transform.position.z + (anchor?.z ?? 0),
          };
          const inner = bakeTransform(soup, { ...member.transform, position: innerPos });
          pieces.push(bakeTransform(inner, parentXform));
        }
      } else {
        const soup = soupOfPart(selected.id);
        if (!soup) continue;
        pieces.push(bakeTransform(soup, { ...selected.transform, position: partWorldPos(selected) }));
      }
    }
    if (pieces.length === 0) return;

    let total = 0;
    for (const piece of pieces) total += piece.length;
    const combined = new Float32Array(total);
    let at = 0;
    for (const piece of pieces) {
      combined.set(piece, at);
      at += piece.length;
    }

    const fittedBySlot = new Map<string, string>();
    for (const part of selection) {
      for (const entry of part.group?.fitted ?? []) fittedBySlot.set(entry.slotId, entry.partId);
    }
    for (const slot of project.slots) {
      if (slot.activePartId && selectedIds.has(slot.activePartId)) {
        fittedBySlot.set(slot.id, slot.activePartId);
      }
    }
    const fitted = [...fittedBySlot.entries()].map(([slotId, partId]) => ({ slotId, partId }));

    const id = newPartId();
    const versionId = newVersionId();
    const color = nextColor(project);
    const triangles = Math.floor(combined.length / 9);

    setGeometries((current) => new Map(current).set(versionId, combined));
    void saveGeometry(versionId, combined);

    patchProject((current) => ({
      ...current,
      slots: current.slots.map((slot) =>
        slot.activePartId && selectedIds.has(slot.activePartId)
          ? { ...slot, activePartId: null }
          : slot
      ),
      parts: [
        ...current.parts.filter((part) => !selectedIds.has(part.id)),
        {
          id,
          name: `Group of ${members.length}`,
          fileName: '',
          slotId: '',
          color,
          visible: true,
          transform: {
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
          },
          triangles,
          materialId: members[0].materialId,
          notes: members.map((part) => part.name).join('\n'),
          versions: [
            {
              id: versionId,
              label: 'v1 grouped',
              note: members.map((part) => part.name).join(', '),
              triangles,
              createdAt: Date.now(),
            },
          ],
          activeVersionId: versionId,
          group: { members, fitted },
          thumbnail: renderThumbnail(combined, color),
          addedAt: Date.now(),
        },
      ],
    }));

    for (const part of selection) {
      if (part.group) {
        for (const version of part.versions) void deleteGeometry(version.id);
      }
    }

    setMarked(new Set());
    setSelectedId(id);
    setFrameToken((token) => token + 1);
    toast.success(`Grouped ${members.length} parts.`);
  }, [selection, project, soupOfPart, patchProject, partWorldPos, geometries]);

  /** Put a group's members back exactly as they were, and drop the bundle. */
  const ungroupPart = useCallback(
    (partId: string) => {
      const group = project.parts.find((part) => part.id === partId)?.group;
      if (!group) {
        toast.error('That part is not a group.');
        return;
      }

      const restored = new Map(group.fitted.map((entry) => [entry.slotId, entry.partId]));

      patchProject((current) => ({
        ...current,
        slots: current.slots.map((slot) =>
          restored.has(slot.id) ? { ...slot, activePartId: restored.get(slot.id) as string } : slot
        ),
        parts: [...current.parts.filter((part) => part.id !== partId), ...group.members],
      }));

      // The bundle's own geometry is the only thing that goes; the members'
      // was never touched, which is what makes this exact.
      const bundle = project.parts.find((part) => part.id === partId);
      for (const version of bundle?.versions ?? []) {
        void deleteGeometry(version.id);
      }

      setMarked(new Set());
      setSelectedId(group.members[0]?.id ?? null);
      setFrameToken((token) => token + 1);
      toast.success(`Ungrouped ${group.members.length} parts.`);
    },
    [project.parts, patchProject]
  );

  /**
   * Fuse the selected parts into one watertight solid on the bench. Unlike
   * grouping, the originals are not kept — undo is the way back.
   */
  const mergeSelection = useCallback(() => {
    const members = selection;
    if (members.length < 2) {
      toast.error('Pick two or more parts to merge — turn on multi-select or hold ⌘/Ctrl.');
      return;
    }

    const pieces: Float32Array[] = [];
    for (const member of members) {
      const soup = soupOfPart(member.id);
      if (!soup) continue;
      pieces.push(bakeTransform(soup, { ...member.transform, position: partWorldPos(member) }));
    }
    if (pieces.length < 2) {
      toast.error('Need geometry on at least two selected parts.');
      return;
    }

    setBusy(`Merging ${pieces.length} parts…`);
    setTimeout(() => {
      try {
        const result = unionMesh(pieces, { resolution: 220, sealMm: 0.6 });
        if (result.soup.length === 0) {
          toast.error('Merge produced an empty solid.');
          return;
        }

        const memberIds = new Set(members.map((part) => part.id));
        const id = newPartId();
        const versionId = newVersionId();
        const color = nextColor(project);
        const triangles = Math.floor(result.soup.length / 9);

        setGeometries((current) => new Map(current).set(versionId, result.soup));
        void saveGeometry(versionId, result.soup);

        patchProject((current) => ({
          ...current,
          slots: current.slots.map((slot) =>
            slot.activePartId && memberIds.has(slot.activePartId)
              ? { ...slot, activePartId: id }
              : slot
          ),
          parts: [
            ...current.parts.filter((part) => !memberIds.has(part.id)),
            {
              id,
              name: `Merged (${members.length})`,
              fileName: '',
              slotId: members[0].slotId,
              color,
              visible: true,
              transform: {
                position: { x: 0, y: 0, z: 0 },
                rotation: { x: 0, y: 0, z: 0 },
                scale: { x: 1, y: 1, z: 1 },
              },
              triangles,
              materialId: members[0].materialId,
              notes: members.map((part) => part.name).join('\n'),
              versions: [
                {
                  id: versionId,
                  label: 'v1 merged',
                  note: members.map((part) => part.name).join(', '),
                  triangles,
                  createdAt: Date.now(),
                },
              ],
              activeVersionId: versionId,
              thumbnail: renderThumbnail(result.soup, color),
              addedAt: Date.now(),
            },
          ],
        }));

        for (const member of members) {
          for (const version of member.versions) void deleteGeometry(version.id);
        }

        setMarked(new Set());
        setSelectedId(id);
        setFrameToken((token) => token + 1);
        toast.success(
          `Merged ${members.length} parts · ${formatCount(result.report.trianglesAfter)} triangles. If a seam still steps, Repair → Fix misalignment.`
        );
      } catch {
        toast.error('Could not merge those parts.');
      } finally {
        setBusy(null);
      }
    }, 20);
  }, [selection, soupOfPart, partWorldPos, project, patchProject]);

  /**
   * Slide the other selected part onto this one so their facing faces sit
   * flush with as much overlap as possible. A later Merge then has no
   * hairline gap to turn into extra seam edges.
   */
  const runFitTogether = useCallback(() => {
    if (selection.length !== 2) {
      toast.error('Select exactly two parts — turn on Multi or hold ⌘/Ctrl.');
      return;
    }
    const fixedPart = selection.find((part) => part.id === selectedId) ?? selection[0];
    if (!fixedPart) return;
    const movingPart = selection.find((part) => part.id !== fixedPart.id);
    if (!movingPart) return;

    const fixedSoup = soupOfPart(fixedPart.id);
    const movingSoup = soupOfPart(movingPart.id);
    if (!fixedSoup || !movingSoup) {
      toast.error('Need geometry on both selected parts.');
      return;
    }

    const fixedWorld = bakeTransform(fixedSoup, {
      ...fixedPart.transform,
      position: partWorldPos(fixedPart),
    });
    const movingWorld = bakeTransform(movingSoup, {
      ...movingPart.transform,
      position: partWorldPos(movingPart),
    });
    const result = fitTogether(fixedWorld, movingWorld);
    const contact = `${Math.round(result.contactPercent)}% contact`;
    const moved = Math.hypot(result.delta.x, result.delta.y, result.delta.z);

    if (moved < 0.02) {
      toast.success(`Already flush · ${contact}`);
      return;
    }

    const applyDelta = (pos: { x: number; y: number; z: number }) => ({
      x: pos.x + result.delta.x,
      y: pos.y + result.delta.y,
      z: pos.z + result.delta.z,
    });

    if (mode === 'assembled') {
      nudgePart(movingPart.id, result.delta);
    } else {
      // Scatter layout ignores transform.position, so seed Free arrange from
      // wherever the parts sit now and apply the slide there.
      patchProject((current) => {
        const layout =
          mode === 'free' ? freePlacement(current) : scatterPlacement(current, sizes);
        const posById = new Map(layout.map((entry) => [entry.partId, entry.position]));
        return {
          ...current,
          parts: current.parts.map((part) => {
            const seated = part.freePos ?? posById.get(part.id) ?? partWorldPos(part);
            if (part.id !== movingPart.id) {
              return part.freePos ? part : { ...part, freePos: seated };
            }
            return { ...part, freePos: applyDelta(seated) };
          }),
        };
      });
      if (mode !== 'free') setMode('free');
    }

    const gap =
      result.gapClosedMm < 1
        ? `${result.gapClosedMm.toFixed(2)} mm`
        : `${result.gapClosedMm.toFixed(1)} mm`;
    const summary = `Fitted together · ${contact} · closed ${gap}`;
    if (result.contactPercent < 35) {
      toast.warning(`${summary}. Faces may not match — rotate one half and try again.`);
    } else {
      toast.success(summary);
    }
  }, [selection, selectedId, soupOfPart, partWorldPos, nudgePart, mode, sizes, patchProject]);

  /**
   * Drop the selected part onto the table: rotate a face flat onto Y=0, then
   * lower it until it sits. Lands in Free arrange so it can be dragged after.
   */
  const runSettle = useCallback(
    (partId?: string) => {
      const id = partId ?? selectedId;
      const part = project.parts.find((candidate) => candidate.id === id) ?? null;
      if (!part) {
        toast.error('Select a part first.');
        return;
      }
      const soup = soupOfPart(part.id);
      if (!soup) {
        toast.error('That part has no geometry.');
        return;
      }

      const worldPos = partWorldPos(part);
      const result = settleOnFloor(soup, part.transform, worldPos);
      const already = Math.abs(result.droppedMm) < 0.05 && Math.abs(result.tiltedDeg) < 0.5;

      if (mode === 'assembled') {
        const anchor = project.slots.find((slot) => slot.activePartId === part.id)?.anchor ?? {
          x: 0,
          y: 0,
          z: 0,
        };
        patchProject((current) => ({
          ...current,
          parts: current.parts.map((entry) =>
            entry.id !== part.id
              ? entry
              : {
                  ...entry,
                  transform: {
                    ...entry.transform,
                    rotation: result.rotation,
                    position: {
                      x: result.position.x - anchor.x,
                      y: result.position.y - anchor.y,
                      z: result.position.z - anchor.z,
                    },
                  },
                }
          ),
        }));
      } else {
        patchProject((current) => {
          const layout =
            mode === 'free' ? freePlacement(current) : scatterPlacement(current, sizes);
          const posById = new Map(layout.map((entry) => [entry.partId, entry.position]));
          return {
            ...current,
            parts: current.parts.map((entry) => {
              if (entry.id === part.id) {
                return {
                  ...entry,
                  transform: { ...entry.transform, rotation: result.rotation },
                  freePos: result.position,
                };
              }
              return entry.freePos
                ? entry
                : { ...entry, freePos: posById.get(entry.id) ?? partWorldPos(entry) };
            }),
          };
        });
        if (mode !== 'free') setMode('free');
      }

      setPainting(false);
      setMoveModeId(part.id);

      if (already) {
        toast.success('Already on the floor.');
        return;
      }
      const bits = ['Settled on the floor'];
      if (Math.abs(result.tiltedDeg) >= 0.5) bits.push('stood upright');
      const travel = Math.abs(result.droppedMm);
      if (travel >= 0.05) {
        const mm = travel < 1 ? travel.toFixed(1) : String(Math.round(travel));
        bits.push(result.droppedMm >= 0 ? `dropped ${mm} mm` : `lifted ${mm} mm`);
      }
      toast.success(bits.join(' · '));
    },
    [selectedId, project.parts, project.slots, soupOfPart, partWorldPos, mode, sizes, patchProject]
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
          const look = lookFor(part);
          return {
            ...part,
            triangles,
            thumbnail: renderThumbnail(soup, look.color, look),
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

  const runEmbossTexture = useCallback(
    (partId: string, spec: PrintTextureSpec) => {
      const soup = soupOfPart(partId);
      if (!soup) {
        toast.error('That part has no mesh to texture.');
        return;
      }
      setBusy(`Embossing ${TEXTURE_LABELS[spec.kind].toLowerCase()}…`);
      setTab('modify');
      setShowInspector(true);
      setTimeout(() => {
        try {
          const result = applyPrintTexture(soup, spec);
          addVersion(
            partId,
            result.soup,
            'texture',
            `${TEXTURE_LABELS[result.kind]} · ${result.depthMm.toFixed(2)} mm deep`
          );
          toast.success(
            `Embossed ${TEXTURE_LABELS[result.kind].toLowerCase()} · ${formatCount(result.triangles)} triangles. In the STL / 3MF.`
          );
        } catch {
          toast.error('Could not emboss that texture.');
        } finally {
          setBusy(null);
        }
      }, 30);
    },
    [soupOfPart, addVersion]
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
      patchPart(partId, { thumbnail: renderThumbnail(soup, lookFor(part).color, lookFor(part)) });
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
    (
      partId: string,
      options: {
        fillHoles: boolean;
        maxHoleEdges: number;
        dropToTable?: boolean;
        fallbackSolid?: boolean;
      }
    ) => {
      const soup = soupOfPart(partId);
      if (!soup) return;

      setBusy('Repairing mesh…');
      // Yield a frame so the busy state paints before the synchronous work.
      setTimeout(() => {
        try {
          const result = autoFix(soup, {
            fillHoles: options.fillHoles,
            maxHoleEdges: options.maxHoleEdges,
            dropToTable: options.dropToTable,
          });
          let next = result.soup;
          let usedSolid = false;

          if (options.fallbackSolid && !result.report.after.watertight) {
            const solid = makeSolid(next, { resolution: 220, sealMm: 0.8 });
            if (solid.report.trianglesAfter > 0) {
              next = solid.soup;
              usedSolid = true;
              setSolidReport(solid.report);
            }
          }

          const report = usedSolid
            ? {
                ...result.report,
                after: inspect(next),
                unfilledHoles: 0,
                changed: true,
              }
            : result.report;
          setFixReport(report);

          if (!result.report.changed && !usedSolid) {
            toast.success(
              result.report.after.watertight
                ? 'Already clean — nothing to change.'
                : 'Could not close it with edge repair. Tick “rebuild as solid” or use Make solid.'
            );
            return;
          }

          addVersion(
            partId,
            next,
            usedSolid ? 'repaired + solid' : 'repaired',
            usedSolid ? 'Auto fix, then rebuilt as solid' : 'Auto fix'
          );

          if (usedSolid) {
            toast.success('Patched what we could, then rebuilt as a solid.');
          } else if (report.after.watertight) {
            toast.success('Repaired — mesh is watertight.');
          } else {
            toast.success(
              `Repaired, but ${report.unfilledHoles} opening(s) were too large to patch.`
            );
          }
        } catch {
          toast.error('Could not repair that mesh.');
        } finally {
          setBusy(null);
        }
      }, 30);
    },
    [soupOfPart, addVersion]
  );

  const runAnalyze = useCallback(
    (partId: string) => {
      const soup = soupOfPart(partId);
      if (!soup) return;
      setBusy('Analyzing…');
      setShowInspector(true);
      setTab('repair');
      setTimeout(() => {
        try {
          const report = diagnose(soup);
          setDiagnosis(report);
          if (report.watertight && !report.thinShellRisk && report.misalignedClusters === 0) {
            toast.success('Solid — ready to slice or subtract.');
          } else {
            const bits = [
              report.misalignedClusters > 0 &&
                `${report.misalignedClusters} misaligned corner group(s)`,
              report.missingFaces > 0 && `${report.missingFaces} missing face(s)`,
              report.flippedFaces + report.disturbedEdges + report.junkFaces > 0 && 'face trouble',
            ].filter(Boolean);
            toast.message(
              bits.length > 0 ? `Found ${bits.join(', ')}.` : 'See Repair for the diagnosis.'
            );
          }
        } catch {
          toast.error('Could not analyze that mesh.');
        } finally {
          setBusy(null);
        }
      }, 30);
    },
    [soupOfPart]
  );

  /**
   * Close holes, snap near-miss corners, and rebuild as a solid if it stays
   * open — so Slice and Subtract cut a volume instead of a paper-thin shell.
   */
  const runFillSolid = useCallback(
    (partId: string) => {
      const soup = soupOfPart(partId);
      if (!soup) return;

      setBusy('Filling to a solid…');
      setShowInspector(true);
      setTab('repair');
      setTimeout(() => {
        try {
          const aligned = fixMisalignment(soup, { toleranceMm: 0.2, fillHoles: true });
          const repaired = autoFix(aligned.soup, { fillHoles: true, maxHoleEdges: 200 });
          let next = repaired.soup;
          let usedSolid = false;

          if (!repaired.report.after.watertight) {
            const solid = makeSolid(next, { resolution: 220, sealMm: 0.8 });
            if (solid.report.trianglesAfter > 0) {
              next = solid.soup;
              usedSolid = true;
              setSolidReport(solid.report);
            }
          }

          const after = diagnose(next);
          setDiagnosis(after);
          setFixReport(repaired.report);

          if (!aligned.report.changed && !repaired.report.changed && !usedSolid) {
            toast.success(
              after.watertight
                ? 'Already a solid — nothing to fill.'
                : 'Could not close it. Try Make solid.'
            );
            return;
          }

          addVersion(
            partId,
            next,
            usedSolid ? 'filled + solid' : 'filled',
            usedSolid ? 'Fill, then rebuilt as solid' : 'Fill holes + snap'
          );
          toast.success(
            after.watertight && !after.thinShellRisk
              ? 'Filled — watertight. Slice and Subtract will keep volume.'
              : usedSolid
                ? 'Rebuilt as a solid.'
                : 'Filled what we could — some openings remain.'
          );
        } catch {
          toast.error('Could not fill that mesh.');
        } finally {
          setBusy(null);
        }
      }, 30);
    },
    [soupOfPart, addVersion]
  );

  /** Slot callouts for the gunsmith overlay, anchored at each mount point. */
  const callouts = useMemo<ViewportCallout[]>(() => {
    if (!assembly || !showCallouts || mode !== 'assembled') return [];

    return project.slots.flatMap((slot) => {
      if (focusId) {
        const focused = project.parts.find((part) => part.id === focusId);
        if (!focused || focused.slotId !== slot.id) return [];
      }
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
  }, [assembly, project.slots, project.parts, showCallouts, mode, focusId]);

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
      // Placed by hand, the part itself goes to the origin — not just its offset.
      if (mode === 'free') patchPart(partId, { freePos: { x: 0, y: 0, z: 0 } });
    },
    [soupOfPart, updateActiveGeometry, patchTransform, mode, patchPart]
  );

  const centerPart = useCallback(
    (partId: string) => {
      const soup = soupOfPart(partId);
      if (!soup) return;
      updateActiveGeometry(partId, recenter(soup));
      patchTransform(partId, { position: { x: 0, y: 0, z: 0 } });
      if (mode === 'free') patchPart(partId, { freePos: { x: 0, y: 0, z: 0 } });
    },
    [soupOfPart, updateActiveGeometry, patchTransform, mode, patchPart]
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

  const runFixMisalignment = useCallback(
    (partId: string, options: { toleranceMm: number; snapToGrid: boolean }) => {
      const soup = soupOfPart(partId);
      if (!soup) return;

      setBusy('Snapping misaligned corners…');
      setTimeout(() => {
        try {
          const result = fixMisalignment(soup, {
            toleranceMm: options.toleranceMm,
            snapToGrid: options.snapToGrid,
            fillHoles: true,
          });
          setMisalignReport(result.report);

          if (!result.report.changed) {
            toast.success('No corners that close to snap.');
            return;
          }

          addVersion(
            partId,
            result.soup,
            'aligned',
            `${options.toleranceMm} mm snap${options.snapToGrid ? ' + grid' : ''}`
          );
          toast.success(
            result.report.after.watertight
              ? `Snapped ${formatCount(result.report.snappedClusters)} corner group(s) — watertight.`
              : `Snapped ${formatCount(result.report.snappedClusters)} corner group(s). Some openings remain.`
          );
        } catch {
          toast.error('Could not snap that mesh.');
        } finally {
          setBusy(null);
        }
      }, 30);
    },
    [soupOfPart, addVersion]
  );

  const onPaintAt = useCallback(
    (partId: string, localPoint: [number, number, number], erase: boolean) => {
      if (!selectedId || partId !== selectedId || !paintMesh) return;
      const hits = verticesInRadius(paintMesh.positions, localPoint, paintRadiusMm);
      if (hits.length === 0) return;
      setPainted((current) => {
        const next = new Set(current);
        for (const index of hits) {
          if (erase) next.delete(index);
          else next.add(index);
        }
        return next;
      });
    },
    [selectedId, paintMesh, paintRadiusMm]
  );

  const runPaintAlign = useCallback(() => {
    if (!selectedId || !paintMesh || painted.size < 3) {
      toast.error('Paint over the broken edge first.');
      return;
    }
    setBusy('Aligning painted edge…');
    setTimeout(() => {
      try {
        const result = alignPaintedVertices(paintMesh, painted);
        if (result.moved === 0) {
          toast.success('That patch was already even.');
          return;
        }
        addVersion(selectedId, toSoup(result.mesh), 'aligned', 'Painted edge align');
        toast.success(`Evened ${result.moved} corner(s).`);
      } catch {
        toast.error('Could not align that patch.');
      } finally {
        setBusy(null);
      }
    }, 30);
  }, [selectedId, paintMesh, painted, addVersion]);

  const runPaintFill = useCallback(() => {
    if (!selectedId || !paintMesh || painted.size < 3) {
      toast.error('Paint over the hole first.');
      return;
    }
    setBusy('Filling painted hole…');
    setTimeout(() => {
      try {
        const result = fillPaintedHoles(paintMesh, painted);
        if (result.filled === 0) {
          toast.success('No painted hole to close.');
          return;
        }
        addVersion(selectedId, toSoup(result.mesh), 'filled', 'Painted hole fill');
        setPainted(new Set());
        toast.success(
          `Closed ${result.filled} hole(s), filled up to ${result.capHeight.toFixed(1)} mm.`
        );
      } catch {
        toast.error('Could not fill that hole.');
      } finally {
        setBusy(null);
      }
    }, 30);
  }, [selectedId, paintMesh, painted, addVersion]);

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

      const health = diagnose(soup);
      if (health.thinShellRisk) {
        setDiagnosis(health);
        setShowInspector(true);
        setTab('repair');
        toast.error(
          'This part is open. Analyze → Fill first, or the slice will be a paper-thin shell.'
        );
        return;
      }

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
   * Give the selected part a wall of a set thickness.
   *
   * On a closed part this hollows it or pads it; on an open surface it
   * thickens it into something printable. One of the two faces is always the
   * part's own triangles, so that side keeps its detail exactly.
   */
  const runShell = useCallback(
    (options: ShellOptions) => {
      const part = selectedPart;
      const soup = part ? soupOfPart(part.id) : undefined;
      if (!part || !soup) return;

      if (options.thickness <= 0) {
        toast.error('Give the wall a thickness above zero.');
        return;
      }

      setBusy('Building the wall…');
      setTimeout(() => {
        try {
          const result = shellSurface(soup, options);
          const mm3 = result.report.wallVolume;

          addVersion(
            part.id,
            result.soup,
            `${options.thickness} mm wall`,
            `${options.direction} · ${result.report.wasClosed ? 'hollowed' : 'thickened'}`
          );

          toast.success(
            `${options.thickness} mm wall ${options.direction} · ` +
              `${(mm3 / 1000).toFixed(1)} cm³ of material · ` +
              `${formatCount(result.report.trianglesAfter)} triangles`
          );
          for (const warning of result.report.warnings) toast.error(warning);
        } catch {
          toast.error('Could not build a wall on that part.');
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

  /**
   * Repair a chosen set of parts. One part gets the full fix (including a
   * solid rebuild if the shell stays open). Several parts get edge repair
   * only — voxelising a whole bench would freeze the tab.
   */
  const fixParts = useCallback(
    (partIds: string[], options?: { fallbackSolid?: boolean }) => {
      const ids = [...new Set(partIds)].filter((id) => {
        const part = project.parts.find((candidate) => candidate.id === id);
        return Boolean(part && geometries.has(part.activeVersionId));
      });
      if (ids.length === 0) {
        toast.error('Nothing selected to repair.');
        return;
      }
      if (ids.length === 1) {
        runAutoFix(ids[0], {
          fillHoles: true,
          maxHoleEdges: 200,
          fallbackSolid: options?.fallbackSolid ?? true,
        });
        return;
      }

      setBusy(`Repairing ${ids.length} selected parts…`);
      setTimeout(() => {
        let repaired = 0;
        let skipped = 0;
        let stillOpen = 0;

        for (const id of ids) {
          const part = project.parts.find((candidate) => candidate.id === id);
          if (!part) continue;
          const soup = geometries.get(part.activeVersionId);
          if (!soup) continue;
          try {
            const result = autoFix(soup, { fillHoles: true, maxHoleEdges: 200 });
            if (!result.report.changed) {
              skipped++;
              if (!result.report.after.watertight) stillOpen++;
              continue;
            }
            addVersion(part.id, result.soup, 'repaired', 'Auto fix (selection)');
            repaired++;
            if (!result.report.after.watertight) stillOpen++;
          } catch {
            /* keep going; one bad part must not stop the rest */
          }
        }

        setBusy(null);
        const bits = [`Fixed ${repaired} of ${ids.length}`];
        if (skipped > 0) bits.push(`${skipped} already clean`);
        toast.success(
          `${bits.join(', ')}.` +
            (stillOpen > 0 ? ` ${stillOpen} still have open or non-manifold edges.` : '')
        );
      }, 30);
    },
    [project.parts, geometries, runAutoFix, addVersion]
  );

  const fixSelection = useCallback(() => {
    fixParts(selection.map((part) => part.id));
  }, [fixParts, selection]);

  /** Repair every loaded part in one pass — 50-part projects need this. */
  const fixEveryPart = useCallback(() => {
    const n = project.parts.length;
    if (n === 0) return;
    if (
      n >= 6 &&
      !window.confirm(
        `Repair all ${n} parts? That can freeze the tab for a while.\n\nTo repair one, click the sparkles next to it in the gallery.`
      )
    ) {
      return;
    }
    fixParts(
      project.parts.map((part) => part.id),
      { fallbackSolid: false }
    );
  }, [project.parts, fixParts]);

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

  /** Every visible part, baked into world space — what you see on the table. */
  const bakedAssembly = useCallback((): { name: string; soup: Float32Array; color: string }[] => {
    const baked: { name: string; soup: Float32Array; color: string }[] = [];

    for (const part of project.parts) {
      const soup = geometries.get(part.activeVersionId);
      if (!soup || part.visible === false) continue;

      baked.push({
        name: part.name,
        color: lookFor(part).color,
        soup: bakeTransform(soup, {
          ...part.transform,
          position: partWorldPos(part),
        }),
      });
    }

    return baked;
  }, [project.parts, geometries, partWorldPos]);

  /** Bounding box of the selected part, for centring a cut or a bore. */
  const selectedBounds = useCallback(() => {
    if (!selectedPart) return null;
    const soup = soupOfPart(selectedPart.id);
    return soup ? computeBounds(soup) : null;
  }, [selectedPart, soupOfPart]);

  const exportCombined = useCallback(() => {
    const baked = bakedAssembly();
    if (baked.length === 0) {
      toast.error('Nothing on the table to export.');
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

  const exportColor3mf = useCallback(() => {
    const baked = bakedAssembly();
    if (baked.length === 0) {
      toast.error('Nothing on the table to export.');
      return;
    }
    download(
      exportColored3mf(
        baked.map((entry) => ({ name: entry.name, soup: entry.soup, color: entry.color })),
        project.name
      ),
      `${project.name.replace(/\s+/g, '_')}_colour.3mf`
    );
    toast.success(
      `Exported ${baked.length} part(s) as a colour 3MF — slicers keep Gold / Chrome / steel.`
    );
  }, [bakedAssembly, project.name]);

  const mergeAndClean = useCallback(() => {
    const baked = bakedAssembly();
    if (baked.length === 0) {
      toast.error('Nothing on the table to export.');
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
   * Fuse the parts on the table (or the current multi-selection) into one
   * watertight solid, optionally with a pipe bore straight through. The result
   * lands on the bench so you can keep working — Export if you want a file.
   */
  const weldAssembly = useCallback(
    (options: { resolution: number; sealMm: number; bore: CylinderCut | null }) => {
      const pool = (selection.length >= 2 ? selection : project.parts).filter(
        (part) => part.visible !== false && geometries.get(part.activeVersionId)
      );
      if (pool.length === 0) {
        toast.error('Add parts to the table first.');
        return;
      }

      const pieces: Float32Array[] = [];
      for (const part of pool) {
        const soup = geometries.get(part.activeVersionId);
        if (!soup) continue;
        pieces.push(bakeTransform(soup, { ...part.transform, position: partWorldPos(part) }));
      }
      if (pieces.length === 0) {
        toast.error('Those parts have no mesh yet.');
        return;
      }

      const boreLabel = options.bore ? ` · ⌀${options.bore.diameter} mm bore` : '';
      setBusy(
        pieces.length === 1
          ? `Rebuilding solid${boreLabel}…`
          : `Welding ${pieces.length} parts${boreLabel}…`
      );
      setTimeout(() => {
        try {
          let total = 0;
          for (const soup of pieces) total += soup.length;
          const merged = new Float32Array(total);
          let offset = 0;
          for (const soup of pieces) {
            merged.set(soup, offset);
            offset += soup.length;
          }

          const result = makeSolid(merged, {
            resolution: options.resolution,
            sealMm: options.sealMm,
            cuts: options.bore ? [options.bore] : [],
          });
          if (result.soup.length === 0) {
            toast.error('Nothing solid came out — try a larger seal distance.');
            return;
          }
          setSolidReport(result.report);

          const memberIds = new Set(pool.map((part) => part.id));
          const id = newPartId();
          const versionId = newVersionId();
          const color = nextColor(project);
          const triangles = Math.floor(result.soup.length / 9);
          const name = options.bore
            ? `Body ⌀${options.bore.diameter}`
            : pool.length === 1
              ? `${pool[0].name} solid`
              : `Welded (${pool.length})`;

          setGeometries((current) => new Map(current).set(versionId, result.soup));
          void saveGeometry(versionId, result.soup);

          patchProject((current) => ({
            ...current,
            slots: current.slots.map((slot) =>
              slot.activePartId && memberIds.has(slot.activePartId)
                ? { ...slot, activePartId: id }
                : slot
            ),
            parts: [
              ...current.parts.filter((part) => !memberIds.has(part.id)),
              {
                id,
                name,
                fileName: '',
                slotId: pool[0].slotId,
                color,
                visible: true,
                transform: {
                  position: { x: 0, y: 0, z: 0 },
                  rotation: { x: 0, y: 0, z: 0 },
                  scale: { x: 1, y: 1, z: 1 },
                },
                triangles,
                materialId: pool[0].materialId,
                notes: pool.map((part) => part.name).join('\n'),
                versions: [
                  {
                    id: versionId,
                    label: options.bore ? 'v1 pipe-through' : 'v1 welded',
                    note: pool.map((part) => part.name).join(', '),
                    triangles,
                    createdAt: Date.now(),
                  },
                ],
                activeVersionId: versionId,
                thumbnail: renderThumbnail(result.soup, color),
                addedAt: Date.now(),
              },
            ],
          }));

          for (const member of pool) {
            for (const version of member.versions) void deleteGeometry(version.id);
          }

          setMarked(new Set());
          setSelectedId(id);
          setFrameToken((token) => token + 1);
          toast.success(
            `${name} · ${formatCount(result.report.trianglesAfter)} triangles` +
              (options.bore ? ` · ⌀${options.bore.diameter} mm through` : '')
          );
        } catch {
          toast.error('Could not weld those parts.');
        } finally {
          setBusy(null);
        }
      }, 30);
    },
    [selection, project, geometries, partWorldPos, patchProject]
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
    (spec: HardwareSpec, transform?: Transform) => {
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
            transform: transform ?? {
              position: { x: 0, y: 0, z: 0 },
              rotation: { x: 0, y: 0, z: 0 },
              scale: { x: 1, y: 1, z: 1 },
            },
            // Placed by hand: the same spot on the plain bench and in Free.
            ...(transform ? { freePos: { ...transform.position } } : {}),
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

  /**
   * Put a pipe straight through the bodies — the selection, or everything
   * visible — along their longest side, centred, 40 mm proud of both ends.
   * From then on it is ordinary hardware: move it, change its numbers, and One
   * piece bores wherever it ends up.
   */
  const addPipeThrough = useCallback(
    (diameter: number, wall: number) => {
      const isBody = (part: Part) =>
        part.visible && !part.hardware && geometries.has(part.activeVersionId);
      // The pipe just added stays selected, so the selection often holds no body
      // at all — then every body on the table is what the pipe goes through.
      const picked = selection.filter(isBody);
      const bodies = picked.length > 0 ? picked : project.parts.filter(isBody);

      // Measured in the layout the pipe will be seen in. Lanes ignore a part's
      // own position, so a bench in Scattered is switched to Assembled below.
      const layout = new Map(
        (!assembly
          ? benchPlacement(project)
          : mode === 'free'
            ? freePlacement(project)
            : assembledPlacement(project)
        ).map((entry) => [entry.partId, entry.position])
      );
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      for (const part of bodies) {
        const at = layout.get(part.id);
        // A spare variant is not drawn in Assembled, so it must not stretch the box.
        if (!at) continue;
        const local = computeBounds(geometries.get(part.activeVersionId) as Float32Array);
        // The matrix the viewport draws with, so a part rotated on two axes measures true.
        const e = transformMatrix({ ...part.transform, position: at }).elements;
        for (const x of [local.min[0], local.max[0]]) {
          for (const y of [local.min[1], local.max[1]]) {
            for (const z of [local.min[2], local.max[2]]) {
              const corner = [
                e[0] * x + e[4] * y + e[8] * z + e[12],
                e[1] * x + e[5] * y + e[9] * z + e[13],
                e[2] * x + e[6] * y + e[10] * z + e[14],
              ];
              for (let axis = 0; axis < 3; axis++) {
                min[axis] = Math.min(min[axis], corner[axis]);
                max[axis] = Math.max(max[axis], corner[axis]);
              }
            }
          }
        }
      }
      if (!Number.isFinite(min[0])) {
        addHardware({ kind: 'pipe', length: 300, diameter, wall });
        return;
      }

      const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
      const axis = size[0] >= size[1] && size[0] >= size[2] ? 0 : size[1] >= size[2] ? 1 : 2;
      // Stock is built along +X; turn it onto the long side.
      const rotation = [
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 90 },
        { x: 0, y: -90, z: 0 },
      ][axis];
      if (assembly && mode === 'scattered') setMode('assembled');
      addHardware(
        { kind: 'pipe', length: Math.round(size[axis] + 80), diameter, wall },
        {
          position: {
            x: (min[0] + max[0]) / 2,
            y: (min[1] + max[1]) / 2,
            z: (min[2] + max[2]) / 2,
          },
          rotation,
          scale: { x: 1, y: 1, z: 1 },
        }
      );
      toast.info(
        'The pipe runs through the middle. Double-tap it to move it, or type its position under Modify — then One piece.'
      );
    },
    [selection, project, geometries, assembly, mode, addHardware]
  );

  /** Switch the blaster slots on or off. Nothing on the table moves either way. */
  const toggleAssembly = useCallback(() => {
    const turningOn = !assembly;
    patchProject((current) => {
      const on = assemblyOn(current);
      const drawn = !on
        ? benchPlacement(current)
        : mode === 'free'
          ? freePlacement(current)
          : mode === 'scattered'
            ? scatterPlacement(current, sizes)
            : assembledPlacement(current);
      return setAssembly(current, !on, drawn);
    });
    setMoveModeId(null);
    if (turningOn) setMode('assembled');
    toast.success(
      turningOn
        ? 'Assembly on: parts can be fitted to blaster mounts again.'
        : 'Assembly off: a plain bench. Every part stayed where it was.'
    );
  }, [assembly, mode, sizes, patchProject]);

  /** What One piece can join: visible parts with a mesh that are not pipe or bolt stock. */
  const onePieceBodies = useMemo(
    () =>
      project.parts.filter(
        (part) => part.visible && !part.hardware && geometries.has(part.activeVersionId)
      ),
    [project.parts, geometries]
  );
  /** What it can bore with: visible stock, cut from its numbers rather than its mesh. */
  const onePiecePipes = useMemo(
    () => project.parts.filter((part) => part.visible && part.hardware),
    [project.parts]
  );
  const onePiecePreselected = useMemo(() => {
    const picked = selection
      .filter((part) => onePieceBodies.includes(part))
      .map((part) => part.id);
    return picked.length > 0 ? picked : onePieceBodies.map((part) => part.id);
  }, [selection, onePieceBodies]);

  const openOnePiece = useCallback(() => {
    setOnePieceReport(null);
    setOnePieceError(null);
    setShowOnePiece(true);
  }, []);

  const runOnePieceJob = useCallback(
    async (settings: OnePieceSettings) => {
      const bodyParts = project.parts.filter((part) => settings.bodyIds.includes(part.id));
      const pipeParts = project.parts.filter(
        (part) => settings.pipeIds.includes(part.id) && part.hardware
      );
      if (bodyParts.length === 0) {
        toast.error('Tick at least one body.');
        return;
      }

      // Everything goes to the worker in world millimetres, exactly as drawn.
      const bodies: OnePieceBody[] = [];
      for (const part of bodyParts) {
        const world: Transform = { ...part.transform, position: partWorldPos(part) };
        const members = flattenGroupMembers([part]);
        // A group still on its first version is exactly its members, and those
        // are the separate solids worth joining — not the overlapping bundle.
        const groupSoup = geometries.get(part.activeVersionId);
        let memberBodies: OnePieceBody[] | null = null;
        if (
          members.length > 1 &&
          groupSoup &&
          part.activeVersionId === part.versions[0]?.id &&
          members.every((member) => geometries.has(member.activeVersionId))
        ) {
          const inner = members.map((member) => {
            const fitted = part.group?.fitted.find((entry) => entry.partId === member.id);
            const anchor = fitted
              ? project.slots.find((slot) => slot.id === fitted.slotId)?.anchor
              : undefined;
            return {
              name: member.name,
              soup: bakeTransform(geometries.get(member.activeVersionId) as Float32Array, {
                ...member.transform,
                position: {
                  x: member.transform.position.x + (anchor?.x ?? 0),
                  y: member.transform.position.y + (anchor?.y ?? 0),
                  z: member.transform.position.z + (anchor?.z ?? 0),
                },
              }),
            };
          });
          // Members rebuild the group exactly only when it came straight from a
          // file. A group made on the bench baked its layout into the group mesh
          // but not into its members, so they are checked before being trusted.
          if (sameBounds(inner.map((entry) => entry.soup), groupSoup)) {
            memberBodies = inner.map((entry) => ({
              name: entry.name,
              soup: bakeTransform(entry.soup, world),
            }));
          }
        }
        if (memberBodies) bodies.push(...memberBodies);
        else if (groupSoup) bodies.push({ name: part.name, soup: bakeTransform(groupSoup, world) });
      }

      const pipes: OnePiecePipe[] = pipeParts.map((part) => {
        const spec = part.hardware as HardwareSpec;
        const { scale } = part.transform;
        return {
          name: part.name,
          diameter: spec.diameter * Math.max(Math.abs(scale.y), Math.abs(scale.z)),
          length: spec.length * Math.abs(scale.x),
          matrix: Array.from(
            transformMatrix({
              ...part.transform,
              position: partWorldPos(part),
              scale: { x: 1, y: 1, z: 1 },
            }).elements
          ),
        };
      });

      setOnePieceReport(null);
      setOnePieceError(null);
      setOnePieceProgress('Starting…');
      try {
        const result = await runOnePiece(
          {
            bodies,
            pipes,
            options: {
              gapMm: settings.gapMm,
              crumbMm3: settings.crumbMm3,
              seamMm: settings.seamMm,
            },
          },
          setOnePieceProgress
        );

        // Kept centred on its own origin and placed where it was built, so it
        // holds its spot in every layout.
        const soup = result.soup;
        const [cx, cy, cz] = computeBounds(soup).center;
        for (let i = 0; i + 2 < soup.length; i += 3) {
          soup[i] -= cx;
          soup[i + 1] -= cy;
          soup[i + 2] -= cz;
        }

        const id = newPartId();
        const versionId = newVersionId();
        const color = nextColor(project);
        const triangles = Math.floor(soup.length / 9);
        const name = `${bodyParts.length === 1 ? bodyParts[0].name : project.name} · one piece`;
        const hidden = new Set(settings.hideSources ? bodyParts.map((part) => part.id) : []);
        const centre = { x: cx, y: cy, z: cz };

        setGeometries((current) => new Map(current).set(versionId, soup));
        void saveGeometry(versionId, soup);
        patchProject((current) => ({
          ...current,
          parts: [
            ...current.parts.map((part) =>
              hidden.has(part.id) ? { ...part, visible: false } : part
            ),
            {
              id,
              name,
              fileName: '',
              slotId: '',
              color,
              visible: true,
              transform: {
                position: { ...centre },
                rotation: { x: 0, y: 0, z: 0 },
                scale: { x: 1, y: 1, z: 1 },
              },
              freePos: { ...centre },
              triangles,
              materialId: bodyParts[0].materialId,
              notes: [
                `Joined: ${bodyParts.map((part) => part.name).join(', ')}`,
                pipeParts.length > 0
                  ? `Bored for: ${pipeParts.map((part) => part.name).join(', ')} (+${settings.gapMm} mm fit gap)`
                  : 'No pipe bores',
              ].join('\n'),
              versions: [
                {
                  id: versionId,
                  label: 'v1 one piece',
                  note: `${result.report.pieces} piece(s) · ${pipeParts.length} bore(s)`,
                  triangles,
                  createdAt: Date.now(),
                },
              ],
              activeVersionId: versionId,
              thumbnail: renderThumbnail(soup, color),
              addedAt: Date.now(),
            },
          ],
        }));

        setMarked(new Set());
        setSelectedId(id);
        setOnePieceResultId(id);
        setOnePieceReport(result.report);
        setFrameToken((token) => token + 1);
      } catch (error) {
        setOnePieceError(error instanceof Error ? error.message : 'One piece failed.');
      } finally {
        setOnePieceProgress(null);
      }
    },
    [project, geometries, partWorldPos, patchProject]
  );

  const downloadOnePiece = useCallback(() => {
    const part = project.parts.find((candidate) => candidate.id === onePieceResultId);
    const soup = part ? geometries.get(part.activeVersionId) : undefined;
    if (!part || !soup) {
      toast.error('That piece is no longer on the bench.');
      return;
    }
    // Written as it sits on the table, so the file matches the screen.
    const baked = bakeTransform(soup, { ...part.transform, position: partWorldPos(part) });
    download(
      new Blob([exportBinaryStl([baked], part.name)], { type: 'model/stl' }),
      `${part.name.replace(/[^\w.-]+/g, '_')}.stl`
    );
  }, [project.parts, onePieceResultId, geometries, partWorldPos]);

  const onePieceMass = useMemo(() => {
    if (!onePieceReport) return null;
    const part = project.parts.find((candidate) => candidate.id === onePieceResultId);
    const density = materialById(part?.materialId ?? project.materialId).density;
    return formatMass(massGrams(onePieceReport.volume, density));
  }, [onePieceReport, onePieceResultId, project.parts, project.materialId]);

  /** Drop in a primitive shape (box / cylinder / sphere / cone) as a part. */
  const addPrimitive = useCallback(
    (soup: Float32Array, name: string) => {
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
            name,
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
            materialId: project.materialId,
            notes: '',
            versions: [
              {
                id: versionId,
                label: 'v1 primitive',
                note: name,
                triangles: Math.floor(soup.length / 9),
                createdAt: Date.now(),
              },
            ],
            activeVersionId: versionId,
            thumbnail: renderThumbnail(soup, color),
            addedAt: Date.now(),
          },
        ],
      }));

      setSelectedId(id);
      setFrameToken((token) => token + 1);
      toast.success(`Added ${name}.`);
    },
    [project, patchProject]
  );

  /** Boolean-subtract another part from the selected one, as a new version. */
  const subtractInto = useCallback(
    (targetId: string, toolId: string) => {
      const target = project.parts.find((part) => part.id === targetId);
      const tool = project.parts.find((part) => part.id === toolId);
      if (!target || !tool) return;
      const soupA = soupOfPart(targetId);
      const soupB = soupOfPart(toolId);
      if (!soupA || !soupB) return;

      const healthA = diagnose(soupA);
      if (healthA.thinShellRisk) {
        setDiagnosis(healthA);
        setSelectedId(targetId);
        setShowInspector(true);
        setTab('repair');
        toast.error(
          `${target.name} is open. Analyze → Fill first, or Subtract will leave a paper-thin shell.`
        );
        return;
      }

      const boxA = snapNeighbors.find((entry) => entry.id === targetId)?.box;
      const boxB = snapNeighbors.find((entry) => entry.id === toolId)?.box;
      if (boxA && boxB && !aabbOverlap(boxA, boxB, 0.5)) {
        toast.error('Those parts do not overlap — move them into each other first.');
        return;
      }

      setShowSubtract(false);
      setBusy(`Subtracting ${tool.name}…`);
      // Let the busy state paint before the synchronous voxel work.
      setTimeout(() => {
        try {
          const fullA: Transform = {
            position: partWorldPos(target),
            rotation: target.transform.rotation,
            scale: target.transform.scale,
          };
          const fullB: Transform = {
            position: partWorldPos(tool),
            rotation: tool.transform.rotation,
            scale: tool.transform.scale,
          };

          const result = subtractMesh(bakeTransform(soupA, fullA), bakeTransform(soupB, fullB), {
            resolution: subtractSpec.resolution,
            sealMm: 0.4,
            clearanceMm: subtractSpec.clearanceMm,
          });
          if (result.report.missed || result.soup.length === 0) {
            toast.error('Nothing left after the cut — do the two parts actually overlap?');
            return;
          }
          // The cut happened in world space; bring it back into the target's own
          // frame so the part keeps its slot placement and transform.
          const local = applyMatrix(result.soup, transformMatrix(fullA).invert());
          addVersion(targetId, local, 'subtract', `− ${tool.name}`);
          setSelectedId(targetId);
          if (subtractSpec.removeTool) removePart(toolId);
          toast.success(
            `Cut ${tool.name} out of ${target.name} · ${formatCount(result.report.trianglesAfter)} triangles`
          );
        } catch {
          toast.error('Subtract failed — try a lower resolution or simpler parts.');
        } finally {
          setBusy(null);
        }
      }, 20);
    },
    [project, soupOfPart, addVersion, partWorldPos, snapNeighbors, subtractSpec, removePart]
  );

  /**
   * Add a bent length of pipe as a part of its own.
   *
   * It is not stored as hardware: the hardware editor only knows straight
   * stock, and offering it a bend it cannot represent would silently
   * straighten the part on the next edit.
   */
  const addBend = useCallback(
    (spec: BendSpec) => {
      const soup = bendMesh(spec);
      const id = newPartId();
      const versionId = newVersionId();
      const color = nextColor(project);
      const triangles = Math.floor(soup.length / 9);
      const report = bendReport(spec);

      setGeometries((current) => new Map(current).set(versionId, soup));
      void saveGeometry(versionId, soup);

      patchProject((current) => ({
        ...current,
        parts: [
          ...current.parts,
          {
            id,
            name: bendLabel(spec),
            fileName: '',
            slotId: '',
            color,
            visible: true,
            transform: {
              position: { x: 0, y: 0, z: 0 },
              rotation: { x: 0, y: 0, z: 0 },
              scale: { x: 1, y: 1, z: 1 },
            },
            triangles,
            materialId: 'steel',
            notes: [
              `Cut ${spec.length.toFixed(1)} mm of stock.`,
              `Bend ${spec.angle}° at R${spec.radius} starting ${report.legIn.toFixed(1)} mm from the end.`,
              `Arc takes ${report.arcLength.toFixed(1)} mm; ${report.legOut.toFixed(1)} mm left after it.`,
              `Finished span ${report.span.toFixed(1)} mm.`,
            ].join('\n'),
            versions: [
              {
                id: versionId,
                label: 'v1 generated',
                note: bendLabel(spec),
                triangles,
                createdAt: Date.now(),
              },
            ],
            activeVersionId: versionId,
            thumbnail: renderThumbnail(soup, color),
            addedAt: Date.now(),
          },
        ],
      }));

      setSelectedId(id);
      setFrameToken((token) => token + 1);
      toast.success(`Added ${bendLabel(spec)}.`);
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

  /** ⌘C: the selected part plus everything marked alongside it. */
  const copySelected = useCallback(() => {
    const copied = selection
      .map((part) => ({ part, soup: geometries.get(part.activeVersionId) ?? null }))
      .filter((entry): entry is { part: Part; soup: Float32Array } => Boolean(entry.soup));
    if (copied.length === 0) return;
    setClipboard(copied);
    toast.success(copied.length === 1 ? `Copied ${copied[0].part.name}.` : `Copied ${copied.length} parts.`);
  }, [selection, geometries]);

  /**
   * Paste the copied parts as new ones. They share nothing with the originals —
   * each mesh is written under a fresh version so editing one never touches
   * the other — and they land 20 mm to the side, so a paste is visible instead
   * of hiding exactly on top of what was copied.
   */
  const pasteClipboard = useCallback(() => {
    if (clipboard.length === 0) return;

    const fresh = clipboard.map(({ part: source, soup }) => {
      const id = newPartId();
      const versionId = newVersionId();
      const copy: Part = {
        ...source,
        id,
        name: `${source.name} copy`,
        transform: {
          position: { ...source.transform.position, x: source.transform.position.x + 20 },
          rotation: { ...source.transform.rotation },
          scale: { ...source.transform.scale },
        },
        freePos: source.freePos ? { ...source.freePos, x: source.freePos.x + 20 } : undefined,
        versions: [
          {
            id: versionId,
            label: 'v1 pasted',
            note: `Pasted from ${source.name}`,
            triangles: Math.floor(soup.length / 9),
            createdAt: Date.now(),
          },
        ],
        activeVersionId: versionId,
        addedAt: Date.now(),
      };
      return { copy, versionId, soup };
    });

    setGeometries((current) => {
      const next = new Map(current);
      for (const { versionId, soup } of fresh) next.set(versionId, soup);
      return next;
    });
    for (const { versionId, soup } of fresh) void saveGeometry(versionId, soup);

    patchProject((current) => ({
      ...current,
      parts: [...current.parts, ...fresh.map((entry) => entry.copy)],
    }));

    setSelectedId(fresh[0].copy.id);
    setMarked(new Set(fresh.slice(1).map((entry) => entry.copy.id)));
    toast.success(
      fresh.length === 1 ? `Pasted ${fresh[0].copy.name}.` : `Pasted ${fresh.length} parts.`
    );
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

      if (meta && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (meta && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
        return;
      }
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
      if (meta && event.key.toLowerCase() === 'g') {
        event.preventDefault();
        if (event.shiftKey) {
          if (selectedId) ungroupPart(selectedId);
        } else {
          groupSelection();
        }
        return;
      }
      if (meta) return;

      if (moveModeId) {
        const fine = event.shiftKey;
        const coarse = event.altKey;
        const step =
          manip === 'move'
            ? coarse
              ? 5
              : fine
                ? 0.1
                : moveStep
            : coarse
              ? 15
              : fine
                ? 0.1
                : rotateStep;
        const apply = (axis: 'x' | 'y' | 'z', dir: 1 | -1) => {
          event.preventDefault();
          if (manip === 'move') {
            nudgePart(moveModeId, {
              x: axis === 'x' ? dir * step : 0,
              y: axis === 'y' ? dir * step : 0,
              z: axis === 'z' ? dir * step : 0,
            });
          } else {
            spinPart(moveModeId, {
              x: axis === 'x' ? dir * step : 0,
              y: axis === 'y' ? dir * step : 0,
              z: axis === 'z' ? dir * step : 0,
            });
          }
        };
        switch (event.key) {
          case 'ArrowLeft':
            apply('x', -1);
            return;
          case 'ArrowRight':
            apply('x', 1);
            return;
          case 'ArrowUp':
            apply('y', 1);
            return;
          case 'ArrowDown':
            apply('y', -1);
            return;
          case 'PageUp':
            apply('z', 1);
            return;
          case 'PageDown':
            apply('z', -1);
            return;
          default:
            break;
        }
      }

      switch (event.key) {
        case 'Delete':
        case 'Backspace':
          if (selectedId) removePart(selectedId);
          break;
        case 'Escape':
          if (painting) {
            setPainting(false);
            break;
          }
          if (focusId) {
            setFocusId(null);
            setFrameToken((token) => token + 1);
            break;
          }
          setMoveModeId(null);
          setSelectedId(null);
          setMeasuring(false);
          break;
        case 'f':
          setFrameToken((token) => token + 1);
          break;
        case 'h':
        case 'H':
          event.preventDefault();
          if (event.shiftKey) showAllParts();
          else if (selectedId) togglePartVisible(selectedId);
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
          if (assemblyOn(projectRef.current)) {
            setMode((current) => (current === 'assembled' ? 'scattered' : 'assembled'));
          }
          break;
        case '/':
          event.preventDefault();
          toggleFocus();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    copySelected,
    pasteClipboard,
    duplicatePart,
    removePart,
    selectedId,
    undo,
    redo,
    groupSelection,
    ungroupPart,
    moveModeId,
    manip,
    moveStep,
    rotateStep,
    nudgePart,
    spinPart,
    togglePartVisible,
    showAllParts,
    painting,
    focusId,
    toggleFocus,
  ]);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setDragging(false);
      void importFiles(Array.from(event.dataTransfer.files));
    },
    [importFiles]
  );

  return (
    <div className="flex h-dvh max-h-dvh flex-col gap-2 bg-slate-200 p-2 text-slate-800">
      <input
        ref={fileInputRef}
        type="file"
        accept=".stl,.3mf"
        multiple
        className="hidden"
        onChange={(event) => {
          void importFiles(Array.from(event.target.files ?? []));
          event.target.value = '';
        }}
      />

      <div className={`${PANEL} relative z-40 flex flex-col gap-1 px-2 py-1.5`}>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Boxes className="h-5 w-5 shrink-0 text-emerald-600" />
          <input
            value={project.name}
            onChange={(event) =>
              patchProject((current) => ({ ...current, name: event.target.value }), {
                history: false,
              })
            }
            className="min-w-0 max-w-[12rem] flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm font-bold text-slate-900 outline-none hover:border-slate-300 focus:border-emerald-500 sm:max-w-[16rem]"
            aria-label="Project name"
          />
          <button
            type="button"
            onClick={() => setShowCloud(true)}
            title={cloudNote}
            className={`flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[0.6rem] font-extrabold uppercase tracking-wide ${
              cloudAttached
                ? 'border-emerald-400 bg-emerald-50 text-emerald-800'
                : 'border-slate-300 text-slate-500 hover:bg-slate-100'
            }`}
          >
            <Cloud className="h-3 w-3" />
            <span className="hidden sm:inline">Cloud</span>
          </button>
        </div>

        <MenuBar>
          <Menu label={`Projects · ${projectList.length}`} width={300}>
            <MenuItem
              onClick={() => createProjectFolder()}
              icon={FolderPlus}
              tone="primary"
              hint="Empty at first — saved to Supabase once it has parts"
            >
              New project
            </MenuItem>
            <MenuSeparator />
            <MenuLabel>Jump to</MenuLabel>
            <MenuScroll>
              {projectList.length === 0 && (
                <div className="px-3 py-1.5 text-[0.7rem] text-slate-500">
                  Nothing saved yet — import a part and it lands on Supabase by itself.
                </div>
              )}
              {projectList.map((entry) => (
                <MenuCheckItem
                  key={entry.id}
                  checked={entry.id === project.id}
                  onClick={() => void openProject(entry.id)}
                  shortcut={sinceLabel(entry.updatedAt)}
                >
                  {entry.name} · {entry.parts}
                  {entry.cloud ? (
                    <Cloud className="ml-1 inline h-3 w-3 text-emerald-600" aria-label="On Supabase" />
                  ) : (
                    <span className="ml-1 text-[0.6rem] font-semibold text-amber-600">this computer only</span>
                  )}
                </MenuCheckItem>
              ))}
            </MenuScroll>
            <MenuSeparator />
            <div className="px-3 py-1.5 text-[0.65rem] text-slate-500">{cloudNote}</div>
          </Menu>

          <Menu label="Project">
            <MenuItem onClick={() => createProjectFolder()} icon={FolderPlus}>
              New project
            </MenuItem>
            <MenuItem
              onClick={() => fileInputRef.current?.click()}
              icon={Upload}
              shortcut="drop"
              hint="Or drag STL and 3MF files onto the table"
            >
              Import STL · 3MF…
            </MenuItem>
            <MenuItem
              onClick={() => setShowDrive(true)}
              icon={HardDrive}
              hint="Preview STL and 3MF that Drive itself cannot show — Top model 3"
            >
              Open from Google Drive…
            </MenuItem>
            <MenuItem
              onClick={() => setWorkspace('kits')}
              hint="Pictures first — pick parts, then open only those in 3dwork"
            >
              2D kits from Drive
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
            <MenuLabel>Supabase</MenuLabel>
            <MenuItem
              onClick={() => setShowCloud(true)}
              icon={Cloud}
              hint="Same build on your phone and other computers"
            >
              Open saved builds…
            </MenuItem>
            <MenuItem
              onClick={() => void pushCloud('manual')}
              icon={Cloud}
              hint={cloudNote}
            >
              Save this build to Supabase
            </MenuItem>
            <MenuSeparator />
            <MenuLabel>GitHub (kjarni code)</MenuLabel>
            <MenuItem
              onClick={() => (github.connected ? void pushGithub('manual') : setShowGithub(true))}
              icon={Github}
              hint={
                github.connected
                  ? `Optional backup to ${github.repo}`
                  : 'kjarni repo is the website — parts live in Supabase'
              }
            >
              {github.connected ? 'Save to GitHub now' : 'Connect GitHub…'}
            </MenuItem>
            {github.connected && github.mode === 'user' && (
              <MenuItem onClick={() => void disconnectGithub()} hint="Stops using your token on this browser">
                Disconnect GitHub
              </MenuItem>
            )}
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
            <MenuLabel>Primitives</MenuLabel>
            <MenuItem onClick={() => addPrimitive(boxSoup(), 'Box 30 mm')} icon={Boxes} hint="Cut pockets and flats">
              Box
            </MenuItem>
            <MenuItem
              onClick={() => addPrimitive(cylinderSoup(), 'Cylinder ⌀24 × 40')}
              icon={Cylinder}
              hint="Cut round holes"
            >
              Cylinder
            </MenuItem>
            <MenuItem onClick={() => addPrimitive(sphereSoup(), 'Sphere ⌀30')} icon={CircleDot}>
              Sphere
            </MenuItem>
            <MenuItem onClick={() => addPrimitive(coneSoup(), 'Cone ⌀30 × 40')} icon={CircleDot}>
              Cone
            </MenuItem>
            <MenuSeparator />
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
            <MenuLabel>Bent stock</MenuLabel>
            <MenuItem onClick={() => setShowBend(true)} icon={Spline} hint="Straight-arc-straight, on a die radius">
              Bend a pipe…
            </MenuItem>
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
            <MenuItem onClick={undo} disabled={!canUndo} icon={Undo2} shortcut="⌘Z">
              Undo
            </MenuItem>
            <MenuItem onClick={redo} disabled={!canRedo} icon={Redo2} shortcut="⌘⇧Z">
              Redo
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              onClick={() => selectedId && duplicatePart(selectedId)}
              disabled={!selectedId}
              shortcut="⌘D"
            >
              Duplicate as variant
            </MenuItem>
            <MenuItem
              onClick={() => {
                if (!selectedId) {
                  toast.error('Select a part first.');
                  return;
                }
                const part = project.parts.find((candidate) => candidate.id === selectedId);
                runEmbossTexture(selectedId, textureForFinish(part?.finishId));
              }}
              disabled={!selectedId || Boolean(busy)}
              hint="Raises the real surface so the grain is in the STL, not a picture on it"
            >
              Emboss printable texture
            </MenuItem>
            <MenuItem onClick={copySelected} disabled={selection.length === 0} shortcut="⌘C">
              Copy{selection.length > 1 ? ` ${selection.length} parts` : ''}
            </MenuItem>
            <MenuItem onClick={pasteClipboard} disabled={clipboard.length === 0} shortcut="⌘V">
              Paste{clipboard.length > 1 ? ` ${clipboard.length} parts` : ''}
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              onClick={() => selectedId && togglePartVisible(selectedId)}
              disabled={!selectedId}
              icon={selectedPart?.visible === false ? Eye : EyeOff}
              shortcut="H"
              hint={
                selectedPart?.visible === false
                  ? 'Brings it back on the table'
                  : 'Stays in the gallery so you can switch it back on'
              }
            >
              {selectedPart?.visible === false ? 'Show on table' : 'Hide from table'}
            </MenuItem>
            <MenuItem
              onClick={showAllParts}
              disabled={project.parts.every((part) => part.visible)}
              icon={Eye}
              shortcut="⇧H"
            >
              Show all parts
            </MenuItem>
            <MenuItem
              onClick={() => selectedId && isolatePart(selectedId)}
              disabled={!selectedId || project.parts.length < 2}
              hint="Hides every other part. Same as View → Focus. Uncheck Focus to bring them back."
            >
              {focusId && selectedId === focusId ? 'Exit focus' : 'Focus this part'}
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
              onClick={() => selectedId && runAnalyze(selectedId)}
              disabled={!selectedId || Boolean(busy)}
              icon={ScanSearch}
              hint="Misalignment, missing faces, face trouble"
            >
              Analyze this part
            </MenuItem>
            <MenuItem
              onClick={() => selectedId && runFillSolid(selectedId)}
              disabled={!selectedId || Boolean(busy)}
              hint="Close holes and make a solid volume — needed before Slice / Subtract"
            >
              Fill to solid
            </MenuItem>
            <MenuItem
              onClick={() => selectedId && fixParts([selectedId])}
              disabled={!selectedId || Boolean(busy)}
              icon={Sparkles}
              hint="This part only — not the rest of the bench"
            >
              Fix this part
            </MenuItem>
            {selection.length > 1 && (
              <MenuItem
                onClick={fixSelection}
                disabled={Boolean(busy)}
                hint="Only the parts you have marked, not the whole bench"
              >
                Fix {selection.length} selected parts
              </MenuItem>
            )}
            <MenuItem
              onClick={fixEveryPart}
              disabled={Boolean(busy) || project.parts.length === 0}
              hint="Every loaded part. Heavy on a full bench — pick one in the gallery instead."
            >
              Fix all parts
            </MenuItem>
            <MenuItem
              onClick={() =>
                selectedId && runFixMisalignment(selectedId, { toleranceMm: 0.2, snapToGrid: false })
              }
              disabled={!selectedId || Boolean(busy)}
              hint="Snap corners that sat a hair apart after a merge. 0.2 mm. This part only."
            >
              Fix misalignment
            </MenuItem>
            <MenuSeparator />
            <MenuLabel>Weld the body</MenuLabel>
            <MenuItem
              onClick={() =>
                weldAssembly({ resolution: 200, sealMm: 0.8, bore: null })
              }
              disabled={Boolean(busy) || tableTotals.parts === 0}
              icon={Combine}
              tone="primary"
              hint="Fuses every visible part (or the selection) into one watertight solid on the table"
            >
              Weld into one solid
            </MenuItem>
            <MenuItem
              onClick={openOnePiece}
              disabled={Boolean(busy) || onePieceBodies.length === 0}
              icon={Cylinder}
              tone="primary"
              hint="Join the bodies and bore every pipe through them — an exact cut, no voxels"
            >
              One piece with pipe bores…
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
            <MenuItem
              onClick={() => setShowShell(true)}
              disabled={!selectedId || Boolean(busy)}
              icon={Layers}
              hint="Hollow a solid, or give an open surface thickness"
            >
              Wall thickness…
            </MenuItem>
            <MenuItem
              onClick={() => setShowSubtract(true)}
              disabled={!selectedId || project.parts.length < 2 || Boolean(busy)}
              icon={Scissors}
              hint="Cut another part's shape out of this one (boolean subtract)"
            >
              ✂️ Subtract a part…
            </MenuItem>
            <MenuItem
              onClick={() => setShowRevive(true)}
              disabled={!selectedId || Boolean(busy)}
              hint="AI: reverse-engineer the old mesh into editable parametric OpenSCAD"
            >
              🤖 Revive → OpenSCAD…
            </MenuItem>
            <MenuSeparator />
            <MenuLabel>Place</MenuLabel>
            <MenuItem
              onClick={() => runSettle()}
              disabled={!selectedId || Boolean(busy)}
              icon={ArrowDownToLine}
              hint="Drop it onto the table standing upright, then you can drag it"
            >
              Settle on the floor
            </MenuItem>
            <MenuLabel>Group</MenuLabel>
            <MenuItem
              onClick={runFitTogether}
              disabled={selection.length !== 2 || Boolean(busy)}
              icon={Magnet}
              hint={
                selection.length !== 2
                  ? 'Select exactly two parts first'
                  : 'Slide the other part flush onto this one — maximise face contact before Merge'
              }
            >
              Fit together
            </MenuItem>
            <MenuItem
              onClick={mergeSelection}
              disabled={selection.length < 2 || Boolean(busy)}
              icon={Combine}
              hint={
                selection.length < 2
                  ? 'Select two or more parts first'
                  : `Fuse ${selection.length} parts into one solid`
              }
            >
              Merge selection
            </MenuItem>
            <MenuItem
              onClick={groupSelection}
              disabled={selection.length < 2 || Boolean(busy)}
              icon={Boxes}
              hint={
                selection.length < 2
                  ? 'Select two or more parts first'
                  : `${selection.length} parts selected — groups flatten into one bundle`
              }
            >
              Group selection
            </MenuItem>
            <MenuItem
              onClick={() => selectedId && ungroupPart(selectedId)}
              disabled={!selectedPart?.group || Boolean(busy)}
              hint="Puts the members back exactly as they went in"
            >
              Ungroup
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
            <MenuCheckItem
              checked={Boolean(focusId)}
              onClick={toggleFocus}
              shortcut="/"
            >
              Focus
            </MenuCheckItem>
            <MenuCheckItem checked={assembly} onClick={toggleAssembly}>
              Assembly (blaster slots)
            </MenuCheckItem>
            {assembly && (
              <MenuCheckItem checked={showCallouts} onClick={() => setShowCallouts((v) => !v)}>
                Mount-point callouts
              </MenuCheckItem>
            )}
            <MenuCheckItem
              checked={painting}
              onClick={() => {
                if (!selectedId) {
                  toast.error('Select a part first.');
                  return;
                }
                setPainting((value) => !value);
                setMeasuring(false);
                setMoveModeId(null);
              }}
            >
              Paint brush
            </MenuCheckItem>
            <MenuCheckItem
              checked={measuring}
              onClick={() => {
                setMeasuring((v) => !v);
                setPainting(false);
              }}
            >
              Ruler
            </MenuCheckItem>
            <MenuSeparator />
            <MenuLabel>Workspace</MenuLabel>
            <MenuCheckItem checked={workspace === 'kits'} onClick={() => setWorkspace('kits')}>
              2D kits
            </MenuCheckItem>
            <MenuCheckItem checked={workspace === 'bench'} onClick={() => setWorkspace('bench')}>
              3D bench
            </MenuCheckItem>
            <MenuCheckItem checked={workspace === 'sketch'} onClick={() => setWorkspace('sketch')}>
              2D sketch
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
            <MenuItem onClick={exportCombined} icon={Download} hint="Everything visible on the table">
              Combined STL
            </MenuItem>
            <MenuItem
              onClick={exportColor3mf}
              icon={Download}
              hint="Slicers keep Gold / Chrome / steel as filament colours"
            >
              Colour 3MF
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
        <div className="flex overflow-hidden rounded border border-slate-300">
          {(['kits', 'bench', 'sketch'] as Workspace[]).map((option) => (
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
              {option === 'kits' ? '2D kits' : option === 'bench' ? '3D bench' : '2D sketch'}
            </button>
          ))}
        </div>
        </div>

        {workspace === 'bench' && (
        <div className="hidden min-w-0 flex-wrap items-center gap-1 md:flex">

        <div className="flex overflow-hidden rounded border border-slate-300">
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            title={canUndo ? `Undo (${past.current.length} step(s) back) — ⌘Z` : 'Nothing to undo'}
            aria-label="Undo"
            className="min-h-11 px-3 py-1.5 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo}
            title={canRedo ? `Redo (${futureSteps.current.length} step(s) forward) — ⌘⇧Z` : 'Nothing to redo'}
            aria-label="Redo"
            className="min-h-11 border-l border-slate-300 px-3 py-1.5 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
          >
            <Redo2 className="h-4 w-4" />
          </button>
        </div>

        <div className="flex overflow-hidden rounded border border-slate-300">
          <button
            type="button"
            onClick={groupSelection}
            disabled={selection.length < 2 || Boolean(busy)}
            title="Group selection — ⌘G"
            className="min-h-11 px-2.5 text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-600 hover:bg-slate-100 disabled:text-slate-300"
          >
            <Group className="mx-auto mb-0.5 h-3.5 w-3.5" />
            Group
          </button>
          <button
            type="button"
            onClick={() => selectedId && ungroupPart(selectedId)}
            disabled={!selectedPart?.group || Boolean(busy)}
            title="Ungroup — ⌘⇧G"
            className="min-h-11 border-l border-slate-300 px-2.5 text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-600 hover:bg-slate-100 disabled:text-slate-300"
          >
            <Ungroup className="mx-auto mb-0.5 h-3.5 w-3.5" />
            Ungroup
          </button>
          <button
            type="button"
            onClick={() => runSettle()}
            disabled={!selectedId || Boolean(busy)}
            title="Drop the selected part onto the table standing upright, then drag it"
            className="min-h-11 border-l border-slate-300 px-2.5 text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-600 hover:bg-slate-100 disabled:text-slate-300"
          >
            <ArrowDownToLine className="mx-auto mb-0.5 h-3.5 w-3.5" />
            Settle
          </button>
          <button
            type="button"
            onClick={runFitTogether}
            disabled={selection.length !== 2 || Boolean(busy)}
            title={
              selection.length !== 2
                ? 'Select exactly two parts to fit together'
                : 'Slide the other part flush onto this one — maximise face contact before Merge'
            }
            className="min-h-11 border-l border-slate-300 px-2.5 text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-600 hover:bg-slate-100 disabled:text-slate-300"
          >
            <Magnet className="mx-auto mb-0.5 h-3.5 w-3.5" />
            Fit
          </button>
          <button
            type="button"
            onClick={mergeSelection}
            disabled={selection.length < 2 || Boolean(busy)}
            title="Boolean-union the selection into one solid"
            className="min-h-11 border-l border-slate-300 px-2.5 text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-600 hover:bg-slate-100 disabled:text-slate-300"
          >
            <Combine className="mx-auto mb-0.5 h-3.5 w-3.5" />
            Merge
          </button>
          <button
            type="button"
            onClick={() => setShowSubtract(true)}
            disabled={!selectedId || project.parts.length < 2 || Boolean(busy)}
            title="Cut another part out of the selected one"
            className="min-h-11 border-l border-slate-300 px-2.5 text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-600 hover:bg-slate-100 disabled:text-slate-300"
          >
            <Scissors className="mx-auto mb-0.5 h-3.5 w-3.5" />
            Subtract
          </button>
        </div>

        <div className="flex overflow-hidden rounded border border-slate-300">
          {[28, 20].map((diameter) => (
            <button
              key={diameter}
              type="button"
              onClick={() => addPipeThrough(diameter, diameter >= 25 ? 1.5 : 2)}
              disabled={Boolean(busy)}
              title={`Put a ⌀${diameter} mm pipe straight through the selected body, or everything on the table`}
              className="min-h-11 border-l border-slate-300 px-2.5 text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-600 first:border-l-0 hover:bg-slate-100 disabled:text-slate-300"
            >
              <Cylinder className="mx-auto mb-0.5 h-3.5 w-3.5" />+ ⌀{diameter}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={openOnePiece}
          disabled={Boolean(busy) || onePieceBodies.length === 0}
          title="Join the bodies into one solid and bore the pipes through — ready to print"
          className={TOOL_BTN_PRIMARY}
        >
          <Combine className="h-3.5 w-3.5" />
          One piece
        </button>

        <button
          type="button"
          onClick={() => setShowDrive(true)}
          title="Preview STL and 3MF from Google Drive — Drive itself cannot show them"
          className={TOOL_BTN}
        >
          <HardDrive className="h-3.5 w-3.5" />
          Drive
        </button>

        <button
          type="button"
          onClick={() => {
            if (!selectedId) {
              toast.error('Select a part first.');
              return;
            }
            setPainting((value) => !value);
            setMeasuring(false);
            setMoveModeId(null);
          }}
          disabled={!selectedId}
          title="Paint a broken edge or hole, then Align or Fill"
          className={`min-h-11 rounded border px-3 text-[0.65rem] font-extrabold uppercase tracking-wide ${
            painting
              ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
              : 'border-slate-300 text-slate-600 hover:bg-slate-100 disabled:text-slate-300'
          }`}
        >
          <Paintbrush className="mx-auto mb-0.5 h-3.5 w-3.5" />
          Paint
        </button>

        <button
          type="button"
          onClick={() => {
            if (!selectedId) {
              toast.error('Select a part first.');
              return;
            }
            runAnalyze(selectedId);
          }}
          disabled={!selectedId || Boolean(busy)}
          title="Find misalignment, missing faces, and face trouble"
          className="min-h-11 rounded border border-slate-300 px-3 text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-600 hover:bg-slate-100 disabled:text-slate-300"
        >
          <ScanSearch className="mx-auto mb-0.5 h-3.5 w-3.5" />
          Analyze
        </button>

        <button
          type="button"
          onClick={() => {
            if (!selectedId) {
              toast.error('Select a part first.');
              return;
            }
            runFillSolid(selectedId);
          }}
          disabled={!selectedId || Boolean(busy)}
          title="Fill holes and rebuild as a solid so Slice / Subtract keep volume"
          className="min-h-11 rounded border border-slate-300 px-3 text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-600 hover:bg-slate-100 disabled:text-slate-300"
        >
          Fill
        </button>

        <button
          type="button"
          onClick={fixSelection}
          disabled={selection.length === 0 || Boolean(busy)}
          title={
            selection.length > 1
              ? `Repair the ${selection.length} selected parts only — not the whole bench`
              : 'Fix this part only — weld cracks, fill holes, drop dust. Rebuilds as a solid if it stays open.'
          }
          className="min-h-11 rounded border border-slate-300 px-3 text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-600 hover:bg-slate-100 disabled:text-slate-300"
        >
          <Sparkles className="mx-auto mb-0.5 h-3.5 w-3.5" />
          {selection.length > 1 ? `Fix ${selection.length}` : 'Fix'}
        </button>

        <button
          type="button"
          onClick={() => selectedId && togglePartVisible(selectedId)}
          disabled={!selectedId}
          title={
            selectedPart?.visible === false
              ? 'Show on the table — H'
              : 'Hide from the table — H. Stays in the gallery.'
          }
          className={`min-h-11 rounded border px-3 text-[0.65rem] font-extrabold uppercase tracking-wide ${
            selectedPart?.visible === false
              ? 'border-amber-400 bg-amber-50 text-amber-700'
              : 'border-slate-300 text-slate-600 hover:bg-slate-100 disabled:text-slate-300'
          }`}
        >
          {selectedPart?.visible === false ? (
            <Eye className="mx-auto mb-0.5 h-3.5 w-3.5" />
          ) : (
            <EyeOff className="mx-auto mb-0.5 h-3.5 w-3.5" />
          )}
          {selectedPart?.visible === false ? 'Show' : 'Hide'}
        </button>

        <button
          type="button"
          onClick={() => setMultiSelect((value) => !value)}
          title="Tap extra parts to add them to the selection"
          className={`min-h-11 rounded border px-3 text-[0.65rem] font-extrabold uppercase tracking-wide ${
            multiSelect
              ? 'border-sky-500 bg-sky-50 text-sky-700'
              : 'border-slate-300 text-slate-600 hover:bg-slate-100'
          }`}
        >
          Multi
        </button>

          <button
            type="button"
            onClick={toggleAssembly}
            aria-pressed={assembly}
            title={
              assembly
                ? 'Blaster slots are on. Turn them off for a plain bench — every part stays exactly where it is.'
                : 'Plain bench. Turn on to fit parts to blaster mount points (body, barrel, grip…).'
            }
            className={`min-h-11 rounded border px-3 text-[0.65rem] font-extrabold uppercase tracking-wide ${
              assembly
                ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                : 'border-slate-300 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Boxes className="mx-auto mb-0.5 h-3.5 w-3.5" />
            Assembly {assembly ? 'on' : 'off'}
          </button>

          {assembly && (
          <div className="flex overflow-hidden rounded border border-slate-300">
            {(['assembled', 'scattered', 'free'] as Mode[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => (option === 'free' ? goFree() : setMode(option))}
                title={option === 'free' ? 'Place every part by hand' : 'Toggle with A'}
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

        <div className="ml-auto hidden items-center gap-3 pr-1 font-mono text-[0.65rem] text-slate-500 lg:flex">
          <span>
            <span className={LABEL}>parts </span>
            {formatCount(tableTotals.parts)}
          </span>
          {assembly && (
            <span>
              <span className={LABEL}>fitted </span>
              {fittedCount}/{project.slots.length}
            </span>
          )}
          <span>
            <span className={LABEL}>mass </span>
            {formatMass(tableTotals.mass)}
          </span>
        </div>
        </div>
        )}
      </div>

      {isMobile && workspace === 'bench' && (
        <div className="flex shrink-0 gap-1 overflow-x-auto bg-white px-2 py-2">
          <button
            type="button"
            className={TOOL_BTN}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" />
            Import
          </button>
          <button type="button" className={TOOL_BTN} onClick={() => setShowDrive(true)}>
            <HardDrive className="h-3.5 w-3.5" />
            Drive
          </button>
          <button
            type="button"
            className={TOOL_BTN}
            onClick={mergeSelection}
            disabled={selection.length < 2 || Boolean(busy)}
          >
            <Combine className="h-3.5 w-3.5" />
            Merge
          </button>
          <button
            type="button"
            className={TOOL_BTN}
            onClick={() => addPipeThrough(28, 1.5)}
            disabled={Boolean(busy)}
          >
            <Cylinder className="h-3.5 w-3.5" />+ ⌀28
          </button>
          <button
            type="button"
            className={TOOL_BTN}
            onClick={() => addPipeThrough(20, 2)}
            disabled={Boolean(busy)}
          >
            <Cylinder className="h-3.5 w-3.5" />+ ⌀20
          </button>
          <button
            type="button"
            className={TOOL_BTN_PRIMARY}
            onClick={openOnePiece}
            disabled={Boolean(busy) || onePieceBodies.length === 0}
          >
            <Combine className="h-3.5 w-3.5" />
            One piece
          </button>
          <button
            type="button"
            className={TOOL_BTN}
            onClick={() => setShowSubtract(true)}
            disabled={!selectedId || project.parts.length < 2 || Boolean(busy)}
          >
            <Scissors className="h-3.5 w-3.5" />
            Subtract
          </button>
          <button
            type="button"
            className={TOOL_BTN}
            onClick={fixSelection}
            disabled={selection.length === 0 || Boolean(busy)}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Fix
          </button>
          <button
            type="button"
            className={TOOL_BTN}
            onClick={() => setMultiSelect((value) => !value)}
          >
            {multiSelect ? 'Multi on' : 'Multi'}
          </button>
        </div>
      )}


      {workspace === 'kits' ? (
        <div className="min-h-0 flex-1">
          <KitBoard
            driveOpen={showDrive}
            onConnectDrive={() => setShowDrive(true)}
            opening={Boolean(busy)}
            onOpenIn3dwork={async (files, tags) => {
              const added = await importFiles(files, { autoFit: true, tags });
              if (!added?.length) return;
              setWorkspace('bench');
              setMode('assembled');
              setShowGallery(true);
              toast.success(
                added.length === 1
                  ? 'Opened that part on the 3D bench — Fix and mesh tools are here.'
                  : 'Opened in 3dwork — parts sit on their mounts. Swap a row and open again to change one.'
              );
            }}
          />
        </div>
      ) : workspace === 'sketch' ? (
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
        className="relative grid min-h-0 flex-1 gap-2"
        style={{
          gridTemplateColumns: isMobile
            ? 'minmax(0, 1fr)'
            : [
                showGallery ? 'minmax(200px, 280px)' : null,
                'minmax(0, 1fr)',
                showInspector ? 'minmax(240px, 320px)' : null,
              ]
                .filter(Boolean)
                .join(' '),
        }}
      >
        {showGallery && !isMobile && (
        <div className="min-h-0">
          <Gallery
            project={project}
            selectedId={selectedId}
            marked={marked}
            multiSelect={multiSelect}
            onSelect={setSelectedId}
            onMark={toggleMarked}
            onFit={fitPart}
            onToggleVisible={togglePartVisible}
            onIsolate={isolatePart}
            onShowAll={showAllParts}
            onDelete={removePart}
            onFix={(partId) => fixParts([partId])}
            fixBusy={Boolean(busy)}
            onAssignSlot={(partId, slotId) => patchPart(partId, { slotId })}
            focusId={focusId}
            assembly={assembly}
          />
        </div>
        )}

        <div
          className={`${PANEL} relative z-0 min-h-0 overflow-hidden md:min-h-[420px] ${
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
            onSelect={(id) => {
              setMoveModeId((current) => (current && current === id ? current : null));
              if (id && multiSelect && selectedId && id !== selectedId) {
                setMarked((current) => {
                  const next = new Set(current);
                  next.add(selectedId);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                });
                setSelectedId(id);
                return;
              }
              selectPart(id);
            }}
            wireframe={wireframe}
            showGrid={showGrid}
            xray={xray}
            measuring={measuring}
            measurePoints={measurePoints}
            onMeasurePoint={(point) => setMeasurePoints((current) => [...current, point])}
            painting={painting}
            paintRadiusMm={paintRadiusMm}
            paintPartId={painting ? selectedId : null}
            paintLocal={paintLocal}
            onPaintAt={onPaintAt}
            callouts={showCallouts && !isMobile ? callouts : []}
            onCalloutSelect={selectSlot}
            onCalloutCycle={cycleSlot}
            frameToken={frameToken}
            dragEnabled={project.parts.length > 0}
            moveModeId={moveModeId}
            manipMode={manip}
            rotateAxis={rotateAxis}
            moveAxis={moveAxis}
            moveStep={moveStep}
            rotateStep={rotateStep}
            magnetMm={DEFAULT_MAGNET_MM}
            snapNeighbors={snapNeighbors}
            snapAnchors={snapAnchors}
            onSnapHint={setSnapHint}
            onEnterMoveMode={enterMoveMode}
            onDragMove={nudgePart}
            onDragRotate={spinPart}
          />

          {project.parts.length > 0 && moveModeId && (
            <ManipBar
              name={selectedPart?.name ?? ''}
              mode={manip}
              onMode={setManip}
              rotateAxis={rotateAxis}
              onRotateAxis={setRotateAxis}
              moveAxis={moveAxis}
              onMoveAxis={setMoveAxis}
              moveStep={moveStep}
              rotateStep={rotateStep}
              onMoveStep={setMoveStep}
              onRotateStep={setRotateStep}
              onNudge={(axis, direction) => {
                const step = manip === 'move' ? moveStep : rotateStep;
                const delta = {
                  x: axis === 'x' ? direction * step : 0,
                  y: axis === 'y' ? direction * step : 0,
                  z: axis === 'z' ? direction * step : 0,
                };
                if (manip === 'move') nudgePart(moveModeId, delta);
                else spinPart(moveModeId, delta);
              }}
              onDone={() => setMoveModeId(null)}
              snapHint={snapHint}
            />
          )}

          {project.parts.length > 0 && painting && selectedPart && (
            <PaintBar
              name={selectedPart.name}
              painted={painted.size}
              radiusMm={paintRadiusMm}
              onRadius={setPaintRadiusMm}
              onAlign={runPaintAlign}
              onFill={runPaintFill}
              onClear={() => setPainted(new Set())}
              onDone={() => {
                setPainting(false);
                setPainted(new Set());
              }}
              busy={Boolean(busy)}
            />
          )}

          {project.parts.length > 0 && focusId && !painting && !moveModeId && (
            <div className="pointer-events-none absolute bottom-3 left-1/2 max-w-[min(100%-2rem,28rem)] -translate-x-1/2 rounded-full border border-emerald-400 bg-white/95 px-3 py-2 text-center text-[0.7rem] font-medium text-emerald-800 shadow-sm">
              Focus · {project.parts.find((part) => part.id === focusId)?.name ?? 'part'} · View →
              uncheck Focus to show the rest
            </div>
          )}

          {project.parts.length > 0 && selectedId && !moveModeId && !painting && !focusId && (
            <div className="pointer-events-none absolute top-3 left-1/2 max-w-[min(100%-8rem,28rem)] -translate-x-1/2 rounded-full border border-slate-300 bg-white/90 px-3 py-2 text-center text-[0.7rem] font-medium text-slate-500 shadow-sm">
              Double-tap a part to move or rotate it · drags snap to neighbours
            </div>
          )}

          {project.parts.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
              <Upload className="h-8 w-8 text-slate-700" />
              <p className="text-sm font-bold text-slate-500">Drop STL or 3MF files here</p>
              <p className="max-w-xs text-[0.75rem] text-slate-400">
                Drop the body parts — or open Drive to preview the STL / 3MF Google will not
                show — then + ⌀28 for the pipe and One piece.
              </p>
            </div>
          )}

          <div className="absolute left-2 top-2 z-10 flex gap-1">
            <button
              type="button"
              onClick={() => {
                if (isMobile) {
                  setShowGallery((open) => {
                    const next = !open;
                    if (next) setShowInspector(false);
                    return next;
                  });
                } else {
                  setShowGallery((open) => !open);
                }
              }}
              title={showGallery ? 'Hide parts gallery' : 'Show parts gallery'}
              className="flex h-11 w-11 items-center justify-center rounded border border-slate-300 bg-white/90 text-slate-500 transition-colors hover:text-slate-900"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                if (isMobile) {
                  setShowInspector((open) => {
                    const next = !open;
                    if (next) setShowGallery(false);
                    return next;
                  });
                } else {
                  setShowInspector((open) => !open);
                }
              }}
              title={showInspector ? 'Hide inspector' : 'Show inspector'}
              className="flex h-11 w-11 items-center justify-center rounded border border-slate-300 bg-white/90 text-slate-500 transition-colors hover:text-slate-900"
            >
              <PanelRight className="h-4 w-4" />
            </button>
          </div>

          <div className="pointer-events-none absolute bottom-2 left-2 hidden flex-wrap gap-3 rounded bg-white px-2 py-1 font-mono text-[0.65rem] text-slate-500 md:flex">
            <span>
              <span className={LABEL}>on table </span>
              {formatCount(tableTotals.parts)}
            </span>
            <span>
              <span className={LABEL}>tri </span>
              {formatCount(tableTotals.triangles)}
            </span>
            <span>
              <span className={LABEL}>mass </span>
              {formatMass(tableTotals.mass)}
            </span>
            {assembly && (
              <span>
                <span className={LABEL}>fitted </span>
                {fittedCount}/{project.slots.length}
              </span>
            )}
          </div>

          {busy && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/90">
              <div className="flex items-center gap-2 rounded border border-slate-300 bg-white px-4 py-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
                {busy}
              </div>
            </div>
          )}

          {isMobile && showGallery && (
            <div className="absolute inset-x-0 bottom-0 top-[28%] z-20 flex flex-col border-t border-slate-300 bg-white shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
                <span className="text-[0.72rem] font-bold text-slate-600">Parts</span>
                <button
                  type="button"
                  className="min-h-10 rounded border border-slate-300 px-3 text-[0.7rem] font-bold text-slate-600"
                  onClick={() => setShowGallery(false)}
                >
                  Close
                </button>
              </div>
              <div className="min-h-0 flex-1">
                <Gallery
                  project={project}
                  selectedId={selectedId}
                  marked={marked}
                  multiSelect={multiSelect}
                  onSelect={setSelectedId}
                  onMark={toggleMarked}
                  onFit={fitPart}
                  onToggleVisible={togglePartVisible}
                  onIsolate={isolatePart}
                  onShowAll={showAllParts}
                  onDelete={removePart}
                  onFix={(partId) => fixParts([partId])}
                  fixBusy={Boolean(busy)}
                  onAssignSlot={(partId, slotId) => patchPart(partId, { slotId })}
                  focusId={focusId}
                  assembly={assembly}
                />
              </div>
            </div>
          )}
        </div>

        {showInspector && (
        <div
          className={
            isMobile
              ? 'absolute inset-x-0 bottom-0 top-[22%] z-30 flex min-h-0 flex-col bg-white shadow-xl'
              : 'min-h-0'
          }
        >
          {isMobile && (
            <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
              <span className="text-[0.72rem] font-bold text-slate-600">Inspector</span>
              <button
                type="button"
                className="min-h-10 rounded border border-slate-300 px-3 text-[0.7rem] font-bold text-slate-600"
                onClick={() => setShowInspector(false)}
              >
                Close
              </button>
            </div>
          )}
          <Inspector
            project={project}
            part={selectedPart}
            soup={selectedSoup}
            unit={unit}
            tab={tab}
            onTabChange={setTab}
            assembly={assembly}
            tablePosition={mode === 'free' && selectedPart ? partWorldPos(selectedPart) : null}
            onPatchTablePosition={(partId, position) => patchPart(partId, { freePos: position })}
            onPatchPart={patchPart}
            onPatchTransform={patchTransform}
            onDropToTable={dropToTable}
            onSettle={runSettle}
            onCenter={centerPart}
            onDuplicate={duplicatePart}
            onToggleVisible={togglePartVisible}
            onAutoFix={runAutoFix}
            onSimplify={runSimplify}
            onFixMisalignment={runFixMisalignment}
            onAnalyze={runAnalyze}
            onFillSolid={runFillSolid}
            diagnosis={diagnosis}
            onMakeSolid={runMakeSolid}
            solidReport={solidReport}
            onRevert={revertPart}
            onSelectVersion={selectVersion}
            onDeleteVersion={deleteVersion}
            onUpdateHardware={updateHardware}
            onEmbossTexture={runEmbossTexture}
            canRevert={Boolean(selectedPart && selectedPart.versions.length > 1)}
            fixReport={fixReport}
            simplifyReport={simplifyReport}
            misalignReport={misalignReport}
            busy={Boolean(busy)}
            measurePoints={measurePoints}
            measuring={measuring}
            onToggleMeasuring={() => {
              setMeasuring((v) => !v);
              setPainting(false);
            }}
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
              are split, and the cut face is closed flat. The part must be a solid (Analyze → Fill)
              or the slice comes out as a paper-thin shell.
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

      {showShell && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className={`${PANEL} w-full max-w-md p-4`}>
            <h2 className="mb-1 text-sm font-bold text-slate-900">Give it a wall</h2>
            <p className="mb-3 text-[0.7rem] text-slate-500">
              On a closed part this leaves a wall of the thickness you set and hollows out behind
              it. On an open surface it gives the surface thickness and walls the rim, so it comes
              out printable. Whichever face ends up outermost is the part&rsquo;s own triangles,
              unmoved.
            </p>

            <label className="mb-3 block">
              <span className={`${LABEL} mb-1 block`}>Thickness (mm)</span>
              <input
                type="number"
                step="0.1"
                min="0.1"
                className={FIELD}
                value={shellSpec.thickness}
                onChange={(event) =>
                  setShellSpec((current) => ({ ...current, thickness: Number(event.target.value) }))
                }
              />
            </label>

            <span className={`${LABEL} mb-1 block`}>Which way the material goes</span>
            <div className="mb-3 space-y-1">
              {(Object.keys(SHELL_LABELS) as ShellDirection[]).map((direction) => (
                <label
                  key={direction}
                  className={`flex cursor-pointer items-start gap-2 rounded-md border p-2 text-[0.7rem] ${
                    shellSpec.direction === direction
                      ? 'border-slate-400 bg-slate-100'
                      : 'border-slate-200'
                  }`}
                >
                  <input
                    type="radio"
                    name="shell-direction"
                    className="mt-0.5"
                    checked={shellSpec.direction === direction}
                    onChange={() => setShellSpec((current) => ({ ...current, direction }))}
                  />
                  <span className="text-slate-700">{SHELL_LABELS[direction]}</span>
                </label>
              ))}
            </div>

            <p className="mb-3 text-[0.7rem] text-slate-500">
              Where the surface curves in tighter than the thickness, the two faces cross over each
              other. Keep the wall under the smallest detail you want to survive.
            </p>

            <div className="flex justify-end gap-2">
              <button type="button" className={ACTION_GHOST} onClick={() => setShowShell(false)}>
                Cancel
              </button>
              <button
                type="button"
                className={ACTION_PRIMARY}
                onClick={() => {
                  setShowShell(false);
                  runShell(shellSpec);
                }}
              >
                Build the wall
              </button>
            </div>
          </div>
        </div>
      )}

      {showRevive && (
        <RevivePanel
          soup={selectedSoup}
          name={selectedPart?.name ?? ''}
          unit={unit}
          onClose={() => setShowRevive(false)}
        />
      )}

      {showSubtract && selectedPart && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => setShowSubtract(false)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-md flex-col rounded-lg border border-slate-300 bg-white p-4 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-sm font-bold text-slate-900">Subtract from “{selectedPart.name}”</h2>
            <p className="mb-3 mt-1 text-[0.75rem] text-slate-500">
              Pick the cutter. Overlap the two first (double-tap → move), or switch to assembled
              layout. Need a 28 mm hole through several body pieces instead? Use Pipe ⌀28 — it welds
              then bores, so the parts do not have to overlap. Clearance 0 mm is an exact voxel cut;
              0.2–0.4 mm helps mating parts slide.
            </p>
            <div className="mb-3 grid grid-cols-2 gap-2">
              <label className="block">
                <span className={`${LABEL} mb-1 block`}>Resolution</span>
                <select
                  className={FIELD}
                  value={subtractSpec.resolution}
                  onChange={(event) =>
                    setSubtractSpec((current) => ({
                      ...current,
                      resolution: Number(event.target.value),
                    }))
                  }
                >
                  <option value={120}>Draft (fast)</option>
                  <option value={220}>Standard</option>
                  <option value={320}>Fine</option>
                </select>
              </label>
              <label className="block">
                <span className={`${LABEL} mb-1 block`}>Clearance mm</span>
                <input
                  type="number"
                  className={FIELD}
                  step={0.1}
                  min={0}
                  value={subtractSpec.clearanceMm}
                  onChange={(event) =>
                    setSubtractSpec((current) => ({
                      ...current,
                      clearanceMm: Math.max(0, Number(event.target.value) || 0),
                    }))
                  }
                />
              </label>
            </div>
            <label className="mb-3 flex min-h-11 items-center gap-2 text-[0.75rem] text-slate-700">
              <input
                type="checkbox"
                checked={subtractSpec.removeTool}
                onChange={(event) =>
                  setSubtractSpec((current) => ({ ...current, removeTool: event.target.checked }))
                }
              />
              Remove the cutter after the cut
            </label>
            <div className="min-h-0 flex-1 overflow-auto">
              {project.parts.filter((part) => part.id !== selectedId).length === 0 ? (
                <p className="text-[0.8rem] text-slate-400">Add another part to cut with.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {project.parts
                    .filter((part) => part.id !== selectedId)
                    .map((part) => {
                      const boxA = snapNeighbors.find((entry) => entry.id === selectedId)?.box;
                      const boxB = snapNeighbors.find((entry) => entry.id === part.id)?.box;
                      const overlaps = Boolean(boxA && boxB && aabbOverlap(boxA, boxB, 0.5));
                      return (
                      <button
                        key={part.id}
                        type="button"
                        onClick={() => selectedId && subtractInto(selectedId, part.id)}
                        className={`flex min-h-14 items-center gap-2 rounded border p-2 text-left transition-colors ${
                          overlaps
                            ? 'border-rose-400 bg-rose-50 hover:border-rose-500'
                            : 'border-slate-300 hover:border-rose-400 hover:bg-rose-50'
                        }`}
                      >
                        <span
                          className="h-8 w-8 shrink-0 rounded bg-slate-100 bg-cover bg-center"
                          style={
                            part.thumbnail
                              ? { backgroundImage: `url(${part.thumbnail})` }
                              : { background: part.color }
                          }
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[0.75rem] font-semibold text-slate-700">
                            {part.name}
                          </span>
                          <span className="block text-[0.6rem] font-bold uppercase tracking-wide text-slate-400">
                            {overlaps ? 'overlaps' : 'no overlap'}
                          </span>
                        </span>
                      </button>
                      );
                    })}
                </div>
              )}
            </div>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                className="min-h-11 rounded border border-slate-300 px-3 py-1.5 text-[0.75rem] font-bold text-slate-600 hover:bg-slate-100"
                onClick={() => setShowSubtract(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showBend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className={`${PANEL} w-full max-w-lg p-4`}>
            <h2 className="mb-1 text-sm font-bold text-slate-900">Bend a pipe</h2>
            <p className="mb-3 text-[0.7rem] text-slate-500">
              The length is the straight stock you cut. Bending moves that material round the die
              rather than adding to it, so the arc is taken out of what is left after the first leg.
            </p>

            <div className="mb-3 grid grid-cols-3 gap-2">
              <label className="block">
                <span className={`${LABEL} mb-1 block`}>Stock length (mm)</span>
                <input
                  type="number"
                  step="1"
                  className={FIELD}
                  value={bendSpec.length}
                  onChange={(event) =>
                    setBendSpec((current) => ({ ...current, length: Number(event.target.value) }))
                  }
                />
              </label>
              <label className="block">
                <span className={`${LABEL} mb-1 block`}>Outside ⌀ (mm)</span>
                <input
                  type="number"
                  step="0.1"
                  className={FIELD}
                  value={bendSpec.diameter}
                  onChange={(event) =>
                    setBendSpec((current) => ({ ...current, diameter: Number(event.target.value) }))
                  }
                />
              </label>
              <label className="block">
                <span className={`${LABEL} mb-1 block`}>Wall (mm)</span>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  className={FIELD}
                  value={bendSpec.wall ?? 0}
                  onChange={(event) =>
                    setBendSpec((current) => ({ ...current, wall: Number(event.target.value) }))
                  }
                />
              </label>
            </div>

            <div className="mb-3 grid grid-cols-3 gap-2">
              <label className="block">
                <span className={`${LABEL} mb-1 block`}>Angle (°)</span>
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="180"
                  className={FIELD}
                  value={bendSpec.angle}
                  onChange={(event) =>
                    setBendSpec((current) => ({ ...current, angle: Number(event.target.value) }))
                  }
                />
              </label>
              <label className="block">
                <span className={`${LABEL} mb-1 block`}>Die radius (mm)</span>
                <input
                  type="number"
                  step="1"
                  min="1"
                  className={FIELD}
                  value={bendSpec.radius}
                  onChange={(event) =>
                    setBendSpec((current) => ({ ...current, radius: Number(event.target.value) }))
                  }
                />
              </label>
              <label className="block">
                <span className={`${LABEL} mb-1 block`}>Bend starts at (mm)</span>
                <input
                  type="number"
                  step="1"
                  min="0"
                  className={FIELD}
                  value={bendSpec.start}
                  onChange={(event) =>
                    setBendSpec((current) => ({ ...current, start: Number(event.target.value) }))
                  }
                />
              </label>
            </div>

            {(() => {
              const report = bendReport(bendSpec);
              const rows: [string, string][] = [
                ['Leg before the bend', `${report.legIn.toFixed(1)} mm`],
                ['Arc', `${report.arcLength.toFixed(1)} mm`],
                ['Leg after the bend', `${report.legOut.toFixed(1)} mm`],
                ['Finished span, end to end', `${report.span.toFixed(1)} mm`],
                ['Die reaches back', `${report.tangentOffset.toFixed(1)} mm each side`],
                ['Radius / diameter', report.radiusToDiameter.toFixed(2)],
              ];
              return (
                <>
                  <dl className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1 rounded-md bg-slate-100 p-3 text-[0.7rem]">
                    {rows.map(([label, value]) => (
                      <div key={label} className="flex justify-between gap-2">
                        <dt className="text-slate-500">{label}</dt>
                        <dd className="font-bold tabular-nums text-slate-900">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  {report.warnings.length > 0 && (
                    <ul className="mb-3 space-y-1 rounded-md bg-amber-50 p-3 text-[0.7rem] text-amber-900">
                      {report.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  )}
                </>
              );
            })()}

            <div className="flex justify-end gap-2">
              <button type="button" className={ACTION_GHOST} onClick={() => setShowBend(false)}>
                Cancel
              </button>
              <button
                type="button"
                className={ACTION_PRIMARY}
                onClick={() => {
                  setShowBend(false);
                  addBend(bendSpec);
                }}
              >
                Add bent pipe
              </button>
            </div>
          </div>
        </div>
      )}

      <OnePieceDialog
        open={showOnePiece}
        bodies={onePieceBodies.map((part) => ({
          id: part.id,
          name: part.name,
          detail: part.group
            ? `${part.group.members.length} bodies · ${formatCount(part.triangles)} tri`
            : `${formatCount(part.triangles)} tri`,
        }))}
        pipes={onePiecePipes.map((part) => ({
          id: part.id,
          name: part.name,
          detail: part.hardware ? `⌀${part.hardware.diameter} · ${part.hardware.length} mm` : '',
        }))}
        preselectedBodyIds={onePiecePreselected}
        progress={onePieceProgress}
        report={onePieceReport}
        error={onePieceError}
        massLabel={onePieceMass}
        onRun={(settings) => void runOnePieceJob(settings)}
        onDownload={downloadOnePiece}
        onAddPipe={(diameter) => {
          setShowOnePiece(false);
          addPipeThrough(diameter, diameter >= 25 ? 1.5 : 2);
        }}
        onClose={() => {
          if (onePieceProgress !== null) return;
          setShowOnePiece(false);
        }}
      />

      <CloudPicker
        open={showCloud}
        onClose={() => setShowCloud(false)}
        onOpen={(id) => void openCloudProject(id)}
        onSave={() => void pushCloud('manual')}
        note={cloudNote}
        saving={cloudNote === 'Saving to Supabase…'}
        canSave={project.parts.length > 0}
      />

      {showDrive && (
        <DriveBrowser
          onClose={() => setShowDrive(false)}
          onImport={(files, folderHint) =>
            void importFiles(files, { classifyHint: folderHint })
          }
        />
      )}

      {showGithub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className={`${PANEL} w-full max-w-md p-4`}>
            <h2 className="mb-1 text-sm font-bold text-slate-900">Connect GitHub</h2>
            <p className="mb-3 text-[0.7rem] text-slate-500">
              Optional. GitHub here is a leftover backup into a <code className="font-mono">3dwork-bench</code>{' '}
              repo. The kjarni GitHub connection is the website code. Parts you want on your phone
              or another computer go to Supabase — use Project → Save this build to Supabase.
            </p>
            <ol className="mb-3 list-decimal space-y-1 pl-4 text-[0.7rem] text-slate-600">
              <li>
                Create a private repo named <code className="font-mono">3dwork-bench</code> (we will
                try to create it for you).
              </li>
              <li>
                Make a token with Contents read/write on that repo —{' '}
                <a
                  className="text-emerald-700 underline"
                  href="https://github.com/settings/personal-access-tokens/new"
                  target="_blank"
                  rel="noreferrer"
                >
                  fine-grained tokens
                </a>
                . A classic token needs the <code className="font-mono">repo</code> scope.
              </li>
              <li>Paste it below. It stays in an httpOnly cookie on this site, not in the project.</li>
            </ol>
            <label className="mb-3 block">
              <span className={`${LABEL} mb-1 block`}>Personal access token</span>
              <input
                type="password"
                className={FIELD}
                value={githubToken}
                autoComplete="off"
                placeholder="github_pat_… or ghp_…"
                onChange={(event) => setGithubToken(event.target.value)}
              />
            </label>
            <label className="mb-3 block">
              <span className={`${LABEL} mb-1 block`}>GitHub username (if the token cannot read it)</span>
              <input
                type="text"
                className={FIELD}
                value={githubOwner}
                autoComplete="off"
                placeholder="aggisigurds-dev"
                onChange={(event) => setGithubOwner(event.target.value)}
              />
            </label>
            <p className="mb-3 text-[0.65rem] text-slate-500">
              Shared company save: set <code className="font-mono">GITHUB_3DWORK_TOKEN</code> and{' '}
              <code className="font-mono">GITHUB_3DWORK_REPO</code> on Vercel and every browser
              syncs with no paste.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" className={ACTION_GHOST} onClick={() => setShowGithub(false)}>
                Cancel
              </button>
              <button type="button" className={ACTION_PRIMARY} onClick={() => void connectGithub()}>
                Connect
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
