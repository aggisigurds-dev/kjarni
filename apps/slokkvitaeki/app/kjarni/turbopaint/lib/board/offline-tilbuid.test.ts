import assert from "node:assert/strict";
import { test } from "node:test";
import { bordAssetIds } from "./persistence";
import type { BoardDocument } from "./types";

// „Sækja fyrir offline" verður að ná yfir BÆÐI teikningamyndina (assetIds) OG þunga frumritið (frumAssetIds) — annars
// opnast borðið án nets en greining fær ekki frumritið. Þetta próf læsir þeirri reglu (og að tvítök séu fjarlægð).

function doc(p: Partial<BoardDocument>): BoardDocument {
  return {
    version: 2,
    name: "Próf",
    objects: [],
    camera: { x: 0, y: 0, scale: 1 },
    pixelsPerMeter: null,
    grid: true,
    snap: true,
    assetIds: [],
    ...p,
  } as BoardDocument;
}

test("bordAssetIds sameinar teikningamyndir og frumrit", () => {
  assert.deepEqual(
    bordAssetIds(doc({ assetIds: ["mynd1"], frumAssetIds: ["frum1"] })).sort(),
    ["frum1", "mynd1"]
  );
});

test("bordAssetIds fjarlægir tvítök (mynd = frum á sama id)", () => {
  assert.deepEqual(bordAssetIds(doc({ assetIds: ["a", "a", "b"], frumAssetIds: ["b", "c"] })).sort(), [
    "a",
    "b",
    "c",
  ]);
});

test("bordAssetIds þolir að frumAssetIds vanti (eldri borð)", () => {
  assert.deepEqual(bordAssetIds(doc({ assetIds: ["x"] })), ["x"]);
});

test("bordAssetIds á tómu borði er tómt (borð án mynda er bara JSON)", () => {
  assert.deepEqual(bordAssetIds(doc({ assetIds: [] })), []);
});
