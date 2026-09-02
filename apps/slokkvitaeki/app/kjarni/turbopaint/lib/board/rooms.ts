import type { BoardObject, RectObject } from "./types";

export type RoomEntry = {
  /** groupId for multi-box rooms, otherwise the rect id. */
  key: string;
  ids: string[];
  name: string;
  excluded: boolean;
  /** When true, the room is numbered and listed in Magntafla. */
  counted: boolean;
  color: string;
  opacity: number;
  /** Remaining "gata" guide for this room (shared by every box in the group). */
  gataCount: number;
};

export const DEFAULT_ROOM_NAME = "Rými";
export const DEFAULT_ROOM_COLOR = "#FE653F";
export const DEFAULT_ROOM_OPACITY = 0.22;
export const ROOM_COLORS = [
  "#FE653F",
  "#16a34a",
  "#2563eb",
  "#ca8a04",
  "#7c3aed",
  "#db2777",
  "#0d9488",
  "#78716c",
] as const;

export type RoomAppearance = {
  color?: string;
  opacity?: number;
  counted?: boolean;
};

function isRoomRect(obj: BoardObject): obj is RectObject {
  return obj.type === "rect" && Boolean(obj.isRoom);
}

export function roomKeyOf(obj: RectObject): string {
  return obj.groupId || obj.id;
}

export function displayRoomName(name: string | undefined): string {
  if (!name || name === "Ferningur") return DEFAULT_ROOM_NAME;
  return name;
}

export function solidHex(color: string): string {
  const c = color.trim();
  if (/^#[0-9a-f]{8}$/i.test(c)) return `#${c.slice(1, 7).toUpperCase()}`;
  if (/^#[0-9a-f]{6}$/i.test(c)) return c.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(c)) {
    return `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`.toUpperCase();
  }
  return DEFAULT_ROOM_COLOR;
}

export function fillAlpha(color: string, opacity: number): string {
  const hex = solidHex(color);
  const a = Math.round(Math.min(1, Math.max(0.05, opacity)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${a}`;
}

export function opacityFromFill(fill: string, fallback = DEFAULT_ROOM_OPACITY): number {
  if (/^#[0-9a-f]{8}$/i.test(fill)) return parseInt(fill.slice(7, 9), 16) / 255;
  return fallback;
}

/** One row per rými. Irregular rooms (several boxes, same groupId) collapse to one. */
export function listRooms(objects: BoardObject[]): RoomEntry[] {
  const groups = new Map<string, RectObject[]>();
  for (const obj of objects) {
    if (!isRoomRect(obj) || obj.hidden) continue;
    const key = roomKeyOf(obj);
    const parts = groups.get(key);
    if (parts) parts.push(obj);
    else groups.set(key, [obj]);
  }
  const rooms: RoomEntry[] = [];
  for (const [key, parts] of groups) {
    const first = parts[0]!;
    rooms.push({
      key,
      ids: parts.map((p) => p.id),
      name: displayRoomName(first.name),
      excluded: parts.every((p) => Boolean(p.roomExcluded)),
      counted: parts.every((p) => p.roomCounted !== false),
      color: solidHex(first.stroke || first.fill || DEFAULT_ROOM_COLOR),
      opacity: first.roomOpacity ?? opacityFromFill(first.fill),
      gataCount: clampRoomGataCount(first.roomGataCount ?? 0),
    });
  }
  return rooms;
}

export function roomOfSelection(objects: BoardObject[], selectedIds: string[]): RoomEntry | null {
  if (!selectedIds.length) return null;
  const selected = new Set(selectedIds);
  return listRooms(objects).find((room) => room.ids.some((id) => selected.has(id))) ?? null;
}

export function roomAreaPx(objects: BoardObject[], ids: string[]): number {
  const idSet = new Set(ids);
  let area = 0;
  for (const obj of objects) {
    if (obj.type !== "rect" || !idSet.has(obj.id)) continue;
    area += Math.abs(obj.width * obj.height);
  }
  return area;
}

export function primaryRoomBoxId(objects: BoardObject[], ids: string[]): string | null {
  const idSet = new Set(ids);
  let best: RectObject | null = null;
  for (const obj of objects) {
    if (obj.type !== "rect" || !idSet.has(obj.id)) continue;
    if (!best || Math.abs(obj.width * obj.height) > Math.abs(best.width * best.height)) {
      best = obj;
    }
  }
  return best?.id ?? null;
}

/** 1-based Magntafla number, or null when the room is not counted. */
export function roomCounterIndex(objects: BoardObject[], key: string): number | null {
  const counted = listRooms(objects).filter((r) => r.counted);
  const i = counted.findIndex((r) => r.key === key);
  return i < 0 ? null : i + 1;
}

export function renameRoomObjects(objects: BoardObject[], key: string, name: string): BoardObject[] {
  const trimmed = name.trim() || DEFAULT_ROOM_NAME;
  return mapRoom(objects, key, (obj) => ({ ...obj, name: trimmed }));
}

export function setRoomExcluded(objects: BoardObject[], key: string, excluded: boolean): BoardObject[] {
  return mapRoom(objects, key, (obj) => ({ ...obj, roomExcluded: excluded }));
}

export function setRoomCounted(objects: BoardObject[], key: string, counted: boolean): BoardObject[] {
  return mapRoom(objects, key, (obj) => ({ ...obj, roomCounted: counted }));
}

export function clampRoomGataCount(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

/** Remaining-gata guide. Patches every box in the grouped room. Clamped at 0. */
export function setRoomGataCount(objects: BoardObject[], key: string, n: number): BoardObject[] {
  const count = clampRoomGataCount(n);
  return mapRoom(objects, key, (obj) => ({ ...obj, roomGataCount: count }));
}

export function styleRoomObjects(
  objects: BoardObject[],
  key: string,
  patch: RoomAppearance
): BoardObject[] {
  return mapRoom(objects, key, (obj) => {
    const color = patch.color ? solidHex(patch.color) : solidHex(obj.stroke || DEFAULT_ROOM_COLOR);
    const opacity = patch.opacity ?? obj.roomOpacity ?? opacityFromFill(obj.fill);
    return {
      ...obj,
      stroke: color,
      fill: fillAlpha(color, opacity),
      roomOpacity: opacity,
      ...(patch.counted !== undefined ? { roomCounted: patch.counted } : {}),
    };
  });
}

function mapRoom(
  objects: BoardObject[],
  key: string,
  fn: (obj: RectObject) => RectObject
): BoardObject[] {
  return objects.map((obj) => {
    if (!isRoomRect(obj) || roomKeyOf(obj) !== key) return obj;
    return fn(obj);
  });
}
