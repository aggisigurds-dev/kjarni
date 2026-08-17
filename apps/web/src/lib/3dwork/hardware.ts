/**
 * Parametric hardware: the pipe, rod and bolt stock that is not 3D printed.
 *
 * A build is roughly two thirds printed parts and one third things you cut and
 * bolt. Those do not come from an STL — they come from a number you measured
 * with calipers. So they are generated from a spec instead, which means the
 * spec stays editable: change 28 mm to 30 mm and the geometry is rebuilt.
 *
 * Everything is generated along +X to match the blaster axis, centred on its
 * own origin so it drops onto a mount point like any imported part.
 */

import { profileSection, materialById } from './measure';

export type HardwareKind = 'pipe' | 'rod' | 'bolt' | 'screw';

export interface HardwareSpec {
  kind: HardwareKind;
  /** Overall length of the shaft, mm. */
  length: number;
  /** Outside diameter of the shaft, mm. */
  diameter: number;
  /** Wall thickness — pipes only. */
  wall?: number;
  /** Thread pitch in mm, recorded for the parts list. */
  threadPitch?: number;
  /** Head across-flats and depth — bolts and screws. */
  headDiameter?: number;
  headHeight?: number;
  /** Cut a real helical thread instead of drawing a plain cylinder. */
  threaded?: boolean;
  /** How much of the shaft is threaded; defaults to all of it. */
  threadLength?: number;
  /** Which standard this came from, for the parts list. */
  threadStandardId?: string;
}

export const HARDWARE_LABELS: Record<HardwareKind, string> = {
  pipe: 'Pipe / tube',
  rod: 'Rod / bar',
  bolt: 'Bolt',
  screw: 'Screw',
};

/** Sensible starting points, using the sizes that actually turn up in a build. */
export const HARDWARE_PRESETS: { name: string; spec: HardwareSpec }[] = [
  { name: 'Pipe 28 × 1.5 — 300 mm', spec: { kind: 'pipe', length: 300, diameter: 28, wall: 1.5 } },
  { name: 'Pipe 25 × 2.5 — 55 mm', spec: { kind: 'pipe', length: 55, diameter: 25, wall: 2.5 } },
  { name: 'Pipe 20 × 2 — 250 mm', spec: { kind: 'pipe', length: 250, diameter: 20, wall: 2 } },
  {
    name: 'Bolt M16 × 1.5 — 100 mm',
    spec: {
      kind: 'bolt',
      length: 100,
      diameter: 16,
      threadPitch: 1.5,
      headDiameter: 24,
      headHeight: 10,
    },
  },
];

/**
 * Thread standards, by the names they are ordered under.
 *
 * The imperial entries are pipe threads (BSP), where the label is a legacy
 * bore size and has almost nothing to do with the actual diameter — 1/8" pipe
 * measures 9.7 mm across the thread — so the real major diameter is carried
 * here rather than computed from the name.
 */
export interface ThreadStandard {
  id: string;
  name: string;
  /** Major (outside) diameter in mm. */
  majorDiameter: number;
  /** Pitch in mm — the distance from one crest to the next. */
  pitch: number;
  family: 'metric' | 'bsp';
}

export const THREAD_STANDARDS: ThreadStandard[] = [
  { id: 'bsp-1-8', name: 'G 1/8" (28 TPI)', majorDiameter: 9.728, pitch: 0.907, family: 'bsp' },
  { id: 'bsp-1-4', name: 'G 1/4" (19 TPI)', majorDiameter: 13.157, pitch: 1.337, family: 'bsp' },
  { id: 'bsp-3-8', name: 'G 3/8" (19 TPI)', majorDiameter: 16.662, pitch: 1.337, family: 'bsp' },
  { id: 'bsp-1-2', name: 'G 1/2" (14 TPI)', majorDiameter: 20.955, pitch: 1.814, family: 'bsp' },
  { id: 'bsp-3-4', name: 'G 3/4" (14 TPI)', majorDiameter: 26.441, pitch: 1.814, family: 'bsp' },
  { id: 'bsp-1', name: 'G 1" (11 TPI)', majorDiameter: 33.249, pitch: 2.309, family: 'bsp' },
  { id: 'm6', name: 'M6 × 1.0', majorDiameter: 6, pitch: 1, family: 'metric' },
  { id: 'm8', name: 'M8 × 1.25', majorDiameter: 8, pitch: 1.25, family: 'metric' },
  { id: 'm10', name: 'M10 × 1.5', majorDiameter: 10, pitch: 1.5, family: 'metric' },
  { id: 'm12', name: 'M12 × 1.75', majorDiameter: 12, pitch: 1.75, family: 'metric' },
  { id: 'm16', name: 'M16 × 1.5', majorDiameter: 16, pitch: 1.5, family: 'metric' },
  { id: 'm16-2', name: 'M16 × 2.0', majorDiameter: 16, pitch: 2, family: 'metric' },
  { id: 'm20', name: 'M20 × 2.5', majorDiameter: 20, pitch: 2.5, family: 'metric' },
];

export function threadById(id: string): ThreadStandard | undefined {
  return THREAD_STANDARDS.find((entry) => entry.id === id);
}

const SEGMENTS = 48;
/**
 * Threads are tessellated far more coarsely than plain stock. A 60 mm M16 bolt
 * at full resolution is 30k triangles, and a build carries twenty of them —
 * that is a quarter of a million triangles of fastener nobody prints. 24 facets
 * and 6 steps per turn still reads as a thread and costs a third as much.
 */
const THREAD_SEGMENTS = 24;
const THREAD_STEPS_PER_TURN = 6;
/** Hard ceiling for very long fine threads, which would otherwise run away. */
const THREAD_MAX_STEPS = 400;

/** Ring of points around the X axis at `x`, radius `radius`. */
function ring(x: number, radius: number, segment: number): [number, number, number] {
  const angle = (segment / SEGMENTS) * Math.PI * 2;
  return [x, Math.cos(angle) * radius, Math.sin(angle) * radius];
}

function pushTriangle(
  out: number[],
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number]
): void {
  out.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
}

/**
 * A closed cylindrical shell from x0 to x1. `inner` > 0 bores it through and
 * caps the ends as an annulus; `inner` of 0 makes it solid with fan-filled ends.
 */
function tube(out: number[], x0: number, x1: number, outer: number, inner: number): void {
  for (let i = 0; i < SEGMENTS; i++) {
    const oa0 = ring(x0, outer, i);
    const ob0 = ring(x0, outer, i + 1);
    const oa1 = ring(x1, outer, i);
    const ob1 = ring(x1, outer, i + 1);

    // Outer wall, facing away from the axis.
    pushTriangle(out, oa0, ob0, ob1);
    pushTriangle(out, oa0, ob1, oa1);

    if (inner > 0) {
      const ia0 = ring(x0, inner, i);
      const ib0 = ring(x0, inner, i + 1);
      const ia1 = ring(x1, inner, i);
      const ib1 = ring(x1, inner, i + 1);

      // Bore wall, wound the other way so it faces back toward the axis.
      pushTriangle(out, ia0, ib1, ib0);
      pushTriangle(out, ia0, ia1, ib1);

      // Annular caps.
      pushTriangle(out, oa0, ia0, ib0);
      pushTriangle(out, oa0, ib0, ob0);
      pushTriangle(out, oa1, ib1, ia1);
      pushTriangle(out, oa1, ob1, ib1);
    } else {
      // Solid: fan each end in to the centre.
      pushTriangle(out, oa0, [x0, 0, 0], ob0);
      pushTriangle(out, oa1, ob1, [x1, 0, 0]);
    }
  }
}

/**
 * A shaft with a real helical thread cut into it.
 *
 * Rather than sweeping a profile along a helix, the radius is modulated as a
 * function of position and angle: a triangle wave of (x/pitch - turns) gives
 * the 60-degree V flanks, and the surface is tessellated from that. Same shape,
 * far less code, and the triangle count stays predictable.
 */
function threadedShaft(
  out: number[],
  x0: number,
  x1: number,
  majorDiameter: number,
  pitch: number
): void {
  const majorR = majorDiameter / 2;
  // ISO profile: the thread is 0.6134 x pitch deep on the radius.
  const depth = 0.6134 * pitch;
  const minorR = Math.max(majorR - depth, 0.2);

  const length = x1 - x0;
  const steps = Math.min(
    THREAD_MAX_STEPS,
    Math.max(8, Math.ceil((length / pitch) * THREAD_STEPS_PER_TURN))
  );
  const dx = length / steps;

  const radiusAt = (x: number, segment: number): number => {
    const turns = (x - x0) / pitch - segment / THREAD_SEGMENTS;
    const phase = turns - Math.floor(turns);
    // Triangle wave: up one flank, down the other.
    const profile = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
    return minorR + (majorR - minorR) * profile;
  };

  const point = (step: number, segment: number): [number, number, number] => {
    const x = x0 + step * dx;
    const angle = (segment / THREAD_SEGMENTS) * Math.PI * 2;
    const r = radiusAt(x, segment);
    return [x, Math.cos(angle) * r, Math.sin(angle) * r];
  };

  for (let step = 0; step < steps; step++) {
    for (let i = 0; i < THREAD_SEGMENTS; i++) {
      const a0 = point(step, i);
      const b0 = point(step, i + 1);
      const a1 = point(step + 1, i);
      const b1 = point(step + 1, i + 1);

      pushTriangle(out, a0, b0, b1);
      pushTriangle(out, a0, b1, a1);
    }
  }

  // Cap both ends so the shaft is still a closed solid.
  for (let i = 0; i < THREAD_SEGMENTS; i++) {
    pushTriangle(out, point(0, i), [x0, 0, 0], point(0, i + 1));
    pushTriangle(out, point(steps, i), point(steps, i + 1), [x1, 0, 0]);
  }
}

/**
 * Build the mesh for a spec. Bolts and screws get a head behind the origin so
 * the shaft still starts at zero and reads as the usable length.
 */
export function hardwareMesh(spec: HardwareSpec): Float32Array {
  const out: number[] = [];
  const radius = Math.max(spec.diameter, 0.1) / 2;
  const length = Math.max(spec.length, 0.1);

  if (spec.kind === 'pipe') {
    const wall = Math.min(Math.max(spec.wall ?? 1, 0.05), radius - 0.05);
    tube(out, 0, length, radius, Math.max(radius - wall, 0.01));
  } else if (spec.threaded && spec.threadPitch) {
    // Thread only the length that is actually threaded; the rest is plain shank.
    const threadLength = Math.min(spec.threadLength ?? length, length);
    const shank = length - threadLength;
    if (shank > 0) tube(out, 0, shank, radius, 0);
    threadedShaft(out, shank, length, spec.diameter, spec.threadPitch);
  } else {
    tube(out, 0, length, radius, 0);
  }

  if (spec.kind === 'bolt' || spec.kind === 'screw') {
    const headRadius = Math.max(spec.headDiameter ?? spec.diameter * 1.5, spec.diameter) / 2;
    const headHeight = Math.max(spec.headHeight ?? spec.diameter * 0.6, 0.5);
    tube(out, -headHeight, 0, headRadius, 0);
  }

  // Centre on X so the part sits on its mount point rather than hanging off it.
  const soup = new Float32Array(out);
  const shift = spec.kind === 'bolt' || spec.kind === 'screw' ? length / 2 : length / 2;
  for (let i = 0; i + 2 < soup.length; i += 3) soup[i] -= shift;

  return soup;
}

export function hardwareLabel(spec: HardwareSpec): string {
  switch (spec.kind) {
    case 'pipe':
      return `Pipe ⌀${spec.diameter} × ${spec.wall ?? 0} wall — ${spec.length} mm`;
    case 'rod':
      return `Rod ⌀${spec.diameter} — ${spec.length} mm`;
    case 'bolt':
      return `Bolt M${spec.diameter}${spec.threadPitch ? `×${spec.threadPitch}` : ''} — ${spec.length} mm`;
    case 'screw':
      return `Screw ⌀${spec.diameter}${spec.threadPitch ? `×${spec.threadPitch}` : ''} — ${spec.length} mm`;
  }
}

/** Mass in grams, from the section rather than the mesh — exact, and instant. */
export function hardwareMass(spec: HardwareSpec, materialId: string): number {
  const density = materialById(materialId).density;

  if (spec.kind === 'pipe') {
    const section = profileSection(
      { kind: 'round-pipe', a: spec.diameter, t: spec.wall ?? 1 },
      density
    );
    return section.massPerMetre * (spec.length / 1000) * 1000;
  }

  const shaft = profileSection({ kind: 'round-bar', a: spec.diameter }, density);
  let grams = shaft.massPerMetre * (spec.length / 1000) * 1000;

  if (spec.kind === 'bolt' || spec.kind === 'screw') {
    const headRadius = Math.max(spec.headDiameter ?? spec.diameter * 1.5, spec.diameter);
    const headHeight = Math.max(spec.headHeight ?? spec.diameter * 0.6, 0.5);
    const head = profileSection({ kind: 'round-bar', a: headRadius }, density);
    grams += head.massPerMetre * (headHeight / 1000) * 1000;
  }

  return grams;
}

/** Overall length including any head, for the parts list. */
export function hardwareOverallLength(spec: HardwareSpec): number {
  if (spec.kind === 'bolt' || spec.kind === 'screw') {
    return spec.length + Math.max(spec.headHeight ?? spec.diameter * 0.6, 0.5);
  }
  return spec.length;
}

export function defaultSpec(kind: HardwareKind): HardwareSpec {
  switch (kind) {
    case 'pipe':
      return { kind, length: 300, diameter: 28, wall: 1.5 };
    case 'rod':
      return { kind, length: 200, diameter: 10 };
    case 'bolt':
      return { kind, length: 100, diameter: 16, threadPitch: 1.5, headDiameter: 24, headHeight: 10 };
    case 'screw':
      return { kind, length: 20, diameter: 4, threadPitch: 0.7, headDiameter: 8, headHeight: 3 };
  }
}
