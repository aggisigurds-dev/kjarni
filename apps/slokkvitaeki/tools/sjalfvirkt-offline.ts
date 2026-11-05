/* Sjálfvirka verkferlið ÁN vafra — hreinsun (d) og hurðir (e) keyrð á hráu línurnar sem vafrinn greindi (maeling.json,
 * dílar frummyndar), svo hægt sé að stilla vikmörkin og mæla á móti leiðréttingum Agnars á sekúndum:
 *   ../../node_modules/.bin/tsx tools/sjalfvirkt-offline.ts <inn: maeling.json> <út: maeling.json> [vikmork-json]
 * Myndprófanirnar (bogi / lína í bili) eru ekki með hér — þær þurfa myndina (vafrinn). */
import fs from "node:fs";
import { finnaHurdir } from "../app/kjarni/turbopaint/lib/board/hurdagreining";
import { hreinsaVeggi, husUtlina, lesaVikmork, utanHuss, type HLina } from "../app/kjarni/turbopaint/lib/board/veggja-hreinsun";

const [inn, ut, vikJson] = process.argv.slice(2);
const m = JSON.parse(fs.readFileSync(inn, "utf8"));
const vik = lesaVikmork(vikJson ? fs.readFileSync(vikJson, "utf8") : null);
const dpm = Math.max(m.frum.b, m.frum.h) / 2384 / ((0.0254 / 72) * 100);
const VEGG = new Set(["veggur", "ei60", "ei30"]);
const erV = (l: HLina) => VEGG.has(l.tegund ?? "veggur");
const hrar: HLina[] = m.hrar;
const h = hreinsaVeggi(hrar, [], dpm, vik);
let hreinar = h.linur;
const d = finnaHurdir(hreinar.filter(erV), hreinar.filter((l) => !erV(l)), dpm, { vik: vik.hurd });
let hurdir: HLina[] = d.hurdir;
const u = husUtlina([...hreinar, ...hurdir, ...d.gler], dpm, vik.lokunM);
const bV = utanHuss(hreinar, u), bH = utanHuss(hurdir, u);
hreinar = hreinar.filter((_, i) => !bV.has(i));
hurdir = hurdir.filter((_, i) => !bH.has(i));
const vista = (l: HLina) => ({ p: l.p, t: l.t, ...(l.tegund && l.tegund !== "veggur" ? { tegund: l.tegund } : {}) });
const nyr = { ...m, hreinsadar: hreinar.map(vista), hurdir: hurdir.map(vista), lokalinur: [...hreinar, ...d.gler, ...hurdir].map(vista), talning: { hreinsun: h.talning, hurdir: d.talning, utan: bV.size + bH.size } };
fs.mkdirSync(require("node:path").dirname(ut), { recursive: true });
fs.writeFileSync(ut, JSON.stringify(nyr));
console.log(JSON.stringify({ hrar: hrar.length, hreinar: hreinar.length, hurdir: hurdir.length, talning: h.talning, hurdT: d.talning, utan: bV.size + bH.size, lokud: u.lokud }));
