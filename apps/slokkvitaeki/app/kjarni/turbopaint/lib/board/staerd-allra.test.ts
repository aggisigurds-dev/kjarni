import assert from "node:assert/strict";
import { test } from "node:test";
import { STAERD_MAX, STAERD_MIN, STAERD_SJALF } from "./merkjasafn";
import {
  eldriTengingarValinna,
  erUttektarTakn,
  jafnaHaed,
  klemmaTeiknPx,
  setjaStaerdValinna,
  skalaAllaHaed,
  skalaValin,
  skrefStaerdar,
  staerdHaedar,
  taknHaedar,
  upphafStaerdar,
  uppfaerdTenging,
} from "./staerd-allra";
import type { BoardObject, ImageObject, SymbolObject } from "./types";
import {
  husEining,
  medStaerdUmMidju,
  stimpilStaerdABladi,
  stimpilStaerdMyndar,
  taknEiningABladi,
  taknFyrirMerki,
  taknMidjaABordi,
  uppfaeraHaedir,
  utbuaVistun,
  type UttektHaed,
  type UttektMerki,
} from "./uttekt";

// Fiskislóð-líkt: blað 4244 × 6006 dílar, sett inn 1684 × 2384 á borðið; skurður hússins 2666 × 3068.
const FRUM = { b: 4244, h: 6006 };
const SK = { x: 800, y: 1590, w: 2666, h: 3068 };
const T = 22;
const E = taknEiningABladi({ width: 1684, height: 2384 }, SK, FRUM);
const MERKI: UttektMerki[] = [
  { unitId: 25442, x: 1200, y: 2000 },
  { unitId: 25445, x: 1500.5, y: 2600 },
  { unitId: "s:rafmagn:a1", x: 2000, y: 2400, kind: "sign", sign: "rafmagn", rot: 90, staerd: 52 },
  { unitId: "s:ut:b2", x: 2200, y: 3000, kind: "sign", sign: "ut", rot: 0 },
];
const HAED: UttektHaed = { id: "h1", nafn: "1. hæð", frum: FRUM, skurdur: SK, stimpilStaerd: T, markers: MERKI };

function bord(opts: { stimpilStaerd?: number | null } = {}): { objects: BoardObject[]; mynd: ImageObject } {
  const mynd: ImageObject = {
    id: "m1",
    type: "image",
    x: 0,
    y: 880,
    width: 1684,
    height: 2384,
    assetId: "a",
    name: "1. hæð",
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    uttekt: {
      companyId: 1612,
      haedId: "h1",
      frumB: FRUM.b,
      frumH: FRUM.h,
      skurdur: SK,
      merki: MERKI.map((m) => String(m.unitId)),
      ...(opts.stimpilStaerd === null ? {} : { stimpilStaerd: opts.stimpilStaerd ?? T, stimpilStaerdVid: opts.stimpilStaerd ?? T, taknEining: E }),
    },
  } as ImageObject;
  // eins og opnun úttektar (WhiteboardApp): sjálfgefið tákn = T · eining; eigin staerd í sama hlutfalli
  const takn = MERKI.map((m) => taknFyrirMerki(m, [{ id: 25442, serial: "TMP-1", type: "Léttvatn", status: null }, { id: 25445, serial: "TMP-2", type: "Duft", status: null }], mynd, FRUM, T * E, T));
  return { objects: [mynd, ...takn], mynd };
}

const midja = (s: BoardObject) => taknMidjaABordi(s as SymbolObject);
const fjarlaegd = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

test("einingin er línuleg vörpun stimpilStaerdABladi (56 px í Teikning = húsið ÷ 28); stimpilstærðin sjálf óbreytt", () => {
  assert.ok(Math.abs(husEining({ width: 1684, height: 2384 }, SK, FRUM) - (3068 * (1684 / 4244)) / 28) < 1e-9);
  assert.ok(Math.abs(E * STAERD_SJALF - husEining({ width: 1684, height: 2384 }, SK, FRUM)) < 1e-9);
  // óbreytt eldri hegðun: námundað, lágmark 24
  assert.equal(stimpilStaerdABladi({ width: 1684, height: 2384 }, 56, SK, FRUM), Math.max(24, Math.round(E * 56)));
  assert.equal(stimpilStaerdABladi({ width: 100, height: 100 }, 10), 24);
});

test("opnun: tákn = stimpilStaerd hæðarinnar · eining; eigin staerd (52) í sama hlutfalli; nýtt tákn sömu stærðar", () => {
  const { objects, mynd } = bord();
  const s = objects.filter((o): o is SymbolObject => o.type === "symbol");
  assert.ok(Math.abs(s[0].size - T * E) < 1e-9);
  assert.ok(Math.abs(s[2].size - 52 * E) < 1e-9, "rafmagnstaflan 52 px");
  assert.ok(Math.abs(stimpilStaerdMyndar(mynd, 40) - T * E) < 1e-9, "stimpilstærð TurboPaint (40) ræður ekki á tengdu borði");
  assert.equal(staerdHaedar(mynd), T);
});

test("medStaerdUmMidju: miðjan kyrr — líka snúið tákn (90° og 45°)", () => {
  for (const rotation of [0, 90, 45, 200]) {
    const s = { x: 100, y: 200, size: 40, rotation };
    const c = taknMidjaABordi(s);
    const n = medStaerdUmMidju(s, 13);
    assert.equal(n.size, 13);
    assert.ok(fjarlaegd(taknMidjaABordi(n), c) < 1e-9, `rot ${rotation}`);
  }
});

test("Stærð allra merkja: öll úttektartákn skalast um T1/T0, miðjur kyrrar, tengingin fær T1; eitt hlutfall", () => {
  const { objects, mynd } = bord();
  const u = upphafStaerdar(objects, mynd)!;
  assert.equal(u.T0, T);
  assert.equal(u.takn.length, 4);
  const r = skalaAllaHaed(objects, u, 11);
  for (const s of u.takn) {
    const n = r.get(s.id) as SymbolObject;
    assert.ok(Math.abs(n.size - s.size / 2) < 1e-9, "hálf stærð");
    assert.ok(fjarlaegd(midja(n), midja(s)) < 1e-9, "miðjan kyrr");
    assert.equal(n.rotation, s.rotation);
  }
  assert.equal((r.get("m1") as ImageObject).uttekt!.stimpilStaerd, 11);
  assert.equal((r.get("m1") as ImageObject).uttekt!.stimpilStaerdVid, T, "viðmiðið óbreytt — vistun ber saman");
  // lifandi dráttur: alltaf miðað við UPPHAFIÐ, svo 22 → 11 → 22 skilar nákvæmlega sömu stærð
  const fram = skalaAllaHaed(objects, u, 11), aftur = skalaAllaHaed(objects, u, 22);
  assert.ok(fram.size && [...u.takn].every((s) => Math.abs((aftur.get(s.id) as SymbolObject).size - s.size) < 1e-9));
});

test("klemmt: Teikning-stærð hvers tákns helst innan 10–160 px", () => {
  const { objects, mynd } = bord();
  const u = upphafStaerdar(objects, mynd)!;
  const litid = skalaAllaHaed(objects, u, 1);
  for (const s of u.takn) assert.ok((litid.get(s.id) as SymbolObject).size / E >= STAERD_MIN - 1e-9);
  assert.equal((litid.get("m1") as ImageObject).uttekt!.stimpilStaerd, STAERD_MIN);
  const stort = skalaAllaHaed(objects, u, 500);
  for (const s of u.takn) assert.ok((stort.get(s.id) as SymbolObject).size / E <= STAERD_MAX + 1e-9);
  // rafmagnstaflan (52) klemmist við 160 þegar hin eru 160·22/52… — hlutföll þjappast aðeins við endana
  assert.equal(klemmaTeiknPx(0), STAERD_MIN);
  assert.equal(klemmaTeiknPx(NaN), STAERD_MIN);
  assert.equal(klemmaTeiknPx(17.4), 17.4, "engin námundun");
});

test("Minni / Stærri ±15 % (minnst 1 px), klemmt", () => {
  assert.equal(skrefStaerdar(22, -1), 19);
  assert.equal(skrefStaerdar(22, 1), 25);
  assert.equal(skrefStaerdar(10, -1), 10);
  assert.equal(skrefStaerdar(160, 1), 160);
  assert.equal(skrefStaerdar(11, 1), 13);
});

test("vistun: stimpilStaerd hæðarinnar = nýja stærðin; staðsetningar óbreyttar; staerd aðeins á merkjum með eigin stærð", () => {
  const { objects, mynd } = bord();
  const u = upphafStaerdar(objects, mynd)!;
  const r = skalaAllaHaed(objects, u, 11);
  const eftir = objects.map((o) => r.get(o.id) ?? o);
  const v = utbuaVistun(eftir, [HAED], "kl");
  const h = v.haedir[0];
  assert.equal(h.stimpilStaerd, 11);
  assert.deepEqual(v.stimpilBreytt, ["h1"]);
  for (const m of MERKI) {
    const n = h.markers!.find((x) => x.unitId === m.unitId)!;
    assert.equal(n.x, m.x, `x ${m.unitId}`);
    assert.equal(n.y, m.y, `y ${m.unitId}`);
  }
  assert.equal(h.markers!.find((x) => x.unitId === 25442)!.staerd, undefined, "fylgir hæðinni");
  assert.equal(h.markers!.find((x) => x.unitId === "s:ut:b2")!.staerd, undefined);
  assert.equal(h.markers!.find((x) => x.unitId === "s:rafmagn:a1")!.staerd, 26, "52 → 26 (sama hlutfall)");
});

test("vistun án breytinga: ekkert stærðartengt skrifast (stimpilStaerd og staerd merkja óbreytt)", () => {
  const { objects } = bord();
  const v = utbuaVistun(objects, [HAED], "kl");
  assert.equal(v.haedir[0].stimpilStaerd, T);
  assert.deepEqual(v.stimpilBreytt, []);
  assert.deepEqual(v.haedir[0].markers, MERKI, "merkin fara óbreytt fram og til baka (líka 1500,5 og staerd 52)");
  assert.equal(v.breytt, 0);
});

test("eigin stærð eins merkis (eiginleikaspjaldið) vistast; aðeins valin tákn breytast", () => {
  const { objects } = bord();
  const s = objects.filter((o): o is SymbolObject => o.type === "symbol");
  const r = setjaStaerdValinna(objects, [s[0].id, s[3].id], 40);
  assert.deepEqual([...r.keys()].sort(), [s[0].id, s[3].id].sort());
  for (const id of [s[0].id, s[3].id]) {
    const n = r.get(id) as SymbolObject;
    assert.ok(Math.abs(n.size - 40 * E) < 1e-9);
    assert.ok(fjarlaegd(midja(n), midja(objects.find((o) => o.id === id)!)) < 1e-9);
  }
  const v = utbuaVistun(objects.map((o) => r.get(o.id) ?? o), [HAED], "kl");
  const mk = (u: unknown) => v.haedir[0].markers!.find((x) => x.unitId === u)!;
  assert.equal(mk(25442).staerd, 40);
  assert.equal(mk("s:ut:b2").staerd, 40);
  assert.equal(mk(25445).staerd, undefined, "óvalið óbreytt");
  assert.equal(mk("s:rafmagn:a1").staerd, 52);
  assert.equal(v.haedir[0].stimpilStaerd, T, "stærð hæðarinnar óbreytt");
  // Minni/Stærri valinna: hlutfall
  const sk = skalaValin(objects, [s[2].id], 0.5);
  assert.ok(Math.abs((sk.get(s[2].id) as SymbolObject).size - 26 * E) < 1e-9);
});

test("Jafna: öll tákn í stærð hæðarinnar — merki með eigin stærð fá staerd = stærð hæðarinnar", () => {
  const { objects, mynd } = bord();
  const u = upphafStaerdar(objects, mynd)!;
  const r = jafnaHaed(objects, u);
  for (const s of u.takn) assert.ok(Math.abs((r.get(s.id) as SymbolObject).size - T * E) < 1e-9);
  const v = utbuaVistun(objects.map((o) => r.get(o.id) ?? o), [HAED], "kl");
  assert.equal(v.haedir[0].markers!.find((x) => x.unitId === "s:rafmagn:a1")!.staerd, T);
  assert.equal(v.haedir[0].markers!.find((x) => x.unitId === 25442)!.staerd, undefined);
});

test("úttektartákn: tengd + merkjasafn; hönnunarstaðir (165.BR1) og önnur tákn ekki", () => {
  const { objects } = bord();
  const s = objects.find((o): o is SymbolObject => o.type === "symbol")!;
  assert.equal(erUttektarTakn(s), true);
  assert.equal(erUttektarTakn({ ...s, uttektUnitId: undefined, symbolId: "teikn:lettvatn" }), true, "laust tæki úr safninu");
  assert.equal(erUttektarTakn({ ...s, uttektUnitId: undefined, symbolId: "teikn:neydarutgangur" }), true, "merki úr safninu");
  assert.equal(erUttektarTakn({ ...s, uttektUnitId: undefined, name: "165.BR1 SLT", symbolId: "teikn:lettvatn" }), false);
  assert.equal(erUttektarTakn({ ...s, uttektUnitId: undefined, symbolId: "blanket" }), false, "aukatákn TurboPaint");
  assert.equal(taknHaedar(objects, "m1").length, 4);
});

test("eldri tenging (án stimpilStaerd): einingin leidd af táknunum, svo vörpunin haldist nákvæm; uppfærsla hreyfir ekkert", () => {
  // eldri reglan: sjálfgefið tákn = 24 borðdílar (stimpilStaerdABladi, lágmark), eigin staerd í hlutfalli við T
  const { objects: o0, mynd: m0 } = bord({ stimpilStaerd: null });
  const k = 24 / (T * E);
  const objects = o0.map((o) => (o.type === "symbol" ? medStaerdUmMidju(o, o.size * k) : o));
  const u = upphafStaerdar(objects, m0, T)!;
  assert.equal(u.T0, T);
  assert.ok(Math.abs(u.eining - 24 / T) < 1e-9);
  const ny = uppfaerdTenging(objects, m0, T)!;
  assert.equal(ny.uttekt!.stimpilStaerd, T);
  assert.ok(Math.abs(ny.uttekt!.taknEining! - 24 / T) < 1e-9);
  assert.equal(uppfaerdTenging(objects.map((o) => (o.id === "m1" ? ny : o)), ny, T), null, "þegar ný");
  // vistun eftir uppfærslu: ekkert breytist
  const v = utbuaVistun(objects.map((o) => (o.id === "m1" ? ny : o)), [HAED], "kl");
  assert.deepEqual(v.haedir[0].markers, MERKI);
  assert.equal(v.haedir[0].stimpilStaerd, T);
  // eiginleikaspjaldið uppfærir eldri tengingar valinna tákna
  const sid = objects.find((o) => o.type === "symbol")!.id;
  assert.ok(eldriTengingarValinna(objects, [sid], () => T).has("m1"));
});

test("uppfaeraHaedir með grunnStaerd: staerd jöfn virkri stærð skrifast ekki; nýtt merki án eigin stærðar fær enga", () => {
  const h: UttektHaed[] = [{ id: "h", markers: [{ unitId: 1, x: 10, y: 10 }, { unitId: 2, x: 20, y: 20, staerd: 40 }] }];
  const st = new Map<string, { x: number; y: number; unitId: number | string; staerd?: number }>([
    ["1", { x: 10, y: 10, unitId: 1, staerd: 22 }],
    ["2", { x: 20, y: 20, unitId: 2, staerd: 40 }],
    ["3", { x: 30, y: 30, unitId: 3, staerd: 22 }],
  ]);
  const r = uppfaeraHaedir(h, "h", st, { grunnStaerd: 22 });
  assert.deepEqual(r.haedir[0].markers, [{ unitId: 1, x: 10, y: 10 }, { unitId: 2, x: 20, y: 20, staerd: 40 }, { unitId: 3, x: 30, y: 30 }]);
  assert.equal(r.breytt, 0);
  // án grunnStaerd (eldri regla) skrifast 22 á merki 1
  assert.equal(uppfaeraHaedir(h, "h", st).haedir[0].markers![0].staerd, 22);
});
