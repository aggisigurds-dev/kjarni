import assert from "node:assert/strict";
import { test } from "node:test";
import { planTilSjalfvirks } from "./sjalfvirkt-takki";
import type { ImageObject, LineObject } from "./types";

const mynd = (id: string, extra: Partial<ImageObject> = {}): ImageObject =>
  ({
    id,
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
    name: id,
    ...extra,
  }) as ImageObject;

const veggur = (id: string, parentId: string): LineObject =>
  ({
    id,
    type: "polyline",
    points: [0, 0, 10, 0],
    x: 0,
    y: 0,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    name: "Veggur",
    stroke: "#000",
    strokeWidth: 4,
    dash: "solid",
    veggur: true,
    parentId,
  }) as LineObject;

const uttekt = { companyId: 1, haedId: "h1", frumB: 100, frumH: 80 };

test("sjálfvirkt-takki: ein teikning með úttekt er valin", () => {
  const p = mynd("m1", { uttekt });
  const r = planTilSjalfvirks([p], []);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.plan.id, "m1");
});

test("sjálfvirkt-takki: ótengd teikning er hafnað með skýringu", () => {
  const r = planTilSjalfvirks([mynd("m1")], []);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.villa, /Tengdu teikninguna við hæð/);
});

test("sjálfvirkt-takki: ekkert á borðinu", () => {
  const r = planTilSjalfvirks([], []);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.villa, /Engin teikning/);
});

test("sjálfvirkt-takki: valinn veggur festur við tengda teikningu ræður", () => {
  const tengd = mynd("m1", { uttekt });
  const laus = mynd("m2");
  const r = planTilSjalfvirks([tengd, laus, veggur("v", "m1")], ["v"]);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.plan.id, "m1");
});
