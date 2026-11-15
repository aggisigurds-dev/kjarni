import assert from "node:assert/strict";
import { test } from "node:test";
import { ljosBorda, metaBord, SYNIBORD_NAFN, taekiATeikningu, veggjaMunur, type SyncBord, type SyncUttekt } from "./sync-stada";
import { utbuaVistun, type UttektHaed, type UttektTaeki } from "./uttekt";
import { nyrVeggur } from "./veggja-ritill";
import type { BoardObject, ImageObject, SymbolObject } from "./types";

// Sync-ljósin (Agnar 15.11.2026): rautt = úttektin er nýrri/önnur, gult = óvistuð vinna á borði, grænt = í sync,
// grátt = ótengt. Úttektin í prófunum er það sem „Vista í úttekt" hefði skrifað úr borðinu (utbuaVistun), svo prófin
// gera ekki ráð fyrir neinu um hnitavörpunina — aðeins um hvað telst munur og í hvora áttina hann er.

const KL = "2026-11-01T10:00:00.000Z";
const FYRR = "2026-10-20T10:00:00.000Z";
const SIDAR = "2026-11-05T10:00:00.000Z";

const TAEKI: UttektTaeki[] = [
  { id: 101, serial: "A1", type: "Léttvatn", status: "active" },
  { id: 102, serial: "A2", type: "Léttvatn", status: "active" },
  { id: 103, serial: "A3", type: "Léttvatn", status: "urelt" },
];

function mynd(): ImageObject {
  return {
    id: "m",
    type: "image",
    assetId: "a0",
    x: 0,
    y: 0,
    width: 1000,
    height: 500,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    name: "blað",
    uttekt: { companyId: 7, haedId: "h1", frumB: 1000, frumH: 500, skurdur: null, merki: ["101", "102"] },
  } as ImageObject;
}

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
  } as SymbolObject;
}

const tomHaed = (): UttektHaed => ({ id: "h1", nafn: "1. hæð", frum: { b: 1000, h: 500 }, markers: [] });

/** Borð með tveimur tengdum tækjum + úttektin eins og vistun hefði skilið við hana → í sync. */
function iSync(auka: BoardObject[] = []) {
  const objects: BoardObject[] = [
    mynd(),
    takn("t1", 300, 200, { uttektUnitId: 101 }),
    takn("t2", 600, 300, { uttektUnitId: 102 }),
    ...auka,
  ];
  const u = utbuaVistun(objects, [tomHaed()], KL, undefined, 56, { taeki: TAEKI });
  const uttekt: SyncUttekt = { haedir: u.haedir, taeki: TAEKI, uppfaert: KL };
  return { objects, uttekt };
}
const bord = (objects: BoardObject[], updatedAt = KL, name = "Staður — 1. hæð") => ({ name, updatedAt, objects });

test("borð sem var vistað í úttekt og ekkert breyttist síðan er í sync", () => {
  const { objects, uttekt } = iSync();
  const mat = metaBord(bord(objects), uttekt);
  assert.deepEqual(mat.raud, []);
  assert.deepEqual(mat.gul, []);
  assert.equal(mat.cid, 7);
  assert.deepEqual(mat.haedIds, ["h1"]);
  assert.equal(mat.maEndurbyggja, true);
  assert.deepEqual(mat.taeki, { virk: 2, aTeikningu: 2 });
});

test("merki sett á úttektarteikninguna eftir á (appið / greining) → rautt: vantar á borðið", () => {
  const { objects, uttekt } = iSync();
  uttekt.haedir[0].markers!.push({ unitId: "n:lettvatn:x1", x: 100, y: 100, nytt: true, tegund: "Léttvatn" });
  const mat = metaBord(bord(objects), uttekt);
  assert.match(mat.raud.join("|"), /1 merki á úttektarteikningunni vantar á borðið/);
  assert.deepEqual(mat.gul, []);
});

test("tæki sett á borðið en aldrei vistað í úttekt → gult (ekki eyða án þess að skoða)", () => {
  const { objects, uttekt } = iSync();
  const mat = metaBord(bord([...objects, takn("nytt", 800, 100)]), uttekt);
  assert.deepEqual(mat.raud, []);
  assert.match(mat.gul.join("|"), /1 tákn á borðinu aldrei vistað í úttekt/);
});

test("tengt tæki tekið af borðinu en er enn í úttekt → gult (óvistað)", () => {
  const { objects, uttekt } = iSync();
  const mat = metaBord(bord(objects.filter((o) => o.id !== "t2")), uttekt);
  assert.match(mat.gul.join("|"), /1 merki tekið af borðinu, óvistað/);
});

test("tæki sem borðið þekkti var tekið af úttektarteikningunni í appinu → rautt", () => {
  const { objects, uttekt } = iSync();
  uttekt.haedir[0].markers = uttekt.haedir[0].markers!.filter((m) => m.unitId !== 102);
  const mat = metaBord(bord(objects), uttekt);
  assert.match(mat.raud.join("|"), /1 tæki á borðinu var tekið af úttektarteikningunni/);
});

test("fært merki: stefnan ræðst af því hvort úttektin eða borðið er nýrra", () => {
  const a = iSync();
  a.uttekt.haedir[0].markers![0].x += 30;
  a.uttekt.uppfaert = SIDAR;
  assert.match(metaBord(bord(a.objects), a.uttekt).raud.join("|"), /1 merki er á öðrum stað í úttektinni/);
  const b = iSync();
  b.uttekt.haedir[0].markers![0].x += 30;
  b.uttekt.uppfaert = FYRR;
  const mat = metaBord(bord(b.objects), b.uttekt);
  assert.deepEqual(mat.raud, []);
  assert.match(mat.gul.join("|"), /1 merki fært á borðinu, óvistað/);
});

test("öll merki færð um sama vigur = blaðið endurskráð (hliðrun), ekki handfærsla", () => {
  const { objects, uttekt } = iSync();
  for (const m of uttekt.haedir[0].markers!) m.x += 50;
  uttekt.uppfaert = SIDAR;
  const mat = metaBord(bord(objects), uttekt);
  assert.match(mat.raud.join("|"), /hliðrað um \(-50, 0\) díla frá úttektinni/);
  assert.doesNotMatch(mat.raud.join("|"), /á öðrum stað/);
});

test("úttektin notar aðra teikningu (önnur frummynd) → rautt, hnit ekki borin saman", () => {
  const { objects, uttekt } = iSync();
  uttekt.haedir[0].frum = { b: 800, h: 400 };
  const mat = metaBord(bord(objects), uttekt);
  assert.match(mat.raud.join("|"), /aðra teikningu/);
  assert.doesNotMatch(mat.raud.join("|"), /hliðrað|öðrum stað/);
});

test("hæðin var endurgerð/eytt í úttektinni → rautt og ekki hægt að endurbyggja", () => {
  const { objects, uttekt } = iSync();
  uttekt.haedir = [{ id: "h9", nafn: "Ný hæð", markers: [] }];
  const mat = metaBord(bord(objects), uttekt);
  assert.match(mat.raud.join("|"), /ekki lengur til í úttektinni/);
  assert.equal(mat.maEndurbyggja, false);
});

test("staður án úttektarteikningar → rautt", () => {
  const { objects } = iSync();
  const mat = metaBord(bord(objects), null);
  assert.match(mat.raud.join("|"), /enga úttektarteikningu/);
  assert.equal(mat.cid, 7);
});

test("veggir: í sync, umfram í úttekt (rautt), umfram á borði (gult), engir á borði (rautt)", () => {
  const v1 = nyrVeggur([100, 100, 400, 100], { id: "v1", thykkt: 8, tegund: "veggur", parentId: "m" });
  const v2 = nyrVeggur([400, 100, 400, 300], { id: "v2", thykkt: 8, tegund: "veggur", parentId: "m" });
  const s = iSync([v1 as BoardObject]);
  assert.equal((s.uttekt.haedir[0].veggjaLinur || []).length, 1);
  const eins = metaBord(bord(s.objects), s.uttekt);
  assert.deepEqual([eins.raud, eins.gul], [[], []]);

  const bordMeira = metaBord(bord([...s.objects, v2 as BoardObject]), s.uttekt);
  assert.match(bordMeira.gul.join("|"), /Borðið hefur 1 vegg sem vantar í úttekt/);
  assert.deepEqual(bordMeira.raud, []);

  const u2 = iSync([v1 as BoardObject, v2 as BoardObject]);
  const uttektMeira = metaBord(bord(s.objects), u2.uttekt);
  assert.match(uttektMeira.raud.join("|"), /Úttektin hefur 1 vegg umfram borðið/);

  const engir = metaBord(bord(iSync().objects), u2.uttekt);
  assert.match(engir.raud.join("|"), /Úttektin hefur 2 veggi en borðið enga/);
});

test("veggjaMunur: þolmörk 2 dílar og sami veggur í hina áttina telst eins", () => {
  const a = [{ p: [0, 0, 100, 0], tegund: "veggur" }];
  assert.deepEqual(veggjaMunur(a, [{ p: [1, 2, 99, 0], tegund: "veggur" }]), { adeinsUttekt: 0, adeinsBord: 0 });
  assert.deepEqual(veggjaMunur(a, [{ p: [100, 0, 0, 0], tegund: "veggur" }]), { adeinsUttekt: 0, adeinsBord: 0 });
  assert.deepEqual(veggjaMunur(a, [{ p: [0, 5, 100, 5], tegund: "veggur" }]), { adeinsUttekt: 1, adeinsBord: 1 });
  assert.deepEqual(veggjaMunur(a, [{ p: [0, 0, 100, 0], tegund: "gler" }]), { adeinsUttekt: 1, adeinsBord: 1 });
});

test("taekiATeikningu telur virk tæki (ekki úrelt) og hve mörg eiga merki", () => {
  const { uttekt } = iSync();
  assert.deepEqual(taekiATeikningu(uttekt), { virk: 2, aTeikningu: 2 });
  uttekt.haedir[0].markers = uttekt.haedir[0].markers!.slice(0, 1);
  assert.deepEqual(taekiATeikningu(uttekt), { virk: 2, aTeikningu: 1 });
});

test("ótengt borð er grátt; vísbendingar um tómt borð, sýniborð og sjálfgefið nafn", () => {
  const tomt = metaBord(bord([], KL, "Nýtt borð"), null);
  assert.equal(tomt.cid, null);
  assert.deepEqual(tomt.visb, ["Tómt borð", "Ónefnt borð"]);
  const syni = metaBord(bord([takn("x", 10, 10)], KL, SYNIBORD_NAFN), null);
  assert.deepEqual(syni.visb, ["Sýniborð appsins"]);
  const l = ljosBorda([{ id: "a", name: "Nýtt borð", updatedAt: KL, mat: tomt }]);
  assert.equal(l.get("a")!.ljos, "gratt");
});

test("ljosBorda: eldra borð tengt sömu hæð er rautt afrit; gult gengur fyrir rauðu (óvistuð vinna ver borðið)", () => {
  const { objects, uttekt } = iSync();
  const iLagi = metaBord(bord(objects), uttekt);
  const b: SyncBord[] = [
    { id: "nytt", name: "Staður — 1. hæð", updatedAt: SIDAR, mat: iLagi },
    { id: "gamalt", name: "Staður — 1. hæð", updatedAt: FYRR, mat: iLagi },
  ];
  const l = ljosBorda(b);
  assert.equal(l.get("nytt")!.ljos, "graent");
  assert.equal(l.get("gamalt")!.ljos, "rautt");
  assert.equal(l.get("gamalt")!.eldraAfrit, true);
  assert.match(l.get("gamalt")!.astaedur[0], /Eldra afrit/);

  // Úttekt nýrri (rautt) OG óvistað tákn á borðinu (gult) → gult: ekki eyða án þess að skoða
  uttekt.haedir[0].markers!.push({ unitId: "n:lettvatn:x1", x: 100, y: 100, nytt: true });
  const blandad = metaBord(bord([...objects, takn("nytt", 800, 100)]), uttekt);
  assert.ok(blandad.raud.length > 0 && blandad.gul.length > 0);
  assert.equal(ljosBorda([{ id: "x", name: "S — 1. hæð", updatedAt: KL, mat: blandad }]).get("x")!.ljos, "gult");
});
