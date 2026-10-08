import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EIGNA_UTGAFA,
  eignarIdUrLykli,
  erFastEignarId,
  frumEignarId,
  hashSkrar,
  sha256Hex,
  skjamyndarLykill,
  skonnunarLykill,
} from "./eignalykill";

// Lifandi prófun 07.10.2026 (1404): hver opnun úttektarborðs hlóð teikningunni upp aftur sem tveimur nýjum skrám.
// Auðkennin ráðast nú af innihaldinu — sama teikning → sama auðkenni → engin ný upphleðsla.

const PDF_A = new Blob([new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55, 1, 2, 3])], { type: "application/pdf" });
const PDF_A_AFTUR = new Blob([new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55, 1, 2, 3])], { type: "application/pdf" });
const PDF_B = new Blob([new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55, 1, 2, 4])], { type: "application/pdf" });

test("sha256Hex: þekkt gildi (tómur strengur og „abc“)", async () => {
  assert.equal(await sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(await sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("sama skrá (sömu bæti) → sama frumskrá-auðkenni og sama skjámynd; önnur skrá → annað", async () => {
  const a = (await hashSkrar(PDF_A))!;
  const a2 = (await hashSkrar(PDF_A_AFTUR))!;
  const b = (await hashSkrar(PDF_B))!;
  assert.equal(a, a2);
  assert.notEqual(a, b);
  assert.equal(frumEignarId(a), frumEignarId(a2));
  assert.notEqual(frumEignarId(a), frumEignarId(b));
  const s1 = await eignarIdUrLykli(skjamyndarLykill(a, "print", 0));
  const s1aftur = await eignarIdUrLykli(skjamyndarLykill(a2, "print", 0));
  assert.equal(s1, s1aftur, "önnur opnun sama borðs → sama skjámynd");
  assert.ok(erFastEignarId(s1) && erFastEignarId(frumEignarId(a)));
  assert.ok(s1!.startsWith("h") && frumEignarId(a).startsWith("f"));
});

test("gæðastig og síða gefa ólík auðkenni (önnur mynd) — líka útgáfa innflutningsins", async () => {
  const a = (await hashSkrar(PDF_A))!;
  const ids = await Promise.all([
    eignarIdUrLykli(skjamyndarLykill(a, "print", 0)),
    eignarIdUrLykli(skjamyndarLykill(a, "standard", 0)),
    eignarIdUrLykli(skjamyndarLykill(a, "print", 1)),
  ]);
  assert.equal(new Set(ids).size, 3);
  assert.match(skjamyndarLykill(a, "print", 0), new RegExp(`\\|v${EIGNA_UTGAFA}\\|`));
});

test("skörp skönnun: slóð + gæði + fókus (skurður hæðarinnar) + stærð JPEG-sins ráða auðkenninu", async () => {
  const slod = "https://skjalasafn.reykjavik.is/fotoweb/archives/5000-A/x/2022/11/1.tif.info";
  const fokus = { x: 760, y: 14, w: 4070, h: 4236 };
  const k1 = await eignarIdUrLykli(skonnunarLykill(slod, "print", fokus, { b: 6006, h: 4295 }));
  const k1aftur = await eignarIdUrLykli(skonnunarLykill(` ${slod} `, "print", { ...fokus, x: 760.2 }, { b: 6006, h: 4295 }));
  const k2 = await eignarIdUrLykli(skonnunarLykill(slod, "print", { ...fokus, w: 3000 }, { b: 6006, h: 4295 }));
  const k3 = await eignarIdUrLykli(skonnunarLykill(slod, "print", null, { b: 6006, h: 4295 }));
  assert.equal(k1, k1aftur, "sama teikning, sami skurður (námundað) → sama auðkenni");
  assert.notEqual(k1, k2, "annar skurður → önnur hliðrun → önnur mynd");
  assert.notEqual(k1, k3);
});

test("erFastEignarId: slembi-auðkenni (newId: n…) eru ekki föst", () => {
  assert.equal(erFastEignarId("nM39EcBfGW_pWc2G5bj39-"), false);
  assert.equal(erFastEignarId("h" + "a".repeat(32)), true);
  assert.equal(erFastEignarId("f" + "0".repeat(32)), true);
  assert.equal(erFastEignarId("h" + "a".repeat(31)), false);
});
