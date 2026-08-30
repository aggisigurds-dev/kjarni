import assert from "node:assert/strict";
import { test } from "node:test";
import type { BoardObject, LineObject } from "./types";
import {
  CROSSING_FIRE_NAME,
  CROSSING_NAME,
  findCrossings,
  isPipingStroke,
  isRatedFirewallWall,
  isWallStroke,
  replaceCrossingMarks,
  segmentIntersection,
  worldSegments,
} from "./crossings";

function line(
  id: string,
  points: number[],
  extra: Partial<LineObject> = {}
): LineObject {
  return {
    id,
    type: extra.type ?? "polyline",
    x: extra.x ?? 0,
    y: extra.y ?? 0,
    points,
    stroke: extra.stroke ?? "#111",
    strokeWidth: extra.strokeWidth ?? 4,
    dash: extra.dash ?? "solid",
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    name: extra.name ?? "Veggir",
    layerId: extra.layerId,
    parentId: extra.parentId,
  };
}

test("segmentIntersection finds a proper crossing and rejects miss / parallel", () => {
  const hit = segmentIntersection(
    { ax: 0, ay: 0, bx: 10, by: 10 },
    { ax: 0, ay: 10, bx: 10, by: 0 }
  );
  assert.ok(hit);
  assert.ok(Math.abs(hit.x - 5) < 1e-9);
  assert.ok(Math.abs(hit.y - 5) < 1e-9);

  assert.equal(
    segmentIntersection({ ax: 0, ay: 0, bx: 4, by: 0 }, { ax: 0, ay: 2, bx: 4, by: 2 }),
    null
  );
  assert.equal(
    segmentIntersection({ ax: 0, ay: 0, bx: 2, by: 0 }, { ax: 3, ay: -1, bx: 3, by: 1 }),
    null
  );
});

test("segmentIntersection counts a pipe that ends on the wall", () => {
  const hit = segmentIntersection(
    { ax: 0, ay: 5, bx: 10, by: 5 },
    { ax: 10, ay: 0, bx: 10, by: 10 }
  );
  assert.ok(hit);
  assert.ok(Math.abs(hit.x - 10) < 1e-6);
  assert.ok(Math.abs(hit.y - 5) < 1e-6);
});

test("worldSegments applies object x/y offset", () => {
  const segs = worldSegments({ x: 100, y: 50, points: [0, 0, 20, 0] });
  assert.equal(segs.length, 1);
  assert.deepEqual(segs[0], { ax: 100, ay: 50, bx: 120, by: 50 });
});

test("isWallStroke matches veggir, traced veggur, and E-30/E-60 strokes", () => {
  assert.equal(isWallStroke(line("w1", [0, 0, 10, 0], { name: "Veggir" })), true);
  assert.equal(isWallStroke(line("w2", [0, 0, 10, 0], { name: "Veggur" })), true);
  assert.equal(isWallStroke(line("w3", [0, 0, 10, 0], { name: "EI-veggur" })), true);
  assert.equal(isWallStroke(line("w4", [0, 0, 10, 0], { name: "Eldveggur EI-60" })), true);
  assert.equal(isWallStroke(line("w5", [0, 0, 10, 0], { name: "Penni", type: "pen" })), false);
  assert.equal(isRatedFirewallWall(line("w6", [0, 0, 10, 0], { name: "Eldveggur EI-30" })), true);
  assert.equal(isRatedFirewallWall(line("w7", [0, 0, 10, 0], { name: "Veggir" })), false);
});

test("isPipingStroke only accepts line/polyline/pen on plumbing layers", () => {
  assert.equal(isPipingStroke(line("p1", [0, 0, 8, 0], { type: "pen", layerId: "kalt" })), true);
  assert.equal(isPipingStroke(line("p2", [0, 0, 8, 0], { type: "line", layerId: "heitt" })), true);
  assert.equal(isPipingStroke(line("p3", [0, 0, 8, 0], { type: "pen", layerId: "almennt" })), false);
  assert.equal(isPipingStroke(line("p4", [0, 0, 8, 0], { name: "Veggir", layerId: "kalt" })), true);
});

test("findCrossings marks a cold pipe through a wall and a hot pipe through EI-60", () => {
  const wall = line("wall", [0, 50, 100, 50], { name: "Veggir" });
  const fire = line("fw", [0, 80, 100, 80], { name: "Eldveggur EI-60" });
  const cold = line("cold", [40, 0, 40, 120], { type: "pen", layerId: "kalt", stroke: "#2563eb" });
  const hits = findCrossings([wall, fire, cold]);
  assert.equal(hits.length, 2);
  const plain = hits.find((h) => !h.fireStop);
  const rated = hits.find((h) => h.fireStop);
  assert.ok(plain);
  assert.ok(rated);
  assert.ok(Math.abs(plain.y - 50) < 1e-6);
  assert.ok(Math.abs(rated.y - 80) < 1e-6);
  assert.equal(plain.layerId, "kalt");
  assert.equal(rated.wallId, "fw");
});

test("replaceCrossingMarks rebuilds gegnumtök and drops stale ones", () => {
  let n = 0;
  const idFn = () => `m${++n}`;
  const wall = line("wall", [0, 10, 80, 10], { name: "Veggir" });
  const pipe = line("pipe", [20, 0, 20, 40], { type: "pen", layerId: "skolp", stroke: "#78716c" });
  const stale: BoardObject = {
    id: "old",
    type: "ellipse",
    x: 1,
    y: 1,
    width: 10,
    height: 10,
    fill: "#000",
    stroke: "#fff",
    strokeWidth: 1,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    name: CROSSING_NAME,
  };
  const next = replaceCrossingMarks([wall, pipe, stale], idFn);
  assert.equal(next.filter((o) => o.id === "old").length, 0);
  const marks = next.filter((o) => o.name === CROSSING_NAME);
  assert.equal(marks.length, 1);
  assert.equal(marks[0].layerId, "skolp");
  assert.ok(Math.abs(marks[0].x + marks[0].width / 2 - 20) < 0.5);
  assert.ok(Math.abs(marks[0].y + marks[0].height / 2 - 10) < 0.5);
});

test("fire-stop crossings get the brunahólf mark name", () => {
  const fire = line("fw", [0, 0, 0, 40], { name: "EI-veggur" });
  const hot = line("hot", [-20, 20, 20, 20], { type: "line", layerId: "heitt", stroke: "#dc2626" });
  const next = replaceCrossingMarks([fire, hot], () => "x1");
  const mark = next.find((o) => o.id === "x1");
  assert.equal(mark?.name, CROSSING_FIRE_NAME);
  assert.equal(mark && "width" in mark ? mark.width : 0, 22);
});
