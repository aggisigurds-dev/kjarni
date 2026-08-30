import { describe, expect, it } from 'vitest';
import { normalizeDoc, seedDoc } from './model';
import {
  DEFAULT_WINDOW_H,
  DEFAULT_WINDOW_W,
  MIN_WINDOW_H,
  MIN_WINDOW_W,
  applyMove,
  applyResize,
  clampWindowRect,
  layoutMissingWindows,
  setCategoryLayout,
  setUnfiledLayout,
  snapWindowRect,
  tileRect,
} from './windows';

describe('category window layout', () => {
  it('clamps below the usable minimum', () => {
    const rect = clampWindowRect({ x: -40, y: -8, w: 40, h: 20 });
    expect(rect.x).toBe(0);
    expect(rect.y).toBe(0);
    expect(rect.w).toBe(MIN_WINDOW_W);
    expect(rect.h).toBe(MIN_WINDOW_H);
  });

  it('snaps to the 8px grid', () => {
    expect(snapWindowRect({ x: 13, y: 19, w: 327, h: 401 })).toEqual({
      x: 16,
      y: 16,
      w: 328,
      h: 400,
    });
  });

  it('moves and resizes from edges without shrinking past the minimum', () => {
    const origin = { x: 80, y: 80, w: 240, h: 200 };
    expect(applyMove(origin, 12, -20)).toEqual({ x: 92, y: 60, w: 240, h: 200 });
    const west = applyResize(origin, 'w', 80, 0);
    expect(west.w).toBe(MIN_WINDOW_W);
    expect(west.x).toBe(80 + 240 - MIN_WINDOW_W);
    const south = applyResize(origin, 'se', 40, 50);
    expect(south).toEqual({ x: 80, y: 80, w: 280, h: 250 });
  });

  it('tiles a default grid and fills missing size on old docs', () => {
    expect(tileRect(0)).toMatchObject({ x: 0, y: 0, w: DEFAULT_WINDOW_W, h: DEFAULT_WINDOW_H });
    expect(tileRect(3).y).toBeGreaterThan(0);

    const raw = {
      updatedAt: 4,
      categories: [
        { id: 'cat_kjarni', name: 'Kjarni', sort: 0 },
        { id: 'cat_apps', name: 'Apps', sort: 1, layout: { x: 400, y: 16, w: 280, h: 200 } },
      ],
      links: [{ id: 'lnk_hub', categoryId: 'cat_kjarni', title: 'Hub', url: '/kjarni', note: '', sort: 0 }],
    };
    const doc = layoutMissingWindows(normalizeDoc(raw)!, raw);
    expect(doc.categories[0]?.x).toBe(0);
    expect((doc.categories[0] as { w?: number }).w).toBe(DEFAULT_WINDOW_W);
    expect(doc.categories[1]?.x).toBe(400);
    expect((doc.categories[1] as { h?: number }).h).toBe(200);
    expect((doc as { unfiledLayout?: { w: number } }).unfiledLayout?.w).toBeGreaterThanOrEqual(MIN_WINDOW_W);
  });

  it('persists a window move and unfiled chrome', () => {
    const seeded = layoutMissingWindows(seedDoc(1));
    const moved = setCategoryLayout(seeded, 'cat_kjarni', { x: 64, y: 32, w: 304, h: 240 }, 9);
    expect(moved.categories.find((row) => row.id === 'cat_kjarni')).toMatchObject({
      x: 64,
      y: 32,
      w: 304,
      h: 240,
    });
    const next = setUnfiledLayout(moved, { x: 24, y: 16, w: 264, h: 184 }, 10);
    expect((next as { unfiledLayout?: unknown }).unfiledLayout).toEqual({ x: 24, y: 16, w: 264, h: 184 });
  });
});
