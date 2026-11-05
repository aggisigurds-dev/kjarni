import { describe, expect, it } from 'vitest';
import { FINISHES, finishById, lookFor } from './finish';

describe('finishes', () => {
  it('names Gold, Chrome, Brushed steel, Silver and Bronze', () => {
    expect(FINISHES.map((finish) => finish.id)).toEqual(['gold', 'chrome', 'brushed-steel', 'silver', 'bronze']);
  });

  it('makes silver a polished metal and bronze a warm, darker one', () => {
    expect(lookFor({ color: '#000', finishId: 'silver' }).metalness).toBe(1);
    expect(finishById('silver')?.texture).toBeNull();
    expect(finishById('bronze')?.roughness).toBeGreaterThan(finishById('gold')!.roughness);
  });

  it('makes chrome a mirror and gold a warm metal', () => {
    expect(finishById('chrome')?.roughness).toBeLessThan(0.1);
    expect(finishById('gold')?.color.toLowerCase()).toBe('#d4af37');
    const look = lookFor({ color: '#d4af37', finishId: 'gold' });
    expect(look.metalness).toBeGreaterThan(0.8);
  });
});
