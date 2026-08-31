export type Tool =
  | "select"
  | "hand"
  | "rect"
  | "ellipse"
  | "line"
  | "arrow"
  | "polyline"
  | "pen"
  | "text"
  | "sticky"
  | "symbol"
  | "measure"
  | "calibrate"
  | "firewall"
  | "eraser"
  | "crop"
  | "room";

export type ImportQuality = "fast" | "standard" | "print";

export type LineKind = "line" | "arrow" | "polyline" | "pen" | "measure";

export type DashStyle = "solid" | "dashed" | "dotted";

export interface Camera {
  x: number;
  y: number;
  scale: number;
}

export interface ImportProgress {
  fileName: string;
  percent: number;
  message: string;
}

interface BaseObject {
  id: string;
  x: number;
  y: number;
  rotation: number;
  opacity: number;
  locked: boolean;
  hidden: boolean;
  name: string;
  /** When set, this object moves with the imported page (image) it belongs to. */
  parentId?: string;
  /** Objects sharing a groupId select and move as one unit (Hópa / ⌘G). */
  groupId?: string;
  /** Named drawing / piping layer (`teikning`, `almennt`, `kalt`, …). */
  layerId?: string;
}

export interface ImageObject extends BaseObject {
  type: "image";
  assetId: string;
  width: number;
  height: number;
  /** Pixels per PDF point when the page was rasterized (viewport.scale). */
  pixelsPerPdfPoint?: number;
}

export interface RectObject extends BaseObject {
  type: "rect";
  width: number;
  height: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  cornerRadius: number;
  /** Rými í fermetratöku: birtist í RÝMI-kafla Magntöflunnar með m². */
  isRoom?: boolean;
  /** Rými sem telst EKKI með í nettó (svalir, geymsla, bílskúr …). */
  roomExcluded?: boolean;
  /** False = sleppa rýminu úr magntöflu (númer 1, 2, 3 og m²-lína). Vantar = talið. */
  roomCounted?: boolean;
  /** Fill-alpha for the room wash (0–1). Stroke and labels stay solid. */
  roomOpacity?: number;
  /** Leiðbeinandi fjöldi gata sem eftir eru í rýminu (heil tala ≥ 0). */
  roomGataCount?: number;
}

export interface EllipseObject extends BaseObject {
  type: "ellipse";
  width: number;
  height: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
}

export interface LineObject extends BaseObject {
  type: LineKind;
  points: number[];
  stroke: string;
  strokeWidth: number;
  dash: DashStyle;
  /** Innslegin RAUN-lengd í metrum (Kvarði) — yfirskrifar reiknaða lengd á merkimiða. */
  meters?: number;
}

export interface TextObject extends BaseObject {
  type: "text";
  text: string;
  fontSize: number;
  fill: string;
  width: number;
  fontStyle: "normal" | "bold";
  align: "left" | "center";
}

export interface StickyObject extends BaseObject {
  type: "sticky";
  text: string;
  width: number;
  height: number;
  fill: string;
  fontSize: number;
}

export interface SymbolObject extends BaseObject {
  type: "symbol";
  symbolId: string;
  size: number;
  label: string;
}

export type BoardObject =
  | ImageObject
  | RectObject
  | EllipseObject
  | LineObject
  | TextObject
  | StickyObject
  | SymbolObject;

export interface BoardDocument {
  version: 1 | 2;
  name: string;
  objects: BoardObject[];
  camera: Camera;
  pixelsPerMeter: number | null;
  grid: boolean;
  snap: boolean;
  assetIds: string[];
  /** Named plumbing / drawing layers. Missing on older boards. */
  layers?: import("./layers").BoardLayer[];
  /** Id of the layer new strokes land on. */
  activeLayerId?: string;
  /** Board id when synced across devices (turbopaint_boards.id). */
  boardId?: string;
  /** ISO timestamp of the last local save — last-write-wins between devices. */
  updatedAt?: string;
  /** Sync-samningur klientsins. 2 = efnis-stimplun (PR #59+). Pull hunsar
   * skjöl án syncRev — þau koma frá eldri, óöruggum klientum. */
  syncRev?: number;
}

export const IMPORT_MAX_PX: Record<ImportQuality, number> = {
  fast: 3200,
  standard: 7200,
  print: 12500,
};

export const STROKE_PRESETS = ["#1c1917", "#FE653F", "#16a34a", "#2563eb", "#ca8a04", "#7c3aed", "#ffffff"];
export const FILL_PRESETS = [
  "transparent",
  "#FE653F33",
  "#16a34a33",
  "#2563eb33",
  "#fde047",
  "#86efac",
  "#93c5fd",
  "#f9a8d4",
  "#fdba74",
  "#ffffff",
];
export const STICKY_COLORS = ["#fde047", "#86efac", "#93c5fd", "#f9a8d4", "#fdba74", "#e7e5e4"];
export const STROKE_WIDTHS = [1, 2, 4, 8, 12, 18];
