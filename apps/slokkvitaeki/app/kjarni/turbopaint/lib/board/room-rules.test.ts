import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyRoomAppearance,
  createHoleRoom,
  DEFAULT_ROOM_SETTINGS,
  holeTotals,
  nextRoomName,
  normalizeRoomSettings,
  punchRoom,
  roomFillForHoles,
  roomHoles,
} from "./room-rules";
import type { RectObject } from "./types";

function room(partial: Partial<RectObject> = {}): RectObject {
  return {
    id: "r1",
    type: "rect",
    x: 0,
    y: 0,
    width: 80,
    height: 60,
    fill: "#000",
    stroke: "#111",
    strokeWidth: 2,
    cornerRadius: 0,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    name: "Rými 1",
    isRoom: true,
    holesTotal: 4,
    holesLeft: 4,
    ...partial,
  };
}

test("zero holes left uses the done (green) color", () => {
  assert.equal(roomFillForHoles(DEFAULT_ROOM_SETTINGS, 0), DEFAULT_ROOM_SETTINGS.doneColor);
});

test("few holes left matches the ≤2 rule", () => {
  assert.equal(roomFillForHoles(DEFAULT_ROOM_SETTINGS, 2), "#f59e0baa");
  assert.equal(roomFillForHoles(DEFAULT_ROOM_SETTINGS, 1), "#f59e0baa");
});

test("many holes left matches the high rule", () => {
  assert.equal(roomFillForHoles(DEFAULT_ROOM_SETTINGS, 4), "#ef4444aa");
});

test("punchRoom decrements until zero and then stays done", () => {
  const settings = DEFAULT_ROOM_SETTINGS;
  let r = room({ holesTotal: 2, holesLeft: 2 });
  r = punchRoom(r, settings);
  assert.equal(r.holesLeft, 1);
  assert.equal(r.fill, "#f59e0baa");
  r = punchRoom(r, settings);
  assert.equal(r.holesLeft, 0);
  assert.equal(r.fill, settings.doneColor);
  r = punchRoom(r, settings);
  assert.equal(r.holesLeft, 0);
  assert.equal(r.fill, settings.doneColor);
});

test("holesLeft never exceeds holesTotal", () => {
  const h = roomHoles({ holesTotal: 3, holesLeft: 99 });
  assert.equal(h.total, 3);
  assert.equal(h.left, 3);
});

test("nextRoomName skips taken numbers", () => {
  const name = nextRoomName([
    room({ id: "a", name: "Rými 1" }),
    room({ id: "b", name: "Rými 2" }),
  ]);
  assert.equal(name, "Rými 3");
});

test("holeTotals sums remaining and done rooms", () => {
  const t = holeTotals([
    room({ holesTotal: 4, holesLeft: 2 }),
    room({ id: "r2", holesTotal: 3, holesLeft: 0 }),
  ]);
  assert.equal(t.count, 2);
  assert.equal(t.left, 2);
  assert.equal(t.total, 7);
  assert.equal(t.done, 1);
});

test("custom rules from settings win over defaults", () => {
  const settings = normalizeRoomSettings({
    doneColor: "#00ff00aa",
    rules: [{ id: "x", maxLeft: 5, color: "#0000ffaa", label: "Blátt" }],
  });
  assert.equal(roomFillForHoles(settings, 3), "#0000ffaa");
  assert.equal(roomFillForHoles(settings, 0), "#00ff00aa");
});

test("createHoleRoom names the next free room and uses default holes", () => {
  const created = createHoleRoom(
    { x: 0, y: 0, width: 40, height: 30 },
    [room({ id: "a", name: "Rými 1" })],
    DEFAULT_ROOM_SETTINGS,
    { id: "new", parentId: "plan" }
  );
  assert.equal(created.name, "Rými 2");
  assert.equal(created.holesTotal, DEFAULT_ROOM_SETTINGS.defaultHolesTotal);
  assert.equal(created.holesLeft, DEFAULT_ROOM_SETTINGS.defaultHolesTotal);
  assert.equal(created.parentId, "plan");
  assert.equal(created.isRoom, true);
});

test("applyRoomAppearance stamps fill from current holes", () => {
  const painted = applyRoomAppearance(room({ holesTotal: 4, holesLeft: 0 }), DEFAULT_ROOM_SETTINGS);
  assert.equal(painted.fill, DEFAULT_ROOM_SETTINGS.doneColor);
  assert.equal(painted.stroke, "#166534");
});
