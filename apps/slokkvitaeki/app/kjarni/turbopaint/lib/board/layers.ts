import type { BoardObject } from "./types";

/** Named plumbing + drawing layers. Objects carry `layerId`; the layer list
 * lives on the board document and is persisted with the existing JSON doc. */
export type LayerKind = "background" | "drawing" | "piping";

export interface BoardLayer {
  id: string;
  key: string;
  name: string;
  color: string;
  visible: boolean;
  locked: boolean;
  kind: LayerKind;
}

export const LAYER_TEIKNING = "teikning";
export const LAYER_ALMENNT = "almennt";

export const DEFAULT_LAYERS: BoardLayer[] = [
  {
    id: LAYER_TEIKNING,
    key: "background",
    name: "Teikning",
    color: "#78716c",
    visible: true,
    locked: false,
    kind: "background",
  },
  {
    id: LAYER_ALMENNT,
    key: "general",
    name: "Almennt",
    color: "#1c1917",
    visible: true,
    locked: false,
    kind: "drawing",
  },
  {
    id: "kalt",
    key: "cold",
    name: "Kalt vatn",
    color: "#2563eb",
    visible: true,
    locked: false,
    kind: "piping",
  },
  {
    id: "heitt",
    key: "hot",
    name: "Heitt vatn",
    color: "#dc2626",
    visible: true,
    locked: false,
    kind: "piping",
  },
  {
    id: "skolp",
    key: "drain",
    name: "Skolp / fráveita",
    color: "#78716c",
    visible: true,
    locked: false,
    kind: "piping",
  },
  {
    id: "loftræsting",
    key: "vent",
    name: "Loftræsting",
    color: "#16a34a",
    visible: true,
    locked: false,
    kind: "piping",
  },
  {
    id: "hitakerfi",
    key: "heating",
    name: "Hitakerfi",
    color: "#ea580c",
    visible: true,
    locked: false,
    kind: "piping",
  },
];

const DEFAULT_IDS = new Set(DEFAULT_LAYERS.map((l) => l.id));

export function ensureLayers(existing?: BoardLayer[] | null): BoardLayer[] {
  const byId = new Map((existing ?? []).map((l) => [l.id, l]));
  const merged = DEFAULT_LAYERS.map((def) => {
    const have = byId.get(def.id);
    if (!have) return { ...def };
    return {
      ...def,
      ...have,
      id: def.id,
      key: have.key || def.key,
      name: have.name || def.name,
      color: have.color || def.color,
      kind: have.kind || def.kind,
      visible: have.visible !== false,
      locked: have.locked === true,
    };
  });
  const extras = (existing ?? []).filter((l) => !DEFAULT_IDS.has(l.id));
  return extras.length ? [...merged, ...extras] : merged;
}

export function findLayer(layers: BoardLayer[], id: string): BoardLayer | undefined {
  return layers.find((l) => l.id === id);
}

export function objectLayerId(obj: Pick<BoardObject, "layerId" | "type">): string {
  if (obj.layerId) return obj.layerId;
  return obj.type === "image" ? LAYER_TEIKNING : LAYER_ALMENNT;
}

/** Stamp a new object onto the active layer (floor plans always go on Teikning). */
export function stampLayerId<T extends Pick<BoardObject, "layerId" | "type">>(
  obj: T,
  activeLayerId: string
): T {
  if (obj.layerId) return obj;
  return {
    ...obj,
    layerId: obj.type === "image" ? LAYER_TEIKNING : activeLayerId,
  };
}

export function withLayerId<T extends BoardObject>(objects: T[], layerId: string): T[] {
  return objects.map((o) => (o.layerId ? o : { ...o, layerId }));
}

export function isLayerVisible(layers: BoardLayer[], layerId: string): boolean {
  const layer = findLayer(layers, layerId);
  return layer ? layer.visible : true;
}

export function isLayerLocked(layers: BoardLayer[], layerId: string): boolean {
  const layer = findLayer(layers, layerId);
  return layer ? layer.locked : false;
}

export function isDrawnVisible(obj: BoardObject, layers: BoardLayer[]): boolean {
  return !obj.hidden && isLayerVisible(layers, objectLayerId(obj));
}

export function isDrawnLocked(obj: BoardObject, layers: BoardLayer[]): boolean {
  return obj.locked || isLayerLocked(layers, objectLayerId(obj));
}

export function selectableIds(objects: BoardObject[], layers: BoardLayer[]): string[] {
  return objects.filter((o) => isDrawnVisible(o, layers) && !isDrawnLocked(o, layers)).map((o) => o.id);
}

export function layerStrokeForActive(layers: BoardLayer[], activeLayerId: string): string | undefined {
  const layer = findLayer(layers, activeLayerId);
  if (layer?.kind === "piping") return layer.color;
  return undefined;
}
