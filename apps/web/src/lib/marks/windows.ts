/**
 * Category window geometry + persistence helpers.
 * Lives beside model.ts so folder/link drag work can keep changing the core model.
 * Extra `w`/`h` (and `unfiledLayout`) ride on the JSON doc even if MarkCategory
 * does not list them — persistDoc spreads the category objects as-is.
 */

import {
  DEFAULT_WHITEBOARD_H,
  DEFAULT_WHITEBOARD_W,
  persistDoc,
  type MarkCategory,
  type MarkWhiteboard,
  type MarksDoc,
} from './model';

export const MIN_WINDOW_W = 220;
export const MIN_WINDOW_H = 160;
export const MIN_WHITEBOARD_W = 200;
export const MIN_WHITEBOARD_H = 160;
export const DEFAULT_WINDOW_W = 320;
export const DEFAULT_WINDOW_H = 380;
export const WINDOW_SLOT_W = 348;
export const WINDOW_SLOT_H = 408;
export const SNAP_GRID = 8;
export const UNFILED_WINDOW_ID = '__unfiled';

export type MarksWindowRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export type WindowedCategory = MarkCategory & { w: number; h: number };

export function snapCoord(n: number, grid = SNAP_GRID): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n / grid) * grid;
}

export function clampWindowRect(rect: Partial<MarksWindowRect> & Pick<MarksWindowRect, 'x' | 'y'>): MarksWindowRect {
  const w = Math.max(MIN_WINDOW_W, Math.round(Number.isFinite(rect.w) ? (rect.w as number) : DEFAULT_WINDOW_W));
  const h = Math.max(MIN_WINDOW_H, Math.round(Number.isFinite(rect.h) ? (rect.h as number) : DEFAULT_WINDOW_H));
  return {
    x: Math.max(0, Math.round(Number.isFinite(rect.x) ? rect.x : 0)),
    y: Math.max(0, Math.round(Number.isFinite(rect.y) ? rect.y : 0)),
    w,
    h,
  };
}

export function snapWindowRect(rect: MarksWindowRect, grid = SNAP_GRID): MarksWindowRect {
  return clampWindowRect({
    x: snapCoord(rect.x, grid),
    y: snapCoord(rect.y, grid),
    w: Math.max(MIN_WINDOW_W, snapCoord(rect.w, grid)),
    h: Math.max(MIN_WINDOW_H, snapCoord(rect.h, grid)),
  });
}

export function tileRect(index: number): MarksWindowRect {
  const n = Math.max(0, Math.floor(index));
  return {
    x: (n % 3) * WINDOW_SLOT_W,
    y: Math.floor(n / 3) * WINDOW_SLOT_H,
    w: DEFAULT_WINDOW_W,
    h: DEFAULT_WINDOW_H,
  };
}

export function hasWindowOrigin(rect: { x?: number; y?: number } | null | undefined): boolean {
  if (!rect) return false;
  return Boolean(rect.x || rect.y);
}

export function applyMove(orig: MarksWindowRect, dx: number, dy: number): MarksWindowRect {
  return clampWindowRect({ x: orig.x + dx, y: orig.y + dy, w: orig.w, h: orig.h });
}

export function applyResize(orig: MarksWindowRect, edge: ResizeEdge, dx: number, dy: number): MarksWindowRect {
  let { x, y, w, h } = orig;
  if (edge.includes('e')) w = orig.w + dx;
  if (edge.includes('w')) {
    w = orig.w - dx;
    x = orig.x + dx;
  }
  if (edge.includes('s')) h = orig.h + dy;
  if (edge.includes('n')) {
    h = orig.h - dy;
    y = orig.y + dy;
  }
  if (w < MIN_WINDOW_W) {
    if (edge.includes('w')) x = orig.x + orig.w - MIN_WINDOW_W;
    w = MIN_WINDOW_W;
  }
  if (h < MIN_WINDOW_H) {
    if (edge.includes('n')) y = orig.y + orig.h - MIN_WINDOW_H;
    h = MIN_WINDOW_H;
  }
  return clampWindowRect({ x, y, w, h });
}

export function boardExtent(rects: MarksWindowRect[], minW = 960, minH = 640): { width: number; height: number } {
  let width = minW;
  let height = minH;
  for (const rect of rects) {
    width = Math.max(width, rect.x + rect.w + 48);
    height = Math.max(height, rect.y + rect.h + 48);
  }
  return { width, height };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function readLayoutFields(row: Record<string, unknown>): MarksWindowRect {
  const nested = asRecord(row.layout);
  return {
    x: num(row.x, num(nested?.x)),
    y: num(row.y, num(nested?.y)),
    w: num(row.w, num(nested?.w)),
    h: num(row.h, num(nested?.h)),
  };
}

export function categorySize(category: MarkCategory): { w: number; h: number } {
  const row = category as MarkCategory & { w?: number; h?: number };
  return {
    w: row.w && row.w > 0 ? row.w : DEFAULT_WINDOW_W,
    h: row.h && row.h > 0 ? row.h : DEFAULT_WINDOW_H,
  };
}

export function folderWindowRect(category: Pick<MarkCategory, 'x' | 'y'> & { w?: number; h?: number }, index = 0): MarksWindowRect {
  const tiled = tileRect(index);
  const size = categorySize(category as MarkCategory);
  return clampWindowRect({
    x: hasWindowOrigin(category) ? category.x : tiled.x,
    y: hasWindowOrigin(category) ? category.y : tiled.y,
    w: size.w,
    h: size.h,
  });
}

export function layoutMissingWindows(doc: MarksDoc, raw?: unknown): MarksDoc {
  const source = asRecord(raw);
  const folderSource = (source?.categories ?? source?.folders ?? doc.categories) as unknown;
  const byId = new Map<string, Record<string, unknown>>();
  if (Array.isArray(folderSource)) {
    for (const row of folderSource) {
      const rec = asRecord(row);
      if (rec?.id) byId.set(String(rec.id), rec);
    }
  }
  let n = 0;
  const categories = doc.categories.map((category) => {
    const rawRow = byId.get(category.id);
    const layout = rawRow ? readLayoutFields(rawRow) : { x: category.x, y: category.y, ...categorySize(category) };
    if (category.parentId) {
      return { ...category, w: layout.w || DEFAULT_WINDOW_W, h: layout.h || DEFAULT_WINDOW_H };
    }
    const tiled = tileRect(n);
    n += 1;
    const origin = hasWindowOrigin({ x: layout.x || category.x, y: layout.y || category.y });
    return {
      ...category,
      x: origin ? layout.x || category.x : tiled.x,
      y: origin ? layout.y || category.y : tiled.y,
      w: layout.w || DEFAULT_WINDOW_W,
      h: layout.h || DEFAULT_WINDOW_H,
    };
  });
  const unfiledRaw = asRecord(source?.unfiledLayout) ?? asRecord((doc as MarksDoc & { unfiledLayout?: unknown }).unfiledLayout);
  const unfiledLayout = unfiledRaw
    ? clampWindowRect(readLayoutFields(unfiledRaw))
    : hasWindowOrigin((doc as MarksDoc & { unfiledLayout?: MarksWindowRect }).unfiledLayout)
      ? clampWindowRect((doc as MarksDoc & { unfiledLayout?: MarksWindowRect }).unfiledLayout as MarksWindowRect)
      : tileRect(n);
  n += 1;
  const rawBoards = Array.isArray(source?.whiteboards) ? source.whiteboards : doc.whiteboards ?? [];
  const rawById = new Map<string, Record<string, unknown>>();
  if (Array.isArray(rawBoards)) {
    for (const row of rawBoards) {
      const rec = asRecord(row);
      if (rec?.id) rawById.set(String(rec.id), rec);
    }
  }
  const whiteboards = (doc.whiteboards ?? []).map((board) => {
    const rawRow = rawById.get(board.id);
    const layout = rawRow ? readLayoutFields(rawRow) : { x: board.x, y: board.y, w: board.w, h: board.h };
    const tiled = tileRect(n);
    n += 1;
    const origin = hasWindowOrigin({ x: layout.x || board.x, y: layout.y || board.y });
    return {
      ...board,
      x: origin ? layout.x || board.x : tiled.x,
      y: origin ? layout.y || board.y : tiled.y,
      w: layout.w || board.w || DEFAULT_WHITEBOARD_W,
      h: layout.h || board.h || DEFAULT_WHITEBOARD_H,
    };
  });
  return persistDoc({ ...doc, categories, whiteboards, unfiledLayout } as MarksDoc);
}

export function setCategoryLayout(doc: MarksDoc, id: string, rect: MarksWindowRect, now: number): MarksDoc {
  if (!doc.categories.some((row) => row.id === id)) return doc;
  const next = snapWindowRect(clampWindowRect(rect));
  return persistDoc({
    ...doc,
    updatedAt: now,
    categories: doc.categories.map((row) =>
      row.id === id ? { ...row, x: next.x, y: next.y, w: next.w, h: next.h } : row
    ),
  });
}

export function setUnfiledLayout(doc: MarksDoc, rect: MarksWindowRect, now: number): MarksDoc {
  return persistDoc({
    ...doc,
    updatedAt: now,
    unfiledLayout: snapWindowRect(clampWindowRect(rect)),
  } as MarksDoc);
}

export function unfiledWindowRect(doc: MarksDoc, rootCount: number): MarksWindowRect {
  const stored = (doc as MarksDoc & { unfiledLayout?: MarksWindowRect }).unfiledLayout;
  return stored ? clampWindowRect(stored) : tileRect(rootCount);
}

export function whiteboardWindowRect(board: MarkWhiteboard, index = 0): MarksWindowRect {
  const tiled = tileRect(index);
  return {
    x: hasWindowOrigin(board) ? Math.max(0, Math.round(board.x)) : tiled.x,
    y: hasWindowOrigin(board) ? Math.max(0, Math.round(board.y)) : tiled.y,
    w: Math.max(MIN_WHITEBOARD_W, Math.round(board.w || DEFAULT_WHITEBOARD_W)),
    h: Math.max(MIN_WHITEBOARD_H, Math.round(board.h || DEFAULT_WHITEBOARD_H)),
  };
}

export function setWhiteboardLayout(doc: MarksDoc, id: string, rect: MarksWindowRect, now: number): MarksDoc {
  if (!(doc.whiteboards ?? []).some((row) => row.id === id)) return doc;
  const snapped = snapWindowRect({
    ...clampWindowRect(rect),
    w: Math.max(MIN_WHITEBOARD_W, rect.w),
    h: Math.max(MIN_WHITEBOARD_H, rect.h),
  });
  return persistDoc({
    ...doc,
    updatedAt: now,
    whiteboards: (doc.whiteboards ?? []).map((row) =>
      row.id === id ? { ...row, x: snapped.x, y: snapped.y, w: snapped.w, h: snapped.h } : row
    ),
  });
}
