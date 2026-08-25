import { describe, expect, it } from 'vitest';
import { cubeSoup } from './fixtures';
import { alignPaintedVertices, autoFix, computeBounds, fillPaintedHoles, fixMisalignment, inspect, simplify, toSoup, weld } from './mesh';

/** A sphere-ish blob with far more triangles than its shape needs. */
function denseSphere(radius = 20, rings = 40, segments = 60): Float32Array {
  const at = (i: number, j: number): [number, number, number] => {
    const phi = (i / rings) * Math.PI;
    const theta = (j / segments) * Math.PI * 2;
    return [
      radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.sin(theta),
    ];
  };

  const out: number[] = [];
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segments; j++) {
      const a = at(i, j);
      const b = at(i + 1, j);
      const c = at(i + 1, j + 1);
      const d = at(i, j + 1);
      out.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
  }
  return new Float32Array(out);
}

/** Reverse the winding of one triangle, leaving the rest alone. */
function flipTriangle(soup: Float32Array, index: number): Float32Array {
  const copy = Float32Array.from(soup);
  const at = index * 9;
  for (let c = 0; c < 3; c++) {
    const b = copy[at + 3 + c];
    copy[at + 3 + c] = copy[at + 6 + c];
    copy[at + 6 + c] = b;
  }
  return copy;
}

/** Drop one triangle to punch a three-edge hole in the shell. */
function removeTriangle(soup: Float32Array, index: number): Float32Array {
  const kept = Array.from(soup);
  kept.splice(index * 9, 9);
  return new Float32Array(kept);
}

/**
 * Open-top L prism: 30×10 bar plus a 10×20 stem, 10 mm tall. The missing top
 * face is a concave 6-edge hole — the case a fan-from-first-vertex fill gets
 * wrong when the walk starts at the reflex corner.
 */
function openLPrism(): Float32Array {
  const bottom: [number, number, number][] = [
    [0, 0, 0],
    [30, 0, 0],
    [30, 0, 10],
    [10, 0, 10],
    [10, 0, 30],
    [0, 0, 30],
  ];
  const top = bottom.map(([x, , z]) => [x, 10, z] as [number, number, number]);
  const tris: number[] = [];
  const tri = (
    p: [number, number, number],
    q: [number, number, number],
    r: [number, number, number]
  ) => {
    tris.push(...p, ...q, ...r);
  };

  // Bottom, facing -Y.
  tri(bottom[0], bottom[1], bottom[2]);
  tri(bottom[0], bottom[2], bottom[3]);
  tri(bottom[0], bottom[3], bottom[4]);
  tri(bottom[0], bottom[4], bottom[5]);

  for (let i = 0; i < 6; i++) {
    const j = (i + 1) % 6;
    tri(bottom[i], top[i], top[j]);
    tri(bottom[i], top[j], bottom[j]);
  }

  return new Float32Array(tris);
}

/** Square base on Y=0 with an apex at Y=4 — a bump the align brush should flatten. */
function pyramidSoup(): Float32Array {
  const base: [number, number, number][] = [
    [0, 0, 0],
    [10, 0, 0],
    [10, 0, 10],
    [0, 0, 10],
  ];
  const apex: [number, number, number] = [5, 4, 5];
  const tris: number[] = [];
  const tri = (
    p: [number, number, number],
    q: [number, number, number],
    r: [number, number, number]
  ) => {
    tris.push(...p, ...q, ...r);
  };
  tri(base[0], base[1], apex);
  tri(base[1], base[2], apex);
  tri(base[2], base[3], apex);
  tri(base[3], base[0], apex);
  return new Float32Array(tris);
}

describe('weld', () => {
  it('collapses a triangle soup back onto its shared corners', () => {
    const { mesh, welded } = weld(cubeSoup(10));

    expect(mesh.indices.length).toBe(36);
    expect(mesh.positions.length / 3).toBe(8);
    expect(welded).toBe(28);
  });

  it('merges corners that straddle a hash-cell boundary', () => {
    const soup = cubeSoup(10);
    const nudged = Float32Array.from(soup);
    nudged[0] = 1e-9; // same corner, a hair off

    expect(weld(nudged).mesh.positions.length / 3).toBe(8);
  });
});

describe('inspect', () => {
  it('reports a clean cube as watertight with the right volume and area', () => {
    const topology = inspect(cubeSoup(10));

    expect(topology.watertight).toBe(true);
    expect(topology.holes).toBe(0);
    expect(topology.signedVolume).toBeCloseTo(1000, 6);
    expect(topology.area).toBeCloseTo(600, 6);
  });

  it('counts a missing triangle as one three-edge hole', () => {
    const topology = inspect(removeTriangle(cubeSoup(10), 0));

    expect(topology.watertight).toBe(false);
    expect(topology.boundaryEdges).toBe(3);
    expect(topology.holes).toBe(1);
  });

  it('flags a reversed triangle as inconsistent winding', () => {
    const topology = inspect(flipTriangle(cubeSoup(10), 5));

    expect(topology.inconsistentEdges).toBeGreaterThan(0);
    expect(topology.watertight).toBe(false);
  });
});

describe('autoFix', () => {
  it('leaves a healthy mesh alone', () => {
    const { report } = autoFix(cubeSoup(10));

    expect(report.after.watertight).toBe(true);
    expect(report.flippedTriangles).toBe(0);
    expect(report.removedDegenerate).toBe(0);
    expect(report.filledHoles).toBe(0);
    expect(report.changed).toBe(false);
    expect(report.removedShells).toBe(0);
    expect(report.crackWeld).toBe(false);
  });

  it('re-winds a flipped triangle', () => {
    const { report } = autoFix(flipTriangle(cubeSoup(10), 5));

    expect(report.before.inconsistentEdges).toBeGreaterThan(0);
    expect(report.after.inconsistentEdges).toBe(0);
    expect(report.after.watertight).toBe(true);
    expect(report.flippedTriangles).toBeGreaterThan(0);
  });

  it('turns an inside-out solid the right way round', () => {
    let soup = cubeSoup(10);
    for (let t = 0; t < 12; t++) soup = flipTriangle(soup, t);

    const { report } = autoFix(soup);

    expect(report.invertedSolid).toBe(true);
    expect(report.after.signedVolume).toBeCloseTo(1000, 6);
  });

  it('patches a hole and restores the enclosed volume', () => {
    const { report } = autoFix(removeTriangle(cubeSoup(10), 0));

    expect(report.before.holes).toBe(1);
    expect(report.filledHoles).toBe(1);
    expect(report.after.watertight).toBe(true);
    expect(report.after.signedVolume).toBeCloseTo(1000, 6);
  });

  it('drops zero-area and duplicated triangles', () => {
    const soup = cubeSoup(10);
    const withJunk = new Float32Array(soup.length + 18);
    withJunk.set(soup, 0);
    // A degenerate sliver, then a repeat of the first face.
    withJunk.set([0, 0, 0, 1, 1, 1, 2, 2, 2], soup.length);
    withJunk.set(soup.slice(0, 9), soup.length + 9);

    const { report } = autoFix(withJunk);

    expect(report.removedDegenerate).toBe(1);
    expect(report.removedDuplicateTriangles).toBe(1);
    expect(report.after.triangles).toBe(12);
  });

  it('reuses the welded result for the same array', () => {
    const soup = cubeSoup(10);
    // Second call must hit the cache and hand back the identical object.
    expect(weld(soup)).toBe(weld(soup));
  });

  it('sits the part on the table when asked', () => {
    const soup = cubeSoup(10);
    const lifted = Float32Array.from(soup, (value, i) => (i % 3 === 1 ? value + 55 : value));

    const fixed = autoFix(lifted, { dropToTable: true });

    expect(computeBounds(fixed.soup).min[1]).toBeCloseTo(0, 5);
    expect(fixed.report.changed).toBe(true);
  });

  it('does not count a no-op drop-to-table as a change', () => {
    const { report } = autoFix(cubeSoup(10), { dropToTable: true });
    expect(report.changed).toBe(false);
  });

  it('drops a stray dust triangle that is not part of the shell', () => {
    const cube = cubeSoup(10);
    const withDust = new Float32Array(cube.length + 9);
    withDust.set(cube, 0);
    withDust.set([100, 100, 100, 100.2, 100, 100, 100, 100.2, 100], cube.length);

    const { report } = autoFix(withDust);

    expect(report.removedShells).toBe(1);
    expect(report.after.triangles).toBe(12);
    expect(report.after.watertight).toBe(true);
    expect(report.changed).toBe(true);
  });

  it('drops needle slivers that have area but no thickness', () => {
    const cube = cubeSoup(10);
    const withNeedle = new Float32Array(cube.length + 9);
    withNeedle.set(cube, 0);
    withNeedle.set([0, 0, 0, 1, 0, 0, 0.5, 1e-8, 0], cube.length);

    const { report } = autoFix(withNeedle);

    expect(report.removedDegenerate).toBeGreaterThanOrEqual(1);
    expect(report.after.triangles).toBe(12);
    expect(report.after.watertight).toBe(true);
  });

  it('fills a concave L-shaped hole without covering the outside', () => {
    const { report } = autoFix(openLPrism());

    expect(report.before.holes).toBeGreaterThanOrEqual(1);
    expect(report.filledHoles).toBeGreaterThanOrEqual(1);
    expect(report.after.watertight).toBe(true);
    expect(report.after.signedVolume).toBeCloseTo(5000, 0);
  });

  it('closes a hairline crack from a split vertex', () => {
    const cracked = Float32Array.from(cubeSoup(10));
    cracked[0] += 0.03;

    const { report } = autoFix(cracked);

    expect(report.before.watertight).toBe(false);
    expect(report.after.watertight).toBe(true);
    expect(report.changed).toBe(true);
    expect(report.crackWeld || report.filledHoles > 0).toBe(true);
  });
});

describe('fixMisalignment', () => {
  it('leaves a healthy mesh alone', () => {
    const { report } = fixMisalignment(cubeSoup(10), { toleranceMm: 0.2 });

    expect(report.changed).toBe(false);
    expect(report.snappedClusters).toBe(0);
    expect(report.after.vertices).toBe(8);
    expect(report.after.watertight).toBe(true);
  });

  it('snaps two copies that sat 0.1 mm apart after a merge', () => {
    const a = cubeSoup(10);
    const b = Float32Array.from(a, (value, i) => (i % 3 === 0 ? value + 0.1 : value));
    const merged = new Float32Array(a.length + b.length);
    merged.set(a, 0);
    merged.set(b, a.length);

    const { report } = fixMisalignment(merged, { toleranceMm: 0.2 });

    expect(report.snappedClusters).toBe(8);
    expect(report.after.vertices).toBe(8);
    expect(report.after.triangles).toBe(12);
    expect(report.after.watertight).toBe(true);
    expect(report.changed).toBe(true);
  });

  it('does not crush a mesh whose real edges are around the tolerance', () => {
    // A 0.3 mm cube has 0.3 mm edges — those must survive a 0.2 mm snap.
    const { report } = fixMisalignment(cubeSoup(0.3), { toleranceMm: 0.2 });

    expect(report.snappedClusters).toBe(0);
    expect(report.after.triangles).toBe(12);
    expect(report.after.vertices).toBe(8);
  });

  it('grid-snaps a part that was shifted off the millimetre lattice', () => {
    const shifted = Float32Array.from(cubeSoup(10), (value, i) =>
      i % 3 === 0 ? value + 0.19 : value
    );

    const { soup, report } = fixMisalignment(shifted, { toleranceMm: 0.2, snapToGrid: true });

    expect(report.quantizedVertices).toBeGreaterThan(0);
    expect(report.changed).toBe(true);
    expect(computeBounds(soup).min[0]).toBeCloseTo(0.2, 5);
  });
});

describe('paint align and fill', () => {
  it('flattens a painted bump onto the surrounding plane', () => {
    const { mesh } = weld(pyramidSoup());
    const ids = [...Array(mesh.positions.length / 3).keys()];
    const { mesh: aligned, moved } = alignPaintedVertices(mesh, ids);

    expect(moved).toBeGreaterThan(0);
    let maxY = -Infinity;
    for (let i = 1; i < aligned.positions.length; i += 3) {
      if (aligned.positions[i] > maxY) maxY = aligned.positions[i];
    }
    expect(maxY).toBeLessThan(1.5);
  });

  it('does not move unpainted vertices', () => {
    const { mesh } = weld(cubeSoup(10));
    const positions = Float64Array.from(mesh.positions);
    const painted: number[] = [];
    for (let i = 0; i < positions.length / 3; i++) {
      if (positions[i * 3 + 1] > 9) {
        painted.push(i);
        positions[i * 3 + 1] = 10 + (positions[i * 3] + positions[i * 3 + 2]) * 0.08;
      }
    }
    const bumpy = { positions, indices: mesh.indices };
    const before = Float64Array.from(positions);
    const paintedSet = new Set(painted);
    const { mesh: aligned, moved } = alignPaintedVertices(bumpy, painted);

    expect(painted.length).toBe(4);
    expect(moved).toBeGreaterThan(0);
    for (let i = 0; i < before.length / 3; i++) {
      if (paintedSet.has(i)) continue;
      expect(aligned.positions[i * 3]).toBe(before[i * 3]);
      expect(aligned.positions[i * 3 + 1]).toBe(before[i * 3 + 1]);
      expect(aligned.positions[i * 3 + 2]).toBe(before[i * 3 + 2]);
    }
  });

  it('closes a painted hole', () => {
    const { mesh } = weld(removeTriangle(cubeSoup(10), 0));
    const rim: number[] = [];
    for (let i = 0; i < mesh.positions.length / 3; i++) {
      if (Math.abs(mesh.positions[i * 3 + 2]) < 1e-9) rim.push(i);
    }
    const { mesh: filled, filled: count } = fillPaintedHoles(mesh, rim);

    expect(count).toBeGreaterThanOrEqual(1);
    expect(inspect(toSoup(filled)).watertight).toBe(true);
  });

  it('does not fill a hole above the highest painted point', () => {
    const { mesh } = weld(removeTriangle(cubeSoup(10), 0));
    let maxY = -Infinity;
    const ids: number[] = [];
    for (let i = 0; i < mesh.positions.length / 3; i++) {
      ids.push(i);
      if (mesh.positions[i * 3 + 1] > maxY) maxY = mesh.positions[i * 3 + 1];
    }
    const { mesh: filled, capHeight } = fillPaintedHoles(mesh, ids);
    expect(capHeight).toBeLessThanOrEqual(maxY + 1e-9);
    for (let i = 1; i < filled.positions.length; i += 3) {
      expect(filled.positions[i]).toBeLessThanOrEqual(maxY + 1e-6);
    }
  });

  it('does not fill a hole the brush never touched', () => {
    const { mesh } = weld(removeTriangle(cubeSoup(10), 0));
    const far: number[] = [];
    for (let i = 0; i < mesh.positions.length / 3; i++) {
      if (mesh.positions[i * 3 + 2] > 9) far.push(i);
    }
    const { filled } = fillPaintedHoles(mesh, far);
    expect(filled).toBe(0);
    expect(inspect(toSoup(mesh)).watertight).toBe(false);
  });
});

describe('simplify', () => {
  it('cuts triangle count on an over-dense mesh while keeping the shape', () => {
    const dense = denseSphere(20, 40, 60);
    const before = inspect(dense);
    const { soup, report } = simplify(dense, { strength: 0.03 });

    expect(report.trianglesBefore).toBe(before.triangles);
    expect(report.reduction).toBeGreaterThan(0.5);
    expect(report.trianglesAfter).toBeLessThan(report.trianglesBefore);

    // The silhouette must survive: a 40 mm sphere stays roughly 40 mm.
    const size = computeBounds(soup).size;
    expect(size[0]).toBeGreaterThan(36);
    expect(size[0]).toBeLessThanOrEqual(40.001);
    expect(size[1]).toBeGreaterThan(36);
  });

  it('leaves a mesh that is already minimal essentially alone', () => {
    const { report } = simplify(cubeSoup(10), { strength: 0.001 });

    expect(report.trianglesAfter).toBe(12);
    expect(report.reduction).toBe(0);
  });

  it('reduces more as strength goes up', () => {
    const dense = denseSphere(20, 40, 60);
    const light = simplify(dense, { strength: 0.01 }).report;
    const heavy = simplify(dense, { strength: 0.06 }).report;

    expect(heavy.trianglesAfter).toBeLessThan(light.trianglesAfter);
    expect(heavy.cellSize).toBeGreaterThan(light.cellSize);
  });

  it('still produces a closed solid it can measure', () => {
    const { report } = simplify(denseSphere(20, 40, 60), { strength: 0.02, fillHoles: true });

    expect(report.after.triangles).toBeGreaterThan(0);
    expect(Math.abs(report.after.signedVolume)).toBeGreaterThan(0);
  });
});
