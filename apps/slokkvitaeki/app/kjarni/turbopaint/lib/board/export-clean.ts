import type { BoardDocument, BoardObject, ImageObject, LineObject } from "./types";

const CLEAN_WALL_PREFIX = "Veggur";

export function isCleanWallObject(obj: BoardObject): obj is LineObject {
  return obj.type === "polyline" && obj.name.startsWith(CLEAN_WALL_PREFIX);
}

function isSourcePlan(obj: BoardObject): obj is ImageObject {
  return obj.type === "image";
}

/** Drop the embedded raster so a company profile stays tens of KB, not MB. */
export function objectsWithoutSourceImages(objects: BoardObject[]): BoardObject[] {
  return objects.filter((o) => !isSourcePlan(o));
}

export function hideSourceShowWalls(objects: BoardObject[], planId?: string): BoardObject[] {
  return objects.map((o) => {
    if (isSourcePlan(o) && (!planId || o.id === planId)) return { ...o, hidden: true };
    if (isCleanWallObject(o) && (!planId || o.parentId === planId)) return { ...o, hidden: false };
    return o;
  });
}

export function serializeCleanPlanJson(doc: BoardDocument, objects: BoardObject[]): string {
  const clean = objectsWithoutSourceImages(objects);
  const payload = {
    version: doc.version ?? 2,
    name: doc.name,
    objects: clean,
    camera: doc.camera,
    pixelsPerMeter: doc.pixelsPerMeter,
    grid: doc.grid,
    snap: doc.snap,
    assetIds: [] as string[],
    cleanPlan: true,
    exportedAt: new Date().toISOString(),
  };
  return JSON.stringify(payload);
}

function boundsOf(objects: BoardObject[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const consider = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const o of objects) {
    if (o.hidden) continue;
    if (o.type === "polyline" || o.type === "line" || o.type === "pen" || o.type === "arrow") {
      for (let i = 0; i < o.points.length; i += 2) consider(o.x + o.points[i], o.y + o.points[i + 1]);
    } else if ("width" in o && "height" in o) {
      consider(o.x, o.y);
      consider(o.x + o.width, o.y + o.height);
    } else {
      consider(o.x, o.y);
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, width: 100, height: 100 };
  const pad = 12;
  return {
    minX: minX - pad,
    minY: minY - pad,
    width: Math.max(1, maxX - minX + pad * 2),
    height: Math.max(1, maxY - minY + pad * 2),
  };
}

function fmt(n: number) {
  return (Math.round(n * 10) / 10).toString();
}

export function serializeCleanPlanSvg(objects: BoardObject[]): string {
  const walls = objects.filter(isCleanWallObject);
  const drawable = walls.length ? walls : objectsWithoutSourceImages(objects);
  const b = boundsOf(drawable);
  const parts: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${fmt(b.minX)} ${fmt(b.minY)} ${fmt(b.width)} ${fmt(b.height)}" fill="none">`,
  ];
  for (const o of drawable) {
    if (o.hidden) continue;
    if (o.type === "polyline" || o.type === "line" || o.type === "pen") {
      const pts: string[] = [];
      for (let i = 0; i < o.points.length; i += 2) {
        pts.push(`${fmt(o.x + o.points[i])},${fmt(o.y + o.points[i + 1])}`);
      }
      const sw = (o as LineObject).strokeWidth || 2;
      const stroke = (o as LineObject).stroke || "#1c1917";
      parts.push(
        `<polyline points="${pts.join(" ")}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="square" stroke-linejoin="miter"/>`
      );
    }
  }
  parts.push(`</svg>`);
  return parts.join("");
}
