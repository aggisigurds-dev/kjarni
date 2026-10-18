/**
 * A part file dropped into the Partasafn: STL or 3MF read into one triangle
 * soup in the bench's frame — Z-up turned Y-up, the way an import onto the
 * bench does by default — centred on its own box, so it sits on the board
 * like any other saved part.
 */

import { zUpToYUp } from './mesh';
import { parseStl } from './stl';
import { is3mf, parse3mf } from './threemf';

export const PART_FILE_ACCEPT = '.stl,.3mf';

export function isPartFile(name: string): boolean {
  return /\.stl$/i.test(name) || is3mf(name);
}

/** The file's name without its extension. */
export function partFileName(name: string): string {
  return name.replace(/\.(stl|3mf)$/i, '').trim() || 'Partur';
}

/** All the meshes in a part file as one soup; null when there is nothing to read. */
export async function readPartFile(file: File, zUp = true): Promise<Float32Array | null> {
  const buffer = await file.arrayBuffer();
  let soups: Float32Array[];
  if (is3mf(file.name)) {
    soups = (await parse3mf(buffer)).filter((mesh) => mesh.triangles > 0).map((mesh) => mesh.soup);
  } else {
    const raw = parseStl(buffer);
    soups = raw.triangles > 0 ? [raw.positions] : [];
  }
  if (soups.length === 0) return null;
  const length = soups.reduce((sum, soup) => sum + soup.length, 0);
  let soup: Float32Array = new Float32Array(length);
  let at = 0;
  for (const part of soups) {
    soup.set(part, at);
    at += part.length;
  }
  if (zUp) soup = zUpToYUp(soup);
  return centreSoup(soup);
}

/** Move a soup so the middle of its box is at the origin. */
export function centreSoup(soup: Float32Array): Float32Array {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i + 2 < soup.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = soup[i + k];
      if (v < lo[k]) lo[k] = v;
      if (v > hi[k]) hi[k] = v;
    }
  }
  const mid = [0, 1, 2].map((k) => (lo[k] + hi[k]) / 2);
  const out = new Float32Array(soup.length);
  for (let i = 0; i + 2 < soup.length; i += 3) {
    out[i] = soup[i] - mid[0];
    out[i + 1] = soup[i + 1] - mid[1];
    out[i + 2] = soup[i + 2] - mid[2];
  }
  return out;
}
