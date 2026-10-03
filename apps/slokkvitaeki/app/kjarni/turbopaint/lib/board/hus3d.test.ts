import assert from "node:assert/strict";
import { test } from "node:test";
import { haedarNumer, husUrBordi } from "./hus3d";
import type { BoardObject } from "./types";

const mynd = (id: string, name: string, y: number): BoardObject => ({
  id, type: "image", name, x: 0, y, width: 1000, height: 700, assetId: "a" + id,
  rotation: 0, opacity: 1, locked: false, hidden: false,
} as BoardObject);
const veggur = (parentId: string, pts: number[], w = 10): BoardObject => ({
  id: "v" + Math.random(), type: "polyline", name: "Veggur", x: 0, y: 0, points: pts, stroke: "#000",
  strokeWidth: w, dash: "solid", rotation: 0, opacity: 1, locked: false, hidden: false, parentId, veggur: true,
} as BoardObject);

test("haedarNumer les heiti hæða", () => {
  assert.equal(haedarNumer("Kjallari"), 0);
  assert.equal(haedarNumer("Skútuvogur 4 — 2. hæð"), 2);
  assert.equal(haedarNumer("1.hæð"), 1);
  assert.equal(haedarNumer("Ris"), 99);
  assert.equal(haedarNumer("Skráningartafla"), null);
  assert.equal(haedarNumer("2022-10-1139929"), null);
});

test("husUrBordi: hæðir raðast eftir stöðu þegar heitin eru skjalanúmer; veggir miðast við miðju teikningar", () => {
  const objs = [
    mynd("b", "2022-10-1139928", 2000), // 2. hæð neðar á borðinu
    mynd("a", "2022-10-1139929", 800),  // 1. hæð efst
    mynd("c", "Skráningartafla", 3500), // ekkert á henni — dettur út
    veggur("a", [100, 100, 900, 100], 12),
    veggur("b", [500, 2100, 500, 2600, 900, 2600]),
  ];
  const h = husUrBordi(objs);
  assert.deepEqual(h.map((x) => x.plan.id), ["a", "b"]);
  assert.equal(h[0].veggir.length, 1);
  const v = h[0].veggir[0];
  // teikning a: miðja (500, 1150) → bútur frá (-400, -1050) til (400, -1050)
  assert.deepEqual([v.ax, v.ay, v.bx, v.by, v.thykkt], [-400, -1050, 400, -1050, 12]);
  assert.equal(h[1].veggir.length, 2, "brotalína með þremur punktum = tveir bútar");
});
