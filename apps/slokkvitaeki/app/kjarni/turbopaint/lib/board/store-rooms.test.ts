import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_ROOM_NAME } from "./rooms";
import { useBoardStore } from "./store";
import type { BoardObject, RectObject } from "./types";

function emptyBoard() {
  useBoardStore.getState().replaceBoard({
    name: "próf",
    objects: [],
    camera: { x: 0, y: 0, scale: 1 },
    pixelsPerMeter: null,
    grid: true,
    snap: true,
  });
}

function roomBox(id: string, extra: Partial<RectObject> = {}): RectObject {
  return {
    id,
    type: "rect",
    x: 0,
    y: 0,
    width: 40,
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

test("room draft groups boxes, commit selects them, cancel deletes them", () => {
  emptyBoard();
  useBoardStore.getState().startRoomDraft();
  const gid = useBoardStore.getState().roomDraftGroupId;
  assert.ok(gid);
  assert.equal(useBoardStore.getState().tool, "room");
  useBoardStore.getState().addObjects(
    [roomBox("a", { groupId: gid }), roomBox("b", { groupId: gid, x: 50 })],
    false
  );
  useBoardStore.getState().commitRoomDraft();
  assert.equal(useBoardStore.getState().tool, "select");
  assert.equal(useBoardStore.getState().roomDraftGroupId, null);
  assert.deepEqual(useBoardStore.getState().selectedIds, ["a", "b"]);

  emptyBoard();
  useBoardStore.getState().startRoomDraft();
  const gid2 = useBoardStore.getState().roomDraftGroupId!;
  useBoardStore.getState().addObjects([roomBox("c", { groupId: gid2 })], false);
  useBoardStore.getState().cancelRoomDraft();
  assert.equal(useBoardStore.getState().objects.length, 0);
  assert.equal(useBoardStore.getState().tool, "select");
});

test("rename and restyle apply to the whole irregular room", () => {
  emptyBoard();
  const objects: BoardObject[] = [
    roomBox("a", { groupId: "g1" }),
    roomBox("b", { groupId: "g1", x: 40 }),
  ];
  useBoardStore.getState().replaceBoard({
    name: "próf",
    objects,
    camera: { x: 0, y: 0, scale: 1 },
    pixelsPerMeter: null,
    grid: true,
    snap: true,
  });
  useBoardStore.getState().renameRoom("g1", "Stofa");
  useBoardStore.getState().applyRoomAppearance("g1", { color: "#2563eb", opacity: 0.3 });
  useBoardStore.getState().setRoomCounted("g1", false);
  for (const obj of useBoardStore.getState().objects) {
    if (obj.type !== "rect") continue;
    assert.equal(obj.name, "Stofa");
    assert.equal(obj.stroke, "#2563EB");
    assert.equal(obj.roomOpacity, 0.3);
    assert.equal(obj.roomCounted, false);
  }
});

test("setRoomGataCount patches every box in the irregular room", () => {
  emptyBoard();
  useBoardStore.getState().replaceBoard({
    name: "próf",
    objects: [roomBox("a", { groupId: "g1" }), roomBox("b", { groupId: "g1", x: 40 })],
    camera: { x: 0, y: 0, scale: 1 },
    pixelsPerMeter: null,
    grid: true,
    snap: true,
  });
  useBoardStore.getState().setRoomGataCount("g1", 4);
  for (const obj of useBoardStore.getState().objects) {
    if (obj.type !== "rect") continue;
    assert.equal(obj.roomGataCount, 4);
  }
  useBoardStore.getState().setRoomGataCount("g1", -2);
  for (const obj of useBoardStore.getState().objects) {
    if (obj.type !== "rect") continue;
    assert.equal(obj.roomGataCount, 0);
  }
});
