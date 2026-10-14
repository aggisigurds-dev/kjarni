/**
 * Sýn-only closure for tiny digitizing gaps between confirmed, co-linear solid walls.
 * Never changes saved data; never joins door openings or any glass interval.
 */
import type { Veggbutur } from "./hus3d";

type Endpoint = { x: number; y: number; ux: number; uy: number; idx: number; wall: Veggbutur };

export function smatengingar3D(segments: readonly Veggbutur[], pxPerM: number): Veggbutur[] {
  if (!Number.isFinite(pxPerM) || pxPerM <= 0 || segments.length > 20000) return [];
  const maxGap = pxPerM * 0.10; // ≤10 cm, not a real door-width opening
  const minGap = pxPerM * 0.005;
  if (maxGap <= 0.1) return [];
  const endpoints: Endpoint[] = [];
  for (let i = 0; i < segments.length; i++) {
    const w = segments[i];
    if (w.tegund !== "veggur" || w.laus || w.merking) continue;
    const dx = w.bx - w.ax, dy = w.by - w.ay, len = Math.hypot(dx, dy);
    if (len < maxGap * 2) continue; // don't bridge between tiny noise fragments
    const ux = dx / len, uy = dy / len;
    endpoints.push({ x: w.ax, y: w.ay, ux: -ux, uy: -uy, idx: i, wall: w });
    endpoints.push({ x: w.bx, y: w.by, ux, uy, idx: i, wall: w });
  }
  if (!endpoints.length) return [];
  const cell = maxGap;
  const at = (x: number, y: number) => `${Math.floor(x / cell)}:${Math.floor(y / cell)}`;
  const nearby = new Map<string, number[]>();
  endpoints.forEach((p, i) => {
    const key = at(p.x, p.y);
    const group = nearby.get(key) ?? [];
    group.push(i);
    nearby.set(key, group);
  });
  const bridges: { a: number; b: number; dist: number; seg: Veggbutur }[] = [];
  for (let i = 0; i < endpoints.length; i++) {
    const a = endpoints[i];
    const cx = Math.floor(a.x / cell), cy = Math.floor(a.y / cell);
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      for (const j of nearby.get(`${cx + ox}:${cy + oy}`) ?? []) {
        if (j <= i) continue;
        const b = endpoints[j];
        if (a.idx === b.idx || a.wall.eld !== b.wall.eld) continue;
        const dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy);
        if (dist < minGap || dist > maxGap) continue;
        const sx = dx / dist, sy = dy / dist;
        if (a.ux * sx + a.uy * sy < 0.99 || b.ux * sx + b.uy * sy > -0.99) continue;
        const thick = Math.max(1, Math.min(a.wall.thykkt, b.wall.thykkt));
        if (Math.abs(a.wall.thykkt - b.wall.thykkt) > Math.max(pxPerM * 0.05, thick * 0.4)) continue;
        // A tagged door/window must never be visually bridged.
        const midpointX = (a.x + b.x) / 2, midpointY = (a.y + b.y) / 2;
        if (segments.some(w => {
          if (w.tegund !== "hurd" && w.tegund !== "gler") return false;
          const wx = w.bx - w.ax, wy = w.by - w.ay, wsq = wx * wx + wy * wy;
          if (wsq < 1e-9) return false;
          const t = Math.max(0, Math.min(1, ((midpointX - w.ax) * wx + (midpointY - w.ay) * wy) / wsq));
          return Math.hypot(midpointX - w.ax - t * wx, midpointY - w.ay - t * wy) < Math.max(pxPerM * 0.15, w.thykkt);
        })) continue;
        bridges.push({ a: i, b: j, dist, seg: { ...a.wall, ax: a.x, ay: a.y, bx: b.x, by: b.y, thykkt: (a.wall.thykkt + b.wall.thykkt) / 2 } });
      }
    }
  }
  // One-to-one: a wall endpoint is joined at most once, with the shortest credible gap.
  bridges.sort((a, b) => a.dist - b.dist);
  const used = new Set<number>();
  const out: Veggbutur[] = [];
  for (const b of bridges) {
    if (used.has(b.a) || used.has(b.b)) continue;
    used.add(b.a); used.add(b.b);
    out.push(b.seg);
  }
  return out;
}
