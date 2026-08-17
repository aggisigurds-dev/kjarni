/** Hand-built meshes with known volume and topology, used by the unit tests. */

/**
 * Axis-aligned cube from the origin to (size, size, size), wound so every
 * triangle faces outward. 12 triangles, 8 distinct corners.
 */
export function cubeSoup(size = 10): Float32Array {
  const s = size;
  const v: [number, number, number][] = [
    [0, 0, 0],
    [s, 0, 0],
    [s, s, 0],
    [0, s, 0],
    [0, 0, s],
    [s, 0, s],
    [s, s, s],
    [0, s, s],
  ];
  const faces: [number, number, number][] = [
    [0, 3, 2],
    [0, 2, 1], // -Z
    [4, 5, 6],
    [4, 6, 7], // +Z
    [0, 1, 5],
    [0, 5, 4], // -Y
    [3, 7, 6],
    [3, 6, 2], // +Y
    [0, 4, 7],
    [0, 7, 3], // -X
    [1, 2, 6],
    [1, 6, 5], // +X
  ];

  const soup = new Float32Array(faces.length * 9);
  faces.forEach((face, f) => {
    face.forEach((corner, c) => {
      const at = f * 9 + c * 3;
      soup[at] = v[corner][0];
      soup[at + 1] = v[corner][1];
      soup[at + 2] = v[corner][2];
    });
  });
  return soup;
}

/** Open-ended tube along X: two concentric shells, no end caps. */
export function tubeSoup(
  length = 100,
  outerRadius = 20,
  innerRadius = 16,
  segments = 48
): Float32Array {
  const triangles: number[] = [];
  const push = (p: [number, number, number][]) => {
    for (const [x, y, z] of p) triangles.push(x, y, z);
  };

  for (const radius of [outerRadius, innerRadius]) {
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const b = ((i + 1) / segments) * Math.PI * 2;
      const p0: [number, number, number] = [0, Math.cos(a) * radius, Math.sin(a) * radius];
      const p1: [number, number, number] = [0, Math.cos(b) * radius, Math.sin(b) * radius];
      const p2: [number, number, number] = [length, Math.cos(b) * radius, Math.sin(b) * radius];
      const p3: [number, number, number] = [length, Math.cos(a) * radius, Math.sin(a) * radius];
      push([p0, p1, p2]);
      push([p0, p2, p3]);
    }
  }

  return new Float32Array(triangles);
}
