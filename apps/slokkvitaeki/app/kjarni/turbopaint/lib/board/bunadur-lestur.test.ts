import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { bunadurUrRommum, finnaRammaMerki, flokkaBunad, teljaBunad } from "./bunadur-lestur";
import type { Blek } from "./slt-brsl";

/** Blekgríma úr prófunargögnunum: bútar OCR-myndar Trönuhrauns 10, 1. hæð (Lindaberg ehf, 2012-blaðið 16052012_004.pdf,
 * rastað í 5200 px; kvardi 0,7318 OCR-dílar á myndardíl). Reitir: 8 kassar með R, 1 hringur með S, orðin „BO“ (×2) og
 * „74m“ (málsetning, enginn rammi). */
function tronuhraun() {
  const f = JSON.parse(readFileSync(join(__dirname, "fixtures", "tronuhraun-1haed-rammar.json"), "utf8")) as {
    mynd: { b: number; h: number };
    ocr: { w: number; h: number; kvardi: number };
    reitir: { x: number; y: number; w: number; h: number; bitar: string }[];
  };
  const data = new Uint8Array(f.ocr.w * f.ocr.h);
  for (const r of f.reitir) {
    const b = Buffer.from(r.bitar, "base64");
    for (let n = 0; n < r.w * r.h; n++) {
      if (b[n >> 3] & (1 << (n & 7))) data[(r.y + Math.floor(n / r.w)) * f.ocr.w + r.x + (n % r.w)] = 1;
    }
  }
  const blek: Blek = { w: f.ocr.w, h: f.ocr.h, kvardi: f.ocr.kvardi, data };
  return { ...f, blek };
}

// Miðjur rammanna í OCR-dílum (frumgerðin rammar-profun.cjs á 1h-2012-ocr.png, montage yfirfarið 15.10.2026)
const KASSAR_OCR = [
  [3516, 637],
  [2870, 1201],
  [2868, 1460],
  [1152, 1466],
  [1707, 1469],
  [2205, 1471],
  [2472, 1473],
  [2866, 1976],
];
const HRINGUR_OCR = [3519, 581];

test("finnaRammaMerki: Trönuhraun 10 1. hæð — 8 kassar (R) og 1 hringur (S), hvorki BO-orðin né „74m“ án ramma", () => {
  const t = tronuhraun();
  const k = t.ocr.kvardi;
  const rm = finnaRammaMerki(t.blek, null, 20);
  assert.equal(rm.length, 9, JSON.stringify(rm.map((r) => [r.form, Math.round(r.x * k), Math.round(r.y * k)])));
  const kassar = rm.filter((r) => r.form === "kassi"), hringir = rm.filter((r) => r.form === "hringur");
  assert.equal(kassar.length, 8);
  assert.equal(hringir.length, 1);
  for (const [x, y] of KASSAR_OCR) {
    assert.ok(kassar.some((r) => Math.hypot(r.x * k - x, r.y * k - y) < 6), `kassi við ${x},${y}`);
  }
  assert.ok(Math.hypot(hringir[0].x * k - HRINGUR_OCR[0], hringir[0].y * k - HRINGUR_OCR[1]) < 6, "hringurinn er S-ið við hurðina");
  // ramminn er ~37 OCR-dílar = ~50 myndardílar á kant; stafurinn fyllir 30–85 % af hæðinni
  for (const r of rm) {
    assert.ok(r.r * k > 14 && r.r * k < 24, `stærð ${r.r * k}`);
    assert.equal(r.inni, 1, "einn stafur í rammanum");
    assert.ok(r.stafur.x0 > r.x - r.r && r.stafur.x1 < r.x + r.r, "reitur stafsins er innan rammans");
  }
});

test("finnaRammaMerki: svæði hússins sleppir römmum utan þess", () => {
  const t = tronuhraun();
  const k = t.ocr.kvardi;
  // aðeins neðri röðin (y ≈ 1466–1473 OCR = 2003–2013 myndardílar; kassinn við 1460 OCR = 1995 er rétt utan)
  const rm = finnaRammaMerki(t.blek, { x0: 0, y0: 2000, x1: t.mynd.b, y1: 2100 }, 20);
  assert.equal(rm.length, 4, JSON.stringify(rm.map((r) => Math.round(r.y * k))));
});

test("flokkaBunad: R/K → reykskynjari, S/5/$ → segulloki, H → hitaskynjari, B/8 → bjalla, annað ekkert", () => {
  assert.equal(flokkaBunad("R"), "reykskynjari");
  assert.equal(flokkaBunad(" r "), "reykskynjari");
  assert.equal(flokkaBunad("K"), "reykskynjari");
  assert.equal(flokkaBunad("S"), "segull");
  assert.equal(flokkaBunad("5"), "segull");
  assert.equal(flokkaBunad("H"), "hitaskynjari");
  assert.equal(flokkaBunad("B"), "bjalla");
  assert.equal(flokkaBunad("8"), "bjalla");
  for (const t of ["", "RS", "E", "1", "BO", "x"]) assert.equal(flokkaBunad(t), null, t);
});

test("bunadurUrRommum + teljaBunad: ólesinn eða ólæsilegur rammi sleppur, talið eftir tegund", () => {
  const rm = [
    { x: 10, y: 10, r: 20, form: "kassi" as const, inni: 1, stafur: { x0: 0, y0: 0, x1: 20, y1: 20 } },
    { x: 50, y: 10, r: 20, form: "hringur" as const, inni: 1, stafur: { x0: 40, y0: 0, x1: 60, y1: 20 } },
    { x: 90, y: 10, r: 20, form: "kassi" as const, inni: 1, stafur: { x0: 80, y0: 0, x1: 100, y1: 20 } },
    { x: 130, y: 10, r: 20, form: "kassi" as const, inni: 1, stafur: { x0: 120, y0: 0, x1: 140, y1: 20 } },
  ];
  const b = bunadurUrRommum(rm, [{ text: "R", confidence: 80 }, { text: "S", confidence: 70 }, null, { text: "Q", confidence: 90 }]);
  assert.deepEqual(b.map((x) => [x.tegund, x.x, x.stafur]), [["reykskynjari", 10, "R"], ["segull", 50, "S"]]);
  assert.deepEqual(teljaBunad([...b, ...b]), { reykskynjari: 2, segull: 2 });
});
