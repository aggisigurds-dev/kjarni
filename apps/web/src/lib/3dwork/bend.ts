/**
 * Pipe bending.
 *
 * A bender takes a straight length of stock and wraps part of it around a die,
 * so the shape is always the same three pieces: a straight leg, an arc of the
 * die's radius, and another straight leg. Bending does not stretch the stock —
 * the centreline length is what it was — so the arc eats into the material and
 * the second leg is whatever is left. That is the fact a cut list needs, and it
 * is why the length here is the length of the stock you cut, not the distance
 * between the ends afterwards.
 *
 * The sweep frame is exact rather than parallel-transported: the whole
 * centreline lies in one plane, so the cross-section can be carried along on a
 * fixed out-of-plane axis with no accumulated twist.
 */

export interface BendSpec {
  /** Length of straight stock before bending, mm. Preserved by the bend. */
  length: number;
  /** Outside diameter, mm. */
  diameter: number;
  /** Wall thickness, mm. Zero or absent makes it a solid rod. */
  wall?: number;
  /** Bend angle in degrees. */
  angle: number;
  /** Centreline bend radius — the die's radius, mm. */
  radius: number;
  /** Distance along the stock from the start to where the arc begins, mm. */
  start: number;
}

export interface BendReport {
  /** Straight leg before the arc, mm. */
  legIn: number;
  /** Straight leg after the arc, mm. */
  legOut: number;
  /** Material consumed by the arc, mm. */
  arcLength: number;
  /** Total centreline length — equal to the stock you cut. */
  developedLength: number;
  /**
   * How far the bender's die reaches back along each leg. Bending closer than
   * this to an end is not possible, so it is the first thing to check.
   */
  tangentOffset: number;
  /** Straight-line distance between the two ends after bending, mm. */
  span: number;
  /** Ratio of bend radius to diameter. Below about 1.5 a pipe kinks. */
  radiusToDiameter: number;
  /** True when the geometry is impossible or would collapse the pipe. */
  warnings: string[];
}

const SEGMENTS = 48;
/** Degrees of arc per sampled ring. Finer than the facets, so arcs read round. */
const ARC_STEP_DEGREES = 3;

type Point = [number, number, number];

function push(out: number[], a: Point, b: Point, c: Point): void {
  out.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
}

/** One sampled station on the centreline: a position and its in-plane normal. */
interface Station {
  p: Point;
  /** Unit vector across the pipe, in the bend plane. */
  v: Point;
}

/**
 * Sample the centreline. `u` is constant at +Z because the bend is planar, so
 * `v` is all that has to turn, and it turns with the tangent.
 */
function centreline(report: BendReport, spec: BendSpec): Station[] {
  const stations: Station[] = [];
  const theta = (spec.angle * Math.PI) / 180;
  const steps = Math.max(2, Math.ceil(spec.angle / ARC_STEP_DEGREES));

  // Leg in, running along +X from the origin.
  stations.push({ p: [0, 0, 0], v: [0, 1, 0] });
  stations.push({ p: [report.legIn, 0, 0], v: [0, 1, 0] });

  // Arc, centred one radius to the +Y side of the tangent point.
  const cx = report.legIn;
  const cy = spec.radius;
  for (let i = 1; i <= steps; i++) {
    const t = (i / steps) * theta;
    stations.push({
      p: [cx + spec.radius * Math.sin(t), cy - spec.radius * Math.cos(t), 0],
      // Tangent is (cos t, sin t, 0); across the pipe is that turned a quarter.
      v: [-Math.sin(t), Math.cos(t), 0],
    });
  }

  // Leg out, along the tangent the arc finished on.
  const end = stations[stations.length - 1];
  if (report.legOut > 0) {
    stations.push({
      p: [
        end.p[0] + Math.cos(theta) * report.legOut,
        end.p[1] + Math.sin(theta) * report.legOut,
        0,
      ],
      v: end.v,
    });
  }

  return stations;
}

/** Ring of points around one station at the given radius. */
function ringAt(station: Station, radius: number, segment: number): Point {
  const angle = (segment / SEGMENTS) * Math.PI * 2;
  const c = Math.cos(angle) * radius;
  const s = Math.sin(angle) * radius;
  // u is +Z, so its contribution only ever lands on the z component.
  return [station.p[0] + station.v[0] * c, station.p[1] + station.v[1] * c, s];
}

/** Skin consecutive rings into a tube wall. `flip` reverses it for a bore. */
function skin(out: number[], stations: Station[], radius: number, flip: boolean): void {
  for (let i = 0; i + 1 < stations.length; i++) {
    for (let s = 0; s < SEGMENTS; s++) {
      const a = ringAt(stations[i], radius, s);
      const b = ringAt(stations[i], radius, s + 1);
      const c = ringAt(stations[i + 1], radius, s);
      const d = ringAt(stations[i + 1], radius, s + 1);
      if (flip) {
        push(out, a, c, b);
        push(out, b, c, d);
      } else {
        push(out, a, b, c);
        push(out, b, d, c);
      }
    }
  }
}

/** Close one end: an annulus when there is a bore, a fan when it is solid. */
function cap(out: number[], station: Station, outer: number, inner: number, flip: boolean): void {
  for (let s = 0; s < SEGMENTS; s++) {
    const o0 = ringAt(station, outer, s);
    const o1 = ringAt(station, outer, s + 1);
    if (inner > 0) {
      const i0 = ringAt(station, inner, s);
      const i1 = ringAt(station, inner, s + 1);
      if (flip) {
        push(out, o0, i0, o1);
        push(out, o1, i0, i1);
      } else {
        push(out, o0, o1, i0);
        push(out, o1, i1, i0);
      }
    } else if (flip) {
      push(out, station.p, o1, o0);
    } else {
      push(out, station.p, o0, o1);
    }
  }
}

/**
 * Work out the shop numbers for a bend, and say plainly when they are wrong.
 *
 * This is separated from the mesh because the numbers are useful on their own —
 * they answer whether a bend is possible on the stock you have before anything
 * is drawn.
 */
export function bendReport(spec: BendSpec): BendReport {
  const warnings: string[] = [];
  const angle = Math.max(0, Math.min(180, spec.angle));
  const radius = Math.max(0.1, spec.radius);
  const arcLength = radius * ((angle * Math.PI) / 180);

  const legIn = Math.max(0, Math.min(spec.start, spec.length));
  const legOut = Math.max(0, spec.length - legIn - arcLength);

  if (legIn + arcLength > spec.length) {
    warnings.push('The arc runs past the end of the stock — lengthen it or bend closer to the start.');
  }

  // The die grips a tangent length on each side; that much of each leg is
  // taken up by the machine and cannot also be part of another bend.
  const tangentOffset = radius * Math.tan(((angle / 2) * Math.PI) / 180);
  if (angle > 0 && (legIn < tangentOffset || legOut < tangentOffset)) {
    warnings.push('A leg is shorter than the die reaches back — the bender cannot grip it.');
  }

  const radiusToDiameter = radius / Math.max(spec.diameter, 0.001);
  if (angle > 0 && radiusToDiameter < 1.5) {
    warnings.push('Bend radius under 1.5x diameter — thin wall will kink on the outside of the bend.');
  }

  const theta = (angle * Math.PI) / 180;
  const endX = legIn + radius * Math.sin(theta) + Math.cos(theta) * legOut;
  const endY = radius - radius * Math.cos(theta) + Math.sin(theta) * legOut;
  const span = Math.hypot(endX, endY);

  return {
    legIn,
    legOut,
    arcLength,
    developedLength: legIn + arcLength + legOut,
    tangentOffset,
    span,
    radiusToDiameter,
    warnings,
  };
}

/**
 * Build the bent pipe as a triangle soup, centred on its own bounding box.
 *
 * A zero angle is a legitimate input — it produces the straight stock — so it
 * is not treated as an error.
 */
export function bendMesh(spec: BendSpec): Float32Array {
  const report = bendReport(spec);
  const stations = centreline(report, { ...spec, angle: Math.max(0, Math.min(180, spec.angle)) });

  const outer = Math.max(spec.diameter, 0.01) / 2;
  const wall = Math.max(0, spec.wall ?? 0);
  // A wall at or past the centre is solid stock, not a pipe.
  const inner = wall > 0 && wall < outer ? outer - wall : 0;

  const out: number[] = [];
  skin(out, stations, outer, false);
  if (inner > 0) skin(out, stations, inner, true);
  cap(out, stations[0], outer, inner, true);
  cap(out, stations[stations.length - 1], outer, inner, false);

  const soup = new Float32Array(out);

  // Centre it, so it lands on the table like every other part.
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i + 2 < soup.length; i += 3) {
    if (soup[i] < minX) minX = soup[i];
    if (soup[i] > maxX) maxX = soup[i];
    if (soup[i + 1] < minY) minY = soup[i + 1];
    if (soup[i + 1] > maxY) maxY = soup[i + 1];
    if (soup[i + 2] < minZ) minZ = soup[i + 2];
    if (soup[i + 2] > maxZ) maxZ = soup[i + 2];
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const cz = (minZ + maxZ) / 2;
  for (let i = 0; i + 2 < soup.length; i += 3) {
    soup[i] -= cx;
    soup[i + 1] -= cy;
    soup[i + 2] -= cz;
  }

  return soup;
}

export function bendLabel(spec: BendSpec): string {
  const wall = spec.wall && spec.wall > 0 ? ` × ${spec.wall} wall` : '';
  return `${spec.length} × ⌀${spec.diameter}${wall} — ${spec.angle}° at R${spec.radius}`;
}

export const DEFAULT_BEND: BendSpec = {
  length: 300,
  diameter: 28,
  wall: 1.5,
  angle: 45,
  radius: 84,
  start: 120,
};
