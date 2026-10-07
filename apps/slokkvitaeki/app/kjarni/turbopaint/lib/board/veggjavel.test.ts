// „Veggjavél (skrifstofutölvan)": JSON vélarinnar → veggir á borðinu, beiðnin og staða hennar (07.10.2026).
import assert from "node:assert/strict";
import { test } from "node:test";
import type { ImageObject } from "./types";
import {
  beidniGogn,
  framvinduProsenta,
  lesaNidurstodu,
  lesaVeggjavelJson,
  leyfdSlod,
  metaStodu,
  velLinurIBord,
  VEGGJAVEL_SVARAR_EKKI_MS,
} from "./veggjavel";

const IMAGE_URL = "/.netlify/functions/teikn-mynd?url=" + encodeURIComponent("https://skjalasafn.reykjavik.is/fotoweb/archives/5000/2022-10-1139928.pdf.info");

function mynd(o: Partial<ImageObject> = {}): ImageObject {
  return {
    id: "m1", type: "image", assetId: "a1", x: 100, y: 50, width: 3003, height: 2149, rotation: 0, opacity: 1, locked: false, hidden: false, name: "2. hæð",
    uttekt: { companyId: 661, haedId: "hmua8v42ink6", frumB: 6006, frumH: 4298, skurdur: { x: 760, y: 14, w: 4070, h: 4236 } },
    heimild: { slod: "https://skjalasafn.reykjavik.is/fotoweb/archives/5000/2022-10-1139928.pdf.info", b: 3003, h: 2149 },
    ...o,
  } as ImageObject;
}

test("JSON vélarinnar: fylki eða { linur }; rusl síast burt; allt sem er ekki gler er veggur", () => {
  const linur = [
    { p: [10, 20, 110, 20], t: 11, tegund: "veggur" },
    { p: [110, 20, 110, 220], t: 6.5, tegund: "gler" },
    { p: [0, 0, 0, 0], t: 5, tegund: "veggur" },          // núll-lengd
    { p: [1, 2, 3], t: 5 },                                  // of fáir punktar
    { p: [1, "x", 3, 4], t: 5 },                             // ekki tala
    { p: [5, 5, 50, 5], t: -1, tegund: "hurd" },             // óþekkt tegund → veggur, þykkt ≥ 1
    null,
  ];
  const a = lesaVeggjavelJson(linur);
  assert.equal(a.length, 3);
  assert.deepEqual(a.map((l) => l.tegund), ["veggur", "gler", "veggur"]);
  assert.equal(a[2].t, 1);
  assert.deepEqual(lesaVeggjavelJson({ snid: "veggjavel/1", linur }), a);
  assert.deepEqual(lesaVeggjavelJson({ eitthvad: 1 }), []);
  assert.deepEqual(lesaVeggjavelJson("rugl"), []);
});

test("línur (dílar frummyndar) → borðhnit á myndinni: hálf upplausn, hliðruð mynd, þykkt kvarðast, gler helst", () => {
  const m = mynd();
  const kx = 3003 / 6006, ky = 2149 / 4298;
  const v = velLinurIBord(lesaVeggjavelJson([{ p: [1000, 400, 3000, 400], t: 12, tegund: "veggur" }, { p: [3000, 400, 3000, 900], t: 6, tegund: "gler" }]), m, { b: 6006, h: 4298 });
  assert.equal(v.length, 2);
  assert.deepEqual(v[0].p, [100 + 1000 * kx, 50 + 400 * ky, 100 + 3000 * kx, 50 + 400 * ky]);
  assert.ok(Math.abs(v[0].t - 6) < 1e-9);
  assert.equal(v[0].tegund, undefined, "veggur ber enga sértegund (Bæta við setur 'veggur')");
  assert.equal(v[1].tegund, "gler");
});

test("skorin mynd (Croppa oft): hnitin fara um skurðinn og aðeins línur á hlutanum koma", () => {
  // myndin sýnir svæðið x 3000–6006, y 0–4298 af blaðinu, á borðinu 1503 × 2149 við (0, 0)
  const svaedi = { x: 3000, y: 0, w: 3006, h: 4298 };
  const m = mynd({ x: 0, y: 0, width: 1503, height: 2149 });
  const v = velLinurIBord(
    lesaVeggjavelJson([
      { p: [3200, 100, 4200, 100], t: 10, tegund: "veggur" },   // á hlutanum
      { p: [500, 100, 1500, 100], t: 10, tegund: "veggur" },    // á hinum hluta blaðsins — sleppt
    ]),
    m,
    { b: 6006, h: 4298 },
    svaedi
  );
  assert.equal(v.length, 1);
  const k = 1503 / 3006;
  assert.ok(Math.abs(v[0].p[0] - 200 * k) < 1e-9 && Math.abs(v[0].p[2] - 1200 * k) < 1e-9, JSON.stringify(v[0].p));
});

test("beiðnin: staður, hæð, slóð blaðsins, skurður hæðarinnar og stærð frummyndar", () => {
  const r = beidniGogn(mynd(), IMAGE_URL);
  assert.ok("gogn" in r);
  if (!("gogn" in r)) return;
  assert.deepEqual(r.gogn, { company_id: 661, haed_id: "hmua8v42ink6", image_url: IMAGE_URL, skurdur: { x: 760, y: 14, w: 4070, h: 4236 }, frum: { b: 6006, h: 4298 } });
  // án image_url hæðarinnar: slóðin endurgerð úr heimild teikningarinnar (sama strengur og teikning_bord geymir)
  const r2 = beidniGogn(mynd());
  assert.ok("gogn" in r2 && r2.gogn.image_url === IMAGE_URL, JSON.stringify(r2));
  // skorin mynd + skurður hæðar: aðeins skörunin
  const r3 = beidniGogn(mynd({ uttekt: { companyId: 661, haedId: "h", frumB: 6006, frumH: 4298, skurdur: { x: 760, y: 14, w: 4070, h: 4236 }, myndSkurdur: { x: 3000, y: 0, w: 3006, h: 4298 } } }));
  assert.ok("gogn" in r3 && JSON.stringify(r3.gogn.skurdur) === JSON.stringify({ x: 3000, y: 14, w: 1830, h: 4236 }), JSON.stringify(r3));
  // ótengd mynd úr tölvunni: engin slóð — skýr ástæða
  const r4 = beidniGogn(mynd({ uttekt: undefined, heimild: undefined }));
  assert.ok("astaeda" in r4 && /skjalasafninu/.test(r4.astaeda));
});

test("lokasvar brúarinnar og slóðarvörn", () => {
  const s = "https://osfdzskyvisifcwyjkuk.supabase.co/storage/v1/object/public/turbopaint/veggjavel/661/hmua8v42ink6-1.json";
  assert.deepEqual(lesaNidurstodu(JSON.stringify({ slod: s, veggir: 83, gler: 4, sek: 95 })), { slod: s, veggir: 83, gler: 4, sek: 95 });
  assert.equal(lesaNidurstodu("Skrifstofutölvan greinir… 40 % — Greini veggi"), null);
  assert.equal(lesaNidurstodu('{"veggir":3}'), null);
  assert.equal(leyfdSlod(s, "https://osfdzskyvisifcwyjkuk.supabase.co"), true);
  assert.equal(leyfdSlod("https://illt.example/turbopaint/veggjavel/x.json", "https://osfdzskyvisifcwyjkuk.supabase.co"), false);
  assert.equal(leyfdSlod("https://osfdzskyvisifcwyjkuk.supabase.co/storage/v1/object/public/turbopaint/blender/x.png", "https://osfdzskyvisifcwyjkuk.supabase.co"), false);
  assert.equal(framvinduProsenta("Skrifstofutölvan greinir… 40 % — Greini veggi"), 40);
  assert.equal(framvinduProsenta("Í biðröð"), null);
});

test("staða beiðnar: biðröð, svarar ekki eftir 2 mín, upptekin við annað, framvinda, höfnun eldri vélar, villa, lokið", () => {
  const byrjad = 1_000_000;
  const o = (nu: number, extra: Partial<{ hafnadFra: number | null; upptekin: string | null }> = {}) => ({ nu, byrjad, hafnadFra: null, upptekin: null, ...extra });
  assert.equal(metaStodu({ status: "bida" }, o(byrjad + 30_000)).s, "bida");
  assert.equal(metaStodu({ status: "pending" }, o(byrjad + 30_000)).s, "bida");
  const sv = metaStodu({ status: "bida" }, o(byrjad + VEGGJAVEL_SVARAR_EKKI_MS + 1000));
  assert.deepEqual(sv, { s: "villa", texti: "Skrifstofutölvan svarar ekki — er hún í gangi?" });
  // annað verk (Blender) í gangi á brúnni: beðið áfram, ekki „svarar ekki"
  const up = metaStodu({ status: "bida" }, o(byrjad + 5 * 60_000, { upptekin: "blender" }));
  assert.deepEqual(up, { s: "bida", upptekin: "blender", hafnad: false });
  const v = metaStodu({ status: "running", result: "Skrifstofutölvan greinir… 40 % — Greini veggi" }, o(byrjad + 70_000));
  assert.ok(v.s === "vinnur" && v.pros === 40 && /greinir/.test(v.texti));
  // eldri vél hafnaði: beðið í 3 mín eftir að skrifstofuvélin taki við
  assert.equal(metaStodu({ status: "error", result: 'Unknown workflow "veggjavel"' }, o(byrjad + 20_000, { hafnadFra: byrjad + 10_000 })).s, "bida");
  assert.equal(metaStodu({ status: "error", result: 'Unknown workflow "veggjavel"' }, o(byrjad + 300_000, { hafnadFra: byrjad + 10_000 })).s, "villa");
  const e = metaStodu({ status: "error", result: "Skrifstofutölvan greinir… 10 % | Veggjavélin tókst ekki: myndin fékkst ekki (404)" }, o(byrjad + 60_000));
  assert.deepEqual(e, { s: "villa", texti: "myndin fékkst ekki (404)" });
  const s = "https://osfdzskyvisifcwyjkuk.supabase.co/storage/v1/object/public/turbopaint/veggjavel/661/x.json";
  const d = metaStodu({ status: "done", result: JSON.stringify({ slod: s, veggir: 80, gler: 3, sek: 90 }) }, o(byrjad + 200_000));
  assert.ok(d.s === "lokid" && d.nid.veggir === 80 && d.nid.gler === 3);
  assert.equal(metaStodu({ status: "done", result: "done" }, o(byrjad + 200_000)).s, "villa");
});
