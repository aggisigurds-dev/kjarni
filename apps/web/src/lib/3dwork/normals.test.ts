import { describe, expect, it } from 'vitest';
import { smoothNormals } from './normals';
import { cubeSoup } from './fixtures';

/** A closed cylinder around the X axis, flat-shaded by construction. */
function cylinder(radius = 10, length = 40, segments = 32): Float32Array {
  const out: number[] = [];
  const at = (s: number, x: number): [number, number, number] => {
    const a = (s / segments) * Math.PI * 2;
    return [x, Math.cos(a) * radius, Math.sin(a) * radius];
  };
  for (let s = 0; s < segments; s++) {
    const a = at(s, 0);
    const b = at(s + 1, 0);
    const c = at(s, length);
    const d = at(s + 1, length);
    out.push(...a, ...b, ...c, ...b, ...d, ...c);
    // Flat ends, so the mesh has genuine sharp edges to preserve.
    out.push(0, 0, 0, ...b, ...a);
    out.push(length, 0, 0, ...c, ...d);
  }
  return new Float32Array(out);
}

const normalAt = (normals: Float32Array, corner: number): [number, number, number] => [
  normals[corner * 3],
  normals[corner * 3 + 1],
  normals[corner * 3 + 2],
];

describe('smoothNormals', () => {
  it('points every normal outward from a cylinder axis', () => {
    const soup = cylinder();
    const normals = smoothNormals(soup);

    for (let c = 0; c < soup.length / 3; c++) {
      const [nx, ny, nz] = normalAt(normals, c);
      expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 4);
    }
  });

  it('gives neighbouring facets of a round surface almost the same normal', () => {
    // The whole point: adjacent wall triangles differ by the facet angle when
    // flat-shaded, which is what makes the strips visible.
    const segments = 32;
    const soup = cylinder(10, 40, segments);
    const normals = smoothNormals(soup);

    // Corner 1 and corner 3 sit on the same seam between two wall facets.
    const [ax, ay, az] = normalAt(normals, 1);
    const [bx, by, bz] = normalAt(normals, 3);
    expect(ax * bx + ay * by + az * bz).toBeCloseTo(1, 5);
  });

  it('leaves the sharp rim between wall and end cap alone', () => {
    const soup = cylinder();
    const normals = smoothNormals(soup);

    // A cap corner faces down the axis; a wall corner faces out from it. Were
    // the two averaged together, neither would.
    let capCorner = -1;
    for (let t = 0; t < soup.length / 9; t++) {
      // The cap triangles are the ones with a corner exactly on the axis.
      if (soup[t * 9 + 1] === 0 && soup[t * 9 + 2] === 0) {
        capCorner = t * 3;
        break;
      }
    }
    expect(capCorner).toBeGreaterThanOrEqual(0);

    const [nx, ny, nz] = normalAt(normals, capCorner);
    expect(Math.abs(nx)).toBeCloseTo(1, 4);
    expect(Math.hypot(ny, nz)).toBeCloseTo(0, 4);
  });

  it('keeps a cube perfectly sharp', () => {
    const soup = cubeSoup(10);
    const normals = smoothNormals(soup);

    // Every normal should still be an axis direction, not a smeared diagonal.
    for (let c = 0; c < soup.length / 3; c++) {
      const [nx, ny, nz] = normalAt(normals, c);
      const axes = [Math.abs(nx), Math.abs(ny), Math.abs(nz)].filter((v) => v > 0.001);
      expect(axes).toHaveLength(1);
      expect(axes[0]).toBeCloseTo(1, 5);
    }
  });

  it('smooths everything at a wide enough crease angle', () => {
    const normals = smoothNormals(cubeSoup(10), 120);
    // A cube corner now averages its three faces into a diagonal.
    const [nx, ny, nz] = normalAt(normals, 0);
    expect(Math.abs(nx)).toBeCloseTo(Math.abs(ny), 4);
    expect(Math.abs(ny)).toBeCloseTo(Math.abs(nz), 4);
  });

  it('survives an empty mesh', () => {
    expect(smoothNormals(new Float32Array(0))).toHaveLength(0);
  });
});
