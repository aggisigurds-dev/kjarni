import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  fjold,
  GLYFF,
  GLYFF_NOFN,
  grunnStaerdHaedar,
  klemmaStaerd,
  LITIR,
  liturLykils,
  lykillFyrir,
  MERKJASAFN,
  rotGradur,
  SJALF,
  staerdABordi,
  staerdUrBordi,
  STIMPIL_LYKILL,
  STIMPLAR,
  TAEKI_TAKN,
} from "./merkjasafn";
import { getSymbol, TEIKNING_SYMBOLS } from "./symbols";
import {
  merkiIBord,
  stimpillFyrirTakn,
  symbolFyrirMerki,
  symbolFyrirStimpil,
  symbolFyrirTegund,
  taknFyrirMerki,
  taknIMerki,
  TEIKNING_STIMPLAR,
  uppfaeraHaedir,
  type UttektHaed,
} from "./uttekt";

/* Frumrit merkjasafnsins er í slokkvitaeki-repóinu (433/434). Sé það á vélinni er safnið hér borið saman við það —
 * breytist Teikning-glugginn fellur prófið og segir hvað fór úr takti. Annars sleppt (t.d. í CI án systur-repósins). */
const REPO =
  process.env.SLOKKVITAEKI_REPO ||
  join(dirname(fileURLToPath(import.meta.url)), "../../../../../../../../slokkvitaeki");
const P433 = join(REPO, "js/patches/433-teikning-merking.js");
const P434 = join(REPO, "js/patches/434-teikning-takn.js");
const fruminn = existsSync(P433) && existsSync(P434);

/** `const NAFN = [ … ];` / `{ … };` úr frumkóðanum → gildið (svigar taldir; athugasemdir leyfðar). */
function lesaFasta(kodi: string, nafn: string): unknown {
  const i = kodi.indexOf(`const ${nafn} = `);
  assert.ok(i >= 0, `${nafn} fannst ekki`);
  let j = i + `const ${nafn} = `.length;
  const opn = kodi[j];
  const loka = opn === "[" ? "]" : "}";
  let d = 0;
  let k = j;
  for (; k < kodi.length; k++) {
    if (kodi[k] === opn) d++;
    else if (kodi[k] === loka && --d === 0) break;
  }
  return new Function("return " + kodi.slice(j, k + 1))();
}

test("merkjasafnið er nákvæmlega safn Teikning-gluggans (433 STIMPLAR/TAEKI_TAKN, 434 GLYFF/SJALF/LITIR/STIMPIL_LYKILL)", { skip: !fruminn && "slokkvitaeki-repóið er ekki á vélinni" }, () => {
  const k433 = readFileSync(P433, "utf8");
  const k434 = readFileSync(P434, "utf8");
  assert.deepEqual(STIMPLAR, lesaFasta(k433, "STIMPLAR"));
  assert.deepEqual(TAEKI_TAKN, lesaFasta(k433, "TAEKI_TAKN"));
  assert.deepEqual(GLYFF, lesaFasta(k434, "GLYFF"));
  assert.deepEqual(GLYFF_NOFN, lesaFasta(k434, "GLYFF_NOFN"));
  assert.deepEqual(SJALF, lesaFasta(k434, "SJALF"));
  assert.deepEqual(LITIR, lesaFasta(k434, "LITIR"));
  assert.deepEqual(STIMPIL_LYKILL, lesaFasta(k434, "STIMPIL_LYKILL"));
});

test("segulloki er í safninu: SG, Segulloki, segull-glyff, tákn teikn:segull", () => {
  const sg = STIMPLAR.find((s) => s.id === "segull")!;
  assert.deepEqual(sg, { id: "segull", nafn: "Segulloki", stutt: "SG", litur: "#c93c1d", glyff: "magnet" });
  const f = MERKJASAFN.find((x) => x.lykill === "segull")!;
  assert.equal(f.symbolId, "teikn:segull");
  assert.equal(f.glyff, "magnet");
  assert.equal(getSymbol("teikn:segull").name, "Segulloki");
  assert.equal(getSymbol("teikn:segull").short, "SG");
  assert.equal(symbolFyrirStimpil("segull"), "teikn:segull");
  assert.equal(stimpillFyrirTakn("teikn:segull"), "segull");
  assert.ok(TEIKNING_STIMPLAR.some((s) => s.id === "segull" && s.symbolId === "teikn:segull"));
});

test("hvert merki fer 1:1 fram og til baka: sign → tákn → sign (öll tíu), og hvert merki á sitt eigið tákn", () => {
  const takn = new Set<string>();
  for (const s of STIMPLAR) {
    const id = symbolFyrirStimpil(s.id);
    takn.add(id);
    assert.equal(stimpillFyrirTakn(id), s.id, s.id);
    assert.equal(getSymbol(id).name, s.nafn, s.id);
    assert.equal(getSymbol(id).short, s.stutt, s.id);
    // merki sem appið skrifaði → tákn → sama merki
    assert.equal(symbolFyrirMerki({ unitId: `s:${s.id}:x`, x: 1, y: 1, kind: "sign", sign: s.id }), id);
  }
  assert.equal(takn.size, STIMPLAR.length, "NÚ og ÚT, reyk- og hitaskynjari eiga hvert sitt tákn");
});

test("fjold er sama fall og í 434 (keyrt á frumkóðanum)", { skip: !fruminn && "slokkvitaeki-repóið er ekki á vélinni" }, () => {
  const k434 = readFileSync(P434, "utf8");
  const i = k434.indexOf("function fjold(u) {");
  assert.ok(i >= 0, "fjold fannst ekki í 434");
  let d = 0, k = k434.indexOf("{", i);
  for (; k < k434.length; k++) {
    if (k434[k] === "{") d++;
    else if (k434[k] === "}" && --d === 0) break;
  }
  const frum = new Function("return " + k434.slice(i, k + 1))() as (u: { type: string }) => string;
  for (const t of ["Léttvatn", "ABC Duft", "Duft", "CO2", "CO₂", "CO₂ 5kg", "Kolsýra", "Brunaslanga", "Slönguskápur", "Slöngukefli", "Reykskynjari", "Eldvarnarteppi", "Óþekkt", "Froða ABF", ""]) {
    assert.equal(fjold(t), frum({ type: t }), t);
  }
});

test("tækjategundir: sama regla og Teikning (434 fjold), nöfn og stuttheiti Teikning-gluggans", () => {
  assert.equal(fjold("Léttvatn"), "lettvatn");
  assert.equal(fjold("ABC Duft"), "duft");
  assert.equal(fjold("Duft"), "duft");
  assert.equal(fjold("CO2"), "co2");
  assert.equal(fjold("Brunaslanga"), "slanga");
  assert.equal(fjold(null), "annad");
  assert.equal(symbolFyrirTegund("Léttvatn"), "teikn:lettvatn");
  assert.equal(symbolFyrirTegund("CO2"), "teikn:co2");
  assert.equal(symbolFyrirTegund("Brunaslanga"), "teikn:slanga");
  // NFKD (06.10.2026): lækkað ₂ og ö → o
  assert.equal(fjold("CO₂ 5kg"), "co2");
  assert.equal(fjold("CO₂"), "co2");
  assert.equal(fjold("Slönguskápur"), "slanga");
  assert.equal(symbolFyrirTegund("CO₂ 5kg"), "teikn:co2");
  assert.equal(symbolFyrirTegund("Slönguskápur"), "teikn:slanga");
  // Það sem Teikning-glugginn les sem „annað" er líka annað hér — svo sama tækið líti eins út í báðum.
  for (const t of ["Reykskynjari", "Eldvarnarteppi", "Óþekkt"]) {
    assert.equal(fjold(t), "annad", t);
    assert.equal(symbolFyrirTegund(t), "teikn:annad", t);
  }
  assert.deepEqual(
    MERKJASAFN.filter((f) => f.flokkur === "taeki").map((f) => [f.nafn, f.stutt]),
    [["Léttvatn", "LÉ"], ["Duft", "DF"], ["CO₂", "CO"], ["Slanga", "SL"], ["Annað tæki", "TÆ"]]
  );
  // `takn` sem notandinn valdi í Teikning ræður (434 lykillFyrir)
  assert.equal(lykillFyrir({ unitId: 1, takn: "duft" }, "Léttvatn"), "duft");
  assert.equal(lykillFyrir({ unitId: 1, takn: "reykskynjari" }, "Reykskynjari"), "reykskynjari");
});

test("litir eins og 434: hvítur kútur með borða tegundar; color merkis ræður nema á léttvatni/dufti/CO₂", () => {
  assert.deepEqual(liturLykils("lettvatn"), { bg: "#e11d2e", fg: "#fff", band: "#14b8a6" });
  assert.equal(liturLykils("duft").band, "#2563eb");
  assert.equal(liturLykils("co2").horn, true);
  assert.equal(liturLykils("lettvatn", "#000000").bg, "#e11d2e");
  assert.equal(liturLykils("hose", "#c93c1d").bg, "#c93c1d");
  // nýtt merki fær lit stimpilsins (433 setjaStimpil: color = def.litur)
  assert.equal(MERKJASAFN.find((f) => f.lykill === "ut")!.litur.bg, "#15803d");
  assert.equal(MERKJASAFN.find((f) => f.lykill === "rafmagn")!.litur.fg, "#1c1917");
  assert.equal(TEIKNING_SYMBOLS.length, MERKJASAFN.length);
});

test("brunahnappur, brunaslanga sem tæki og neyðarljós eru aukatákn TurboPaint — engin nálgun yfir í merki", () => {
  assert.equal(stimpillFyrirTakn("alarm"), null);
  assert.equal(stimpillFyrirTakn("hose"), null);
  assert.equal(stimpillFyrirTakn("e-light"), null);
  assert.equal(stimpillFyrirTakn("teikn:lettvatn"), null, "tækjategund er ekki merki");
  assert.equal(stimpillFyrirTakn("teikn:annad"), null);
  // eldri tákn sem eru NÁKVÆMLEGA sama merkið
  assert.equal(stimpillFyrirTakn("exit"), "neyðarútgangur");
  assert.equal(stimpillFyrirTakn("electric"), "rafmagn");
  assert.equal(stimpillFyrirTakn("detector"), "reykskynjari");
});

test("snúningur (rot) og eigin stærð (staerd) sjást á borðinu og fara óbreytt fram og til baka", () => {
  const mynd = { id: "m", x: 0, y: 0, width: 1000, height: 1000 };
  const frum = { b: 2000, h: 2000 };
  const m = { unitId: "s:ut:abc", x: 800, y: 600, kind: "sign", sign: "ut", color: "#15803d", rot: 90, staerd: 52 };
  const s = taknFyrirMerki(m, [], mynd, frum, 40, 26);
  assert.equal(s.symbolId, "teikn:ut");
  assert.equal(s.rotation, 90);
  assert.equal(s.size, 80, "staerd 52 á hæð með stimpilStaerd 26 = tvöföld stærð");
  assert.equal(s.label, "", "merki fá enga stafi, eins og í Teikning");
  // miðjan helst á staðnum þótt tákninu sé snúið
  assert.deepEqual(taknIMerki(s, mynd, frum), { x: 800, y: 600 });
  for (const rot of [0, 33, 90, 180, 271]) {
    const p = merkiIBord({ x: 1234, y: 567 }, mynd, frum, 40, rot);
    assert.deepEqual(taknIMerki({ ...p, size: 40, rotation: rot }, mynd, frum), { x: 1234, y: 567 }, `rot ${rot}`);
  }
  // óbreytt tákn → merkið óbreytt (rot/staerd ósnert)
  const haedir: UttektHaed[] = [{ id: "a", markers: [m] }];
  const u0 = uppfaeraHaedir(haedir, "a", new Map([["s:ut:abc", { x: 800, y: 600, unitId: "s:ut:abc", kind: "sign", sign: "ut", rot: 90 }]]));
  assert.deepEqual(u0.haedir[0].markers, [m]);
  assert.equal(u0.breytt, 0);
  // snúið í 180 og stækkað → rot og staerd skrifast
  const u1 = uppfaeraHaedir(haedir, "a", new Map([["s:ut:abc", { x: 800, y: 600, unitId: "s:ut:abc", kind: "sign", sign: "ut", rot: 180, staerd: 78 }]]));
  assert.deepEqual(u1.haedir[0].markers![0], { ...m, rot: 180, staerd: 78 });
  assert.equal(u1.breytt, 1);
});

test("stærð: viðmið hæðarinnar og klemming eins og 433 (24–160)", () => {
  assert.equal(grunnStaerdHaedar({ stimpilStaerd: 26 }), 26);
  assert.equal(grunnStaerdHaedar({}), 56);
  assert.equal(klemmaStaerd(500), 160);
  assert.equal(klemmaStaerd(3), 24);
  assert.equal(klemmaStaerd(undefined), 0);
  assert.equal(staerdABordi({}, 110, 26), 110);
  assert.equal(staerdABordi({ staerd: 39 }, 110, 26), 165);
  assert.equal(staerdUrBordi(165, 110, 26), 39);
  assert.equal(rotGradur(-90), 270);
  assert.equal(rotGradur(450.4), 90);
});
