/**
 * Category window geometry + persistence helpers.
 * Lives beside model.ts so folder/link drag work can keep changing the core model.
 * Extra `w`/`h` (and `unfiledLayout`) ride on the JSON doc even if MarkCategory
 * does not list them — persistDoc spreads the category objects as-is.
 */

import {
  DEFAULT_TABLE_H,
  DEFAULT_TABLE_W,
  persistDoc,
  type MarkCategory,
  type MarkTable,
  type MarksDoc,
} from './model';

export const MIN_WINDOW_W = 220;
export const MIN_WINDOW_H = 160;
export const MIN_TABLE_W = 360;
export const MIN_TABLE_H = 240;
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

export function clampWindowRect(
  rect: Partial<MarksWindowRect> & Pick<MarksWindowRect, 'x' | 'y'>,
  mins?: { w?: number; h?: number }
): MarksWindowRect {
  const minW = mins?.w ?? MIN_WINDOW_W;
  const minH = mins?.h ?? MIN_WINDOW_H;
  const fallbackW = minW > MIN_WINDOW_W ? DEFAULT_TABLE_W : DEFAULT_WINDOW_W;
  const fallbackH = minH > MIN_WINDOW_H ? DEFAULT_TABLE_H : DEFAULT_WINDOW_H;
  const w = Math.max(minW, Math.round(Number.isFinite(rect.w) ? (rect.w as number) : fallbackW));
  const h = Math.max(minH, Math.round(Number.isFinite(rect.h) ? (rect.h as number) : fallbackH));
  return {
    x: Math.max(0, Math.round(Number.isFinite(rect.x) ? rect.x : 0)),
    y: Math.max(0, Math.round(Number.isFinite(rect.y) ? rect.y : 0)),
    w,
    h,
  };
}

export function snapWindowRect(
  rect: MarksWindowRect,
  grid = SNAP_GRID,
  mins?: { w?: number; h?: number }
): MarksWindowRect {
  const minW = mins?.w ?? MIN_WINDOW_W;
  const minH = mins?.h ?? MIN_WINDOW_H;
  return clampWindowRect(
    {
      x: snapCoord(rect.x, grid),
      y: snapCoord(rect.y, grid),
      w: Math.max(minW, snapCoord(rect.w, grid)),
      h: Math.max(minH, snapCoord(rect.h, grid)),
    },
    mins
  );
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

export function applyResize(
  orig: MarksWindowRect,
  edge: ResizeEdge,
  dx: number,
  dy: number,
  mins?: { w?: number; h?: number }
): MarksWindowRect {
  const minW = mins?.w ?? MIN_WINDOW_W;
  const minH = mins?.h ?? MIN_WINDOW_H;
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
  if (w < minW) {
    if (edge.includes('w')) x = orig.x + orig.w - minW;
    w = minW;
  }
  if (h < minH) {
    if (edge.includes('n')) y = orig.y + orig.h - minH;
    h = minH;
  }
  return clampWindowRect({ x, y, w, h }, mins);
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
  const tableSource = Array.isArray(source?.tables) ? source.tables : doc.tables;
  const tableRaw = new Map<string, Record<string, unknown>>();
  if (Array.isArray(tableSource)) {
    for (const row of tableSource) {
      const rec = asRecord(row);
      if (rec?.id) tableRaw.set(String(rec.id), rec);
    }
  }
  const tables = (doc.tables ?? []).map((table) => {
    const rawRow = tableRaw.get(table.id);
    const layout = rawRow ? readLayoutFields(rawRow) : { x: table.x, y: table.y, w: table.w, h: table.h };
    const origin = hasWindowOrigin({ x: layout.x || table.x, y: layout.y || table.y });
    const tiled = tileRect(n);
    n += 1;
    return {
      ...table,
      ...clampWindowRect(
        {
          x: origin ? layout.x || table.x : tiled.x,
          y: origin ? layout.y || table.y : tiled.y,
          w: layout.w || table.w || DEFAULT_TABLE_W,
          h: layout.h || table.h || DEFAULT_TABLE_H,
        },
        { w: MIN_TABLE_W, h: MIN_TABLE_H }
      ),
    };
  });
  return persistDoc({ ...doc, categories, tables, unfiledLayout } as MarksDoc);
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

export function tableWindowRect(table: MarkTable, index = 0): MarksWindowRect {
  const tiled = tileRect(index);
  return clampWindowRect(
    {
      x: hasWindowOrigin(table) ? table.x : tiled.x,
      y: hasWindowOrigin(table) ? table.y : tiled.y,
      w: table.w || DEFAULT_TABLE_W,
      h: table.h || DEFAULT_TABLE_H,
    },
    { w: MIN_TABLE_W, h: MIN_TABLE_H }
  );
}

export function setTableLayout(doc: MarksDoc, id: string, rect: MarksWindowRect, now: number): MarksDoc {
  if (!(doc.tables ?? []).some((row) => row.id === id)) return doc;
  const next = snapWindowRect(clampWindowRect(rect, { w: MIN_TABLE_W, h: MIN_TABLE_H }), SNAP_GRID, {
    w: MIN_TABLE_W,
    h: MIN_TABLE_H,
  });
  return persistDoc({
    ...doc,
    updatedAt: now,
    tables: (doc.tables ?? []).map((row) =>
      row.id === id ? { ...row, x: next.x, y: next.y, w: next.w, h: next.h } : row
    ),
  });
}
