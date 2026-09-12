/**
 * One printable piece: join the bodies, bore the pipes through, sweep up.
 *
 * This is the job the bench exists for — a receiver that arrives as several
 * printed halves, an iron pipe that has to pass straight through it, and one
 * watertight part out the other end. It runs on manifold-3d, an exact mesh
 * boolean kernel, so nothing is resampled: every face of the result is one of
 * the original triangles, trimmed where a cut crossed it, or the wall of a true
 * cylinder.
 *
 * The kernel only accepts closed, consistently wound surfaces, so each body is
 * brought up to that standard first, trying the cheapest honest fix before the
 * next: as imported → openings capped → doubled faces dropped and capped →
 * rebuilt from voxels. Only the last one changes the shape, and the report says
 * so for that body by name.
 *
 * Subtract, Merge and Fix run the same steps — a part with cutters, several
 * parts, one part — so none of them resamples a surface either.
 *
 * Pure: the caller hands in the loaded wasm module, so the same code runs in
 * the bench's worker and in the unit tests.
 */

import type { Box, Manifold, ManifoldToplevel, Mat4 } from 'manifold-3d';
import {
  capLoops,
  dropDuplicateFaces,
  findBoundaries,
  kernelToSoup,
  weldExact,
  type KernelMesh,
} from './kernel-prep';
import { computeBounds } from './mesh';
import { makeSolid } from './solidify';

export interface OnePieceBody {
  name: string;
  /** Triangles in world millimetres, with the part's table transform baked in. */
  soup: Float32Array;
}

export interface OnePiecePipe {
  name: string;
  /** Outside diameter of the stock, mm. The fit gap is added on top. */
  diameter: number;
  /** Length of the bore, mm, centred on the pipe's own origin. */
  length: number;
  /**
   * Column-major 4×4 world matrix of the pipe's frame, without scale. In that
   * frame the stock runs along +X centred on the origin — how hardwareMesh
   * builds it.
   */
  matrix: number[];
}

export interface OnePieceOptions {
  /** Added to every pipe diameter so the stock slides in, mm. */
  gapMm: number;
  /** Separate bits smaller than this are dropped, mm³. 0 keeps everything. */
  crumbMm3: number;
  /**
   * Close seams narrower than this, mm. Halves exported from a cut are rarely
   * flush — the Valken receiver's sit 0.03–0.19 mm apart — and an exact join
   * keeps any gap at all as separate pieces. 0 joins only what actually touches.
   */
  seamMm: number;
  /**
   * Grown onto every cutter part before the cut, mm, so a mating part slides
   * in rather than press-fitting. Pipes take `gapMm` instead.
   */
  clearanceMm?: number;
  /**
   * Whether a body the exact repairs cannot close may be rebuilt from voxels
   * as a last resort. That softens every surface into steps, so Fix, Subtract
   * and Merge switch it off and name the body instead. On unless set false.
   */
  allowRebuild?: boolean;
}

export interface OnePieceJob {
  bodies: OnePieceBody[];
  pipes: OnePiecePipe[];
  /** Parts cut out after the pipes, as they sit on the table — Subtract's cutter. */
  cutters?: OnePieceBody[];
  options: OnePieceOptions;
}

export type BodyOutcome = 'as-is' | 'capped' | 'deduplicated' | 'rebuilt' | 'skipped';

export interface BodyNote {
  name: string;
  triangles: number;
  outcome: BodyOutcome;
  detail: string;
}

export interface OnePieceReport {
  bodies: BodyNote[];
  /** How each cutter part was brought up to a solid before it cut. */
  cutters: BodyNote[];
  pipes: number;
  triangles: number;
  /** mm³ */
  volume: number;
  /** mm² */
  surfaceArea: number;
  /** Separate solid pieces left. One means one printable part. */
  pieces: number;
  /** Seams up to this wide were closed, mm; 0 when none needed closing. */
  seamMm: number;
  /** Gaps between separate pieces that were bridged shut. */
  seamsBridged: number;
  /** Sealed pockets inside the material, filled solid. */
  pocketsFilled: number;
  crumbsRemoved: number;
  /** mm³ */
  crumbVolume: number;
  ms: number;
}

export interface OnePieceResult {
  soup: Float32Array;
  report: OnePieceReport;
}

/** Messages between the bench and its worker. */
export type OnePieceRequest = OnePieceJob & { id: number };
export type OnePieceReply =
  | { id: number; type: 'progress'; label: string }
  | { id: number; type: 'done'; result: OnePieceResult }
  | { id: number; type: 'error'; message: string };

/** Bore flats stay this close to the true circle, mm — the same as the stock. */
const BORE_SAGITTA = 0.005;

/** Shells enclosing less than this, mm³, hold no material worth keeping. */
const SLIVER_MM3 = 1e-3;

function boreSegments(radius: number): number {
  const ideal = Math.PI * Math.sqrt(radius / (2 * BORE_SAGITTA));
  return Math.min(256, Math.max(48, Math.ceil(ideal / 2) * 2));
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

function solidOf(wasm: ManifoldToplevel, mesh: KernelMesh): Manifold | null {
  const input = new wasm.Mesh({
    numProp: 3,
    vertProperties: mesh.positions,
    triVerts: mesh.indices,
  });
  try {
    // Closes hairline cracks between corners that should have been one vertex.
    input.merge();
    return new wasm.Manifold(input);
  } catch {
    // A corrupt export (a corner at infinity, say) is a body to report, not a crash.
    return null;
  }
}

function prepareBody(
  wasm: ManifoldToplevel,
  body: OnePieceBody,
  allowRebuild: boolean
): { solid: Manifold | null; note: BodyNote } {
  const triangles = Math.floor(body.soup.length / 9);
  const note = (outcome: BodyOutcome, detail: string): BodyNote => ({
    name: body.name,
    triangles,
    outcome,
    detail,
  });

  const welded = weldExact(body.soup).mesh;
  let solid = solidOf(wasm, welded);
  if (solid) return { solid, note: note('as-is', 'Closed as imported') };

  const openings = findBoundaries(welded);
  if (openings.loops.length > 0) {
    const capped = capLoops(welded, openings.loops);
    solid = solidOf(wasm, capped.mesh);
    if (solid) {
      return {
        solid,
        note: note(
          'capped',
          `Capped ${plural(capped.capped, 'opening')} (${plural(openings.boundaryEdges, 'open edge')})`
        ),
      };
    }
  }

  // Doubled faces are left alone above on purpose: the kernel pairs them up
  // fine on most exports, and dropping one copy can open a closed body. Only
  // once that has failed are they worth taking out.
  const deduped = dropDuplicateFaces(welded);
  const remaining = findBoundaries(deduped.mesh);
  const closed =
    remaining.loops.length > 0 ? capLoops(deduped.mesh, remaining.loops).mesh : deduped.mesh;
  solid = solidOf(wasm, closed);
  if (solid) {
    const capNote =
      remaining.loops.length > 0 ? `, capped ${plural(remaining.loops.length, 'opening')}` : '';
    return {
      solid,
      note: note('deduplicated', `Dropped ${plural(deduped.duplicates, 'doubled face')}${capNote}`),
    };
  }

  if (!allowRebuild) {
    return {
      solid: null,
      note: note('skipped', 'Could not be closed without rebuilding it from voxels, so it was left out'),
    };
  }

  // Last resort: rebuild from voxels. Watertight by construction, but detail
  // finer than a voxel softens, which is why the note spells out the size.
  const bounds = computeBounds(body.soup);
  const longest = Math.max(bounds.size[0], bounds.size[1], bounds.size[2], 1);
  const resolution = Math.round(Math.min(480, Math.max(160, longest / 0.4)));
  const rebuilt = makeSolid(body.soup, { resolution, sealMm: 0.6 });
  if (rebuilt.soup.length > 0) {
    solid = solidOf(wasm, weldExact(rebuilt.soup).mesh);
    if (solid) {
      return {
        solid,
        note: note(
          'rebuilt',
          `Rebuilt from ${(longest / resolution).toFixed(2)} mm voxels — finer detail is softened`
        ),
      };
    }
  }

  return { solid: null, note: note('skipped', 'Could not be made solid, so it was left out') };
}

/** Free a kernel object even when a crash has left the kernel unable to. */
function release(manifold: Manifold): void {
  try {
    manifold.delete();
  } catch {
    // A kernel that crashed cannot free anything; the worker is discarded after the job.
  }
}

interface SurfaceMesh {
  vertProperties: Float32Array;
  triVerts: Uint32Array;
  numProp: number;
}

/**
 * Whether a point lies inside a closed surface: cast a ray and count the walls
 * it crosses. The ray leans slightly off the axes so it does not run along an
 * edge or through a vertex of a model built square to them.
 */
function insideSurface(mesh: SurfaceMesh, point: [number, number, number]): boolean {
  const dx = 0.99992;
  const dy = 0.01234;
  const dz = 0.00871;
  const p = mesh.vertProperties;
  const tri = mesh.triVerts;
  const stride = mesh.numProp;
  let crossings = 0;

  for (let t = 0; t + 2 < tri.length; t += 3) {
    const a = tri[t] * stride;
    const b = tri[t + 1] * stride;
    const c = tri[t + 2] * stride;
    const e1x = p[b] - p[a];
    const e1y = p[b + 1] - p[a + 1];
    const e1z = p[b + 2] - p[a + 2];
    const e2x = p[c] - p[a];
    const e2y = p[c + 1] - p[a + 1];
    const e2z = p[c + 2] - p[a + 2];
    // Möller–Trumbore.
    const hx = dy * e2z - dz * e2y;
    const hy = dz * e2x - dx * e2z;
    const hz = dx * e2y - dy * e2x;
    const det = e1x * hx + e1y * hy + e1z * hz;
    if (Math.abs(det) < 1e-12) continue;
    const inverse = 1 / det;
    const sx = point[0] - p[a];
    const sy = point[1] - p[a + 1];
    const sz = point[2] - p[a + 2];
    const u = (sx * hx + sy * hy + sz * hz) * inverse;
    if (u < 0 || u > 1) continue;
    const qx = sy * e1z - sz * e1y;
    const qy = sz * e1x - sx * e1z;
    const qz = sx * e1y - sy * e1x;
    const v = (dx * qx + dy * qy + dz * qz) * inverse;
    if (v < 0 || u + v > 1) continue;
    if ((e2x * qx + e2y * qy + e2z * qz) * inverse > 0) crossings++;
  }

  return crossings % 2 === 1;
}

function contains(outer: Box, inner: Box): boolean {
  const slack = 1e-3;
  for (let axis = 0; axis < 3; axis++) {
    if (inner.min[axis] < outer.min[axis] - slack) return false;
    if (inner.max[axis] > outer.max[axis] + slack) return false;
  }
  return true;
}

/** The same surface wound the other way round. */
function turnedInsideOut(wasm: ManifoldToplevel, shell: Manifold): Manifold {
  const mesh = shell.getMesh();
  const tri = mesh.triVerts;
  for (let t = 0; t + 2 < tri.length; t += 3) {
    const swap = tri[t + 1];
    tri[t + 1] = tri[t + 2];
    tri[t + 2] = swap;
  }
  return new wasm.Manifold(mesh);
}

/**
 * Split a body into the shells that hold material.
 *
 * Exports are rarely one closed surface. A receiver arrives as a stack of
 * them — ribs, bosses and fillets left as separate shells pushed into the main
 * wall — plus the inner faces of those shells as inside-out surfaces and
 * hundreds of empty slivers. The kernel treats each shell as its own island
 * until told to join them, which is why joining whole bodies left hundreds of
 * pieces; so the join below works shell by shell.
 *
 * Empty shells go. An inside-out shell sealed within the material is a pocket,
 * and goes too, so it prints solid. One standing on its own is a surface
 * exported inside out, and is turned the right way instead of being lost.
 */
function shellsOf(
  wasm: ManifoldToplevel,
  solid: Manifold
): { shells: Manifold[]; pockets: number; turned: number; slivers: number } {
  const outward: { shell: Manifold; box: Box }[] = [];
  const inward: { shell: Manifold; box: Box }[] = [];
  let slivers = 0;

  for (const shell of solid.decompose()) {
    const volume = shell.volume();
    if (Math.abs(volume) < SLIVER_MM3) {
      slivers++;
      shell.delete();
      continue;
    }
    (volume > 0 ? outward : inward).push({ shell, box: shell.boundingBox() });
  }

  let pockets = 0;
  let turned = 0;
  const sealing = outward.slice();
  const surfaces = new Map<Manifold, SurfaceMesh>();
  const surfaceOf = (shell: Manifold) => {
    let surface = surfaces.get(shell);
    if (!surface) {
      surface = shell.getMesh();
      surfaces.set(shell, surface);
    }
    return surface;
  };
  for (const { shell, box } of inward) {
    // A shell merely inside another's bounding box may sit in a hollow of it,
    // not in its material — only a point actually inside makes it a pocket.
    const corner = shell.getMesh().vertProperties;
    const probe: [number, number, number] = [corner[0], corner[1], corner[2]];
    const sealed = sealing.some(
      (entry) => contains(entry.box, box) && insideSurface(surfaceOf(entry.shell), probe)
    );
    if (sealed) {
      pockets++;
      shell.delete();
      continue;
    }
    const flipped = turnedInsideOut(wasm, shell);
    shell.delete();
    outward.push({ shell: flipped, box: flipped.boundingBox() });
    turned++;
  }

  return { shells: outward.map((entry) => entry.shell), pockets, turned, slivers };
}

/**
 * Move every vertex along its area-weighted normal: outward for a positive
 * distance, inward for a negative one.
 *
 * Not a true parallel offset — at a sharp corner a face moves a little less
 * than the distance — but for the tenths of a millimetre a seam needs the
 * difference is well inside print tolerance, and it keeps every triangle, so
 * the detail of the part survives. Returns null if the kernel rejects the
 * result, which leaves the caller free to carry on without it.
 */
function offsetSurface(wasm: ManifoldToplevel, solid: Manifold, distance: number): Manifold | null {
  const mesh = solid.getMesh();
  const positions = mesh.vertProperties;
  const tri = mesh.triVerts;
  const stride = mesh.numProp;
  const count = positions.length / stride;
  const normals = new Float64Array(count * 3);

  for (let t = 0; t + 2 < tri.length; t += 3) {
    const a = tri[t] * stride;
    const b = tri[t + 1] * stride;
    const c = tri[t + 2] * stride;
    const ux = positions[b] - positions[a];
    const uy = positions[b + 1] - positions[a + 1];
    const uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a];
    const vy = positions[c + 1] - positions[a + 1];
    const vz = positions[c + 2] - positions[a + 2];
    // Twice the triangle's area along its normal, so big faces steer the vertex.
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    for (const corner of [tri[t], tri[t + 1], tri[t + 2]]) {
      normals[corner * 3] += nx;
      normals[corner * 3 + 1] += ny;
      normals[corner * 3 + 2] += nz;
    }
  }

  for (let v = 0; v < count; v++) {
    const nx = normals[v * 3];
    const ny = normals[v * 3 + 1];
    const nz = normals[v * 3 + 2];
    const length = Math.hypot(nx, ny, nz);
    if (length === 0) continue;
    const scale = distance / length;
    positions[v * stride] += nx * scale;
    positions[v * stride + 1] += ny * scale;
    positions[v * stride + 2] += nz * scale;
  }

  try {
    return new wasm.Manifold(mesh);
  } catch {
    return null;
  }
}

/**
 * Fill the hairline gaps between pieces that should have been one.
 *
 * Halves cut apart and exported separately rarely touch — the Valken
 * receiver's sit 0.03–0.19 mm apart — and the kernel keeps even a 0.0001 mm gap
 * as two pieces. Each piece is grown by half the seam width, and every pair
 * that then overlaps contributes that overlap: a sliver the shape of the gap,
 * reaching a hair into both sides. Only those slivers are added. The pieces'
 * own surfaces never move, so the outside stays exactly as modelled — growing
 * everything and shrinking it back instead folds the surface in inside corners.
 *
 * Returns null when there is nothing to bridge.
 */
function bridgeSeams(
  wasm: ManifoldToplevel,
  solid: Manifold,
  seam: number,
  minPieceMm3: number,
  onProgress?: (label: string) => void
): { solid: Manifold; bridges: number } | null {
  const pieces: Manifold[] = [];
  for (const component of solid.decompose()) {
    if (component.volume() >= minPieceMm3) pieces.push(component);
    else component.delete();
  }
  if (pieces.length < 2) {
    for (const piece of pieces) piece.delete();
    return null;
  }

  onProgress?.(`Closing seams up to ${seam} mm between ${pieces.length} pieces…`);
  const grown: { shell: Manifold; box: Box }[] = [];
  const bridges: Manifold[] = [];
  try {
    for (const piece of pieces) {
      const bigger = offsetSurface(wasm, piece, seam / 2);
      if (bigger) grown.push({ shell: bigger, box: bigger.boundingBox() });
    }

    for (let i = 0; i < grown.length; i++) {
      for (let j = i + 1; j < grown.length; j++) {
        const a = grown[i].box;
        const b = grown[j].box;
        const apart = [0, 1, 2].some((axis) => a.max[axis] < b.min[axis] || b.max[axis] < a.min[axis]);
        if (apart) continue;
        const overlap = wasm.Manifold.intersection([grown[i].shell, grown[j].shell]);
        if (overlap.numTri() > 0) bridges.push(overlap);
        else overlap.delete();
      }
    }
    if (bridges.length === 0) return null;

    const joined = wasm.Manifold.union([solid, ...bridges]);
    joined.numTri();
    return { solid: joined, bridges: bridges.length };
  } finally {
    for (const piece of pieces) release(piece);
    for (const entry of grown) release(entry.shell);
    for (const bridge of bridges) release(bridge);
  }
}

function boreFor(wasm: ManifoldToplevel, pipe: OnePiecePipe, gapMm: number): Manifold {
  const radius = Math.max(0.05, (pipe.diameter + gapMm) / 2);
  const length = Math.max(pipe.length, 0.1);
  // The kernel builds cylinders up +Z. Turn it onto +X, the stock's own axis,
  // then place it exactly where the pipe sits on the table.
  const upright = wasm.Manifold.cylinder(length, radius, radius, boreSegments(radius), true);
  const turned = upright.rotate([0, 90, 0]);
  upright.delete();
  const placed = turned.transform(pipe.matrix as unknown as Mat4);
  turned.delete();
  return placed;
}

/**
 * Bring each part up to a solid and split it into the shells that hold
 * material. `keep` registers every shell with the caller's cleanup.
 */
function solidShells(
  wasm: ManifoldToplevel,
  parts: OnePieceBody[],
  allowRebuild: boolean,
  keep: (manifold: Manifold) => Manifold,
  progress: (part: OnePieceBody, index: number) => void
): { notes: BodyNote[]; shells: Manifold[]; pockets: number } {
  const notes: BodyNote[] = [];
  const shells: Manifold[] = [];
  let pockets = 0;

  parts.forEach((part, index) => {
    progress(part, index);
    const prepared = prepareBody(wasm, part, allowRebuild);
    if (!prepared.solid) {
      notes.push(prepared.note);
      return;
    }
    const split = shellsOf(wasm, prepared.solid);
    prepared.solid.delete();
    for (const shell of split.shells) shells.push(keep(shell));
    pockets += split.pockets;

    const extras: string[] = [];
    if (split.shells.length > 1) extras.push(`${split.shells.length} shells`);
    if (split.turned > 0) extras.push(`${plural(split.turned, 'inside-out shell')} turned`);
    if (split.pockets > 0) extras.push(`${plural(split.pockets, 'pocket')} filled`);
    if (split.slivers > 0) extras.push(`${plural(split.slivers, 'empty shell')} dropped`);
    notes.push(
      extras.length > 0
        ? { ...prepared.note, detail: `${prepared.note.detail} · ${extras.join(' · ')}` }
        : prepared.note
    );
  });

  return { notes, shells, pockets };
}

export function makeOnePiece(
  wasm: ManifoldToplevel,
  job: OnePieceJob,
  onProgress?: (label: string) => void
): OnePieceResult {
  const started = performance.now();
  // Kernel objects live in wasm memory, outside the garbage collector, and a
  // half-million-triangle receiver fills it quickly. Each object is freed as
  // soon as the next stage no longer needs it; anything left is freed at the end.
  const live = new Set<Manifold>();
  const keep = (manifold: Manifold) => {
    live.add(manifold);
    return manifold;
  };
  const drop = (manifold: Manifold) => {
    if (live.delete(manifold)) manifold.delete();
  };

  try {
    const allowRebuild = job.options.allowRebuild !== false;
    const { notes, shells, pockets } = solidShells(wasm, job.bodies, allowRebuild, keep, (body, index) =>
      onProgress?.(`Checking ${body.name} (${index + 1} of ${job.bodies.length})…`)
    );
    let pocketsFilled = pockets;
    if (shells.length === 0) {
      const skipped = notes.find((entry) => entry.outcome === 'skipped');
      throw new Error(
        skipped && !allowRebuild
          ? `${skipped.name} could not be closed into a solid without rebuilding it from voxels.`
          : 'None of those bodies could be made into a solid.'
      );
    }

    let piece = shells[0];
    if (shells.length > 1) {
      onProgress?.(`Joining ${shells.length} shells into one…`);
      piece = keep(wasm.Manifold.union(shells));
      piece.numTri();
      for (const shell of shells) drop(shell);
    }

    const seam = Math.max(0, job.options.seamMm || 0);
    let seamsBridged = 0;
    if (seam > 0) {
      const bridged = bridgeSeams(wasm, piece, seam, Math.max(job.options.crumbMm3, 1), onProgress);
      if (bridged) {
        keep(bridged.solid);
        drop(piece);
        piece = bridged.solid;
        seamsBridged = bridged.bridges;
      }
    }

    if (job.pipes.length > 0) {
      onProgress?.(`Boring ${plural(job.pipes.length, 'pipe')} through…`);
      const cutters = job.pipes.map((pipe) => keep(boreFor(wasm, pipe, job.options.gapMm)));
      const tool = cutters.length === 1 ? cutters[0] : keep(wasm.Manifold.union(cutters));
      const cut = keep(piece.subtract(tool));
      cut.numTri();
      drop(piece);
      drop(tool);
      for (const cutter of cutters) drop(cutter);
      piece = cut;
    }

    const cutterNotes: BodyNote[] = [];
    const cutterParts = job.cutters ?? [];
    if (cutterParts.length > 0) {
      const prepared = solidShells(wasm, cutterParts, allowRebuild, keep, (cutter) =>
        onProgress?.(`Checking the cutter ${cutter.name}…`)
      );
      cutterNotes.push(...prepared.notes);
      if (prepared.shells.length === 0) {
        throw new Error('The cutter could not be made into a solid, so nothing was cut.');
      }
      let tool = prepared.shells[0];
      if (prepared.shells.length > 1) {
        tool = keep(wasm.Manifold.union(prepared.shells));
        tool.numTri();
        for (const shell of prepared.shells) drop(shell);
      }
      const clearance = Math.max(0, job.options.clearanceMm ?? 0);
      if (clearance > 0) {
        const grown = offsetSurface(wasm, tool, clearance);
        if (grown) {
          keep(grown);
          drop(tool);
          tool = grown;
        } else {
          const last = cutterNotes[cutterNotes.length - 1];
          cutterNotes[cutterNotes.length - 1] = {
            ...last,
            detail: `${last.detail} · no room for the ${clearance} mm clearance, cut to size`,
          };
        }
      }
      onProgress?.(`Cutting ${cutterParts.map((cutter) => cutter.name).join(', ')} out…`);
      const cut = keep(piece.subtract(tool));
      cut.numTri();
      drop(piece);
      drop(tool);
      piece = cut;
    }

    onProgress?.('Sweeping up loose bits…');
    const components = piece.decompose();
    const kept: Manifold[] = [];
    let pieces = 0;
    let crumbsRemoved = 0;
    let crumbVolume = 0;
    for (const component of components) {
      const volume = component.volume();
      if (volume < 0 && cutterParts.length > 0) {
        // A hollow a cutter left sealed inside was cut on purpose, so it stays.
        kept.push(keep(component));
      } else if (volume < 0) {
        // A pocket the join or the bore sealed off inside the material.
        pocketsFilled++;
        component.delete();
      } else if (volume < job.options.crumbMm3) {
        crumbsRemoved++;
        crumbVolume += volume;
        component.delete();
      } else {
        kept.push(keep(component));
        pieces++;
      }
    }
    if (pieces === 0) throw new Error('Nothing solid was left after the cut.');

    let final = piece;
    if (kept.length < components.length) {
      final = kept.length === 1 ? kept[0] : keep(wasm.Manifold.compose(kept));
      final.numTri();
      drop(piece);
      for (const component of kept) if (component !== final) drop(component);
    } else {
      for (const component of kept) drop(component);
    }

    onProgress?.('Writing the mesh…');
    const mesh = final.getMesh();
    const soup = kernelToSoup(mesh.vertProperties, mesh.triVerts);
    return {
      soup,
      report: {
        bodies: notes,
        cutters: cutterNotes,
        pipes: job.pipes.length,
        triangles: soup.length / 9,
        volume: final.volume(),
        surfaceArea: final.surfaceArea(),
        pieces,
        seamMm: seamsBridged > 0 ? seam : 0,
        seamsBridged,
        pocketsFilled,
        crumbsRemoved,
        crumbVolume,
        ms: Math.round(performance.now() - started),
      },
    };
  } finally {
    for (const manifold of live) release(manifold);
  }
}
