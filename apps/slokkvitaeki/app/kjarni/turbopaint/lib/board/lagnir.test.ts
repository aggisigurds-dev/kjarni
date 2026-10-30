import assert from "node:assert/strict";
import { test } from "node:test";
import {
  andhverfLiking,
  beitaLikingu,
  erStaerd,
  giskaARasalitum,
  gegnumtokCsv,
  kvardiLikingar,
  lesaLitaLog,
  likingUrPunktapari,
  litTilHex,
  litirFlata,
  litirStrika,
  talaGegnumtok,
  taldarStaerdir,
  type Punktur,
  type Strik,
} from "./lagnir";

// Gervi-OPS: aðeins tölurnar skipta máli.
const OPS = {
  save: 1, restore: 2, transform: 3, setLineWidth: 4, setStrokeRGBColor: 5, setFillRGBColor: 6,
  setStrokeGray: 7, setFillGray: 8, constructPath: 9, stroke: 20, fill: 21, fillStroke: 22, endPath: 23,
};

/** pdf.js 5-snið: constructPath = [málunaraðgerð, [Float32Array slóð], minMax]; 0 = moveTo, 1 = lineTo, 4 = close. */
function slod(mal: number, pts: Punktur[], loka = false): unknown[] {
  const d: number[] = [];
  pts.forEach((p, i) => d.push(i === 0 ? 0 : 1, p[0], p[1]));
  if (loka) d.push(4);
  return [mal, [Float32Array.from(d)], null];
}

test("lesaLitaLog: rautt strik og grár flötur fá sinn lit, litur og þykkt erfast um save/restore", () => {
  const fn = [OPS.setStrokeRGBColor, OPS.setLineWidth, OPS.constructPath, OPS.save, OPS.setFillRGBColor, OPS.constructPath, OPS.restore, OPS.constructPath];
  const args = [
    ["#FF0000"], [0.5],
    slod(OPS.stroke, [[0, 0], [100, 0]]),
    [], ["#b5b5b5"],
    slod(OPS.fill, [[0, 0], [10, 0], [10, 10], [0, 10]], true),
    [],
    slod(OPS.stroke, [[0, 5], [50, 5]]),
  ];
  const r = lesaLitaLog(OPS, fn, args, [1, 0, 0, 1, 0, 0]);
  assert.equal(r.strik.length, 2);
  assert.equal(r.strik[0].lit, "#ff0000");
  assert.equal(r.strik[0].b, 0.5);
  assert.equal(r.strik[1].lit, "#ff0000"); // stroke-liturinn lifir (aðeins fill var í save)
  assert.equal(r.flatir.length, 1);
  assert.equal(r.flatir[0].lit, "#b5b5b5");
  assert.equal(r.flatir[0].p.length, 5); // lokað: fyrsti punktur endurtekinn
});

test("litTilHex: strengur og [r,g,b] gefa sama lit", () => {
  assert.equal(litTilHex(["#AABBCC"]), "#aabbcc");
  assert.equal(litTilHex([255, 0, 128]), "#ff0080");
});

test("litirStrika og litirFlata telja og raða fjölmennasta fyrst; giskað á gráar rásir", () => {
  const s = litirStrika([
    { lit: "#ff0000", b: 1, s: [0, 0, 3, 4] },
    { lit: "#000000", b: 1, s: [0, 0, 1, 0] },
    { lit: "#000000", b: 1, s: [0, 0, 1, 0] },
  ]);
  assert.deepEqual(s.map((x) => x.lit), ["#000000", "#ff0000"]);
  assert.equal(s[1].lengd, 5);
  const box = (l: string, n: number) => Array.from({ length: n }, () => ({ lit: l, p: [[0, 0], [1, 0], [1, 1], [0, 0]] as Punktur[] }));
  const f = litirFlata([...box("#b5b5b5", 60), ...box("#d6d6d6", 50), ...box("#ff0000", 80), ...box("#c0c0c0", 5)]);
  assert.deepEqual(giskaARasalitum(f).sort(), ["#b5b5b5", "#d6d6d6"]);
});

test("likingUrPunktapari: kvarði 1:5, snúningur og færsla; andhverfa skilar sér", () => {
  const m1: Punktur = [100, 100], m2: Punktur = [300, 100];
  const y1: Punktur = [20, 50], y2: Punktur = [60, 50];
  const l = likingUrPunktapari(m1, m2, y1, y2)!;
  assert.ok(Math.abs(kvardiLikingar(l) - 0.2) < 1e-9);
  const q = beitaLikingu(l, [200, 100]);
  assert.ok(Math.abs(q[0] - 40) < 1e-9 && Math.abs(q[1] - 50) < 1e-9);
  const t = beitaLikingu(andhverfLiking(l), q);
  assert.ok(Math.abs(t[0] - 200) < 1e-9 && Math.abs(t[1] - 100) < 1e-9);
  // snúið 90°
  const l2 = likingUrPunktapari([0, 0], [10, 0], [0, 0], [0, 10])!;
  const r = beitaLikingu(l2, [5, 0]);
  assert.ok(Math.abs(r[0]) < 1e-9 && Math.abs(r[1] - 5) < 1e-9);
  assert.equal(likingUrPunktapari([1, 1], [1, 1], [0, 0], [5, 5]), null);
});

test("erStaerd þekkir Ø, a/Ø og BxH en ekki venjulegan texta", () => {
  for (const s of ["Ø250", "ø160", "160/Ø125", "800x900", "250 / Ø160", "�400"]) assert.ok(erStaerd(s), s);
  for (const s of ["MK= 35.36", "SQ12601", "57 L/s", "Ø", "5H"]) assert.ok(!erStaerd(s), s);
});

test("talaGegnumtok: rás yfir vegg með tveimur hliðum er EITT gegnumtak með stærð; rás utan veggs ekkert", () => {
  const veggir: Strik[] = [[50, 0, 50, 100], [56, 0, 56, 100]]; // lóðréttur vegg 6 pt þykkur
  const rasin: Punktur[] = [[0, 40], [100, 40], [100, 60], [0, 60], [0, 40]];
  const utan: Punktur[] = [[0, 200], [100, 200], [100, 220], [0, 220], [0, 200]];
  const r = talaGegnumtok(veggir, [rasin, utan], [{ s: "Ø315", x: 53, y: 50 }, { s: "MK= 1", x: 53, y: 41 }]);
  assert.equal(r.length, 1);
  assert.equal(r[0].staerd, "Ø315");
  assert.equal(r[0].flatur, 0);
});

test("talaGegnumtok: tvær ólíkar rásir sem fara í gegnum sama vegg á ólíkum stöðum eru tvö gegnumtök", () => {
  const veggir: Strik[] = [[50, 0, 50, 400]];
  const a: Punktur[] = [[0, 40], [100, 40], [100, 60], [0, 60]];
  const b: Punktur[] = [[0, 300], [100, 300], [100, 320], [0, 320]];
  const r = talaGegnumtok(veggir, [a, b], []);
  assert.equal(r.length, 2);
  assert.equal(r[0].staerd, null);
});

test("taldarStaerdir og CSV", () => {
  const g = [
    { x: 1, y: 2, flatur: 0, staerd: "Ø250" },
    { x: 3, y: 4, flatur: 1, staerd: "Ø250" },
    { x: 5, y: 6, flatur: 2, staerd: null },
  ];
  assert.deepEqual(taldarStaerdir(g), [{ staerd: "Ø250", fjoldi: 2 }, { staerd: "óþekkt", fjoldi: 1 }]);
  assert.equal(gegnumtokCsv([{ nafn: "M215-01", gegnumtok: g }]).split("\n").length, 4);
});
