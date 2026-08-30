/**
 * Wall tracer for architectural floor plans.
 *
 * Goal: over-simplify. Keep thick outer + interior walls as H/V centerlines
 * and drop dimension strings, furniture, hatching and labels. This is not CAD.
 */

export type WallSegment = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type TraceWallsOptions = {
  /** Luminance below this (0–255) counts as ink. Default 155. */
  lumCut?: number;
  /** Max chroma for ink (drops yellow paper / coloured markup). Default 0.45. */
  satCut?: number;
  /** Minimum wall length in pixels. Default ~3% of the short side. */
  minLength?: number;
  /** Wall thickness band, in pixels at the working scale. */
  minThick?: number;
  maxThick?: number;
  /** Opening radius — kills 1 px dimension lines. Default 1. */
  openRadius?: number;
  /** Closing radius — joins double wall lines. Default 2. */
  closeRadius?: number;
  /** Drop connected ink blobs smaller than this (px²). Default 50. */
  minBlobArea?: number;
  /** Join collinear pieces across tiny gaps (not doorways). Default 8. */
  joinGap?: number;
  /** Dilate radius used to blob the building and drop outer dimension strings. */
  buildingDilate?: number;
};

export type TraceWallsResult = {
  segments: WallSegment[];
  polylines: number[][];
  width: number;
  height: number;
  inkPixels: number;
  keptPixels: number;
};

const DEFAULTS = {
  lumCut: 155,
  satCut: 0.45,
  minThick: 2,
  maxThick: 22,
  openRadius: 1,
  closeRadius: 2,
  minBlobArea: 50,
  joinGap: 8,
};

export function inkFromRgba(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  lumCut = DEFAULTS.lumCut,
  satCut = DEFAULTS.satCut
): Uint8Array {
  const mask = new Uint8Array(width * height);
  const n = width * height;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    const a = data[o + 3];
    if (a < 60) continue;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const max = Math.max(r, g, b);
    const sat = max === 0 ? 0 : (max - Math.min(r, g, b)) / max;
    if (lum < lumCut && sat < satCut) mask[i] = 1;
  }
  return mask;
}

function boxDilate(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return src.slice();
  const tmp = new Uint8Array(src.length);
  const dst = new Uint8Array(src.length);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let x = 0; x < w; x++) {
      if (x === 0) {
        acc = 0;
        for (let k = 0; k <= r && k < w; k++) acc += src[row + k];
      } else {
        if (x + r < w) acc += src[row + x + r];
        if (x - r - 1 >= 0) acc -= src[row + x - r - 1];
      }
      tmp[row + x] = acc > 0 ? 1 : 0;
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = 0; y < h; y++) {
      if (y === 0) {
        acc = 0;
        for (let k = 0; k <= r && k < h; k++) acc += tmp[k * w + x];
      } else {
        if (y + r < h) acc += tmp[(y + r) * w + x];
        if (y - r - 1 >= 0) acc -= tmp[(y - r - 1) * w + x];
      }
      dst[y * w + x] = acc > 0 ? 1 : 0;
    }
  }
  return dst;
}

function boxErode(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return src.slice();
  const tmp = new Uint8Array(src.length);
  const dst = new Uint8Array(src.length);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let x = 0; x < w; x++) {
      if (x === 0) {
        acc = 0;
        for (let k = 0; k <= r && k < w; k++) acc += src[row + k];
      } else {
        if (x + r < w) acc += src[row + x + r];
        if (x - r - 1 >= 0) acc -= src[row + x - r - 1];
      }
      const span = Math.min(x, r) + 1 + Math.min(w - 1 - x, r);
      tmp[row + x] = acc === span ? 1 : 0;
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = 0; y < h; y++) {
      if (y === 0) {
        acc = 0;
        for (let k = 0; k <= r && k < h; k++) acc += tmp[k * w + x];
      } else {
        if (y + r < h) acc += tmp[(y + r) * w + x];
        if (y - r - 1 >= 0) acc -= tmp[(y - r - 1) * w + x];
      }
      const span = Math.min(y, r) + 1 + Math.min(h - 1 - y, r);
      dst[y * w + x] = acc === span ? 1 : 0;
    }
  }
  return dst;
}

export function morphOpen(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  return boxDilate(boxErode(src, w, h, r), w, h, r);
}

export function morphClose(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  return boxErode(boxDilate(src, w, h, r), w, h, r);
}

export function dropSmallComponents(
  src: Uint8Array,
  w: number,
  h: number,
  minArea: number
): Uint8Array {
  const dst = src.slice();
  const seen = new Uint8Array(src.length);
  const qx = new Int32Array(src.length);
  const qy = new Int32Array(src.length);
  for (let i = 0; i < src.length; i++) {
    if (!src[i] || seen[i]) continue;
    let head = 0;
    let tail = 0;
    const sx = i % w;
    const sy = (i / w) | 0;
    qx[tail] = sx;
    qy[tail] = sy;
    tail++;
    seen[i] = 1;
    while (head < tail) {
      const x = qx[head];
      const y = qy[head];
      head++;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (!src[ni] || seen[ni]) continue;
          seen[ni] = 1;
          qx[tail] = nx;
          qy[tail] = ny;
          tail++;
        }
      }
    }
    if (tail < minArea) {
      for (let k = 0; k < tail; k++) dst[qy[k] * w + qx[k]] = 0;
    }
  }
  return dst;
}

function countInk(mask: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) n++;
  return n;
}

function maskAnd(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] && b[i] ? 1 : 0;
  return out;
}

/** Keep the largest connected blob (4-connected). Used after a heavy dilate. */
export function largestComponent(src: Uint8Array, w: number, h: number): Uint8Array {
  const seen = new Uint8Array(src.length);
  const best = new Uint8Array(src.length);
  const qx = new Int32Array(src.length);
  const qy = new Int32Array(src.length);
  let bestSize = 0;
  for (let i = 0; i < src.length; i++) {
    if (!src[i] || seen[i]) continue;
    let head = 0;
    let tail = 0;
    qx[tail] = i % w;
    qy[tail] = (i / w) | 0;
    tail++;
    seen[i] = 1;
    while (head < tail) {
      const x = qx[head];
      const y = qy[head];
      head++;
      if (x > 0) {
        const ni = y * w + x - 1;
        if (src[ni] && !seen[ni]) {
          seen[ni] = 1;
          qx[tail] = x - 1;
          qy[tail] = y;
          tail++;
        }
      }
      if (x + 1 < w) {
        const ni = y * w + x + 1;
        if (src[ni] && !seen[ni]) {
          seen[ni] = 1;
          qx[tail] = x + 1;
          qy[tail] = y;
          tail++;
        }
      }
      if (y > 0) {
        const ni = (y - 1) * w + x;
        if (src[ni] && !seen[ni]) {
          seen[ni] = 1;
          qx[tail] = x;
          qy[tail] = y - 1;
          tail++;
        }
      }
      if (y + 1 < h) {
        const ni = (y + 1) * w + x;
        if (src[ni] && !seen[ni]) {
          seen[ni] = 1;
          qx[tail] = x;
          qy[tail] = y + 1;
          tail++;
        }
      }
    }
    if (tail > bestSize) {
      bestSize = tail;
      best.fill(0);
      for (let k = 0; k < tail; k++) best[qy[k] * w + qx[k]] = 1;
    }
  }
  return best;
}

function segLen(s: WallSegment) {
  return Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
}

/** Drop isolated short strokes (furniture, ticks) that never meet another wall. */
export function keepConnectedSegments(segs: WallSegment[], joinPx: number, minKeep: number): WallSegment[] {
  if (segs.length < 2) return segs.filter((s) => segLen(s) >= minKeep);
  const near = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by) <= joinPx;
  const degree = segs.map(() => 0);
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const a = segs[i];
      const b = segs[j];
      const hit =
        near(a.x1, a.y1, b.x1, b.y1) ||
        near(a.x1, a.y1, b.x2, b.y2) ||
        near(a.x2, a.y2, b.x1, b.y1) ||
        near(a.x2, a.y2, b.x2, b.y2);
      if (hit) {
        degree[i]++;
        degree[j]++;
      }
    }
  }
  return segs.filter((s, i) => degree[i] > 0 || segLen(s) >= minKeep * 2);
}

/** Vertical ink span through (x,y). Returns 0 if the pixel is empty. */
function spanV(mask: Uint8Array, w: number, h: number, x: number, y: number) {
  if (!mask[y * w + x]) return { top: y, bot: y, mid: y, thick: 0 };
  let top = y;
  while (top > 0 && mask[(top - 1) * w + x]) top--;
  let bot = y;
  while (bot + 1 < h && mask[(bot + 1) * w + x]) bot++;
  return { top, bot, mid: (top + bot) / 2, thick: bot - top + 1 };
}

function spanH(mask: Uint8Array, w: number, _h: number, x: number, y: number) {
  if (!mask[y * w + x]) return { left: x, right: x, mid: x, thick: 0 };
  const row = y * w;
  let left = x;
  while (left > 0 && mask[row + left - 1]) left--;
  let right = x;
  while (right + 1 < w && mask[row + right + 1]) right++;
  return { left, right, mid: (left + right) / 2, thick: right - left + 1 };
}

function walkHorizontal(
  mask: Uint8Array,
  w: number,
  h: number,
  x0: number,
  y0: number,
  minThick: number,
  maxThick: number,
  visited: Uint8Array
): WallSegment | null {
  const seed = spanV(mask, w, h, x0, y0);
  if (seed.thick < minThick || seed.thick > maxThick) return null;
  let midY = seed.mid;
  let x1 = x0;
  let x2 = x0;
  const markCol = (x: number, y: number) => {
    const s = spanV(mask, w, h, x, Math.round(y));
    for (let yy = s.top; yy <= s.bot; yy++) visited[yy * w + x] = 1;
    return s;
  };
  markCol(x0, midY);
  while (x1 > 0) {
    const s = spanV(mask, w, h, x1 - 1, Math.round(midY));
    if (s.thick < minThick || s.thick > maxThick) break;
    if (Math.abs(s.mid - midY) > 4) break;
    x1--;
    midY = (midY * 3 + s.mid) / 4;
    markCol(x1, midY);
  }
  midY = seed.mid;
  while (x2 + 1 < w) {
    const s = spanV(mask, w, h, x2 + 1, Math.round(midY));
    if (s.thick < minThick || s.thick > maxThick) break;
    if (Math.abs(s.mid - midY) > 4) break;
    x2++;
    midY = (midY * 3 + s.mid) / 4;
    markCol(x2, midY);
  }
  const y = (spanV(mask, w, h, x1, y0).mid + spanV(mask, w, h, x2, y0).mid) / 2;
  return { x1, y1: y, x2, y2: y };
}

function walkVertical(
  mask: Uint8Array,
  w: number,
  h: number,
  x0: number,
  y0: number,
  minThick: number,
  maxThick: number,
  visited: Uint8Array
): WallSegment | null {
  const seed = spanH(mask, w, h, x0, y0);
  if (seed.thick < minThick || seed.thick > maxThick) return null;
  let midX = seed.mid;
  let y1 = y0;
  let y2 = y0;
  const markRow = (x: number, y: number) => {
    const s = spanH(mask, w, h, Math.round(x), y);
    const row = y * w;
    for (let xx = s.left; xx <= s.right; xx++) visited[row + xx] = 1;
    return s;
  };
  markRow(midX, y0);
  while (y1 > 0) {
    const s = spanH(mask, w, h, Math.round(midX), y1 - 1);
    if (s.thick < minThick || s.thick > maxThick) break;
    if (Math.abs(s.mid - midX) > 4) break;
    y1--;
    midX = (midX * 3 + s.mid) / 4;
    markRow(midX, y1);
  }
  midX = seed.mid;
  while (y2 + 1 < h) {
    const s = spanH(mask, w, h, Math.round(midX), y2 + 1);
    if (s.thick < minThick || s.thick > maxThick) break;
    if (Math.abs(s.mid - midX) > 4) break;
    y2++;
    midX = (midX * 3 + s.mid) / 4;
    markRow(midX, y2);
  }
  const x = (spanH(mask, w, h, x0, y1).mid + spanH(mask, w, h, x0, y2).mid) / 2;
  return { x1: x, y1, x2: x, y2 };
}

export function extractAxisSegments(
  mask: Uint8Array,
  w: number,
  h: number,
  minLength: number,
  minThick: number,
  maxThick: number
): WallSegment[] {
  const segs: WallSegment[] = [];
  const visH = new Uint8Array(mask.length);
  const visV = new Uint8Array(mask.length);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i] || visH[i]) continue;
      const sv = spanV(mask, w, h, x, y);
      if (sv.thick < minThick || sv.thick > maxThick) continue;
      if (Math.abs(y - sv.mid) > 0.6) continue;
      const seg = walkHorizontal(mask, w, h, x, y, minThick, maxThick, visH);
      if (seg && Math.abs(seg.x2 - seg.x1) + 1 >= minLength) segs.push(seg);
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i] || visV[i]) continue;
      const sh = spanH(mask, w, h, x, y);
      if (sh.thick < minThick || sh.thick > maxThick) continue;
      if (Math.abs(x - sh.mid) > 0.6) continue;
      const seg = walkVertical(mask, w, h, x, y, minThick, maxThick, visV);
      if (seg && Math.abs(seg.y2 - seg.y1) + 1 >= minLength) segs.push(seg);
    }
  }

  return segs;
}

function isHorizontal(s: WallSegment) {
  return Math.abs(s.y2 - s.y1) <= Math.abs(s.x2 - s.x1);
}

function normH(s: WallSegment): WallSegment {
  return s.x1 <= s.x2 ? s : { x1: s.x2, y1: s.y2, x2: s.x1, y2: s.y1 };
}

function normV(s: WallSegment): WallSegment {
  return s.y1 <= s.y2 ? s : { x1: s.x2, y1: s.y2, x2: s.x1, y2: s.y1 };
}

export function mergeCollinearSegments(segs: WallSegment[], joinGap: number): WallSegment[] {
  const horiz = segs.filter(isHorizontal).map(normH).sort((a, b) => a.y1 - b.y1 || a.x1 - b.x1);
  const vert = segs.filter((s) => !isHorizontal(s)).map(normV).sort((a, b) => a.x1 - b.x1 || a.y1 - b.y1);

  const merge = (list: WallSegment[], horizontal: boolean) => {
    const out: WallSegment[] = [];
    for (const s of list) {
      const last = out[out.length - 1];
      if (!last) {
        out.push({ ...s });
        continue;
      }
      if (horizontal) {
        const yClose = Math.abs(last.y1 - s.y1) <= 2.5;
        const gap = s.x1 - last.x2;
        if (yClose && gap >= -2 && gap <= joinGap) {
          last.x2 = Math.max(last.x2, s.x2);
          last.y1 = last.y2 = (last.y1 + s.y1) / 2;
          continue;
        }
      } else {
        const xClose = Math.abs(last.x1 - s.x1) <= 2.5;
        const gap = s.y1 - last.y2;
        if (xClose && gap >= -2 && gap <= joinGap) {
          last.y2 = Math.max(last.y2, s.y2);
          last.x1 = last.x2 = (last.x1 + s.x1) / 2;
          continue;
        }
      }
      out.push({ ...s });
    }
    return out;
  };

  return [...merge(horiz, true), ...merge(vert, false)];
}

type Node = { x: number; y: number; edges: number[] };

function snapKey(x: number, y: number, grid: number) {
  return `${Math.round(x / grid) * grid},${Math.round(y / grid) * grid}`;
}

/** Chain H/V segments that meet at corners into polylines. T-junctions split. */
export function chainIntoPolylines(segs: WallSegment[], joinPx = 5): number[][] {
  if (!segs.length) return [];
  const nodes: Node[] = [];
  const index = new Map<string, number>();
  const nodeAt = (x: number, y: number) => {
    const key = snapKey(x, y, joinPx);
    const existing = index.get(key);
    if (existing !== undefined) return existing;
    const id = nodes.length;
    nodes.push({ x, y, edges: [] });
    index.set(key, id);
    return id;
  };
  const edges: { a: number; b: number; used: boolean }[] = [];
  for (const s of segs) {
    const a = nodeAt(s.x1, s.y1);
    const b = nodeAt(s.x2, s.y2);
    if (a === b) continue;
    const ei = edges.length;
    edges.push({ a, b, used: false });
    nodes[a].edges.push(ei);
    nodes[b].edges.push(ei);
  }

  const unusedFrom = (ni: number) => nodes[ni].edges.find((ei) => !edges[ei].used);

  const walk = (start: number, edgeId: number): number[] => {
    const pts = [nodes[start].x, nodes[start].y];
    let cur = start;
    let ei = edgeId;
    while (ei !== undefined) {
      const e = edges[ei];
      e.used = true;
      const next = e.a === cur ? e.b : e.a;
      pts.push(nodes[next].x, nodes[next].y);
      cur = next;
      const degree = nodes[cur].edges.filter((id) => !edges[id].used).length;
      if (degree !== 1) break;
      ei = unusedFrom(cur) as number;
    }
    return pts;
  };

  const polylines: number[][] = [];
  for (let ni = 0; ni < nodes.length; ni++) {
    const degree = nodes[ni].edges.length;
    if (degree === 0) continue;
    let ei = unusedFrom(ni);
    while (ei !== undefined && nodes[ni].edges.filter((id) => !edges[id].used).length > 0) {
      if (degree !== 1 && nodes[ni].edges.filter((id) => !edges[id].used).length !== 1) break;
      polylines.push(walk(ni, ei));
      ei = unusedFrom(ni);
    }
  }
  for (let ei = 0; ei < edges.length; ei++) {
    if (edges[ei].used) continue;
    polylines.push(walk(edges[ei].a, ei));
  }
  return polylines.filter((p) => p.length >= 4);
}

export function snapAxis(seg: WallSegment): WallSegment {
  if (Math.abs(seg.x2 - seg.x1) >= Math.abs(seg.y2 - seg.y1)) {
    const y = (seg.y1 + seg.y2) / 2;
    return { x1: seg.x1, y1: y, x2: seg.x2, y2: y };
  }
  const x = (seg.x1 + seg.x2) / 2;
  return { x1: x, y1: seg.y1, x2: x, y2: seg.y2 };
}

export function traceWallsFromRgba(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  opts: TraceWallsOptions = {}
): TraceWallsResult {
  const short = Math.min(width, height);
  const thinScan = short < 700;
  const lumCut = opts.lumCut ?? (thinScan ? 170 : DEFAULTS.lumCut);
  const satCut = opts.satCut ?? DEFAULTS.satCut;
  const minThick = opts.minThick ?? (thinScan ? 1 : DEFAULTS.minThick);
  const maxThick = opts.maxThick ?? DEFAULTS.maxThick;
  const openRadius = opts.openRadius ?? (thinScan ? 0 : DEFAULTS.openRadius);
  const closeRadius = opts.closeRadius ?? (thinScan ? 0 : DEFAULTS.closeRadius);
  const minBlobArea = opts.minBlobArea ?? DEFAULTS.minBlobArea;
  const joinGap = opts.joinGap ?? DEFAULTS.joinGap;
  const buildingDilate =
    opts.buildingDilate ??
    (thinScan
      ? Math.min(22, Math.max(8, Math.round(short / 22)))
      : Math.max(8, Math.round(short / 80)));
  const minLength =
    opts.minLength ?? Math.max(thinScan ? 16 : 28, Math.round(short * 0.032));

  const raw = inkFromRgba(data, width, height, lumCut, satCut);
  const inkPixels = countInk(raw);
  const opened = openRadius > 0 ? morphOpen(raw, width, height, openRadius) : raw;
  const closed = closeRadius > 0 ? morphClose(opened, width, height, closeRadius) : opened;
  const cleaned = dropSmallComponents(closed, width, height, minBlobArea);
  const blob = largestComponent(boxDilate(cleaned, width, height, buildingDilate), width, height);
  const inBuilding = maskAnd(cleaned, blob);
  const keptPixels = countInk(inBuilding);

  const rawSegs = extractAxisSegments(inBuilding, width, height, minLength, minThick, maxThick);
  const snapped = rawSegs.map(snapAxis);
  const merged = mergeCollinearSegments(snapped, joinGap);
  const connected = keepConnectedSegments(merged, Math.max(joinGap, 10), minLength);
  const polylines = chainIntoPolylines(connected, 6);

  return {
    segments: connected,
    polylines,
    width,
    height,
    inkPixels,
    keptPixels,
  };
}

/** Downsample RGBA into a working buffer. Nearest-neighbour is enough for ink. */
export function downsampleRgba(
  data: Uint8ClampedArray | Uint8Array,
  srcW: number,
  srcH: number,
  maxLongest: number
): { data: Uint8Array; width: number; height: number; scale: number } {
  const longest = Math.max(srcW, srcH);
  const scale = longest > maxLongest ? maxLongest / longest : 1;
  if (scale === 1) {
    return { data: data instanceof Uint8Array ? data : new Uint8Array(data), width: srcW, height: srcH, scale: 1 };
  }
  const width = Math.max(1, Math.round(srcW * scale));
  const height = Math.max(1, Math.round(srcH * scale));
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(srcH - 1, Math.floor(y / scale));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(srcW - 1, Math.floor(x / scale));
      const si = (sy * srcW + sx) * 4;
      const di = (y * width + x) * 4;
      out[di] = data[si];
      out[di + 1] = data[si + 1];
      out[di + 2] = data[si + 2];
      out[di + 3] = data[si + 3];
    }
  }
  return { data: out, width, height, scale };
}
