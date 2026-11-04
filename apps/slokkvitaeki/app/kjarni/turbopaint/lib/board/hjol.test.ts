import assert from "node:assert/strict";
import { test } from "node:test";
import { hjolaThysjun } from "./hjol";

test("hjól: eitt hakk (100 dílar) er um 13 %, ekki stökk; upp þysjar inn, niður út", () => {
  const inn = hjolaThysjun({ deltaY: -100 });
  const ut = hjolaThysjun({ deltaY: 100 });
  assert.ok(inn > 1.1 && inn < 1.16, String(inn));
  assert.ok(Math.abs(inn * ut - 1) < 1e-9);
});

test("snertiborð: litlar deltur gefa lítil skref, 30 atburðir af 4 dílum eru ~13 %", () => {
  let k = 1;
  for (let i = 0; i < 30; i++) k *= hjolaThysjun({ deltaY: -4 });
  assert.ok(k > 1.1 && k < 1.2, String(k));
  assert.ok(hjolaThysjun({ deltaY: -4 }) < 1.01);
});

test("risadelta er klemmd á einum atburði (±240) og línuhamur margfaldast", () => {
  assert.equal(hjolaThysjun({ deltaY: -5000 }), hjolaThysjun({ deltaY: -240 }));
  assert.ok(hjolaThysjun({ deltaY: -3, deltaMode: 1 }) > hjolaThysjun({ deltaY: -3 }));
});
