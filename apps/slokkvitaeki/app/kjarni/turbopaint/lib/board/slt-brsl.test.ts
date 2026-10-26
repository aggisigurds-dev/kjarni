import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type { OcrWord } from "./firewall-rating";
import { aetlaSltBrsl, erSkyringarOrd, finnaHring, hnitABord, ordTegundir, skiltiUrOrdum, sltBrslOrd, sltBrslStadir, type Blek } from "./slt-brsl";
import { TaekjaSjodur } from "./sjalftenging";
import type { BoardObject, SymbolObject } from "./types";

const ord = (text: string, x: number, y: number, confidence = 90, width = 64, height = 20): OcrWord => ({
  text,
  x,
  y,
  width,
  height,
  confidence,
  vertical: false,
});

test("ordTegundir: BRSL og SLT, líka með OCR-villum (8RSL, BR5L, SL1, 5LT) og saman („BRSL | SLT“)", () => {
  assert.deepEqual(ordTegundir("BRSL"), [{ tegund: "brsl", sterkt: true }]);
  assert.deepEqual(ordTegundir("SLT"), [{ tegund: "slt", sterkt: true }]);
  for (const t of ["8RSL", "BR5L", "8R5L", "BRS1", "BRSI", "BRS", "brsl."]) {
    assert.equal(ordTegundir(t)[0]?.tegund, "brsl", t);
  }
  for (const t of ["SL1", "5LT", "SLI", "$LT", "5L1", "SL7"]) assert.equal(ordTegundir(t)[0]?.tegund, "slt", t);
  assert.equal(ordTegundir("8RSL")[0].sterkt, false, "OCR-villa er veik vísbending");
  assert.deepEqual(ordTegundir("BRSL|SLT").map((x) => x.tegund), ["brsl", "slt"]);
  assert.deepEqual(ordTegundir("BRSL/SLT").map((x) => x.tegund), ["brsl", "slt"]);
  assert.deepEqual(ordTegundir("BRSLSLT").map((x) => x.tegund), ["brsl", "slt"]);
  // ekki SLT/BRSL
  for (const t of ["EI-60", "SLÖKKVITÆKI", "SALT", "R60", "SLOT", "BRUSA", "BR", "S", "sfaslitovars!", "300M", "3M", "BOX", "UTAN"]) {
    assert.deepEqual(ordTegundir(t), [], t);
  }
  // 15.10.2026 (Trönuhraun 10): slöngulengd við keflið, björgunarop, flóttaleið
  assert.deepEqual(ordTegundir("30m"), [{ tegund: "brsl", sterkt: false, metri: true }]);
  assert.deepEqual(ordTegundir("25 m"), [{ tegund: "brsl", sterkt: false, metri: true }]);
  // 26.10.2026 (Bríetartún 9, Höfðatorg): „HST = Handslökkvitæki", „BS = Brunaslanga" í skýringum blaðsins
  assert.deepEqual(ordTegundir("HST"), [{ tegund: "slt", sterkt: true }]);
  assert.deepEqual(ordTegundir("H5T"), [{ tegund: "slt", sterkt: false }]);
  assert.deepEqual(ordTegundir("BS"), [{ tegund: "brsl", sterkt: false, metri: true }], "BS gildir aðeins með hring keflisins");
  assert.deepEqual(ordTegundir("BS2"), [{ tegund: "brsl", sterkt: false, metri: true }]);
  for (const t of ["HSTA", "BSA", "BSI", "HST-1X", "ABS"]) assert.deepEqual(ordTegundir(t), [], t);
  assert.deepEqual(ordTegundir("BO"), [{ tegund: "bo", sterkt: true }]);
  assert.deepEqual(ordTegundir("ÚT"), [{ tegund: "ut", sterkt: true }]);
  assert.deepEqual(ordTegundir("UT"), [{ tegund: "ut", sterkt: true }]);
});

test("sltBrslOrd: vissa — rétt stafsett orð frá 20 %, OCR-villur frá 50 %; utan hússins / titilreits sleppt; tvítekning", () => {
  const mynd = { b: 7000, h: 5000 };
  const w = [
    ord("BRSL", 1000, 1000, 29), // rétt stafsett, lág vissa → með
    ord("8RSL", 2000, 1000, 45), // OCR-villa, lág vissa → ekki
    ord("5LT", 3000, 1000, 60), // OCR-villa, næg vissa → með
    ord("SLT", 6500, 4500, 95), // titilreitur (neðst til hægri) → ekki
    ord("BRSL", 1003, 1001, 80), // sama orð úr öðrum lestri → einu sinni
    ord("SLT", 1000, 1000, 10), // of lág vissa
  ];
  const o = sltBrslOrd(w, mynd);
  assert.deepEqual(o.map((x) => `${x.tegund}@${Math.round(x.x)}`).sort(), ["brsl@1035", "slt@3032"]);
  // svæði hússins ræður þegar það er gefið
  const s = sltBrslOrd(w, mynd, { x0: 0, y0: 0, x1: 1500, y1: 1500 });
  assert.deepEqual(s.map((x) => x.tegund), ["brsl"]);
});

/** Blekgríma úr prófunargögnunum (bútar raunverulegu teikningarinnar, Álfaborg 1. hæð). */
function alfaborg() {
  const f = JSON.parse(readFileSync(join(__dirname, "fixtures", "alfaborg-1haed-slt-brsl.json"), "utf8")) as {
    mynd: { b: number; h: number };
    ocr: { w: number; h: number; kvardi: number };
    reitir: { x: number; y: number; w: number; h: number; bitar: string }[];
    ord: OcrWord[];
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

// Miðjur slöngukeflanna (spíralanna) á Álfaborg 1. hæð, lesnar af myndinni (dílar myndar 7478 × 5349) — teikning-
// greining/slt_brsl/greining/crops.
const KEFLI = [
  { x: 4457, y: 785 }, // við BRSL 4432,846
  { x: 1621, y: 1735 }, // BRSL SLT 1601,1795
  { x: 1580, y: 2410 }, // BRSL 1555,2466 (SLT ólesið)
  { x: 4297, y: 2477 }, // BRSL / SLT 4267,2534
  { x: 1625, y: 3045 }, // BRSL SLT 1603,2968 („Ný aksturhurð")
  { x: 1757, y: 3585 }, // BRSL 1730,3509
  { x: 4165, y: 4542 }, // SLT BRSL 4140,4467
  { x: 3865, y: 272 }, // BRSL | SLT 3827,170 (29 % vissa, strikalína í gegnum keflið)
];

test("finnaHring: finnur slöngukeflið við hvert BRSL á Álfaborg 1. hæð (raunveruleg skönnun) — á tákninu, ekki textanum", () => {
  const a = alfaborg();
  const brsl = sltBrslOrd(a.ord, a.mynd).filter((o) => o.tegund === "brsl");
  assert.equal(brsl.length, 8);
  for (const o of brsl) {
    const h = finnaHring(a.blek, o.x, o.y, o.h);
    assert.ok(h, `tákn fannst við BRSL ${Math.round(o.x)},${Math.round(o.y)}`);
    const n = KEFLI.reduce((m, k) => Math.min(m, Math.hypot(k.x - h!.x, k.y - h!.y)), Infinity);
    // keflið er ~80 dílar í þvermál (+ ör); miðjan innan 25 dílar ≈ 0,3 m í 1:100
    assert.ok(n < 25, `miðja táknsins ${Math.round(h!.x)},${Math.round(h!.y)} er ${Math.round(n)} dílar frá keflinu`);
    // og EKKI á textanum: textinn er 60–100 dílar frá keflinu
    assert.ok(Math.hypot(h!.x - o.x, h!.y - o.y) > 40, "staðurinn er táknið, ekki textinn");
  }
});

test("finnaHring: ekkert tákn við SLT sem stendur eitt, né við R60 (súla + málsetning + texti er ekki hringur)", () => {
  const a = alfaborg();
  const prof = sltBrslOrd(a.ord, a.mynd).filter((o) => o.tegund === "slt" && [4862, 1579, 3959].includes(Math.round(o.x)));
  assert.equal(prof.length, 3);
  const r60 = a.ord.filter((w) => w.text === "R60").map((w) => ({ x: w.x + w.width / 2, y: w.y + w.height / 2, h: w.height }));
  for (const o of [...prof, ...r60]) {
    const h = finnaHring(a.blek, o.x, o.y, o.h);
    assert.equal(h, null, `${Math.round(o.x)},${Math.round(o.y)} gaf tákn ${JSON.stringify(h)}`);
  }
});

test("sltBrslStadir: Álfaborg 1. hæð — 8 slöngukefli (BRSL) og 3 SLT ein; SLT við kefli fer á keflið", () => {
  const a = alfaborg();
  const s = sltBrslStadir(sltBrslOrd(a.ord, a.mynd), a.blek);
  const kefli = s.filter((x) => x.brsl);
  const ein = s.filter((x) => !x.brsl && x.slt);
  assert.equal(kefli.length, 8, JSON.stringify(s.map((x) => [Math.round(x.x), Math.round(x.y), x.brsl, x.slt, x.ord])));
  assert.ok(kefli.every((k) => k.takn), "hvert BRSL er á tákni");
  for (const k of KEFLI) assert.ok(kefli.some((x) => Math.hypot(x.x - k.x, x.y - k.y) < 25), `kefli við ${k.x},${k.y}`);
  assert.equal(ein.length, 3, "SLT án kefils: 4839,4060 · 1556,4575 · 3936,1868");
  // SLT-orðin sem OCR las við keflin fóru á keflis-staðinn (ekki sér staður)
  assert.equal(kefli.filter((x) => x.slt).length, 4);
  assert.ok(kefli.filter((x) => x.slt).every((x) => x.sltVid && Math.hypot(x.sltVid.x - x.x, x.sltVid.y - x.y) < 140));
  assert.equal(s.length, 11, "enginn staður úr R60 / ruslorðum");
});

test("sltBrslStadir án blekgrímu: staðirnir eru textinn, SLT við BRSL-texta fer á sama stað", () => {
  const o = sltBrslOrd([ord("BRSL", 1000, 1000), ord("SLT", 1100, 1000), ord("SLT", 3000, 3000)], { b: 7000, h: 5000 });
  const s = sltBrslStadir(o, null);
  assert.equal(s.length, 2);
  assert.ok(s[0].brsl && s[0].slt && !s[0].takn);
  assert.ok(!s[1].brsl && s[1].slt);
});

/* ── Tenging við óstaðsett tæki ─────────────────────────────────────────────────────────────────────────────── */

const TAEKI = [
  { id: 8214, serial: "AE-00009", type: "Léttvatn", status: "loaned" },
  { id: 8218, serial: "AE-00013", type: "ABC Duft", status: "active" },
  { id: 8219, serial: "AE-00014", type: "CO2", status: "active" },
  { id: 8220, serial: "AE-00015", type: "CO2", status: "active" },
  { id: 8223, serial: "AE-00018", type: "Brunaslanga", status: "active" },
  { id: 8224, serial: "AE-00019", type: "Brunaslanga", status: "active" },
  { id: 8225, serial: "AE-00020", type: "Brunaslanga", status: "urelt" },
];

function takn(id: string, symbolId: string, cx: number, cy: number, extra: Partial<SymbolObject> = {}): SymbolObject {
  return { id, type: "symbol", symbolId, x: cx - 10, y: cy - 10, size: 20, label: "", rotation: 0, opacity: 1, locked: false, hidden: false, name: id, ...extra };
}

test("aetlaSltBrsl: hver staður tengist ÓSTAÐSETTU tæki af réttri tegund, eitt af öðru; of fá → ótengt", () => {
  const stadir = [
    { x: 100, y: 100, brsl: true, slt: true, takn: { x: 100, y: 100, r: 12, lokun: 1 }, sltVid: { x: 130, y: 100 }, ord: [] },
    { x: 400, y: 100, brsl: true, slt: false, takn: null, sltVid: null, ord: [] },
    { x: 700, y: 100, brsl: true, slt: true, takn: null, sltVid: { x: 700, y: 100 }, ord: [] },
    { x: 1000, y: 100, brsl: false, slt: true, takn: null, sltVid: { x: 1000, y: 100 }, ord: [] },
  ];
  // 8214 (léttvatn) er þegar á hæð; 8218 (duft) er á annarri hæð; 8225 er úrelt
  const haedir = [{ id: "h1", markers: [{ unitId: 8214, x: 1, y: 1 }] }, { id: "h2", markers: [{ unitId: 8218, x: 1, y: 1 }] }];
  const objects: BoardObject[] = [takn("t8214", "teikn:lettvatn", 5000, 5000, { uttektUnitId: 8214 })];
  const sjodur = new TaekjaSjodur(TAEKI, new Set(["8214", "8218"]));
  const a = aetlaSltBrsl(stadir, objects, { staerd: 20, seiling: 40, sjodur });
  const brsl = a.taeki.filter((t) => t.hvad === "brsl");
  const slt = a.taeki.filter((t) => t.hvad === "slt");
  assert.deepEqual(brsl.map((t) => t.taeki?.id ?? null), [8223, 8224, null], "tvær slöngur lausar (8225 úrelt) → þriðja ótengd");
  assert.deepEqual(slt.map((t) => t.taeki?.id ?? null), [8219, 8220, null], "SLT: CO2 laus (léttvatn/duft staðsett) → svo ótengt");
  assert.deepEqual(slt.map((t) => t.tegund), ["co2", "co2", "lettvatn"]);
  // aldrei sama tæki tvisvar
  const ids = a.taeki.flatMap((t) => (t.taeki ? [t.taeki.id] : []));
  assert.equal(new Set(ids).size, ids.length);
  void haedir;
  // slangan á tákninu sjálfu; SLT við hliðina í átt að SLT-textanum, innan seilingar
  assert.deepEqual([brsl[0].x, brsl[0].y], [100, 100]);
  assert.ok(slt[0].x > 100 && Math.hypot(slt[0].x - 100, slt[0].y - 100) <= 40);
});

test("aetlaSltBrsl: tæki sem er þegar við staðinn (handvirkt eða fyrri lestur) þjónar honum — engin tvítekning", () => {
  const stadir = [
    { x: 100, y: 100, brsl: true, slt: true, takn: null, sltVid: { x: 100, y: 100 }, ord: [] },
    { x: 400, y: 100, brsl: true, slt: false, takn: null, sltVid: null, ord: [] },
  ];
  const objects: BoardObject[] = [
    takn("a", "teikn:slanga", 110, 105), // ótengd slanga við fyrsta staðinn (t.d. sett í fyrri lestri)
    takn("b", "teikn:lettvatn", 95, 100, { uttektUnitId: 8214 }), // tengt léttvatn við sama stað
    takn("c", "teikn:rafmagn", 400, 100, { uttektUnitId: "s:rafmagn:x", uttektKind: "sign", uttektSign: "rafmagn" }), // stimpill ≠ slanga
  ];
  const sjodur = new TaekjaSjodur(TAEKI, new Set(["8214"]));
  const a = aetlaSltBrsl(stadir, objects, { staerd: 20, seiling: 40, sjodur, taekiEftirId: new Map(TAEKI.map((t) => [String(t.id), t])) });
  assert.deepEqual(a.fyrir.map((f) => `${f.hvad}${f.stadur}`), ["brsl0", "slt0"]);
  assert.deepEqual(a.taeki.map((t) => `${t.hvad}${t.stadur}:${t.taeki?.id}`), ["brsl1:8223"]);
  // endurkeyrsla með tækjunum sem bættust við: ekkert nýtt
  const eftir = [...objects, takn("n", "teikn:slanga", 400, 100, { uttektUnitId: 8223 })];
  const b = aetlaSltBrsl(stadir, eftir, { staerd: 20, seiling: 40, sjodur: new TaekjaSjodur(TAEKI, new Set(["8214", "8223"])) });
  assert.equal(b.taeki.length, 0);
});

/* ── Á borðið: hreinsun, endurkeyrsla, drægi ────────────────────────────────────────────────────────────────── */

test("beitaSltBrsl: eldri 165.BR1-merki fara (líka utan blaðsins), tækin koma; endurkeyrsla tvítekur ekkert; drægi aðeins ef beðið", async () => {
  const { beitaSltBrsl } = await import("./slt-brsl-bord");
  const plan = {
    id: "m1", type: "image" as const, assetId: "a", x: 0, y: 880, width: 2379, height: 1702, rotation: 0, opacity: 1, locked: false, hidden: false, name: "1. hæð",
  };
  // gamla útgáfan: 165.BR1-tákn og 25 m þekjuhringir 3,14× of langt frá horni myndarinnar (utan blaðsins)
  const gamalt: BoardObject[] = [
    takn("g1", "hose", 1587, 3356, { name: "165.BR1 BRSL-1", parentId: "m1" }),
    { id: "g2", type: "ellipse", x: 994, y: 3148, width: 1417, height: 1417, fill: "#f00", stroke: "#f00", strokeWidth: 2, rotation: 0, opacity: 0.7, locked: true, hidden: false, name: "165.BR1 þekja 25 m · SLT-1", parentId: "m1" },
    { id: "g3", type: "sticky", x: 2427, y: 1250, width: 268, height: 320, text: "x", fill: "#fff", fontSize: 14, rotation: 0, opacity: 1, locked: false, hidden: false, name: "165.BR1 staðsetning", parentId: "m1" },
  ];
  const stadir = [
    { x: 516, y: 1432, brsl: true, slt: true, takn: { x: 516, y: 1432, r: 16, lokun: 1 }, sltVid: { x: 540, y: 1450 }, ord: [] },
    { x: 1500, y: 2100, brsl: false, slt: true, takn: null, sltVid: { x: 1500, y: 2100 }, ord: [] },
  ];
  const haedir = [{ id: "h1", markers: [] }];
  const fyrsta = beitaSltBrsl([plan, ...gamalt], [{ plan, stadir, staerd: 28, metri: 28.35 }], { taeki: TAEKI, haedir });
  assert.equal(fyrsta.fjarlaegd, 3, "eldri 165.BR1-merkin fóru");
  const taekin = fyrsta.objects.filter((o): o is SymbolObject => o.type === "symbol" && !o.name.startsWith("165.BR1"));
  assert.equal(taekin.length, 3, "slanga + SLT við keflið + stakt SLT");
  assert.deepEqual(taekin.map((t) => t.uttektUnitId ?? null), [8223, 8214, 8218], "slanga; SLT: léttvatn, svo duft");
  assert.ok(taekin.every((t) => t.x + t.size / 2 >= plan.x && t.x + t.size / 2 <= plan.x + plan.width && t.y + t.size / 2 >= plan.y && t.y + t.size / 2 <= plan.y + plan.height), "öll tækin INNAN myndarinnar");
  assert.ok(!fyrsta.objects.some((o) => o.type === "ellipse"), "enginn drægishringur sjálfgefið");
  // endurkeyrsla: sömu staðir — tækin eru komin, ekkert nýtt og engin tvítekin 165.BR1-merki
  const onnur = beitaSltBrsl(fyrsta.objects, [{ plan, stadir, staerd: 28, metri: 28.35 }], { taeki: TAEKI, haedir });
  const taekin2 = onnur.objects.filter((o) => o.type === "symbol" && !o.name.startsWith("165.BR1"));
  assert.equal(taekin2.length, 3);
  assert.equal(onnur.samantekt[0].fyrir, 3);
  const mvs = (o: BoardObject[]) => o.filter((x) => x.name.startsWith("165.BR1")).length;
  assert.equal(mvs(onnur.objects), mvs(fyrsta.objects), "jafnmörg hönnunarmerki — engin tvítekning");
  // drægi slangna (valfrjálst): 25 m kringum slönguna, á réttum stað
  const draegi = beitaSltBrsl([plan], [{ plan, stadir, staerd: 28, metri: 28.35 }], { taeki: null, haedir: [], draegi: true });
  const h = draegi.objects.filter((o) => o.type === "ellipse");
  assert.equal(h.length, 1);
  assert.ok(Math.abs(h[0].x + (h[0] as { width: number }).width / 2 - 516) < 0.01 && Math.abs((h[0] as { width: number }).width / 2 - 25 * 28.35) < 0.01);
  // án tækjalista: allt ótengt („ótengt" undir)
  assert.ok(draegi.objects.filter((o): o is SymbolObject => o.type === "symbol" && !o.name.startsWith("165.BR1")).every((t) => t.label === "ótengt" && t.uttektUnitId == null));
});

test("HSL = handslökkvitæki (DRA ehf 11.10.2026), líka lóðrétt skrifað upp á rönd við vegginn", () => {
  assert.deepEqual(ordTegundir("HSL"), [{ tegund: "slt", sterkt: true }]);
  assert.deepEqual(ordTegundir("H5L"), [{ tegund: "slt", sterkt: false }]);
  assert.deepEqual(ordTegundir("HSI"), []);
  const mynd = { b: 7000, h: 5000 };
  const lodrett = { ...ord("HSL", 1000, 2000, 85, 20, 64), vertical: true };
  const o = sltBrslOrd([lodrett], mynd);
  assert.equal(o.length, 1);
  assert.equal(o[0].tegund, "slt");
  assert.equal(Math.round(o[0].h), 20); // stafahæð = breidd lóðrétts kassa
});

/* ── 15.10.2026: „30 m“ við kefli, BO og ÚT ──────────────────────────────────────────────────── */

test("sltBrslOrd: BO / ÚT þurfa 35 % vissu, „30 m“ 50 %; skiltiUrOrdum gefur bjorgunarop og ut þar sem textinn er", () => {
  const mynd = { b: 7000, h: 5000 };
  const w = [
    ord("BO", 1000, 1000, 96, 40, 25),
    ord("BO", 2000, 1000, 30, 40, 25), // of lág vissa
    ord("ÚT", 1000, 2000, 60, 40, 25),
    ord("30m", 3000, 3000, 90, 44, 20),
    ord("30m", 4000, 3000, 45, 44, 20), // of lág vissa
  ];
  const o = sltBrslOrd(w, mynd);
  assert.deepEqual(o.map((x) => `${x.tegund}@${Math.round(x.x)}${x.metri ? "m" : ""}`).sort(), ["bo@1020", "brsl@3022m", "ut@1020"]);
  const s = skiltiUrOrdum(o);
  assert.deepEqual(s.map((x) => [x.sign, Math.round(x.x), Math.round(x.y)]), [["bjorgunarop", 1020, 1013], ["ut", 1020, 2013]]);
});

test("sltBrslStadir: „30 m“ án spírals (málsetning) gefur engan stað; með blekgrímu og kefli yrði það BRSL", () => {
  const o = sltBrslOrd([ord("30m", 1000, 1000, 90, 44, 20), ord("BRSL", 3000, 3000, 90)], { b: 7000, h: 5000 });
  assert.equal(o.length, 2);
  // engin blekgríma → ekkert tákn finnst → „30 m“ sleppt, BRSL-textinn stendur
  const s = sltBrslStadir(o, null);
  assert.equal(s.length, 1);
  assert.equal(Math.round(s[0].x), 3032);
});

test("hnitABord: myndardílar → borðhnit með sömu vörpun og stadirABord", () => {
  const p = hnitABord({ x: 700, y: 500, sign: "ut" as const }, { x: 100, y: 200, width: 350, height: 250 }, { b: 7000, h: 5000 });
  assert.deepEqual([p.x, p.y, p.sign], [135, 225, "ut"]);
});

// 20.10.2026 (Lindaberg 1. hæð, Trönuhraun 10): slöngukeflið er teiknað með PUNKTALÍNU — stökum punktum sem 3×3 þensla tengir
// ekki — og „30 m" stendur rétt fyrir ofan. Blekgríman er raunveruleg (600 × 600 bútar úr 16052012_004).
test("finnaHring: punktalínu-spírall við „30 m“; herbergisflatarmál („2.5m²“, „39m²“) fá ekkert tákn", async () => {
  const { inflateSync } = await import("node:zlib");
  const f = JSON.parse(readFileSync(join(__dirname, "fixtures", "lindaberg-1haed-punktakefli.json"), "utf8")) as {
    kvardi: number;
    tilfelli: { nafn: string; x: number; y: number; h: number; kassi: number[]; skurdur: { x0: number; y0: number; b: number; h: number }; blek: string }[];
  };
  for (const t of f.tilfelli) {
    const pakkad = inflateSync(Buffer.from(t.blek, "base64"));
    const data = new Uint8Array(t.skurdur.b * t.skurdur.h);
    for (let i = 0; i < data.length; i++) data[i] = (pakkad[i >> 3] >> (7 - (i & 7))) & 1;
    const blek: Blek = { w: t.skurdur.b, h: t.skurdur.h, kvardi: f.kvardi, data };
    // hnit orðsins í bútnum (myndardílar = OCR-dílar / kvarði)
    const dx = t.skurdur.x0 / f.kvardi, dy = t.skurdur.y0 / f.kvardi;
    const [bx, by, bb, bh] = t.kassi;
    const kassi = { x0: bx - dx - 3, y0: by - dy - 3, x1: bx - dx + bb + 3, y1: by - dy + bh + 3 };
    const r = finnaHring(blek, t.x - dx, t.y - dy, t.h, undefined, kassi);
    if (t.nafn.includes("kefli finnst")) {
      assert.ok(r, t.nafn);
      // táknið stendur 1,5–2,5 stafahæðir undir orðinu, ekki á textanum og ekki langt frá
      const fjarl = Math.hypot(r.x - (t.x - dx), r.y - (t.y - dy)) / t.h;
      assert.ok(fjarl > 1.3 && fjarl < 3, `${t.nafn}: fjarlægð ${fjarl.toFixed(2)}h`);
      assert.ok(r.y > t.y - dy, `${t.nafn}: keflið er undir orðinu`);
    } else {
      assert.equal(r, null, t.nafn);
    }
  }
});

test("sltBrslOrd: kassi sem OCR merkir „lóðréttan“ en er breiðari en hann er hár er láréttur (stafahæðin ekki 15)", () => {
  const w: OcrWord = { text: "30 m", x: 3575, y: 2361, width: 68, height: 37, confidence: 77, vertical: true };
  const o = sltBrslOrd([w], { b: 7507, h: 5328 }, null);
  assert.equal(o.length, 1);
  assert.ok(o[0].h > 25 && o[0].h < 32, `h = ${o[0].h}`);
  assert.deepEqual(o[0].kassi, { x0: 3572, y0: 2358, x1: 3646, y1: 2401 });
  // raunverulega lóðrétt orð (hár, mjór kassi) heldur sínu lagi
  const l: OcrWord = { text: "HSL", x: 100, y: 100, width: 30, height: 90, confidence: 80, vertical: true };
  const p = sltBrslOrd([l], { b: 7507, h: 5328 }, null);
  assert.equal(p.length, 1);
  assert.ok(p[0].h >= 25 && p[0].h <= 30, `h = ${p[0].h}`);
});

test("erSkyringarOrd: HST/BS í skýringarlínu blaðsins (Höfðatorg, teiknað á hlið) eru ekki merki; sama orð eitt á teikningu er það", () => {
  const lod = (text: string, x: number, y: number, conf = 80): OcrWord => ({ text, x, y, width: 15, height: 26, confidence: conf, vertical: true });
  // skýringarlína: kóðar í sömu stöðu (y ≈ 685) með 48 díla millibili — eins og „AG BO BS DF GNF GR HO HL HST“ á blaðinu
  const kodar = ["AG", "BO", "BS", "DF", "GNF", "GR", "HO", "HL", "HST"].map((t, i) => lod(t, 924 + i * 48, 685 + (i % 3)));
  const einn = lod("HST", 2054, 7094, 38);
  const allt = [...kodar, einn, lod("LR", 300, 4000), lod("LR", 700, 5200)];
  const hst = kodar[8];
  assert.equal(erSkyringarOrd(hst, allt), true, "kóði í skýringarlínu");
  assert.equal(erSkyringarOrd(kodar[2], allt), true, "BS í skýringarlínu");
  assert.equal(erSkyringarOrd(einn, allt), false, "HST á teikningunni sjálfri");
  const mynd = { b: 4470, h: 8948 };
  assert.deepEqual(sltBrslOrd(allt, mynd, null).map((o) => o.tegund + "@" + Math.round(o.x) + "," + Math.round(o.y)), ["slt@" + Math.round(2054 + 7.5) + "," + Math.round(7094 + 13)]);
  // láréttur texti: skýringar standa í súlu (sama x, stafla í y)
  const lar = (text: string, y: number): OcrWord => ({ text, x: 100, y, width: 40, height: 14, confidence: 85, vertical: false });
  const sula = ["AG", "BO", "BS", "DF", "HST", "HV"].map((t, i) => lar(t, 500 + i * 24));
  assert.equal(erSkyringarOrd(sula[4], sula), true);
  assert.equal(erSkyringarOrd(lar("HST", 900), [lar("HST", 900), lar("LR", 100), lar("EI", 300)]), false);
});
