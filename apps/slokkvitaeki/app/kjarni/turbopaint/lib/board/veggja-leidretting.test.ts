import assert from "node:assert/strict";
import { test } from "node:test";
import type { BoardObject, ImageObject, LineObject } from "./types";
import {
  bordDilarAMetra,
  erVeggur,
  stillaVeggTegund,
  tengjaVeggi,
  tengjaVikmork,
  veggTegundAf,
  VEGG_LITIR,
} from "./veggja-leidretting";

const vg = (id: string, points: number[], extra: Partial<LineObject> = {}): LineObject => ({
  id,
  type: "polyline",
  x: 0,
  y: 0,
  points,
  stroke: "#1c1917",
  strokeWidth: 8,
  dash: "solid",
  rotation: 0,
  opacity: 0.9,
  locked: false,
  hidden: false,
  name: "Veggur",
  veggur: true,
  layerId: "veggir",
  ...extra,
});

const ST = { vik: 120, vikSamlina: 120 };

test("erVeggur: innfluttur, á Veggja-laginu eða W-tólið — ekki eldveggir eða aðrar línur", () => {
  assert.equal(erVeggur(vg("a", [0, 0, 10, 0])), true);
  assert.equal(erVeggur(vg("b", [0, 0, 10, 0], { veggur: undefined, layerId: "veggir", name: "Lína" })), true);
  assert.equal(erVeggur(vg("c", [0, 0, 10, 0], { veggur: undefined, layerId: "almennt", name: "Veggir" })), true);
  assert.equal(erVeggur(vg("d", [0, 0, 10, 0], { veggur: undefined, layerId: "almennt", name: "EI-veggur EI-60" })), false);
  assert.equal(erVeggur(vg("e", [0, 0, 10, 0], { veggur: undefined, layerId: "kalt", name: "Lína" })), false);
  assert.equal(erVeggur(vg("f", [0, 0], {})), false);
});

test("tegund: gler verður blátt, hurð brún, veggur eins og áður — nafnið heldur Veggur-forskeytinu", () => {
  const w = vg("a", [0, 0, 10, 0], { veggur: undefined, name: "Veggir" });
  const g = stillaVeggTegund(w, "gler");
  assert.equal(g.stroke, VEGG_LITIR.gler);
  assert.equal(g.veggTegund, "gler");
  assert.equal(g.veggur, true);
  assert.ok(g.name.startsWith("Veggur"));
  assert.equal(stillaVeggTegund(g, "hurd").stroke, VEGG_LITIR.hurd);
  assert.equal(stillaVeggTegund(g, "veggur").stroke, "#1c1917");
  assert.equal(veggTegundAf(w), "veggur");
  assert.equal(veggTegundAf(g), "gler");
});

test("Tengja: tveir veggir sem ná ekki saman mætast í horninu (framlengt)", () => {
  const a = vg("a", [0, 0, 100, 0]); // lárétt, endar 30 fyrir hornið
  const b = vg("b", [130, 20, 130, 200]); // lóðrétt, byrjar 20 fyrir neðan
  const r = tengjaVeggi([a, b], [a, b], ST);
  assert.equal(r.fjoldi, 1);
  assert.deepEqual(r.punktar.get("a"), [0, 0, 130, 0]);
  assert.deepEqual(r.punktar.get("b"), [130, 0, 130, 200]);
});

test("Tengja: veggur sem stendur út fyrir hornið er klipptur að skurðpunktinum", () => {
  const a = vg("a", [0, 0, 160, 0]); // gengur 30 út fyrir
  const b = vg("b", [130, 20, 130, 200]);
  const r = tengjaVeggi([a, b], [a, b], ST);
  assert.deepEqual(r.punktar.get("a"), [0, 0, 130, 0]);
  assert.deepEqual(r.punktar.get("b"), [130, 0, 130, 200]);
});

test("Tengja: einn valinn veggur festist á hlið óvalins veggjar (T) — sá óvaldi hreyfist ekki", () => {
  const a = vg("a", [50, 40, 50, 200]); // lóðrétt, endar 40 fyrir neðan þvervegginn
  const b = vg("b", [0, 0, 300, 0]);
  const r = tengjaVeggi([a], [a, b], ST);
  assert.equal(r.fjoldi, 1);
  assert.deepEqual(r.punktar.get("a"), [50, 0, 50, 200]);
  assert.equal(r.punktar.has("b"), false);
});

test("Tengja: báðir valdir í T — þverveggurinn er ekki klipptur í horn", () => {
  const bar = vg("bar", [0, 0, 300, 0]);
  const stofn = vg("stofn", [110, 20, 110, 200]);
  const r = tengjaVeggi([bar, stofn], [bar, stofn], { vik: 300, vikSamlina: 300 });
  assert.equal(r.fjoldi, 1);
  assert.equal(r.punktar.has("bar"), false);
  assert.deepEqual(r.punktar.get("stofn"), [110, 0, 110, 200]);
});

test("Tengja: endi sem þegar liggur á vegg er ekki laus og hreyfist ekki", () => {
  const a = vg("a", [50, 0, 50, 200]);
  const b = vg("b", [0, 0, 300, 0]);
  const c = vg("c", [400, 0, 400, 100]); // langt frá
  const r = tengjaVeggi([a], [a, b, c], ST);
  assert.equal(r.fjoldi, 0);
  assert.equal(r.punktar.size, 0);
});

test("Tengja: samlínu bil lokast þegar tveir eru valdir, en hurðargat helst í stóru vali", () => {
  const a = vg("a", [0, 0, 100, 0]);
  const b = vg("b", [160, 0, 300, 0]); // 60 díla gat
  const tveir = tengjaVeggi([a, b], [a, b], { vik: 120, vikSamlina: 120 });
  assert.equal(tveir.fjoldi, 1);
  assert.deepEqual(tveir.punktar.get("a"), [0, 0, 130, 0]);
  assert.deepEqual(tveir.punktar.get("b"), [130, 0, 300, 0]);
  const c = vg("c", [0, 400, 300, 400]);
  const margir = tengjaVeggi([a, b, c], [a, b, c], { vik: 120, vikSamlina: 12 });
  assert.equal(margir.punktar.has("a"), false);
  assert.equal(margir.punktar.has("b"), false);
});

test("Tengja: færsla umfram vikmörk gerist ekki; x/y hlutar virt", () => {
  const a = vg("a", [0, 0, 100, 0], { x: 1000, y: 500 });
  const b = vg("b", [400, 20, 400, 200], { x: 1000, y: 500 }); // 300 frá — of langt
  assert.equal(tengjaVeggi([a, b], [a, b], ST).fjoldi, 0);
  const c = vg("c", [130, 20, 130, 200], { x: 1000, y: 500 });
  const r = tengjaVeggi([a, c], [a, c], ST);
  assert.deepEqual(r.punktar.get("a"), [0, 0, 130, 0]); // afstætt við x/y hlutarins
});

test("Tengja: ferhyrningur með fjórum götum í hornunum lokast allur", () => {
  const W = [
    vg("n", [10, 0, 190, 0]),
    vg("a", [200, 10, 200, 190]),
    vg("s", [190, 200, 10, 200]),
    vg("v", [0, 190, 0, 10]),
  ];
  const r = tengjaVeggi(W, W, ST);
  assert.equal(r.fjoldi, 4);
  assert.deepEqual(r.punktar.get("n"), [0, 0, 200, 0]);
  assert.deepEqual(r.punktar.get("a"), [200, 0, 200, 200]);
  assert.deepEqual(r.punktar.get("s"), [200, 200, 0, 200]);
  assert.deepEqual(r.punktar.get("v"), [0, 200, 0, 0]);
});

test("kvarði borðsins: K-kvarðinn, annars tengda úttektarmyndin (A1 1:100)", () => {
  const mynd = {
    id: "m", type: "image", assetId: "x", x: 0, y: 0, width: 5086, height: 7200, rotation: 0, opacity: 1,
    locked: false, hidden: false, name: "plan", uttekt: { companyId: 1612, haedId: "h", frumB: 4244, frumH: 6006 },
  } as ImageObject;
  assert.equal(bordDilarAMetra([mynd as BoardObject], 50), 50);
  const m = bordDilarAMetra([mynd as BoardObject], null)!;
  assert.ok(Math.abs(m - 71.41 * (5086 / 4244)) < 0.2, String(m));
  assert.equal(bordDilarAMetra([], null), null);
  const v2 = tengjaVikmork(2, 100, [8]);
  const v5 = tengjaVikmork(5, 100, [8]);
  assert.deepEqual(v2, { vik: 300, vikSamlina: 300 });
  assert.ok(Math.abs(v5.vik - 120) < 1e-9 && Math.abs(v5.vikSamlina - 30) < 1e-9);
});
