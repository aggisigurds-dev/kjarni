import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  aabbOverlap,
  applySnap,
  orientedAabb,
  snapAngle,
  snapHint,
  snapNumber,
  snapTranslation,
  snapVec,
  type Aabb,
} from './snap';

const cube = (x: number, y: number, z: number, size = 20): Aabb => ({
  min: [x, y, z],
  max: [x + size, y + size, z + size],
});

describe('snapNumber', () => {
  it('rounds to a 1 mm grid', () => {
    expect(snapNumber(1.4, 1)).toBe(1);
    expect(snapNumber(1.5, 1)).toBe(2);
    expect(snapNumber(-0.6, 1)).toBe(-1);
  });

  it('keeps 0.1 mm steps', () => {
    expect(snapNumber(12.34, 0.1)).toBeCloseTo(12.3, 6);
  });

  it('leaves the value alone when the step is not positive', () => {
    expect(snapNumber(3.2, 0)).toBe(3.2);
  });
});

describe('snapAngle', () => {
  it('snaps to the degree step', () => {
    expect(snapAngle(14.4, 1, 0)).toBe(14);
    expect(snapAngle(14.6, 1, 0)).toBe(15);
  });

  it('pulls onto 90° when close', () => {
    expect(snapAngle(88.5, 1, 3)).toBe(90);
    expect(snapAngle(-2, 1, 3)).toBe(0);
  });

  it('leaves a 45° turn on the 1° grid when it is not near a cardinal', () => {
    expect(snapAngle(45, 1, 3)).toBe(45);
  });
});

describe('snapVec', () => {
  it('snaps every axis', () => {
    const snapped = snapVec({ x: 1.2, y: 4.8, z: -0.4 }, 1);
    expect(snapped.x).toBe(1);
    expect(snapped.y).toBe(5);
    expect(snapped.z).toBeCloseTo(0);
  });
});

describe('aabbOverlap', () => {
  it('detects overlapping cubes', () => {
    expect(aabbOverlap(cube(0, 0, 0), cube(10, 0, 0))).toBe(true);
  });

  it('rejects cubes that sit apart', () => {
    expect(aabbOverlap(cube(0, 0, 0), cube(30, 0, 0))).toBe(false);
  });
});

describe('snapTranslation', () => {
  it('pulls a part onto a neighbour face when they almost touch', () => {
    const moving = cube(20.4, 0, 0);
    const other = cube(0, 0, 0);
    const snap = snapTranslation(moving, [other], { grid: 1, magnet: 8 });

    expect(snap.delta.x).toBeCloseTo(-0.4, 6);
    expect(snap.hits.some((hit) => hit.axis === 'x' && hit.kind === 'face')).toBe(true);
  });

  it('aligns centres when they are closer than a face', () => {
    const moving = cube(0.3, 0, 0);
    const other = cube(0, 0, 0);
    const snap = snapTranslation(moving, [other], { grid: 1, magnet: 8 });

    expect(snap.delta.x).toBeCloseTo(-0.3, 6);
    expect(snap.hits.some((hit) => hit.axis === 'x' && hit.kind === 'flush')).toBe(true);
  });

  it('falls back to the millimetre grid when nothing is nearby', () => {
    const moving = cube(10.4, 3.2, -1.6);
    const snap = snapTranslation(moving, [], { grid: 1, magnet: 8 });

    expect(applySnap({ x: 10.4, y: 3.2, z: -1.6 }, snap)).toEqual({ x: 10, y: 3, z: -2 });
    expect(snap.hits.every((hit) => hit.kind === 'grid')).toBe(true);
  });

  it('snaps the centre onto a slot anchor', () => {
    const moving = cube(40, 0, 0);
    const snap = snapTranslation(moving, [], {
      grid: 1,
      magnet: 12,
      anchors: [{ x: 50, y: 10, z: 10 }],
    });

    // Cube 20 mm at (40,0,0) has centre (50, 10, 10) — already on the anchor.
    expect(snap.delta).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('does not magnet across a gap larger than the threshold', () => {
    const moving = cube(40, 0, 0);
    const snap = snapTranslation(moving, [cube(0, 0, 0)], { grid: 1, magnet: 8 });

    expect(snap.hits.some((hit) => hit.kind === 'face')).toBe(false);
  });

  it('can lock to a single axis', () => {
    const moving = cube(20.4, 3.2, 1.6);
    const snap = snapTranslation(moving, [cube(0, 0, 0)], { grid: 1, magnet: 8, axes: ['x'] });

    expect(snap.delta.x).toBeCloseTo(-0.4, 6);
    expect(snap.delta.y).toBe(0);
    expect(snap.delta.z).toBe(0);
  });
});

describe('snapHint', () => {
  it('prefers magnetic hits over the grid', () => {
    expect(
      snapHint([
        { axis: 'x', kind: 'face', delta: -0.4 },
        { axis: 'y', kind: 'grid', delta: 0.2 },
      ])
    ).toBe('face X');
  });
});

describe('orientedAabb', () => {
  it('translates a cube without growing it', () => {
    const box = orientedAabb(cube(0, 0, 0, 10), { x: 5, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, {
      x: 1,
      y: 1,
      z: 1,
    });
    expect(box.min[0]).toBeCloseTo(5, 6);
    expect(box.max[0]).toBeCloseTo(15, 6);
    expect(box.max[1] - box.min[1]).toBeCloseTo(10, 6);
  });

  it('grows the XY footprint when rotated 45° about Z', () => {
    const box = orientedAabb(cube(0, 0, 0, 10), { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 45 }, {
      x: 1,
      y: 1,
      z: 1,
    });
    expect(box.max[0] - box.min[0]).toBeGreaterThan(12);
    expect(box.max[2] - box.min[2]).toBeCloseTo(10, 5);
  });

  it('turns a 10 mm rod along X onto Z for (90°, 0, 90°), as the viewport does', () => {
    const rod: Aabb = { min: [0, -0.5, -0.5], max: [10, 0.5, 0.5] };
    const box = orientedAabb(rod, { x: 0, y: 0, z: 0 }, { x: 90, y: 0, z: 90 }, { x: 1, y: 1, z: 1 });
    expect(box.max[2] - box.min[2]).toBeCloseTo(10, 6);
    expect(box.max[0] - box.min[0]).toBeCloseTo(1, 6);
  });

  it('matches the box three.js draws for any rotation, position and mirrored scale', () => {
    const local = cube(-3, 2, -7, 10);
    const position = { x: 3, y: -4, z: 5 };
    const cases = [
      { rotation: { x: 90, y: 0, z: 90 }, scale: { x: 1, y: 1, z: 1 } },
      { rotation: { x: 30, y: 45, z: 60 }, scale: { x: 1, y: 1, z: 1 } },
      { rotation: { x: -20, y: 110, z: 5 }, scale: { x: 1, y: -2, z: 0.5 } },
    ];
    const deg = Math.PI / 180;

    for (const { rotation, scale } of cases) {
      const matrix = new THREE.Matrix4().compose(
        new THREE.Vector3(position.x, position.y, position.z),
        new THREE.Quaternion().setFromEuler(
          new THREE.Euler(rotation.x * deg, rotation.y * deg, rotation.z * deg, 'XYZ')
        ),
        new THREE.Vector3(scale.x, scale.y, scale.z)
      );
      const expected = new THREE.Box3();
      for (const x of [local.min[0], local.max[0]]) {
        for (const y of [local.min[1], local.max[1]]) {
          for (const z of [local.min[2], local.max[2]]) {
            expected.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(matrix));
          }
        }
      }

      const box = orientedAabb(local, position, rotation, scale);
      for (let axis = 0; axis < 3; axis++) {
        expect(box.min[axis]).toBeCloseTo(expected.min.getComponent(axis), 6);
        expect(box.max[axis]).toBeCloseTo(expected.max.getComponent(axis), 6);
      }
    }
  });
});
