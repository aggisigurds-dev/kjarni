// Eldveggir (Agnar 07.10.2026, Álfaborg 661 2. hæð): EI-merki festist við RAUNVERULEGAN vegg (ekki ásalínu), aðeins
// bútinn milli samskeyta, aldrei út fyrir húsið; eldveggur er veggur með tegund (ei60/ei30) sem vistast sem
// { tegund: "veggur", eld } og kemur eins til baka; „Lita veggi" er aðeins sýn.
import assert from "node:assert/strict";
import { test } from "node:test";
import { eiTegund, festaEiVidVeggi, samskeyti, skiptaVeggEftirFestingum, type EiMidi, type FestiVeggur } from "./ei-festing";
import { beitaEi, husRammi } from "./ei-beiting";
import { husUrBordi } from "./hus3d";
import { lesaVeggjaLinur, tegundUrVistun, veggirHaedar, vistunarSnid } from "./teikning-veggir";
import type { BoardObject, ImageObject, LineObject } from "./types";
import { skrifaVeggiIHaed, veggirIBord, veggirIFrum, type UttektHaed } from "./uttekt";
import { erVeggur, stillaVeggTegund, VEGG_LITIR, VEGG_NOFN } from "./veggja-leidretting";
import { nyrVeggur, talningTexti, veggjaTalning } from "./veggja-ritill";
import { SKAERIR_VEGGLITIR, synilegurVegglitur } from "./veggja-syn";
import { isRatedFirewallWall } from "./crossings";

// Hús 1000 × 800: útveggir, veggur x=400 (y 0–300) sem endar á vegg y=300 (T), veggur x=700 (y 300–800).
const HUS: FestiVeggur[] = [
  { id: "n", p: [0, 0, 1000, 0], t: 10 },
  { id: "s", p: [0, 800, 1000, 800], t: 10 },
  { id: "v", p: [0, 0, 0, 800], t: 10 },
  { id: "a", p: [1000, 0, 1000, 800], t: 10 },
  { id: "x400", p: [400, 0, 400, 300], t: 8 },
  { id: "y300", p: [0, 300, 1000, 300], t: 8 },
  { id: "x700", p: [700, 300, 700, 800], t: 8 },
];
const midi = (x: number, y: number, lodrett: boolean, minutur: 30 | 60, reyk = false): EiMidi => ({ x, y, lodrett, minutur, reyk });

test("EI-merki festist við næsta vegg — aðeins bútinn milli samskeyta, ekki alla línuna", () => {
  const r = festaEiVidVeggi(
    [midi(200, 285, false, 60), midi(850, 315, false, 30), midi(415, 150, true, 60)],
    HUS,
    { seiling: 60, hus: { x0: -10, y0: -10, x1: 1010, y1: 810 } }
  );
  assert.deepEqual(r.lausir, []);
  const f = (id: string) => r.festingar.filter((x) => x.veggId === id).map((x) => [Math.round(x.s0), Math.round(x.s1), x.minutur]);
  // y300: EI-60 frá útvegg (x=0) að T-mótinu við x=400 · EI-30 frá x=700 (T) að útvegg (x=1000)
  assert.deepEqual(f("y300"), [[0, 400, 60], [700, 1000, 30]]);
  // lóðréttur miði við x=400: allur sá veggur (frá útvegg að y=300)
  assert.deepEqual(f("x400"), [[0, 300, 60]]);
});

test("samskeyti: T-mót, horn og kross — samsíða veggur í línu er ekki samskeyti", () => {
  assert.deepEqual(samskeyti({ a: [0, 300], b: [1000, 300], t: 8 }, HUS, { id: "y300", i: 0 }), [400, 700]);
  const iLinu: FestiVeggur[] = [{ id: "framhald", p: [1000, 300, 1400, 300], t: 8 }];
  assert.deepEqual(samskeyti({ a: [0, 300], b: [1000, 300], t: 8 }, iLinu), []);
});

test("miði langt frá vegg eða utan húss fær ENGA línu (miðinn stendur) — ekkert giskað", () => {
  const r = festaEiVidVeggi([midi(500, 600, false, 60), midi(1300, 300, false, 60)], HUS, {
    seiling: 60,
    hus: husRammi({ id: "p", type: "image" } as unknown as ImageObject, HUS, 10),
  });
  assert.deepEqual(r.festingar, []);
  assert.deepEqual(r.lausir, [0, 1]);
});

test("EI-CS (reykþétt hurð) festist ekki sem veggur", () => {
  const r = festaEiVidVeggi([midi(200, 285, false, 60, true)], HUS, { seiling: 60 });
  assert.deepEqual(r.festingar, []);
});

test("ásalína / veggur sem nær út fyrir húsið: eldveggurinn er klipptur við húsið, aldrei út fyrir það", () => {
  // greindur „veggur" eftir ásalínu frá x=-500 til 1500 (út í ásahringina) — ekkert sker hann
  const as: FestiVeggur[] = [{ id: "as", p: [-500, 700, 1500, 700], t: 6 }];
  const r = festaEiVidVeggi([midi(300, 690, false, 60)], as, { seiling: 60, hus: { x0: 0, y0: 0, x1: 1000, y1: 800 } });
  assert.equal(r.festingar.length, 1);
  const f = r.festingar[0];
  const x0 = -500 + f.s0, x1 = -500 + f.s1;
  assert.ok(x0 >= 0 - 1e-6 && x1 <= 1000 + 1e-6, `innan hússins: ${x0}–${x1}`);
});

test("lóðréttur miði velur lóðrétta vegginn þótt láréttur sé jafn nálægt (horn)", () => {
  const r = festaEiVidVeggi([midi(415, 290, true, 30)], HUS, { seiling: 60 });
  assert.equal(r.festingar.length, 1);
  assert.equal(r.festingar[0].veggId, "x400");
});

test("tegundaskipti: veggur klofnar í búta með tegund; eldveggur lækkar aldrei; ekkert = óbreyttur", () => {
  const h = skiptaVeggEftirFestingum([0, 300, 1000, 300], "veggur", [
    { butur: 0, s0: 0, s1: 400, minutur: 60 },
    { butur: 0, s0: 700, s1: 1000, minutur: 30 },
  ]);
  assert.deepEqual(h, [
    { p: [0, 300, 400, 300], tegund: "ei60" },
    { p: [400, 300, 700, 300], tegund: "veggur" },
    { p: [700, 300, 1000, 300], tegund: "ei30" },
  ]);
  assert.deepEqual(skiptaVeggEftirFestingum([0, 0, 10, 0], "ei60", [{ butur: 0, s0: 0, s1: 10, minutur: 30 }]), [{ p: [0, 0, 10, 0], tegund: "ei60" }]);
  assert.deepEqual(skiptaVeggEftirFestingum([0, 0, 10, 0, 10, 10], "veggur", []), [{ p: [0, 0, 10, 0, 10, 10], tegund: "veggur" }]);
  // brotalína: aðeins seinni bútur verður eldveggur
  assert.deepEqual(skiptaVeggEftirFestingum([0, 0, 10, 0, 10, 10], "veggur", [{ butur: 1, s0: 0, s1: 10, minutur: 60 }]), [
    { p: [0, 0, 10, 0], tegund: "veggur" },
    { p: [10, 0, 10, 10], tegund: "ei60" },
  ]);
  assert.equal(eiTegund(30), "ei30");
});

test("stillaVeggTegund: EI-60 / EI-30 / venjulegur — litur, nafn og veggur haldast í takt", () => {
  const w = nyrVeggur([0, 0, 100, 0], { id: "w", thykkt: 8, tegund: "veggur" });
  const e = stillaVeggTegund(w, "ei60");
  assert.equal(e.veggTegund, "ei60");
  assert.equal(e.stroke, "#d32f2f");
  assert.equal(e.name, "Veggur · EI-60");
  assert.ok(erVeggur(e));
  assert.ok(isRatedFirewallWall(e), "gegnumtök þekkja eldvegginn");
  const e30 = stillaVeggTegund(e, "ei30");
  assert.equal(e30.stroke, VEGG_LITIR.ei30);
  const aftur = stillaVeggTegund(e30, "veggur");
  assert.equal(aftur.stroke, VEGG_LITIR.veggur);
  assert.equal(aftur.name, VEGG_NOFN.veggur);
  assert.equal(talningTexti(veggjaTalning([w, e, e30] as BoardObject[])), "1 veggur · 2 eldveggir");
});

test("vistun: eldveggur → { tegund: 'veggur', eld } og til baka; eldri veggir óbreyttir (Fiskislóð)", () => {
  assert.deepEqual(vistunarSnid("ei60"), { tegund: "veggur", eld: 60 });
  assert.deepEqual(vistunarSnid("ei30"), { tegund: "veggur", eld: 30 });
  assert.deepEqual(vistunarSnid("gler"), { tegund: "gler" });
  assert.deepEqual(vistunarSnid(undefined), { tegund: "veggur" });
  assert.equal(tegundUrVistun("veggur", 60), "ei60");
  assert.equal(tegundUrVistun("ei30", undefined), "ei30");
  assert.equal(tegundUrVistun("hurd", 60), "hurd");
  const mynd = { id: "m", x: 0, y: 0, width: 4244, height: 6006 };
  const frum = { b: 4244, h: 6006 };
  const bord = veggirIBord(
    [
      { p: [0, 0, 100, 0], t: 7 },
      { p: [0, 10, 100, 10], t: 7, tegund: "ei60" },
      { p: [0, 20, 100, 20], t: 7, tegund: "ei30" },
    ],
    mynd,
    frum
  );
  assert.deepEqual(bord.map((o) => o.veggTegund), [undefined, "ei60", "ei30"]);
  assert.deepEqual(bord.map((o) => o.stroke), [VEGG_LITIR.veggur, "#d32f2f", "#ef5350"]);
  const vistad = veggirIFrum(bord as BoardObject[], mynd, frum);
  assert.deepEqual(vistad, [
    { p: [0, 0, 100, 0], t: 7, tegund: "veggur" },
    { p: [0, 10, 100, 10], t: 7, tegund: "veggur", eld: 60 },
    { p: [0, 20, 100, 20], t: 7, tegund: "veggur", eld: 30 },
  ]);
  // teikning_bord → TurboPaint: sama tegund aftur
  const lesid = lesaVeggjaLinur(JSON.parse(JSON.stringify(vistad)));
  assert.deepEqual(lesid.map((v) => v.tegund), ["veggur", "ei60", "ei30"]);
  const haedir: UttektHaed[] = [{ id: "h", markers: [] }];
  const ut = skrifaVeggiIHaed(haedir, "h", vistad, "2026-10-07T00:00:00.000Z");
  assert.equal(veggirHaedar(ut[0], frum).veggir.filter((v) => v.tegund === "ei60").length, 1);
  // eldri hæð án eld: nákvæmlega eins og áður
  const gamalt = [{ p: [1, 2, 3, 4], t: 5, tegund: "veggur" }, { p: [1, 2, 3, 4], t: 5 }, { p: [1, 2, 3, 4], t: 5, tegund: "gler" }];
  assert.deepEqual(lesaVeggjaLinur(gamalt), [{ p: [1, 2, 3, 4], t: 5, tegund: "veggur" }, { p: [1, 2, 3, 4], t: 5 }, { p: [1, 2, 3, 4], t: 5, tegund: "gler" }]);
});

test("3D: eldveggur er veggur með eldflokk (rauður), ekki laus merking", () => {
  const plan = { id: "p", type: "image", x: 0, y: 0, width: 1000, height: 800, assetId: "a", name: "2. hæð", rotation: 0, opacity: 1, locked: false, hidden: false } as unknown as ImageObject;
  const w = { ...nyrVeggur([100, 100, 900, 100], { id: "w", thykkt: 8, tegund: "ei60", parentId: "p" }) };
  const h = husUrBordi([plan, w] as BoardObject[]);
  assert.equal(h[0].veggir.length, 1);
  assert.equal(h[0].veggir[0].tegund, "veggur");
  assert.equal(h[0].veggir[0].eld, 60);
  assert.ok(!h[0].veggir[0].laus);
});

test("beitaEi: veggir borðsins klofna og fá eldflokk í einu skrefi; teikning án veggja fær aðeins eldveggjabútana", () => {
  const plan = { id: "p", type: "image", x: 0, y: 0, width: 1000, height: 800, assetId: "a", name: "2. hæð", rotation: 0, opacity: 1, locked: false, hidden: false } as unknown as ImageObject;
  const veggir = HUS.map((v) => nyrVeggur(v.p, { id: v.id, thykkt: v.t, tegund: "veggur", parentId: "p" }));
  let n = 0;
  const b = beitaEi([plan, ...veggir] as BoardObject[], plan, [midi(200, 285, false, 60), midi(850, 315, false, 30)], {
    seiling: 60,
    lota: "g1",
    nyttId: () => "ny" + n++,
  });
  assert.equal(b.eldveggir, 2);
  assert.equal(b.breyttir, 1);
  const lin = b.objects.filter((o): o is LineObject => o.type === "polyline");
  const eld = lin.filter((o) => o.veggTegund === "ei60" || o.veggTegund === "ei30");
  assert.deepEqual(eld.map((o) => [o.veggTegund, ...o.points]), [
    ["ei60", 0, 300, 400, 300],
    ["ei30", 700, 300, 1000, 300],
  ]);
  // vegglengdin heldur sér: y300 er nú 3 bútar, samtals 1000
  const y300 = lin.filter((o) => o.points[1] === 300 && o.points[3] === 300);
  assert.equal(y300.reduce((s, o) => s + Math.abs(o.points[2] - o.points[0]), 0), 1000);
  // vistast með eld
  const vistad = veggirIFrum(b.objects, { id: "p", x: 0, y: 0, width: 1000, height: 800 }, { b: 1000, h: 800 });
  assert.equal(vistad.filter((v) => v.eld === 60).length, 1);
  assert.equal(vistad.filter((v) => v.eld === 30).length, 1);
  // teikning án veggja: sjálfgreindir veggir eru aðeins akkeri — eldveggjabútarnir einir bætast við
  const b2 = beitaEi([plan] as BoardObject[], plan, [midi(200, 285, false, 60)], { seiling: 60, sjalf: HUS, lota: "g2", nyttId: () => "s" + n++ });
  const nyir = b2.objects.filter((o): o is LineObject => o.type === "polyline");
  assert.equal(nyir.length, 1);
  assert.equal(nyir[0].veggTegund, "ei60");
  assert.equal(nyir[0].greining, "g2");
  assert.deepEqual(nyir[0].points, [0, 300, 400, 300]);
});

test("„Lita veggi“ er aðeins sýn: geymdi liturinn breytist ekki", () => {
  assert.equal(synilegurVegglitur("#1c1917", undefined, false), "#1c1917");
  assert.equal(synilegurVegglitur("#1c1917", undefined, true), SKAERIR_VEGGLITIR.veggur);
  assert.equal(SKAERIR_VEGGLITIR.veggur, "#8b2cff");
  assert.equal(synilegurVegglitur("#d32f2f", "ei60", true), SKAERIR_VEGGLITIR.ei60);
  const w = nyrVeggur([0, 0, 1, 0], { id: "w", thykkt: 1, tegund: "veggur" });
  synilegurVegglitur(w.stroke, w.veggTegund, true);
  assert.equal(w.stroke, "#1c1917");
});
