import type { BoardObject, RectObject } from "./types";

/** When göt eftir is at most `maxLeft`, the room uses this fill. */
export type RoomColorRule = {
  id: string;
  maxLeft: number;
  color: string;
  label: string;
};

export type RoomSettings = {
  defaultHolesTotal: number;
  doneColor: string;
  inProgressColor: string;
  strokeColor: string;
  rules: RoomColorRule[];
};

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  defaultHolesTotal: 4,
  doneColor: "#22c55eaa",
  inProgressColor: "#f59e0baa",
  strokeColor: "#14532d",
  rules: [
    { id: "lokid", maxLeft: 0, color: "#22c55eaa", label: "Lokið" },
    { id: "fa", maxLeft: 2, color: "#f59e0baa", label: "Fá eftir" },
    { id: "morg", maxLeft: 9999, color: "#ef4444aa", label: "Mörg eftir" },
  ],
};

function asColor(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const t = value.trim();
  if (!/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(t)) return fallback;
  return t;
}

function asRule(raw: unknown, fallback: RoomColorRule): RoomColorRule {
  if (!raw || typeof raw !== "object") return fallback;
  const r = raw as Partial<RoomColorRule>;
  const maxLeft = Math.max(0, Math.round(Number(r.maxLeft)));
  return {
    id: typeof r.id === "string" && r.id ? r.id : fallback.id,
    maxLeft: Number.isFinite(maxLeft) ? maxLeft : fallback.maxLeft,
    color: asColor(r.color, fallback.color),
    label: typeof r.label === "string" && r.label.trim() ? r.label.trim() : fallback.label,
  };
}

export function normalizeRoomSettings(raw?: Partial<RoomSettings> | null): RoomSettings {
  const base = raw ?? {};
  const total = Math.max(0, Math.round(Number(base.defaultHolesTotal)));
  const rulesIn = Array.isArray(base.rules) ? base.rules : null;
  const rules =
    rulesIn && rulesIn.length
      ? rulesIn.map((r, i) =>
          asRule(r, DEFAULT_ROOM_SETTINGS.rules[Math.min(i, DEFAULT_ROOM_SETTINGS.rules.length - 1)])
        )
      : DEFAULT_ROOM_SETTINGS.rules.map((r) => ({ ...r }));
  return {
    defaultHolesTotal: Number.isFinite(total) ? total : DEFAULT_ROOM_SETTINGS.defaultHolesTotal,
    doneColor: asColor(base.doneColor, DEFAULT_ROOM_SETTINGS.doneColor),
    inProgressColor: asColor(base.inProgressColor, DEFAULT_ROOM_SETTINGS.inProgressColor),
    strokeColor: asColor(base.strokeColor, DEFAULT_ROOM_SETTINGS.strokeColor),
    rules,
  };
}

export function roomFillForHoles(settings: RoomSettings, holesLeft: number): string {
  const left = Math.max(0, Math.round(holesLeft));
  if (left === 0) return settings.doneColor;
  const sorted = [...settings.rules].sort((a, b) => a.maxLeft - b.maxLeft);
  for (const rule of sorted) {
    if (left <= rule.maxLeft) return rule.color;
  }
  return settings.inProgressColor;
}

export function isAreaRoom(obj: BoardObject): obj is RectObject {
  return obj.type === "rect" && !!obj.isRoom;
}

/** Rými sem fylgjast með götum (Rými-tólið), ekki aðeins fermetrar. */
export function isHoleRoom(obj: BoardObject): obj is RectObject {
  return isAreaRoom(obj) && (obj.holesTotal != null || obj.holesLeft != null);
}

export function roomHoles(obj: Pick<RectObject, "holesTotal" | "holesLeft">) {
  const total = Math.max(0, Math.round(obj.holesTotal ?? 0));
  let left = Math.max(0, Math.round(obj.holesLeft ?? total));
  if (total > 0) left = Math.min(left, total);
  return { total, left };
}

export function applyRoomAppearance(obj: RectObject, settings: RoomSettings): RectObject {
  const { left, total } = roomHoles(obj);
  return {
    ...obj,
    isRoom: true,
    holesTotal: total,
    holesLeft: left,
    fill: roomFillForHoles(settings, left),
    stroke: left === 0 ? "#166534" : settings.strokeColor,
  };
}

export function punchRoom(obj: RectObject, settings: RoomSettings): RectObject {
  const { left, total } = roomHoles(obj);
  const nextLeft = left <= 0 ? 0 : left - 1;
  return applyRoomAppearance({ ...obj, holesLeft: nextLeft, holesTotal: total }, settings);
}

export function nextRoomName(objects: BoardObject[]) {
  const used = new Set(objects.filter(isAreaRoom).map((o) => o.name));
  let n = 1;
  while (used.has(`Rými ${n}`)) n += 1;
  return `Rými ${n}`;
}

export function createHoleRoom(
  box: { x: number; y: number; width: number; height: number },
  objects: BoardObject[],
  settings: RoomSettings,
  extra: { id: string; parentId?: string }
): RectObject {
  const total = settings.defaultHolesTotal;
  return applyRoomAppearance(
    {
      id: extra.id,
      type: "rect",
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      fill: settings.inProgressColor,
      stroke: settings.strokeColor,
      strokeWidth: 3,
      cornerRadius: 2,
      rotation: 0,
      opacity: 1,
      locked: false,
      hidden: false,
      name: nextRoomName(objects),
      parentId: extra.parentId,
      isRoom: true,
      holesTotal: total,
      holesLeft: total,
    },
    settings
  );
}

export function holeTotals(rooms: RectObject[]) {
  let left = 0;
  let total = 0;
  let done = 0;
  for (const r of rooms) {
    const h = roomHoles(r);
    left += h.left;
    total += h.total;
    if (h.left === 0) done += 1;
  }
  return { left, total, done, count: rooms.length };
}

export function solidHex(color: string) {
  const h = color.replace("#", "");
  return `#${h.slice(0, 6)}`;
}

export function withFillAlpha(solid: string, alpha = "aa") {
  return `${solidHex(solid)}${alpha}`;
}
