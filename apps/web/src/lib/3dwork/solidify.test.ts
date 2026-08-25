import { describe, expect, it } from 'vitest';
import { cubeSoup } from './fixtures';
import { computeBounds, inspect } from './mesh';
import { makeSolid, subtractMesh, unionMesh } from './solidify';

/** Punch a chunk out of a cube: several missing faces, not just one triangle. */
function shatteredCube(size = 20): Float32Array {
  const soup = cubeSoup(size);
  const kept = Array.from(soup);
  // Drop the entire +Z face and one triangle of -Y.
  kept.splice(4 * 9, 9);
  kept.splice(2 * 9, 9);
  kept.splice(0, 9);
  return new Float32Array(kept);
}

/** Two overlapping cubes — a union that no mesh boolean has been applied to. */
function overlappingCubes(): Float32Array {
  const a = cubeSoup(20);
  const b = Float32Array.from(cubeSoup(20), (v, i) => (i % 3 === 0 ? v + 12 : v));
  const out = new Float32Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

describe('makeSolid', () => {
  it('closes a mesh that is missing whole faces', () => {
    const broken = shatteredCube(20);
    expect(inspect(broken).watertight).toBe(false);
    expect(inspect(broken).boundaryEdges).toBeGreaterThan(0);

    const { report } = makeSolid(broken, { resolution: 48, sealMm: 2 });

    // The rebuilt shell has no open edges at all, whatever the input had.
    expect(report.after.boundaryEdges).toBe(0);
    expect(report.after.inconsistentEdges).toBe(0);
    expect(report.trianglesAfter).toBeGreaterThan(0);
  });

  it('keeps the part roughly its original size', () => {
    const { soup } = makeSolid(cubeSoup(20), { resolution: 64, sealMm: 0 });
    const size = computeBounds(soup).size;

    // Voxelising rounds outward by up to a voxel on each side.
    for (const axis of size) {
      expect(axis).toBeGreaterThan(19);
      expect(axis).toBeLessThan(23);
    }
  });

  it('encloses a volume close to the original solid', () => {
    const { report } = makeSolid(cubeSoup(20), { resolution: 64, sealMm: 0 });

    // 20 mm cube is 8000 mm3; allow the voxel grid its rounding.
    expect(report.volume).toBeGreaterThan(7000);
    expect(report.volume).toBeLessThan(11000);
  });

  it('unions overlapping parts into one solid instead of leaving them crossing', () => {
    const crossing = overlappingCubes();

    // Worth being precise about: two shells ploughed through each other are
    // each individually closed and manifold, so the topology checks see
    // nothing wrong at all. Self-intersection is invisible to edge counting —
    // which is why a mesh can pass every check and still slice badly.
    const topology = inspect(crossing);
    expect(topology.boundaryEdges).toBe(0);
    expect(topology.nonManifoldEdges).toBe(0);

    const { report } = makeSolid(crossing, { resolution: 64, sealMm: 0 });

    expect(report.after.boundaryEdges).toBe(0);
    // The union is one 32 x 20 x 20 block (12,800 mm3), not two 8,000 mm3
    // cubes counted twice — the overlap is absorbed rather than double-filled.
    expect(report.volume).toBeGreaterThan(11000);
    expect(report.volume).toBeLessThan(16000);
  });

  it('bores a hole right through when given a cut', () => {
    const plain = makeSolid(cubeSoup(40), { resolution: 64, sealMm: 0 });
    const bored = makeSolid(cubeSoup(40), {
      resolution: 64,
      sealMm: 0,
      cuts: [{ axis: 'z', diameter: 16, center: [20, 20] }],
    });

    expect(bored.report.cutVoxels).toBeGreaterThan(0);
    // A 16 mm bore through 40 mm removes about 8000 mm3.
    const removed = plain.report.volume - bored.report.volume;
    expect(removed).toBeGreaterThan(5000);
    expect(removed).toBeLessThan(11000);
    // And the result is still a closed surface.
    expect(bored.report.after.boundaryEdges).toBe(0);
  });

  it('seals gaps up to the requested size and reports the voxel count', () => {
    const { report } = makeSolid(shatteredCube(20), { resolution: 48, sealMm: 2 });

    expect(report.sealVoxels).toBeGreaterThan(0);
    expect(report.voxelSize).toBeGreaterThan(0);
  });

  // Deliberately builds the largest grid the clamp allows, so it is slow by
  // design and needs more than the default five seconds on a modest machine.
  it('does not blow past its memory ceiling on a silly resolution', () => {
    const { report } = makeSolid(cubeSoup(20), { resolution: 4000, sealMm: 0 });
    const cells = report.grid[0] * report.grid[1] * report.grid[2];

    expect(cells).toBeLessThanOrEqual(12_000_000);
  }, 30_000);

  it('survives an empty mesh rather than throwing', () => {
    const { report } = makeSolid(new Float32Array(0), { resolution: 32, sealMm: 0 });
    expect(report.trianglesAfter).toBe(0);
  });
});

describe('subtractMesh', () => {
  it('cuts a chunk out of a cube and reports the overlap', () => {
    const target = cubeSoup(20);
    const tool = Float32Array.from(cubeSoup(20), (v, i) => (i % 3 === 0 ? v + 10 : v));
    const { soup, report } = subtractMesh(target, tool, { resolution: 48, sealMm: 0, clearanceMm: 0 });

    expect(report.missed).toBe(false);
    expect(report.overlapVoxels).toBeGreaterThan(0);
    expect(report.trianglesAfter).toBeGreaterThan(0);
    expect(soup.length).toBeGreaterThan(0);

    const size = computeBounds(soup).size;
    // The remaining block is roughly 10 × 20 × 20, not a 20 mm cube.
    expect(size[0]).toBeLessThan(16);
    expect(size[1]).toBeGreaterThan(16);
  });

  it('returns an empty mesh when the parts do not overlap', () => {
    const target = cubeSoup(20);
    const tool = Float32Array.from(cubeSoup(10), (v, i) => (i % 3 === 0 ? v + 40 : v));
    const { soup, report } = subtractMesh(target, tool, { resolution: 32, sealMm: 0, clearanceMm: 0 });

    expect(report.missed).toBe(true);
    expect(report.overlapVoxels).toBe(0);
    expect(soup.length).toBe(0);
  });

  it('does not grow the cutter when clearance is 0 mm', () => {
    const target = cubeSoup(20);
    const tool = Float32Array.from(cubeSoup(20), (v, i) => (i % 3 === 0 ? v + 10 : v));
    const exact = subtractMesh(target, tool, { resolution: 48, sealMm: 0, clearanceMm: 0 });
    const loose = subtractMesh(target, tool, { resolution: 48, sealMm: 0, clearanceMm: 2 });

    expect(exact.report.clearanceVoxels).toBe(0);
    expect(loose.report.clearanceVoxels).toBeGreaterThan(0);
    expect(computeBounds(exact.soup).size[0]).toBeGreaterThan(computeBounds(loose.soup).size[0]);
  });
});

describe('unionMesh', () => {
  it('fuses overlapping cubes into one solid', () => {
    const a = cubeSoup(20);
    const b = Float32Array.from(cubeSoup(20), (v, i) => (i % 3 === 0 ? v + 12 : v));
    const { report } = unionMesh([a, b], { resolution: 64, sealMm: 0 });

    expect(report.after.boundaryEdges).toBe(0);
    expect(report.volume).toBeGreaterThan(11000);
    expect(report.volume).toBeLessThan(16000);
  });
});
