import assert from "node:assert/strict";
import { test } from "node:test";
import { gildBirtuskerpa, nyrri } from "./birtuskerpa";
import { skjamyndarLykill, skonnunarLykill } from "./eignalykill";
import { metaBlad } from "./sheet-contrast";

/** Mynd (n dílar) þar sem `hlutfall` díla fá `lina` og afgangurinn `grunnur` — dreift jafnt. */
function mynd(n: number, grunnur: number[], lina: number[], hlutfall: number): Uint8ClampedArray {
  const d = new Uint8ClampedArray(n * 4);
  const bil = hlutfall > 0 ? Math.round(1 / hlutfall) : Infinity;
  for (let i = 0; i < n; i++) d.set(i % bil === 0 ? lina : grunnur, i * 4);
  return d;
}

const HVITT = [255, 255, 255, 255];
const SVART = [20, 20, 20, 255];

test("teikningar fá skerpu: hvítur pappír, gulnaður og brúnleitur pappír, rauðar EI-línur", () => {
  assert.equal(metaBlad(mynd(10000, HVITT, SVART, 0.08)).teikning, true, "svartar línur á hvítu");
  assert.equal(metaBlad(mynd(10000, [230, 220, 190, 255], [60, 50, 40, 255], 0.1)).teikning, true, "gulnuð skönnun");
  assert.equal(metaBlad(mynd(10000, [200, 170, 130, 255], [70, 50, 35, 255], 0.12)).teikning, true, "brúnleitt (1991) blað");
  assert.equal(metaBlad(mynd(10000, HVITT, [220, 30, 30, 255], 0.05)).teikning, true, "rauðar línur á hvítu");
  assert.equal(metaBlad(mynd(10000, [235, 235, 235, 255], [150, 150, 150, 255], 0.1)).teikning, true, "daufar gráar CAD-línur");
});

test("litmyndir sleppa: gegnsæi, dökkir fletir, sterkir litir", () => {
  const gegnsae = metaBlad(mynd(10000, [0, 0, 0, 0], [240, 120, 20, 255], 0.4));
  assert.equal(gegnsae.teikning, false, "PNG með gegnsæjum bakgrunni (Fenrir-blaðið)");
  assert.ok(gegnsae.gegnsae > 0.5);
  assert.equal(metaBlad(mynd(10000, [15, 12, 10, 255], [250, 140, 30, 255], 0.2)).teikning, false, "dökk mynd með eldi");
  assert.equal(metaBlad(mynd(10000, HVITT, [240, 110, 20, 255], 0.3)).teikning, false, "sterkir appelsínugulir fletir");
  assert.equal(metaBlad(new Uint8ClampedArray(0)).teikning, false, "tómt");
  // gervi-köflótt „gegnsæi" (ógegnsæir ljósir reitir) + dökkur úlfur + eldur — eins og Fenrir-blaðið á borðinu
  const fenrir = new Uint8ClampedArray(10000 * 4);
  for (let i = 0; i < 10000; i++) fenrir.set(i % 20 < 9 ? (i % 2 ? [255, 255, 255, 255] : [204, 204, 204, 255]) : i % 20 < 16 ? [22, 18, 16, 255] : [245, 110, 25, 255], i * 4);
  assert.equal(metaBlad(fenrir).teikning, false, "Fenrir-blaðið með teiknuðum köflóttum bakgrunni");
});

test("samanlagður þröskuldur: litmynd rétt undir hvorum fyrir sig sleppur; þétt teikning fær skerpu", () => {
  // 27 % dökkt + 13 % appelsínugult á köflóttu (mælt í vafranum 17.11.2026 — var áður skerpt)
  const d = new Uint8ClampedArray(1000 * 4);
  for (let i = 0; i < 1000; i++) d.set(i < 267 ? [22, 18, 16, 255] : i < 395 ? [245, 110, 25, 255] : i % 2 ? [255, 255, 255, 255] : [204, 204, 204, 255], i * 4);
  assert.equal(metaBlad(d).teikning, false);
  // þétt skástrikuð teikning: 25 % blek + 5 % rauðar EI-línur
  const t = new Uint8ClampedArray(1000 * 4);
  for (let i = 0; i < 1000; i++) t.set(i < 250 ? [30, 30, 30, 255] : i < 300 ? [220, 30, 30, 255] : [250, 250, 250, 255], i * 4);
  assert.equal(metaBlad(t).teikning, true);
});

test("teikning með gegnsæjum grunni (CAD-útflutningur) er teikning — gegnsæi telst hvítur pappír", () => {
  const m = metaBlad(mynd(10000, [0, 0, 0, 0], SVART, 0.06));
  assert.equal(m.teikning, true);
  assert.ok(m.gegnsae > 0.9);
});

test("stillingin: aðeins þrjú gild gildi; nýjasta valið ræður (jafnt telst ekki nýrra)", () => {
  assert.equal(gildBirtuskerpa("sjalfvirkt"), "sjalfvirkt");
  assert.equal(gildBirtuskerpa("aldrei"), "aldrei");
  assert.equal(gildBirtuskerpa("kannski"), null);
  assert.equal(gildBirtuskerpa(undefined), null);
  assert.equal(nyrri("2026-11-17T12:00:00Z", null), true);
  assert.equal(nyrri("2026-11-17T12:00:00Z", "2026-11-17T11:00:00Z"), true);
  assert.equal(nyrri("2026-11-17T12:00:00Z", "2026-11-17T12:00:00Z"), false);
  assert.equal(nyrri(null, "2026-11-17T12:00:00Z"), false);
});

test("auðkenni mynda: teikningar halda gamla lyklinum, mynd án skerpu fær annan", () => {
  const gamall = skjamyndarLykill("abc", "print", 0);
  assert.equal(gamall, "skjamynd|v1|print|0|abc", "óbreytt fyrir skerptar teikningar — ekkert hleðst upp aftur");
  assert.notEqual(skjamyndarLykill("abc", "print", 0, "anskerpu"), gamall, "litmynd tekur ekki dökku útgáfuna úr fötunni");
  const sk = skonnunarLykill("https://x/y.tif.info", "print", null, { b: 6006, h: 4429 });
  assert.equal(sk, "skonnun|v1|print|-|6006x4429|https://x/y.tif.info");
  assert.notEqual(skonnunarLykill("https://x/y.tif.info", "print", null, { b: 6006, h: 4429 }, "anskerpu"), sk);
});