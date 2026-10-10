import assert from "node:assert/strict";
import { test } from "node:test";
import {
  aetlaHluta,
  afleidingTengingar,
  beitaFjolcrop,
  bladMyndar,
  erfingiTengingar,
  finnaGrunnmyndir,
  haedirTilTengingar,
  merkiMyndar,
  rodAnSkorunar,
  skurdurEftirCrop,
  tengjaVidHaed,
} from "./margar-haedir";
import { golfHaedar } from "./hus3d";
import type { BoardObject, ImageObject, LineObject, SymbolObject } from "./types";
import {
  bladIBordi,
  byggjaStodur,
  haedNumer,
  merkiIBord,
  myndSlodBlads,
  nyttHaedId,
  samaBlad,
  skurdurIBord,
  stillaBladHaedar,
  taknIMerki,
  tillagaHaedarNafns,
  utbuaVistun,
  veggirIBord,
  veggirIFrum,
  type UttektHaed,
} from "./uttekt";

// Ægisgata 4 (fyrirtæki 194): 2015-03-2425.tif — afstöðumynd + grunnmyndir 1., 2. og 3. hæðar á EINU blaði.
// Frummynd (FotoWeb-JPEG) 6006×4373; borðið teiknaði skarpa skönnun í 7200×5242 á (80, 120) — kvarði ≈ 1,199.
const PERMALINK =
  "https://skjalasafn.reykjavik.is/fotoweb/archives/5000-A%C3%B0aluppdr%C3%A6ttir/A%C3%B0aluppdr%C3%A6ttir/2015/04/2015-03-2425.tif.info";
const IMAGE_URL = "/.netlify/functions/teikn-mynd?url=" + encodeURIComponent(PERMALINK);
const FRUM = { b: 6006, h: 4373 };
const BLAD = { x: 80, y: 120, width: 7200, height: 7200 * (4373 / 6006) };
const KX = BLAD.width / FRUM.b, KY = BLAD.height / FRUM.h;
// Grunnmyndirnar á blaðinu (dílar frummyndar): 3. hæð efst, 2. hæð í miðju, 1. hæð neðst.
const H3 = { x: 2280, y: 120, w: 2440, h: 1240 };
const H2 = { x: 2280, y: 1560, w: 2440, h: 1150 };
const H1 = { x: 2280, y: 3020, w: 2440, h: 1260 };
const iBord = (s: { x: number; y: number; w: number; h: number }) => ({
  x: BLAD.x + s.x * KX,
  y: BLAD.y + s.y * KY,
  width: s.w * KX,
  height: s.h * KY,
});

const SHEET: ImageObject = {
  id: "blad",
  type: "image",
  assetId: "a0",
  ...BLAD,
  rotation: 0,
  opacity: 1,
  locked: false,
  hidden: false,
  name: "2015-03-2425",
  heimild: { slod: PERMALINK, b: BLAD.width, h: BLAD.height },
  uttekt: { companyId: 194, haedId: "h194a", frumB: FRUM.b, frumH: FRUM.h, skurdur: null, merki: ["s:ut:prof1"] },
};

function takn(id: string, cx: number, cy: number, extra: Partial<SymbolObject> = {}): SymbolObject {
  return {
    id,
    type: "symbol",
    symbolId: "teikn:lettvatn",
    x: cx - 20,
    y: cy - 20,
    size: 40,
    label: "",
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    name: id,
    ...extra,
  };
}

function fersk(): UttektHaed[] {
  return [
    {
      id: "h194a",
      nafn: "1. hæð",
      image_url: IMAGE_URL,
      frum: { b: 6006, h: 4373 },
      skurdur: null,
      syn: { skyrari: true },
      stimpilStaerd: 30,
      pdfVeggir: [],
      markers: [{ unitId: "s:ut:prof1", x: 3000, y: 3500, kind: "sign", sign: "ut", color: "#15803d", rot: 0 }],
    },
  ];
}

const naestaId = () => {
  let n = 0;
  return (sign: string) => `s:${sign}:test${++n}`;
};

// ── Vörpun um skurð ──────────────────────────────────────────────────────────────────────────────────────────────

test("skorin mynd: frum = skurdur.x + (borðX − mynd.x)/mynd.width·skurdur.w — og merki fara fram og til baka óbreytt", () => {
  const sk = { x: 2280, y: 1560, w: 2440, h: 1150 };
  // hlutinn stendur annars staðar á borðinu og í öðrum kvarða en blaðið
  const mynd = { x: 9000, y: -300, width: 2440 * 1.2, height: 1150 * 1.2 };
  const p = merkiIBord({ x: 3000, y: 2000 }, mynd, FRUM, 0, 0, sk);
  assert.ok(Math.abs(sk.x + ((p.x - mynd.x) / mynd.width) * sk.w - 3000) < 1e-9);
  assert.ok(Math.abs(sk.y + ((p.y - mynd.y) / mynd.height) * sk.h - 2000) < 1e-9);
  for (const m of [{ x: 2280, y: 1560 }, { x: 4720, y: 2710 }, { x: 3333, y: 2222 }, { x: 2500, y: 1600 }]) {
    for (const rot of [0, 90, 33]) {
      const b = merkiIBord(m, mynd, FRUM, 40, rot, sk);
      assert.deepEqual(taknIMerki({ x: b.x, y: b.y, size: 40, rotation: rot }, mynd, FRUM, sk), m);
    }
  }
  // sýndarblaðið: allt blaðið í sama kvarða, hliðrað
  const bl = bladIBordi(mynd, FRUM, sk);
  assert.ok(Math.abs(bl.width - FRUM.b * 1.2) < 1e-9 && Math.abs(bl.x - (9000 - 2280 * 1.2)) < 1e-9);
});

test("án skurðar er vörpunin óbreytt (null / undefined = myndin er allt blaðið)", () => {
  const mynd = { x: 80, y: 120, width: 5086, height: 7200 };
  const frum = { b: 4244, h: 6006 };
  for (const m of [{ x: 1119, y: 1874 }, { x: 0, y: 0 }, { x: 4244, y: 6006 }]) {
    assert.deepEqual(merkiIBord(m, mynd, frum, 64, 0, null), merkiIBord(m, mynd, frum, 64));
    const b = merkiIBord(m, mynd, frum, 64);
    assert.deepEqual(taknIMerki({ x: b.x, y: b.y, size: 64 }, mynd, frum, undefined), m);
    assert.equal(b.x, mynd.x + (m.x / frum.b) * mynd.width - 32);
  }
  assert.deepEqual(bladIBordi(mynd, frum, null), mynd);
  assert.deepEqual(skurdurIBord({ x: 10, y: 10, w: 100, h: 100 }, mynd, frum, null), skurdurIBord({ x: 10, y: 10, w: 100, h: 100 }, mynd, frum));
});

test("veggir skorinnar myndar fara fram og til baka um skurðinn; laus veggur fylgir aðeins sínum hluta", () => {
  const sk = { x: 2280, y: 3020, w: 2440, h: 1260 };
  const mynd = { id: "h1", x: 500, y: 500, width: 2440 * 1.199, height: 1260 * 1.199 };
  const veggir = [
    { p: [2300, 3100, 4700, 3100, 4700, 4200], t: 30 },
    { p: [2400, 3500, 2400, 4000], t: 12, tegund: "gler" as const },
  ];
  const bord = veggirIBord(veggir, mynd, FRUM, sk);
  assert.equal(bord[0].parentId, "h1");
  assert.deepEqual(veggirIFrum(bord as BoardObject[], mynd, FRUM, sk), [
    { p: [2300, 3100, 4700, 3100, 4700, 4200], t: 30, tegund: "veggur" },
    { p: [2400, 3500, 2400, 4000], t: 12, tegund: "gler" },
  ]);
  // laus veggur (W-tólið) á hlutanum fylgir; laus veggur á NÆSTA hluta (utan svæðisins) ekki
  const laus = (pts: number[]): LineObject => ({
    id: "w" + pts[0], type: "polyline", x: 0, y: 0, points: pts, stroke: "#000", strokeWidth: 4, dash: "solid",
    rotation: 0, opacity: 1, locked: false, hidden: false, name: "Veggir", veggur: true,
  });
  const a = veggirIFrum([laus([600, 600, 900, 600]), laus([mynd.x + mynd.width + 200, 600, mynd.x + mynd.width + 600, 600])], mynd, FRUM, sk);
  assert.equal(a.length, 1);
  assert.ok(a[0].p[0] >= sk.x && a[0].p[2] <= sk.x + sk.w);
});

// ── Croppa oft: áætlun og borðið eftir á ─────────────────────────────────────────────────────────────────────────

test("aetlaHluta: kassar → heil svæði frummyndar, klemmd að blaðinu, raðað hlið við hlið", () => {
  const blad = bladMyndar(SHEET, IMAGE_URL);
  assert.deepEqual(blad.frum, FRUM);
  assert.equal(blad.imageUrl, IMAGE_URL);
  // 3. kassinn byrjar ofan við blaðið og nær niður að neðri brún 3. hæðar
  const kassar = [iBord(H1), iBord(H2), { ...iBord(H3), y: BLAD.y - 300, height: (H3.y + H3.h) * KY + 300 }, { x: 0, y: 0, width: 5, height: 5 }];
  const h = aetlaHluta(SHEET, blad, kassar, 100);
  assert.equal(h.length, 3, "of lítill kassi dettur út");
  assert.deepEqual(h[0].svaedi, H1);
  assert.deepEqual(h[1].svaedi, H2);
  assert.deepEqual(h[2].svaedi, { ...H3, y: 0, h: H3.y + H3.h }, "klemmt að efri brún blaðsins");
  assert.deepEqual(h.map((x) => x.nr), [1, 2, 3]);
  // ramminn er nákvæmlega svæðið varpað á blaðið
  assert.ok(Math.abs(h[0].rammi.x - iBord(H1).x) < 1e-9 && Math.abs(h[0].rammi.width - H1.w * KX) < 1e-9);
  // hlið við hlið frá vinstri brún blaðsins, efri brúnir í línu, 100 á milli
  assert.equal(h[0].til.x, BLAD.x);
  assert.ok(Math.abs(h[1].til.x - (BLAD.x + h[0].rammi.width + 100)) < 1e-9);
  assert.ok(h.every((x) => x.til.y === BLAD.y));
});

test("beitaFjolcrop: blaðið víkur, tákn og veggir fara með sínum hluta (hnit frummyndar óbreytt), tenging erfist", () => {
  const blad = bladMyndar(SHEET, IMAGE_URL);
  const hlutar = aetlaHluta(SHEET, blad, [iBord(H1), iBord(H2), iBord(H3)], 100);
  // ÚT-merki 1. hæðar (3000, 3500) og tæki á 2. hæð — staðsett á blaðinu
  const ut = merkiIBord({ x: 3000, y: 3500 }, SHEET, FRUM, 40);
  const t2 = merkiIBord({ x: 3100, y: 2000 }, SHEET, FRUM, 40);
  const utan = merkiIBord({ x: 500, y: 500 }, SHEET, FRUM, 40); // afstöðumyndin — utan allra hluta
  const veggur: LineObject = {
    id: "v", type: "polyline", x: 0, y: 0, points: veggirIBord([{ p: [2400, 1700, 4600, 1700], t: 20 }], SHEET, FRUM)[0].points,
    stroke: "#1c1917", strokeWidth: 20 * KX, dash: "solid", rotation: 0, opacity: 1, locked: false, hidden: false, name: "Veggur",
    parentId: "blad", veggur: true,
  };
  const objects: BoardObject[] = [
    SHEET,
    takn("ut", ut.x + 20, ut.y + 20, { uttektUnitId: "s:ut:prof1", uttektKind: "sign", uttektSign: "ut", parentId: "blad" }),
    takn("t2", t2.x + 20, t2.y + 20, { parentId: "blad" }),
    takn("utan", utan.x + 20, utan.y + 20, { parentId: "blad" }),
    veggur,
  ];
  assert.equal(erfingiTengingar(SHEET, objects, hlutar), 0, "hlutinn með merki hæðarinnar erfir tenginguna");
  const r = beitaFjolcrop(objects, SHEET, blad, hlutar, ["e1", "e2", "e3"]);
  const myndir = r.objects.filter((o): o is ImageObject => o.type === "image");
  assert.equal(myndir.length, 3);
  assert.ok(!r.objects.some((o) => o.id === "blad"));
  assert.deepEqual(myndir.map((m) => m.bladhluti?.svaedi), [H1, H2, H3]);
  assert.ok(myndir.every((m) => m.bladhluti?.imageUrl === IMAGE_URL && m.bladhluti.frumB === 6006 && m.bladhluti.companyId === 194));
  assert.deepEqual(myndir.map((m) => m.assetId), ["e1", "e2", "e3"]);
  // tengingin erfist á 1. hluta, með skurðinn = hlutann og `merki` óbreytt
  assert.deepEqual(myndir[0].uttekt, { ...SHEET.uttekt, skurdur: H1, myndSkurdur: H1 });
  assert.equal(myndir[1].uttekt, undefined);
  // táknin fylgja sínum hluta og halda NÁKVÆMLEGA sömu hnitum frummyndar
  const s = (id: string) => r.objects.find((o) => o.id === id) as SymbolObject;
  assert.equal(s("ut").parentId, myndir[0].id);
  assert.deepEqual(taknIMerki(s("ut"), myndir[0], FRUM, H1), { x: 3000, y: 3500 });
  assert.equal(s("t2").parentId, myndir[1].id);
  assert.deepEqual(taknIMerki(s("t2"), myndir[1], FRUM, H2), { x: 3100, y: 2000 });
  // utan allra hluta: kyrrt og laust frá horfna blaðinu
  assert.equal(s("utan").x, utan.x);
  assert.equal(s("utan").parentId, undefined);
  // veggurinn fer með 2. hæð
  const v = r.objects.find((o) => o.id === "v") as LineObject;
  assert.equal(v.parentId, myndir[1].id);
  assert.deepEqual(veggirIFrum(r.objects, myndir[1], FRUM, H2), [{ p: [2400, 1700, 4600, 1700], t: 20, tegund: "veggur" }]);
});

test("röðin færist niður fyrir borðið ef hún lenti ofan á því sem situr eftir (tæki utan kassanna fer ekki í ranga hæð)", () => {
  const blad = bladMyndar(SHEET, IMAGE_URL);
  const hlutar = aetlaHluta(SHEET, blad, [iBord(H1), iBord(H2), iBord(H3)], 100);
  // ekkert situr eftir: röðin helst þar sem blaðið var
  assert.equal(rodAnSkorunar([SHEET], SHEET, hlutar), hlutar);
  // tæki á afstöðumyndinni (utan kassanna) — fyrsti hlutinn lenti beint undir því
  const p = merkiIBord({ x: 600, y: 600 }, SHEET, FRUM, 40);
  const objects: BoardObject[] = [SHEET, takn("t", p.x + 20, p.y + 20, { uttektUnitId: 21942, parentId: "blad" })];
  const faert = rodAnSkorunar(objects, SHEET, hlutar, 100);
  assert.ok(faert.every((h) => h.til.y === BLAD.y + BLAD.height + 100), JSON.stringify(faert.map((h) => h.til)));
  assert.deepEqual(faert.map((h) => h.til.x), hlutar.map((h) => h.til.x));
  const r = beitaFjolcrop(objects, SHEET, blad, faert, ["e1", "e2", "e3"]);
  assert.equal(r.eftir, 1);
  assert.equal(r.taekiEftir, 1);
  // vistun: tækið stendur á engum hluta → óbreytt („utan teikningar"), fer ekki í 1. hæð
  const o = tengjaVidHaed(r.objects, r.myndir[1].id, { haedId: "hNY2", nyttNafn: "2. hæð" }, fersk()).objects;
  const m1 = { ...(o.find((x) => x.id === r.myndir[0].id) as ImageObject), uttekt: { companyId: 194, haedId: "h194a", frumB: 6006, frumH: 4373, skurdur: H1, myndSkurdur: H1 } };
  const u = utbuaVistun(o.map((x) => (x.id === m1.id ? m1 : x)), fersk(), "kl", naestaId());
  assert.ok(!u.haedir.some((h) => (h.markers || []).some((mk) => mk.unitId === 21942)));
  assert.equal(u.utan, 1);
});

test("enginn erfingi án vísbendingar (engin merki, enginn skurður)", () => {
  const blad = bladMyndar(SHEET, IMAGE_URL);
  const hlutar = aetlaHluta(SHEET, blad, [iBord(H1), iBord(H2)], 100);
  assert.equal(erfingiTengingar(SHEET, [SHEET], hlutar), null);
  // skurður hæðarinnar sem fellur á 2. hluta ræður
  const m = { ...SHEET, uttekt: { ...SHEET.uttekt!, skurdur: { x: 2300, y: 1600, w: 2300, h: 1000 } } };
  assert.equal(erfingiTengingar(m, [m], hlutar), 1);
});

// ── Tengja við hæð ───────────────────────────────────────────────────────────────────────────────────────────────

function eftirCrop() {
  const blad = bladMyndar(SHEET, IMAGE_URL);
  const hlutar = aetlaHluta(SHEET, blad, [iBord(H1), iBord(H2), iBord(H3)], 100);
  const ut = merkiIBord({ x: 3000, y: 3500 }, SHEET, FRUM, 40);
  const objects: BoardObject[] = [
    SHEET,
    takn("ut", ut.x + 20, ut.y + 20, { uttektUnitId: "s:ut:prof1", uttektKind: "sign", uttektSign: "ut", parentId: "blad" }),
  ];
  return beitaFjolcrop(objects, SHEET, blad, hlutar, ["e1", "e2", "e3"]);
}

test("Tengja við hæð: + Ný hæð, núverandi hæð, og skipti þegar hæðin er þegar á annarri mynd", () => {
  const r = eftirCrop();
  const [m1, m2, m3] = r.myndir;
  const haedir = fersk();
  assert.equal(merkiMyndar(r.objects.find((o) => o.id === m2.id) as ImageObject, haedir), "Hluti 2 · ótengdur");
  // + Ný hæð
  let u = tengjaVidHaed(r.objects, m2.id, { haedId: "hNY2", nyttNafn: "2. hæð" }, haedir);
  const n2 = u.objects.find((o) => o.id === m2.id) as ImageObject;
  assert.deepEqual(n2.uttekt, { companyId: 194, haedId: "hNY2", frumB: 6006, frumH: 4373, skurdur: H2, myndSkurdur: H2, merki: [], nyHaed: { nafn: "2. hæð" } });
  assert.equal(merkiMyndar(n2, haedir), "2. hæð (ný)");
  u = tengjaVidHaed(u.objects, m3.id, { haedId: "hNY3", nyttNafn: "3. hæð" }, haedir);
  const kostir = haedirTilTengingar(u.objects, haedir, 194);
  assert.deepEqual(kostir.map((k) => [k.nafn, k.ny, k.myndId]), [
    ["1. hæð", false, m1.id],
    ["2. hæð", true, m2.id],
    ["3. hæð", true, m3.id],
  ]);
  assert.equal(tillagaHaedarNafns(kostir.map((k) => k.nafn)), "4. hæð");
  // 1. hæð á 3. hluta → hún er á 1. hluta: skipti (kallari staðfestir); 3. hluti tekur við `merki`
  const af = afleidingTengingar(u.objects, u.objects.find((o) => o.id === m3.id) as ImageObject, "h194a", haedir);
  assert.equal(af.onnurMynd?.id, m1.id);
  assert.equal(af.annadBlad, false);
  const s = tengjaVidHaed(u.objects, m3.id, { haedId: "h194a" }, haedir);
  assert.equal(s.vikid, m1.id);
  assert.equal((s.objects.find((o) => o.id === m1.id) as ImageObject).uttekt, undefined);
  assert.deepEqual((s.objects.find((o) => o.id === m3.id) as ImageObject).uttekt?.merki, ["s:ut:prof1"]);
  // sama hæð aftur á sömu mynd = ekkert gerist
  assert.equal(tengjaVidHaed(s.objects, m3.id, { haedId: "h194a" }, haedir).objects, s.objects);
});

test("Tengja við hæð á sama blaði: merki hæðarinnar innan hlutans koma á borðið; annað blað er tilkynnt", () => {
  const r = eftirCrop();
  const haedir: UttektHaed[] = [
    ...fersk(),
    { id: "hB", nafn: "2. hæð", image_url: IMAGE_URL, markers: [{ unitId: 25500, x: 3000, y: 2000 }, { unitId: 25501, x: 100, y: 100 }] },
    { id: "hC", nafn: "3. hæð", image_url: "/.netlify/functions/teikn-mynd?url=annad", markers: [{ unitId: 25502, x: 10, y: 10 }] },
  ];
  const m2 = r.myndir[1];
  const u = tengjaVidHaed(r.objects, m2.id, { haedId: "hB" }, haedir, { taeki: [{ id: 25500, serial: "TMP-ABCDEF", type: "Léttvatn", status: "active" }], staerd: 40 });
  assert.equal(u.sett, 1, "aðeins merkið innan hlutans");
  const t = u.objects.find((o) => o.type === "symbol" && o.uttektUnitId === 25500) as SymbolObject;
  assert.equal(t.parentId, m2.id);
  assert.equal(t.label, "ABCDEF");
  assert.deepEqual(taknIMerki(t, m2, FRUM, H2), { x: 3000, y: 2000 });
  assert.deepEqual((u.objects.find((o) => o.id === m2.id) as ImageObject).uttekt?.merki, ["25500"]);
  const af = afleidingTengingar(u.objects, r.myndir[2], "hC", haedir);
  assert.equal(af.annadBlad, true);
  assert.equal(af.merkiAnnarsBlads, 1);
});

// ── Vista í úttekt: margar hæðir af einu blaði ───────────────────────────────────────────────────────────────────

test("Vista í úttekt: þrjár hæðir af sama blaði — sama image_url, þrír skurðir, tæki á 2. hæð, 1. hæð varðveitt", () => {
  const r = eftirCrop();
  const [m1, m2, m3] = r.myndir;
  const haedir = fersk();
  let o = tengjaVidHaed(r.objects, m2.id, { haedId: "hNY2", nyttNafn: "2. hæð" }, haedir).objects;
  o = tengjaVidHaed(o, m3.id, { haedId: "hNY3", nyttNafn: "3. hæð" }, haedir).objects;
  // tæki 25448 sett á 2. hæð á (3100, 2000) frummyndar — og það var áður skráð á 1. hæð
  haedir[0].markers!.push({ unitId: 25448, x: 2600, y: 3300 });
  const mynd2 = o.find((x) => x.id === m2.id) as ImageObject;
  const p = merkiIBord({ x: 3100, y: 2000 }, mynd2, FRUM, 40, 0, H2);
  o = [...o, takn("tk", p.x + 20, p.y + 20, { uttektUnitId: 25448, parentId: m2.id, uttektPx: 40 })];

  const u = utbuaVistun(o, haedir, "2026-10-06T20:00:00.000Z", naestaId());
  assert.equal(u.haedir.length, 3);
  assert.deepEqual(u.haedir.map((h) => h.nafn), ["1. hæð", "2. hæð", "3. hæð"]);
  assert.ok(u.haedir.every((h) => h.image_url === IMAGE_URL), "sama blað á öllum hæðum");
  assert.deepEqual(u.haedir.map((h) => h.skurdur), [H1, H2, H3]);
  assert.ok(u.haedir.every((h) => h.frum!.b === 6006 && h.frum!.h === 4373 && h.sjalf === false));
  const [h1, h2, h3] = u.haedir;
  // 1. hæð: id, nafn, syn, stimpilStaerd og ÚT-merkið óbreytt; tækið flutt af henni
  assert.equal(h1.id, "h194a");
  assert.deepEqual(h1.syn, { skyrari: true });
  assert.equal(h1.stimpilStaerd, 30);
  assert.deepEqual(h1.markers, [haedir[0].markers![0]]);
  // 2. hæð: ný, með tækinu á réttum stað í frummyndinni
  assert.equal(h2.id, "hNY2");
  assert.deepEqual(h2.markers, [{ unitId: 25448, x: 3100, y: 2000 }]);
  assert.deepEqual(h2.veggir, []);
  assert.deepEqual(h2.pdfVeggir, []);
  // 3. hæð: ný og tóm
  assert.equal(h3.id, "hNY3");
  assert.deepEqual(h3.markers, []);
  assert.deepEqual(u.nyjarHaedir, ["hNY2", "hNY3"]);
  assert.deepEqual(u.hlutar.map((h) => [h.myndId, h.haedId, h.ny]), [
    [m1.id, "h194a", false],
    [m2.id, "hNY2", true],
    [m3.id, "hNY3", true],
  ]);
  assert.deepEqual(u.hlutar[1].merkiABordi, ["25448"]);
  // ferska röðin sjálf er ósnert
  assert.equal(haedir.length, 1);
  assert.equal(haedir[0].skurdur, null);
});

test("Vista í úttekt geymir stærð frummyndar líka fyrir heilt blað", () => {
  const haedir = fersk().map((h) => ({ ...h, frum: null }));
  const u = utbuaVistun([SHEET], haedir, "2026-10-09T22:00:00.000Z", naestaId());
  assert.deepEqual(u.haedir[0].frum, FRUM);
  assert.equal(haedir[0].frum, null, "ferska röðin sjálf er ósnert");
});

test("óhreyft merki með brotatölu (x,5) heldur nákvæmum hnitum þótt vörpunin um skurðinn námundi niður", () => {
  const r = eftirCrop();
  const m1 = r.myndir[0];
  const haedir = fersk();
  haedir[0].markers!.push({ unitId: 21940, x: 4000.5, y: 3700.25 });
  const p = merkiIBord({ x: 4000.5, y: 3700.25 }, m1, FRUM, 40, 0, H1);
  const o = [...r.objects, takn("t40", p.x + 20, p.y + 20, { uttektUnitId: 21940, parentId: m1.id })];
  const u = utbuaVistun(o, haedir, "kl", naestaId());
  assert.deepEqual(u.haedir[0].markers!.find((m) => m.unitId === 21940), { unitId: 21940, x: 4000.5, y: 3700.25 });
  assert.equal(u.breytt, 0);
});

test("vistun: tæki fært af 2. hæð yfir á 3. hæð á sama borði — eitt eintak, á 3. hæð", () => {
  const r = eftirCrop();
  const [, m2, m3] = r.myndir;
  const haedir = fersk();
  let o = tengjaVidHaed(r.objects, m2.id, { haedId: "hNY2", nyttNafn: "2. hæð" }, haedir).objects;
  o = tengjaVidHaed(o, m3.id, { haedId: "hNY3", nyttNafn: "3. hæð" }, haedir).objects;
  const mynd3 = o.find((x) => x.id === m3.id) as ImageObject;
  const p = merkiIBord({ x: 3000, y: 600 }, mynd3, FRUM, 40, 0, H3);
  // táknið er enn fest við 2. hluta (parentId) en stendur á 3. hluta — staðsetningin ræður
  o = [...o, takn("tk", p.x + 20, p.y + 20, { uttektUnitId: 25448, parentId: m2.id })];
  const u = utbuaVistun(o, haedir, "kl", naestaId());
  assert.deepEqual(u.haedir.find((h) => h.id === "hNY2")!.markers, []);
  assert.deepEqual(u.haedir.find((h) => h.id === "hNY3")!.markers, [{ unitId: 25448, x: 3000, y: 600 }]);
  assert.equal(u.utan, 0);
});

test("vistun stöðvast ef tvær myndir eru tengdar sömu hæð; hæð eytt í appinu stöðvar líka", () => {
  const r = eftirCrop();
  const o = r.objects.map((x) =>
    x.type === "image" && x.id === r.myndir[1].id ? { ...x, uttekt: { ...r.myndir[0].uttekt!, skurdur: H2, myndSkurdur: H2 } } : x
  );
  assert.throws(() => utbuaVistun(o, fersk(), "kl"), /Tvær myndir á borðinu eru tengdar „1\. hæð“/);
  assert.throws(() => utbuaVistun(r.objects, [], "kl"), /ekki lengur til/);
});

test("ein heil mynd (eldra borð): vistun hagar sér eins og áður — skurður og blað hæðarinnar ósnert", () => {
  const ut = merkiIBord({ x: 3000, y: 3500 }, SHEET, FRUM, 40);
  const o: BoardObject[] = [SHEET, takn("ut", ut.x + 20 + 30, ut.y + 20, { uttektUnitId: "s:ut:prof1", uttektKind: "sign", uttektSign: "ut" })];
  const u = utbuaVistun(o, fersk(), "kl", naestaId());
  assert.equal(u.haedir.length, 1);
  assert.equal(u.haedir[0].skurdur, null);
  assert.equal(u.haedir[0].sjalf, undefined);
  assert.equal(u.haedir[0].markers![0].x, Math.round(3000 + 30 / KX));
  assert.equal(u.hlutar.length, 1);
  assert.deepEqual(u.nyjarHaedir, []);
  // byggjaStodur með einni mynd = sama og byggjaStodurMargar
  assert.equal(byggjaStodur(o, SHEET, FRUM).stodur.size, 1);
});

test("hæð færð á ANNAÐ blað: skurður og veggir gömlu teikningarinnar falla út (383), merkin haldast", () => {
  const h: UttektHaed = {
    id: "x", nafn: "2. hæð", image_url: "/.netlify/functions/teikn-mynd?url=gamalt", markers: [{ unitId: 1, x: 5, y: 5 }],
    skurdur: { x: 1, y: 1, w: 50, h: 50 }, sjalf: true, thett: true, pdfVeggir: [[1, 2, 3, 4]], veggir: [[1, 1, 2, 2]],
    veggjaLinur: [{ p: [0, 0, 1, 1], t: 1 }], leidrett: { af: "turbopaint", kl: "x" }, syn: { a: 1 },
  };
  const bh = { nr: 2, svaedi: H2, frumB: 6006, frumH: 4373, imageUrl: IMAGE_URL };
  const n = stillaBladHaedar(h, bh, H2);
  assert.equal(n.image_url, IMAGE_URL);
  assert.deepEqual(n.skurdur, H2);
  assert.equal(n.sjalf, false);
  assert.equal("thett" in n, false);
  assert.deepEqual(n.pdfVeggir, []);
  assert.deepEqual(n.veggir, []);
  assert.equal("veggjaLinur" in n, false);
  assert.equal("leidrett" in n, false);
  assert.deepEqual(n.markers, h.markers);
  assert.deepEqual(n.syn, { a: 1 });
  // sama blað: veggirnir haldast
  const s = stillaBladHaedar({ ...h, image_url: IMAGE_URL }, bh, H2);
  assert.deepEqual(s.pdfVeggir, [[1, 2, 3, 4]]);
  assert.deepEqual(s.veggjaLinur, h.veggjaLinur);
});

test("„Croppa teikningu“ (einn rammi) á tengdri mynd: skurður myndarinnar fylgir og merkin varpast áfram rétt", () => {
  // blaðið skorið að 2. hæð með einum ramma — myndin minnkar, merki (3100, 2000) á að standa á sama stað
  const p = merkiIBord({ x: 3100, y: 2000 }, SHEET, FRUM, 40);
  const nytt = iBord(H2);
  const patch = skurdurEftirCrop(SHEET, nytt);
  const mynd = { ...SHEET, ...nytt, ...patch } as ImageObject;
  assert.ok(Math.abs(mynd.uttekt!.myndSkurdur!.x - H2.x) < 1e-6 && Math.abs(mynd.uttekt!.myndSkurdur!.w - H2.w) < 1e-6);
  assert.equal(mynd.uttekt!.skurdur, null, "skurður hæðarinnar (heil mynd) óbreyttur");
  assert.deepEqual(taknIMerki({ x: p.x, y: p.y, size: 40 }, mynd, FRUM, mynd.uttekt!.myndSkurdur), { x: 3100, y: 2000 });
  // ótengd mynd: ekkert breytist
  assert.deepEqual(skurdurEftirCrop({ ...SHEET, uttekt: undefined }, nytt), {});
  // hluti skorinn aftur: svæðið minnkar með og hæðarskurðurinn fylgir
  const r = eftirCrop();
  const m1 = r.myndir[0];
  const minna = { x: m1.x + 10 * KX, y: m1.y + 20 * KY, width: 1000 * KX, height: 500 * KY };
  const p2 = skurdurEftirCrop(m1, minna);
  assert.ok(Math.abs(p2.bladhluti!.svaedi.x - (H1.x + 10)) < 1e-6 && Math.abs(p2.bladhluti!.svaedi.w - 1000) < 1e-6);
  assert.deepEqual(p2.uttekt!.skurdur, p2.uttekt!.myndSkurdur);
});

test("3D: gólf skorinnar hæðar = hlutinn sjálfur (ekki reiknað eins og allt blaðið)", () => {
  const sk = { x: 2330, y: 1560, w: 2430, h: 1150 };
  const g = golfHaedar({ width: 2430, height: 1150, uttekt: { companyId: 194, haedId: "h", frumB: 6006, frumH: 4373, skurdur: sk, myndSkurdur: sk } });
  assert.deepEqual(g, { x0: -1215, y0: -575, x1: 1215, y1: 575 });
  // húsið minna en hlutinn: gólfið er húsið (+4 % spássía) innan hlutans
  const hus = { x: 2500, y: 1700, w: 1000, h: 500 };
  const g2 = golfHaedar({ width: 2430, height: 1150, uttekt: { companyId: 194, haedId: "h", frumB: 6006, frumH: 4373, skurdur: hus, myndSkurdur: sk } });
  const sp = 1000 * 0.04;
  assert.ok(Math.abs(g2.x0 - (170 - sp - 1215)) < 1e-9 && Math.abs(g2.x1 - (1170 + sp - 1215)) < 1e-9);
});

test("hjálparföll: slóð blaðs, sama blað, hæðanúmer, id á sniði Teikning", () => {
  assert.equal(myndSlodBlads(PERMALINK), IMAGE_URL);
  assert.equal(myndSlodBlads("https://teikningar.hafnarfjordur.is/data/x.pdf"), null);
  assert.ok(samaBlad(IMAGE_URL, "/.netlify/functions/teikn-mynd?url=" + encodeURIComponent(PERMALINK)));
  assert.ok(!samaBlad(IMAGE_URL, "/.netlify/functions/teikn-mynd?url=annad"));
  assert.equal(haedNumer("2. hæð"), 2);
  assert.equal(haedNumer("Kjallari"), null);
  assert.equal(tillagaHaedarNafns(["Kjallari", "1. hæð"]), "2. hæð");
  assert.match(nyttHaedId(), /^h[0-9a-z]{9,}$/);
});

test("Finna sjálfkrafa: þrjár grunnmyndir (veggjalínur) finnast, textablokk og rammi ekki", () => {
  const w = 400, h = 300;
  const g = new Uint8Array(w * h).fill(255);
  const lina = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y * w + x] = 0;
  };
  // rammi blaðsins
  lina(2, 2, w - 3, 3); lina(2, h - 4, w - 3, h - 3); lina(2, 2, 3, h - 3); lina(w - 4, 2, w - 3, h - 3);
  // þrjár grunnmyndir: útveggir + milliveggir
  for (const [x0, y0] of [[30, 30], [160, 30], [30, 170]]) {
    lina(x0, y0, x0 + 100, y0 + 1); lina(x0, y0 + 90, x0 + 100, y0 + 91); lina(x0, y0, x0 + 1, y0 + 90); lina(x0 + 99, y0, x0 + 100, y0 + 91);
    lina(x0 + 50, y0, x0 + 51, y0 + 60); lina(x0, y0 + 45, x0 + 40, y0 + 46);
  }
  // textablokk: margir smápunktar
  for (let y = 180; y < 260; y += 6) for (let x = 250; x < 370; x += 5) lina(x, y, x + 2, y + 2);
  const k = finnaGrunnmyndir(g, w, h, { vikkun: 4 });
  assert.equal(k.length, 3, JSON.stringify(k));
  assert.ok(Math.abs(k[0].x * w - 30) < 8 && Math.abs(k[0].y * h - 30) < 8);
  assert.ok(Math.abs(k[1].x * w - 160) < 8);
  assert.ok(Math.abs(k[2].y * h - 170) < 8);
});
