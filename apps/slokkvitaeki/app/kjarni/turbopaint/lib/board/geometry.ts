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

export function formatLength(px: number, pixelsPerMeter: number | null) {
  if (pixelsPerMeter && pixelsPerMeter > 0) {
    const meters = px / pixelsPerMeter;
    if (meters >= 10) return `${meters.toFixed(1)} m`;
    if (meters >= 1) return `${meters.toFixed(2)} m`;
    return `${Math.round(meters * 100)} cm`;
  }
  return `${Math.round(px)} px`;
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
