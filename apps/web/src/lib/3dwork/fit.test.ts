import { describe, expect, it } from 'vitest';
import { cubeSoup } from './fixtures';
import { fitTogether, maxOverlapShift } from './fit';

function translateSoup(soup: Float32Array, dx: number, dy: number, dz: number): Float32Array {
  const out = Float32Array.from(soup);
  for (let i = 0; i + 2 < out.length; i += 3) {
    out[i] += dx;
    out[i + 1] += dy;
    out[i + 2] += dz;
  }
  return out;
}

describe('maxOverlapShift', () => {
  it('does not move when the intervals already overlap maximally', () => {
    expect(maxOverlapShift(0, 10, 0, 10)).toBe(0);
  });

  it('slides a smaller interval inside a larger one, preferring no move', () => {
    expect(maxOverlapShift(0, 10, 2, 5)).toBe(0);
    expect(maxOverlapShift(0, 10, 8, 12)).toBe(-2);
  });
});

describe('fitTogether', () => {
  it('closes a gap between two cube halves on X and reports high contact', () => {
    const left = cubeSoup(10);
    const right = translateSoup(cubeSoup(10), 10.4, 0, 0);
    const result = fitTogether(left, right);

    expect(result.delta.x).toBeCloseTo(-0.4, 2);
    expect(result.delta.y).toBeCloseTo(0, 2);
    expect(result.delta.z).toBeCloseTo(0, 2);
    expect(result.contactPercent).toBeGreaterThan(90);
    expect(result.axis).toBe('x');
  });

  it('slides a sideways-offset half back onto the cut face', () => {
    const left = cubeSoup(10);
    const right = translateSoup(cubeSoup(10), 10.5, 3, 0);
    const result = fitTogether(left, right);

    expect(result.delta.x).toBeCloseTo(-0.5, 2);
    expect(result.delta.y).toBeCloseTo(-3, 2);
    expect(result.contactPercent).toBeGreaterThan(90);
  });

  it('leaves two cubes that already touch nearly still', () => {
    const left = cubeSoup(10);
    const right = translateSoup(cubeSoup(10), 10, 0, 0);
    const result = fitTogether(left, right);

    expect(Math.hypot(result.delta.x, result.delta.y, result.delta.z)).toBeLessThan(0.05);
    expect(result.contactPercent).toBeGreaterThan(90);
  });

  it('closes a gap between stacked cubes on Y', () => {
    const bottom = cubeSoup(10);
    const top = translateSoup(cubeSoup(10), 0, 10.3, 0);
    const result = fitTogether(bottom, top);

    expect(result.delta.x).toBeCloseTo(0, 2);
    expect(result.delta.y).toBeCloseTo(-0.3, 2);
    expect(result.contactPercent).toBeGreaterThan(90);
    expect(result.axis).toBe('y');
  });
});
