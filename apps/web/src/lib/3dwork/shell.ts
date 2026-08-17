/**
 * Wall thickness — offsetting a surface to give it material.
 *
 * The same operation covers two jobs that look different in the shop. On a
 * closed part it hollows it out or pads it, leaving a wall of the thickness you
 * asked for. On an open surface — a face split off a part, a panel, anything
 * with a rim — it thickens it into something printable, and the rim is walled
 * so the result closes.
 *
 * Nothing is resampled. Vertices move along their own averaged normals and one
 * of the two surfaces is always the input's own triangles, unmoved, so detail
 * on that side survives exactly. That is the whole reason to do it this way
 * rather than through a distance field: a rebuild would round off the very
 * features the wall is meant to carry.
 *
 * The limit is honest and worth stating: pushing a surface into itself is
 * possible. Where the part curves in tighter than the thickness, the offset
 * side crosses over and the result self-intersects. `shellReport` says when
 * that is likely rather than letting it pass silently.
 */

import { computeBounds, weld } from './mesh';

export type ShellDirection = 'outward' | 'inward' | 'centred';

export interface ShellOptions {
  /** Wall thickness, mm. */
  thickness: number;
  /**
   * Which way the material goes. On a closed part `inward` hollows it and
   * keeps the outside exactly as it was; `outward` pads it and keeps the
   * inside. `centred` splits the thickness either side of the original.
   */
  direction: ShellDirection;
}

export interface ShellReport {
  trianglesBefore: number;
  trianglesAfter: number;
  /** Rim edges that had to be walled — zero means the input was closed. */
  rimEdges: number;
  /** True when the input was a closed solid, so the result is hollow. */
  wasClosed: boolean;
  /** Volume of material the wall holds, mm³. */
  wallVolume: number;
  /**
   * Smallest gap the thickness has to fit through, estimated from the part's
   * shortest overall dimension. Not a guarantee, only a warning threshold.
   */
  warnings: string[];
}

/** Signed volume of a closed soup, by the divergence theorem. */
function signedVolume(soup: Float32Array): number {
  let total = 0;
  for (let t = 0; t + 8 < soup.length; t += 9) {
    total +=
      soup[t] * (soup[t + 4] * soup[t + 8] - soup[t + 5] * soup[t + 7]) -
      soup[t + 1] * (soup[t + 3] * soup[t + 8] - soup[t + 5] * soup[t + 6]) +
      soup[t + 2] * (soup[t + 3] * soup[t + 7] - soup[t + 4] * soup[t + 6]);
  }
  return Math.abs(total) / 6;
}

/**
 * Per-vertex displacement for one millimetre of wall.
 *
 * The naive move — average the face normals and slide along that — is wrong at
 * any corner: the averaged direction leans away from every face meeting there,
 * so a 2 mm wall lands 1.15 mm from a cube's faces. Scaling by the worst face's
 * alignment overshoots instead, because a vertex whose faces are unevenly
 * triangulated pulls its average toward whichever face carries more area.
 *
 * What is actually wanted is the point sitting exactly one unit off *every*
 * incident face plane, which is a small least-squares solve per vertex:
 * minimise the error in `d · f = 1` over the incident face normals `f`. At a
 * corner the system is exactly determined and gives the true mitre; along an
 * edge or on a flat it is rank-deficient and the regularisation picks the
 * shortest displacement, which is the perpendicular one.
 */
function offsetDirections(
  positions: Float64Array,
  indices: Uint32Array
): { offset: Float64Array; clamped: number } {
  const count = positions.length / 3;
  // Upper triangle of each vertex's 3x3 normal matrix, plus its right side.
  const m = new Float64Array(count * 6);
  const b = new Float64Array(count * 3);
  let scaleReference = 0;

  for (let i = 0; i + 2 < indices.length; i += 3) {
    const a = indices[i] * 3;
    const c1 = indices[i + 1] * 3;
    const c2 = indices[i + 2] * 3;

    const ux = positions[c1] - positions[a];
    const uy = positions[c1 + 1] - positions[a + 1];
    const uz = positions[c1 + 2] - positions[a + 2];
    const vx = positions[c2] - positions[a];
    const vy = positions[c2 + 1] - positions[a + 1];
    const vz = positions[c2 + 2] - positions[a + 2];

    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;

    // The cross product's length is twice the area, which is the weight, and
    // a sliver contributing almost nothing is exactly the behaviour wanted.
    const doubleArea = Math.hypot(nx, ny, nz);
    if (doubleArea === 0) continue;
    nx /= doubleArea;
    ny /= doubleArea;
    nz /= doubleArea;

    const w = doubleArea / 2;
    scaleReference += w;

    for (const corner of [a, c1, c2]) {
      const v = corner / 3;
      const at = v * 6;
      m[at] += w * nx * nx;
      m[at + 1] += w * nx * ny;
      m[at + 2] += w * nx * nz;
      m[at + 3] += w * ny * ny;
      m[at + 4] += w * ny * nz;
      m[at + 5] += w * nz * nz;
      b[v * 3] += w * nx;
      b[v * 3 + 1] += w * ny;
      b[v * 3 + 2] += w * nz;
    }
  }

  // Relative to the mesh's own scale, so it behaves the same on a 5 mm part
  // and a 500 mm one.
  const epsilon = (scaleReference / Math.max(count, 1)) * 1e-6;

  const offset = new Float64Array(positions.length);
  let clamped = 0;

  for (let v = 0; v < count; v++) {
    const at = v * 6;
    const a11 = m[at] + epsilon;
    const a12 = m[at + 1];
    const a13 = m[at + 2];
    const a22 = m[at + 3] + epsilon;
    const a23 = m[at + 4];
    const a33 = m[at + 5] + epsilon;

    const b1 = b[v * 3];
    const b2 = b[v * 3 + 1];
    const b3 = b[v * 3 + 2];

    const co11 = a22 * a33 - a23 * a23;
    const co12 = a13 * a23 - a12 * a33;
    const co13 = a12 * a23 - a13 * a22;
    const det = a11 * co11 + a12 * co12 + a13 * co13;

    let dx: number;
    let dy: number;
    let dz: number;
    if (Math.abs(det) < 1e-18) {
      // Nothing solvable here — an isolated or degenerate vertex.
      dx = 0;
      dy = 0;
      dz = 0;
    } else {
      const co22 = a11 * a33 - a13 * a13;
      const co23 = a12 * a13 - a11 * a23;
      const co33 = a11 * a22 - a12 * a12;
      dx = (co11 * b1 + co12 * b2 + co13 * b3) / det;
      dy = (co12 * b1 + co22 * b2 + co23 * b3) / det;
      dz = (co13 * b1 + co23 * b2 + co33 * b3) / det;
    }

    // A crease folded back on itself sends the mitre point off to infinity.
    // Past this it is cut short, thinning the wall at that corner rather than
    // growing a spike out of the part.
    const MAX_MITRE = 4;
    const length = Math.hypot(dx, dy, dz);
    if (length > MAX_MITRE) {
      clamped++;
      const k = MAX_MITRE / length;
      dx *= k;
      dy *= k;
      dz *= k;
    }

    offset[v * 3] = dx;
    offset[v * 3 + 1] = dy;
    offset[v * 3 + 2] = dz;
  }

  return { offset, clamped };
}

/** Boundary edges, directed as the single triangle that owns them sees them. */
function rimEdges(indices: Uint32Array): [number, number][] {
  const counts = new Map<number, { a: number; b: number; count: number }>();

  for (let i = 0; i + 2 < indices.length; i += 3) {
    for (let c = 0; c < 3; c++) {
      const a = indices[i + c];
      const b = indices[i + ((c + 1) % 3)];
      // Undirected key, so the two triangles sharing an edge land together.
      // Packed into one integer rather than a string: this runs over every
      // corner of a mesh that can carry half a million triangles.
      const key = a < b ? a * 0x4000000 + b : b * 0x4000000 + a;
      const seen = counts.get(key);
      if (seen) seen.count++;
      else counts.set(key, { a, b, count: 1 });
    }
  }

  const out: [number, number][] = [];
  for (const edge of counts.values()) {
    if (edge.count === 1) out.push([edge.a, edge.b]);
  }
  return out;
}

/**
 * Give a surface a wall of the requested thickness.
 *
 * Whichever side ends up outermost keeps the input's winding; the other is
 * reversed so its normals face into the wall cavity, and the rim is bridged
 * between them.
 */
export function shellSurface(
  soup: Float32Array,
  options: ShellOptions
): { soup: Float32Array; report: ShellReport } {
  const thickness = Math.abs(options.thickness);
  const { mesh } = weld(soup);
  const { positions, indices } = mesh;
  const { offset: direction, clamped } = offsetDirections(positions, indices);

  // How far each side moves off the original surface.
  const out =
    options.direction === 'outward'
      ? thickness
      : options.direction === 'centred'
        ? thickness / 2
        : 0;
  const inward = thickness - out;

  const outer = new Float64Array(positions.length);
  const inner = new Float64Array(positions.length);
  for (let i = 0; i + 2 < positions.length; i += 3) {
    for (let c = 0; c < 3; c++) {
      outer[i + c] = positions[i + c] + direction[i + c] * out;
      inner[i + c] = positions[i + c] - direction[i + c] * inward;
    }
  }

  const result: number[] = [];
  const push = (source: Float64Array, index: number) => {
    result.push(source[index * 3], source[index * 3 + 1], source[index * 3 + 2]);
  };

  for (let i = 0; i + 2 < indices.length; i += 3) {
    // Outer side, as the input had it.
    push(outer, indices[i]);
    push(outer, indices[i + 1]);
    push(outer, indices[i + 2]);
    // Inner side, reversed so it faces the cavity.
    push(inner, indices[i + 2]);
    push(inner, indices[i + 1]);
    push(inner, indices[i]);
  }

  const rim = rimEdges(indices);
  for (const [a, b] of rim) {
    // Round the quad the other way from the outer face, so the side wall faces
    // out of the solid rather than into it.
    push(outer, a);
    push(inner, a);
    push(inner, b);

    push(outer, a);
    push(inner, b);
    push(outer, b);
  }

  const shelled = new Float32Array(result);

  const warnings: string[] = [];
  // Only meaningful for a closed part. An open surface is flat by definition,
  // so its narrowest dimension says nothing about whether a wall fits.
  if (rim.length === 0) {
    const thinnest = Math.min(...computeBounds(soup).size);
    if (thickness * 2 >= thinnest) {
      warnings.push(
        `A ${thickness} mm wall does not fit in a part ${thinnest.toFixed(1)} mm across its narrowest way — the two sides will pass through each other.`
      );
    } else if (thickness * 4 >= thinnest) {
      warnings.push('Little cavity left at this thickness — the part is nearly solid.');
    }
  }
  if (clamped > 0) {
    warnings.push(
      `${clamped} corner(s) too sharp to hold full thickness — the wall thins there rather than spiking out.`
    );
  }

  // The two surfaces face opposite ways, so the divergence sum over the pair
  // is already the difference between them: the material in the wall.
  const wallVolume = signedVolume(shelled);

  return {
    soup: shelled,
    report: {
      trianglesBefore: Math.floor(soup.length / 9),
      trianglesAfter: Math.floor(shelled.length / 9),
      rimEdges: rim.length,
      wasClosed: rim.length === 0,
      wallVolume,
      warnings,
    },
  };
}

export const DEFAULT_SHELL: ShellOptions = { thickness: 2, direction: 'inward' };

export const SHELL_LABELS: Record<ShellDirection, string> = {
  inward: 'Inward — keeps the outside, hollows behind it',
  outward: 'Outward — keeps the inside, pads the outside',
  centred: 'Centred — half either side of the surface',
};
