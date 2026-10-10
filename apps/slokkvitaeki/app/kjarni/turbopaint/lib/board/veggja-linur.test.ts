// Greina veggi betur + „Smella á línu" (Agnar 10.10.2026, Berjavellir 6: veggir lentu á síldarbeinsparketi, húsgögnum og
// bekkjum, og „koma leiðinlega þykkir út"). Tilbúin mynd í kvarða Berjavalla (≈ 33 dílar á metra, 1:100 á A1).
import assert from "node:assert/strict";
import { test } from "node:test";
import { fellaSmaklasa, linuSnid, mynsturGrima, siaVeggi, smellaALinu, veggKjarni, VEGGUR_HAMARK_CM } from "./veggja-linur";
import { skiptaTillogum, tillagaVid, tillogurIKassa } from "./veggja-tillogur";

const DPM = 33.3;
const W = 420, H = 300;

function mynd() {
  const gra = new Uint8Array(W * H).fill(250);
  const kassi = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) gra[y * W + x] = 30;
  };
  return { gra, kassi };
}

/** Holur veggur (tvær 2-díla línur, ytri þykkt 7 díla ≈ 21 cm) með parketi (skálínur, bil 4 díla) beint undir. */
function veggurOgParket() {
  const { gra, kassi } = mynd();
  kassi(40, 100, 380, 102);
  kassi(40, 105, 380, 107);
  for (let y = 107; y < 190; y++)
    for (let x = 40; x < 380; x++) {
      // síldarbein: skálínur sem snúast við á 16 díla fresti
      const f = Math.floor(x / 16) % 2 === 0 ? (x + y) % 4 : (x - y + 400) % 4;
      if (f === 0) gra[y * W + x] = 40;
    }
  return gra;
}

test("þykktarþak: veggur sem rann saman við parket (90 cm) klippist í kjarnann milli línanna (≤ 35 cm)", () => {
  const gra = veggurOgParket();
  const r = siaVeggi([[60, 112, 360, 112, 30]], gra, W, H, { dpm: DPM });
  assert.equal(r.veggir.length, 1, JSON.stringify(r.talning));
  const [ax, ay, bx, by, t] = r.veggir[0];
  assert.ok(Math.abs(ay - 103.5) <= 1 && Math.abs(by - 103.5) <= 1, `miðlína á milli línanna: ${ay} ${by}`);
  assert.ok(t >= 6 && t <= 9, `þykkt = bilið milli ytri brúna (7): ${t}`);
  assert.ok((t / DPM) * 100 <= VEGGUR_HAMARK_CM);
  assert.ok(ax < bx);
  assert.equal(r.talning.klippt, 1);
});

test("mynstur: veggur á miðju parketi er felldur, raunverulegi veggurinn við hliðina heldur sér", () => {
  const gra = veggurOgParket();
  const grima = mynsturGrima(gra, W, H, DPM);
  assert.equal(grima[150 * W + 200], 1, "parketið er mynstur");
  assert.equal(grima[103 * W + 200], 0, "veggurinn sjálfur er ekki mynstur");
  assert.equal(grima[250 * W + 200], 0, "autt gólf er ekki mynstur");
  const r = siaVeggi(
    [
      [60, 150, 360, 150, 6],
      [60, 103, 360, 103, 7],
    ],
    gra,
    W,
    H,
    { dpm: DPM, grima }
  );
  assert.equal(r.talning.mynstur, 1);
  assert.equal(r.veggir.length, 1);
  assert.ok(Math.abs(r.veggir[0][1] - 103.5) <= 1);
});

test("ein mjó lína (bekkur / húsgagn) og slitrótt strik (letur, skástrik) verða ekki veggir; fylltur veggur heldur sér", () => {
  const { gra, kassi } = mynd();
  kassi(40, 60, 380, 61); // bekkjarbrún: 1 díll
  for (let x = 40; x < 380; x += 6) kassi(x, 120, x + 3, 124); // slitrótt: 3 dílar + 3 bil
  kassi(40, 200, 380, 207); // fylltur veggur 7 dílar ≈ 21 cm
  const r = siaVeggi(
    [
      [50, 60, 370, 60, 5],
      [50, 122, 370, 122, 5],
      [50, 203, 370, 203, 9],
    ],
    gra,
    W,
    H,
    { dpm: DPM }
  );
  assert.equal(r.talning.stakLina, 1, JSON.stringify(r.talning));
  assert.equal(r.talning.ekkiLina, 1, JSON.stringify(r.talning));
  assert.equal(r.veggir.length, 1);
  assert.ok(Math.abs(r.veggir[0][1] - 203) <= 1 && r.veggir[0][4] >= 6 && r.veggir[0][4] <= 9, String(r.veggir[0]));
});

test("halli greinds bútar leiðréttur að línunni (skönnuð teikning: bútur hallaði 7 díla á 240)", () => {
  const { gra, kassi } = mynd();
  kassi(40, 150, 380, 152);
  kassi(40, 156, 380, 158);
  const r = siaVeggi([[60, 150, 300, 157, 6]], gra, W, H, { dpm: DPM });
  assert.equal(r.veggir.length, 1, JSON.stringify(r.talning));
  const [, ay, , by] = r.veggir[0];
  assert.ok(Math.abs(ay - by) <= 1.5 && Math.abs(ay - 154) <= 1.5, `${ay} ${by}`);
});

test("þversnið og kjarni: tvær línur innan þaksins = holur veggur; breiðara bil = stakar línur", () => {
  const { gra, kassi } = mynd();
  kassi(100, 40, 102, 260);
  kassi(106, 40, 108, 260);
  const s = linuSnid(gra, W, H, [104, 50], [104, 250], 12);
  const k = veggKjarni(s, { hamark: 11.6, lagmark: 1.7 });
  assert.equal(k?.gerd, "holur");
  assert.ok(k && Math.abs(k.thykkt - 8) <= 1, String(k?.thykkt));
  const k2 = veggKjarni(s, { hamark: 4, lagmark: 1.7 });
  assert.notEqual(k2?.gerd, "holur", "8 díla bil er yfir 4 díla þaki");
});

test("litlir lokaðir klasar (borð, stólar) felldir — herbergisveggir og stubbur við langan vegg haldast", () => {
  const m = DPM;
  const borð = [
    [10, 10, 30, 10, 2],
    [30, 10, 30, 30, 2],
    [30, 30, 10, 30, 2],
    [10, 30, 10, 10, 2],
  ];
  const herbergi = [
    [100, 100, 300, 100, 6],
    [300, 100, 300, 250, 6],
    [100, 100, 100, 250, 6],
  ];
  const stubbur = [[200, 100, 200, 115, 6]];
  const ut = fellaSmaklasa([...borð, ...herbergi, ...stubbur], { tengibil: 0.12 * m, stuttur: m, klasi: 1.6 * m });
  assert.equal(ut.length, 4);
  assert.ok(!ut.some((v) => v[0] === 10 && v[1] === 10));
});

test("smella á línu: dreginn veggur festist á miðju tveggja lína og fær þykktina úr bilinu (10–35 cm)", () => {
  const { gra, kassi } = mynd();
  kassi(200, 40, 202, 260);
  kassi(206, 40, 208, 260); // ytri þykkt 8 dílar ≈ 24 cm
  const r = smellaALinu(gra, W, H, [211, 60], [211, 240], { dpm: DPM, radius: 8 });
  assert.ok(r, "smellur fannst");
  assert.ok(Math.abs(r!.A[0] - 204) <= 1 && Math.abs(r!.B[0] - 204) <= 1, `${r!.A} ${r!.B}`);
  assert.ok(r!.thykkt != null && Math.abs(r!.thykkt - 8) <= 1, String(r!.thykkt));
  assert.equal(r!.A[1], 60, "lengdin helst — aðeins hliðrun þvert á vegginn");
  // fastur endi (smellur á annan vegg) hreyfist ekki
  const f = smellaALinu(gra, W, H, [211, 60], [211, 240], { dpm: DPM, radius: 8, fastir: [true, false] });
  assert.deepEqual(f!.A, [211, 60]);
  assert.ok(Math.abs(f!.B[0] - 204) <= 1);
  // engin lína innan radíussins → ekkert smellur
  assert.equal(smellaALinu(gra, W, H, [300, 60], [300, 240], { dpm: DPM, radius: 8 }), null);
});

test("smella á línu: bil utan 10–35 cm → festist á næstu línu en VALIN þykkt gildir (thykkt = null)", () => {
  const { gra, kassi } = mynd();
  kassi(200, 40, 203, 260);
  kassi(230, 40, 233, 260); // 33 díla bil ≈ 1 m — tveir aðskildir veggir
  const r = smellaALinu(gra, W, H, [205, 60], [205, 240], { dpm: DPM, radius: 6 });
  assert.ok(r);
  assert.equal(r!.thykkt, null);
  assert.ok(Math.abs(r!.A[0] - 201.5) <= 1.5, String(r!.A));
});

test("tillögur: smellur hittir næstu tillögu, kassi velur inni / snerta, skipting heldur röðinni", () => {
  const v = [
    { p: [0, 0, 100, 0], t: 6 },
    { p: [0, 50, 100, 50], t: 6 },
    { p: [200, 0, 200, 100], t: 6, tegund: "gler" as const },
  ];
  assert.equal(tillagaVid([50, 2], v, 4), 0);
  assert.equal(tillagaVid([50, 48], v, 4), 1);
  assert.equal(tillagaVid([50, 25], v, 4), -1);
  assert.deepEqual(tillogurIKassa(v, { x: -10, y: -10, width: 120, height: 70 }, "inni"), [0, 1]);
  assert.deepEqual(tillogurIKassa(v, { x: 150, y: 40, width: 100, height: 20 }, "snerta"), [2]);
  assert.deepEqual(tillogurIKassa(v, { x: 150, y: 40, width: 100, height: 20 }, "inni"), []);
  const s = skiptaTillogum(v, [1]);
  assert.equal(s.valdar.length, 1);
  assert.deepEqual(s.eftir.map((x) => x.p[1]), [0, 0]);
});
