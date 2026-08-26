import { describe, expect, it } from 'vitest';
import { computeBounds, weld } from './mesh';
import { cubeSoup } from './fixtures';
import { applyPrintTexture, tessellateSoup, textureForFinish } from './texture';

describe('tessellateSoup', () => {
  it('splits a coarse cube until edges fit the grain', () => {
    const soup = cubeSoup(10);
    const tessellated = tessellateSoup(soup, 2);
    expect(tessellated.length / 9).toBeGreaterThan(12);
    expect(tessellated.length % 9).toBe(0);
  });

  it('respects the triangle budget', () => {
    const tessellated = tessellateSoup(cubeSoup(40), 0.5, 400);
    // In-flight 4-way splits can overshoot by a handful of leaves.
    expect(tessellated.length / 9).toBeLessThanOrEqual(432);
  });
});

describe('applyPrintTexture', () => {
  it('embosses brushed grooves as real displacement, not a shader', () => {
    const soup = cubeSoup(12);
    const result = applyPrintTexture(soup, {
      kind: 'brushed',
      spacingMm: 2,
      depthMm: 0.4,
    });
    expect(result.triangles).toBeGreaterThan(result.beforeTriangles);
    expect(result.soup).not.toBe(soup);

    const before = computeBounds(soup);
    const after = computeBounds(result.soup);
    // Proud grooves grow the box a little; they must not explode it.
    expect(after.size[1]).toBeGreaterThan(before.size[1]);
    expect(after.size[1]).toBeLessThan(before.size[1] + 1.2);
  });

  it('keeps a cube watertight after knurl', () => {
    const result = applyPrintTexture(cubeSoup(10), {
      kind: 'knurl',
      spacingMm: 2,
      depthMm: 0.3,
    });
    const topology = weld(result.soup);
    // A closed cube has no boundary edges; knurl must not tear it open.
    let boundary = 0;
    const uses = new Map<string, number>();
    const { mesh } = topology;
    const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
    for (let t = 0; t < mesh.indices.length; t += 3) {
      const a = mesh.indices[t];
      const b = mesh.indices[t + 1];
      const c = mesh.indices[t + 2];
      for (const edge of [key(a, b), key(b, c), key(c, a)]) {
        uses.set(edge, (uses.get(edge) ?? 0) + 1);
      }
    }
    for (const count of uses.values()) if (count === 1) boundary++;
    expect(boundary).toBe(0);
  });

  it('gold finish defaults to a fine stipple', () => {
    expect(textureForFinish('gold').kind).toBe('stipple');
    expect(textureForFinish('brushed-steel').kind).toBe('brushed');
  });
});
