/**
 * Primitive building blocks — a box, cylinder, sphere and cone dropped in as
 * parts. They are the pieces you position against another part and subtract to
 * cut a pocket, hole or chamfer, or just rough-in a shape before importing the
 * real one. Each is generated centred on its own origin so it lands on a mount
 * like any imported part, and stays editable through the inspector's scale and
 * resize fields.
 *
 * Round stock (pipe / rod / bolt) lives in `hardware.ts`; this is the plain
 * geometric set that the boolean tools chew on.
 */

import * as THREE from 'three';

/** Flatten an indexed three.js geometry into a triangle soup (9 floats/tri). */
function soupOf(geometry: THREE.BufferGeometry): Float32Array {
  const nonIndexed = geometry.toNonIndexed();
  const position = nonIndexed.getAttribute('position');
  const soup = new Float32Array(position.array as ArrayLike<number>);
  geometry.dispose();
  nonIndexed.dispose();
  return soup;
}

export function boxSoup(width = 30, height = 30, depth = 30): Float32Array {
  return soupOf(new THREE.BoxGeometry(width, height, depth));
}

export function sphereSoup(diameter = 30): Float32Array {
  return soupOf(new THREE.SphereGeometry(diameter / 2, 40, 28));
}

export function cylinderSoup(diameter = 24, length = 40): Float32Array {
  // Generated along +X so it matches the axis the rest of the bench uses.
  const geometry = new THREE.CylinderGeometry(diameter / 2, diameter / 2, length, 48);
  geometry.rotateZ(Math.PI / 2);
  return soupOf(geometry);
}

export function coneSoup(diameter = 30, length = 40): Float32Array {
  const geometry = new THREE.ConeGeometry(diameter / 2, length, 48);
  geometry.rotateZ(-Math.PI / 2);
  return soupOf(geometry);
}
