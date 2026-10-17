import { describe, expect, it } from 'vitest';
import { computeBounds } from './mesh';
import { simplifySoup } from './preview-mesh';

/** A closed box of `n`×`n` squares on each side: 12·n² triangles. */
function finelyMeshedBox(size: number, n: number): Float32Array {
  const out: number[] = [];
  const step = size / n;
  // Each face: axis it faces, and the sign.
  for (const [axis, sign] of [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]] as const) {
    const u = (axis + 1) % 3;
    const v = (axis + 2) % 3;
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        const corner = (a: number, b: number) => {
          const p = [0, 0, 0];
          p[axis] = sign > 0 ? size : 0;
          p[u] = a * step;
          p[v] = b * step;
          return p;
        };
        const [p00, p10, p11, p01] = [corner(i, j), corner(i + 1, j), corner(i + 1, j + 1), corner(i, j + 1)];
        out.push(...p00, ...p10, ...p11, ...p00, ...p11, ...p01);
      }
    }
  }
  return new Float32Array(out);
}

describe('simplifySoup', () => {
  it('leaves a mesh that is light enough as it is', () => {
    const box = finelyMeshedBox(10, 2);
    expect(simplifySoup(box, 1000)).toBe(box);
  });

  it('brings a heavy mesh under the budget and keeps its outline', () => {
    const box = finelyMeshedBox(100, 60); // 43 200 triangles
    const light = simplifySoup(box, 5000);
    expect(light.length / 9).toBeLessThanOrEqual(5000 * 1.15);
    expect(light.length / 9).toBeGreaterThan(500);
    const before = computeBounds(box);
    const after = computeBounds(light);
    for (let axis = 0; axis < 3; axis += 1) {
      expect(after.size[axis]).toBeGreaterThan(before.size[axis] * 0.9);
      expect(after.center[axis]).toBeCloseTo(before.center[axis], 0);
    }
  });

  it('drops no part of the surface into a degenerate triangle', () => {
    const light = simplifySoup(finelyMeshedBox(50, 40), 3000);
    for (let t = 0; t < light.length / 9; t += 1) {
      const o = t * 9;
      const same = (a: number, b: number) =>
        light[o + a] === light[o + b] && light[o + a + 1] === light[o + b + 1] && light[o + a + 2] === light[o + b + 2];
      expect(same(0, 3) || same(3, 6) || same(0, 6)).toBe(false);
    }
  });
});
