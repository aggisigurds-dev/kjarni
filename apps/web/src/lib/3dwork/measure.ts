/**
 * Measurement for fabrication work.
 *
 * Two halves that answer the same question from opposite ends: what a mesh
 * actually measures (`describePart`, `analyzeTube`), and what a length of stock
 * steel weighs before you cut it (`profileSection`). All lengths are millimetres
 * and all masses grams unless a name says otherwise.
 */

import { computeBounds, type Bounds, type IndexedMesh, weld, analyze } from './mesh';

export interface Material {
  id: string;
  name: string;
  /** g/cm3 */
  density: number;
  group: 'metal' | 'filament' | 'other';
}

export const MATERIALS: Material[] = [
  { id: 'steel', name: 'Mild steel (S235)', density: 7.85, group: 'metal' },
  { id: 'stainless', name: 'Stainless 304/316', density: 7.9, group: 'metal' },
  { id: 'aluminium', name: 'Aluminium 6060', density: 2.7, group: 'metal' },
  { id: 'brass', name: 'Brass', density: 8.5, group: 'metal' },
  { id: 'copper', name: 'Copper', density: 8.96, group: 'metal' },
  { id: 'pla', name: 'PLA', density: 1.24, group: 'filament' },
  { id: 'petg', name: 'PETG', density: 1.27, group: 'filament' },
  { id: 'abs', name: 'ABS', density: 1.04, group: 'filament' },
  { id: 'asa', name: 'ASA', density: 1.07, group: 'filament' },
  { id: 'tpu', name: 'TPU 95A', density: 1.21, group: 'filament' },
  { id: 'nylon', name: 'Nylon (PA12)', density: 1.01, group: 'filament' },
  { id: 'resin', name: 'Resin (standard)', density: 1.15, group: 'other' },
];

export function materialById(id: string): Material {
  return MATERIALS.find((m) => m.id === id) ?? MATERIALS[0];
}

/** Volume in mm3 and density in g/cm3 give mass in grams. */
export function massGrams(volumeMm3: number, densityGPerCm3: number): number {
  return (volumeMm3 / 1000) * densityGPerCm3;
}

export const MM_PER_INCH = 25.4;

export interface PartMeasurement {
  bounds: Bounds;
  /** Absolute enclosed volume, mm3. Meaningless on a mesh with holes. */
  volume: number;
  area: number;
  triangles: number;
  watertight: boolean;
  /** Fraction of the bounding box the solid actually fills. */
  fillRatio: number;
}

export function describePart(soup: Float32Array): PartMeasurement {
  const mesh = weld(soup).mesh;
  const topology = analyze(mesh);
  const volume = Math.abs(topology.signedVolume);
  const boxVolume = topology.bounds.size[0] * topology.bounds.size[1] * topology.bounds.size[2];

  return {
    bounds: topology.bounds,
    volume,
    area: topology.area,
    triangles: topology.triangles,
    watertight: topology.watertight,
    fillRatio: boxVolume > 0 ? volume / boxVolume : 0,
  };
}

export type Axis = 'x' | 'y' | 'z';

export interface TubeAnalysis {
  axis: Axis;
  length: number;
  outerDiameter: number;
  innerDiameter: number;
  wallThickness: number;
  hollow: boolean;
  /** 0-1: how much of the surface actually sits on those two radii. */
  roundness: number;
}

const AXIS_INDEX: Record<Axis, number> = { x: 0, y: 1, z: 2 };

function quantile(sorted: Float64Array, q: number): number {
  if (sorted.length === 0) return 0;
  const at = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[at];
}

/**
 * Estimate pipe geometry by looking at the mesh down one axis. Vertices near
 * the ends are ignored so that flanges and chamfers do not skew the radii.
 *
 * This reads the shape rather than the designer's intent, so treat it as a
 * measurement of what was modelled and check `roundness` before trusting it.
 */
export function analyzeTube(soup: Float32Array, axis?: Axis): TubeAnalysis {
  const bounds = computeBounds(soup);
  const chosen: Axis =
    axis ??
    (['x', 'y', 'z'] as Axis[]).reduce((best, candidate) =>
      bounds.size[AXIS_INDEX[candidate]] > bounds.size[AXIS_INDEX[best]] ? candidate : best
    );

  const a = AXIS_INDEX[chosen];
  const [r1, r2] = [0, 1, 2].filter((i) => i !== a);
  const length = bounds.size[a];

  // Keep the middle 60% along the axis: that is the part that is actually tube.
  const low = bounds.min[a] + length * 0.2;
  const high = bounds.max[a] - length * 0.2;

  // Sample the surface, not just the corners: a cube seen down its axis has
  // every corner at the same radius and would otherwise read as a round tube.
  // Edge midpoints and centroids catch the flats in between.
  const collect = (trimEnds: boolean): number[] => {
    const radii: number[] = [];
    const add = (along: number, u: number, v: number) => {
      if (trimEnds && length > 0 && (along < low || along > high)) return;
      radii.push(Math.hypot(u - bounds.center[r1], v - bounds.center[r2]));
    };

    for (let t = 0; t + 8 < soup.length; t += 9) {
      const corner = (c: number) => ({
        along: soup[t + c * 3 + a],
        u: soup[t + c * 3 + r1],
        v: soup[t + c * 3 + r2],
      });
      const p0 = corner(0);
      const p1 = corner(1);
      const p2 = corner(2);

      add(p0.along, p0.u, p0.v);
      add(p1.along, p1.u, p1.v);
      add(p2.along, p2.u, p2.v);
      add((p0.along + p1.along) / 2, (p0.u + p1.u) / 2, (p0.v + p1.v) / 2);
      add((p1.along + p2.along) / 2, (p1.u + p2.u) / 2, (p1.v + p2.v) / 2);
      add((p0.along + p2.along) / 2, (p0.u + p2.u) / 2, (p0.v + p2.v) / 2);
      add(
        (p0.along + p1.along + p2.along) / 3,
        (p0.u + p1.u + p2.u) / 3,
        (p0.v + p1.v + p2.v) / 3
      );
    }
    return radii;
  };

  // A tube meshed with rings only at its ends has nothing in the middle band;
  // fall back to the whole length rather than reporting no measurement.
  let radii = collect(true);
  if (radii.length === 0) radii = collect(false);

  if (radii.length === 0) {
    return {
      axis: chosen,
      length,
      outerDiameter: Math.max(bounds.size[r1], bounds.size[r2]),
      innerDiameter: 0,
      wallThickness: 0,
      hollow: false,
      roundness: 0,
    };
  }

  const sorted = Float64Array.from(radii).sort();
  const outer = quantile(sorted, 0.98);
  const inner = quantile(sorted, 0.02);

  // What makes a tube a tube is the empty band between its two walls. A solid
  // bar, a cone or a bracket all put surface somewhere in that band; a tube
  // puts none there.
  const spread = outer > 0 ? (outer - inner) / outer : 0;
  const bandLow = inner + (outer - inner) * 0.15;
  const bandHigh = outer - (outer - inner) * 0.15;
  const tolerance = Math.max(outer * 0.03, 1e-6);

  let inBand = 0;
  let onOuter = 0;
  let onEitherShell = 0;
  for (const r of sorted) {
    if (r > bandLow && r < bandHigh) inBand++;
    if (Math.abs(r - outer) <= tolerance) {
      onOuter++;
      onEitherShell++;
    } else if (Math.abs(r - inner) <= tolerance) {
      onEitherShell++;
    }
  }

  // Calling it a tube takes all three: two radii far enough apart, an empty
  // band between them, and a surface that really does sit on those two radii.
  // The last test is what stops a square section from reading as a pipe.
  const hollow =
    spread > 0.02 && inBand / sorted.length < 0.05 && onEitherShell / sorted.length > 0.8;

  const onShell = hollow ? onEitherShell : onOuter;

  return {
    axis: chosen,
    length,
    outerDiameter: outer * 2,
    innerDiameter: hollow ? inner * 2 : 0,
    wallThickness: hollow ? outer - inner : 0,
    hollow,
    roundness: sorted.length > 0 ? onShell / sorted.length : 0,
  };
}

export type ProfileKind =
  | 'round-bar'
  | 'round-pipe'
  | 'square-bar'
  | 'square-tube'
  | 'rect-tube'
  | 'flat-bar'
  | 'hex-bar'
  | 'angle'
  | 'channel'
  | 'plate';

export interface ProfileInput {
  kind: ProfileKind;
  /** Diameter, width, or leg A depending on the profile. */
  a: number;
  /** Height or leg B, where the profile has a second dimension. */
  b?: number;
  /** Wall or material thickness. */
  t?: number;
}

export interface ProfileSection {
  /** Cross-sectional area, mm2. */
  area: number;
  /** Outer perimeter, mm — what you pay to paint or galvanise. */
  perimeter: number;
  /** Mass of one metre of stock, kg. */
  massPerMetre: number;
  /** Painted area of one metre of stock, m2. */
  surfacePerMetre: number;
}

export const PROFILE_LABELS: Record<ProfileKind, string> = {
  'round-bar': 'Round bar',
  'round-pipe': 'Round pipe / tube',
  'square-bar': 'Square bar',
  'square-tube': 'Square tube',
  'rect-tube': 'Rectangular tube',
  'flat-bar': 'Flat bar',
  'hex-bar': 'Hex bar',
  angle: 'Angle (L)',
  channel: 'Channel (U)',
  plate: 'Plate / sheet',
};

/** Which of a/b/t a profile actually uses, so the form can label its inputs. */
export const PROFILE_FIELDS: Record<ProfileKind, { a: string; b?: string; t?: string }> = {
  'round-bar': { a: 'Diameter' },
  'round-pipe': { a: 'Outside diameter', t: 'Wall' },
  'square-bar': { a: 'Side' },
  'square-tube': { a: 'Side', t: 'Wall' },
  'rect-tube': { a: 'Width', b: 'Height', t: 'Wall' },
  'flat-bar': { a: 'Width', t: 'Thickness' },
  'hex-bar': { a: 'Across flats' },
  angle: { a: 'Leg A', b: 'Leg B', t: 'Thickness' },
  channel: { a: 'Height', b: 'Flange width', t: 'Thickness' },
  plate: { a: 'Width', t: 'Thickness' },
};

/**
 * Cross-section maths for common stock. Corner radii are ignored, so hollow
 * sections read a little heavy against a mill certificate — close enough to
 * order steel by, not a substitute for the supplier's table.
 */
export function profileSection(input: ProfileInput, density: number): ProfileSection {
  const a = Math.max(0, input.a || 0);
  const b = Math.max(0, input.b || 0);
  const t = Math.max(0, input.t || 0);

  let area = 0;
  let perimeter = 0;

  switch (input.kind) {
    case 'round-bar':
      area = (Math.PI * a * a) / 4;
      perimeter = Math.PI * a;
      break;
    case 'round-pipe': {
      const innerD = Math.max(0, a - 2 * t);
      area = (Math.PI * (a * a - innerD * innerD)) / 4;
      perimeter = Math.PI * a;
      break;
    }
    case 'square-bar':
      area = a * a;
      perimeter = 4 * a;
      break;
    case 'square-tube': {
      const inner = Math.max(0, a - 2 * t);
      area = a * a - inner * inner;
      perimeter = 4 * a;
      break;
    }
    case 'rect-tube': {
      const innerW = Math.max(0, a - 2 * t);
      const innerH = Math.max(0, b - 2 * t);
      area = a * b - innerW * innerH;
      perimeter = 2 * (a + b);
      break;
    }
    case 'flat-bar':
      area = a * t;
      perimeter = 2 * (a + t);
      break;
    case 'hex-bar':
      // Regular hexagon measured across the flats: side = a / sqrt(3).
      area = (Math.sqrt(3) / 2) * a * a;
      perimeter = 2 * Math.sqrt(3) * a;
      break;
    case 'angle':
      // Two legs sharing one thickness-square corner.
      area = a * t + Math.max(0, b - t) * t;
      perimeter = 2 * (a + b);
      break;
    case 'channel':
      // Web plus two flanges, same thickness throughout.
      area = a * t + 2 * Math.max(0, b - t) * t;
      perimeter = 2 * (a + b);
      break;
    case 'plate':
      // Handled per-piece rather than per-metre; area here is the end section.
      area = a * t;
      perimeter = 2 * (a + t);
      break;
  }

  // 1 m of stock = area mm2 x 1000 mm = area cm3, so grams = area x density.
  return {
    area,
    perimeter,
    massPerMetre: (area * density) / 1000,
    surfacePerMetre: (perimeter * 1000) / 1_000_000,
  };
}

export interface CutItem {
  id: string;
  label: string;
  profile: ProfileInput;
  /** Cut length in mm. For plate this is the piece length. */
  length: number;
  quantity: number;
  materialId: string;
}

export interface CutItemResult extends ProfileSection {
  totalLength: number;
  massEach: number;
  massTotal: number;
  surfaceTotal: number;
}

export function evaluateCutItem(item: CutItem): CutItemResult {
  const density = materialById(item.materialId).density;

  if (item.profile.kind === 'plate') {
    // A plate piece is width x length x thickness outright.
    const volume = (item.profile.a || 0) * item.length * (item.profile.t || 0);
    const faces = 2 * (item.profile.a || 0) * item.length;
    const massEach = massGrams(volume, density) / 1000;
    return {
      area: (item.profile.a || 0) * (item.profile.t || 0),
      perimeter: 2 * ((item.profile.a || 0) + (item.profile.t || 0)),
      massPerMetre: 0,
      surfacePerMetre: 0,
      totalLength: item.length * item.quantity,
      massEach,
      massTotal: massEach * item.quantity,
      surfaceTotal: (faces * item.quantity) / 1_000_000,
    };
  }

  const section = profileSection(item.profile, density);
  const metres = item.length / 1000;
  const massEach = section.massPerMetre * metres;

  return {
    ...section,
    totalLength: item.length * item.quantity,
    massEach,
    massTotal: massEach * item.quantity,
    surfaceTotal: section.surfacePerMetre * metres * item.quantity,
  };
}

/** Arc length of a pipe bend along its centreline. */
export function bendLength(centrelineRadius: number, degrees: number): number {
  return centrelineRadius * (degrees * (Math.PI / 180));
}

export function distance(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function volumeOf(mesh: IndexedMesh): number {
  return Math.abs(analyze(mesh).signedVolume);
}
