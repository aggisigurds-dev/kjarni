import assert from "node:assert/strict";
import { test } from "node:test";
import type { BoardObject } from "./types";
import {
  DEFAULT_LAYERS,
  LAYER_ALMENNT,
  LAYER_TEIKNING,
  ensureLayers,
  isDrawnLocked,
  isDrawnVisible,
  layerStrokeForActive,
  objectLayerId,
  selectableIds,
  stampLayerId,
  withLayerId,
} from "./layers";

function stroke(partial: Partial<BoardObject> & Pick<BoardObject, "id">): BoardObject {
  return {
    type: "pen",
    x: 0,
    y: 0,
    points: [0, 0, 10, 10],
    stroke: "#111",
    strokeWidth: 2,
    dash: "solid",
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    name: "Penni",
    ...partial,
  } as BoardObject;
}

test("default layers include plumbing keys and Icelandic labels", () => {
  const byId = Object.fromEntries(DEFAULT_LAYERS.map((l) => [l.id, l]));
  assert.equal(byId.kalt.name, "Kalt vatn");
  assert.equal(byId.heitt.name, "Heitt vatn");
  assert.equal(byId.skolp.name, "Skolp / fráveita");
  assert.equal(byId["loftræsting"].name, "Loftræsting");
  assert.equal(byId.hitakerfi.name, "Hitakerfi");
  assert.equal(byId.almennt.name, "Almennt");
  assert.equal(byId.teikning.name, "Teikning");
  assert.equal(byId.kalt.color, "#2563eb");
  assert.equal(byId.heitt.color, "#dc2626");
  assert.equal(byId.skolp.color, "#78716c");
  assert.equal(byId["loftræsting"].color, "#16a34a");
});

test("ensureLayers fills missing plumbing preset and keeps visibility", () => {
  const merged = ensureLayers([
    { id: "kalt", key: "cold", name: "Kalt vatn", color: "#2563eb", visible: false, locked: true, kind: "piping" },
  ]);
  assert.equal(merged.length, DEFAULT_LAYERS.length);
  const kalt = merged.find((l) => l.id === "kalt");
  assert.equal(kalt?.visible, false);
  assert.equal(kalt?.locked, true);
  assert.ok(merged.some((l) => l.id === "heitt"));
});

test("objectLayerId falls back to teikning for images and almennt otherwise", () => {
  assert.equal(objectLayerId({ type: "image" }), LAYER_TEIKNING);
  assert.equal(objectLayerId({ type: "pen" }), LAYER_ALMENNT);
  assert.equal(objectLayerId({ type: "pen", layerId: "heitt" }), "heitt");
});

test("stampLayerId routes images to teikning and strokes to the active layer", () => {
  const image = stampLayerId({ type: "image" as const }, "heitt");
  assert.equal(image.layerId, LAYER_TEIKNING);
  const pen = stampLayerId({ type: "pen" as const }, "kalt");
  assert.equal(pen.layerId, "kalt");
  const kept = stampLayerId({ type: "pen" as const, layerId: "skolp" }, "kalt");
  assert.equal(kept.layerId, "skolp");
});

test("withLayerId only fills missing layerId", () => {
  const objs = withLayerId(
    [stroke({ id: "a" }), stroke({ id: "b", layerId: "heitt" })],
    LAYER_ALMENNT
  );
  assert.equal(objs[0].layerId, LAYER_ALMENNT);
  assert.equal(objs[1].layerId, "heitt");
});

test("visibility and lock follow the named layer", () => {
  const layers = ensureLayers();
  layers.find((l) => l.id === "kalt")!.visible = false;
  layers.find((l) => l.id === "heitt")!.locked = true;
  const cold = stroke({ id: "c", layerId: "kalt" });
  const hot = stroke({ id: "h", layerId: "heitt" });
  const general = stroke({ id: "g" });
  assert.equal(isDrawnVisible(cold, layers), false);
  assert.equal(isDrawnVisible(hot, layers), true);
  assert.equal(isDrawnLocked(hot, layers), true);
  assert.equal(isDrawnLocked(general, layers), false);
  assert.deepEqual(selectableIds([cold, hot, general], layers), ["g"]);
});

test("activating a piping layer yields the plumber stroke color", () => {
  const layers = ensureLayers();
  assert.equal(layerStrokeForActive(layers, "kalt"), "#2563eb");
  assert.equal(layerStrokeForActive(layers, "heitt"), "#dc2626");
  assert.equal(layerStrokeForActive(layers, LAYER_ALMENNT), undefined);
});
