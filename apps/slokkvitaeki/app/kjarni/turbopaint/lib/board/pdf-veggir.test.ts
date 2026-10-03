import assert from "node:assert/strict";
import { test } from "node:test";
import { paraVeggi, teiknaStrikIMaska, veljaVeggjaflokk, type Strik } from "./pdf-veggir";

test("paraVeggi: tvær samsíða línur 4 pt í sundur verða einn veggur með þykkt 4 á miðjunni", () => {
  const strik: Strik[] = [[0, 0, 100, 0], [0, 4, 100, 4]];
  const v = paraVeggi(strik);
  assert.equal(v.length, 1);
  assert.ok(Math.abs(v[0].thykkt - 4) < 1e-9);
  assert.ok(Math.abs(v[0].a[1] - 2) < 1e-9 && Math.abs(v[0].b[1] - 2) < 1e-9);
  assert.ok(Math.abs(Math.abs(v[0].b[0] - v[0].a[0]) - 100) < 1e-9);
});

test("paraVeggi: brotin lína sameinast og parast aðeins við NÆSTU línu (útveggur ekki við næsta vegg)", () => {
  const strik: Strik[] = [
    [0, 0, 40, 0], [40, 0, 100, 0], // lína brotin í tvennt
    [0, 3, 100, 3],                  // hinn helmingur veggjarins
    [0, 15, 100, 15], [0, 18, 100, 18], // næsti veggur 15 pt neðar
  ];
  const v = paraVeggi(strik);
  assert.equal(v.length, 2);
  assert.deepEqual(v.map((x) => Math.round(x.thykkt)).sort(), [3, 3]);
});

test("paraVeggi: lóðréttur veggur og stök lína (málstrik) — stök lína verður ekki veggur", () => {
  const v = paraVeggi([[10, 0, 10, 80], [14, 0, 14, 80], [60, 0, 60, 80]]);
  assert.equal(v.length, 1);
  assert.ok(Math.abs(v[0].a[0] - 12) < 1e-6);
});

test("veljaVeggjaflokk velur flokkinn með mestri langri lengd, ekki hárlínur", () => {
  const lang: Strik[] = Array.from({ length: 50 }, (_, i) => [0, i * 10, 500, i * 10] as Strik);
  const r = veljaVeggjaflokk({ "0.24": lang.concat(lang), "0.48": lang, "1.38": [[0, 0, 900, 0]] }, 1684, 2384);
  assert.equal(r.valinn, "0.48");
});

test("teiknaStrikIMaska teiknar strik í kvarða", () => {
  const m = teiknaStrikIMaska([[1, 1, 9, 1]], 20, 6, 2, 2);
  assert.equal(m[2 * 20 + 10], 1);
  assert.equal(m[5 * 20 + 10], 0);
});
