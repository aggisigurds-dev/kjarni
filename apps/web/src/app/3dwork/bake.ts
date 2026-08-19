'use client';

/**
 * Applying a part's on-table transform to its actual triangles.
 *
 * The viewport moves parts by setting object transforms, which costs nothing.
 * Exporting has to bake those transforms into the vertex data, and it has to
 * do it exactly the way three.js composed them or the file will not match what
 * the screen showed — hence three's own Euler and Matrix4 rather than
 * hand-rolled trigonometry.
 */

import * as THREE from 'three';
import type { Transform } from '@/lib/3dwork/project';

const DEG = Math.PI / 180;

/** Apply an arbitrary matrix to every vertex of a soup, returning a new soup. */
export function applyMatrix(soup: Float32Array, matrix: THREE.Matrix4): Float32Array {
  const out = new Float32Array(soup.length);
  const v = new THREE.Vector3();
  for (let i = 0; i + 2 < soup.length; i += 3) {
    v.set(soup[i], soup[i + 1], soup[i + 2]).applyMatrix4(matrix);
    out[i] = v.x;
    out[i + 1] = v.y;
    out[i + 2] = v.z;
  }
  return out;
}

export function transformMatrix(transform: Transform): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(transform.position.x, transform.position.y, transform.position.z),
    new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        transform.rotation.x * DEG,
        transform.rotation.y * DEG,
        transform.rotation.z * DEG,
        'XYZ'
      )
    ),
    new THREE.Vector3(transform.scale.x, transform.scale.y, transform.scale.z)
  );
}

/**
 * Return a copy of `soup` with the transform applied. A transform that mirrors
 * the part (negative determinant) turns every triangle inside out, so the
 * winding is reversed to keep the normals pointing outward.
 */
export function bakeTransform(soup: Float32Array, transform: Transform): Float32Array {
  const matrix = transformMatrix(transform);
  const mirrored = matrix.determinant() < 0;

  const out = new Float32Array(soup.length);
  const point = new THREE.Vector3();

  for (let i = 0; i + 2 < soup.length; i += 3) {
    point.set(soup[i], soup[i + 1], soup[i + 2]).applyMatrix4(matrix);
    out[i] = point.x;
    out[i + 1] = point.y;
    out[i + 2] = point.z;
  }

  if (mirrored) {
    for (let t = 0; t + 8 < out.length; t += 9) {
      for (let c = 0; c < 3; c++) {
        const swap = out[t + 3 + c];
        out[t + 3 + c] = out[t + 6 + c];
        out[t + 6 + c] = swap;
      }
    }
  }

  return out;
}

/**
 * Scale a soup in place-free fashion. Measurements use this so the panel
 * reports the part at the size it is actually set to, not the size it was
 * modelled at. Signs are dropped: mirroring does not change a dimension.
 */
export function scaleSoup(soup: Float32Array, sx: number, sy: number, sz: number): Float32Array {
  const ax = Math.abs(sx);
  const ay = Math.abs(sy);
  const az = Math.abs(sz);
  if (ax === 1 && ay === 1 && az === 1) return soup;

  const out = new Float32Array(soup.length);
  for (let i = 0; i + 2 < soup.length; i += 3) {
    out[i] = soup[i] * ax;
    out[i + 1] = soup[i + 1] * ay;
    out[i + 2] = soup[i + 2] * az;
  }
  return out;
}

/** Bounding-box size of a soup after its transform, used for table layout. */
export function transformedSize(
  soup: Float32Array,
  transform: Transform
): { width: number; height: number; depth: number } {
  const box = new THREE.Box3();
  const point = new THREE.Vector3();
  const matrix = transformMatrix(transform);

  for (let i = 0; i + 2 < soup.length; i += 3) {
    box.expandByPoint(point.set(soup[i], soup[i + 1], soup[i + 2]).applyMatrix4(matrix));
  }

  const size = box.getSize(new THREE.Vector3());
  return { width: size.x || 1, height: size.y || 1, depth: size.z || 1 };
}
