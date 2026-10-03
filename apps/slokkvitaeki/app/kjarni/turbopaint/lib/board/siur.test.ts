import assert from "node:assert/strict";
import { test } from "node:test";
import { flokkaDila, opna, siaRgba, sjalfgefinVeggthykkt, SJALFGEFIN_SIA, teljaFlokka } from "./siur";

const W = 60, H = 40;

/** Hvít mynd með: þykkum vegg (8 px, x 5–12), þunnri línu (1 px, x 30), rauðum reit og bleikum reit. */
function teikning(): Uint8ClampedArray {
  const d = new Uint8ClampedArray(W * H * 4).fill(255);
  const lita = (x: number, y: number, r: number, g: number, b: number) => {
    const i = (y * W + x) * 4; d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
  };
  for (let y = 2; y < 38; y++) {
    for (let x = 5; x < 13; x++) lita(x, y, 20, 20, 20);   // veggur
    lita(30, y, 30, 30, 30);                                 // þunn lína
  }
  for (let y = 5; y < 15; y++) for (let x = 40; x < 50; x++) lita(x, y, 220, 30, 40);    // rautt
  for (let y = 25; y < 35; y++) for (let x = 40; x < 50; x++) lita(x, y, 220, 80, 200);  // bleikt
  return d;
}
const dill = (d: Uint8ClampedArray, x: number, y: number) => {
  const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]];
};

test("flokkaDila: blek, rautt og bleikt aðgreint; hvítt er bakgrunnur", () => {
  const f = flokkaDila(teikning(), 0.62);
  assert.equal(f[20 * W + 8], 1);
  assert.equal(f[20 * W + 30], 1);
  assert.equal(f[10 * W + 45], 2);
  assert.equal(f[30 * W + 45], 3);
  assert.equal(f[20 * W + 20], 0);
});

test("flokkaDila: skönnuð ÚT-ör (dökk fjólurauð, 332°) er rauð — ljósbleik skýjalína er bleik", () => {
  const d = new Uint8ClampedArray([150, 20, 80, 255, 230, 110, 200, 255, 200, 140, 180, 255, 60, 62, 58, 255]);
  const f = flokkaDila(d, 0.62);
  assert.equal(f[0], 2);
  assert.equal(f[1], 3);
  assert.equal(f[2], 3, "dauf skýjalína (mettun 0,3) er bleik, ekki svart blek");
  assert.equal(f[3], 1, "dökkgrátt skannað blek er blek");
});

test("opna: þykkur veggur stendur, 1 px lína hverfur", () => {
  const f = flokkaDila(teikning(), 0.62);
  const blek = Uint8Array.from(f, (v) => (v === 1 ? 1 : 0));
  const o = opna(blek, W, H, 5);
  assert.equal(o[20 * W + 8], 1, "miðja veggjar");
  assert.equal(o[20 * W + 5], 1, "brún veggjar heldur sér eftir útþenslu");
  assert.equal(o[20 * W + 30], 0, "þunna línan hverfur");
});

test("siaRgba: bara veggir — þunna línan og litirnir verða hvítir", () => {
  const ut = siaRgba(teikning(), W, H, { ...SJALFGEFIN_SIA, veggir: true, thunnt: false, rautt: false, bleikt: false, veggthykkt: 5 });
  assert.deepEqual(dill(ut, 8, 20), [0, 0, 0], "veggurinn (20,20,20) verður svartur eftir levels");
  assert.deepEqual(dill(ut, 30, 20), [255, 255, 255]);
  assert.deepEqual(dill(ut, 45, 10), [255, 255, 255]);
  assert.deepEqual(dill(ut, 45, 30), [255, 255, 255]);
});

test("siaRgba: veggir + rautt — rautt heldur upprunalegum lit, bleikt hverfur", () => {
  const ut = siaRgba(teikning(), W, H, { ...SJALFGEFIN_SIA, veggir: true, thunnt: false, rautt: true, bleikt: false, veggthykkt: 5 });
  assert.deepEqual(dill(ut, 45, 10), [220, 30, 40]);
  assert.deepEqual(dill(ut, 45, 30), [255, 255, 255]);
});

test("siaRgba: bara þunnt blek — veggurinn hverfur, línan stendur", () => {
  const ut = siaRgba(teikning(), W, H, { ...SJALFGEFIN_SIA, veggir: false, thunnt: true, veggthykkt: 5 });
  assert.deepEqual(dill(ut, 8, 20), [255, 255, 255]);
  assert.deepEqual(dill(ut, 30, 20), [0, 0, 0]);
});

test("siaRgba heldur millitónum: grá brún (130) helst grá, pappír (235) verður hvítur", () => {
  const d = new Uint8ClampedArray([130, 130, 130, 255, 235, 235, 232, 255]);
  const ut = siaRgba(d, 2, 1, { ...SJALFGEFIN_SIA, veggir: true, thunnt: true, veggthykkt: 3 });
  assert.ok(ut[0] > 60 && ut[0] < 200, "millitónn á brún: " + ut[0]);
  assert.equal(ut[4], 255);
});

test("teljaFlokka og sjálfgefin veggþykkt", () => {
  const t = teljaFlokka(teikning(), W, H, { ...SJALFGEFIN_SIA, veggthykkt: 5 });
  assert.equal(t.rautt, 100);
  assert.equal(t.bleikt, 100);
  assert.equal(t.veggir, 8 * 36);
  assert.equal(t.thunnt, 36);
  assert.equal(sjalfgefinVeggthykkt(7478), 7);
  assert.equal(sjalfgefinVeggthykkt(800), 3);
});
