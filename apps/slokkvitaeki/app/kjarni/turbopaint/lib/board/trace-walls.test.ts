import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chainIntoPolylines,
  inkFromRgba,
  mergeCollinearSegments,
  morphOpen,
  traceWallsFromRgba,
  type WallSegment,
} from "./trace-walls";
import {
  objectsWithoutSourceImages,
  serializeCleanPlanJson,
  serializeCleanPlanSvg,
} from "./export-clean";
import type { BoardDocument, BoardObject } from "./types";

function rgba(w: number, h: number, fill = 255): Uint8Array {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = fill;
    data[i * 4 + 1] = fill;
    data[i * 4 + 2] = fill;
    data[i * 4 + 3] = 255;
  }
  return data;
}

function inkRect(data: Uint8Array, w: number, x0: number, y0: number, x1: number, y1: number) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * w + x) * 4;
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
    }
  }
}

function strokeRect(data: Uint8Array, w: number, x0: number, y0: number, x1: number, y1: number, thick: number) {
  inkRect(data, w, x0, y0, x1, y0 + thick - 1);
  inkRect(data, w, x0, y1 - thick + 1, x1, y1);
  inkRect(data, w, x0, y0, x0 + thick - 1, y1);
  inkRect(data, w, x1 - thick + 1, y0, x1, y1);
}

function coverage(segs: WallSegment[], x: number, y: number, tol = 3) {
  return segs.some((s) => {
    const h = Math.abs(s.y2 - s.y1) <= Math.abs(s.x2 - s.x1);
    if (h) {
      const xa = Math.min(s.x1, s.x2);
      const xb = Math.max(s.x1, s.x2);
      return Math.abs(s.y1 - y) <= tol && x >= xa - tol && x <= xb + tol;
    }
    const ya = Math.min(s.y1, s.y2);
    const yb = Math.max(s.y1, s.y2);
    return Math.abs(s.x1 - x) <= tol && y >= ya - tol && y <= yb + tol;
  });
}

test("inkFromRgba keeps dark gray and drops yellow paper", () => {
  const data = rgba(2, 1, 255);
  data[0] = 20;
  data[1] = 20;
  data[2] = 20;
  data[4] = 240;
  data[5] = 220;
  data[6] = 160;
  const mask = inkFromRgba(data, 2, 1);
  assert.equal(mask[0], 1);
  assert.equal(mask[1], 0);
});

test("opening drops 1 px dimension lines and keeps 4 px walls", () => {
  const w = 40;
  const h = 20;
  const data = rgba(w, h);
  inkRect(data, w, 2, 10, 37, 13);
  inkRect(data, w, 2, 2, 37, 2);
  const mask = inkFromRgba(data, w, h);
  const opened = morphOpen(mask, w, h, 1);
  let thin = 0;
  let thick = 0;
  for (let x = 2; x <= 37; x++) {
    thin += opened[2 * w + x];
    thick += opened[11 * w + x];
  }
  assert.equal(thin, 0);
  assert.ok(thick > 20);
});

test("trace keeps a box of thick walls and ignores furniture + dimension ticks", () => {
  const w = 160;
  const h = 100;
  const data = rgba(w, h);
  strokeRect(data, w, 12, 12, 147, 87, 4);
  inkRect(data, w, 78, 12, 81, 87);
  inkRect(data, w, 12, 3, 147, 3);
  inkRect(data, w, 40, 40, 48, 48);

  const res = traceWallsFromRgba(data, w, h, { minLength: 24, minThick: 2, maxThick: 10 });
  assert.ok(res.segments.length >= 4, `expected ≥4 walls, got ${res.segments.length}`);
  assert.ok(res.segments.length <= 12, `over-captured clutter: ${res.segments.length} segments`);

  assert.equal(coverage(res.segments, 80, 12), true, "missing top wall");
  assert.equal(coverage(res.segments, 80, 87), true, "missing bottom wall");
  assert.equal(coverage(res.segments, 12, 50), true, "missing left wall");
  assert.equal(coverage(res.segments, 147, 50), true, "missing right wall");
  assert.equal(coverage(res.segments, 80, 50), true, "missing interior partition");

  assert.equal(coverage(res.segments, 80, 3, 1), false, "kept a dimension line");
  assert.ok(res.polylines.length >= 1);
  assert.ok(res.keptPixels < res.inkPixels);
});

test("1 px building envelope is kept while outer dimension strings are dropped", () => {
  const w = 160;
  const h = 100;
  const data = rgba(w, h);
  strokeRect(data, w, 24, 22, 135, 82, 1);
  inkRect(data, w, 24, 4, 135, 4);
  inkRect(data, w, 4, 22, 4, 82);
  const res = traceWallsFromRgba(data, w, h);
  assert.equal(coverage(res.segments, 80, 22, 3), true, "missing 1px top wall");
  assert.equal(coverage(res.segments, 24, 50, 3), true, "missing 1px left wall");
  assert.equal(coverage(res.segments, 80, 4, 1), false, "kept outer dimension");
  assert.equal(coverage(res.segments, 4, 50, 1), false, "kept outer vertical dimension");
});

test("mergeCollinear joins a wall split by a 4 px crack but not a doorway", () => {
  const a: WallSegment = { x1: 10, y1: 20, x2: 40, y2: 20 };
  const crack: WallSegment = { x1: 44, y1: 20, x2: 90, y2: 20 };
  const door: WallSegment = { x1: 130, y1: 20, x2: 180, y2: 20 };
  const merged = mergeCollinearSegments([a, crack, door], 8);
  assert.equal(merged.length, 2);
  assert.ok(merged[0].x2 - merged[0].x1 > 70);
});

test("chainIntoPolylines turns an L into one polyline", () => {
  const segs: WallSegment[] = [
    { x1: 0, y1: 0, x2: 40, y2: 0 },
    { x1: 40, y1: 0, x2: 40, y2: 30 },
  ];
  const lines = chainIntoPolylines(segs, 4);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].length, 6);
});

test("clean JSON export drops the raster and stays tiny", () => {
  const walls: BoardObject[] = [
    {
      id: "w1",
      type: "polyline",
      x: 0,
      y: 0,
      points: [0, 0, 400, 0, 400, 200, 0, 200, 0, 0],
      stroke: "#1c1917",
      strokeWidth: 3,
      dash: "solid",
      rotation: 0,
      opacity: 1,
      locked: false,
      hidden: false,
      name: "Veggur",
    },
  ];
  const image: BoardObject = {
    id: "img",
    type: "image",
    assetId: "asset-big",
    x: 0,
    y: 0,
    width: 4000,
    height: 2800,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    name: "Teikning",
  };
  const doc: BoardDocument = {
    version: 2,
    name: "Prufuhús",
    objects: [image, ...walls],
    camera: { x: 0, y: 0, scale: 1 },
    pixelsPerMeter: 40,
    grid: true,
    snap: true,
    assetIds: ["asset-big"],
  };
  const json = serializeCleanPlanJson(doc, [image, ...walls]);
  const parsed = JSON.parse(json) as { objects: BoardObject[]; assetIds: string[]; cleanPlan: boolean };
  assert.equal(parsed.cleanPlan, true);
  assert.equal(parsed.assetIds.length, 0);
  assert.equal(parsed.objects.length, 1);
  assert.ok(json.length < 2000);
  assert.equal(objectsWithoutSourceImages([image, ...walls]).length, 1);
  const svg = serializeCleanPlanSvg([image, ...walls]);
  assert.match(svg, /<polyline /);
  assert.doesNotMatch(svg, /image/i);
});
