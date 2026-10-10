import assert from "node:assert/strict";
import { test } from "node:test";
import { bogaProf, finnaHurdaboga, hurdirUrBogum, minnka, nyjarBogahurdir, skeraVeggiUndirHurdum, type Gratona } from "./hurdabogar";
import type { HLina } from "./veggja-hreinsun";

// Tilbúin teikning: 50 dílar á metra (1 díll = 2 cm), hvítt blað, svart blek.
const DPM = 50;
const m = (x: number) => Math.round(x * DPM);

function blad(wM: number, hM: number): Gratona {
  const w = m(wM), h = m(hM);
  return { w, h, d: new Uint8Array(w * h).fill(255) };
}
function punktur(g: Gratona, x: number, y: number, b = 1) {
  for (let yy = Math.round(y - b / 2); yy < Math.round(y - b / 2) + b; yy++)
    for (let xx = Math.round(x - b / 2); xx < Math.round(x - b / 2) + b; xx++) if (xx >= 0 && yy >= 0 && xx < g.w && yy < g.h) g.d[yy * g.w + xx] = 0;
}
/** Fylltur veggur (ás-samsíða) frá (x0,y0) til (x1,y1) í metrum, þykkt t m. */
function veggur(g: Gratona, x0: number, y0: number, x1: number, y1: number, t = 0.15) {
  const a = Math.min(m(x0), m(x1)) - (y0 === y1 ? 0 : m(t / 2)), b = Math.max(m(x0), m(x1)) + (y0 === y1 ? 0 : m(t / 2));
  const c = Math.min(m(y0), m(y1)) - (x0 === x1 ? 0 : m(t / 2)), d = Math.max(m(y0), m(y1)) + (x0 === x1 ? 0 : m(t / 2));
  for (let y = c; y < d; y++) for (let x = a; x < b; x++) punktur(g, x, y);
}
function lina(g: Gratona, x0: number, y0: number, x1: number, y1: number) {
  const L = Math.hypot(m(x1) - m(x0), m(y1) - m(y0));
  for (let s = 0; s <= L; s += 0.5) punktur(g, m(x0) + ((m(x1) - m(x0)) * s) / L, m(y0) + ((m(y1) - m(y0)) * s) / L, 2);
}
/** Bogi um (cx,cy) radíus r frá horni a0 til a1 (gráður). */
function bogi(g: Gratona, cx: number, cy: number, r: number, a0: number, a1: number, strik = false) {
  for (let a = a0; a <= a1; a += 0.25) {
    if (strik && Math.floor((a - a0) / 6) % 2) continue;
    punktur(g, m(cx) + m(r) * Math.cos((a * Math.PI) / 180), m(cy) + m(r) * Math.sin((a * Math.PI) / 180), 2);
  }
}

/** Herbergi 6 × 5 m með innvegg í y = 2,5 og hurð (0,9 m) í honum: hjör í x = 2,0 á neðri fleti veggjarins, blaðið
 * opið niður (hornrétt á vegginn), boginn frá blaðendanum að hinum karminum. */
function teikning(st: { bogi?: boolean; strik?: boolean; hringur?: boolean; strikun?: boolean } = {}) {
  const g = blad(8, 7);
  veggur(g, 1, 1, 7, 1);
  veggur(g, 1, 6, 7, 6);
  veggur(g, 1, 1, 1, 6);
  veggur(g, 7, 1, 7, 6);
  veggur(g, 1, 2.5, 2.0, 2.5);
  veggur(g, 2.9, 2.5, 7, 2.5);
  if (st.bogi !== false) {
    // hjör (2,0; 2,575) — blaðið niður að (2,0; 3,475), boginn þaðan að hinum karminum (2,9; 2,575)
    lina(g, 2.0, 2.575, 2.0, 3.475);
    bogi(g, 2.0, 2.575, 0.9, 0, 90, st.strik);
  }
  if (st.hringur) bogi(g, 5, 4.2, 0.6, 0, 360);
  if (st.strikun) for (let x = 4.0; x <= 6.0; x += 0.12) lina(g, x, 3.2, x, 5.2);
  return g;
}

const VEGGIR: HLina[] = [
  { p: [m(1), m(2.5), m(2.0), m(2.5)], t: m(0.15) },
  { p: [m(2.9), m(2.5), m(7), m(2.5)], t: m(0.15) },
  { p: [m(1), m(1), m(7), m(1)], t: m(0.15) },
];

test("bogi hurðar finnst: hjör, radíus og stefna veggjarins", () => {
  const b = finnaHurdaboga(teikning(), DPM);
  assert.equal(b.length, 1, JSON.stringify(b));
  assert.ok(Math.hypot(b[0].c[0] - m(2.0), b[0].c[1] - m(2.575)) <= 4, `hjör ${b[0].c}`);
  assert.ok(Math.abs(b[0].r - m(0.9)) <= 3, `r ${b[0].r}`);
  assert.deepEqual(b[0].u, [1, 0]); // eftir veggnum, að hinum karminum
  assert.deepEqual(b[0].n, [0, 1]); // blaðið opnast niður
  assert.ok(b[0].blad >= 0.6);
});

test("strikaður bogi finnst líka", () => {
  const b = finnaHurdaboga(teikning({ strik: true }), DPM);
  assert.equal(b.length, 1);
});

test("heill hringur (borð) og strikun (parket / stigi) eru ekki hurðir", () => {
  const b = finnaHurdaboga(teikning({ bogi: false, hringur: true, strikun: true }), DPM);
  assert.equal(b.length, 0, JSON.stringify(b.map((x) => [x.c, x.r])));
});

test("hurð úr boga liggur á miðlínu veggjarins, breidd = gatið", () => {
  const b = finnaHurdaboga(teikning(), DPM);
  const h = hurdirUrBogum(b, VEGGIR, DPM);
  assert.equal(h.length, 1);
  const [x0, y0, x1, y1] = h[0].p;
  assert.ok(Math.abs(y0 - m(2.5)) <= 1 && Math.abs(y1 - m(2.5)) <= 1, `y ${y0} ${y1}`);
  assert.ok(Math.abs(Math.min(x0, x1) - m(2.0)) <= 2 && Math.abs(Math.max(x0, x1) - m(2.9)) <= 2, `x ${x0} ${x1}`);
  assert.equal(h[0].t, m(0.15));
  // án veggja: krefjastVeggjar fellir hana ekki (engir veggir gefnir), en bogi fjarri vegg fellur þegar veggir eru gefnir
  assert.equal(hurdirUrBogum(b, [], DPM, { krefjastVeggjar: true }).length, 1);
  assert.equal(hurdirUrBogum(b, [{ p: [m(1), m(6), m(7), m(6)], t: m(0.15) }], DPM, { krefjastVeggjar: true }).length, 0);
});

test("tvær hurðir sem mætast verða ein tvöföld", () => {
  const bogar = [
    { c: [100, 200], r: 40, u: [1, 0], n: [0, 1], thekja: 1, blad: 1, veggur: 1, tom: 1, stig: 3 },
    { c: [180, 200], r: 40, u: [-1, 0], n: [0, 1], thekja: 1, blad: 1, veggur: 1, tom: 1, stig: 3 },
  ] as Parameters<typeof hurdirUrBogum>[0];
  const h = hurdirUrBogum(bogar, [], 50);
  assert.equal(h.length, 1);
  assert.equal(h[0].tvofold, true);
  assert.equal(Math.abs(h[0].p[2] - h[0].p[0]), 80);
});

test("bogaProf staðfestir gat með boga við annan karminn", () => {
  const b = finnaHurdaboga(teikning(), DPM);
  const p = bogaProf(b, DPM);
  assert.equal(p([m(2.0), m(2.5)], [m(2.9), m(2.5)], m(0.15)), true);
  assert.equal(p([m(4.0), m(2.5)], [m(4.9), m(2.5)], m(0.15)), false);
});

test("veggur sem brúar gatið er klipptur undir hurðinni", () => {
  const heill: HLina[] = [{ p: [0, 100, 400, 100], t: 8 }, { p: [0, 0, 0, 300], t: 8 }];
  const r = skeraVeggiUndirHurdum(heill, [{ p: [150, 100, 195, 100], t: 8 }], 50);
  assert.equal(r.skornir, 1);
  const lar = r.veggir.filter((v) => v.p[1] === 100).map((v) => [Math.min(v.p[0], v.p[2]), Math.max(v.p[0], v.p[2])]);
  assert.deepEqual(lar.sort((a, b) => a[0] - b[0]), [
    [0, 150],
    [195, 400],
  ]);
  assert.ok(r.veggir.some((v) => v.p[0] === 0 && v.p[3] === 300), "lóðrétti veggurinn óbreyttur");
});

test("nyjarBogahurdir sleppir hurð sem er þegar í gatinu", () => {
  const h = [{ p: [100, 100, 145, 100] as [number, number, number, number], t: 8, tegund: "hurd" as const, bogi: true as const, stig: 2 }];
  assert.equal(nyjarBogahurdir(h, [{ p: [102, 101, 146, 101], t: 8 }], 50).length, 0);
  assert.equal(nyjarBogahurdir(h, [{ p: [300, 100, 345, 100], t: 8 }], 50).length, 1);
});

test("minnka heldur mjóum dökkum línum", () => {
  const g = blad(2, 2);
  lina(g, 0.2, 1, 1.8, 1);
  const k = minnka(g, 3);
  assert.equal(k.w, Math.floor(g.w / 3));
  let dokk = 0;
  for (const v of k.d) if (v < 128) dokk++;
  assert.ok(dokk >= Math.floor((1.6 * DPM) / 3) - 1);
});
