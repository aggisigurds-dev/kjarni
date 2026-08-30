import type { BoardObject, Camera, DashStyle, ImageObject } from "./types";

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function worldFromScreen(
  pointer: { x: number; y: number },
  camera: Camera
) {
  return {
    x: (pointer.x - camera.x) / camera.scale,
    y: (pointer.y - camera.y) / camera.scale,
  };
}

export function screenFromWorld(
  point: { x: number; y: number },
  camera: Camera
) {
  return {
    x: point.x * camera.scale + camera.x,
    y: point.y * camera.scale + camera.y,
  };
}

export function dashArray(style: DashStyle, width: number): number[] | undefined {
  if (style === "dashed") return [width * 4, width * 3];
  if (style === "dotted") return [width, width * 2];
  return undefined;
}

export function dist(ax: number, ay: number, bx: number, by: number) {
  return Math.hypot(bx - ax, by - ay);
}

export function lineLength(points: number[]) {
  let total = 0;
  for (let i = 2; i < points.length; i += 2) {
    total += dist(points[i - 2], points[i - 1], points[i], points[i + 1]);
  }
  return total;
}

/** Byggingamál eru í MILLIMETRUM (ósk Agnars) — 4.280 mm, ekki 4,28 m.
 * metersOverride = innslegin raun-lengd (Kvarði) sem trompar reiknaða. */
export function formatLength(
  px: number,
  pixelsPerMeter: number | null,
  metersOverride?: number | null
) {
  const meters =
    metersOverride ?? (pixelsPerMeter && pixelsPerMeter > 0 ? px / pixelsPerMeter : null);
  if (meters == null) return `${Math.round(px)} px — kvarða fyrst (K)`;
  return `${formatMm(meters)} mm`;
}

export function formatMm(meters: number) {
  return Math.round(meters * 1000)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Flatarmál í m² með íslenskri kommu, 1 aukastaf. */
export function formatM2(m2: number) {
  return `${m2.toFixed(1).replace(".", ",")} m²`;
}

export function objectBounds(obj: BoardObject): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  if (
    obj.type === "image" ||
    obj.type === "rect" ||
    obj.type === "ellipse" ||
    obj.type === "sticky"
  ) {
    return { x: obj.x, y: obj.y, width: obj.width, height: obj.height };
  }
  if (obj.type === "text") {
    return { x: obj.x, y: obj.y, width: obj.width, height: obj.fontSize * 1.4 };
  }
  if (obj.type === "symbol") {
    return { x: obj.x, y: obj.y, width: obj.size, height: obj.size + 18 };
  }
  const pts = obj.points;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    minX = Math.min(minX, obj.x + pts[i]);
    minY = Math.min(minY, obj.y + pts[i + 1]);
    maxX = Math.max(maxX, obj.x + pts[i]);
    maxY = Math.max(maxY, obj.y + pts[i + 1]);
  }
  const pad = obj.strokeWidth;
  return {
    x: minX - pad,
    y: minY - pad,
    width: Math.max(1, maxX - minX + pad * 2),
    height: Math.max(1, maxY - minY + pad * 2),
  };
}

export function boardBounds(objects: BoardObject[]) {
  const visible = objects.filter((o) => !o.hidden);
  if (visible.length === 0) {
    return { x: 0, y: 0, width: 1200, height: 800 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const obj of visible) {
    const b = objectBounds(obj);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  const pad = 80;
  return {
    x: minX - pad,
    y: minY - pad,
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2,
  };
}

export function cameraFit(
  bounds: { x: number; y: number; width: number; height: number },
  viewW: number,
  viewH: number
): Camera {
  const scale = clamp(
    Math.min(viewW / Math.max(bounds.width, 1), viewH / Math.max(bounds.height, 1)) *
      0.92,
    0.04,
    4
  );
  return {
    scale,
    x: viewW / 2 - (bounds.x + bounds.width / 2) * scale,
    y: viewH / 2 - (bounds.y + bounds.height / 2) * scale,
  };
}

export function snapValue(n: number, gap: number, enabled: boolean) {
  if (!enabled) return n;
  return Math.round(n / gap) * gap;
}

export function rectFromPoints(ax: number, ay: number, bx: number, by: number) {
  const x = Math.min(ax, bx);
  const y = Math.min(ay, by);
  return { x, y, width: Math.abs(bx - ax), height: Math.abs(by - ay) };
}

export function simplifyPoints(points: number[], minDist = 2.4) {
  if (points.length < 4) return points;
  const out = [points[0], points[1]];
  for (let i = 2; i < points.length; i += 2) {
    const lx = out[out.length - 2];
    const ly = out[out.length - 1];
    if (dist(lx, ly, points[i], points[i + 1]) >= minDist) {
      out.push(points[i], points[i + 1]);
    }
  }
  if (out.length === 2) out.push(points[points.length - 2], points[points.length - 1]);
  return out;
}

/* BEIN LÍNA FRÁ HORNI TIL HORNS (Agnar 28.08).
 *
 * `simplifyPoints` grisjar aðeins eftir FJARLÆGÐ — hún heldur hverjum punkti
 * sem er ≥ minDist frá þeim síðasta og fjarlægir því engar hlykkjur. Rakningin
 * elti þar með hverja ójöfnu í veggnum (múrsteina, málsetningar, hurðargöt) og
 * brunaveggurinn varð bugðóttur í stað þess að vera bein lína.
 *
 * Hér er gert þrennt í röð:
 *   1. Ramer–Douglas–Peucker — hendir öllu sem víkur minna en `eps` frá beinu
 *      línunni. Þar fara hlykkjurnar, hornin standa eftir.
 *   2. Ás-hnökkun — veggir í húsum eru nær alltaf lóðréttir eða láréttir, svo
 *      hluti sem hallar innan við `snapDeg` er réttur af í fullkomlega beinan.
 *      Endapunkturinn er færður áfram svo línan slitni ekki.
 *   3. Samlínu-sameining — þrír punktar á nánast beinni línu verða að tveimur.
 * Útkoman á venjulegum vegg er einn beinn hluti: tveir punktar.               */
function rdp(pts: number[], eps: number): number[] {
  const n = pts.length / 2;
  if (n < 3) return pts;
  const x0 = pts[0], y0 = pts[1];
  const x1 = pts[pts.length - 2], y1 = pts[pts.length - 1];
  let maxD = -1, idx = -1;
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  for (let i = 1; i < n - 1; i++) {
    const px = pts[i * 2], py = pts[i * 2 + 1];
    const d = Math.abs((py - y0) * dx - (px - x0) * dy) / len;
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD <= eps || idx < 0) return [x0, y0, x1, y1];
  const left = rdp(pts.slice(0, idx * 2 + 2), eps);
  const right = rdp(pts.slice(idx * 2), eps);
  return [...left.slice(0, -2), ...right];
}

export function straightenWall(points: number[], eps = 8, snapDeg = 14): number[] {
  if (points.length < 6) return points;
  const p = rdp(points, eps);

  // 2) ás-hnökkun
  const out = p.slice();
  const tol = (snapDeg * Math.PI) / 180;
  for (let i = 0; i + 3 < out.length; i += 2) {
    const ax = out[i], ay = out[i + 1];
    const bx = out[i + 2], by = out[i + 3];
    const ang = Math.atan2(by - ay, bx - ax);
    const nearH = Math.abs(Math.sin(ang)) < Math.sin(tol);
    const nearV = Math.abs(Math.cos(ang)) < Math.sin(tol);
    if (nearH) {
      const y = (ay + by) / 2;
      out[i + 1] = y; out[i + 3] = y;
    } else if (nearV) {
      const x = (ax + bx) / 2;
      out[i] = x; out[i + 2] = x;
    }
  }

  // 3) sameina samlínu-hluta
  const merged = [out[0], out[1]];
  for (let i = 2; i + 1 < out.length; i += 2) {
    const cx = out[i], cy = out[i + 1];
    if (i + 3 < out.length) {
      const px = merged[merged.length - 2], py = merged[merged.length - 1];
      const nx = out[i + 2], ny = out[i + 3];
      const a1 = Math.atan2(cy - py, cx - px);
      const a2 = Math.atan2(ny - cy, nx - cx);
      let d = Math.abs(a1 - a2);
      if (d > Math.PI) d = 2 * Math.PI - d;
      if (d < (8 * Math.PI) / 180) continue;   // beygjan er hverfandi → sleppa
    }
    merged.push(cx, cy);
  }
  return merged.length >= 4 ? merged : [out[0], out[1], out[out.length - 2], out[out.length - 1]];
}

export const GRID_GAP = 20;

/** Bilið sem grindin TEIKNAST með á núverandi zoomi — punktarnir tvöfalda
 * bilið eftir þörfum svo þeir drekki ekki skjánum. Snap verður að nota SAMA
 * bil, annars límast hlutir milli sýnilegu punktanna („festa við grind
 * virkar ekki"). */
export function effectiveGridGap(camera: Camera, width: number, height: number) {
  const cols = width / camera.scale / GRID_GAP;
  const rows = height / camera.scale / GRID_GAP;
  let gap = GRID_GAP;
  while (cols * (GRID_GAP / gap) * rows * (GRID_GAP / gap) > 9000) {
    gap *= 2;
  }
  return gap;
}

const DOCUMENT_CLUSTER_NAMES = [
  "Eldveggur",
  "Eldhurð",
  "Eldveggir",
  "165.BR1",
  "Minnispunktur",
];

function pointInRect(
  x: number,
  y: number,
  rect: { x: number; y: number; width: number; height: number }
) {
  return x >= rect.x && y >= rect.y && x <= rect.x + rect.width && y <= rect.y + rect.height;
}

/** Topmost imported page that contains this world point. */
export function imageAtPoint(objects: BoardObject[], x: number, y: number): ImageObject | undefined {
  const images = objects.filter((o): o is ImageObject => o.type === "image" && !o.hidden);
  for (let i = images.length - 1; i >= 0; i--) {
    if (pointInRect(x, y, images[i])) return images[i];
  }
  return undefined;
}

/** Markup, symbols and notes that should travel with an imported page. */
export function objectsOnDocument(image: ImageObject, objects: BoardObject[]): BoardObject[] {
  const gutter = {
    x: image.x - 12,
    y: image.y - 12,
    width: image.width + 420,
    height: image.height + 24,
  };
  return objects.filter((obj) => {
    if (obj.id === image.id || obj.type === "image") return false;
    if (obj.parentId === image.id) return true;
    const bounds = objectBounds(obj);
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    if (pointInRect(cx, cy, image) || pointInRect(obj.x, obj.y, image)) return true;
    const clustered = DOCUMENT_CLUSTER_NAMES.some((prefix) => obj.name.startsWith(prefix));
    return clustered && pointInRect(cx, cy, gutter);
  });
}

export function translateObject(obj: BoardObject, dx: number, dy: number): BoardObject {
  return { ...obj, x: obj.x + dx, y: obj.y + dy };
}
