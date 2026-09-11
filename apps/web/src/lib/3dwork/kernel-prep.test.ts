import { describe, expect, it } from 'vitest';
import { cubeSoup } from './fixtures';
import {
  capLoops,
  dropDuplicateFaces,
  findBoundaries,
  kernelToSoup,
  weldExact,
  type KernelMesh,
} from './kernel-prep';

function signedVolume({ positions: p, indices }: KernelMesh): number {
  let volume = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3;
    const b = indices[t + 1] * 3;
    const c = indices[t + 2] * 3;
    volume +=
      (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) -
        p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) +
        p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) /
      6;
  }
  return volume;
}

/** The cube with its two +Z triangles taken out. */
function openCube(): Float32Array {
  const cube = cubeSoup(10);
  return new Float32Array([...cube.subarray(0, 18), ...cube.subarray(36)]);
}

describe('weldExact', () => {
  it('turns a cube soup into eight shared corners', () => {
    const { mesh, report } = weldExact(cubeSoup(10));
    expect(report.vertices).toBe(8);
    expect(report.degenerate).toBe(0);
    expect(mesh.indices.length).toBe(36);
  });

  it('never moves a vertex', () => {
    const soup = cubeSoup(3.3);
    const { mesh } = weldExact(soup);
    expect(Array.from(kernelToSoup(mesh.positions, mesh.indices))).toEqual(Array.from(soup));
  });

  it('treats -0 and +0 as the same corner', () => {
    const soup = cubeSoup(10);
    for (let i = 0; i < soup.length; i += 2) if (soup[i] === 0) soup[i] = -0;
    expect(weldExact(soup).report.vertices).toBe(8);
  });

  it('drops a triangle whose corners land on each other', () => {
    const soup = new Float32Array([...cubeSoup(10), 0, 0, 0, 10, 0, 0, 10, 0, 0]);
    const { mesh, report } = weldExact(soup);
    expect(report.degenerate).toBe(1);
    expect(mesh.indices.length).toBe(36);
  });
});

describe('dropDuplicateFaces', () => {
  it('keeps one copy of a face drawn twice', () => {
    const cube = cubeSoup(10);
    const soup = new Float32Array([...cube, ...cube.subarray(0, 9)]);
    const result = dropDuplicateFaces(weldExact(soup).mesh);
    expect(result.duplicates).toBe(1);
    expect(result.mesh.indices.length).toBe(36);
  });

  it('cancels a face against its own reverse', () => {
    const cube = cubeSoup(10);
    const reversed = [...cube.subarray(0, 3), ...cube.subarray(6, 9), ...cube.subarray(3, 6)];
    const soup = new Float32Array([...cube, ...reversed]);
    const result = dropDuplicateFaces(weldExact(soup).mesh);
    expect(result.duplicates).toBe(2);
    expect(result.mesh.indices.length).toBe(33);
  });
});

describe('findBoundaries', () => {
  it('finds nothing open on a closed cube', () => {
    const report = findBoundaries(weldExact(cubeSoup(10)).mesh);
    expect(report).toMatchObject({ boundaryEdges: 0, nonManifoldEdges: 0, openChains: 0 });
    expect(report.loops).toEqual([]);
  });

  it('traces the hole a missing face leaves as one closed loop', () => {
    const report = findBoundaries(weldExact(openCube()).mesh);
    expect(report.boundaryEdges).toBe(4);
    expect(report.loops).toHaveLength(1);
    expect(report.loops[0]).toHaveLength(4);
    expect(report.openChains).toBe(0);
  });
});

describe('capLoops', () => {
  it('caps the hole so the cube is closed again, facing outward', () => {
    const { mesh } = weldExact(openCube());
    const capped = capLoops(mesh, findBoundaries(mesh).loops);
    expect(capped).toMatchObject({ capped: 1, added: 2 });
    expect(findBoundaries(capped.mesh)).toMatchObject({ boundaryEdges: 0, nonManifoldEdges: 0 });
    expect(signedVolume(capped.mesh)).toBeCloseTo(1000, 3);
  });

  it('falls back to a fan around a new centre point for long loops', () => {
    const { mesh } = weldExact(openCube());
    const capped = capLoops(mesh, findBoundaries(mesh).loops, { maxEarClip: 3 });
    expect(capped).toMatchObject({ capped: 1, added: 4 });
    expect(capped.mesh.positions.length / 3).toBe(9);
    expect(findBoundaries(capped.mesh).boundaryEdges).toBe(0);
    expect(signedVolume(capped.mesh)).toBeCloseTo(1000, 3);
  });
});
