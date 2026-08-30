import { newId } from "./ids";
import { objectLayerId } from "./layers";
import type { BoardObject, EllipseObject, LineObject } from "./types";

/** Pipe layers that overlay the floor plan (Teikning) and wall strokes. */
export const PIPING_LAYER_IDS = ["kalt", "heitt", "skolp", "loftræsting", "hitakerfi"] as const;

export const CROSSING_NAME = "Gegnumtak";
export const CROSSING_FIRE_NAME = "Gegnumtak brunahólf";

export type Point = { x: number; y: number };

export type Segment = { ax: number; ay: number; bx: number; by: number };

export type CrossingHit = Point & {
  pipeId: string;
  wallId: string;
  layerId: string;
  fireStop: boolean;
  parentId?: string;
  color: string;
};

const PIPE_SET = new Set<string>(PIPING_LAYER_IDS);
const EPS = 1e-8;
const ENDPOINT_PAD = 1e-4;

const WALL_NAME_PREFIXES = ["Veggir", "Veggur", "EI-veggur", "Eldveggur"];

/** Manual walls, traced clean-plan walls, and E-30 / E-60 firewall strokes. */
export function isWallStroke(obj: BoardObject): obj is LineObject {
  if (obj.type !== "polyline" && obj.type !== "line") return false;
  if (obj.points.length < 4) return false;
  return WALL_NAME_PREFIXES.some((prefix) => obj.name.startsWith(prefix));
}

export function isPipingStroke(obj: BoardObject): obj is LineObject {
  if (isCrossingMark(obj)) return false;
  if (obj.type !== "line" && obj.type !== "polyline" && obj.type !== "pen") return false;
  if (obj.points.length < 4) return false;
  return PIPE_SET.has(objectLayerId(obj));
}

export function isCrossingMark(obj: BoardObject): boolean {
  return obj.name === CROSSING_NAME || obj.name === CROSSING_FIRE_NAME || obj.name.startsWith("Gegnumtak");
}

/** Extra emphasis: fire-compartment penetrations (E-30 / EI-60 / EI-CS / EI-veggur). */
export function isRatedFirewallWall(obj: BoardObject): boolean {
  if (!isWallStroke(obj)) return false;
  const n = obj.name;
  if (n.startsWith("EI-veggur") || n.startsWith("Eldveggur")) return true;
  return /EI?-?(CS-?)?(30|60)/i.test(n);
}

export function worldSegments(obj: Pick<LineObject, "x" | "y" | "points">): Segment[] {
  const pts = obj.points;
  const segs: Segment[] = [];
  for (let i = 2; i < pts.length; i += 2) {
    const ax = obj.x + pts[i - 2];
    const ay = obj.y + pts[i - 1];
    const bx = obj.x + pts[i];
    const by = obj.y + pts[i + 1];
    if (Math.hypot(bx - ax, by - ay) < 0.5) continue;
    segs.push({ ax, ay, bx, by });
  }
  return segs;
}

/** Proper 2D segment/segment hit. Parallel / overlapping segments return null. */
export function segmentIntersection(a: Segment, b: Segment): Point | null {
  const rX = a.bx - a.ax;
  const rY = a.by - a.ay;
  const sX = b.bx - b.ax;
  const sY = b.by - b.ay;
  const den = rX * sY - rY * sX;
  if (Math.abs(den) < EPS) return null;
  const t = ((b.ax - a.ax) * sY - (b.ay - a.ay) * sX) / den;
  const u = ((b.ax - a.ax) * rY - (b.ay - a.ay) * rX) / den;
  if (t < -ENDPOINT_PAD || t > 1 + ENDPOINT_PAD || u < -ENDPOINT_PAD || u > 1 + ENDPOINT_PAD) {
    return null;
  }
  return { x: a.ax + t * rX, y: a.ay + t * rY };
}

export function findCrossings(objects: BoardObject[]): CrossingHit[] {
  const pipes = objects.filter(isPipingStroke);
  const walls = objects.filter(isWallStroke);
  const hits: CrossingHit[] = [];
  for (const pipe of pipes) {
    const pipeSegs = worldSegments(pipe);
    const layerId = objectLayerId(pipe);
    const color = "stroke" in pipe ? pipe.stroke : "#2563eb";
    for (const wall of walls) {
      const fireStop = isRatedFirewallWall(wall);
      const wallSegs = worldSegments(wall);
      for (const ps of pipeSegs) {
        for (const ws of wallSegs) {
          const pt = segmentIntersection(ps, ws);
          if (!pt) continue;
          hits.push({
            ...pt,
            pipeId: pipe.id,
            wallId: wall.id,
            layerId,
            fireStop,
            parentId: pipe.parentId ?? wall.parentId,
            color,
          });
        }
      }
    }
  }
  return dedupeHits(hits);
}

export function dedupeHits(hits: CrossingHit[], gap = 6): CrossingHit[] {
  const out: CrossingHit[] = [];
  for (const hit of hits) {
    const i = out.findIndex((o) => Math.hypot(o.x - hit.x, o.y - hit.y) < gap);
    if (i < 0) {
      out.push(hit);
      continue;
    }
    if (hit.fireStop && !out[i].fireStop) out[i] = hit;
  }
  return out;
}

export function marksFromHits(hits: CrossingHit[], idFn: () => string = newId): EllipseObject[] {
  return hits.map((hit) => {
    const size = hit.fireStop ? 22 : 14;
    return {
      id: idFn(),
      type: "ellipse",
      x: hit.x - size / 2,
      y: hit.y - size / 2,
      width: size,
      height: size,
      fill: hit.fireStop ? "#FE653Fcc" : `${hit.color}cc`,
      stroke: hit.fireStop ? "#1c1917" : "#ffffff",
      strokeWidth: hit.fireStop ? 3 : 2,
      rotation: 0,
      opacity: 1,
      locked: false,
      hidden: false,
      name: hit.fireStop ? CROSSING_FIRE_NAME : CROSSING_NAME,
      layerId: hit.layerId,
      parentId: hit.parentId,
    };
  });
}

/** Drop previous gegnumtök and stamp fresh marks. Same object list otherwise. */
export function replaceCrossingMarks(objects: BoardObject[], idFn: () => string = newId): BoardObject[] {
  const base = objects.filter((o) => !isCrossingMark(o));
  return [...base, ...marksFromHits(findCrossings(base), idFn)];
}

export function crossingSignature(objects: BoardObject[]): string {
  return objects
    .filter(isCrossingMark)
    .map((o) => `${o.name}:${o.x.toFixed(1)},${o.y.toFixed(1)}`)
    .sort()
    .join("|");
}
