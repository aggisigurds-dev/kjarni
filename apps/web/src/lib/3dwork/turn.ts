/**
 * Turning a part about the world's axes.
 *
 * A part keeps its rotation as Euler degrees (x, y, z — order XYZ). Adding a
 * step to one of those numbers is not a turn about that world axis: Z is the
 * innermost of the three, so once the part stands at 90° about Y a step on Z
 * turns it about world X — "X og Z láta snúast eins" (17.10.2026). So a step
 * is made a quaternion about the world axis and put in front of the part's own
 * turn, and the result read back as Euler degrees.
 */

import * as THREE from 'three';

const DEG = Math.PI / 180;
const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) } as const;

export type Degrees = { x: number; y: number; z: number };

/** `start` turned about the world axes by the degrees given: about x first, then y, then z. */
export function worldTurnQuaternion(start: THREE.Quaternion, turn: Degrees): THREE.Quaternion {
  const q = start.clone();
  for (const axis of ['x', 'y', 'z'] as const) {
    if (turn[axis]) q.premultiply(new THREE.Quaternion().setFromAxisAngle(AXES[axis], turn[axis] * DEG));
  }
  return q;
}

/** A rotation in Euler degrees, as parts keep it, turned about the world axes. */
export function turnAboutWorld(rotation: Degrees, turn: Degrees): Degrees {
  const start = new THREE.Quaternion().setFromEuler(new THREE.Euler(rotation.x * DEG, rotation.y * DEG, rotation.z * DEG, 'XYZ'));
  const euler = new THREE.Euler().setFromQuaternion(worldTurnQuaternion(start, turn), 'XYZ');
  const tidy = (radians: number) => Math.round((radians / DEG) * 1e4) / 1e4 + 0;
  return { x: tidy(euler.x), y: tidy(euler.y), z: tidy(euler.z) };
}
