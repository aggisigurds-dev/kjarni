import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { turnAboutWorld, type Degrees } from './turn';

const DEG = Math.PI / 180;
const quat = (r: Degrees) => new THREE.Quaternion().setFromEuler(new THREE.Euler(r.x * DEG, r.y * DEG, r.z * DEG, 'XYZ'));
const apply = (r: Degrees, v: [number, number, number]) => new THREE.Vector3(...v).applyQuaternion(quat(r));
/** The angle between two orientations, degrees. */
const apart = (a: Degrees, b: Degrees) => quat(a).angleTo(quat(b)) / DEG;

describe('turnAboutWorld', () => {
  it('adds a turn on its own axis when the part is not turned', () => {
    expect(turnAboutWorld({ x: 0, y: 0, z: 0 }, { x: 30, y: 0, z: 0 })).toEqual({ x: 30, y: 0, z: 0 });
  });

  it('turns X and Z differently when the part stands at 90° about Y', () => {
    const standing = { x: 0, y: 90, z: 0 };
    const aboutX = turnAboutWorld(standing, { x: 10, y: 0, z: 0 });
    const aboutZ = turnAboutWorld(standing, { x: 0, y: 0, z: 10 });
    expect(apart(aboutX, aboutZ)).toBeGreaterThan(10);
  });

  it('turns about the world axis, not the part’s own', () => {
    // Standing at 90° about Y, the part's +Z points along world +X; a quarter turn about world Z then lifts it to +Y.
    const turned = turnAboutWorld({ x: 0, y: 90, z: 0 }, { x: 0, y: 0, z: 90 });
    const v = apply(turned, [0, 0, 1]);
    expect(v.x).toBeCloseTo(0, 4);
    expect(v.y).toBeCloseTo(1, 4);
    expect(v.z).toBeCloseTo(0, 4);
  });

  it('comes back to where it was after a turn and its opposite', () => {
    const start = { x: 12, y: 47, z: -80 };
    const back = turnAboutWorld(turnAboutWorld(start, { x: 0, y: 0, z: 35 }), { x: 0, y: 0, z: -35 });
    expect(apart(back, start)).toBeLessThan(0.01);
  });
});
