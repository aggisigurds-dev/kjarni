import assert from "node:assert/strict";
import { test } from "node:test";
import { GOLFAFERDIR, aferdarMetrar, erGlansAferd, lesaUtlit3D, teiknaGolfAferd } from "./golfaferdir";

test("lesaUtlit3D: aðeins gild gildi komast í gegn; „teikning“ og tómt = null (sjálfgefið)", () => {
  assert.deepEqual(lesaUtlit3D({ veggir: "#A1B2C3", hurdir: "#000000", golf: "parket" }), { veggir: "#a1b2c3", hurdir: "#000000", golf: "parket" });
  assert.deepEqual(lesaUtlit3D({ veggir: "red", hurdir: "#12345", golf: "marmari" }), null);
  assert.deepEqual(lesaUtlit3D({ golf: "teikning" }), null);
  assert.equal(lesaUtlit3D(null), null);
  assert.equal(lesaUtlit3D("steypa"), null);
  assert.deepEqual(lesaUtlit3D({ golf: "epoxy-glans", veggir: 12 }), { golf: "epoxy-glans" });
});

test("áferðirnar: einkvæm auðkenni, metrar > 0, aðeins epoxy-glans er glans", () => {
  const ids = GOLFAFERDIR.map((g) => g.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const g of GOLFAFERDIR) assert.ok(aferdarMetrar(g.id) > 0, g.id);
  assert.equal(aferdarMetrar("flisar-litlar"), 1.2);
  assert.equal(erGlansAferd("epoxy-glans"), true);
  assert.equal(erGlansAferd("parket"), false);
  assert.equal(erGlansAferd(undefined), false);
});

test("teiknaGolfAferd: hver áferð teiknar eitthvað á strigann án þess að kasta (gervi-samhengi)", () => {
  for (const g of GOLFAFERDIR) {
    const koll: string[] = [];
    const ctx = {
      fillStyle: "", strokeStyle: "", lineWidth: 1, globalAlpha: 1,
      fillRect: () => { koll.push("fillRect"); }, beginPath: () => {}, arc: () => {}, fill: () => { koll.push("fill"); },
      moveTo: () => {}, lineTo: () => {}, stroke: () => { koll.push("stroke"); },
      createRadialGradient: () => ({ addColorStop: () => {} }) as unknown as CanvasGradient,
    };
    teiknaGolfAferd(ctx, g.id, 64);
    assert.ok(koll.includes("fillRect"), g.id);
  }
});
