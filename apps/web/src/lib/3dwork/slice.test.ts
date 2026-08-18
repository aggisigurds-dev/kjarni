import { describe, expect, it } from 'vitest';
import { cubeSoup } from './fixtures';
import { computeBounds, inspect } from './mesh';
import { slicePlane } from './slice';

describe('slicePlane', () => {
  it('cuts a cube in half and closes both halves', () => {
    const { keep, cut, report } = slicePlane(cubeSoup(20), { axis: 'x', position: 10 });

    // Both halves are still solids in their own right.
    expect(inspect(keep.soup).watertight).toBe(true);
    expect(inspect(cut.soup).watertight).toBe(true);

    // 4000 mm3 each, and positive — a negative volume would mean the cap
    // turned the piece inside out.
    expect(inspect(keep.soup).signedVolume).toBeCloseTo(4000, 3);
    expect(inspect(cut.soup).signedVolume).toBeCloseTo(4000, 3);
    // One cross-section loop, used to cap both halves with opposite winding.
    expect(report.capLoops).toBe(1);
    expect(report.openLoops).toBe(0);
  });

  it('gives each half the right bounding box', () => {
    const { keep, cut } = slicePlane(cubeSoup(20), { axis: 'x', position: 15 });

    expect(computeBounds(keep.soup).size[0]).toBeCloseTo(5, 5);
    expect(computeBounds(cut.soup).size[0]).toBeCloseTo(15, 5);
    // The untouched axes are exactly as they were.
    expect(computeBounds(keep.soup).size[1]).toBeCloseTo(20, 5);
    expect(computeBounds(cut.soup).size[2]).toBeCloseTo(20, 5);
  });

  it('passes untouched triangles through verbatim', () => {
    // A plane clear of the part leaves every triangle on one side, unmodified.
    const soup = cubeSoup(20);
    const { keep, cut, report } = slicePlane(soup, { axis: 'x', position: 100 });

    expect(report.trianglesSplit).toBe(0);
    expect(keep.triangles).toBe(0);
    expect(Array.from(cut.soup)).toEqual(Array.from(soup));
  });

  it('only splits the triangles that actually cross the plane', () => {
    const { report } = slicePlane(cubeSoup(20), { axis: 'x', position: 10 });

    // The two faces parallel to the cut are untouched; the other four are
    // crossed, two triangles each.
    expect(report.trianglesSplit).toBe(8);
    expect(report.trianglesBefore).toBe(12);
  });

  it('can leave the cross-section open when asked', () => {
    const { keep, report } = slicePlane(cubeSoup(20), {
      axis: 'y',
      position: 10,
      cap: false,
    });

    expect(report.capTriangles).toBe(0);
    expect(inspect(keep.soup).boundaryEdges).toBeGreaterThan(0);
  });

  it('caps a concave cross-section without spilling outside it', () => {
    // An L-shape: two overlapping blocks whose union is concave, so a fan
    // triangulation would put material where there is none.
    const a = cubeSoup(20);
    const b = Float32Array.from(cubeSoup(20), (v, i) =>
      i % 3 === 0 ? v + 20 : i % 3 === 1 ? v : v
    );
    const l = new Float32Array(a.length + b.length);
    l.set(a, 0);
    l.set(b, a.length);

    const { keep, cut } = slicePlane(l, { axis: 'y', position: 10 });

    // Volume is conserved across the cut, which it would not be if the caps
    // covered area outside the material.
    const total =
      Math.abs(inspect(keep.soup).signedVolume) + Math.abs(inspect(cut.soup).signedVolume);
    expect(total).toBeCloseTo(16000, 2);
  });

  it('handles an empty mesh', () => {
    const { report } = slicePlane(new Float32Array(0), { axis: 'x', position: 0 });
    expect(report.trianglesBefore).toBe(0);
    expect(report.capTriangles).toBe(0);
  });
});
