import assert from "node:assert/strict";
import { test } from "node:test";
import { anUttektarTengingar } from "./clipboard";
import {
  adgerdVidSetningu,
  flokkaTaekjalista,
  merkiTexti,
  siaTaekjalista,
  stadaTaekisTexti,
  taekjaListi,
} from "./taekjalisti";
import type { BoardObject, ImageObject, LineObject, SymbolObject } from "./types";
import {
  byggjaStodur,
  stimpilDef,
  stimpillFyrirTakn,
  stimpillMerkis,
  stimpilStaerdABladi,
  stimpilStaerdBords,
  symbolFyrirStimpil,
  taknFyrirMerki,
  TEIKNING_STIMPLAR,
  utbuaVistun,
  type UttektHaed,
  type UttektMerki,
  type UttektTaeki,
} from "./uttekt";

// Fiskislóð 41 í smækkaðri mynd: frummynd 2000×2000, borðið teiknaði hana 1000×1000 á (0,0) — kvarði 0,5.
const FRUM = { b: 2000, h: 2000 };
const MYND: ImageObject = {
  id: "mynd",
  type: "image",
  assetId: "a",
  x: 0,
  y: 0,
  width: 1000,
  height: 1000,
  rotation: 0,
  opacity: 1,
  locked: false,
  hidden: false,
  name: "Fiskislóð 41",
  uttekt: { companyId: 1612, haedId: "h1", frumB: 2000, frumH: 2000, skurdur: null },
};
const STAERD = 20;
const TAEKI: UttektTaeki[] = [
  { id: 25442, serial: "TMP-N5VABN", type: "Léttvatn", status: "active" },
  { id: 25443, serial: "TMP-R5PY7E", type: "Léttvatn", status: "active" },
  { id: 25444, serial: "TMP-B4XGYG", type: "Léttvatn", status: "active" },
  { id: 25447, serial: "TMP-G79YGM", type: "Léttvatn", status: "active" },
  { id: 25448, serial: "TMP-7NMN67", type: "Léttvatn", status: "urelt" },
  { id: 25451, serial: "TMP-4CCL6S", type: "Brunaslanga", status: "active" },
  { id: 25460, serial: "DFT-000111", type: "ABC Duft", status: "loaned" },
];

function haedirFixture(): UttektHaed[] {
  return [
    {
      id: "h1",
      nafn: "1. hæð",
      skurdur: { x: 1, y: 2, w: 30, h: 40 },
      pdfVeggir: [[1, 2, 3, 4]],
      markers: [
        { x: 200, y: 200, unitId: 25442 },
        { x: 1581.9143174585, y: 1860.4162697798965, unitId: 25443 },
        { x: 600, y: 600, unitId: 25444 },
        { x: 800, y: 400, rot: 0, kind: "sign", sign: "hose", color: "#c93c1d", unitId: "s:hose:muu3fnqsbw0n" },
        { x: 1459, y: 1029, kind: "sign", sign: "rafmagn", color: "#eab308", unitId: "s:rafmagn:mur14paumv8v" },
      ],
    },
    {
      id: "h2",
      nafn: "2. hæð",
      markers: [
        { x: 100, y: 100, unitId: 25448 },
        { x: 300, y: 300, kind: "sign", sign: "ut", color: "#15803d", rot: 0, unitId: "s:ut:zzz" },
      ],
    },
  ];
}

/** Opnun: merki hæðarinnar → tákn (sama leið og WhiteboardApp) og `merki` = lyklarnir sem borðið sýnir. */
function opna(haedir: UttektHaed[]): BoardObject[] {
  const h1 = haedir[0];
  const takn = (h1.markers || []).map((m) => taknFyrirMerki(m, TAEKI, MYND, FRUM, STAERD));
  const mynd: ImageObject = { ...MYND, uttekt: { ...MYND.uttekt!, merki: takn.map((s) => String(s.uttektUnitId)) } };
  return [mynd, ...takn];
}

function takn(symbolId: string, cx: number, cy: number, extra: Partial<SymbolObject> = {}): SymbolObject {
  return {
    id: "t" + symbolId + cx + cy,
    type: "symbol",
    symbolId,
    x: cx - STAERD / 2,
    y: cy - STAERD / 2,
    size: STAERD,
    label: "",
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    name: symbolId,
    ...extra,
  };
}

const naestaId = () => {
  let n = 0;
  return (sign: string) => `s:${sign}:test${++n}`;
};

test("stimplar Teikning-gluggans ↔ tákn TurboPaint: hver stimpill fer fram og til baka", () => {
  for (const s of TEIKNING_STIMPLAR) {
    assert.equal(symbolFyrirStimpil(s.id), s.symbolId, s.id);
    assert.equal(stimpillFyrirTakn(s.symbolId), s.id, s.id);
    // tákn sem ber stimpilinn (uttektSign) vistast sem sami stimpill
    assert.equal(stimpillFyrirTakn(s.symbolId, s.id), s.id, s.id);
  }
  // eldri tákn TurboPaint sem eru nákvæmlega sama merkið
  assert.equal(stimpillFyrirTakn("exit"), "neyðarútgangur");
  assert.equal(stimpillFyrirTakn("electric"), "rafmagn");
  assert.equal(stimpillFyrirTakn("sign-extinguisher"), "skilti_slt");
  assert.equal(stimpillFyrirTakn("sign-hose"), "skilti_slanga");
  assert.equal(stimpillFyrirTakn("detector"), "reykskynjari");
  // aukatákn TurboPaint og tækjategundir vistast ekki sem merki (engin nálgun)
  for (const id of ["extinguisher", "extinguisher-lettvatn", "hose", "alarm", "e-light", "blanket", "firstaid", "eigid-takn-1", "teikn:lettvatn", "teikn:slanga"]) {
    assert.equal(stimpillFyrirTakn(id), null, id);
  }
  // óþekktur stimpill teiknast eins og í Teikning („annað") en heldur nafni sínu
  assert.equal(symbolFyrirStimpil("eitthvad_nytt"), "teikn:annad");
  assert.equal(stimpillFyrirTakn("teikn:annad", "eitthvad_nytt"), "eitthvad_nytt");
  assert.equal(stimpillMerkis({ unitId: "s:bjalla:abc" }), "bjalla");
  assert.equal(stimpilDef("ut")?.stutt, "ÚT");
});

test("opnun: tæki fá tákn safnsins eftir tegund + raðnúmer, stimplar sitt tákn, tengd með unitId", () => {
  const [, ...t] = opna(haedirFixture()) as [ImageObject, ...SymbolObject[]];
  const tæki = t.find((s) => s.uttektUnitId === 25442)!;
  assert.equal(tæki.symbolId, "teikn:lettvatn");
  assert.equal(tæki.label, "N5VABN");
  assert.equal(tæki.parentId, "mynd");
  assert.equal(tæki.uttektKind, undefined);
  // miðja táknsins á staðnum: (200,200) frummyndar = (100,100) á borðinu
  assert.equal(tæki.x + tæki.size / 2, 100);
  const slanga = t.find((s) => s.uttektUnitId === "s:hose:muu3fnqsbw0n")!;
  assert.equal(slanga.symbolId, "teikn:hose");
  assert.equal(slanga.label, "", "merki fá enga stafi, eins og í Teikning-glugganum");
  // plötulitur merkisins (#c93c1d) = litur stimpilsins í safninu → ekkert sérgeymt
  assert.equal(slanga.uttektLitur, undefined);
  assert.equal(slanga.uttektKind, "sign");
  assert.equal(slanga.uttektSign, "hose");
});

test("Vista í úttekt: tæki sett, fært, tekið af, ÚT-merki bætt við — Teikning-snið, aðrar hæðir og veggir rétt", () => {
  const fersk = haedirFixture();
  let bord = opna(fersk);
  // 25442 fært; 25444 tekið af teikningunni (Delete); 25447 (óstaðsett) sett; 25448 sótt af 2. hæð;
  // ÚT-merki úr tækjalistanum; rafmagnstafla úr slánni (ótengd → stimpill); slökkvitæki úr slánni (án tækis) og
  // 165.BR1-hönnunarstaður vistast ekki; veggur á laginu „Veggir".
  bord = bord
    .map((o) => (o.type === "symbol" && o.uttektUnitId === 25442 ? { ...o, x: o.x + 50, y: o.y + 25 } : o))
    .filter((o) => !(o.type === "symbol" && o.uttektUnitId === 25444));
  const veggur: LineObject = {
    id: "v1", type: "polyline", x: 0, y: 0, points: [0, 0, 500, 0], stroke: "#000", strokeWidth: 4, dash: "solid",
    rotation: 0, opacity: 1, locked: false, hidden: false, name: "Veggur", parentId: "mynd", veggur: true, layerId: "veggir",
  };
  bord.push(
    takn("teikn:lettvatn", 300, 300, { uttektUnitId: 25447, label: "G79YGM" }),
    takn("teikn:lettvatn", 350, 350, { uttektUnitId: 25448 }),
    takn("teikn:ut", 400, 100, { uttektKind: "sign", uttektSign: "ut" }),
    takn("electric", 450, 150),
    takn("extinguisher", 500, 500),
    takn("exit", 520, 520, { name: "165.BR1 útgangur 1" }),
    veggur
  );
  // Teikning-glugginn bætti við merki EFTIR opnun (ekki á borðinu, ekki í `merki`) — má ekki týnast
  fersk[0].markers!.push({ x: 1900, y: 1900, unitId: "s:bjalla:fraappinu", kind: "sign", sign: "bjalla" });

  const u = utbuaVistun(bord, fersk, "2026-10-06T12:00:00.000Z", naestaId());
  const h1 = u.haedir.find((h) => h.id === "h1")!;
  const h2 = u.haedir.find((h) => h.id === "h2")!;
  const lyklar = h1.markers!.map((m) => String(m.unitId));

  // tæki
  assert.deepEqual(h1.markers!.find((m) => m.unitId === 25442), { x: 300, y: 250, unitId: 25442 }, "fært");
  assert.deepEqual(
    h1.markers!.find((m) => m.unitId === 25443),
    { x: 1581.9143174585, y: 1860.4162697798965, unitId: 25443 },
    "óhreyft tæki heldur nákvæmum hnitum appsins"
  );
  assert.ok(!lyklar.includes("25444"), "tekið af teikningunni fer úr hæðinni");
  assert.deepEqual(h1.markers!.find((m) => m.unitId === 25447), { unitId: 25447, x: 600, y: 600 }, "nýtt tæki");
  assert.deepEqual(h1.markers!.find((m) => m.unitId === 25448), { unitId: 25448, x: 700, y: 700 }, "sótt af 2. hæð");
  // stimplar: eldri óbreyttir (litur, snúningur, hnit), nýir á sniði 433
  assert.deepEqual(h1.markers!.find((m) => m.unitId === "s:hose:muu3fnqsbw0n"), fersk[0].markers![3]);
  assert.deepEqual(h1.markers!.find((m) => m.unitId === "s:rafmagn:mur14paumv8v"), fersk[0].markers![4]);
  const ut = h1.markers!.find((m) => m.sign === "ut") as UttektMerki;
  assert.deepEqual(ut, { unitId: "s:ut:test1", x: 800, y: 200, kind: "sign", sign: "ut", color: "#15803d", rot: 0 });
  const raf = h1.markers!.filter((m) => m.sign === "rafmagn");
  assert.equal(raf.length, 2, "gamla rafmagnstaflan + ný úr slánni");
  assert.deepEqual(raf[1], { unitId: "s:rafmagn:test2", x: 900, y: 300, kind: "sign", sign: "rafmagn", color: "#eab308", rot: 0 });
  assert.ok(lyklar.includes("s:bjalla:fraappinu"), "merki sett í appinu eftir opnun heldur sér");
  assert.equal(h1.markers!.length, 9);
  // ótengt tákn og hönnunarstaður vistast ekki; hönnunarmerki 165.BR1 teljast ekki „án tengingar" (vinnugögn lestursins)
  assert.equal(u.otengd, 1);
  assert.equal(h1.markers!.some((m) => m.x === 1000 && m.y === 1000), false);
  // aðrar hæðir: aðeins tækið sem flutti fer, stimpill þar ósnertur
  assert.deepEqual(h2.markers, [{ x: 300, y: 300, kind: "sign", sign: "ut", color: "#15803d", rot: 0, unitId: "s:ut:zzz" }]);
  assert.equal(h2.nafn, "2. hæð");
  // annað á hæðinni ósnert, veggir skrifaðir (1. áfangi)
  assert.deepEqual(h1.skurdur, fersk[0].skurdur);
  assert.deepEqual(h1.pdfVeggir, fersk[0].pdfVeggir);
  assert.deepEqual(h1.veggjaLinur, [{ p: [0, 0, 1000, 0], t: 8, tegund: "veggur" }]);
  assert.deepEqual(h1.leidrett, { af: "turbopaint", kl: "2026-10-06T12:00:00.000Z" });
  // talning og það sem borðið fær til baka
  assert.equal(u.tekin, 1);
  assert.equal(u.ny, 4);
  assert.equal(u.breytt, 1);
  assert.deepEqual(u.nyirStimplar.map((n) => n.sign), ["ut", "rafmagn"]);
  assert.deepEqual(u.utanBords.map((m) => m.unitId), ["s:bjalla:fraappinu"]);
  assert.ok(!u.merkiABordi.includes("s:bjalla:fraappinu"));
  assert.ok(u.merkiABordi.includes("s:ut:test1") && u.merkiABordi.includes("25447"));
  assert.equal(u.anThekkingar, false);
  // ferska röðin sjálf er ósnert (vistunin býr til nýtt)
  assert.equal(fersk[1].markers!.length, 2);
});

test("vistun án breytinga skilar hæðinni óbreyttri (merki fara óbreytt fram og til baka)", () => {
  const fersk = haedirFixture();
  const u = utbuaVistun(opna(fersk), fersk, "kl", naestaId());
  assert.deepEqual(u.haedir[0].markers, fersk[0].markers);
  assert.equal(u.haedir[1], fersk[1]);
  assert.equal(u.breytt + u.ny + u.tekin, 0);
});

test("falið tákn og tákn utan teikningar halda stöðu og teljast ekki tekin af; afrit af tæki vistast ekki", () => {
  const fersk = haedirFixture();
  const bord = opna(fersk).map((o) => {
    if (o.type !== "symbol") return o;
    if (o.uttektUnitId === 25442) return { ...o, hidden: true };
    if (o.uttektUnitId === 25444) return { ...o, x: 5000, y: 5000 };
    return o;
  });
  const frumrit = bord.find((o) => o.type === "symbol" && o.uttektUnitId === 25443) as SymbolObject;
  bord.push({ ...frumrit, id: "afrit", x: frumrit.x + 300 });
  const u = utbuaVistun(bord, fersk, "kl", naestaId());
  assert.deepEqual(u.haedir[0].markers!.slice(0, 3), fersk[0].markers!.slice(0, 3));
  assert.equal(u.tekin, 0);
  assert.equal(u.utan, 1);
  assert.equal(u.tvitekin, 1);
});

test("eldra borð án `merki`: ekkert er fjarlægt (öryggisregla), merkin sem vantar koma til baka á borðið", () => {
  const fersk = haedirFixture();
  const bord = opna(fersk)
    .map((o) => (o.type === "image" ? { ...o, uttekt: { ...o.uttekt!, merki: undefined } } : o))
    .filter((o) => !(o.type === "symbol" && o.uttektUnitId === 25444));
  const u = utbuaVistun(bord, fersk, "kl", naestaId());
  assert.ok(u.haedir[0].markers!.some((m) => m.unitId === 25444));
  assert.equal(u.tekin, 0);
  assert.equal(u.anThekkingar, true);
  assert.deepEqual(u.utanBords.map((m) => m.unitId), [25444]);
});

test("vistun á hæð sem var eytt í appinu er stöðvuð", () => {
  const fersk = haedirFixture().filter((h) => h.id !== "h1");
  assert.throws(() => utbuaVistun(opna(haedirFixture()), fersk, "kl"), /ekki lengur til/);
});

test("byggjaStodur telur ótengd tákn aðeins á teikningunni", () => {
  const b = byggjaStodur([MYND, takn("extinguisher", 10, 10), takn("extinguisher", 4000, 10)], MYND, FRUM, naestaId());
  assert.equal(b.otengd, 1);
  assert.equal(b.stodur.size, 0);
});

test("tækjalistinn: á teikningu / á annarri hæð / ekki staðsett, flokkað eftir tegund", () => {
  const fersk = haedirFixture();
  const bord = opna(fersk).filter((o) => !(o.type === "symbol" && o.uttektUnitId === 25444));
  const listi = taekjaListi(TAEKI, bord, fersk, "h1");
  const s = (id: number) => listi.find((x) => x.taeki.id === id)!;
  assert.equal(s(25442).stada, "her");
  assert.ok(s(25442).taknId);
  assert.equal(s(25444).stada, "ekki", "tekið af borðinu = ekki staðsett (þótt röðin hafi það enn)");
  assert.equal(s(25448).stada, "onnur");
  assert.equal(merkiTexti(s(25448)), "á 2. hæð");
  assert.equal(merkiTexti(s(25447)), "ekki staðsett");
  assert.equal(s(25442).stuttNr, "N5VABN");
  assert.equal(s(25448).urelt, true);
  const hopar = flokkaTaekjalista(listi);
  assert.deepEqual(hopar.map((h) => h.heiti), ["Léttvatn", "Duft", "Slanga"]);
  // föst röð eftir raðnúmeri (röðin hoppar ekki þegar tæki er staðsett)
  assert.deepEqual(hopar[0].taeki.map((x) => x.stuttNr), ["7NMN67", "B4XGYG", "G79YGM", "N5VABN", "R5PY7E"]);
  assert.deepEqual(siaTaekjalista(listi, "", true).map((x) => x.taeki.id).sort(), [25444, 25447, 25451, 25460]);
  assert.deepEqual(siaTaekjalista(listi, "duft", false).map((x) => x.taeki.id), [25460]);
  assert.deepEqual(siaTaekjalista(listi, "n5vab", false).map((x) => x.taeki.id), [25442]);
  assert.equal(stadaTaekisTexti("active"), "virkt");
  assert.equal(stadaTaekisTexti("urelt"), "úrelt");
  assert.equal(stadaTaekisTexti("loaned"), "í láni");
});

test("smellur á teikninguna: tæki á hæðinni færist (aldrei tvítekið), tæki á annarri hæð spyr fyrst", () => {
  const fersk = haedirFixture();
  const bord = opna(fersk);
  const a = adgerdVidSetningu(bord, fersk, "h1", 25442);
  assert.equal(a.teg, "faera");
  assert.deepEqual(adgerdVidSetningu(bord, fersk, "h1", 25448), { teg: "nytt", annarriHaed: "2. hæð" });
  assert.deepEqual(adgerdVidSetningu(bord, fersk, "h1", 25447), { teg: "nytt", annarriHaed: undefined });
});

test("afrit (⌘D / líma) af tengdu tæki missir tenginguna; afrit af stimpli verður nýr stimpill", () => {
  const t = takn("teikn:lettvatn", 1, 1, { uttektUnitId: 25442, label: "N5VABN" });
  const a = anUttektarTengingar(t) as SymbolObject;
  assert.equal(a.uttektUnitId, undefined);
  assert.equal(a.label, "");
  assert.equal(a.symbolId, "teikn:lettvatn");
  const s = takn("exit", 1, 1, { uttektUnitId: "s:ut:abc", uttektKind: "sign", uttektSign: "ut", label: "ÚT" });
  const b = anUttektarTengingar(s) as SymbolObject;
  assert.equal(b.uttektUnitId, undefined);
  assert.equal(b.uttektSign, "ut");
  assert.equal(b.uttektKind, "sign");
  assert.equal(b.label, "ÚT");
  const ekki = takn("extinguisher", 1, 1);
  assert.equal(anUttektarTengingar(ekki), ekki);
});

test("tákn úr slánni á tengdu borði fær stærð hæðarinnar (ekki margfalt stærra en tækin); annars stimpilstærð notandans", () => {
  const sk = { x: 100, y: 100, w: 1600, h: 1200 };
  const m: ImageObject = { ...MYND, uttekt: { ...MYND.uttekt!, skurdur: sk } };
  assert.equal(stimpilStaerdBords([m], 56), stimpilStaerdABladi(m, 56, sk, FRUM));
  assert.equal(stimpilStaerdBords([{ ...MYND, uttekt: undefined }], 56), 56);
  assert.equal(stimpilStaerdBords([], 72), 72);
});
