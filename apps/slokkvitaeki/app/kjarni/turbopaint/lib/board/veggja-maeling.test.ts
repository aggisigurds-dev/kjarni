// Mæling veggjagreiningar (lota 5, 17.11.2026): mælikvarðinn sjálfur + hreinsunin á RAUNGÖGNUM.
// Prufugögnin: fixtures/veggjamaeling/R1–R4.json = sannleikur (leiðréttir veggir Agnars + yfirferð, dílar frummyndar) og
// fixtures/veggjamaeling/hrar/R*.json = hráar línur greiningarinnar á sömu hæðum (vafri = skonnunarVeggir, thunnir =
// finnaThunnaVeggi, vel = Veggjavélin). Myndirnar eru EKKI í repóinu — tools/veggja-maeling.ts endurgerir hrar úr þeim.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { SJALFGEFIN_VIKMORK, type HLina, type Vikmork } from "./veggja-hreinsun";
import { hreinsunSkonnunar, maelaVeggi, type MaelLinaInn } from "./veggja-maeling";

test("mæling: sami veggur = 100 % / 100 %; hliðraður út fyrir vik = 0 %", () => {
  const raun = [{ p: [0, 0, 1000, 0], t: 10 }];
  const m = maelaVeggi(raun, [{ p: [0, 3, 1000, 3], t: 10 }], { dpm: 50 });
  assert.ok(m.hittni > 0.99 && m.nakvaemni > 0.99);
  const ut = maelaVeggi(raun, [{ p: [0, 40, 1000, 40], t: 10 }], { dpm: 50 });
  assert.equal(ut.hittni, 0);
  assert.equal(ut.nakvaemni, 0);
});

test("mæling: hálfur veggur fundinn = ~50 % hittni, 100 % nákvæmni; þverlína telst ekki", () => {
  const raun = [{ p: [0, 0, 1000, 0], t: 10 }];
  const m = maelaVeggi(raun, [{ p: [0, 0, 500, 0], t: 10 }], { dpm: 50 });
  assert.ok(Math.abs(m.hittni - 0.5) < 0.03, String(m.hittni));
  assert.ok(m.nakvaemni > 0.99);
  assert.equal(m.veggirFundnir, 0, "hálfur veggur er undir 60 % markinu");
  const thvert = maelaVeggi(raun, [{ p: [500, -200, 500, 200], t: 10 }], { dpm: 50 });
  assert.ok(thvert.hittni < 0.05);
});

test("mæling: greindur veggur á gluggalínu sannleikans er ekki rangur; týndur gluggi er ekki týndur veggur", () => {
  const raun: MaelLinaInn[] = [{ p: [0, 0, 1000, 0], t: 10 }, { p: [1000, 0, 1500, 0], t: 6, tegund: "gler" }];
  const m = maelaVeggi(raun, [{ p: [0, 0, 1500, 0], t: 10 }], { dpm: 50 });
  assert.ok(m.hittni > 0.99 && m.nakvaemni > 0.99);
});

type Fix = { id: string; dpm: number; svaedi: { x: number; y: number; w: number; h: number }; linur: MaelLinaInn[] };
type Hrar = { vafri: HLina[]; vafriTexti: number[]; vafriMals: number[]; thunnir: HLina[]; harlinur: HLina[]; harlinurMals: number[]; vel: HLina[] | null };
const lesa = <T>(s: string) => JSON.parse(readFileSync(new URL(s, import.meta.url), "utf8")) as T;
const SETT = ["R1", "R2", "R3", "R4"].map((id) => ({ f: lesa<Fix>(`./fixtures/veggjamaeling/${id}.json`), h: lesa<Hrar>(`./fixtures/veggjamaeling/hrar/${id}.json`) }));

function heild(leid: "vafri" | "vel", vik: Vikmork, o: { harlinur?: boolean; texti?: boolean; mals?: boolean } = {}) {
  let hR = 0, R = 0, nG = 0, G = 0;
  for (const { f, h } of SETT) {
    // vafriMals / harlinurMals: vísar málsetningasíunnar (veggja-linur.ts malsetningaLinur, reiknaðir af tools/veggja-maeling.ts
    // --vista-hrar í fullri upplausn — myndirnar eru ekki í repóinu)
    const burt = new Set([...(o.texti ? h.vafriTexti : []), ...(o.mals ? h.vafriMals : [])]);
    const burtH = new Set(o.mals ? h.harlinurMals : []);
    const grunnur = leid === "vel" ? h.vel : h.vafri.filter((_, i) => !burt.has(i));
    if (!grunnur) continue;
    const greint = hreinsunSkonnunar([...grunnur, ...h.thunnir, ...(o.harlinur ? h.harlinur.filter((_, i) => !burtH.has(i)) : [])], f.dpm, vik).linur;
    const m = maelaVeggi(f.linur, greint, { dpm: f.dpm, svaedi: f.svaedi });
    hR += m.hittni * m.raunM;
    R += m.raunM;
    nG += m.nakvaemni * m.greintM;
    G += m.greintM;
  }
  return { hittni: hR / R, nakvaemni: nG / G };
}

test("raungögn (4 hæðir): myndgreining vafrans + hreinsun — hittni ≥ 64 %, nákvæmni ≥ 76,5 % (grunnlína 17.11: 49,7 % / 77,6 %)", () => {
  // umferð 3: kassasían (einangraðir smáir hópar) kostar 0,7 stig hittni hér (65,2 → 64,5 %) — innan leyfðra 1–2 stiga
  const n = heild("vafri", SJALFGEFIN_VIKMORK);
  assert.ok(n.hittni >= 0.64, `hittni ${n.hittni.toFixed(3)}`);
  assert.ok(n.nakvaemni >= 0.765, `nákvæmni ${n.nakvaemni.toFixed(3)}`);
  // gamla hillureglan (hver frístandandi lína ≥ 6 m fór) felldi útveggi og brunaveggi
  const gamla = heild("vafri", { ...SJALFGEFIN_VIKMORK, hillurSystkini: 0, hillurEinarUndirM: 0 });
  assert.ok(gamla.hittni < 0.52, `gamla reglan ${gamla.hittni.toFixed(3)}`);
});

test("raungögn úr appinu (R3, TIF-frumrit): opin útlína hendir engu — hittni ≥ 53 % (var 40,6 % þegar kassinn skar húsið)", () => {
  const { f } = SETT[2];
  const app = lesa<{ hrar: HLina[]; dpm: number }>("./fixtures/veggjamaeling/hrar/R3-app.json");
  const m = maelaVeggi(f.linur, hreinsunSkonnunar(app.hrar, app.dpm).linur, { dpm: f.dpm, svaedi: f.svaedi });
  assert.ok(m.hittni >= 0.53, `hittni ${m.hittni.toFixed(3)}`);
  assert.ok(m.nakvaemni >= 0.69, `nákvæmni ${m.nakvaemni.toFixed(3)}`);
});

test("raungögn (4 hæðir): vafraleiðin MEÐ hárlínupörum (sjalfvirkt.ts síðan lota 5) — hittni ≥ 78 %, nákvæmni ≥ 77 %", () => {
  const n = heild("vafri", SJALFGEFIN_VIKMORK, { harlinur: true });
  assert.ok(n.hittni >= 0.78, `hittni ${n.hittni.toFixed(3)}`);
  assert.ok(n.nakvaemni >= 0.77, `nákvæmni ${n.nakvaemni.toFixed(3)}`);
});

test("raungögn (4 hæðir): vafraleiðin með hárlínupörum, textasíu og teygðri fölri skönnun (sjalfvirkt.ts síðan lota 5) — hittni ≥ 80 %, nákvæmni ≥ 80 %", () => {
  const n = heild("vafri", SJALFGEFIN_VIKMORK, { harlinur: true, texti: true });
  assert.ok(n.hittni >= 0.8, `hittni ${n.hittni.toFixed(3)}`);
  assert.ok(n.nakvaemni >= 0.8, `nákvæmni ${n.nakvaemni.toFixed(3)}`);
});

test("raungögn (4 hæðir): Veggjavélin + hreinsun — hittni ≥ 89 %, nákvæmni ≥ 88 % (sannleikurinn er leiðrétting á úttaki hennar)", () => {
  // umferð 3: kassasían kostar 0,3 stig hittni á R2 (89,7 → 89,4 %)
  const n = heild("vel", SJALFGEFIN_VIKMORK);
  assert.ok(n.hittni >= 0.89, `hittni ${n.hittni.toFixed(3)}`);
  assert.ok(n.nakvaemni >= 0.88, `nákvæmni ${n.nakvaemni.toFixed(3)}`);
});

test("raungögn (4 hæðir): vafraleiðin með málsetningasíu + kössum + útstæðum línum (sjalfvirkt.ts síðan umferð 3) — hittni ≥ 79 %, nákvæmni ≥ 80,5 %", () => {
  const n = heild("vafri", SJALFGEFIN_VIKMORK, { harlinur: true, texti: true, mals: true });
  assert.ok(n.hittni >= 0.79, `hittni ${n.hittni.toFixed(3)}`);
  assert.ok(n.nakvaemni >= 0.805, `nákvæmni ${n.nakvaemni.toFixed(3)}`);
});

test("raungögn úr appinu (R3, TIF-frumrit, umferð 3): málsetningasía + kassar + útstæðar línur — hittni ≥ 87 %, nákvæmni ≥ 81 % (umferð 2: 87,4 % / 58,1 %)", () => {
  const { f } = SETT[2];
  const app = lesa<{ hrar: HLina[]; dpm: number }>("./fixtures/veggjamaeling/hrar/R3-app-u3.json");
  const m = maelaVeggi(f.linur, hreinsunSkonnunar(app.hrar, app.dpm).linur, { dpm: f.dpm, svaedi: f.svaedi });
  assert.ok(m.hittni >= 0.87, `hittni ${m.hittni.toFixed(3)}`);
  assert.ok(m.nakvaemni >= 0.81, `nákvæmni ${m.nakvaemni.toFixed(3)}`);
  // án nýju hreinsunarskrefanna (kassar, útstæðar línur) — sömu hráu línur
  const an = maelaVeggi(f.linur, hreinsunSkonnunar(app.hrar, app.dpm, { ...SJALFGEFIN_VIKMORK, kassiMaxM: 0, utstaedM: 0, utstaedirEndar: 0 }).linur, { dpm: f.dpm, svaedi: f.svaedi });
  assert.ok(an.nakvaemni < m.nakvaemni - 0.05, `án kassa/útstæðra ${an.nakvaemni.toFixed(3)}`);
});
