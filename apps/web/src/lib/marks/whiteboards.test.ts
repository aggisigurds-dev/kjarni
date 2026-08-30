import { describe, expect, it } from 'vitest';
import { applyItemMove, applyItemResize, clampItemRect, imageUrlFromText } from './whiteboards';

describe('whiteboard item geometry', () => {
  const bounds = { w: 400, h: 300 };

  it('clamps inside the canvas', () => {
    expect(clampItemRect({ x: -20, y: -8, w: 80, h: 60 }, bounds)).toEqual({ x: 0, y: 0, w: 80, h: 60 });
    expect(clampItemRect({ x: 390, y: 280, w: 80, h: 60 }, bounds)).toEqual({ x: 320, y: 240, w: 80, h: 60 });
  });

  it('moves and resizes from corners without collapsing', () => {
    const origin = { x: 40, y: 40, w: 120, h: 80 };
    expect(applyItemMove(origin, 20, -10, bounds)).toEqual({ x: 60, y: 30, w: 120, h: 80 });
    const se = applyItemResize(origin, 'se', 40, 20, bounds);
    expect(se).toEqual({ x: 40, y: 40, w: 160, h: 100 });
    const nw = applyItemResize(origin, 'nw', 200, 200, bounds);
    expect(nw.w).toBe(32);
    expect(nw.h).toBe(32);
    expect(nw.x).toBe(40 + 120 - 32);
    expect(nw.y).toBe(40 + 80 - 32);
  });

  it('accepts pasted image URLs', () => {
    expect(imageUrlFromText('https://cdn.example.com/icon.png')).toBe('https://cdn.example.com/icon.png');
    expect(imageUrlFromText('not a url')).toBe('');
    expect(imageUrlFromText('https://example.com/page')).toBe('');
  });
});
