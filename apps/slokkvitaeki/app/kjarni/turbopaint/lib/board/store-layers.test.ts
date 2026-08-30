import assert from "node:assert/strict";
import { test } from "node:test";
import { LAYER_ALMENNT, LAYER_TEIKNING } from "./layers";
import { useBoardStore } from "./store";
import type { BoardObject } from "./types";

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

function pen(id: string, extra: Partial<BoardObject> = {}): BoardObject {
  return {
    id,
    type: "pen",
    x: 0,
    y: 0,
    points: [0, 0, 8, 8],
    stroke: "#111",
    strokeWidth: 2,
    dash: "solid",
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    name: "Penni",
    ...extra,
  };
}

test("addObjects stamps the active piping layer onto new strokes", () => {
  emptyBoard();
  useBoardStore.getState().setActiveLayer("heitt");
  useBoardStore.getState().addObjects([pen("p1")], false);
  const obj = useBoardStore.getState().objects.find((o) => o.id === "p1");
  assert.equal(obj?.layerId, "heitt");
  assert.equal(useBoardStore.getState().style.stroke, "#dc2626");
});

test("addObjects keeps floor plans on teikning even when a pipe layer is active", () => {
  emptyBoard();
  useBoardStore.getState().setActiveLayer("kalt");
  useBoardStore.getState().addObjects(
    [
      {
        id: "img1",
        type: "image",
        assetId: "a",
        x: 0,
        y: 0,
        width: 100,
        height: 80,
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
        name: "Plan",
      },
    ],
    false
  );
  assert.equal(useBoardStore.getState().objects[0].layerId, LAYER_TEIKNING);
});

test("toggleLayerVisible hides objects on that layer from selection", () => {
  emptyBoard();
  useBoardStore.getState().addObjects([pen("p1", { layerId: "skolp" })], true);
  assert.deepEqual(useBoardStore.getState().selectedIds, ["p1"]);
  useBoardStore.getState().toggleLayerVisible("skolp");
  const layer = useBoardStore.getState().layers.find((l) => l.id === "skolp");
  assert.equal(layer?.visible, false);
  assert.deepEqual(useBoardStore.getState().selectedIds, []);
});

test("replaceBoard migrates older objects onto almennt / teikning", () => {
  emptyBoard();
  useBoardStore.getState().replaceBoard({
    name: "gamalt",
    objects: [pen("old")],
    camera: { x: 0, y: 0, scale: 1 },
    pixelsPerMeter: null,
    grid: true,
    snap: true,
  });
  assert.equal(useBoardStore.getState().objects[0].layerId, LAYER_ALMENNT);
  assert.ok(useBoardStore.getState().layers.some((l) => l.id === "kalt"));
  assert.equal(useBoardStore.getState().activeLayerId, LAYER_ALMENNT);
});
