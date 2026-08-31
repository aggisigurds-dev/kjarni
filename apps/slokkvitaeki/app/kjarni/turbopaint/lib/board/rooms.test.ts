import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_ROOM_NAME,
  fillAlpha,
  listRooms,
  primaryRoomBoxId,
  renameRoomObjects,
  roomAreaPx,
  roomCounterIndex,
  roomOfSelection,
  setRoomCounted,
  setRoomExcluded,
  solidHex,
  styleRoomObjects,
} from "./rooms";
import type { BoardObject, RectObject } from "./types";

function box(id: string, extra: Partial<RectObject> = {}): RectObject {
  return {
    id,
    type: "rect",
    x: 0,
    y: 0,
    width: 10,
    height: 20,
    fill: "#FE653F38",
    stroke: "#FE653F",
    strokeWidth: 2,
    cornerRadius: 0,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    name: DEFAULT_ROOM_NAME,
    isRoom: true,
    ...extra,
  };
}

test("several boxes with the same group become one named room", () => {
  const objects: BoardObject[] = [
    box("a", { groupId: "g1", name: "Eldhús", width: 10, height: 10 }),
    box("b", { groupId: "g1", name: "Eldhús", width: 5, height: 4 }),
    box("c", { name: "Bað" }),
  ];
  const rooms = listRooms(objects);
  assert.equal(rooms.length, 2);
  const kitchen = rooms.find((r) => r.key === "g1");
  assert.deepEqual(kitchen?.ids, ["a", "b"]);
  assert.equal(kitchen?.name, "Eldhús");
  assert.equal(roomAreaPx(objects, kitchen!.ids), 10 * 10 + 5 * 4);
  assert.equal(roomOfSelection(objects, ["b"])?.name, "Eldhús");
  assert.equal(primaryRoomBoxId(objects, kitchen!.ids), "a");
});

test("rename and exclude apply to every box in the room", () => {
  const objects: BoardObject[] = [box("a", { groupId: "g1" }), box("b", { groupId: "g1" })];
  const named = renameRoomObjects(objects, "g1", "  Stofa  ");
  assert.equal(
    named.filter((o) => o.type === "rect").every((o) => o.name === "Stofa"),
    true
  );
  const skipped = setRoomExcluded(named, "g1", true);
  assert.equal(
    skipped.filter((o) => o.type === "rect").every((o) => o.type === "rect" && o.roomExcluded),
    true
  );
});

test("color and opacity restyle every box without fading the stroke", () => {
  const objects: BoardObject[] = [box("a", { groupId: "g1" }), box("b", { groupId: "g1" })];
  const next = styleRoomObjects(objects, "g1", { color: "#16a34a", opacity: 0.4 });
  for (const obj of next) {
    if (obj.type !== "rect") continue;
    assert.equal(obj.stroke, "#16A34A");
    assert.equal(obj.fill, fillAlpha("#16a34a", 0.4));
    assert.equal(obj.roomOpacity, 0.4);
  }
  assert.equal(solidHex("#16a34a33"), "#16A34A");
});

test("uncounted rooms drop out of the magntafla numbering", () => {
  const objects: BoardObject[] = [
    box("a", { groupId: "g1", name: "Eldhús" }),
    box("b", { name: "Bað" }),
  ];
  assert.equal(roomCounterIndex(objects, "g1"), 1);
  assert.equal(roomCounterIndex(objects, "b"), 2);
  const next = setRoomCounted(objects, "g1", false);
  assert.equal(roomCounterIndex(next, "g1"), null);
  assert.equal(roomCounterIndex(next, "b"), 1);
  assert.equal(listRooms(next).find((r) => r.key === "g1")?.counted, false);
});
