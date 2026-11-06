import assert from "node:assert/strict";
import { test } from "node:test";
import { utbuaVistun, type UttektHaed } from "./uttekt";
import type { BoardObject, ImageObject } from "./types";

/** Borð með einni úttektarmynd (5000×2500 frummynd á 1000×500 borðdílum, sett á (100, 50)). */
function bord(uttektAukar: Record<string, unknown> = {}): BoardObject[] {
  const mynd = {
    id: "mynd1",
    type: "image",
    x: 100,
    y: 50,
    width: 1000,
    height: 500,
    rotation: 0,
    locked: false,
    hidden: false,
    opacity: 1,
    assetId: "a1",
    name: "Teikning",
    uttekt: { companyId: 219, haedId: "h1", frumB: 5000, frumH: 2500, skurdur: null, merki: [], stimpilStaerd: 52, stimpilStaerdVid: 52, taknEining: 1, ...uttektAukar },
  } as unknown as ImageObject;
  return [mynd];
}
const haedir = (): UttektHaed[] => [{ id: "h1", nafn: "2. hæð", frum: { b: 5000, h: 2500 }, markers: [] }];

test("Vista í úttekt skrifar húsið og handvirka hallann í hæðina (heildarleið: borð → utbuaVistun → hæð)", () => {
  // Útlína í BORÐhnitum: horn (200,100) og (1000,450) → frummynd ((200-100)·5, (100-50)·5) = (500,250) og (4500,2000)
  const r = utbuaVistun(
    bord({ husUtlina: [200, 100, 1000, 100, 1000, 450, 200, 450], skekkja: -0.63, skekkjaHandvirk: true }),
    haedir(),
    "2026-11-06 10:00"
  );
  const h = r.haedir.find((x) => x.id === "h1")!;
  assert.deepEqual(h.husUtlina, [500, 250, 4500, 250, 4500, 2000, 500, 2000]);
  assert.equal(h.skekkja, -0.63);
  assert.equal(h.skekkjaHandvirk, true);
});

test("Vista í úttekt: borð sem veit ekkert um húsið eyðir EKKI útlínu hæðarinnar", () => {
  const hae = haedir();
  hae[0].husUtlina = [1, 2, 3, 4, 5, 6];
  hae[0].skekkja = 0.4;
  hae[0].skekkjaHandvirk = true;
  const r = utbuaVistun(bord(), hae, "2026-11-06 10:00");
  const h = r.haedir.find((x) => x.id === "h1")!;
  assert.deepEqual(h.husUtlina, [1, 2, 3, 4, 5, 6], "útlínan stendur");
  assert.equal(h.skekkja, 0.4);
});

test("Vista í úttekt: „Sjálfvirkt“ (null) fjarlægir útlínu og halla úr hæðinni", () => {
  const hae = haedir();
  hae[0].husUtlina = [1, 2, 3, 4, 5, 6];
  hae[0].skekkja = 0.4;
  hae[0].skekkjaHandvirk = true;
  const r = utbuaVistun(bord({ husUtlina: null, skekkja: null, skekkjaHandvirk: false }), hae, "2026-11-06 10:00");
  const h = r.haedir.find((x) => x.id === "h1")!;
  assert.equal("husUtlina" in h, false);
  assert.equal("skekkja" in h, false);
});
