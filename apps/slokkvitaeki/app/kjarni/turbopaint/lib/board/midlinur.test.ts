import assert from "node:assert/strict";
import { test } from "node:test";
import { midlinurUrMaska } from "./midlinur";

function maski(w: number, h: number, kassar: Array<[number, number, number, number]>) {
  const m = new Uint8Array(w * h);
  for (const [x0, y0, x1, y1] of kassar) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) m[y * w + x] = 1;
  return m;
}

test("midlinur: láréttur veggur 10 díla þykkur verður ein bein lína með þykkt ≈ 10", () => {
  const w = 200, h = 60;
  const l = midlinurUrMaska(maski(w, h, [[20, 25, 180, 35]]), w, h, { minnkun: 1 });
  assert.equal(l.length, 1);
  const [x0, y0, x1, y1] = [l[0].punktar[0], l[0].punktar[1], l[0].punktar[l[0].punktar.length - 2], l[0].punktar[l[0].punktar.length - 1]];
  assert.ok(Math.abs(y0 - 30) <= 1.5 && Math.abs(y1 - 30) <= 1.5, `miðja y≈30: ${y0}, ${y1}`);
  assert.ok(Math.min(x0, x1) < 35 && Math.max(x0, x1) > 165, "nær næstum enda á milli");
  assert.equal(l[0].punktar.length, 4, "bein lína = tveir punktar");
  assert.ok(l[0].thykkt >= 8 && l[0].thykkt <= 12, "þykkt " + l[0].thykkt);
});

test("midlinur: L-veggur verður ein brotalína (horn, ekki tvær línur + angi)", () => {
  const w = 200, h = 200;
  const l = midlinurUrMaska(maski(w, h, [[20, 20, 180, 30], [20, 20, 30, 180]]), w, h, { minnkun: 1 });
  assert.equal(l.length, 1, "fjöldi lína: " + l.length);
  assert.ok(l[0].punktar.length / 2 >= 3, "hornpunktur til staðar");
});

test("midlinur: T-mót gefa þrjá arma sem mætast í einum punkti", () => {
  const w = 200, h = 200;
  const l = midlinurUrMaska(maski(w, h, [[20, 20, 180, 30], [95, 20, 105, 180]]), w, h, { minnkun: 1 });
  assert.equal(l.length, 3, "þrír armar: " + l.length);
  const langir = l.filter((x) => x.lengd > 50);
  assert.equal(langir.length, 3);
});

test("midlinur: minnkun 2 heldur hnitum í upprunalegri upplausn", () => {
  const w = 400, h = 100;
  const l = midlinurUrMaska(maski(w, h, [[40, 40, 360, 60]]), w, h, { minnkun: 2 });
  assert.equal(l.length, 1);
  const ys = l[0].punktar.filter((_, i) => i % 2 === 1);
  for (const y of ys) assert.ok(Math.abs(y - 50) <= 2, "y≈50: " + y);
  assert.ok(l[0].thykkt >= 16 && l[0].thykkt <= 24, "þykkt " + l[0].thykkt);
});

test("midlinur: stakur smáblettur dettur út með lágmarkslengd", () => {
  const w = 200, h = 100;
  const l = midlinurUrMaska(maski(w, h, [[20, 40, 180, 50], [100, 80, 106, 86]]), w, h, { minnkun: 1, lagmarksLengd: 30 });
  assert.equal(l.length, 1);
});
