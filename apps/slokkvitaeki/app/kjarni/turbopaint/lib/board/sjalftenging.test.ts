import assert from "node:assert/strict";
import { test } from "node:test";
import { midiTakns } from "./hus3d";
import { lykillFyrir } from "./merkjasafn";
import {
  erOtengtTaekjaTakn,
  liturMerkimida,
  MIDI_NYTT,
  MIDI_OTENGT,
  MIDI_TENGT,
  MIDI_YFIR,
  nyttTexti,
  stadsettirLyklar,
  TaekjaSjodur,
  tegundTakns,
} from "./sjalftenging";
import type { BoardObject, ImageObject, SymbolObject } from "./types";
import { taknFyrirMerki, utbuaVistun, type UttektHaed, type UttektMerki, type UttektTaeki } from "./uttekt";

// Álfaborg (661) í smækkaðri mynd: frummynd 2000×2000 á borðinu 1000×1000 (kvarði 0,5). Skráð tæki eins og á
// staðnum 07.10.2026: 5 Brunaslanga, 4 CO2, 4 Léttvatn, 1 ABC Duft.
const FRUM = { b: 2000, h: 2000 };
const S = 20;
function mynd(id: string, haedId: string, x = 0): ImageObject {
  return {
    id,
    type: "image",
    assetId: "a",
    x,
    y: 0,
    width: 1000,
    height: 1000,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    name: id,
    uttekt: { companyId: 661, haedId, frumB: FRUM.b, frumH: FRUM.h, skurdur: null, merki: [] },
  };
}
const TAEKI: UttektTaeki[] = [
  { id: 8214, serial: "AE-00009", type: "Léttvatn", status: "loaned" },
  { id: 8215, serial: "AE-00010", type: "Léttvatn", status: "loaned" },
  { id: 8216, serial: "AE-00011", type: "Léttvatn", status: "loaned" },
  { id: 8217, serial: "AE-00012", type: "Léttvatn", status: "loaned" },
  { id: 8218, serial: "AE-00013", type: "ABC Duft", status: "active" },
  { id: 8219, serial: "AE-00014", type: "CO2", status: "active" },
  { id: 8220, serial: "AE-00015", type: "CO2", status: "active" },
  { id: 8221, serial: "AE-00016", type: "CO2", status: "active" },
  { id: 8222, serial: "AE-00017", type: "CO2", status: "active" },
  { id: 8223, serial: "AE-00018", type: "Brunaslanga", status: "active" },
  { id: 8224, serial: "AE-00019", type: "Brunaslanga", status: "active" },
  { id: 8225, serial: "AE-00020", type: "Brunaslanga", status: "active" },
  { id: 8226, serial: "AE-00021", type: "Brunaslanga", status: "active" },
  { id: 8227, serial: "AE-00022", type: "Brunaslanga", status: "active" },
];
/** 1. hæð: 8214, 8215 staðsett; 2. hæð: 8217 (léttvatn) og 8218 (duft) staðsett — má EKKI taka. */
function haedir(): UttektHaed[] {
  return [
    {
      id: "h1",
      nafn: "1. hæð",
      markers: [
        { x: 100, y: 100, unitId: 8214 },
        { x: 200, y: 100, unitId: 8215 },
        { x: 300, y: 100, rot: 0, kind: "sign", sign: "rafmagn", color: "#eab308", unitId: "s:rafmagn:aaa" },
      ],
    },
    { id: "h2", nafn: "2. hæð", markers: [{ x: 100, y: 100, unitId: 8217 }, { x: 150, y: 150, unitId: 8218 }] },
  ];
}
let nr = 0;
function takn(symbolId: string, cx: number, cy: number, extra: Partial<SymbolObject> = {}): SymbolObject {
  nr++;
  return { id: "t" + nr, type: "symbol", symbolId, x: cx - S / 2, y: cy - S / 2, size: S, label: "", rotation: 0, opacity: 1, locked: false, hidden: false, name: symbolId, parentId: "m1", ...extra };
}
const lyklar = () => {
  let i = 0;
  return (t: string) => `n:${t}:test${++i}`;
};

/** Borðið eins og Agnar raðaði því: ~30 tækjatákn á 1. hæð (tvö þeirra tengd), engin raðnúmer. */
function bord(): BoardObject[] {
  const m1 = mynd("m1", "h1");
  m1.uttekt!.merki = ["8214", "8215", "s:rafmagn:aaa"];
  const o: BoardObject[] = [
    m1,
    takn("teikn:lettvatn", 50, 50, { uttektUnitId: 8214 }),
    takn("teikn:lettvatn", 100, 50, { uttektUnitId: 8215 }),
    takn("teikn:rafmagn", 150, 50, { uttektUnitId: "s:rafmagn:aaa", uttektKind: "sign", uttektSign: "rafmagn" }),
  ];
  // 8 slöngur, 9 léttvatn, 6 CO₂, 3 duft, 2 skilti (stimplar) = 28 ótengd tákn
  for (let i = 0; i < 8; i++) o.push(takn("teikn:slanga", 100 + i * 40, 300));
  for (let i = 0; i < 9; i++) o.push(takn("teikn:lettvatn", 100 + i * 40, 400));
  for (let i = 0; i < 6; i++) o.push(takn("teikn:co2", 100 + i * 40, 500));
  for (let i = 0; i < 3; i++) o.push(takn("teikn:duft", 100 + i * 40, 600));
  o.push(takn("teikn:skilti_slanga", 100, 700), takn("teikn:skilti_slt", 140, 700));
  return o;
}

test("Vista í úttekt: ótengd tækjatákn tengjast óstaðsettum tækjum af SÖMU tegund — restin Nýtt; ekkert tvítalið", () => {
  const b = bord();
  const u = utbuaVistun(b, haedir(), "2026-10-07T12:00:00.000Z", (s) => `s:${s}:t`, 56, { taeki: TAEKI, nyttLykill: lyklar() });
  const h1 = u.haedir.find((h) => h.id === "h1")!;
  const h2 = u.haedir.find((h) => h.id === "h2")!;
  // lausu tækin: slanga 5 (8223–8227), CO2 4 (8219–8222), léttvatn 2 (8216, … 8217 á 2. hæð), duft 0 (8218 á 2. hæð)
  const tengdEftir = (teg: string) => u.sjalftengd.filter((x) => x.type === teg).map((x) => x.unitId);
  assert.deepEqual(tengdEftir("Brunaslanga"), [8223, 8224, 8225, 8226, 8227]);
  assert.deepEqual(tengdEftir("CO2"), [8219, 8220, 8221, 8222]);
  assert.deepEqual(tengdEftir("Léttvatn"), [8216], "8214/8215 staðsett hér, 8217 á 2. hæð — aðeins 8216 laust");
  assert.deepEqual(tengdEftir("ABC Duft"), [], "eina duftið (8218) er á 2. hæð — ekki tekið");
  // Nýtt = restin, eftir tegund
  assert.deepEqual(u.nytt, { slanga: 3, lettvatn: 8, co2: 2, duft: 3 });
  assert.equal(nyttTexti(u.nytt), "16 ný tæki í biðstöðu — bíða samþykkis: Léttvatn 8, ABC Duft 3, CO2 2, Brunaslanga 3");
  const nyttM = h1.markers!.filter((m) => m.nytt);
  assert.equal(nyttM.length, 16);
  assert.ok(nyttM.every((m) => typeof m.unitId === "string" && String(m.unitId).startsWith("n:") && m.stada === "bid"));
  assert.deepEqual(
    [...new Set(nyttM.map((m) => m.tegund))].sort(),
    ["ABC Duft", "Brunaslanga", "CO2", "Léttvatn"]
  );
  // skilti úr slánni eru stimplar (vistast sem merki), ekki tæki
  assert.equal(h1.markers!.filter((m) => m.kind === "sign").length, 3);
  // TÆKI ERU FJÖLDI: ekkert unitId tvisvar yfir hæðir; skráð tæki = 2 + 10 á 1. hæð, 2. hæð óbreytt
  const oll = u.haedir.flatMap((h) => (h.markers || []).map((m) => String(m.unitId)));
  assert.equal(new Set(oll).size, oll.length, "ekkert unitId tvisvar");
  const skrad = h1.markers!.filter((m) => typeof m.unitId === "number").map((m) => m.unitId);
  assert.equal(skrad.length, 12);
  assert.deepEqual(h2.markers, haedir()[1].markers, "2. hæð ósnert (tækin þar ekki tekin)");
  // merkin á Teikning-sniði: tengt tæki {unitId, x, y}; Nýtt {unitId: n:…, x, y, nytt, tegund, stada}
  assert.deepEqual(h1.markers!.find((m) => m.unitId === 8223), { unitId: 8223, x: 200, y: 600 });
  assert.deepEqual(nyttM[0], { unitId: "n:slanga:test1", x: 600, y: 600, nytt: true, tegund: "Brunaslanga", stada: "bid" });
  assert.equal(u.otengd, 0);
});

test("Nýtt: önnur vistun eftir að borðið fékk lyklana tvítekur ekkert; skráð tæki síðar → Nýtt tengist sjálfkrafa", () => {
  const b = bord();
  const u1 = utbuaVistun(b, haedir(), "k1", (s) => `s:${s}:t`, 56, { taeki: TAEKI, nyttLykill: lyklar() });
  // borðið fær lyklana (eins og WhiteboardApp gerir eftir vistun) og `merki` = lyklarnir á borðinu
  const eftir = b.map((o) => {
    if (o.type !== "symbol") return o;
    const st = u1.sjalftengd.find((x) => x.objId === o.id);
    if (st) return { ...o, uttektUnitId: st.unitId };
    const nm = u1.nyttMerki.find((x) => x.objId === o.id);
    if (nm) return { ...o, uttektUnitId: nm.unitId };
    const ns = u1.nyirStimplar.find((x) => x.objId === o.id);
    if (ns) return { ...o, uttektUnitId: ns.unitId, uttektKind: "sign", uttektSign: ns.sign };
    return o;
  });
  (eftir[0] as ImageObject).uttekt!.merki = u1.hlutar[0].merkiABordi;
  const u2 = utbuaVistun(eftir, u1.haedir, "k2", (s) => `s:${s}:t2`, 56, { taeki: TAEKI, nyttLykill: lyklar() });
  assert.equal(u2.sjalftengd.length, 0, "ekkert tengist aftur");
  assert.equal(u2.nyttMerki.length, 0, "engin ný Nýtt-merki");
  assert.deepEqual(u2.nytt, u1.nytt);
  assert.equal(u2.haedir[0].markers!.length, u1.haedir[0].markers!.length, "sami fjöldi merkja");
  // eigandinn samþykkti: tvö léttvatnstæki skráð → næsta vistun tengir tvö Nýtt-léttvatn við þau
  const fleiri = [...TAEKI, { id: 9001, serial: "NY-1", type: "Léttvatn", status: "active" }, { id: 9002, serial: "NY-2", type: "Léttvatn 6 ltr", status: "active" }];
  const u3 = utbuaVistun(eftir, u1.haedir, "k3", (s) => `s:${s}:t3`, 56, { taeki: fleiri, nyttLykill: lyklar() });
  assert.deepEqual(u3.sjalftengd.map((x) => x.unitId), [9001, 9002]);
  assert.ok(u3.sjalftengd.every((x) => x.varNytt && x.varNytt.startsWith("n:lettvatn:")), "það voru Nýtt-tákn sem tengdust");
  assert.equal(u3.nytt.lettvatn, 6);
  const h1 = u3.haedir[0].markers!;
  for (const x of u3.sjalftengd) assert.ok(!h1.some((m) => m.unitId === x.varNytt), "Nýtt-merkið fór — tækið kom í staðinn");
  assert.ok(h1.some((m) => m.unitId === 9001) && h1.some((m) => m.unitId === 9002));
  const oll = u3.haedir.flatMap((h) => (h.markers || []).map((m) => String(m.unitId)));
  assert.equal(new Set(oll).size, oll.length);
});

test("TaekjaSjodur: aldrei sama tæki tvisvar, úrelt aldrei, staðsett aldrei; Nýtt-merki eru ekki staðsett tæki", () => {
  const stadsett = stadsettirLyklar(
    [{ id: "h", markers: [{ unitId: 8223 }, { unitId: "n:slanga:x" }, { unitId: "s:hose:y", kind: "sign" }] }],
    [takn("teikn:slanga", 0, 0, { uttektUnitId: 8224 }), takn("teikn:slanga", 0, 0, { uttektUnitId: "n:slanga:z" })]
  );
  assert.deepEqual([...stadsett].sort(), ["8223", "8224"]);
  const sj = new TaekjaSjodur([...TAEKI, { id: 1, serial: "A", type: "Brunaslanga", status: "urelt" }], stadsett);
  const tekin = [sj.taka(["slanga"]), sj.taka(["slanga"]), sj.taka(["slanga"]), sj.taka(["slanga"])].map((t) => t?.id ?? null);
  assert.deepEqual(tekin, [8225, 8226, 8227, null]);
});

test("tegundTakns / erOtengtTaekjaTakn: tækjatákn eftir tegund; stimplar og tengd tæki ekki", () => {
  assert.equal(tegundTakns("teikn:slanga"), "slanga");
  assert.equal(tegundTakns("teikn:co2"), "co2");
  assert.equal(tegundTakns("hose"), "slanga");
  assert.equal(tegundTakns("teikn:skilti_slt"), null);
  assert.equal(tegundTakns("extinguisher"), null, "almennt eldra slökkvitæki á sér enga tegund");
  assert.equal(erOtengtTaekjaTakn(takn("teikn:lettvatn", 0, 0)), true);
  assert.equal(erOtengtTaekjaTakn(takn("teikn:lettvatn", 0, 0, { uttektUnitId: 8214 })), false);
  assert.equal(erOtengtTaekjaTakn(takn("teikn:lettvatn", 0, 0, { uttektUnitId: "n:lettvatn:a" })), false, "Nýtt er ekki „ótengt“");
  assert.equal(erOtengtTaekjaTakn(takn("teikn:ut", 0, 0)), false);
});

test("midiTakns (3D): tengt grænt, tengt og komið fram yfir rautt, ótengt grátt „ótengt“, Nýtt indígó „Nýtt · tegund“", () => {
  const tengt = takn("teikn:lettvatn", 0, 0, { uttektUnitId: 8214 });
  assert.deepEqual(midiTakns(tengt, { id: 8214, serial: "AE-00009", type: "Léttvatn", status: "active" }), { texti: "Léttvatn", litur: MIDI_TENGT });
  assert.deepEqual(midiTakns(tengt, { id: 8214, serial: "AE-00009", type: "Léttvatn", status: "overdue" }), { texti: "Léttvatn", litur: MIDI_YFIR });
  const otengt = takn("teikn:lettvatn", 0, 0);
  assert.deepEqual(midiTakns(otengt), { texti: "Léttvatn · ótengt", litur: MIDI_OTENGT });
  assert.notEqual(midiTakns(otengt).litur, MIDI_YFIR, "ótengt er EKKI rautt");
  const slangaOtengd = takn("teikn:slanga", 0, 0);
  assert.equal(midiTakns(slangaOtengd).litur, MIDI_OTENGT, "ótengd slanga er ekki rauð heldur");
  const nytt = takn("teikn:slanga", 0, 0, { uttektUnitId: "n:slanga:abc" });
  assert.deepEqual(midiTakns(nytt), { texti: "Nýtt · Brunaslanga", litur: MIDI_NYTT });
  // 2D-miðinn undir tákninu fylgir sömu reglu
  assert.equal(liturMerkimida(nytt), MIDI_NYTT);
  assert.equal(liturMerkimida(otengt), MIDI_OTENGT);
  assert.equal(liturMerkimida(tengt), undefined);
});

test("Nýtt-merki opnast í TurboPaint sem tákn tegundarinnar með miðanum „Nýtt“ (og nafni „… (í bið)“)", () => {
  const m: UttektMerki = { unitId: "n:slanga:abc", x: 400, y: 600, nytt: true, tegund: "Brunaslanga", stada: "bid" };
  const s = taknFyrirMerki(m, TAEKI, mynd("m1", "h1"), FRUM, S);
  assert.equal(s.symbolId, "teikn:slanga");
  assert.equal(s.label, "Nýtt");
  assert.equal(s.name, "Nýtt · Brunaslanga (í bið)");
  assert.equal(s.uttektUnitId, "n:slanga:abc");
  assert.equal(lykillFyrir(m), "slanga");
  assert.equal(lykillFyrir({ unitId: "n:co2:x", nytt: true, tegund: "CO2" }), "co2");
});
