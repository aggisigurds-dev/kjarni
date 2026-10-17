/**
 * A lighter copy of a mesh for overview pictures — the Söfn page shows a whole
 * collection assembled, and fifteen full meshes are millions of triangles a
 * phone has no need to draw. Vertices are snapped together on a grid (vertex
 * clustering) and triangles that collapse are dropped: coarse, but one pass
 * over the triangles, and the outline stays where it was.
 */

/** The mesh, or a simplified copy with about `maxTriangles` triangles at most. */
export function simplifySoup(soup: Float32Array, maxTriangles: number): Float32Array {
  const count = Math.floor(soup.length / 9);
  if (count <= maxTriangles || maxTriangles <= 0) return soup;

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let area = 0;
  for (let t = 0; t < count; t += 1) {
    const o = t * 9;
    for (let k = 0; k < 9; k += 1) {
      const axis = k % 3;
      const value = soup[o + k];
      if (value < min[axis]) min[axis] = value;
      if (value > max[axis]) max[axis] = value;
    }
    const ux = soup[o + 3] - soup[o];
    const uy = soup[o + 4] - soup[o + 1];
    const uz = soup[o + 5] - soup[o + 2];
    const vx = soup[o + 6] - soup[o];
    const vy = soup[o + 7] - soup[o + 1];
    const vz = soup[o + 8] - soup[o + 2];
    area += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
  }
  if (!(area > 0) || !Number.isFinite(area)) return soup;

  // A surface of area A on cells of side s fills about A / s² cells, and clustering leaves about two
  // triangles per filled cell — so s ≈ √(2A / max). Coarser again if a mesh with much folded surface
  // still comes out too heavy.
  let cell = Math.sqrt((2 * area) / maxTriangles);
  let out = soup;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    out = cluster(soup, count, cell, min, max);
    if (out.length / 9 <= maxTriangles * 1.15) break;
    cell *= 1.35;
  }
  return out;
}

function cluster(soup: Float32Array, count: number, cell: number, min: number[], max: number[]): Float32Array {
  const nx = Math.floor((max[0] - min[0]) / cell) + 1;
  const ny = Math.floor((max[1] - min[1]) / cell) + 1;
  const index = new Map<number, number>();
  const sums: number[] = [];
  const of = new Int32Array(count * 3);

  for (let v = 0; v < count * 3; v += 1) {
    const x = soup[v * 3];
    const y = soup[v * 3 + 1];
    const z = soup[v * 3 + 2];
    const key =
      Math.floor((x - min[0]) / cell) + nx * (Math.floor((y - min[1]) / cell) + ny * Math.floor((z - min[2]) / cell));
    let id = index.get(key);
    if (id === undefined) {
      id = index.size;
      index.set(key, id);
      sums.push(0, 0, 0, 0);
    }
    sums[id * 4] += x;
    sums[id * 4 + 1] += y;
    sums[id * 4 + 2] += z;
    sums[id * 4 + 3] += 1;
    of[v] = id;
  }

  // Each cell's vertex at the middle of the vertices snapped into it.
  const at = new Float32Array(index.size * 3);
  for (let id = 0; id < index.size; id += 1) {
    const n = sums[id * 4 + 3];
    at[id * 3] = sums[id * 4] / n;
    at[id * 3 + 1] = sums[id * 4 + 1] / n;
    at[id * 3 + 2] = sums[id * 4 + 2] / n;
  }

  const kept: number[] = [];
  for (let t = 0; t < count; t += 1) {
    const a = of[t * 3];
    const b = of[t * 3 + 1];
    const c = of[t * 3 + 2];
    if (a === b || b === c || a === c) continue;
    kept.push(a, b, c);
  }
  const out = new Float32Array(kept.length * 3);
  for (let i = 0; i < kept.length; i += 1) {
    out[i * 3] = at[kept[i] * 3];
    out[i * 3 + 1] = at[kept[i] * 3 + 1];
    out[i * 3 + 2] = at[kept[i] * 3 + 2];
  }
  return out;
}
