import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_ROOM_SETTINGS, isHoleRoom } from "./room-rules";
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
    roomSettings: DEFAULT_ROOM_SETTINGS,
  });
}

function room(partial: Partial<RectObject> = {}): RectObject {
  return {
    id: "r1",
    type: "rect",
    x: 10,
    y: 10,
    width: 80,
    height: 60,
    fill: "#ef4444aa",
    stroke: "#14532d",
    strokeWidth: 3,
    cornerRadius: 2,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    name: "Rými 1",
    isRoom: true,
    holesTotal: 3,
    holesLeft: 3,
    ...partial,
  };
}

test("punchHole decrements until the room turns green", () => {
  emptyBoard();
  useBoardStore.getState().addObjects([room()], false);
  useBoardStore.getState().punchHole("r1");
  let r = useBoardStore.getState().objects.find((o) => o.id === "r1");
  assert.ok(r && isHoleRoom(r));
  assert.equal(r.holesLeft, 2);
  useBoardStore.getState().punchHole("r1");
  useBoardStore.getState().punchHole("r1");
  r = useBoardStore.getState().objects.find((o) => o.id === "r1");
  assert.ok(r && isHoleRoom(r));
  assert.equal(r.holesLeft, 0);
  assert.equal(r.fill, DEFAULT_ROOM_SETTINGS.doneColor);
  useBoardStore.getState().punchHole("r1");
  r = useBoardStore.getState().objects.find((o) => o.id === "r1");
  assert.ok(r && isHoleRoom(r));
  assert.equal(r.holesLeft, 0);
});

test("setRoomHoles names a room and clamps leftover to the total", () => {
  emptyBoard();
  useBoardStore.getState().addObjects([room()], false);
  useBoardStore.getState().setRoomHoles("r1", { name: "Eldhús", holesTotal: 2, holesLeft: 9 });
  const r = useBoardStore.getState().objects.find((o) => o.id === "r1");
  assert.ok(r && isHoleRoom(r));
  assert.equal(r.name, "Eldhús");
  assert.equal(r.holesTotal, 2);
  assert.equal(r.holesLeft, 2);
});

test("setRoomSettings recolours every hole room", () => {
  emptyBoard();
  useBoardStore.getState().addObjects([room({ holesLeft: 0 })], false);
  useBoardStore.getState().setRoomSettings({
    ...DEFAULT_ROOM_SETTINGS,
    doneColor: "#00ff00aa",
  });
  const r = useBoardStore.getState().objects.find((o) => o.id === "r1");
  assert.ok(r && r.type === "rect");
  assert.equal(r.fill, "#00ff00aa");
});

test("renaming a m² room does not start hole tracking", () => {
  emptyBoard();
  useBoardStore.getState().addObjects(
    [
      {
        id: "area",
        type: "rect",
        x: 0,
        y: 0,
        width: 40,
        height: 40,
        fill: "#16a34a33",
        stroke: "#16a34a",
        strokeWidth: 2,
        cornerRadius: 0,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        name: "Rými",
        isRoom: true,
      },
    ],
    false
  );
  useBoardStore.getState().setRoomHoles("area", { name: "Eldhús" });
  const r = useBoardStore.getState().objects.find((o) => o.id === "area");
  assert.ok(r && r.type === "rect");
  assert.equal(r.name, "Eldhús");
  assert.equal(r.fill, "#16a34a33");
  assert.equal(r.holesTotal, undefined);
});

test("m² rooms without holes stay unpainted when settings change", () => {
  emptyBoard();
  const area: BoardObject = {
    id: "area",
    type: "rect",
    x: 0,
    y: 0,
    width: 40,
    height: 40,
    fill: "#16a34a33",
    stroke: "#16a34a",
    strokeWidth: 2,
    cornerRadius: 0,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    name: "Rými",
    isRoom: true,
  };
  useBoardStore.getState().addObjects([area], false);
  useBoardStore.getState().setRoomSettings({
    ...DEFAULT_ROOM_SETTINGS,
    doneColor: "#00ff00aa",
  });
  const r = useBoardStore.getState().objects.find((o) => o.id === "area");
  assert.ok(r && r.type === "rect");
  assert.equal(r.fill, "#16a34a33");
  assert.equal(r.holesTotal, undefined);
});
