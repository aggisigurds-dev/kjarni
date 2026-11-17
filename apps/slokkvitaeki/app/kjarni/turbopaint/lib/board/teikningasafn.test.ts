import assert from "node:assert/strict";
import { test } from "node:test";
import { greiningSlod, hreinsaSvaedi, svaediTillogur } from "./teikningasafn";

test("greiningSlod: Greining fasteignar í Slökkvitæki-appinu, landnúmer eða heimilisfang kóðað", () => {
  assert.equal(greiningSlod(101617), "https://slokkvitaeki.netlify.app/#greining/101617");
  assert.equal(greiningSlod("Barónsstígur 18"), "https://slokkvitaeki.netlify.app/#greining/Bar%C3%B3nsst%C3%ADgur%2018");
  assert.equal(greiningSlod(null), "https://slokkvitaeki.netlify.app/#greining");
  assert.equal(greiningSlod("  "), "https://slokkvitaeki.netlify.app/#greining");
});

test("svaediTillogur: svæði í safni fyrst, svo Allt húsið og hæðir, engin tvítök", () => {
  assert.deepEqual(svaediTillogur(["Kjallari", "", null, "Barónsstígur 18 · Ris", "Kjallari"]), [
    "Kjallari",
    "Barónsstígur 18 · Ris",
    "Allt húsið",
    "1. hæð",
    "2. hæð",
    "3. hæð",
    "Ris",
  ]);
  assert.deepEqual(svaediTillogur([]).slice(0, 2), ["Allt húsið", "Kjallari"]);
});

test("hreinsaSvaedi: eitt bil, klippt við 120 stafi", () => {
  assert.equal(hreinsaSvaedi("  1.   hæð  "), "1. hæð");
  assert.equal(hreinsaSvaedi("x".repeat(200)).length, 120);
});
