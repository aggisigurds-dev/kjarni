import { create } from "zustand";
import { newId } from "./ids";
import {
  DEFAULT_LAYERS,
  LAYER_ALMENNT,
  ensureLayers,
  findLayer,
  layerStrokeForActive,
  objectLayerId,
  stampLayerId,
  type BoardLayer,
} from "./layers";
import type {
  BoardObject,
  Camera,
  DashStyle,
  ImportProgress,
  ImportQuality,
  Tool,
} from "./types";
import { GRID_GAP, snapValue } from "./geometry";

const MAX_HISTORY = 80;

export interface StyleState {
  stroke: string;
  fill: string;
  strokeWidth: number;
  dash: DashStyle;
  stickyFill: string;
  fontSize: number;
  symbolId: string;
}

interface BoardStore {
  hydrated: boolean;
  name: string;
  objects: BoardObject[];
  selectedIds: string[];
  tool: Tool;
  camera: Camera;
  pixelsPerMeter: number | null;
  grid: boolean;
  snap: boolean;
  importQuality: ImportQuality;
  importProgress: ImportProgress | null;
  spacePan: boolean;
  /** Cloud sync status for the current board (shown in the TopBar). */
  syncState: "idle" | "saving" | "synced" | "error";
  setSyncState: (s: "idle" | "saving" | "synced" | "error") => void;
  /** Bilið sem grindin sést með á núverandi zoomi — snap notar sama bil. */
  gridGap: number;
  setGridGap: (gap: number) => void;
  style: StyleState;
  layers: BoardLayer[];
  activeLayerId: string;
  past: BoardObject[][];
  future: BoardObject[][];
  setHydrated: (v: boolean) => void;
  setName: (name: string) => void;
  setTool: (tool: Tool) => void;
  setCamera: (camera: Camera) => void;
  setPixelsPerMeter: (n: number | null) => void;
  toggleGrid: () => void;
  toggleSnap: () => void;
  setImportQuality: (q: ImportQuality) => void;
  setImportProgress: (p: ImportProgress | null) => void;
  setSpacePan: (v: boolean) => void;
  setStyle: (partial: Partial<StyleState>) => void;
  setActiveLayer: (id: string) => void;
  toggleLayerVisible: (id: string) => void;
  toggleLayerLocked: (id: string) => void;
  startFirewall: () => void;
  setSelected: (ids: string[]) => void;
  replaceBoard: (data: {
    name: string;
    objects: BoardObject[];
    camera: Camera;
    pixelsPerMeter: number | null;
    grid: boolean;
    snap: boolean;
    layers?: BoardLayer[];
    activeLayerId?: string;
  }) => void;
  addObjects: (objects: BoardObject[], select?: boolean) => void;
  updateObjects: (
    ids: string[],
    updater: (obj: BoardObject) => BoardObject,
    recordHistory?: boolean
  ) => void;
  patchObject: (id: string, patch: Partial<BoardObject>, recordHistory?: boolean) => void;
  deleteIds: (ids: string[]) => void;
  bringForward: () => void;
  sendBackward: () => void;
  duplicateSelected: () => void;
  groupSelected: () => void;
  ungroupSelected: () => void;
  lockSelected: (locked: boolean) => void;
  undo: () => void;
  redo: () => void;
  commitHistory: () => void;
}

function cloneObjects(objects: BoardObject[]) {
  return structuredClone(objects);
}

export const useBoardStore = create<BoardStore>((set, get) => ({
  hydrated: false,
  name: "TurboPaint",
  objects: [],
  selectedIds: [],
  // 2026-08-29 (Agnar): „Handarbendillinn má veljast default þegar maður fer
  // inn í kerfið." Fyrsta verkið á nýju borði er nánast alltaf að skoða og færa
  // teikninguna, ekki að velja hluti — og með „select" var auðvelt að grípa
  // óvart í hlut og hliðra honum áður en maður áttaði sig. „hand" er óvirkt í
  // þeim skilningi að það breytir engu á borðinu.
  // ATH: þetta er AÐEINS upphafsgildið. Tólin skipta sér áfram sjálf yfir í
  // „select" eftir að teiknað hefur verið (sjá setTool-köllin í BoardCanvas).
  tool: "hand",
  camera: { x: 80, y: 64, scale: 0.62 },
  pixelsPerMeter: null,
  grid: true,
  snap: true,
  importQuality: "standard",
  importProgress: null,
  spacePan: false,
  syncState: "idle",
  setSyncState: (syncState) => set({ syncState }),
  gridGap: GRID_GAP,
  setGridGap: (gridGap) => set({ gridGap }),
  style: {
    stroke: "#1c1917",
    fill: "transparent",
    strokeWidth: 4,
    dash: "solid",
    stickyFill: "#fde047",
    fontSize: 22,
    symbolId: "extinguisher",
  },
  layers: DEFAULT_LAYERS.map((l) => ({ ...l })),
  activeLayerId: LAYER_ALMENNT,
  past: [],
  future: [],
  setHydrated: (hydrated) => set({ hydrated }),
  setName: (name) => set({ name }),
  setTool: (tool) => set({ tool, selectedIds: tool === "select" ? get().selectedIds : [] }),
  setCamera: (camera) => set({ camera }),
  setPixelsPerMeter: (pixelsPerMeter) => set({ pixelsPerMeter }),
  toggleGrid: () => set({ grid: !get().grid }),
  toggleSnap: () => set({ snap: !get().snap }),
  setImportQuality: (importQuality) => set({ importQuality }),
  setImportProgress: (importProgress) => set({ importProgress }),
  setSpacePan: (spacePan) => set({ spacePan }),
  setStyle: (partial) => set({ style: { ...get().style, ...partial } }),
  setActiveLayer: (id) => {
    const layers = get().layers;
    if (!findLayer(layers, id)) return;
    const stroke = layerStrokeForActive(layers, id);
    set({
      activeLayerId: id,
      style: stroke ? { ...get().style, stroke } : get().style,
    });
  },
  toggleLayerVisible: (id) => {
    const layers = get().layers.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l));
    const hidden = layers.find((l) => l.id === id && !l.visible);
    let selectedIds = get().selectedIds;
    if (hidden) {
      selectedIds = selectedIds.filter((sid) => {
        const obj = get().objects.find((o) => o.id === sid);
        return !obj || objectLayerId(obj) !== id;
      });
    }
    set({ layers, selectedIds });
  },
  toggleLayerLocked: (id) => {
    const layers = get().layers.map((l) => (l.id === id ? { ...l, locked: !l.locked } : l));
    const locked = layers.find((l) => l.id === id && l.locked);
    let selectedIds = get().selectedIds;
    if (locked) {
      selectedIds = selectedIds.filter((sid) => {
        const obj = get().objects.find((o) => o.id === sid);
        return !obj || objectLayerId(obj) !== id;
      });
    }
    set({ layers, selectedIds });
  },
  startFirewall: () => {
    // Default eldveggur to red, but respect a colour the user already picked;
    // width/dash always stay as pre-chosen in the StyleStrip.
    const st = get().style;
    set({
      // Sjálfgefinn nýr eldveggur = EI-60 appelsínugult (litaregla Agnars)
      style: st.stroke === "#1c1917" ? { ...st, stroke: "#ea580c" } : st,
      tool: "firewall",
      selectedIds: [],
    });
  },
  setSelected: (selectedIds) => set({ selectedIds }),
  replaceBoard: (data) => {
    const layers = ensureLayers(data.layers);
    const activeLayerId =
      data.activeLayerId && findLayer(layers, data.activeLayerId)
        ? data.activeLayerId
        : LAYER_ALMENNT;
    const objects = data.objects.map((o) => stampLayerId(o, objectLayerId(o)));
    set({
      ...data,
      layers,
      activeLayerId,
      objects,
      selectedIds: [],
      past: [],
      future: [],
    });
  },
  addObjects: (incoming, select = true) => {
    const { objects, activeLayerId } = get();
    pushHistory(set, get);
    const stamped = incoming.map((o) => stampLayerId(o, activeLayerId));
    const images = stamped.filter((o) => o.type === "image");
    const rest = stamped.filter((o) => o.type !== "image");
    const existingImages = objects.filter((o) => o.type === "image");
    const existingRest = objects.filter((o) => o.type !== "image");
    const next = [...existingImages, ...images, ...existingRest, ...rest];
    set({
      objects: next,
      selectedIds: select ? incoming.map((o) => o.id) : [],
    });
  },
  updateObjects: (ids, updater, recordHistory = true) => {
    if (recordHistory) pushHistory(set, get);
    const idSet = new Set(ids);
    set({
      objects: get().objects.map((obj) => (idSet.has(obj.id) ? updater(obj) : obj)),
    });
  },
  patchObject: (id, patch, recordHistory = true) => {
    if (recordHistory) pushHistory(set, get);
    set({
      objects: get().objects.map((obj) =>
        obj.id === id ? ({ ...obj, ...patch } as BoardObject) : obj
      ),
    });
  },
  deleteIds: (ids) => {
    if (!ids.length) return;
    pushHistory(set, get);
    const idSet = new Set(ids);
    set({
      objects: get().objects.filter((o) => !idSet.has(o.id)),
      selectedIds: get().selectedIds.filter((id) => !idSet.has(id)),
    });
  },
  bringForward: () => {
    const { objects, selectedIds } = get();
    if (!selectedIds.length) return;
    pushHistory(set, get);
    const idSet = new Set(selectedIds);
    const moving = objects.filter((o) => idSet.has(o.id));
    const staying = objects.filter((o) => !idSet.has(o.id));
    set({ objects: [...staying, ...moving] });
  },
  sendBackward: () => {
    const { objects, selectedIds } = get();
    if (!selectedIds.length) return;
    pushHistory(set, get);
    const idSet = new Set(selectedIds);
    const moving = objects.filter((o) => idSet.has(o.id));
    const staying = objects.filter((o) => !idSet.has(o.id));
    set({ objects: [...moving, ...staying] });
  },
  duplicateSelected: () => {
    const { objects, selectedIds } = get();
    const groupMap = new Map<string, string>();
    const copies = objects
      .filter((o) => selectedIds.includes(o.id) && !o.locked)
      .map((o) => {
        const copy = { ...structuredClone(o), id: newId(), x: o.x + 24, y: o.y + 24 };
        if (copy.groupId) {
          if (!groupMap.has(copy.groupId)) groupMap.set(copy.groupId, newId());
          copy.groupId = groupMap.get(copy.groupId);
        }
        return copy;
      });
    if (!copies.length) return;
    pushHistory(set, get);
    set({
      objects: [...objects, ...copies],
      selectedIds: copies.map((o) => o.id),
    });
  },
  groupSelected: () => {
    const { selectedIds } = get();
    if (selectedIds.length < 2) return;
    pushHistory(set, get);
    const gid = newId();
    const idSet = new Set(selectedIds);
    set({
      objects: get().objects.map((o) => (idSet.has(o.id) ? { ...o, groupId: gid } : o)),
    });
  },
  ungroupSelected: () => {
    const { selectedIds } = get();
    if (!selectedIds.length) return;
    pushHistory(set, get);
    const idSet = new Set(selectedIds);
    set({
      objects: get().objects.map((o) =>
        idSet.has(o.id) && o.groupId ? { ...o, groupId: undefined } : o
      ),
    });
  },
  lockSelected: (locked) => {
    const { selectedIds } = get();
    if (!selectedIds.length) return;
    pushHistory(set, get);
    const idSet = new Set(selectedIds);
    set({
      objects: get().objects.map((o) => (idSet.has(o.id) ? { ...o, locked } : o)),
    });
  },
  undo: () => {
    const { past, objects, future } = get();
    if (!past.length) return;
    const prev = past[past.length - 1];
    set({
      objects: prev,
      past: past.slice(0, -1),
      future: [...future, cloneObjects(objects)],
      selectedIds: [],
    });
  },
  redo: () => {
    const { future, objects, past } = get();
    if (!future.length) return;
    const next = future[future.length - 1];
    set({
      objects: next,
      future: future.slice(0, -1),
      past: [...past, cloneObjects(objects)],
      selectedIds: [],
    });
  },
  commitHistory: () => pushHistory(set, get),
}));

function pushHistory(
  set: (partial: Partial<BoardStore>) => void,
  get: () => BoardStore
) {
  const { past, objects } = get();
  const nextPast = [...past, cloneObjects(objects)];
  if (nextPast.length > MAX_HISTORY) nextPast.shift();
  set({ past: nextPast, future: [] });
}

export { newId } from "./ids";

export function snapPoint(x: number, y: number) {
  const { snap, gridGap } = useBoardStore.getState();
  const gap = gridGap || GRID_GAP;
  return {
    x: snapValue(x, gap, snap),
    y: snapValue(y, gap, snap),
  };
}
