import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  hillurButar,
  maelaSkekkju,
  hreinsaVeggi,
  husKassi,
  HAND_SPASSIA_M,
  husUtlina,
  lesaHandUtlinu,
  lesaVikmork,
  punktIFjolhyrningi,
  retta,
  sameinaSamlinur,
  SJALFGEFIN_VIKMORK,
  stakirButar,
  strikPunktLinur,
  utanHuss,
  type HLina,
} from "./veggja-hreinsun";

// 1 eining = 1 cm (dpm = 100)
const DPM = 100;
const L = (x0: number, y0: number, x1: number, y1: number, t = 15, tegund?: HLina["tegund"]): HLina =>
  tegund ? { p: [x0, y0, x1, y1], t, tegund } : { p: [x0, y0, x1, y1], t };
const ferningur = (x: number, y: number, b: number, h: number, t = 15): HLina[] => [
  L(x, y, x + b, y, t),
  L(x + b, y, x + b, y + h, t),
  L(x + b, y + h, x, y + h, t),
  L(x, y + h, x, y, t),
];
const endar = (l: HLina) => [l.p[0], l.p[1], l.p[l.p.length - 2], l.p[l.p.length - 1]].map((n) => Math.round(n));

test("vikmörk: sjálfgefin gildi og stilling úr JSON — ógild gildi hunsast", () => {
  const v = lesaVikmork('{"smellaM":0.2,"hurd":{"maxM":1.4},"lengjaM":-3,"rugl":5}');
  assert.equal(v.smellaM, 0.2);
  assert.equal(v.hurd.maxM, 1.4);
  assert.equal(v.hurd.minM, SJALFGEFIN_VIKMORK.hurd.minM);
  assert.equal(v.lengjaM, SJALFGEFIN_VIKMORK.lengjaM);
  assert.equal((v as unknown as Record<string, unknown>).rugl, undefined);
  assert.deepEqual(lesaVikmork("ekki json"), SJALFGEFIN_VIKMORK);
});

test("rétta: ±3° verður nákvæmlega 0° / 90° um miðjuna; 5° skáveggur óbreyttur", () => {
  assert.deepEqual(retta([0, 0, 1000, 30], 3), [0, 15, 1000, 15]); // 1,7°
  assert.deepEqual(retta([0, 0, 40, 1000], 3), [20, 0, 20, 1000]); // 2,3° frá lóðréttu
  assert.equal(retta([0, 0, 1000, 90], 3), null); // 5,1°
  assert.equal(retta([0, 0, 1000, 0], 3), null); // þegar beinn
});

test("sameina: samlínu bútar með < 10 cm bili og skörun renna saman; 30 cm bil og ólík tegund ekki", () => {
  const r = sameinaSamlinur([L(0, 0, 300, 0), L(306, 2, 600, 2), L(580, 0, 900, 0), L(1200, 0, 1500, 0), L(1500, 0, 1800, 0, 15, "gler")], 10, 5);
  const veggir = r.butar.filter((b) => !b.tegund);
  assert.equal(veggir.length, 2, JSON.stringify(r.butar));
  const langur = veggir.find((b) => Math.abs(b.p[2] - b.p[0]) > 800)!;
  assert.ok(Math.abs(Math.min(langur.p[0], langur.p[2]) - 0) < 1 && Math.abs(Math.max(langur.p[0], langur.p[2]) - 900) < 1);
  assert.equal(r.horfnir, 2);
  assert.equal(r.butar.filter((b) => b.tegund === "gler").length, 1);
});

test("sameina: súla (40 cm) í 10 cm vegg rennur EKKI saman við hann; tvítekning ofan á fastri línu fer", () => {
  const r = sameinaSamlinur([L(0, 0, 500, 0, 10), L(500, 0, 540, 0, 40), L(540, 0, 900, 0, 10)], 10, 5);
  assert.ok(r.butar.some((b) => b.t === 40), "súlan stendur");
  const fast = [L(0, 300, 1000, 300, 15)];
  const r2 = sameinaSamlinur([L(100, 302, 400, 302, 14), L(0, 600, 300, 600)], 10, 5, fast);
  assert.equal(r2.butar.length, 1);
  assert.equal(r2.butar[0].p[1], 600);
});

test("sameina: bútur sem rennur ekki saman kemur ÓBREYTTUR út — líka langt frá núllpunkti í hópi með örlítið skökkum bút", () => {
  // Fiskislóð 2. hæð 08.10.2026: meðalstefna hópsins (0,05°) hliðraði lóðréttum veggjum um 7–10 díla
  const a = L(3260, 1556, 3260, 3947, 7), b = L(1786, 1917, 1789, 3875, 6);
  const r = sameinaSamlinur([a, b], 7, 4);
  assert.equal(r.horfnir, 0);
  assert.ok(r.butar.some((x) => x.p.join() === a.p.join()), JSON.stringify(r.butar));
  assert.ok(r.butar.some((x) => x.p.join() === b.p.join()), JSON.stringify(r.butar));
});

test("strik-punkt: regluleg röð (langt strik + punktur) fer; veggur með hurðargötum stendur", () => {
  const asalina: HLina[] = [];
  for (let x = 0; x < 2000; x += 260) {
    asalina.push(L(x, 0, x + 200, 0, 5));
    asalina.push(L(x + 220, 0, x + 240, 0, 5));
  }
  const s = strikPunktLinur(asalina, DPM);
  assert.equal(s.size, asalina.length);
  // veggur með þremur hurðum (90 cm göt) — bilin eru utan strik-punkt-bilsins
  const hurdaveggur = [L(0, 500, 300, 500), L(390, 500, 700, 500), L(790, 500, 1100, 500), L(1190, 500, 1500, 500)];
  assert.equal(strikPunktLinur(hurdaveggur, DPM).size, 0);
  // stutt strikalína (falin lína): 60 cm strik, 20 cm bil
  const falin: HLina[] = [];
  for (let y = 0; y < 600; y += 80) falin.push(L(800, y, 800, y + 60, 4));
  assert.equal(strikPunktLinur(falin, DPM).size, falin.length);
});

test("stakir: 30 cm bútur sem tengist engu fer; tengdur í öðrum enda stendur; 80 cm stakur stendur", () => {
  const veggir = [L(0, 0, 1000, 0), L(500, 300, 530, 300), L(1000, 0, 1000, 40), L(200, 600, 280, 600)];
  const st = stakirButar(veggir, [], 50, 4);
  assert.deepEqual([...st], [1]);
});

test("hreinsun: horn smellast (≤ 15 cm), laus endi lengist að þvervegg (≤ 40 cm), 60 cm bil stendur opið", () => {
  const veggir = [
    L(0, 0, 990, 0), // 10 cm frá horninu
    L(1000, 8, 1000, 800), // horn
    L(500, 30, 500, 600), // laus endi 30 cm frá veggnum fyrir ofan → lengist (T)
    L(0, 800, 400, 800),
    L(460, 800, 1000, 800), // 60 cm bil (hurð / op) stendur
  ];
  const r = hreinsaVeggi(veggir, [], DPM);
  const a = r.linur.find((l) => Math.abs(l.p[1]) < 1 && Math.abs(l.p[3]) < 1 && Math.max(l.p[0], l.p[2]) > 900)!;
  assert.ok(a && Math.abs(Math.max(a.p[0], a.p[2]) - 1000) < 1, "lárétti veggurinn nær horninu: " + JSON.stringify(a));
  const b = r.linur.find((l) => Math.abs(l.p[0] - 1000) < 1 && Math.abs(l.p[2] - 1000) < 1)!;
  assert.ok(Math.abs(Math.min(b.p[1], b.p[3])) < 1, "lóðrétti veggurinn nær horninu: " + JSON.stringify(b));
  const t = r.linur.find((l) => Math.abs(l.p[0] - 500) < 1 && Math.abs(l.p[2] - 500) < 1)!;
  assert.ok(Math.abs(Math.min(t.p[1], t.p[3])) < 1, "T: endinn lengdist að veggnum: " + JSON.stringify(t));
  const nedri = r.linur.filter((l) => Math.abs(l.p[1] - 800) < 1 && Math.abs(l.p[3] - 800) < 1);
  assert.equal(nedri.length, 2, "60 cm bilið lokast ekki");
  assert.ok(r.talning.smellt >= 1 && r.talning.lengdir >= 1, JSON.stringify(r.talning));
});

test("hreinsun: fastar línur (Agnars) hreyfast aldrei — nýr veggur smellist AÐ þeim", () => {
  const fast = [L(0, 0, 1000, 0, 15)];
  const ny = [L(300, 12, 300, 500)];
  const r = hreinsaVeggi(ny, fast, DPM);
  assert.equal(r.linur.length, 1);
  assert.ok(Math.abs(Math.min(r.linur[0].p[1], r.linur[0].p[3])) < 1, JSON.stringify(r.linur[0]));
  assert.deepEqual(fast[0].p, [0, 0, 1000, 0]);
});

test("hreinsun: skáveggur (20°) heldur stefnu, næstum lóðréttur réttist, 2 cm brotalína verður bútar", () => {
  const r = hreinsaVeggi([L(0, 0, 940, 342), L(2000, 0, 2030, 800), { p: [3000, 0, 3000, 400, 3400, 400], t: 15 }], [], DPM, { ...SJALFGEFIN_VIKMORK, hillurM: 0 }); // hillusían slökkt: línurnar eru frístandandi
  const ska = r.linur.find((l) => l.p[0] < 100)!;
  assert.ok(Math.abs(Math.atan2(ska.p[3] - ska.p[1], ska.p[2] - ska.p[0]) * (180 / Math.PI) - 20) < 0.1);
  const rettur = r.linur.find((l) => l.p[0] > 1900 && l.p[0] < 2100)!;
  assert.equal(rettur.p[0], rettur.p[2]);
  assert.equal(r.linur.filter((l) => l.p[0] >= 3000).length, 2);
  assert.equal(r.talning.rettir, 1);
});

test("utan húss: lóðarmörk og nágrannahús utan útlínunnar fara; innveggir og útveggir með hurðargati standa", () => {
  const hus = [
    L(0, 0, 1000, 0),
    L(1000, 0, 1000, 800),
    L(1000, 800, 600, 800),
    L(510, 800, 0, 800), // 90 cm hurðargat í útvegg
    L(0, 800, 0, 0),
    L(500, 0, 500, 400), // innveggur
  ];
  const ruslid = [L(-800, -500, 1800, -500, 8), L(2500, 0, 3000, 0), L(2500, 0, 2500, 500)];
  const u = husUtlina([...hus, ...ruslid], DPM);
  assert.equal(u.lokud, true);
  const burt = utanHuss([...hus, ...ruslid], u);
  assert.deepEqual([...burt].sort(), [6, 7, 8]);
});

test("utan húss: raungögn veggjavélarinnar (Breiðhöfði 13, 2018-skönnun) — útlínan lokast ekki, en húsið helst: færri en 10 línur fara", () => {
  // 127 línur sem veggjavélin skilaði 04.11.2026; kvarðinn 49,4 dílar/m (blaðstærð 1:100). Áður fóru 80 af 110 línum út (492 m),
  // því varaleiðin var kassinn utan um minnsta lokaða herbergið.
  const raun = JSON.parse(readFileSync(new URL("./fixtures/veggjavel-breidhofdi-13-2018.json", import.meta.url), "utf8")) as { linur: { p: number[]; t: number; tegund?: HLina["tegund"] }[] };
  const dpm = 49.4;
  const vik = { ...SJALFGEFIN_VIKMORK, stakurM: Math.max(SJALFGEFIN_VIKMORK.stakurM, SJALFGEFIN_VIKMORK.stakurSkonnunM) };
  const hreint = hreinsaVeggi(raun.linur as HLina[], [], dpm, vik).linur;
  const u = husUtlina(hreint, dpm, vik.lokunM);
  assert.equal(u.lokud, false);
  const burt = utanHuss(hreint, u);
  assert.ok(burt.size < 10, "fjarlægðar línur: " + burt.size + " af " + hreint.length);
});

test("húskassi: stærsti veggjaklasinn + 2,5 % spássía; titilreitur (þunnar línur) utan hans", () => {
  const hus = [...ferningur(0, 0, 3000, 2000, 25), L(1500, 0, 1500, 2000, 15)];
  const titill = [...ferningur(5000, 1500, 800, 400, 2), L(5000, 1600, 5800, 1600, 2), L(5000, 1700, 5800, 1700, 2)];
  const k = husKassi([...hus, ...titill], DPM)!;
  assert.ok(k);
  assert.ok(Math.abs(k.x0 - -75) < 1 && Math.abs(k.x1 - 3075) < 1 && Math.abs(k.y0 - -75) < 1 && Math.abs(k.y1 - 2075) < 1, JSON.stringify(k));
});

test("hillur: langar frístandandi línur (rekkar) fara, veggir sem tengjast standa", () => {
  const dpm = 49.4;
  const hus = ferningur(0, 0, 2000, 1500, 12); // 40 x 30 m hús
  const rekkar = [L(500, 100, 500, 1400, 4), L(900, 100, 900, 1400, 4), L(1300, 100, 1300, 1400, 4), L(900, 700, 960, 700, 4)];
  const r = hreinsaVeggi([...hus, ...rekkar], [], dpm);
  assert.equal(r.talning.hillur, 3);
  assert.ok(r.linur.every((l) => !(l.p[0] === l.p[2] && l.p[0] >= 500 && l.p[0] <= 1300)), "enginn rekki eftir");
  const lag = hreinsaVeggi([...hus, ...rekkar], [], dpm, { ...SJALFGEFIN_VIKMORK, hillurM: 0 });
  assert.equal(lag.talning.hillur, 0);
});

test("hillur: raungögn Breiðhöfða 13 (2018-skönnun) — engin frístandandi lína ≥ 6 m eftir hreinsun, ytri veggur hússins stendur", () => {
  const raun = JSON.parse(readFileSync(new URL("./fixtures/veggjavel-breidhofdi-13-2018.json", import.meta.url), "utf8")) as { linur: HLina[] };
  const dpm = 49.4;
  const vik = { ...SJALFGEFIN_VIKMORK, stakurM: Math.max(SJALFGEFIN_VIKMORK.stakurM, SJALFGEFIN_VIKMORK.stakurSkonnunM) };
  const r = hreinsaVeggi(raun.linur, [], dpm, vik);
  assert.ok(r.talning.hillur >= 6, "hillur fjarlægðar: " + r.talning.hillur);
  assert.equal(hillurButar(r.linur, [], 6 * dpm, 0.15 * dpm).size, 0);
  assert.ok(r.linur.length >= 80, "of fáar línur eftir: " + r.linur.length);
});

test("utan húss: raungögn 2. hæðar (Breiðhöfði 13) — stærsti klasinn er skrifstofuhornið, en þungu klasarnir halda húsinu", () => {
  // 78 línur veggjavélarinnar 05.11.2026. Áður fóru 41 af 66 línum sem „utan húss": húskassinn náði aðeins yfir
  // skrifstofuhornið (flestir stuttir þykkir veggir) því ytri veggir lagersins voru hvorki 20 % af þeim klasa né innan 4 m.
  const raun = JSON.parse(readFileSync(new URL("./fixtures/veggjavel-breidhofdi-13-2018-2h.json", import.meta.url), "utf8")) as { linur: HLina[] };
  const dpm = 49.4;
  const vik = { ...SJALFGEFIN_VIKMORK, stakurM: Math.max(SJALFGEFIN_VIKMORK.stakurM, SJALFGEFIN_VIKMORK.stakurSkonnunM) };
  const hreint = hreinsaVeggi(raun.linur, [], dpm, vik).linur;
  const k = husKassi(hreint, dpm, { spassia: 0.02 })!;
  const br = (k.x1 - k.x0) / dpm, hae = (k.y1 - k.y0) / dpm;
  assert.ok(br > 60 && br < 80, "húskassinn nær yfir allt húsið, ekki bara hornið, og ekki út fyrir blaðið: " + Math.round(br) + " m");
  assert.ok(hae > 40 && hae < 60, "hæð kassans: " + Math.round(hae) + " m");
  const u = husUtlina(hreint, dpm, vik.lokunM);
  assert.equal(u.lokud, false);
  const burt = utanHuss(hreint, u);
  assert.ok(burt.size <= 10, "fjarlægðar línur: " + burt.size + " af " + hreint.length);
});

test("skekkja blaðsins: skakkt blað mælist og veggirnir réttast eftir því, beint blað mælist 0", () => {
  const dpm = 50;
  const sk = -0.6, r = (sk * Math.PI) / 180;
  const sn = (x: number, y: number): [number, number] => [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
  // tíu langir veggir á skökku blaði, hver með örlitlu viðbótarfrávki
  const skakkt: HLina[] = [];
  for (let i = 0; i < 6; i++) {
    const a = sn(100, 100 + i * 300), b = sn(1600 + (i % 2) * 4, 100 + i * 300 + (i % 2 ? 3 : -2));
    skakkt.push(L(a[0], a[1], b[0], b[1]));
  }
  for (let i = 0; i < 4; i++) {
    const a = sn(200 + i * 400, 100), b = sn(200 + i * 400 + 2, 1600);
    skakkt.push(L(a[0], a[1], b[0], b[1]));
  }
  const m = maelaSkekkju(skakkt, dpm);
  assert.ok(Math.abs(m - sk) < 0.25, "mæld skekkja " + m.toFixed(2) + "°");
  const h = hreinsaVeggi(skakkt, [], dpm, { ...SJALFGEFIN_VIKMORK, hillurM: 0 });
  assert.ok(Math.abs(h.talning.skekkja - sk) < 0.25, JSON.stringify(h.talning));
  // réttir veggir halda hallanum (ekki snúnir í nákvæmlega 0°)
  const lar = h.linur.find((l) => Math.abs(l.p[2] - l.p[0]) > Math.abs(l.p[3] - l.p[1]))!;
  const g = (Math.atan2(lar.p[3] - lar.p[1], lar.p[2] - lar.p[0]) * 180) / Math.PI;
  assert.ok(Math.abs(g - sk) < 0.15, "veggurinn fylgir blaðinu: " + g.toFixed(2) + "°");
  // beint blað: engin skekkja, og veggir verða nákvæmlega láréttir
  const beint = hreinsaVeggi([L(0, 0, 1500, 4), L(0, 400, 1500, -3), L(300, 0, 302, 1500), L(800, 0, 798, 1500), L(0, 800, 1500, 2), L(1200, 0, 1201, 1500)], [], dpm, { ...SJALFGEFIN_VIKMORK, hillurM: 0 });
  assert.equal(beint.talning.skekkja, 0);
  assert.equal(beint.linur[0].p[1], beint.linur[0].p[3]);
});

test("skekkja: notandinn getur sett hana sjálfur (skekkjaGradur) og 0 slekkur á mælingunni", () => {
  const dpm = 50;
  const sk = -0.6, r = (sk * Math.PI) / 180;
  const sn = (x: number, y: number): [number, number] => [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
  const linur: HLina[] = [];
  for (let i = 0; i < 8; i++) {
    const a = sn(100, 100 + i * 220), b = sn(1600, 100 + i * 220 + 3);
    linur.push(L(a[0], a[1], b[0], b[1]));
  }
  const med0 = hreinsaVeggi(linur, [], dpm, { ...SJALFGEFIN_VIKMORK, hillurM: 0, skekkjaGradur: 0 });
  assert.equal(med0.talning.skekkja, 0);
  assert.equal(med0.linur[0].p[1], med0.linur[0].p[3], "með skekkju 0 verða veggirnir nákvæmlega láréttir");
  const sett = hreinsaVeggi(linur, [], dpm, { ...SJALFGEFIN_VIKMORK, hillurM: 0, skekkjaGradur: -0.6 });
  assert.equal(sett.talning.skekkja, -0.6);
  assert.notEqual(sett.linur[0].p[1], sett.linur[0].p[3]);
});

test("húskassi: þungareglan hleypir hvorki titilreit, nágrannahúsi né ásalínum inn (Lisbeth 05.11.2026)", () => {
  const dpm = 50;
  const hus = [...ferningur(0, 0, 1500, 1000, 25), L(700, 0, 700, 1000, 15), L(0, 500, 1500, 500, 15)];
  const innan = (k: { x0: number; y0: number; x1: number; y1: number }, r: { x0: number; y0: number; x1: number; y1: number }) =>
    k.x0 <= r.x0 && k.y0 <= r.y0 && k.x1 >= r.x1 && k.y1 >= r.y1;
  // titilreitur 20 m til hliðar: kassi úr hárlínum með sjö textaröðum
  const titill = [...ferningur(2500, 400, 400, 200, 2), ...Array.from({ length: 7 }, (_, i) => L(2520, 430 + i * 22, 2880, 430 + i * 22, 2))];
  const kT = husKassi([...hus, ...titill], dpm)!;
  assert.ok(!innan(kT, { x0: 2500, y0: 400, x1: 2900, y1: 600 }), "titilreitur utan kassans: " + JSON.stringify(kT));
  // fjórar langar ásalínur 5 m fyrir ofan húsið
  const asar = Array.from({ length: 4 }, (_, i) => L(-200, -250 - i * 40, 2000, -250 - i * 40, 1));
  const kA = husKassi([...hus, ...asar], dpm)!;
  assert.ok(kA.y0 > -250, "ásalínur utan kassans: " + JSON.stringify(kA));
  // nágrannahús 20 m til hliðar, þykkir veggir en minna en 8 % af þunga hússins
  const nagr = ferningur(2600, 0, 300, 250, 20);
  const kN = husKassi([...hus, ...nagr], dpm)!;
  assert.ok(!innan(kN, { x0: 2600, y0: 0, x1: 2900, y1: 250 }), "nágrannahús utan kassans: " + JSON.stringify(kN));
});

test("skekkja: veggir Agnars eru mældir með — nógu langir ásréttir veggir hans ráða og halda nýjum veggjum ásréttum", () => {
  const dpm = 50;
  const sk = -0.6, r = (sk * Math.PI) / 180;
  const sn = (x: number, y: number): [number, number] => [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
  const nyjar: HLina[] = [];
  for (let i = 0; i < 8; i++) {
    const a = sn(100, 100 + i * 220), b = sn(1600, 100 + i * 220 + 3);
    nyjar.push(L(a[0], a[1], b[0], b[1]));
  }
  // Agnar hefur teiknað þrjá langa ásrétta veggi: þeir vega þyngra en skakka mælingin
  const fastar = [L(0, 0, 3000, 0), L(0, 1800, 3000, 1800), L(0, 0, 0, 1800)];
  // stuttir fastir veggir breyta engu (miðgildið liggur áfram í skakka hópnum) — en langir ásréttir veggir Agnars ráða
  const med = hreinsaVeggi(nyjar, fastar, dpm, { ...SJALFGEFIN_VIKMORK, hillurM: 0 });
  assert.ok(Math.abs(med.talning.skekkja - sk) < 0.25, "fáir stuttir fastir veggir ráða ekki: " + med.talning.skekkja);
  const langir = [L(0, 0, 9000, 0), L(0, 1800, 9000, 1800), L(0, 3600, 9000, 3600)];
  const radandi = hreinsaVeggi(nyjar, langir, dpm, { ...SJALFGEFIN_VIKMORK, hillurM: 0 });
  assert.equal(radandi.talning.skekkja, 0, "ásréttir veggir Agnars ráða: " + radandi.talning.skekkja);
  assert.deepEqual(fastar[0].p, [0, 0, 3000, 0], "fastar línur hreyfast aldrei");
});

test("húskassi: lítil álma með veggjaþykkum línum kemst inn, blaðrammi og hárfín lóðarmörk ekki (Lisbeth 05.11.2026)", () => {
  const dpm = 50;
  const hus = [...ferningur(0, 0, 1500, 1000, 25), L(700, 0, 700, 1000, 15)];
  const innan = (k: { x0: number; y0: number; x1: number; y1: number }, r: { x0: number; y0: number; x1: number; y1: number }) =>
    k.x0 <= r.x0 && k.y0 <= r.y0 && k.x1 >= r.x1 && k.y1 >= r.y1;
  // 8 × 6 m inngangsskúr úr 20 cm veggjum, 2 m frá húsinu — Á að komast inn
  const alma = ferningur(1600, 200, 400, 300, 20);
  const kA = husKassi([...hus, ...alma], dpm)!;
  assert.ok(innan(kA, { x0: 1600, y0: 200, x1: 2000, y1: 500 }), "lítil álma inni í kassanum: " + JSON.stringify(kA));
  // blaðrammi (hárlína) utan um allt — má EKKI stækka kassann
  const rammi = ferningur(-400, -400, 3000, 2000, 2);
  const kR = husKassi([...hus, ...rammi], dpm)!;
  assert.ok(kR.x1 - kR.x0 < 1800, "blaðrammi utan kassans: " + JSON.stringify(kR));
  // hárfín lóðarmörk sem umlykja húsið
  const lod = ferningur(-300, -300, 2600, 1800, 3);
  const kL = husKassi([...hus, ...lod], dpm)!;
  assert.ok(kL.x1 - kL.x0 < 1800, "hárfín lóðarmörk utan kassans: " + JSON.stringify(kL));
});

test("skekkja: aðeins handvirkt gildi blaðsins gengur fyrir — mælt gildi læsir ekki mælingunni", () => {
  const dpm = 50;
  const sk = -0.6, r = (sk * Math.PI) / 180;
  const sn = (x: number, y: number): [number, number] => [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
  const nyjar: HLina[] = [];
  for (let i = 0; i < 8; i++) {
    const a = sn(100, 100 + i * 220), b = sn(1600, 100 + i * 220 + 3);
    nyjar.push(L(a[0], a[1], b[0], b[1]));
  }
  // Agnar hefur teiknað langa ásrétta veggi: mælingin verður að fá að keyra svo þeir ráði
  const langir = [L(0, 0, 9000, 0), L(0, 1800, 9000, 1800), L(0, 3600, 9000, 3600)];
  const maelt = hreinsaVeggi(nyjar, langir, dpm, { ...SJALFGEFIN_VIKMORK, hillurM: 0 });
  assert.equal(maelt.talning.skekkja, 0, "mælingin keyrir og veggir Agnars ráða");
  // handvirkt gildi á blaðinu (skekkjaGradur) gengur fyrir og mælingin keyrir ekki
  const handvirkt = hreinsaVeggi(nyjar, langir, dpm, { ...SJALFGEFIN_VIKMORK, hillurM: 0, skekkjaGradur: -0.6 });
  assert.equal(handvirkt.talning.skekkja, -0.6, "handvirkt gildi ræður");
});

test("skekkja: 45 % fastar ráða EKKI (miðgildið er vegið með lengd — þröskuldurinn er helmingur)", () => {
  const dpm = 50;
  const sk = -0.6, r = (sk * Math.PI) / 180;
  const sn = (x: number, y: number): [number, number] => [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
  const nyjar: HLina[] = [];
  for (let i = 0; i < 10; i++) {
    const a = sn(100, 100 + i * 200), b = sn(1600, 100 + i * 200 + 3);
    nyjar.push(L(a[0], a[1], b[0], b[1]));
  }
  const nyLengd = 10 * 1500;
  // fastar ~45 % af heildarlengd: 4 × 3000 = 12.000 á móti 15.000
  const f45 = [L(0, 0, 3000, 0), L(0, 500, 3000, 500), L(0, 1000, 3000, 1000), L(0, 1500, 3000, 1500)];
  assert.ok(Math.abs(4 * 3000 / (nyLengd + 4 * 3000) - 0.44) < 0.02);
  assert.ok(Math.abs(hreinsaVeggi(nyjar, f45, dpm, { ...SJALFGEFIN_VIKMORK, hillurM: 0 }).talning.skekkja - sk) < 0.25, "45 % duga ekki");
  // 55 %: 6 × 3000 = 18.000 á móti 15.000
  const f55 = [...f45, L(0, 2000, 3000, 2000), L(0, 2500, 3000, 2500)];
  assert.equal(hreinsaVeggi(nyjar, f55, dpm, { ...SJALFGEFIN_VIKMORK, hillurM: 0 }).talning.skekkja, 0, "55 % ráða");
});

// ── handteiknuð útlína hússins (Agnar 06.11.2026: „ég vil að 2. hæð virki … þoli ekki að hafa læst") ─────────────────────

test("handteiknuð útlína: gild/ógild er lesin rétt, ógild fellur á vélina", () => {
  assert.deepEqual(lesaHandUtlinu([0, 0, 10, 0, 10, 10]), [0, 0, 10, 0, 10, 10]);
  assert.equal(lesaHandUtlinu([0, 0, 10, 0]), null, "tvö horn eru ekki útlína");
  assert.equal(lesaHandUtlinu([0, 0, 10, 0, 10]), null, "oddatala er ekki hnit");
  assert.equal(lesaHandUtlinu([0, 0, 10, NaN, 10, 10]), null);
  assert.equal(lesaHandUtlinu(null), null);
  assert.equal(lesaHandUtlinu("x"), null);
});

test("punktIFjolhyrningi: kúpt og íhvolf margstika", () => {
  const ferningur2 = [0, 0, 100, 0, 100, 100, 0, 100];
  assert.ok(punktIFjolhyrningi(50, 50, ferningur2));
  assert.ok(!punktIFjolhyrningi(150, 50, ferningur2));
  // L-laga hús: hornið uppi til hægri vantar
  const el = [0, 0, 100, 0, 100, 40, 40, 40, 40, 100, 0, 100];
  assert.ok(punktIFjolhyrningi(20, 80, el), "inni í leggnum");
  assert.ok(!punktIFjolhyrningi(80, 80, el), "í hornskarðinu sem er utan húss");
});

test("handteiknuð útlína gengur ALLTAF fyrir — líka þegar vélin hefði getað lokað útlínunni", () => {
  // lokað hús 0..1000 × 0..600, plús stakur veggur langt utan þess
  const hus = ferningur(0, 0, 1000, 600);
  const nagranni = L(2000, 0, 2400, 0);
  const vel = husUtlina([...hus, nagranni], DPM);
  assert.ok(vel.lokud && !vel.handvirk, "vélin finnur lokaða útlínu");
  assert.ok(vel.inni(500, 300));
  // Agnar teiknar útlínu utan um BARA vesturhelminginn (hann ræður hvað telst húsið)
  const hand = husUtlina([...hus, nagranni], DPM, undefined, undefined, [0, 0, 500, 0, 500, 600, 0, 600]);
  assert.ok(hand.handvirk && hand.lokud);
  assert.ok(hand.inni(250, 300), "vesturhelmingur er inni");
  assert.ok(!hand.inni(750, 300), "austurhelmingur er UTAN húss því Agnar sagði það, þótt vélin sæi hann sem hluta hússins");
  assert.deepEqual(hand.kassi, { x0: 0, y0: 0, x1: 500, y1: 600 });
});

test("handteiknuð útlína: veggur á jaðrinum fer ekki þótt hann liggi örlítið utan við hana", () => {
  const sp = HAND_SPASSIA_M * DPM; // 30 einingar
  const hand = [0, 0, 1000, 0, 1000, 600, 0, 600];
  const hus = husUtlina([], DPM, undefined, undefined, hand);
  // útveggur 20 cm utan við útlínuna (teiknuð með augunum) — innan svigrúmsins
  const utveggur = L(0, -20, 1000, -20);
  // 2 m utan við — raunverulega utan húss
  const lodarmork = L(0, -200, 1000, -200);
  const burt = utanHuss([utveggur, lodarmork], hus);
  assert.ok(!burt.has(0), "útveggurinn er EKKI fjarlægður");
  assert.ok(burt.has(1), "lóðarmörk 2 m utan útlínunnar eru fjarlægð");
  assert.ok(sp > 20 && sp < 200, "prófið mælir rétt svigrúm");
});

test("handteiknuð útlína: 2. hæðar-tilfellið — útlína vélarinnar lokast ekki, handteiknuð gerir það", () => {
  // opið hús: vantar austurvegginn (stórt op án hurðar) — vélin getur ekki lokað útlínunni
  const opid = [L(0, 0, 1000, 0), L(0, 600, 1000, 600), L(0, 0, 0, 600)];
  const vel = husUtlina(opid, DPM);
  assert.ok(!vel.lokud, "vélin: útlínan lokaðist ekki (aðeins kassinn)");
  const hand = husUtlina(opid, DPM, undefined, undefined, [0, 0, 1000, 0, 1000, 600, 0, 600]);
  assert.ok(hand.lokud && hand.handvirk, "handteiknuð: lokuð");
  assert.ok(hand.inni(500, 300));
  assert.ok(!hand.inni(1500, 300), "og það sem er utan hennar er utan húss");
});
