"use client";

/* Gatakort (11.11.2026): allar skráningar verks á yfirlitsteikningu (brunayfirlit með rauðum brunaveggjum) eða stakri
 * Ajour-teikningu, með LÖGUM (fagteikningar: loftræsting, sprinkler, vatn …; áætluð göt) og SÍUM (deild, tegund/stærð,
 * staða, starfsmaður, tímabil, lagfæringar, tvítök). Les skr_* beint; greiningin (deild, lagf, tvítak) er reiknuð í
 * tools/skraning-gatakort-innflutningur.cjs og geymd í skr_skraningar.ajour_gogn.
 *   /kjarni/skraning/kort[?verk=ID]
 * Skrif: áætluð göt (skr_aaetlud), lög (skr_log) og færðir punktar (skr_faerslur: leiðrétt staða skráningar á yfirlitsblaðinu) —
 * við smell eða sleppingu, aldrei í lykkju. Skráningunum sjálfum (skr_skraningar) er ekki breytt hér.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sb, publicUrl, hladaUpp } from "../lib/sb";

type Vorpun = { a: number; e: number; f: number; b?: number; c?: number; d?: number; hlutar?: { fra_x: number; a: number; e: number; f: number; b?: number; c?: number; d?: number }[] };
/** Varpar hnitum Ajour-teikningar á yfirlitsblað. `hlutar`: blað sem er sett saman úr fleiri en einni mynd (t.d. tvær álmur hlið
 *  við hlið, „6H 2S-1S Rafmagnsþéttingar“) — síðasti hluti með fra_x ≤ x ræður, annars grunnvörpunin. Full affín vörpun eins og
 *  canvas.transform(a, b, c, d, e, f): X = a·x + c·y + e, Y = b·x + d·y + f (b, c = 0 og d = a ef þau vantar) — skannað blað getur verið snúið. */
const varpa = (v: Vorpun, x: number, y: number): [number, number] => { let h: { a: number; e: number; f: number; b?: number; c?: number; d?: number } = v; if (v.hlutar) for (const q of v.hlutar) if (x >= q.fra_x) h = q; return [h.a * x + (h.c || 0) * y + h.e, (h.b || 0) * x + (h.d ?? h.a) * y + h.f]; };
/** Skarpar flísar (kvardi × upplausn grunnmyndar), hlaðið aðeins fyrir það sem sést þegar stækkað er inn. */
type Flisar = { kvardi: number; bx: number; by: number; dalkar: number; radir: number; slod: string; ending: string; til: string[] };
const FLISA_MORK = 1.15;   // skjápixlar per grunnmyndarpixil: þar yfir eru flísar notaðar
const FLISA_HAMARK = 24;   // mest þetta margar flísar í minni (hver ~15 MB afkóðuð)
type Verk = { id: number; heiti: string };
type Teikning = { id: number; heiti: string; haed: string | null; tegund: string; mynd_path: string | null; breidd_px: number | null; haed_px: number | null; yfirlit_id: number | null; vorpun: Vorpun | null; deildir: string[] | null; flisar: Flisar | null };
type Skr = { id: number; radnr: number; ajour_serial: number | null; teikning_id: number | null; x_px: number | null; y_px: number | null; flokkur_id: number | null; starfsmadur_id: number | null; stada: string; framkvaemt_til: string | null; deild: string | null; lagf: string | null; tvitak_af: number | null };
type Flokkur = { id: number; heiti: string };
type Starfsm = { id: number; numer: number | null; nafn: string | null };
/** `lan`: lagið tilheyrir öðru yfirlitsblaði með sömu grunnmynd (4H notar 5H-blaðið) og er sýnt hér að láni; hæð þess blaðs. */
type Lag = { id: number; teikning_id: number; heiti: string; fag: string; mynd_path: string | null; breidd_px: number | null; haed_px: number | null; vorpun: Vorpun | null; gegnsaei: number; synilegt: boolean; flisar: Flisar | null; lan?: string };
/** Flýtisýn eftir fagi: [lykill, heiti, fög laga og áætlaðra gata sem sjást, táknhópar skráninga sem sjást]. Gildir aðeins á skjánum, skrifar ekkert. */
const SYNIR: [string, string, string[], string[]][] = [
  ["loftraesting", "Loftræsting", ["loftraesting"], ["Loft"]],
  ["udi", "Úðakerfi", ["sprinkler"], ["Stál"]],
  ["lagnir", "Vatn og lagnir", ["vatn", "hiti", "fravatn", "gas"], ["Stál", "Plast"]],
  ["rafmagn", "Rafmagn", ["rafmagn"], ["Rafmagn"]],
  ["golf", "Gólf", ["golf"], ["Gólf"]],
];
/** Hinn endinn: lokun í vegg er tvö stök verk, eitt hvorum megin. Önnur skráning sama hóps innan þessa (30 px = 0,9 m) telst hinn endinn. */
const ENDI_PX = 30;
/** Víðari leit fyrir skráningar sem eiga engan hinn enda (50 px = 1,5 m): aðeins SAMI flokkur og aðeins ef brunaveggur liggur milli Ajour-staðanna. */
const ENDI_VITT_PX = 50;
/** Rauðir brunaveggir yfirlitsblaðsins sem línubútar (tools/skraning-gatakort-veggir.py → veggir/<mynd>.json, flatt [x1,y1,x2,y2,…] í px blaðsins).
 *  Lykill: hæð og myndarheiti. 4H notar 5H-blaðið en er gólf 5. hæðar (eitt verk = ein þétting), svo þar eru veggir ekki notaðir. */
const VEGGIR: Record<string, () => Promise<{ default: { seg: number[]; hurdir?: number[] } }>> = {
  "5H:yfirlit-5h.jpg": () => import("./veggir/yfirlit-5h.json"),
  "6H:yfirlit-6h.jpg": () => import("./veggir/yfirlit-6h.json"),
};
type Veggir = { seg: number[]; net: Map<number, number[]> };
/** VC = reitastærð veggjanetsins · VL = hver bútur lengdur um þetta í hvorn enda (brúar eyður í línunum; mælt 13.11.2026: 8 px fækkar röngum „sömu megin“
 *  úr 38 í 19 á 6H án þess að fjölga röngum „hinum megin“ að ráði) · VEGG_NAER = svo nærri merki þarf rauður veggur að vera til að hliðin sé metin ·
 *  A_LINU = Ajour-staða nær miðlínu veggjar en þetta er Á veggnum sjálfum (hann er um 5,6 px þykkur á blaðinu) og segir ekkert um hlið. */
const VC = 64, VL = 8, VEGG_NAER = 20, A_LINU = 3;
const vLyk = (gx: number, gy: number) => gx * 4096 + gy;
const veggjaNet = (seg: number[]): Veggir => {
  const net = new Map<number, number[]>();
  for (let i = 0; i + 3 < seg.length; i += 4) {
    const x1 = seg[i], y1 = seg[i + 1], x2 = seg[i + 2], y2 = seg[i + 3];
    for (let gx = Math.floor((Math.min(x1, x2) - VL) / VC); gx <= Math.floor((Math.max(x1, x2) + VL) / VC); gx++) for (let gy = Math.floor((Math.min(y1, y2) - VL) / VC); gy <= Math.floor((Math.max(y1, y2) + VL) / VC); gy++) { const l = vLyk(gx, gy), a = net.get(l); if (a) a.push(i); else net.set(l, [i]); }
  }
  return { seg, net };
};
/** Fjarlægð (px) frá punkti í næsta veggbút; leitar í reit punktsins og grannreitum, svo allt yfir VC telst „langt frá“. */
/** Liggur næsti brunaveggur við (px, py) lárétt á blaðinu? null ef enginn veggur er innan VEGG_NAER. Ræður því hvort hök merkis eru uppi og niðri eða til hliðanna. */
const veggurLarettur = (v: Veggir, px: number, py: number): boolean | null => {
  let b = VEGG_NAER, lar: boolean | null = null; const gx = Math.floor(px / VC), gy = Math.floor(py / VC);
  for (let ix = gx - 1; ix <= gx + 1; ix++) for (let iy = gy - 1; iy <= gy + 1; iy++) for (const i of v.net.get(vLyk(ix, iy)) || []) {
    const x1 = v.seg[i], y1 = v.seg[i + 1], dx = v.seg[i + 2] - x1, dy = v.seg[i + 3] - y1, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / L)) : 0;
    const d = Math.hypot(px - x1 - t * dx, py - y1 - t * dy); if (d < b) { b = d; lar = Math.abs(dx) > Math.abs(dy); }
  }
  return lar;
};
const fjarVegg = (v: Veggir, px: number, py: number): number => {
  let b = 1e9; const gx = Math.floor(px / VC), gy = Math.floor(py / VC);
  for (let ix = gx - 1; ix <= gx + 1; ix++) for (let iy = gy - 1; iy <= gy + 1; iy++) for (const i of v.net.get(vLyk(ix, iy)) || []) {
    const x1 = v.seg[i], y1 = v.seg[i + 1], dx = v.seg[i + 2] - x1, dy = v.seg[i + 3] - y1, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / L)) : 0;
    const d = Math.hypot(px - x1 - t * dx, py - y1 - t * dy); if (d < b) b = d;
  }
  return b;
};
/** Sker beina línan A→B einhvern veggbút (lengdan um VL í hvorn enda)? Þá eru A og B sitt hvorum megin við brunavegg. */
const skerVegg = (v: Veggir, ax: number, ay: number, bx: number, by: number): boolean => {
  const sed = new Set<number>(), rx = bx - ax, ry = by - ay;
  for (let gx = Math.floor(Math.min(ax, bx) / VC); gx <= Math.floor(Math.max(ax, bx) / VC); gx++) for (let gy = Math.floor(Math.min(ay, by) / VC); gy <= Math.floor(Math.max(ay, by) / VC); gy++) for (const i of v.net.get(vLyk(gx, gy)) || []) {
    if (sed.has(i)) continue; sed.add(i);
    const x1 = v.seg[i], y1 = v.seg[i + 1], dx = v.seg[i + 2] - x1, dy = v.seg[i + 3] - y1, L = Math.hypot(dx, dy) || 1, ux = (dx / L) * VL, uy = (dy / L) * VL;
    const cx = x1 - ux, cy = y1 - uy, sx = dx + 2 * ux, sy = dy + 2 * uy, n = rx * sy - ry * sx;
    if (Math.abs(n) < 1e-9) continue;
    const t = ((cx - ax) * sy - (cy - ay) * sx) / n, u = ((cx - ax) * ry - (cy - ay) * rx) / n;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return true;
  }
  return false;
};
/** Hinn endi skráningar: næsta skráning sama hóps og hvað Ajour-staðirnar segja um hlið veggjar.
 *  hinum = brunaveggur liggur á milli Ajour-staðanna · sama = báðar sömu megin við vegginn · ovist = ekki hægt að meta (enginn rauður veggur við merkið,
 *  Ajour-staða á veggnum sjálfum eða veggjagögn ekki til fyrir blaðið). */
/** Nemar (Agnar 13.11.2026: „gera rauða vegginn með einhvers konar nema … hann nemi sirka breiddina af rörunum sem fara í gegn“): hvert gegnumtak
 *  lags gegnum rauðan vegg, flatt [x, y, tx, ty, hb, …] (tools/skraning-gatakort-nemar.py; (x, y) á miðlínu veggjar, t meðfram vegg, hb = hálf breidd
 *  stokksins). Skráning hópsins tengist nema ef SÝND staða hennar er innan hb + N_MED meðfram vegg og N_THV þvert á hann. Þá gildir reglan hans:
 *  „punktur má ekki tengjast sín megin við rauða vegginn“ — hinn endinn er aðeins skráning á SAMA nema hinum megin (hlið = Ajour-staðan x0, y0). */
const NEMAR: Record<string, () => Promise<{ default: { nemar: number[] } }>> = {
  "5H:yfirlit-5h.jpg": () => import("./nemar/loft-5h.json"),
  "6H:yfirlit-6h.jpg": () => import("./nemar/loft-6h.json"),
};
const NEMA_HOPUR = "Loft", N_MED = 6, N_THV = 12;
/** Smellur (Agnar 14.11.2026: „maður gæti dregið punktana svo þeir festast í einhvern endann á plúsnum og þá kæmi neon check ✓ á þann hluta“): punktur sem
 *  er dreginn innan SMELL_NAER px frá nema lendir á miðju gegnumtaksins, SMELL_PX px frá miðlínu veggjar þeim megin sem honum var sleppt. Slík staða er
 *  þekkt aftur á hnitunum einum (handfærð, á miðju nemans, nákvæmlega SMELL_PX frá vegg) og ræður þá hlið skráningarinnar í stað Ajour-staðarins. */
const SMELL_PX = 4, SMELL_NAER = 14, NEON = "#00c853";
function smella(nm: number[], x: number, y: number): [number, number] | null {
  let b = 1e9, bi = -1;
  for (let i = 0; i + 4 < nm.length; i += 5) { const dx = x - nm[i], dy = y - nm[i + 1], al = Math.abs(dx * nm[i + 2] + dy * nm[i + 3]), th = Math.abs(-dx * nm[i + 3] + dy * nm[i + 2]); if (al <= nm[i + 4] + N_MED && th <= SMELL_NAER && al + th < b) { b = al + th; bi = i; } }
  if (bi < 0) return null;
  const sg = -(x - nm[bi]) * nm[bi + 3] + (y - nm[bi + 1]) * nm[bi + 2] >= 0 ? 1 : -1;
  return [nm[bi] - nm[bi + 3] * SMELL_PX * sg, nm[bi + 1] + nm[bi + 2] * SMELL_PX * sg];
}
/** einn = eina skráningin á sínu gegnumtaki og engin hinum megin · samaNemi = allar skráningar gegnumtaksins sömu megin (báðar rautt ✕). */
type Endi = { q: Punktur | null; nr: number | null; d: number; hlid: "hinum" | "sama" | "ovist" | "einn" | "samaNemi"; nemi?: number; vitt?: boolean; megin?: number; fest?: boolean };
const FLISA_THAK_SNERTI = 24; // snertiskjár: mest þetta margar skarpar flísar í einum ramma (grunnur + lög), annars grófa myndin
type Aaetlad = { id: number; teikning_id: number; x_px: number; y_px: number; fag: string; fjoldi: number; athugasemd: string | null; flokkur_id: number | null; parad: Parad | null; uppruni?: string };
/** Tillaga: staður sem tól stingur upp á (t.d. stokkur gegnum brunavegg án skráningar). Sést á kortinu en telst EKKI í stöðuskýrslunni fyrr en hún er staðfest. */
const erTillaga = (a: Aaetlad) => (a.uppruni || "").startsWith("tillaga:");
/** Pörun áætlaðs gats við skráningar — reiknuð af tools/skraning-gatakort-para.cjs. */
type Parad = { ids: number[]; radnr: number[]; n: number; stada: "fullt" | "hluti" | "vantar"; reiknad?: string };
const AA_SEL = "id,teikning_id,x_px,y_px,fag,fjoldi,athugasemd,flokkur_id,parad,uppruni";
const PARAD: Record<string, [string, string]> = { fullt: ["Fullt", "#86efac"], hluti: ["Vantar hluta", "#fde047"], vantar: ["Engin skráning", "#fca5a5"] };
// Flokkar (stærðir) sem eiga við hvert fag — notað til að stinga upp á stærð þegar áætlað gat er sett.
const FAG_FLOKKAR: Record<string, RegExp> = { loftraesting: /^(Loft|Raufar)/i, sprinkler: /^Stál/i, vatn: /^(Stál|Plast)/i, hiti: /^(Stál|Plast)/i, fravatn: /^(Stál|Plast)/i, gas: /^(Stál|Plast)/i, rafmagn: /^Raf/i, golf: /^Gólf/i };
/** slodir = myndir skráningarinnar í OKKAR geymslu (skr_myndir, fatan „skraning“; sóttar úr Ajour með tools/skraning-myndir-ajour.cjs). */
type Nanar = { lysing: string | null; myndir: number; teikning: string | null; lagf_dags: string | null; a_stad: number | null; created_at: string; slodir: string[] };
/** Færður punktur: leiðrétt staða skráningar á yfirlitsblaði (skr_faerslur). Skráningin sjálf heldur Ajour-hnitunum. */
type Faersla = { id: number; skraning_id: number; teikning_id: number; x_px: number; y_px: number; uppruni: string };
const FA_SEL = "id,skraning_id,teikning_id,x_px,y_px,uppruni";
const PX_M = 33.3;   // pixlar á metra á yfirlitsblaðinu (60 px ≈ 1,8 m)
/** x0/y0 = vörpuð staða úr Ajour-hnitum; x/y = staðan sem er sýnd (færð ef færsla er til). */
/** d = deildin sem punkturinn telst á: á yfirlitsblaði ræðst hún af STÖÐU punktsins (sama regla og sýnin skr_haedarhnit), svo færður
 *  punktur fylgir nýja staðnum; á stakri Ajour-teikningu er það merking skráningarinnar. */
type Punktur = { s: Skr; x: number; y: number; t: Takn; x0: number; y0: number; faersla?: Faersla; d: string | null };
const deildAf = (fx: number) => (fx < 0.179 ? "S1" : fx < 0.5 ? "S2" : fx < 0.812 ? "S4" : "S5");
type Faerir = { p?: Punktur; a?: Aaetlad; x: number; y: number; dx: number; dy: number; hreyft: boolean; snerting?: boolean };
type Takn = { logun: "x" | "o" | "t" | "s" | "d"; litur: string; r: number; heiti: string; hopur: string };

const FOG: [string, string, string][] = [["loftraesting", "Loftræsting", "#2563eb"], ["sprinkler", "Sprinkler", "#dc2626"], ["vatn", "Vatnslagnir", "#0891b2"], ["fravatn", "Frárennsli", "#7c2d12"], ["rafmagn", "Rafmagn", "#067429"], ["hiti", "Hiti", "#f97316"], ["gas", "Gas", "#9333ea"], ["golf", "Milliloft", "#0f766e"], ["annad", "Annað", "#6b7280"]];
const fagLitur = (f: string) => (FOG.find((x) => x[0] === f) || FOG[FOG.length - 1])[2];
const fagHeiti = (f: string) => (FOG.find((x) => x[0] === f) || FOG[FOG.length - 1])[1];
const HOPAR = ["Loft", "Stál", "Plast", "Gólf", "Rafmagn", "Annað"];
const ROD = ["Loft 125-160", "Loft 200-315", "Loft 400-630", "Loft raufar", "Loft annað", "Stál 15-35", "Stál 40-50", "Stál 75-110", "Stál 110-160", "Plast 20-34", "Plast 35-50", "Plast 75-100", "Milliloft", "Rafmagn", "Annað"];
const RAF = /Raf|Raufar/i;

/* Tákn eftir tegund og stærð — sama kerfi og á Landspítalasíðu hubsins: kross = loftræsting, hringur = stálrör,
 * þríhyrningur = plaströr, ferningur = milliloft, tígull = rafmagn; litur og stærð = stærðarflokkur. */
function takn(c: string): Takn {
  const m = /(\d+)\s*-\s*(\d+)/.exec(c), lo = m ? +m[1] : 0;
  if (/^Loft/i.test(c)) return !m ? { logun: "x", litur: "#64748b", r: 3.6, heiti: "Loft annað", hopur: "Loft" } : lo >= 400 ? { logun: "x", litur: "#c026d3", r: 5.2, heiti: "Loft 400-630", hopur: "Loft" } : lo >= 200 ? { logun: "x", litur: "#7c3aed", r: 4.4, heiti: "Loft 200-315", hopur: "Loft" } : { logun: "x", litur: "#2563eb", r: 3.6, heiti: "Loft 125-160", hopur: "Loft" };
  if (/^Stál/i.test(c)) return lo >= 110 ? { logun: "o", litur: "#7c2d12", r: 4.6, heiti: "Stál 110-160", hopur: "Stál" } : lo >= 75 ? { logun: "o", litur: "#c2410c", r: 3.9, heiti: "Stál 75-110", hopur: "Stál" } : lo >= 40 ? { logun: "o", litur: "#f97316", r: 3.2, heiti: "Stál 40-50", hopur: "Stál" } : { logun: "o", litur: "#fbbf24", r: 2.7, heiti: "Stál 15-35", hopur: "Stál" };
  if (/^Plast/i.test(c)) return lo >= 75 ? { logun: "t", litur: "#155e75", r: 4.8, heiti: "Plast 75-100", hopur: "Plast" } : lo >= 35 ? { logun: "t", litur: "#0891b2", r: 4.1, heiti: "Plast 35-50", hopur: "Plast" } : { logun: "t", litur: "#22d3ee", r: 3.4, heiti: "Plast 20-34", hopur: "Plast" };
  if (/^Gólf/i.test(c)) return { logun: "s", litur: "#0f766e", r: 3.8, heiti: "Milliloft", hopur: "Gólf" };
  /* „Raufar. (Metrer) LV“ eru raufarnar kringum FERKANTAÐA loftstokka (Agnar 13.11.2026: „mátt bæta inn í loftræstingasýnina götin raufar metrar, sem eru
   * kringum ferköntuðu loftræstingarnar“). Þær féllu áður undir rafmagn af því að RAF-mynstrið grípur „Raufar“. „Raf raufar …“ er áfram rafmagn. */
  if (/^Raufar/i.test(c)) return { logun: "s", litur: "#1e3a8a", r: 4.2, heiti: "Loft raufar", hopur: "Loft" };
  if (RAF.test(c)) return { logun: "d", litur: "#067429", r: 4, heiti: "Rafmagn", hopur: "Rafmagn" };
  return { logun: "s", litur: "#9ca3af", r: 2.6, heiti: "Annað", hopur: "Annað" };
}
/** Skráningar í flokknum „Raufar. (Metrer) LV“ sem eru í raun RAFLAGNIR (kapalbúnt á strengjastiga gegnum vegg), staðfest af ljósmyndum skráninganna
 *  14.11.2026 (Agnar: „kannski voru einhverjar raflagnir settar í rangan flokk … þú kannski nærð að sjá hvort þetta séu loftstokkar eða rafmagns vírabúnt“).
 *  Aðeins BIRTING á kortinu: þær teljast rafmagn hér; flokkurinn í grunninum og í Ajour er óbreyttur. Fundnar með `scratchpad/lm_raufar.py` (á raflagnaleið
 *  og ekki við loftstokk: 17 af 17 með myndir voru kaplar) + #11834 úr úrtaki við loftstokk. #8021, 8022, 8024, 8025, 8026 (5H S1) eiga engar myndir og
 *  eru því EKKI hér. Lykill: ajour_serial. */
const RAUFAR_RAFMAGN = new Set([11763, 11819, 11820, 11826, 11827, 11951, 11953, 11954, 11955, 11957, 11961, 12094, 12098, 12099, 12100, 8359, 8681, 11834]);
const RAF_TAKN = takn("Raf");
const num = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const dmy = (d: string | null) => (d ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : "");

function slod(cx: CanvasRenderingContext2D, t: Takn["logun"], x: number, y: number, r: number) {
  cx.beginPath();
  if (t === "x") { cx.moveTo(x - r, y - r); cx.lineTo(x + r, y + r); cx.moveTo(x + r, y - r); cx.lineTo(x - r, y + r); }
  else if (t === "d") { cx.moveTo(x, y - r * 1.25); cx.lineTo(x + r, y); cx.lineTo(x, y + r * 1.25); cx.lineTo(x - r, y); cx.closePath(); }
  else if (t === "t") { cx.moveTo(x, y - r); cx.lineTo(x + r, y + r * 0.8); cx.lineTo(x - r, y + r * 0.8); cx.closePath(); }
  else if (t === "s") cx.rect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7);
  else cx.arc(x, y, r, 0, 6.2832);
}
/** Plúsútlína: merki loftræsiþéttinga í símasýninni, sama form og Agnar notar á Miro-borðinu (útlína í lit stærðar, hvít fylling). */
function plus(cx: CanvasRenderingContext2D, x: number, y: number, R: number) {
  const a = R * 0.4;
  cx.beginPath(); cx.moveTo(x - a, y - R); cx.lineTo(x + a, y - R); cx.lineTo(x + a, y - a); cx.lineTo(x + R, y - a); cx.lineTo(x + R, y + a); cx.lineTo(x + a, y + a);
  cx.lineTo(x + a, y + R); cx.lineTo(x - a, y + R); cx.lineTo(x - a, y + a); cx.lineTo(x - R, y + a); cx.lineTo(x - R, y - a); cx.lineTo(x - a, y - a); cx.closePath();
}
/** Blómhringur (átta blöð): merki röraþéttinga í símasýninni, sama form og á Miro-borði Agnars. Skilar hnitum dala og stýripunkta. */
const blomPunktar = (x: number, y: number, R: number) => Array.from({ length: 8 }, (_, i) => {
  const d = ((i * 45 - 22.5) * Math.PI) / 180, t = (i * 45 * Math.PI) / 180;
  return { dx: x + Math.cos(d) * R * 0.74, dy: y + Math.sin(d) * R * 0.74, tx: x + Math.cos(t) * R * 1.3, ty: y + Math.sin(t) * R * 1.3 };
});
function blom(cx: CanvasRenderingContext2D, x: number, y: number, R: number) {
  const p = blomPunktar(x, y, R);
  cx.beginPath(); cx.moveTo(p[0].dx, p[0].dy);
  for (let i = 0; i < 8; i++) { const n = p[(i + 1) % 8]; cx.quadraticCurveTo(p[i].tx, p[i].ty, n.dx, n.dy); }
  cx.closePath();
}
const BLOM_D = (() => { const p = blomPunktar(7, 7, 4.6), f = (n: number) => n.toFixed(2); return `M${f(p[0].dx)} ${f(p[0].dy)}` + p.map((q, i) => `Q${f(q.tx)} ${f(q.ty)} ${f(p[(i + 1) % 8].dx)} ${f(p[(i + 1) % 8].dy)}`).join("") + "Z"; })();
/** Hálf breidd merkis í símasýn, í skjápixlum: lítil á yfirliti, vex með stækkun (talan í merkinu sést frá 11 px). */
/** Þak 13 px (var 17) og áætluð göt mest um 9 px í símasýn: Agnar 13.11.2026, „merki mega ekki vera of stór svo ég sjái ekki“ (teikningin undir verður að sjást). */
const merkisR = (k: number, k0: number) => Math.max(4, Math.min(13, Math.sqrt(k / k0) * 3.4));
/** Skýringartákn símasýnarinnar: útlína í lit stærðarflokks, hvít fylling (sama og á kortinu). */
function MerkiSvg({ t }: { t: Takn }) {
  const p = { fill: "#fff", stroke: t.litur, strokeWidth: 1.8, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
      {t.logun === "x" ? <path d="M5 1.5h4V5h3.5v4H9v3.5H5V9H1.5V5H5Z" {...p} /> : t.logun === "d" ? <path d="M7 1.5L12 7L7 12.5L2 7Z" {...p} /> : t.logun === "s" ? <rect x="2.5" y="2.5" width="9" height="9" {...p} /> : <path d={BLOM_D} {...p} strokeWidth={1.5} />}
    </svg>
  );
}
function TaknSvg({ t }: { t: Takn }) {
  const c = t.litur;
  return (
    <svg viewBox="0 0 14 14" width="13" height="13" aria-hidden="true">
      {t.logun === "x" ? <path d="M3 3L11 11M11 3L3 11" stroke={c} strokeWidth="2.4" strokeLinecap="round" fill="none" /> : t.logun === "d" ? <path d="M7 1L12 7L7 13L2 7Z" fill={c} /> : t.logun === "t" ? <path d="M7 2L12.5 12H1.5Z" fill={c} /> : t.logun === "s" ? <rect x="2.5" y="2.5" width="9" height="9" fill={c} /> : <circle cx="7" cy="7" r={Math.min(6, t.r * 1.25)} fill={c} />}
    </svg>
  );
}

export default function KortClient() {
  const [verk, setVerk] = useState<Verk | null>(null);
  const [teikn, setTeikn] = useState<Teikning[]>([]);
  const [skr, setSkr] = useState<Skr[]>([]);
  const [flokkar, setFlokkar] = useState<Flokkur[]>([]);
  const [menn, setMenn] = useState<Starfsm[]>([]);
  const [log, setLog] = useState<Lag[]>([]);
  const [aaetlud, setAaetlud] = useState<Aaetlad[]>([]);
  const [faerslur, setFaerslur] = useState<Faersla[]>([]);
  const [faera, setFaera] = useState(false); // færsluhamur: draga punkta á réttan stað
  const [villa, setVilla] = useState<string | null>(null);
  const [hladid, setHladid] = useState("Sæki verk…");
  const [syn, setSyn] = useState<number | null>(null); // teikning.id sem er sýnd (yfirlit eða stök)
  // síur
  const [afTakn, setAfTakn] = useState<Record<string, boolean>>({});
  const [stada, setStada] = useState<"allt" | "done" | "opid" | "eftir">("allt");
  const [afDeild, setAfDeild] = useState<Record<string, boolean>>({});
  const [madur, setMadur] = useState("");
  const [fra, setFra] = useState(""); const [til, setTil] = useState("");
  const [lagf, setLagf] = useState<"allt" | "lagf" | "A" | "B" | "?">("allt");
  const [tvitok, setTvitok] = useState(false);
  const [oparad, setOparad] = useState(false); // aðeins skráningar sem parast ekki við áætlað gat
  const [anEnda, setAnEnda] = useState(false); // aðeins skráningar þar sem hinn endann vantar
  const [samaSia, setSamaSia] = useState(false); // aðeins skráningar þar sem hinn endinn er skráður SÖMU megin við brunavegginn
  /** Ajour-staðir (Agnar 13.11.2026: „myndi vilja geta séð Ajour punktana hvar þeir eru“): blár punktur þar sem pikkað var í Ajour, lína í merkið ef það var fært. */
  const [synaAjour, setSynaAjour] = useState(false);
  /** Stór mynd (ljósakassi): Agnar 13.11.2026, „yrði hægt að geta séð preview mynd úr punktunum“. */
  const [ljos, setLjos] = useState<{ slodir: string[]; i: number; nr: number } | null>(null);
  const [veggir, setVeggir] = useState<{ lykill: string; v: Veggir; nemar: number[] | null; hurdir: number[] } | null>(null);
  const [aaStada, setAaStada] = useState("allt"); // sía áætlaðra gata eftir pörunarstöðu
  const [synaSkr, setSynaSkr] = useState(true); const [synaAaetlud, setSynaAaetlud] = useState(true);
  const [baetaFag, setBaetaFag] = useState(""); // fag áætlaðs gats sem er verið að setja (tómt = ekki í setja-ham)
  const [baetaFlokkur, setBaetaFlokkur] = useState<number | "">(""); const [baetaFjoldi, setBaetaFjoldi] = useState(2); // stærð (flokkur) og stök verk nýs gats
  const [valinn, setValinn] = useState<{ p?: Punktur; a?: Aaetlad; nanar?: Nanar | null; hja?: number[] } | null>(null);
  const [myndTeljari, setMyndTeljari] = useState(0); // hækkar þegar mynd hleðst → endurteikna
  const [synFag, setSynFag] = useState(""); // flýtisýn eftir fagi (SYNIR); tómt = lög og síur eins og þau eru stillt
  const [lanSyn, setLanSyn] = useState<Record<number, boolean>>({}); // lánuð lög sem kveikt er á (aðeins á þessum skjá)
  const [skuffa, setSkuffa] = useState(false); // mjór skjár: hliðarstikan er skúffa að neðan
  const [virkDeild, setVirkDeild] = useState(""); // símasýn: deildin sem er sýnd ein (tómt = allar)
  /** Snertiskjár eða mjór gluggi: neðri stika með stórum hnöppum, krosshár þegar punktur er settur, og punktur er VALINN áður en hann er dreginn. */
  const [snerti, setSnerti] = useState(false);
  /** Mjótt útlit (kortið fyllir skjáinn, hliðarstikan er skúffa): gluggi ≤ 860 px, eða sími sem teiknar síðuna í „tölvuútgáfu“ (sjá áhrifin hér að neðan). */
  const [mjor, setMjor] = useState(false);
  const snertiRef = useRef(false);
  /** Snertiskjár: áætluð göt sem EIGA skráningu (grænir og gulir tíglar) eru falin nema beðið sé um þau — aðeins rauðir punktar („eftir“) sjást, annars verður kortið ólæsilegt. */
  const [synaParud, setSynaParud] = useState(false);
  const [synaTillogur, setSynaTillogur] = useState(true); // tillögur tóla (stokkur í brunavegg án skráningar)
  const fyrstaSyn = useRef(true);
  useEffect(() => {
    /* Sími í „tölvuútgáfu“ vafrans (Desktop site): vafrinn hunsar viewport-merkið, teiknar síðuna ~980 px breiða og smækkar hana á skjáinn, svo
     * @media (max-width) sér aldrei síma. Þess vegna ræðst útlitið hér: sé bendillinn grófur, skjárinn lítill (≤ 600 px á styttri kant) og glugginn
     * samt mun breiðari en skjárinn, er .aj stækkað aftur með zoom (gluggabreidd / skjábreidd) og breiddin reiknuð eftir því. --gk-vh er SÝNILEG hæð
     * gluggans í einingum síðunnar (100vh er hærra en það sem sést í símavafra og neðri stikan lenti neðan við skjáinn). */
    const a = window.matchMedia("(pointer: coarse)"), aj = document.querySelector<HTMLElement>(".aj"), f = () => {
      const grofur = a.matches, sw = window.screen?.width || 0, stutt = Math.min(sw, window.screen?.height || 0);
      const z = grofur && stutt > 0 && stutt <= 600 && window.innerWidth > sw * 1.3 ? window.innerWidth / sw : 1, m = window.innerWidth / z <= 860;
      if (aj) { aj.style.setProperty("zoom", String(Math.round(z * 1000) / 1000)); aj.style.setProperty("--gk-vh", `${Math.round((window.innerHeight / z) * 10) / 10}px`); aj.classList.toggle("gk-mjor", m); }
      snertiRef.current = grofur || m; setSnerti(snertiRef.current); setMjor(m);
      if (fyrstaSyn.current) { fyrstaSyn.current = false; if (snertiRef.current) setSynFag("loftraesting"); }   // sími opnast í einni fagsýn, ekki með öllum lögum og táknum í einu
    };
    f(); a.addEventListener("change", f); window.addEventListener("resize", f); window.visualViewport?.addEventListener("resize", f);
    return () => { a.removeEventListener("change", f); window.removeEventListener("resize", f); window.visualViewport?.removeEventListener("resize", f); if (aj) { aj.style.removeProperty("zoom"); aj.style.removeProperty("--gk-vh"); aj.classList.remove("gk-mjor"); } };
  }, []);

  const cnvRef = useRef<HTMLCanvasElement | null>(null);
  /** Punktur (skráning eða áætlað gat) sem er verið að draga í færsluham, í hnitum blaðsins; teiknifallið les þetta beint. */
  const faerir = useRef<Faerir | null>(null);
  const kassiRef = useRef<HTMLDivElement | null>(null);
  const sjon = useRef({ k: 1, tx: 0, ty: 0, k0: 1 });
  const myndir = useRef(new Map<string, HTMLImageElement>());
  const raf = useRef(0);

  // ---------------------------------------------------------------- sækja
  useEffect(() => {
    (async () => {
      try {
        const s = sb(), q = new URLSearchParams(window.location.search), vid = Number(q.get("verk"));
        const v = vid ? await s.from("skr_verk").select("id,heiti").eq("id", vid).single() : await s.from("skr_verk").select("id,heiti").eq("eytt", false).ilike("heiti", "%gatakort%").order("id").limit(1).single();
        if (v.error || !v.data) throw new Error(v.error?.message || "Verk fannst ekki");
        const vk = v.data as Verk; setVerk(vk);
        const [t, f, m, l] = await Promise.all([
          s.from("skr_teikningar").select("id,heiti,haed,tegund,mynd_path,breidd_px,haed_px,yfirlit_id,vorpun,deildir,flisar").eq("verk_id", vk.id).eq("eytt", false).order("rod").order("id"),
          s.from("skr_flokkar").select("id,heiti").or(`verk_id.eq.${vk.id},verk_id.is.null`),
          s.from("skr_starfsmenn").select("id,numer,nafn").order("numer"),
          s.from("skr_log").select("id,teikning_id,heiti,fag,mynd_path,breidd_px,haed_px,vorpun,gegnsaei,synilegt,flisar").eq("verk_id", vk.id).eq("eytt", false).order("rod").order("id"),
        ]);
        const err = t.error || f.error || m.error || l.error; if (err) throw new Error(err.message);
        // áætluð göt í 1.000 raða síðum: ein beiðni klippist við 1.000 raðir og göt hurfu þegjandi af kortinu (13.11.2026: 1.098 raðir)
        const aa: Aaetlad[] = [];
        for (let i = 0; ; i += 1000) {
          const r = await s.from("skr_aaetlud").select(AA_SEL).eq("verk_id", vk.id).eq("eytt", false).order("id").range(i, i + 999);
          if (r.error) throw new Error(r.error.message);
          aa.push(...(r.data as Aaetlad[]));
          if (!r.data || r.data.length < 1000) break;
        }
        const tt = t.data as Teikning[];
        setTeikn(tt); setFlokkar(f.data as Flokkur[]); setMenn(m.data as Starfsm[]); setLog(l.data as Lag[]); setAaetlud(aa);
        setSyn((tt.find((x) => x.tegund === "yfirlit") || tt[0])?.id ?? null);
        const fa: Faersla[] = [];
        for (let i = 0; ; i += 1000) {
          const r = await s.from("skr_faerslur").select(FA_SEL).eq("verk_id", vk.id).eq("eytt", false).order("id").range(i, i + 999);
          if (r.error) throw new Error(r.error.message);
          fa.push(...(r.data as Faersla[]));
          if (!r.data || r.data.length < 1000) break;
        }
        setFaerslur(fa);
        const allar: Skr[] = [];
        for (let i = 0; ; i += 1000) {
          const r = await s.from("skr_skraningar").select("id,radnr,ajour_serial,teikning_id,x_px,y_px,flokkur_id,starfsmadur_id,stada,framkvaemt_til,deild:ajour_gogn->>deild,lagf:ajour_gogn->>lagf,tvitak_af:ajour_gogn->tvitak_af").eq("verk_id", vk.id).eq("eytt", false).order("id").range(i, i + 999);
          if (r.error) throw new Error(r.error.message);
          allar.push(...(r.data as unknown as Skr[])); setHladid(`Sæki skráningar… ${num(allar.length)}`);
          if (!r.data || r.data.length < 1000) break;
        }
        setSkr(allar); setHladid("");
      } catch (e) { setVilla(e instanceof Error ? e.message : String(e)); }
    })();
  }, []);

  // ---------------------------------------------------------------- afleitt
  const teikning = useMemo(() => teikn.find((t) => t.id === syn) || null, [teikn, syn]);
  const taknAf = useMemo(() => { const m = new Map<number, Takn>(); for (const f of flokkar) m.set(f.id, takn(f.heiti)); return m; }, [flokkar]);
  const ANNAD = useMemo(() => takn(""), []);
  /** Allir punktar sýnarinnar í hnitum myndarinnar sem er sýnd (yfirlit: varpað úr undirteikningum). */
  const punktar = useMemo<Punktur[]>(() => {
    if (!teikning) return [];
    const born = new Map<number, Vorpun | null>();
    if (teikning.tegund === "yfirlit") { for (const t of teikn) if (t.yfirlit_id === teikning.id && t.vorpun) born.set(t.id, t.vorpun); } else born.set(teikning.id, null);
    const fm = new Map<number, Faersla>();   // færðir punktar eiga aðeins við yfirlitsblaðið sem þeir voru færðir á
    if (teikning.tegund === "yfirlit") for (const f of faerslur) if (f.teikning_id === teikning.id) fm.set(f.skraning_id, f);
    const aYfirliti = teikning.tegund === "yfirlit";
    const out: Punktur[] = [];
    for (const s of skr) {
      if (s.teikning_id == null || s.x_px == null || s.y_px == null || !born.has(s.teikning_id)) continue;
      const v = born.get(s.teikning_id);
      const [x0, y0] = v ? varpa(v, +s.x_px, +s.y_px) : [+s.x_px, +s.y_px], f = fm.get(s.id);
      const x = f ? +f.x_px : x0, y = f ? +f.y_px : y0;
      out.push({ s, x, y, x0, y0, faersla: f, d: aYfirliti && teikning.breidd_px ? deildAf(x / teikning.breidd_px) : s.deild, t: (s.ajour_serial != null && RAUFAR_RAFMAGN.has(s.ajour_serial) ? RAF_TAKN : null) || (s.flokkur_id != null && taknAf.get(s.flokkur_id)) || ANNAD });
    }
    return out;
  }, [teikning, teikn, skr, taknAf, ANNAD, faerslur]);
  const faerdir = useMemo(() => faerslur.filter((f) => f.teikning_id === syn).length, [faerslur, syn]);
  const deildir = useMemo(() => [...new Set(punktar.map((p) => p.d).filter((d): d is string => !!d))].sort(), [punktar]);
  /** Skráningar sem eru paraðar við eitthvert áætlað gat á þessu blaði. */
  /** Hinn endinn (Agnar 13.11.2026: „ef maður gæti checkað við hina endana líka … rautt x ef það er ekki Ajour-punktur nálægt þeim megin“):
   *  næsta skráning SAMA HÓPS innan ENDI_PX frá sýndri stöðu, per skráningu. Vanti hana hefur aðeins annar endi lokunarinnar verið skráður.
   *  Reiknað úr ÖLLUM skráningum blaðsins (síur breyta því ekki), aðeins á yfirlitsblaði (þar er kvarðinn þekktur). Gólf er ekki með: eitt verk = ein þétting.
   *  HLIÐ VEGGJAR (Agnar 13.11.2026: „gáðu hvort þú finnir leið“): starfsmaðurinn pikkar á teikninguna þeim megin við vegginn sem hann vinnur. Mælt 13.11:
   *  í 87 % tveggja skráninga para á sama gegnumtaki liggur rauði veggurinn MILLI Ajour-staðanna (tilviljun gæfi 50 %). Því: liggi brunaveggur milli
   *  Ajour-staðar p (x0, y0 — ekki færðu stöðunnar) og Ajour-staðar einhverrar skráningar sama hóps innan ENDI_PX → „hinum“. Annars „sama“ ef rauður veggur
   *  er við merkið og engin Ajour-staðanna er á veggnum sjálfum, annars „ovist“. „sama“ er VEIKT merki (6H, 96 % búin: 16 % loftskráninga við vegg lenda
   *  þar; oftast sami maður sama dag sem pikkar tvisvar á sama stað) — þess vegna gult „?“ en ekki rautt ✕. */
  const veggjaLykill = teikning?.tegund === "yfirlit" && teikning.mynd_path ? `${teikning.haed}:${teikning.mynd_path.split("/").pop()}` : "";
  useEffect(() => {
    const f = VEGGIR[veggjaLykill]; if (!f) return; let lifir = true;
    const fn = NEMAR[veggjaLykill];
    Promise.all([f(), fn ? fn().catch(() => null) : null]).then(([m, n]) => { if (lifir) setVeggir({ lykill: veggjaLykill, v: veggjaNet(m.default.seg), nemar: n ? n.default.nemar : null, hurdir: m.default.hurdir || [] }); }).catch(() => { /* án veggja: nálægðarreglan ein */ });
    return () => { lifir = false; };
  }, [veggjaLykill]);
  const endar = useMemo(() => {
    const m = new Map<number, Endi>();
    if (teikning?.tegund !== "yfirlit") return m;
    const vg = veggir && veggir.lykill === veggjaLykill ? veggir.v : null, nm = vg && veggir ? veggir.nemar : null;
    const nr = (q: Punktur) => q.s.ajour_serial ?? q.s.radnr;
    // nemar: hver skráning nemahópsins fær þann nema sem sýnd staða hennar fellur best að; s = formerkt fjarlægð Ajour-staðar frá vegglínu nemans
    const nemiAf = new Map<number, number>(), hopar = new Map<number, { p: Punktur; s: number }[]>(), hl = new Map<number, { megin: number; fest: boolean }>();
    if (nm) {
      const nn = new Map<number, number[]>();
      for (let i = 0; i + 4 < nm.length; i += 5) { const l = vLyk(Math.floor(nm[i] / VC), Math.floor(nm[i + 1] / VC)), a = nn.get(l); if (a) a.push(i); else nn.set(l, [i]); }
      for (const p of punktar) {
        if (p.t.hopur !== NEMA_HOPUR) continue;
        const gx = Math.floor(p.x / VC), gy = Math.floor(p.y / VC); let b = 1e9, bi = -1;
        for (let ix = gx - 1; ix <= gx + 1; ix++) for (let iy = gy - 1; iy <= gy + 1; iy++) for (const i of nn.get(vLyk(ix, iy)) || []) {
          const dx = p.x - nm[i], dy = p.y - nm[i + 1], al = Math.abs(dx * nm[i + 2] + dy * nm[i + 3]), th = Math.abs(-dx * nm[i + 3] + dy * nm[i + 2]);
          if (al <= nm[i + 4] + N_MED && th <= N_THV && al + th < b) { b = al + th; bi = i; }
        }
        if (bi < 0) continue;
        nemiAf.set(p.s.id, bi);
        const tx = nm[bi + 2], ty = nm[bi + 3], s0 = -(p.x0 - nm[bi]) * ty + (p.y0 - nm[bi + 1]) * tx, sd = -(p.x - nm[bi]) * ty + (p.y - nm[bi + 1]) * tx, ald = (p.x - nm[bi]) * tx + (p.y - nm[bi + 1]) * ty;
        const fest = p.faersla?.uppruni === "handvirkt" && Math.abs(ald) <= 0.35 && Math.abs(Math.abs(sd) - SMELL_PX) <= 0.35, sv = fest ? (sd > 0 ? 99 : -99) : s0;
        hl.set(p.s.id, { megin: Math.abs(sv) <= A_LINU ? 0 : (Math.abs(tx) > Math.abs(ty) ? sv * tx : sv * -ty) > 0 ? 1 : -1, fest });
        const h = hopar.get(bi), e = { p, s: sv };
        if (h) h.push(e); else hopar.set(bi, [e]);
      }
    }
    const net = new Map<string, Punktur[]>(), lyk = (h: string, gx: number, gy: number) => `${h}|${gx}|${gy}`;
    for (const p of punktar) { if (p.t.hopur === "Gólf") continue; const l = lyk(p.t.hopur, Math.floor(p.x / ENDI_PX), Math.floor(p.y / ENDI_PX)), a = net.get(l); if (a) a.push(p); else net.set(l, [p]); }
    for (const p of punktar) {
      if (p.t.hopur === "Gólf") continue;
      const gx = Math.floor(p.x / ENDI_PX), gy = Math.floor(p.y / ENDI_PX), ni = nemiAf.get(p.s.id);
      // bq = næsta skráning · hq = næsta með brunavegg á milli Ajour-staðanna · h0 = sama, en aðeins skráningar sem eiga engan nema
      let bd = ENDI_PX, bq: Punktur | null = null, hd = ENDI_PX, hq: Punktur | null = null, h0d = ENDI_PX, h0: Punktur | null = null, aLinu = false;
      for (let ix = gx - 1; ix <= gx + 1; ix++) for (let iy = gy - 1; iy <= gy + 1; iy++) for (const q of net.get(lyk(p.t.hopur, ix, iy)) || []) {
        if (q === p) continue; const d = Math.hypot(q.x - p.x, q.y - p.y); if (d > ENDI_PX) continue;
        if (d <= bd) { bd = d; bq = q; }
        if (!vg) continue;
        if (skerVegg(vg, p.x0, p.y0, q.x0, q.y0)) { if (d <= hd) { hd = d; hq = q; } if (!nemiAf.has(q.s.id) && d <= h0d) { h0d = d; h0 = q; } } else if (fjarVegg(vg, q.x0, q.y0) < A_LINU) aLinu = true;
      }
      if (ni !== undefined) {   // á nema: aðeins skráning á sama gegnumtaki hinum megin (eða skráning án nema handan veggjar) telst hinn endinn
        const hp = hopar.get(ni)!, me = hp.find((e) => e.p === p)!; let A = 0, B = 0; for (const e of hp) { if (e.s > A_LINU) A++; else if (e.s < -A_LINU) B++; }
        const naest = (f: (e: { p: Punktur; s: number }) => boolean) => { let b: Punktur | null = null, bdd = 1e9; for (const e of hp) { if (e.p === p || !f(e)) continue; const d = Math.hypot(e.p.x0 - p.x0, e.p.y0 - p.y0); if (d < bdd) { bdd = d; b = e.p; } } return b; };
        if (A && B) { const q = naest((e) => (me.s > A_LINU ? e.s < -A_LINU : me.s < -A_LINU ? e.s > A_LINU : true)) || naest(() => true)!; m.set(p.s.id, { q, nr: nr(q), d: Math.hypot(q.x - p.x, q.y - p.y), hlid: "hinum", nemi: ni }); }
        else if (h0) m.set(p.s.id, { q: h0, nr: nr(h0), d: h0d, hlid: "hinum", nemi: ni });
        else if (hp.length === 1) m.set(p.s.id, { q: null, nr: null, d: 0, hlid: "einn", nemi: ni });
        else { const q = naest(() => true)!; m.set(p.s.id, { q, nr: nr(q), d: Math.hypot(q.x - p.x, q.y - p.y), hlid: A + B === hp.length ? "samaNemi" : "ovist", nemi: ni }); }
        continue;
      }
      if (!bq) continue;
      if (hq) m.set(p.s.id, { q: hq, nr: nr(hq), d: hd, hlid: "hinum" });
      else m.set(p.s.id, { q: bq, nr: nr(bq), d: bd, hlid: !vg || fjarVegg(vg, p.x, p.y) > VEGG_NAER || aLinu || fjarVegg(vg, p.x0, p.y0) < A_LINU ? "ovist" : "sama" });
    }
    /* Munaðarlausar skráningar (engin innan 0,9 m, eða ein á sínu gegnumtaki): Agnar 13.11.2026, „mátt alveg halda áfram að reyna láta matcha“. Önnur
     * munaðarlaus skráning SAMA flokks innan 1,5 m með brunavegg milli Ajour-staðanna er hinn endinn (pikkin lentu lengra í sundur en 0,9 m, eða
     * sjálfvirka færslan valdi hvort sinn stokkinn). Mælt 13.11 (loft með raufum): leysir 8 af 110 á 6H og 6 af 75 á 5H. Þær sem eiga aðra munaðarlausa
     * nálægt SÖMU megin eða án veggjar á milli (30 á 6H, 8 á 5H) eru látnar óhreyfðar: þar segir ekkert til um hvort þær eru sama lokun. */
    if (vg) {
      const mun = punktar.filter((p) => { if (p.t.hopur === "Gólf") return false; const e = m.get(p.s.id); return !e || e.hlid === "einn"; });
      const mnet = new Map<number, Punktur[]>();
      for (const p of mun) { const l = vLyk(Math.floor(p.x / ENDI_VITT_PX), Math.floor(p.y / ENDI_VITT_PX)), a = mnet.get(l); if (a) a.push(p); else mnet.set(l, [p]); }
      const nytt: [Punktur, Punktur, number][] = [];
      for (const p of mun) {
        const gx = Math.floor(p.x / ENDI_VITT_PX), gy = Math.floor(p.y / ENDI_VITT_PX); let bd = ENDI_VITT_PX, bq: Punktur | null = null;
        for (let ix = gx - 1; ix <= gx + 1; ix++) for (let iy = gy - 1; iy <= gy + 1; iy++) for (const q of mnet.get(vLyk(ix, iy)) || []) {
          if (q === p || q.s.flokkur_id !== p.s.flokkur_id || q.t.hopur !== p.t.hopur) continue;   /* sami hópur líka: raufar sem eru raflagnir (RAUFAR_RAFMAGN) parast ekki við loftraufar */ const d = Math.hypot(q.x - p.x, q.y - p.y);
          if (d <= bd && skerVegg(vg, p.x0, p.y0, q.x0, q.y0)) { bd = d; bq = q; }
        }
        if (bq) nytt.push([p, bq, bd]);
      }
      for (const [p, q, d] of nytt) m.set(p.s.id, { q, nr: nr(q), d, hlid: "hinum", nemi: nemiAf.get(p.s.id), vitt: true });
    }
    for (const [id, x] of hl) { const e = m.get(id); if (e) { e.megin = x.megin; e.fest = x.fest; } }
    return m;
  }, [punktar, teikning, veggir, veggjaLykill]);
  /** Hinn endinn er skráður, en Ajour-staðir beggja eru sömu megin við brunavegginn (veikt merki, sjá að ofan). */
  const samaMegin = useCallback((p: Punktur) => { const h = endar.get(p.s.id)?.hlid; return h === "sama" || h === "samaNemi"; }, [endar]);
  /** Hinn endinn er skráður og kláraður (í sama merki eða öðru): seinna hakið. Hlið veggjar ræður ekki hér — tvö stök verk á sama stað eru ein lokun. */
  const hinnKlar = useCallback((p: Punktur) => { const e = endar.get(p.s.id); return !!e && e.hlid !== "einn" && e.q?.s.stada === "done"; }, [endar]);
  /** Vantar hinn endann? (aðeins á yfirlitsblaði og ekki gólf) */
  const vantarEnda = useCallback((p: Punktur) => { if (teikning?.tegund !== "yfirlit" || p.t.hopur === "Gólf") return false; const e = endar.get(p.s.id); return !e || e.hlid === "einn"; }, [teikning, endar]);
  const paradIds = useMemo(() => { const m = new Set<number>(); for (const a of aaetlud) if (a.teikning_id === syn && a.parad) for (const id of a.parad.ids) m.add(id); return m; }, [aaetlud, syn]);
  /** Sía án táknasíunnar — skýringarnar sýna þá réttan fjölda per tákn. */
  const synV = useMemo(() => SYNIR.find((x) => x[0] === synFag) || null, [synFag]);
  /** Símasýn: ein deild í einu (Agnar 12.11.2026: „í breytingarham er alveg nóg að sjá bara eina deild í einu“). Aðeins á yfirlitsblaði. */
  const einDeild = virkDeild && teikning?.tegund === "yfirlit" ? virkDeild : "";
  const siaAn = useCallback((p: Punktur) => {
    const s = p.s;
    if (einDeild && p.d !== einDeild) return false;
    if (synV && !synV[3].includes(p.t.hopur)) return false;
    if (p.d && afDeild[p.d]) return false;
    if (madur && String(s.starfsmadur_id) !== madur) return false;
    if (fra && (!s.framkvaemt_til || s.framkvaemt_til.slice(0, 7) < fra)) return false;
    if (til && (!s.framkvaemt_til || s.framkvaemt_til.slice(0, 7) > til)) return false;
    if (lagf === "lagf" && !s.lagf) return false;
    if (lagf !== "allt" && lagf !== "lagf" && s.lagf !== lagf) return false;
    if (tvitok && !s.tvitak_af) return false;
    if (oparad && paradIds.has(s.id)) return false;
    if ((anEnda || samaSia) && !((anEnda && vantarEnda(p)) || (samaSia && samaMegin(p)))) return false;
    return true;
  }, [einDeild, synV, afDeild, madur, fra, til, lagf, tvitok, oparad, paradIds, anEnda, vantarEnda, samaSia, samaMegin]);
  /** Staða: Tilbúin = kláraðar skráningar · Í vinnslu = ókláraðar skráningar · Eftir = engar skráningar sýndar (aðeins rauðir punktar áætlaðra gata). */
  const grunnsia = useCallback((p: Punktur) => siaAn(p) && (stada === "allt" || (stada === "done" ? p.s.stada === "done" : stada === "opid" ? p.s.stada !== "done" : false)), [siaAn, stada]);
  const grunn = useMemo(() => punktar.filter(grunnsia), [punktar, grunnsia]);
  const syndir = useMemo(() => grunn.filter((p) => !afTakn[p.t.heiti]), [grunn, afTakn]);
  const aaetludBlads = useMemo(() => aaetlud.filter((a) => a.teikning_id === syn), [aaetlud, syn]);
  /** Tákn (stærðarflokkur) áætlaðs gats — sama flokkun og skráningar, svo stærðarsían gildir um hvort tveggja. */
  const aaTakn = useCallback((a: Aaetlad) => (a.flokkur_id != null && taknAf.get(a.flokkur_id)) || takn(a.fag === "rafmagn" ? "Raf" : a.fag === "golf" ? "Gólf" : "Annað"), [taknAf]);
  const aaEftir = (a: Aaetlad) => !a.parad || a.parad.stada === "vantar";   // engin skráning parast: handvirkur punktur eða merki án skráningar
  const aaIDeild = useCallback((a: Aaetlad) => !einDeild || deildAf(+a.x_px / (teikning?.breidd_px || 1)) === einDeild, [einDeild, teikning]);
  const aaStodusia = useCallback((a: Aaetlad) => {
    if (!aaIDeild(a)) return false;
    if (synV && !synV[2].includes(a.fag)) return false;
    if (aaStada !== "allt" && (a.parad?.stada ?? "oreiknad") !== aaStada) return false;
    if (stada === "done") return false;
    if (stada === "opid") return a.parad?.stada === "hluti";
    if (stada === "eftir") return aaEftir(a);
    return true;
  }, [aaIDeild, synV, aaStada, stada]);
  const aaetludSynar = useMemo(() => aaetludBlads.filter((a) => aaStodusia(a) && !afTakn[aaTakn(a).heiti] && (!snerti || synaParud || !a.parad || a.parad.stada === "vantar") && (synaTillogur || !erTillaga(a))), [aaetludBlads, aaStodusia, afTakn, aaTakn, snerti, synaParud, synaTillogur]);
  const tillogur = useMemo(() => aaetludBlads.filter((a) => erTillaga(a) && (!a.parad || a.parad.stada === "vantar") && aaStodusia(a)).length, [aaetludBlads, aaStodusia]);
  const stoduTal = useMemo(() => { let d = 0, o = 0; for (const q of punktar) if (siaAn(q) && !afTakn[q.t.heiti]) { if (q.s.stada === "done") d++; else o++; } const e = aaetludBlads.filter((a) => aaEftir(a) && !erTillaga(a) && aaIDeild(a) && (!synV || synV[2].includes(a.fag)) && !afTakn[aaTakn(a).heiti]).length; return { allt: d + o, done: d, opid: o, eftir: e }; }, [punktar, siaAn, afTakn, aaetludBlads, aaTakn, synV, aaIDeild]);
  const taknTal = useMemo(() => {
    const m = new Map<string, { t: Takn; n: number }>();
    for (const q of punktar) if (siaAn(q) && !m.has(q.t.heiti)) m.set(q.t.heiti, { t: q.t, n: 0 });
    for (const q of grunn) m.get(q.t.heiti)!.n++;
    if (stada !== "allt") for (const a of aaetludBlads) if (aaStodusia(a)) { const t = aaTakn(a), x = m.get(t.heiti); if (x) x.n++; else m.set(t.heiti, { t, n: 1 }); }
    return [...m.values()].sort((a, b) => ROD.indexOf(a.t.heiti) - ROD.indexOf(b.t.heiti));
  }, [punktar, siaAn, grunn, stada, aaetludBlads, aaStodusia, aaTakn]);
  const samantekt = useMemo(() => {
    const rod = new Map<string, { kl: number[]; op: number[] }>();
    for (const p of syndir) { const d = p.d || "—"; let r = rod.get(d); if (!r) { r = { kl: HOPAR.map(() => 0), op: HOPAR.map(() => 0) }; rod.set(d, r); } const i = HOPAR.indexOf(p.t.hopur); (p.s.stada === "done" ? r.kl : r.op)[i]++; }
    return [...rod.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [syndir]);
  /** Lög blaðsins. Yfirlitsblað án eigin laga sem notar sömu grunnmynd og annað yfirlit (4H notar 5H-blaðið) fær lög þess að láni. */
  const logSynar = useMemo<Lag[]>(() => {
    const eigin = log.filter((l) => l.teikning_id === syn);
    if (eigin.length || !teikning || teikning.tegund !== "yfirlit" || !teikning.mynd_path) return eigin;
    const hitt = teikn.find((t) => t.id !== teikning.id && t.tegund === "yfirlit" && t.mynd_path === teikning.mynd_path && log.some((l) => l.teikning_id === t.id));
    return hitt ? log.filter((l) => l.teikning_id === hitt.id).map((l) => ({ ...l, lan: hitt.haed || hitt.heiti })) : eigin;
  }, [log, syn, teikning, teikn]);
  /** Sést lagið? Flýtisýn ræður ef hún er á; lánað lag er falið þar til kveikt er á því hér; annars stillingin í grunninum. */
  const lagSest = useCallback((l: Lag) => (synV ? synV[2].includes(l.fag) : l.lan ? !!lanSyn[l.id] : l.synilegt), [synV, lanSyn]);
  const manudir = useMemo(() => [...new Set(skr.map((s) => (s.framkvaemt_til || "").slice(0, 7)).filter(Boolean))].sort(), [skr]);
  const endaVantar = useMemo(() => syndir.reduce((n, p) => n + (vantarEnda(p) ? 1 : 0), 0), [syndir, vantarEnda]);
  const samaTal = useMemo(() => syndir.reduce((n, p) => n + (samaMegin(p) ? 1 : 0), 0), [syndir, samaMegin]);
  const utanKorts = useMemo(() => skr.filter((s) => s.teikning_id == null).length, [skr]);

  // ---------------------------------------------------------------- myndir
  const mynd = useCallback((slodin: string | null) => {
    if (!slodin) return null;
    const til_ = myndir.current.get(slodin); if (til_) return til_.complete && til_.naturalWidth ? til_ : null;
    const im = new Image(); im.onload = () => setMyndTeljari((n) => n + 1); im.src = publicUrl(slodin); myndir.current.set(slodin, im); return null;
  }, []);

  /** Flís úr minni (LRU): skilar mynd ef hún er hlaðin, annars null og setur hleðslu af stað. */
  const flisMinni = useRef(new Map<string, { im: HTMLImageElement; rammi: number }>());
  const flisRammi = useRef(0); // hækkar við hverja teikningu; flís sem núverandi rammi notar er aldrei hent
  const flis = useCallback((slodin: string) => {
    const m = flisMinni.current, r = flisRammi.current, til_ = m.get(slodin);
    if (til_) { til_.rammi = r; m.delete(slodin); m.set(slodin, til_); return til_.im.complete && til_.im.naturalWidth ? til_.im : null; }
    const im = new Image(); im.onload = () => setMyndTeljari((n) => n + 1); im.src = publicUrl(slodin); m.set(slodin, { im, rammi: r });
    if (m.size > FLISA_HAMARK) for (const [lykill, v] of m) { if (m.size <= FLISA_HAMARK) break; if (v.rammi !== r) { v.im.src = ""; m.delete(lykill); } }
    return null;
  }, []);

  // ---------------------------------------------------------------- teikna
  const W = teikning?.breidd_px || 1000, H = teikning?.haed_px || 700;
  const teikna = useCallback(() => {
    const cnv = cnvRef.current, kassi = kassiRef.current; if (!cnv || !kassi || !teikning) return;
    // undir zoom (sími í tölvuútgáfu) er hver eining strigans stærri á skjánum: upplausnin fylgir því, annars verður teikningin óskýr
    const cw = kassi.clientWidth, ch = kassi.clientHeight, dpr = (window.devicePixelRatio || 1) * (cw ? Math.max(1, kassi.getBoundingClientRect().width / cw) : 1);
    if (cnv.width !== Math.round(cw * dpr) || cnv.height !== Math.round(ch * dpr)) { cnv.width = Math.round(cw * dpr); cnv.height = Math.round(ch * dpr); }
    const cx = cnv.getContext("2d"); if (!cx) return;
    const { k, tx, ty, k0 } = sjon.current;
    cx.setTransform(1, 0, 0, 1, 0, 0); cx.fillStyle = "#fff"; cx.fillRect(0, 0, cnv.width, cnv.height);
    cx.setTransform(dpr * k, 0, 0, dpr * k, dpr * tx, dpr * ty);
    // Skarpar flísar: sýnilegt svæði í grunnmyndarhnitum → flísar sem þarf; teiknað aðeins þegar ALLAR sýnilegar flísar lags eru
    // hlaðnar (annars grófa myndin áfram), svo gegnsæ lög teiknist aldrei tvisvar.
    flisRammi.current++;
    let flisarRamma = 0; const flisaThak = snerti ? FLISA_THAK_SNERTI : Infinity;   // sími: minni fyrir afkóðaðar flísar er takmarkað
    const skarpt = k * dpr >= FLISA_MORK, sx0 = -tx / k, sy0 = -ty / k, sx1 = (cw - tx) / k, sy1 = (ch - ty) / k;
    const teiknaFlisar = (f: Flisar | null, alfa: number): boolean => {
      if (!skarpt || !f || !f.til?.length) return false;
      const bw = f.bx / f.kvardi, bh = f.by / f.kvardi, tilSett = new Set(f.til), tharf: [number, number][] = [];
      for (let r = Math.max(0, Math.floor(sy0 / bh)); r <= Math.min(f.radir - 1, Math.floor(sy1 / bh)); r++) for (let c = Math.max(0, Math.floor(sx0 / bw)); c <= Math.min(f.dalkar - 1, Math.floor(sx1 / bw)); c++) if (tilSett.has(`${c}_${r}`)) tharf.push([c, r]);
      if (tharf.length > 12 || flisarRamma + tharf.length > flisaThak) return false;   // of stórt svæði fyrir flísar: grófa myndin dugar
      flisarRamma += tharf.length;
      const hlada = tharf.map(([c, r]) => [flis(`${f.slod}/${c}_${r}.${f.ending}`), c, r] as [HTMLImageElement | null, number, number]);
      if (hlada.some((h) => !h[0])) return false;
      cx.save(); cx.globalAlpha = alfa; for (const [im, c, r] of hlada) cx.drawImage(im!, c * bw, r * bh, bw + 0.4 / k, bh + 0.4 / k); cx.restore();
      return true;
    };
    const grunnur = mynd(teikning.mynd_path); if (grunnur) cx.drawImage(grunnur, 0, 0, W, H);
    teiknaFlisar(teikning.flisar, 1);
    for (const l of logSynar) {
      if (!lagSest(l)) continue;
      const eins = !l.vorpun || (l.vorpun.a === 1 && !l.vorpun.e && !l.vorpun.f && !l.vorpun.b && !l.vorpun.c && (l.vorpun.d ?? 1) === 1);
      if (eins && l.vorpun && teiknaFlisar(l.flisar, Number(l.gegnsaei))) continue;
      const im = mynd(l.mynd_path); if (!im) continue;
      const v = l.vorpun || { a: W / (l.breidd_px || im.naturalWidth), e: 0, f: 0 };
      cx.save(); cx.globalAlpha = Number(l.gegnsaei); cx.transform(v.a, v.b || 0, v.c || 0, v.d ?? v.a, v.e, v.f); cx.drawImage(im, 0, 0); cx.restore();
    }
    // ein deild í einu: hinar deildirnar eru dofnaðar, svo ljóst sé hvar unnið er (deildaskil á x: 0,179 · 0,5 · 0,812 af blaðbreidd)
    if (einDeild) {
      const skil = [0, 0.179, 0.5, 0.812, 1], i = ["S1", "S2", "S4", "S5"].indexOf(einDeild);
      if (i >= 0) { cx.fillStyle = "rgba(255,255,255,.72)"; cx.fillRect(sx0 - 10, sy0 - 10, skil[i] * W - sx0 + 10, sy1 - sy0 + 20); cx.fillRect(skil[i + 1] * W, sy0 - 10, sx1 - skil[i + 1] * W + 10, sy1 - sy0 + 20); }
    }
    const zs = Math.max(0.75, Math.min(3.2, Math.sqrt(k / k0) * 0.9)) / k; // táknstærð í skjápixlum, vex hægt með stækkun
    const zb = snerti ? Math.min(zs, 1.45 / k) : zs;   // símasýn: áætluð göt og tillögur vaxa ekki endalaust með stækkun
    const dr = faerir.current;
    if (synaSkr && veggir && veggir.lykill === veggjaLykill && veggir.hurdir.length) {   // hurðaop í brunavegg: kerfið fer með þau sem vegg (stokkar fara yfir hurðir)
      const hu = veggir.hurdir; cx.beginPath(); for (let i = 0; i + 3 < hu.length; i += 4) { cx.moveTo(hu[i], hu[i + 1]); cx.lineTo(hu[i + 2], hu[i + 3]); }
      cx.lineCap = "butt"; cx.lineWidth = Math.max(1.6 / k, 1.6); cx.strokeStyle = "rgba(37,99,235,.85)"; cx.stroke();
    }
    /* Ajour-staður færðrar skráningar: strikalína frá staðnum í Ajour að merkinu (teiknuð undir merkjum) og blár punktur á staðnum (teiknaður síðast, ofan á).
     * Sést fyrir allar færðar skráningar þegar „Ajour-staðir“ er á, alltaf fyrir valda eða dregna skráningu, og í Færa-ham á borðtölvu eins og áður. */
    const ajPt: Punktur[] = [], ajR = (snerti ? Math.max(2, Math.min(3.4, merkisR(k, k0) * 0.3)) : Math.max(1.8, 1.6 * zs * k)) / k;
    const ajLina = (p: Punktur, px: number, py: number) => { cx.beginPath(); cx.moveTo(p.x0, p.y0); cx.lineTo(px, py); cx.lineWidth = 1.3 / k; cx.strokeStyle = "#1d4ed8"; cx.setLineDash([4 / k, 3 / k]); cx.stroke(); cx.setLineDash([]); ajPt.push(p); };
    if (synaSkr && snerti) {
      /* Símasýn (Agnar 12.11.2026: krossarnir urðu „messy og ruglingslegir“): hrein merki eins og á Miro-borðinu hans. Skráningar sama hóps sem
       * lægju hver ofan á annarri (tvær hliðar sama veggjar) eru EITT merki: útlína í lit stærðar, ✓ fyrir hvert klárað stakt verk (tvö sýnd,
       * fjöldinn stendur í merkinu ef þau eru þrjú eða fleiri), rauður hringur ef eitthvert þeirra er opið. Valinn eða dreginn punktur er
       * alltaf teiknaður stakur. Val og færsla vinna áfram á hverri skráningu fyrir sig. */
      const Rs = merkisR(k, k0), R = Rs / k, D = 2.4 * R, jadar = 3 * R;
      type Hlidar = { nA: number; nB: number; fA: boolean; fB: boolean };   // kláraðar skráningar með þekkta hlið: A = ofan/vinstra megin, B = neðan/hægra megin; f = smellt með hendi
      type Hop = { x: number; y: number; n: number; nd: number; no: number; ve: number; vs: number; nh: number; t: Takn; hs: Hlidar };   // ve = vantar hinn endann · vs = hinn endinn sömu megin við vegg · nh = hinn endinn skráður og kláraður
      const hlidar = (p: Punktur, hs: Hlidar) => { const e = endar.get(p.s.id); if (p.s.stada !== "done" || !e?.megin) return; if (e.megin < 0) { hs.nA++; if (e.fest) hs.fA = true; } else { hs.nB++; if (e.fest) hs.fB = true; } };
      const net = new Map<number, Hop[]>(), hopar: Hop[] = [], stakir: Punktur[] = [], lykill = (gx: number, gy: number) => gx * 100003 + gy;
      for (const p of syndir) {
        if (p.s.id === dr?.p?.s.id || p.s.id === valinn?.p?.s.id) { stakir.push(p); continue; }
        const iSjon = !(p.x < sx0 - jadar || p.x > sx1 + jadar || p.y < sy0 - jadar || p.y > sy1 + jadar);
        if (synaAjour && (iSjon || (p.x0 > sx0 && p.x0 < sx1 && p.y0 > sy0 && p.y0 < sy1))) { if (p.faersla) ajLina(p, p.x, p.y); else ajPt.push(p); }   // ófærð: punkturinn er í merkinu sjálfu
        if (!iSjon) continue;
        const gx = Math.floor(p.x / D), gy = Math.floor(p.y / D); let h: Hop | undefined;
        leit: for (let ix = gx - 1; ix <= gx + 1; ix++) for (let iy = gy - 1; iy <= gy + 1; iy++) for (const q of net.get(lykill(ix, iy)) || []) if (q.t.hopur === p.t.hopur && Math.hypot(q.x - p.x, q.y - p.y) < D) { h = q; break leit; }
        if (h) { h.x = (h.x * h.n + p.x) / (h.n + 1); h.y = (h.y * h.n + p.y) / (h.n + 1); h.n++; if (p.t.r > h.t.r) h.t = p.t; }
        else { h = { x: p.x, y: p.y, n: 1, nd: 0, no: 0, ve: 0, vs: 0, nh: 0, t: p.t, hs: { nA: 0, nB: 0, fA: false, fB: false } }; hopar.push(h); const l = lykill(gx, gy), a = net.get(l); if (a) a.push(h); else net.set(l, [h]); }
        if (p.s.stada === "done") h.nd++; else h.no++;
        if (vantarEnda(p)) h.ve++; else { if (samaMegin(p)) h.vs++; if (hinnKlar(p)) h.nh++; }
        hlidar(p, h.hs);
      }
      const vgT = veggir && veggir.lykill === veggjaLykill ? veggir.v : null;
      const tikk = (x: number, y: number, litur: string) => {
        const t = R; cx.beginPath(); cx.moveTo(x - 0.5 * t, y - 0.1 * t); cx.lineTo(x - 0.12 * t, y + 0.38 * t); cx.lineTo(x + 0.6 * t, y - 0.55 * t);
        cx.lineJoin = "round"; cx.lineCap = "round"; cx.lineWidth = R * 0.44; cx.strokeStyle = "#fff"; cx.stroke(); cx.lineWidth = R * 0.24; cx.strokeStyle = litur; cx.stroke();
      };
      const letur = (st: number) => `700 ${st}px system-ui, "Segoe UI", sans-serif`;
      const texti = (s: string, x: number, y: number, st: number, jofnun: CanvasTextAlign) => { cx.font = letur(st); cx.textAlign = jofnun; cx.textBaseline = "middle"; cx.lineJoin = "round"; cx.lineWidth = st * 0.28; cx.strokeStyle = "rgba(255,255,255,.92)"; cx.strokeText(s, x, y); cx.fillStyle = "#111827"; cx.fillText(s, x, y); };
      /* Loftræsting: plús með stærðinni inni í (efri mörk stærðarflokksins, „Loft 125-160“ → 160: Ajour geymir flokkinn, ekki þvermálið) og dökk hök.
       * Rör (stál og plast): blómhringur með FJÖLDA stakra verka inni í og græn hök. Annað: útlína formsins. Sama og á Miro-borði Agnars. */
      /** Rautt ✕ þar sem seinna hakið ætti að vera: hinn endi lokunarinnar á enga skráningu innan 0,9 m. */
      const raudurKross = (x: number, y: number, kv = 1) => {
        const t = R * 0.5 * kv; cx.beginPath(); cx.moveTo(x - t, y - t); cx.lineTo(x + t, y + t); cx.moveTo(x + t, y - t); cx.lineTo(x - t, y + t);
        cx.lineCap = "round"; cx.lineWidth = R * 0.5 * kv; cx.strokeStyle = "#fff"; cx.stroke(); cx.lineWidth = R * 0.28 * kv; cx.strokeStyle = "#dc2626"; cx.stroke();
      };
      /** Gult „?“ þar sem seinna hakið ætti að vera: hinn endinn er skráður, en Ajour-staðir beggja eru sömu megin við brunavegginn. */
      const gultSpurn = (x: number, y: number) => {
        cx.font = `800 ${R * 1.25}px system-ui, "Segoe UI", sans-serif`; cx.textAlign = "center"; cx.textBaseline = "middle"; cx.lineJoin = "round";
        cx.lineWidth = R * 0.42; cx.strokeStyle = "#fff"; cx.strokeText("?", x, y); cx.fillStyle = "#d97706"; cx.fillText("?", x, y);
      };
      const merki = (x: number, y: number, t: Takn, nd: number, no: number, ve = 0, vs = 0, nh = 0, hs?: Hlidar) => {
        const loft = t.hopur === "Loft", ror = t.logun === "o" || t.logun === "t", n = nd + no;
        if (t.logun === "x") plus(cx, x, y, R); else if (ror) blom(cx, x, y, R * 0.92); else slod(cx, t.logun, x, y, R * 0.9);
        cx.fillStyle = "rgba(255,255,255,.4)"; cx.fill(); cx.lineJoin = "round"; cx.lineWidth = Math.max(1.4 / k, R * (ror ? 0.2 : 0.26)); cx.strokeStyle = nd ? t.litur : "#dc2626"; cx.stroke();
        if (no) { cx.beginPath(); cx.arc(x, y, R * 1.7, 0, 6.2832); cx.lineWidth = 1.6 / k; cx.strokeStyle = "#dc2626"; cx.stroke(); }
        if (Rs < 7) return;   // yfirlit: aðeins merkið sjálft
        const st = loft ? /-(\d+)\s*$/.exec(t.heiti) : null;
        if (Rs >= 11 && !synaAjour) { if (st) texti(st[1], x, y + R * 0.05, R * 0.72, "center"); else if (!loft && n >= 2) texti(String(n), x, y + R * 0.05, R * 0.95, "center"); }
        const hl = loft ? "#1f2937" : "#15803d";
        /* Sætin tvö fylgja veggnum (Agnar 14.11.2026: „check ✓ mætti alveg líka koma uppi og niðri þegar við á, í stað hægri vinstri“): liggi brunaveggurinn
         * við merkið lárétt eru hliðar hans ofan og neðan við, svo hökin fara þangað; annars til vinstri og hægri. Hökin eru utan við merkið svo talan sjáist. */
        const upp = !!vgT && veggurLarettur(vgT, x, y) === true;
        const ax = upp ? x : x - R * 1.5, ay = upp ? y - R * 1.5 : y - R * 0.1, bx = upp ? x : x + R * 1.5, by = upp ? y + R * 1.6 : y - R * 0.1;
        /* Hlið þekkt (skráning á nema): hakið fer ÞEIM megin við vegginn sem skráningin er — neongrænt ef henni var smellt þangað með hendi, annars dökkt
         * (hlið lesin úr Ajour-staðnum). Hitt sætið: hak ef hinn endinn er skráður, annars rautt ✕. */
        if (hs && (hs.nA > 0 || hs.nB > 0)) {
          const baedi = hs.nA > 0 && hs.nB > 0, annar = baedi || nh > 0 || nd - hs.nA - hs.nB > 0;
          if (hs.nA > 0) tikk(ax, ay, hs.fA ? NEON : hl); if (hs.nB > 0) tikk(bx, by, hs.fB ? NEON : hl);
          if (!baedi) { const ox = hs.nA > 0 ? bx : ax, oy = hs.nA > 0 ? by : ay; if (annar) { if (samaSia && vs > 0) gultSpurn(ox, oy + R * 0.05); else tikk(ox, oy, hl); } else if (ve > 0) raudurKross(ox, oy); }
          if (ve > 0 && annar) raudurKross(upp ? x + R * 0.95 : x + R * 2.2, upp ? y + R * 2.1 : y - R * 0.95, 0.62);
          if (loft && n >= 3) texti("×" + n, upp ? x + R * 1.15 : x + R * 0.55, upp ? y + R * 0.1 : y + R * 0.85, R * 0.7, "left");
          return;
        }
        if (nd >= 1) tikk(ax, ay, hl);
        /* Seinna sætið (Agnar 13.11.2026: „teikningin sýnir næstum alls staðar að bara sé búið öðrum megin“ á 6H S2 sem er búin): hak ef hinn endinn er
         * skráður og kláraður, líka þegar hann er teiknaður sem annað merki hinum megin við vegginn. Rautt ✕ aðeins ef ENGIN skráning merkisins á hinn
         * endann; í blönduðu merki (yfirlit) er hakið sýnt og lítið ✕ við hornið. Gult „?“ sést aðeins þegar sían „Sömu megin“ er á. */
        if (nh > 0) { if (samaSia && vs > 0) gultSpurn(bx, by + R * 0.05); else tikk(bx, by, hl); if (ve > 0) raudurKross(upp ? x + R * 0.95 : x + R * 2.2, upp ? y + R * 2.1 : y - R * 0.95, 0.62); }
        else if (ve > 0) raudurKross(bx, by); else if (nd >= 2) tikk(bx, by, hl);
        if (loft && n >= 3) texti("×" + n, upp ? x + R * 1.15 : x + R * 0.55, upp ? y + R * 0.1 : y + R * 0.85, R * 0.7, "left");
      };
      for (const h of hopar) merki(h.x, h.y, h.t, h.nd, h.no, h.ve, h.vs, h.nh, h.hs);
      for (const p of stakir) {
        const idr = dr?.p?.s.id === p.s.id, px = idr ? dr!.x : p.x, py = idr ? dr!.y : p.y, kl = p.s.stada === "done";
        if (p.faersla || idr) ajLina(p, px, py);   // valin eða dregin skráning: alltaf sýnt hvar hún er í Ajour
        const hs1: Hlidar = { nA: 0, nB: 0, fA: false, fB: false }; if (!idr) hlidar(p, hs1);
        merki(px, py, p.t, kl ? 1 : 0, kl ? 0 : 1, vantarEnda(p) ? 1 : 0, samaMegin(p) ? 1 : 0, hinnKlar(p) ? 1 : 0, hs1);
      }
    } else if (synaSkr) for (const umf of [1, 0]) for (const p of syndir) {
      const kl = p.s.stada === "done"; if ((kl ? 1 : 0) !== umf) continue;
      const r = p.t.r * zs, idr = dr?.p?.s.id === p.s.id, px = idr ? dr!.x : p.x, py = idr ? dr!.y : p.y;
      if ((faera || synaAjour || p.s.id === valinn?.p?.s.id) && (p.faersla || idr)) ajLina(p, px, py); else if (synaAjour) ajPt.push(p);
      slod(cx, p.t.logun, px, py, r);
      if (p.t.logun === "x") { cx.lineCap = "round"; cx.lineWidth = Math.max(1 / k, r * 0.5); cx.strokeStyle = kl ? p.t.litur : "#dc2626"; cx.stroke(); }
      else if (kl) { cx.fillStyle = p.t.litur + "d8"; cx.fill(); cx.lineWidth = 0.6 / k; cx.strokeStyle = "rgba(22,21,19,.45)"; cx.stroke(); }
      else { cx.fillStyle = "#ffffffe6"; cx.fill(); cx.lineWidth = 2 / k; cx.strokeStyle = "#dc2626"; cx.stroke(); }
      if (!kl) { cx.beginPath(); cx.arc(px, py, r + 3.5 * zs, 0, 6.2832); cx.lineWidth = 1.6 / k; cx.strokeStyle = "#dc2626"; cx.stroke(); }
      if (p.s.lagf) { cx.beginPath(); cx.arc(px, py, r + 2.2 * zs, 0, 6.2832); cx.lineWidth = 1.3 / k; cx.strokeStyle = p.s.lagf === "B" ? "#b45309" : p.s.lagf === "A" ? "#111827" : "#6b7280"; cx.setLineDash([3 / k, 2 / k]); cx.stroke(); cx.setLineDash([]); }
    }
    for (const p of ajPt) { cx.beginPath(); cx.arc(p.x0, p.y0, ajR, 0, 6.2832); cx.fillStyle = "#1d4ed8"; cx.fill(); cx.lineWidth = 1 / k; cx.strokeStyle = "#fff"; cx.stroke(); }
    if (synaAaetlud) for (const a of aaetludSynar) {
      const adr = dr?.a?.id === a.id, ax = adr ? dr!.x : +a.x_px, ay = adr ? dr!.y : +a.y_px;
      if (aaEftir(a) && erTillaga(a)) {   // tillaga: holur appelsínugulur hringur með spurningarmerki — ekki rauður punktur fyrr en staðfest
        const r = 6.4 * zb; cx.beginPath(); cx.arc(ax, ay, r, 0, 6.2832); cx.fillStyle = snerti ? "rgba(255,255,255,.6)" : "rgba(255,255,255,.9)"; cx.fill(); cx.lineWidth = 2.2 / k; cx.strokeStyle = "#ea580c"; cx.stroke();
        cx.font = `700 ${r * 1.45}px system-ui, sans-serif`; cx.textAlign = "center"; cx.textBaseline = "middle"; cx.fillStyle = "#c2410c"; cx.fillText("?", ax, ay + r * 0.08); continue;
      }
      if (aaEftir(a)) { slod(cx, "o", ax, ay, 5.6 * zb); cx.fillStyle = "#dc2626"; cx.fill(); cx.lineWidth = 1.6 / k; cx.strokeStyle = "#ffffff"; cx.stroke(); continue; }
      const r = 6.5 * zb; slod(cx, "d", ax, ay, r);
      cx.fillStyle = (PARAD[a.parad!.stada]?.[1] ?? "#ffffff") + "dd"; cx.fill(); cx.lineWidth = 2 / k; cx.strokeStyle = fagLitur(a.fag); cx.setLineDash([4 / k, 2.5 / k]); cx.stroke(); cx.setLineDash([]);
    }
    const vDreginn = !!dr && ((!!valinn?.p && dr.p?.s.id === valinn.p.s.id) || (!!valinn?.a && dr.a?.id === valinn.a.id));
    const v = vDreginn ? { x: dr!.x, y: dr!.y } : valinn?.p ? { x: valinn.p.x, y: valinn.p.y } : valinn?.a ? { x: +valinn.a.x_px, y: +valinn.a.y_px } : null;
    if (v) { cx.beginPath(); cx.arc(v.x, v.y, 11 * zs, 0, 6.2832); cx.lineWidth = 2.5 / k; cx.strokeStyle = faera && snerti ? "#1d4ed8" : "#111827"; cx.stroke(); }
    const ve = valinn?.p && !vDreginn && synaSkr ? endar.get(valinn.p.s.id) : undefined;
    const vnm = veggir && veggir.lykill === veggjaLykill ? veggir.nemar : null;
    if (ve && vnm && ve.nemi !== undefined) {   // neminn sem valda skráningin tengist: strik meðfram veggnum, jafnbreitt stokknum
      const i = ve.nemi, hb = vnm[i + 4] + 2, lit = ve.hlid === "hinum" ? "#15803d" : ve.hlid === "ovist" ? "#6b7280" : ve.hlid === "samaNemi" ? "#d97706" : "#dc2626";
      cx.beginPath(); cx.moveTo(vnm[i] - vnm[i + 2] * hb, vnm[i + 1] - vnm[i + 3] * hb); cx.lineTo(vnm[i] + vnm[i + 2] * hb, vnm[i + 1] + vnm[i + 3] * hb);
      cx.lineCap = "butt"; cx.lineWidth = 5.5 / k; cx.strokeStyle = "#fff"; cx.stroke(); cx.lineWidth = 3 / k; cx.strokeStyle = lit; cx.stroke();
    }
    if (ve && valinn?.p && ve.q && (ve.hlid === "sama" || ve.hlid === "samaNemi")) {   // óvissa/ranga tilvikið: sjá hvar pikkin tvö lentu miðað við rauða vegginn
      const a = valinn.p, b = ve.q, lit = "#d97706";
      cx.beginPath(); cx.moveTo(a.x0, a.y0); cx.lineTo(b.x0, b.y0); cx.lineCap = "round"; cx.lineWidth = 4 / k; cx.strokeStyle = "#fff"; cx.stroke(); cx.lineWidth = 2 / k; cx.strokeStyle = lit; cx.stroke();
      for (const [q, fyllt] of [[a, true], [b, false]] as const) { cx.beginPath(); cx.arc(q.x0, q.y0, 3.6 / k, 0, 6.2832); cx.fillStyle = fyllt ? lit : "#fff"; cx.fill(); cx.lineWidth = 1.6 / k; cx.strokeStyle = fyllt ? "#fff" : lit; cx.stroke(); }
    }
    // Stækkunargler: fingurinn hylur punktinn sem er dreginn, svo svæðið undir honum er sýnt stækkað í horni fjær fingrinum.
    if (dr?.hreyft && dr.snerting) {
      const R = 64 * dpr, Z = 2.2, sx = (dr.x * k + tx) * dpr, sy = (dr.y * k + ty) * dpr, sr = R / Z;
      const lx = sx < cnv.width / 2 ? cnv.width - R - 12 * dpr : R + 12 * dpr, ly = sy < cnv.height * 0.45 ? cnv.height - R - 76 * dpr : R + 66 * dpr;   // neðst: ofan við samanbrotið spjald valda punktsins
      cx.setTransform(1, 0, 0, 1, 0, 0); cx.save(); cx.beginPath(); cx.arc(lx, ly, R, 0, 6.2832); cx.clip();
      cx.fillStyle = "#fff"; cx.fillRect(lx - R, ly - R, 2 * R, 2 * R); cx.drawImage(cnv, sx - sr, sy - sr, 2 * sr, 2 * sr, lx - R, ly - R, 2 * R, 2 * R); cx.restore();
      cx.beginPath(); cx.arc(lx, ly, R, 0, 6.2832); cx.lineWidth = 3 * dpr; cx.strokeStyle = "#1d4ed8"; cx.stroke();
      cx.beginPath(); cx.moveTo(lx - R, ly); cx.lineTo(lx - 9 * dpr, ly); cx.moveTo(lx + 9 * dpr, ly); cx.lineTo(lx + R, ly); cx.moveTo(lx, ly - R); cx.lineTo(lx, ly - 9 * dpr); cx.moveTo(lx, ly + 9 * dpr); cx.lineTo(lx, ly + R); cx.lineWidth = 1 * dpr; cx.strokeStyle = "rgba(29,78,216,.55)"; cx.stroke();
    }
  }, [teikning, W, H, mynd, flis, logSynar, lagSest, syndir, aaetludSynar, synaSkr, synaAaetlud, valinn, faera, snerti, einDeild, vantarEnda, samaMegin, hinnKlar, samaSia, endar, veggir, veggjaLykill, synaAjour]);
  const bidjaUmTeikningu = useCallback(() => { cancelAnimationFrame(raf.current); raf.current = requestAnimationFrame(teikna); }, [teikna]);
  useEffect(() => { bidjaUmTeikningu(); }, [bidjaUmTeikningu, myndTeljari]);

  // passa má EKKI hanga á teiknifallinu: það breytist við hverja síu og hvert lag, og þá núllstilltist stækkunin (11.11.2026).
  const bidjaRef = useRef(bidjaUmTeikningu);
  useEffect(() => { bidjaRef.current = bidjaUmTeikningu; }, [bidjaUmTeikningu]);
  /** allt = allt blaðið í glugganum. Annars (snertiskjár á hæðina): blaðið fyllir hæðina og byrjar vestast, í stað mjórrar ræmu. */
  const passa = useCallback((allt = true) => {
    const kassi = kassiRef.current; if (!kassi) return;
    const cw = kassi.clientWidth, ch = kassi.clientHeight, k0 = Math.min(cw / W, ch / H), fylla = !allt && cw / ch < W / H, k = fylla ? ch / H : k0;
    sjon.current = { k, k0, tx: fylla ? 0 : (cw - W * k) / 2, ty: (ch - H * k) / 2 };
    bidjaRef.current();
  }, [W, H]);
  const fyrraBlad = useRef<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const f = fyrraBlad.current; fyrraBlad.current = { w: W, h: H };
    if (snertiRef.current && f && f.w === W && f.h === H) { bidjaRef.current(); return; }   // snertiskjár: jafnstór blöð (6H/5H/4H) halda sýninni milli hæða
    passa(!snertiRef.current);
  }, [passa, syn, W, H]);
  useEffect(() => { const f = () => { const kassi = kassiRef.current; if (kassi) sjon.current.k0 = Math.min(kassi.clientWidth / W, kassi.clientHeight / H); bidjaUmTeikningu(); }; window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, [W, H, bidjaUmTeikningu]);
  // striginn breytir um stærð þegar neðri stikan stækkar eða minnkar (setja-hamur): teikna aftur í réttri stærð
  useEffect(() => {
    const el = kassiRef.current; if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => { sjon.current.k0 = Math.min(el.clientWidth / W, el.clientHeight / H); bidjaRef.current(); });
    ro.observe(el); return () => ro.disconnect();
  }, [W, H, syn]);

  // ---------------------------------------------------------------- bendill: færa, stækka, velja, setja áætlað gat
  const bendlar = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ x: number; y: number; hreyft: number; klipa: number } | null>(null);
  /** Staða bendils í einingum strigans. Undir zoom eru gluggahnit (clientX, getBoundingClientRect) ekki í sömu einingum og clientWidth: hlutfallið leiðréttir það. */
  const stadur = (e: { clientX: number; clientY: number }) => { const el = kassiRef.current!, r = el.getBoundingClientRect(), f = r.width ? el.clientWidth / r.width : 1; return { x: (e.clientX - r.left) * f, y: (e.clientY - r.top) * f }; };
  const staekka = useCallback((sx: number, sy: number, f: number) => {
    const s = sjon.current, k = Math.max(s.k0 * 0.6, Math.min(s.k0 * 40, s.k * f));
    s.tx = sx - ((sx - s.tx) / s.k) * k; s.ty = sy - ((sy - s.ty) / s.k) * k; s.k = k; bidjaUmTeikningu();
  }, [bidjaUmTeikningu]);
  useEffect(() => {
    const el = kassiRef.current; if (!el) return;
    const hjol = (e: WheelEvent) => { e.preventDefault(); const p = stadur(e); staekka(p.x, p.y, Math.exp(-e.deltaY * 0.0015)); };
    el.addEventListener("wheel", hjol, { passive: false }); return () => el.removeEventListener("wheel", hjol);
  }, [staekka]);
  const nidur = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); const p = stadur(e); bendlar.current.set(e.pointerId, p);
    const b = [...bendlar.current.values()];
    drag.current = { x: p.x, y: p.y, hreyft: 0, klipa: b.length === 2 ? Math.hypot(b[0].x - b[1].x, b[0].y - b[1].y) : 0 };
    // færsluhamur: bendill niður á (eða við) sýndan punkt grípur hann; annars færist blaðið eins og venjulega
    if (skuffa) setSkuffa(false);
    if (b.length > 1) faerir.current = null;
    else if (faera && !baetaFag && teikning?.tegund === "yfirlit") {
      const s = sjon.current, wx = (p.x - s.tx) / s.k, wy = (p.y - s.ty) / s.k; let bd = 14 / s.k, bp: Punktur | undefined, ba: Aaetlad | undefined;
      if (e.pointerType === "touch") {
        // Snerting: aðeins VALDI punkturinn er dreginn (pikka fyrst, draga svo); annars færist blaðið. Fingur á þéttu korti gripi annars punkt af slysni.
        const vp = valinn?.p && synaSkr ? syndir.find((q) => q.s.id === valinn.p!.s.id) : undefined, va = valinn?.a && synaAaetlud ? aaetludSynar.find((a) => a.id === valinn.a!.id) : undefined;
        const vx = vp ? vp.x : va ? +va.x_px : NaN, vy = vp ? vp.y : va ? +va.y_px : NaN;
        if (Math.hypot(vx - wx, vy - wy) < 44 / s.k) { bp = vp; ba = vp ? undefined : va; }
      } else {
        if (synaSkr) for (const q of syndir) { const dd = Math.hypot(q.x - wx, q.y - wy); if (dd < bd) { bd = dd; bp = q; } }
        if (synaAaetlud) for (const a of aaetludSynar) { const dd = Math.hypot(+a.x_px - wx, +a.y_px - wy); if (dd < bd) { bd = dd; ba = a; bp = undefined; } }
      }
      const x0 = bp ? bp.x : ba ? +ba.x_px : 0, y0 = bp ? bp.y : ba ? +ba.y_px : 0;
      faerir.current = bp || ba ? { p: bp, a: ba, x: x0, y: y0, dx: x0 - wx, dy: y0 - wy, hreyft: false, snerting: e.pointerType === "touch" } : null;
    }
  };
  const hreyfa = (e: React.PointerEvent) => {
    if (!bendlar.current.has(e.pointerId) || !drag.current) return;
    const p = stadur(e), fyrri = bendlar.current.get(e.pointerId)!; bendlar.current.set(e.pointerId, p);
    const b = [...bendlar.current.values()];
    if (faerir.current && b.length === 1) {
      const s = sjon.current, f = faerir.current; f.x = (p.x - s.tx) / s.k + f.dx; f.y = (p.y - s.ty) / s.k + f.dy;
      const nmS = veggir && veggir.lykill === veggjaLykill ? veggir.nemar : null;
      if (f.p && nmS && f.p.t.hopur === NEMA_HOPUR) { const sm = smella(nmS, f.x, f.y); if (sm) { f.x = sm[0]; f.y = sm[1]; } }
      drag.current.hreyft += Math.abs(p.x - fyrri.x) + Math.abs(p.y - fyrri.y); if (drag.current.hreyft > 4) f.hreyft = true;
      bidjaUmTeikningu(); return;
    }
    if (b.length === 2) { faerir.current = null; const d = Math.hypot(b[0].x - b[1].x, b[0].y - b[1].y); if (drag.current.klipa) staekka((b[0].x + b[1].x) / 2, (b[0].y + b[1].y) / 2, d / drag.current.klipa); drag.current.klipa = d; drag.current.hreyft = 99; return; }
    sjon.current.tx += p.x - fyrri.x; sjon.current.ty += p.y - fyrri.y; drag.current.hreyft += Math.abs(p.x - fyrri.x) + Math.abs(p.y - fyrri.y); bidjaUmTeikningu();
  };
  const upp = async (e: React.PointerEvent) => {
    const var_ = bendlar.current.has(e.pointerId); bendlar.current.delete(e.pointerId);
    const d = drag.current; if (!bendlar.current.size) drag.current = null;
    const f = faerir.current;
    if (f && f.hreyft && var_) { await vistaFaerslu(f); if (faerir.current === f) faerir.current = null; bidjaUmTeikningu(); return; }
    faerir.current = null;
    if (!var_ || !d || d.hreyft > 6 || !teikning || !verk) return;
    const p = stadur(e), s = sjon.current, wx = (p.x - s.tx) / s.k, wy = (p.y - s.ty) / s.k;
    // Snertiskjár: punktur er settur í krosshárið með hnappi (setjaIKross), ekki með pikki; pikk velur punkt eins og venjulega.
    if (baetaFag && !snerti) { await setjaAaetlad(wx, wy); return; }
    const mork = (e.pointerType === "touch" ? 24 : 12) / s.k; let best: Punktur | null = null, bd = mork;
    if (synaSkr) for (const q of syndir) { const dd = Math.hypot(q.x - wx, q.y - wy); if (dd < bd) { bd = dd; best = q; } }
    let ba: Aaetlad | null = null; if (synaAaetlud) for (const a of aaetludSynar) { const dd = Math.hypot(+a.x_px - wx, +a.y_px - wy); if (dd < bd) { bd = dd; ba = a; } }
    /* Símasýn: spjaldið þekur allt að neðri helming kortsins. Lendi valdi punkturinn undir því er kortinu hliðrað upp svo hann (og línan milli
     * Ajour-staðanna) sjáist ofan við spjaldið. Ekki í færsluham: þar er spjaldið samanbrotið. */
    const lyfta = (y: number) => { const kassi = kassiRef.current; if (!snerti || faera || !kassi) return; const sy = y * s.k + s.ty; if (sy > kassi.clientHeight * 0.4) { s.ty -= sy - kassi.clientHeight * 0.25; bidjaUmTeikningu(); } };
    if (ba) { setValinn({ a: ba }); lyfta(+ba.y_px); return; }
    if (!best) { setValinn(null); return; }
    // símasýn: skráningar sem eru í sama merki og sú valda (sami hópur, innan merkisbreiddar) eru taldar upp í spjaldinu
    const b0 = best, dHja = (2.4 * merkisR(s.k, s.k0)) / s.k;
    const hja = snerti ? syndir.filter((q) => q !== b0 && q.t.hopur === b0.t.hopur && Math.hypot(q.x - b0.x, q.y - b0.y) < dHja).map((q) => q.s.ajour_serial ?? q.s.radnr).slice(0, 8) : [];
    setValinn({ p: best, nanar: null, hja }); lyfta(best.y);
    const [r, mr] = await Promise.all([sb().from("skr_skraningar").select("lysing,created_at,ajour_gogn").eq("id", best.s.id).single(), sb().from("skr_myndir").select("path").eq("skraning_id", best.s.id).order("rod")]);
    const slodir = ((mr.data || []) as { path: string }[]).map((x) => x.path);
    if (!r.error && r.data) { const g = (r.data.ajour_gogn || {}) as { myndir?: string[]; teikning?: string; lagf_dags?: string; a_stad?: number }; setValinn((v) => (v && v.p && v.p.s.id === best!.s.id ? { ...v, nanar: { lysing: r.data.lysing, created_at: r.data.created_at, myndir: (g.myndir || []).length, teikning: g.teikning || null, lagf_dags: g.lagf_dags || null, a_stad: g.a_stad ?? null, slodir } } : v)); }
  };

  /** Nýtt áætlað gat (rauður punktur: engin skráning parast við það) á hnitum blaðsins. Skrif aðeins við smell eða hnapp. */
  const setjaAaetlad = async (wx: number, wy: number) => {
    if (!verk || !teikning || !baetaFag || wx < 0 || wy < 0 || wx > W || wy > H) return;
    const r = await sb().from("skr_aaetlud").insert({ verk_id: verk.id, teikning_id: teikning.id, x_px: Math.round(wx * 10) / 10, y_px: Math.round(wy * 10) / 10, fag: baetaFag, flokkur_id: baetaFlokkur === "" ? null : baetaFlokkur, fjoldi: baetaFjoldi > 0 ? baetaFjoldi : 1, uppruni: "handvirkt" }).select(AA_SEL).single();
    if (r.error) { setVilla(r.error.message); return; }
    setAaetlud((a) => [...a, r.data as Aaetlad]);
    if (synV && !synV[2].includes(baetaFag)) setSynFag("");   // annars sæist nýi punkturinn ekki í flýtisýninni
    if (!synaAaetlud) setSynaAaetlud(true);
  };
  /** Snertiskjár: punkturinn fer í krosshárið á miðjum striganum. */
  const setjaIKross = () => { const kassi = kassiRef.current; if (!kassi) return; const s = sjon.current; void setjaAaetlad((kassi.clientWidth / 2 - s.tx) / s.k, (kassi.clientHeight / 2 - s.ty) / s.k); };
  /** Stækkar inn á deild: svæðið sem punktar hennar þekja (1.–99. hundraðshluti, svo stakur villtur punktur ráði ekki). */
  const faraADeild = (d: string) => {
    const kassi = kassiRef.current; if (!kassi) return;
    const xs: number[] = [], ys: number[] = [];
    for (const p of punktar) if (p.d === d) { xs.push(p.x); ys.push(p.y); }
    for (const a of aaetludBlads) if (deildAf(+a.x_px / W) === d) { xs.push(+a.x_px); ys.push(+a.y_px); }
    if (xs.length < 3) return;
    xs.sort((a, b) => a - b); ys.sort((a, b) => a - b);
    const q = (a: number[], f: number) => a[Math.round((a.length - 1) * f)], x0 = q(xs, 0.01) - 50, x1 = q(xs, 0.99) + 50, y0 = q(ys, 0.01) - 50, y1 = q(ys, 0.99) + 50;
    const cw = kassi.clientWidth, ch = kassi.clientHeight, s = sjon.current, k = Math.min(s.k0 * 40, cw / (x1 - x0), ch / (y1 - y0));
    sjon.current = { ...s, k, tx: cw / 2 - ((x0 + x1) / 2) * k, ty: ch / 2 - ((y0 + y1) / 2) * k }; bidjaUmTeikningu();
  };

  // ---------------------------------------------------------------- færðir punktar (skrif aðeins þegar punkti er sleppt)
  /** Vistar nýja stöðu: skráning → skr_faerslur (skráningin sjálf óbreytt); áætlað gat → hnitin í skr_aaetlud. */
  const vistaFaerslu = async (f: Faerir) => {
    if (!teikning || !verk) return;
    const x = Math.round(Math.max(0, Math.min(W, f.x)) * 10) / 10, y = Math.round(Math.max(0, Math.min(H, f.y)) * 10) / 10;
    if (f.a) {
      const a = f.a;
      setAaetlud((l) => l.map((q) => (q.id === a.id ? { ...q, x_px: x, y_px: y } : q))); setValinn((v) => (v?.a?.id === a.id ? { ...v, a: { ...v.a, x_px: x, y_px: y } } : v));
      const r = await sb().from("skr_aaetlud").update({ x_px: x, y_px: y }).eq("id", a.id); if (r.error) setVilla(r.error.message);
      return;
    }
    const p = f.p; if (!p) return;
    const r = p.faersla
      ? await sb().from("skr_faerslur").update({ x_px: x, y_px: y, uppruni: "handvirkt" }).eq("id", p.faersla.id).select(FA_SEL).single()
      : await sb().from("skr_faerslur").insert({ verk_id: verk.id, skraning_id: p.s.id, teikning_id: teikning.id, x_px: x, y_px: y, fra_x: Math.round(p.x0 * 10) / 10, fra_y: Math.round(p.y0 * 10) / 10, uppruni: "handvirkt" }).select(FA_SEL).single();
    if (r.error) { setVilla(r.error.message); return; }
    const ny = r.data as Faersla;
    setFaerslur((l) => [...l.filter((q) => q.id !== ny.id), ny]);
    setValinn((v) => (v?.p?.s.id === p.s.id ? { ...v, p: { ...v.p, x, y, faersla: ny, d: teikning.breidd_px ? deildAf(x / teikning.breidd_px) : v.p.d } } : v));
  };
  /** Setur punkt aftur á skráða stöðu (færslan er merkt eytt, aldrei hörð eyðing). */
  const afturkallaFaerslu = async (p: Punktur) => {
    const f = p.faersla; if (!f) return;
    const r = await sb().from("skr_faerslur").update({ eytt: true }).eq("id", f.id); if (r.error) { setVilla(r.error.message); return; }
    setFaerslur((l) => l.filter((q) => q.id !== f.id));
    setValinn((v) => (v?.p?.s.id === p.s.id ? { ...v, p: { ...v.p, x: p.x0, y: p.y0, faersla: undefined } } : v));
  };

  // ---------------------------------------------------------------- lög og áætluð göt (skrif aðeins við smell)
  const breytaAaetludu = async (a: Aaetlad, breyting: Partial<Pick<Aaetlad, "flokkur_id" | "fjoldi" | "athugasemd" | "fag" | "uppruni">>, vista = true) => {
    const nytt = { ...a, ...breyting };
    setAaetlud((x) => x.map((y) => (y.id === a.id ? nytt : y))); setValinn((v) => (v?.a?.id === a.id ? { ...v, a: nytt } : v));
    if (vista) { const r = await sb().from("skr_aaetlud").update(breyting).eq("id", a.id); if (r.error) setVilla(r.error.message); }
  };
  const fjarlaegjaAaetlad = async (a: Aaetlad) => { const r = await sb().from("skr_aaetlud").update({ eytt: true }).eq("id", a.id); if (r.error) { setVilla(r.error.message); return; } setAaetlud((x) => x.filter((y) => y.id !== a.id)); setValinn(null); };
  const breytaLagi = async (l: Lag, breyting: Partial<Lag>, vista = true) => {
    setLog((x) => x.map((y) => (y.id === l.id ? { ...y, ...breyting } : y)));
    if (vista) { const r = await sb().from("skr_log").update(breyting).eq("id", l.id); if (r.error) setVilla(r.error.message); }
  };
  const nyttLag = async (file: File, fag: string) => {
    if (!verk || !teikning) return;
    try {
      const bmp = await createImageBitmap(file), w = bmp.width, h = bmp.height; bmp.close();
      const sp = `verk/${verk.id}/lag-${Date.now()}-${file.name.replace(/[^A-Za-z0-9._-]+/g, "_")}`;
      await hladaUpp(sp, file, file.type || "image/png");
      const a = W / w;
      const r = await sb().from("skr_log").insert({ verk_id: verk.id, teikning_id: teikning.id, heiti: file.name.replace(/\.[^.]+$/, ""), fag, mynd_path: sp, breidd_px: w, haed_px: h, vorpun: { a, e: 0, f: 0 }, gegnsaei: 0.55, uppruni: "upphlaðið" }).select("id,teikning_id,heiti,fag,mynd_path,breidd_px,haed_px,vorpun,gegnsaei,synilegt,flisar").single();
      if (r.error) throw new Error(r.error.message);
      setLog((x) => [...x, r.data as Lag]);
    } catch (e) { setVilla(e instanceof Error ? e.message : String(e)); }
  };

  if (villa && !verk) return <div className="gk"><p className="skr-villa">{villa}</p></div>;
  if (!verk || !teikning) return <div className="gk"><p className="gk-hl">{hladid || "Sæki…"}</p></div>;

  const yfirlit = teikn.filter((t) => t.tegund === "yfirlit"), stakar = teikn.filter((t) => t.tegund !== "yfirlit");
  const fjoldiA = (id: number) => skr.reduce((n, s) => n + (s.teikning_id === id ? 1 : 0), 0);
  const kl = syndir.filter((p) => p.s.stada === "done").length;
  const nafn = (id: number | null) => { const m = menn.find((x) => x.id === id); return m ? (m.nafn || `Starfsmaður ${m.numer}`) : "—"; };
  const fl = (id: number | null) => flokkar.find((f) => f.id === id)?.heiti || "—";
  const flokkarFags = (fag: string) => { const r = FAG_FLOKKAR[fag]; const m = r ? flokkar.filter((f) => r.test(f.heiti)) : []; return (m.length ? m : flokkar).slice().sort((a, b) => a.heiti.localeCompare(b.heiti, "is")); };
  const LAGF: Record<string, string> = { A: "Lagfæring skráð sem nýtt verk", B: "Lagfæring aðeins sem athugasemd", "?": "Lagfæring, óflokkuð" };

  return (
    <div className={`gk${snerti ? " snerti" : ""}${mjor ? " mjor" : ""}${skuffa ? " skuffa" : ""}`}>
      <aside className="gk-hlid">
        <div className="gk-skuffuhaus"><b>Lög og síur</b><button type="button" onClick={() => setSkuffa(false)}>Loka</button></div>
        <div className="gk-haus"><h1>{verk.heiti}</h1><p>{num(skr.length)} skráningar{hladid ? ` · ${hladid}` : ""}{utanKorts ? ` · ${num(utanKorts)} án teikningar` : ""}</p></div>
        {villa && <p className="skr-villa">{villa} <button type="button" onClick={() => setVilla(null)}>×</button></p>}

        <section>
          <h2>Teikning</h2>
          <div className="gk-hnappar">{yfirlit.map((t) => <button key={t.id} type="button" className={syn === t.id ? "on" : ""} onClick={() => { setSyn(t.id); setValinn(null); }}>{t.haed || t.heiti}</button>)}</div>
          <select value={stakar.some((t) => t.id === syn) ? String(syn) : ""} onChange={(e) => { if (e.target.value) { setSyn(Number(e.target.value)); setValinn(null); } }} aria-label="Stök teikning">
            <option value="">Stök Ajour-teikning…</option>
            {stakar.map((t) => <option key={t.id} value={t.id}>{t.heiti} ({num(fjoldiA(t.id))}){t.yfirlit_id ? "" : " · ekki á yfirliti"}</option>)}
          </select>
          <p className="gk-smatt">{teikning.heiti}</p>
        </section>

        <section>
          <h2>Lög</h2>
          <label className="gk-rod">Sýn eftir fagi<select value={synFag} onChange={(e) => setSynFag(e.target.value)}><option value="">Allt, eins og lögin eru stillt</option>{SYNIR.map((x) => <option key={x[0]} value={x[0]}>{x[1]}</option>)}</select></label>
          <label className="gk-lag"><input type="checkbox" checked={synaSkr} onChange={(e) => setSynaSkr(e.target.checked)} /><span>Skráningar úr Ajour</span><small>{num(syndir.length)}</small></label>
          {teikning.tegund === "yfirlit" && <label className="gk-lag"><input type="checkbox" checked={synaAjour} onChange={(e) => setSynaAjour(e.target.checked)} /><span>Ajour-staðir: blár punktur þar sem pikkað var í Ajour, lína í merkið ef það var fært</span><small>{num(faerdir)} færð</small></label>}
          <label className="gk-lag"><input type="checkbox" checked={synaAaetlud} onChange={(e) => setSynaAaetlud(e.target.checked)} /><span>{snerti && !synaParud ? "Eftir: rauðir punktar" : "Áætluð göt"}</span><small>{num(aaetludSynar.length)}</small></label>
          {(tillogur > 0 || !synaTillogur) && <label className="gk-lag"><input type="checkbox" checked={synaTillogur} onChange={(e) => setSynaTillogur(e.target.checked)} /><span>Tillögur: lögn í brunavegg án skráningar</span><small>{num(tillogur)}</small></label>}
          {snerti && <label className="gk-lag"><input type="checkbox" checked={synaParud} onChange={(e) => setSynaParud(e.target.checked)} /><span>Sýna líka áætluð göt sem eiga skráningu</span></label>}
          {logSynar.map((l) => (
            <div key={l.id} className="gk-lag gk-lag-mynd">
              <label><input type="checkbox" checked={lagSest(l)} disabled={!!synV} onChange={(e) => (l.lan ? setLanSyn((x) => ({ ...x, [l.id]: e.target.checked })) : breytaLagi(l, { synilegt: e.target.checked }))} /><i style={{ background: fagLitur(l.fag) }} /><span title={l.heiti}>{fagHeiti(l.fag)} · {l.heiti}</span></label>
              <input type="range" min="0.1" max="1" step="0.05" value={l.gegnsaei} aria-label={`Gegnsæi ${l.heiti}`} onChange={(e) => breytaLagi(l, { gegnsaei: Number(e.target.value) }, false)} onPointerUp={(e) => breytaLagi(l, { gegnsaei: Number((e.target as HTMLInputElement).value) }, !l.lan)} />
              {!l.lan && <details><summary>Stilla af</summary>
                <div className="gk-vorpun">{(["a", "e", "f"] as const).map((kk) => <label key={kk}>{kk === "a" ? "Kvarði" : kk === "e" ? "x" : "y"}<input type="number" step={kk === "a" ? 0.001 : 1} value={(l.vorpun || { a: 1, e: 0, f: 0 })[kk]} onChange={(e) => breytaLagi(l, { vorpun: { ...(l.vorpun || { a: 1, e: 0, f: 0 }), [kk]: Number(e.target.value) } }, false)} onBlur={() => breytaLagi(l, { vorpun: l.vorpun })} /></label>)}</div>
              </details>}
            </div>
          ))}
          {logSynar.some((l) => l.lan) && <p className="gk-smatt">Lögin eru af {logSynar[0].lan}-blaðinu, sem er sama grunnmynd. Kveikt og slökkt gildir aðeins á þessum skjá.</p>}
          {synV && logSynar.length > 0 && <p className="gk-smatt">Sýnin „{synV[1]}“ ræður lögunum. Veldu „Allt“ til að stilla þau sjálfur.</p>}
          {!logSynar.length && <p className="gk-smatt">Engar fagteikningar á þessu blaði enn (loftræsting, sprinkler, vatnslagnir …).</p>}
          <LagUpp onVelja={nyttLag} />
        </section>

        <section>
          <h2>Áætluð göt</h2>
          <div className="gk-rod"><select value={baetaFag} onChange={(e) => { setBaetaFag(e.target.value); setBaetaFlokkur(""); }} aria-label="Fag áætlaðs gats"><option value="">Setja áætlað gat: slökkt</option>{FOG.filter((f) => f[0] !== "annad").map((f) => <option key={f[0]} value={f[0]}>Setja: {f[1]}</option>)}<option value="annad">Setja: Annað</option></select></div>
          {aaetludBlads.some((a) => a.parad) && (
            <div className="gk-takn">{(["allt", "fullt", "hluti", "vantar"] as const).map((st) => <button key={st} type="button" className={aaStada === st ? "" : "af-val"} aria-pressed={aaStada === st} onClick={() => setAaStada(st)}>{st !== "allt" && <i style={{ background: PARAD[st][1] }} />}{st === "allt" ? "Öll" : PARAD[st][0]} <small>{num(st === "allt" ? aaetludBlads.length : aaetludBlads.filter((a) => a.parad?.stada === st).length)}</small></button>)}</div>
          )}
          {baetaFag && (
            <div className="gk-rod gk-tvo">
              <label>Stærð / flokkur<select value={baetaFlokkur} onChange={(e) => setBaetaFlokkur(e.target.value === "" ? "" : Number(e.target.value))}><option value="">— óvalið —</option>{flokkarFags(baetaFag).map((f) => <option key={f.id} value={f.id}>{f.heiti}</option>)}</select></label>
              <label style={{ flex: "0 0 30%" }}>Stök verk<input type="number" min={1} step={1} value={baetaFjoldi} onChange={(e) => setBaetaFjoldi(Number(e.target.value))} /></label>
            </div>
          )}
          {baetaFag ? <p className="gk-smatt gk-virkt">{snerti ? "Færðu teikninguna þar til krossinn er þar sem lögnin fer gegnum brunavegg og ýttu á „Setja rauðan punkt“." : "Smelltu á teikninguna þar sem lögnin fer gegnum brunavegg."} Slökktu á hamnum þegar þú ert búinn.</p> : <p className="gk-smatt">{FOG.map((f) => [f, aaetludSynar.filter((a) => a.fag === f[0]).length] as const).filter((x) => x[1]).map(([f, n]) => `${f[1]} ${n}`).join(" · ") || "Engin áætluð göt skráð á þetta blað."}</p>}
        </section>

        <section>
          <h2>Síur</h2>
          <div className="gk-hnappar">{([["allt", "Allt"], ["done", "Tilbúin"], ["opid", "Í vinnslu"], ["eftir", "Eftir"]] as const).map((x) => <button key={x[0]} type="button" className={stada === x[0] ? "on" : ""} onClick={() => setStada(x[0])}>{x[0] === "eftir" && <i className="gk-raudur" />}{x[1]} <small>{num(stoduTal[x[0]])}</small></button>)}</div>
          {deildir.length > 1 && <div className="gk-hnappar">{deildir.map((d) => <button key={d} type="button" className={afDeild[d] ? "" : "on"} aria-pressed={!afDeild[d]} onClick={() => setAfDeild((x) => ({ ...x, [d]: !x[d] }))}>{d}</button>)}</div>}
          <div className="gk-takn">{taknTal.map(({ t, n }) => <button key={t.heiti} type="button" className={afTakn[t.heiti] ? "af" : ""} aria-pressed={!afTakn[t.heiti]} onClick={() => setAfTakn((x) => ({ ...x, [t.heiti]: !x[t.heiti] }))}><TaknSvg t={t} />{t.heiti} <small>{num(n)}</small></button>)}</div>
          <label className="gk-rod">Starfsmaður<select value={madur} onChange={(e) => setMadur(e.target.value)}><option value="">Allir</option>{menn.filter((m) => skr.some((s) => s.starfsmadur_id === m.id)).map((m) => <option key={m.id} value={m.id}>{m.nafn || `Starfsmaður ${m.numer}`}</option>)}</select></label>
          <div className="gk-rod gk-tvo"><label>Frá<select value={fra} onChange={(e) => setFra(e.target.value)}><option value="">—</option>{manudir.map((m) => <option key={m} value={m}>{m.slice(5)}.{m.slice(0, 4)}</option>)}</select></label><label>Til<select value={til} onChange={(e) => setTil(e.target.value)}><option value="">—</option>{manudir.map((m) => <option key={m} value={m}>{m.slice(5)}.{m.slice(0, 4)}</option>)}</select></label></div>
          <label className="gk-rod">Lagfæringar<select value={lagf} onChange={(e) => setLagf(e.target.value as typeof lagf)}><option value="allt">Sýna allt</option><option value="lagf">Aðeins lagfæringar</option><option value="A">Skráðar sem nýtt verk</option><option value="B">Aðeins athugasemd</option><option value="?">Óflokkaðar</option></select></label>
          <label className="gk-lag"><input type="checkbox" checked={tvitok} onChange={(e) => setTvitok(e.target.checked)} /><span>Aðeins skráningar á sömu hnitum og önnur</span></label>
          {teikning.tegund === "yfirlit" && <label className="gk-lag"><input type="checkbox" checked={anEnda} onChange={(e) => setAnEnda(e.target.checked)} /><span>Aðeins þar sem hinn endann vantar</span><small>{num(endaVantar)}</small></label>}
          {teikning.tegund === "yfirlit" && (samaTal > 0 || samaSia) && <label className="gk-lag"><input type="checkbox" checked={samaSia} onChange={(e) => setSamaSia(e.target.checked)} /><span>Aðeins þar sem hinn endinn er skráður sömu megin við brunavegg (gult „?“)</span><small>{num(samaTal)}</small></label>}
          {paradIds.size > 0 && <label className="gk-lag"><input type="checkbox" checked={oparad} onChange={(e) => setOparad(e.target.checked)} /><span>Aðeins skráningar sem parast ekki við áætlað gat</span></label>}
        </section>

        <section>
          <h2>Samantekt <small>{num(kl)} klárað · {num(syndir.length - kl)} opið</small></h2>
          <div className="gk-tafla"><table>
            <thead><tr><th>Deild</th>{HOPAR.map((h) => <th key={h}>{h}</th>)}<th>Σ</th></tr></thead>
            <tbody>
              {samantekt.map(([d, r]) => <tr key={d}><td><b>{d}</b></td>{HOPAR.map((h, i) => <td key={h}>{r.kl[i] ? num(r.kl[i]) : "·"}{r.op[i] ? <em> +{r.op[i]}</em> : null}</td>)}<td><b>{num(r.kl.reduce((a, b) => a + b, 0))}</b>{r.op.reduce((a, b) => a + b, 0) ? <em> +{r.op.reduce((a, b) => a + b, 0)}</em> : null}</td></tr>)}
              {!samantekt.length && <tr><td colSpan={HOPAR.length + 2}>Engar skráningar í síunni</td></tr>}
            </tbody>
          </table></div>
          <p className="gk-smatt">Klárað, og opið með + fyrir aftan. Fylgir síunum. Tölurnar eru stök verk eins og Ajour telur þau.</p>
        </section>
      </aside>

      <div className="gk-kort">
       <div className={`gk-svid${faera && !baetaFag ? " faera" : ""}`}>
        <div className={`gk-strigi${baetaFag ? " setja" : ""}${faera && !baetaFag ? " faera" : ""}`} ref={kassiRef} onPointerDown={nidur} onPointerMove={hreyfa} onPointerUp={upp} onPointerCancel={upp}>
          <canvas ref={cnvRef} />
        </div>
        {snerti && baetaFag && <div className="gk-kross" aria-hidden="true"><i /></div>}
        <div className="gk-stjorn">
          <button type="button" onClick={() => { const k = kassiRef.current!; staekka(k.clientWidth / 2, k.clientHeight / 2, 1.5); }} aria-label="Stækka">+</button>
          <button type="button" onClick={() => { const k = kassiRef.current!; staekka(k.clientWidth / 2, k.clientHeight / 2, 1 / 1.5); }} aria-label="Minnka">−</button>
          <button type="button" onClick={() => passa()}>Allt blaðið</button>
          <button type="button" className={`gk-fh${faera ? " on" : ""}`} aria-pressed={faera} disabled={teikning?.tegund !== "yfirlit"} title="Draga punkta á réttan stað á yfirlitsblaðinu" onClick={() => { setFaera((x) => !x); setBaetaFag(""); }}>Færa punkta{faerdir ? ` · ${num(faerdir)}` : ""}</button>
        </div>
        {faera && !baetaFag && !(snerti && valinn) && <p className="gk-faera">{snerti ? "Pikkaðu á punkt til að velja hann og dragðu hann svo á réttan stað. Staðan vistast þegar þú sleppir." : "Dragðu punkt á réttan stað; staðan vistast þegar þú sleppir. Bláa línan sýnir hvaðan hann kom."} Skráningin í Ajour breytist ekki.</p>}
        {valinn?.p && (
          <div className="gk-spjald">
            <button type="button" className="gk-x" onClick={() => setValinn(null)} aria-label="Loka">×</button>
            <h3>#{valinn.p.s.ajour_serial ?? valinn.p.s.radnr} <span className={valinn.p.s.stada === "done" ? "g" : "r"}>{valinn.p.s.stada === "done" ? "Klárað" : "Opið"}</span></h3>
            {valinn.nanar && valinn.nanar.slodir.length > 0 && (() => { const sl = valinn.nanar!.slodir, nr = valinn.p!.s.ajour_serial ?? valinn.p!.s.radnr; return (
              <div className="gk-myndir">{sl.slice(0, 6).map((m, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <button key={m} type="button" onClick={() => setLjos({ slodir: sl, i, nr })} aria-label={`Opna mynd ${i + 1} af ${sl.length}`}><img src={publicUrl(m)} alt="" loading="lazy" /></button>
              ))}{sl.length > 6 && <span>+{sl.length - 6}</span>}</div>
            ); })()}
            <dl>
              <dt>Flokkur</dt><dd>{fl(valinn.p.s.flokkur_id)}</dd>
              <dt>Deild</dt><dd>{valinn.p.d || "—"}</dd>
              <dt>Starfsmaður</dt><dd>{nafn(valinn.p.s.starfsmadur_id)}</dd>
              <dt>Framkvæmt</dt><dd>{dmy(valinn.p.s.framkvaemt_til) || "—"}</dd>
              {valinn.nanar && <><dt>Teikning</dt><dd>{valinn.nanar.teikning || "—"}</dd><dt>Myndir</dt><dd>{valinn.nanar.slodir.length || (valinn.nanar.myndir ? `${valinn.nanar.myndir} í Ajour (ekki sóttar enn)` : "engar")}</dd></>}
            </dl>
            {valinn.hja && valinn.hja.length > 0 && <p className="gk-merki gk-hja">Í sama merki: {valinn.hja.map((r) => "#" + r).join(", ")}</p>}
            {teikning.tegund === "yfirlit" && valinn.p.t.hopur !== "Gólf" && (() => {
              const e = endar.get(valinn.p!.s.id);
              if (!e) return <p className="gk-merki gk-endi">Hinn endinn: engin önnur skráning innan {(ENDI_PX / PX_M).toFixed(1).replace(".", ",")} m</p>;
              if (e.hlid === "einn") return <p className="gk-merki gk-endi">Hinn endinn: engin skráning hinum megin við brunavegginn á þessu gegnumtaki</p>;
              if (e.hlid === "samaNemi") return <p className="gk-merki gk-sama">Hinn endinn skráður: #{e.nr} á sama gegnumtaki. Ajour-staðsetning beggja er þó sömu megin við brunavegginn</p>;
              if (e.hlid === "hinum") return <p className="gk-merki gk-hinum">Hinn endinn: #{e.nr}, hinum megin við brunavegginn{e.vitt ? `, ${(e.d / PX_M).toFixed(1).replace(".", ",")} m frá` : e.nemi !== undefined ? " á sama gegnumtaki" : ""}</p>;
              if (e.hlid === "sama") return <p className="gk-merki gk-sama">Hinn endinn skráður: #{e.nr}. Ajour-staðsetning beggja er þó sömu megin við brunavegginn</p>;
              return <p className="gk-merki gk-hja">Hinn endinn: #{e.nr}, {(e.d / PX_M).toFixed(1).replace(".", ",")} m frá (hlið veggjar ekki metin)</p>;
            })()}
            {valinn.p.s.lagf && <p className="gk-merki">{LAGF[valinn.p.s.lagf]}{valinn.nanar?.lagf_dags ? ` · ${dmy(valinn.nanar.lagf_dags)}` : ""}{valinn.nanar?.a_stad ? ` · á stað #${valinn.nanar.a_stad}` : ""}</p>}
            {valinn.p.s.tvitak_af && <p className="gk-merki">Á nákvæmlega sömu hnitum og #{valinn.p.s.tvitak_af}</p>}
            {valinn.p.faersla && <p className="gk-merki gk-faerdur">Færður á kortinu ({valinn.p.faersla.uppruni === "sjalfvirkt" ? "sjálfvirkt" : "handvirkt"}), {(Math.hypot(valinn.p.x - valinn.p.x0, valinn.p.y - valinn.p.y0) / PX_M).toFixed(1).replace(".", ",")} m frá skráðri stöðu <button type="button" onClick={() => afturkallaFaerslu(valinn.p!)}>Upprunaleg staða</button></p>}
            {teikning.tegund === "yfirlit" && !valinn.p.faersla && <p className="gk-merki gk-hja">Á sama stað og í Ajour (ekki færð á kortinu)</p>}
            {valinn.nanar === null ? <p className="gk-smatt">Sæki lýsingu…</p> : valinn.nanar?.lysing ? <p className="gk-lysing">{valinn.nanar.lysing}</p> : null}
          </div>
        )}
        {valinn?.a && (
          <div className="gk-spjald">
            <button type="button" className="gk-x" onClick={() => setValinn(null)} aria-label="Loka">×</button>
            <h3>{erTillaga(valinn.a) ? "Tillaga" : "Áætlað gat"} <span style={{ color: fagLitur(valinn.a.fag) }}>{fagHeiti(valinn.a.fag)}</span></h3>
            {erTillaga(valinn.a) && (
              <div className="gk-tillaga">
                <p>Hér fer lögn gegnum brunavegg á teikningunni, en engin skráning er nálægt. Tillagan telst ekki í stöðuskýrslunni fyrr en þú staðfestir hana.</p>
                <div><button type="button" className="ja" onClick={() => breytaAaetludu(valinn.a!, { uppruni: "handvirkt" })}>Já, eftir að þétta</button><button type="button" onClick={() => fjarlaegjaAaetlad(valinn.a!)}>Nei, ekki gat</button></div>
              </div>
            )}
            <div className="gk-rod gk-tvo">
              <label>Stærð / flokkur<select value={valinn.a.flokkur_id ?? ""} onChange={(e) => breytaAaetludu(valinn.a!, { flokkur_id: e.target.value === "" ? null : Number(e.target.value) })}><option value="">— óvalið —</option>{(valinn.a.flokkur_id && !flokkarFags(valinn.a.fag).some((f) => f.id === valinn.a!.flokkur_id) ? [...flokkarFags(valinn.a.fag), ...flokkar.filter((f) => f.id === valinn.a!.flokkur_id)] : flokkarFags(valinn.a.fag)).map((f) => <option key={f.id} value={f.id}>{f.heiti}</option>)}</select></label>
              <label style={{ flex: "0 0 30%" }}>Stök verk<input type="number" min={1} step={1} value={valinn.a.fjoldi} onChange={(e) => breytaAaetludu(valinn.a!, { fjoldi: Math.max(1, Number(e.target.value) || 1) })} /></label>
            </div>
            {valinn.a.parad && <p className="gk-merki" style={{ background: PARAD[valinn.a.parad.stada]?.[1] + "66", color: "#1f2937" }}>{PARAD[valinn.a.parad.stada]?.[0]}: {valinn.a.parad.n} af {valinn.a.fjoldi} stökum verkum skráð{valinn.a.parad.radnr.length ? ` — ${valinn.a.parad.radnr.map((r) => "#" + r).join(", ")}` : ""}</p>}
            <label className="gk-rod">Athugasemd<textarea rows={3} value={valinn.a.athugasemd ?? ""} onChange={(e) => breytaAaetludu(valinn.a!, { athugasemd: e.target.value }, false)} onBlur={(e) => breytaAaetludu(valinn.a!, { athugasemd: e.target.value || null })} /></label>
            {!erTillaga(valinn.a) && <button type="button" onClick={() => fjarlaegjaAaetlad(valinn.a!)}>Fjarlægja</button>}
          </div>
        )}
       </div>
        {/* Neðri stika: aðeins á snertiskjá eða mjóum glugga (.gk.snerti). Stórir hnappar í þumalfæri; allt annað er í skúffunni „Lög og síur“. */}
        <div className="gk-bar">
          {baetaFag && (
            <div className="gk-bar-setja">
              <div className="gk-bar-rod">
                <select value={baetaFag} onChange={(e) => { setBaetaFag(e.target.value); setBaetaFlokkur(""); setBaetaFjoldi(e.target.value === "golf" ? 1 : 2); }} aria-label="Fag punktsins">{FOG.map((f) => <option key={f[0]} value={f[0]}>{f[1]}</option>)}</select>
                <select value={baetaFlokkur} onChange={(e) => setBaetaFlokkur(e.target.value === "" ? "" : Number(e.target.value))} aria-label="Stærð eða flokkur"><option value="">Stærð óvalin</option>{flokkarFags(baetaFag).map((f) => <option key={f.id} value={f.id}>{f.heiti}</option>)}</select>
                <label className="gk-bar-fj">Stök verk<input type="number" inputMode="numeric" min={1} step={1} value={baetaFjoldi} onChange={(e) => setBaetaFjoldi(Number(e.target.value))} /></label>
              </div>
              <div className="gk-bar-rod">
                <button type="button" className="gk-bar-adal" onClick={setjaIKross}>Setja rauðan punkt í krossinn</button>
                <button type="button" onClick={() => setBaetaFag("")}>Hætta</button>
              </div>
              <p>Færðu teikninguna þar til krossinn er á staðnum. Rauður punktur telst sem „Eftir“ í stöðuskýrslunni.</p>
            </div>
          )}
          <p className="gk-bar-skyring">
            <span><svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true"><path d="M2.5 7.5L5.8 11L11.8 3.5" fill="none" stroke="#1f2937" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>Klárað stakt verk</span>
            <span><i className="op" />Opið</span>
            <span><i className="ef" />Eftir, óskráð</span>
            {(endaVantar > 0 || anEnda) && <button type="button" className={anEnda ? "on" : ""} aria-pressed={anEnda} onClick={() => setAnEnda((x) => !x)}><svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true"><path d="M3 3L11 11M11 3L3 11" stroke="#dc2626" strokeWidth="2.6" strokeLinecap="round" fill="none" /></svg>Hinn endann vantar ({num(endaVantar)})</button>}
            {(samaTal > 0 || samaSia) && <button type="button" className={`sama${samaSia ? " on" : ""}`} aria-pressed={samaSia} onClick={() => setSamaSia((x) => !x)}><b aria-hidden="true">?</b>Sömu megin ({num(samaTal)})</button>}
            {teikning.tegund === "yfirlit" && <button type="button" className={`ajour${synaAjour ? " on" : ""}`} aria-pressed={synaAjour} onClick={() => setSynaAjour((x) => !x)}><i aria-hidden="true" />Ajour-staðir</button>}
            {synaTillogur && tillogur > 0 && <span><i className="ti">?</i>Tillaga ({num(tillogur)})</span>}
            {taknTal.slice(0, 5).map(({ t }) => <span key={t.heiti}><MerkiSvg t={t} />{t.heiti}</span>)}
          </p>
          <div className="gk-bar-rod">
            <div className="gk-bar-hopur" role="group" aria-label="Hæð">{yfirlit.map((t) => <button key={t.id} type="button" className={syn === t.id ? "on" : ""} aria-pressed={syn === t.id} onClick={() => { setSyn(t.id); setValinn(null); }}>{t.haed || t.heiti}</button>)}</div>
            {teikning.tegund === "yfirlit" && <div className="gk-bar-hopur" role="group" aria-label="Fara á deild">{["S1", "S2", "S4", "S5"].map((d) => <button key={d} type="button" className={virkDeild === d ? "on" : ""} aria-pressed={virkDeild === d} onClick={() => { if (virkDeild === d) { setVirkDeild(""); return; } setVirkDeild(d); setValinn(null); faraADeild(d); }} aria-label={`Fara á deild ${d}`}>{d}</button>)}</div>}
          </div>
          <div className="gk-bar-rod">
            <select className={synFag ? "on" : ""} value={synFag} onChange={(e) => setSynFag(e.target.value)} aria-label="Sýn eftir fagi"><option value="">Sýn: allt</option>{SYNIR.map((x) => <option key={x[0]} value={x[0]}>{x[1]}</option>)}</select>
            <button type="button" className={faera && !baetaFag ? "on" : ""} aria-pressed={faera && !baetaFag} disabled={teikning.tegund !== "yfirlit"} onClick={() => {
              // færsluhamur sýnir eina deild: sé engin valin er það deildin á miðjum skjánum
              if (!(faera && !baetaFag) && !virkDeild && kassiRef.current && teikning.breidd_px) { const s = sjon.current; setVirkDeild(deildAf(Math.max(0, Math.min(0.999, (kassiRef.current.clientWidth / 2 - s.tx) / s.k / teikning.breidd_px)))); }
              setFaera((x) => !x || !!baetaFag); setBaetaFag("");
            }}>Færa</button>
            <button type="button" className={baetaFag ? "on raud" : ""} aria-pressed={!!baetaFag} onClick={() => { if (baetaFag) { setBaetaFag(""); return; } const f = synV ? synV[2][0] : "loftraesting"; setBaetaFag(f); setBaetaFlokkur(""); setBaetaFjoldi(f === "golf" ? 1 : 2); setFaera(false); setValinn(null); }}>＋ Punktur</button>
            <button type="button" className={skuffa ? "on" : ""} aria-expanded={skuffa} onClick={() => setSkuffa((x) => !x)}>Lög og síur</button>
          </div>
        </div>
      </div>
      {ljos && (
        <div className="gk-ljos" role="dialog" aria-modal="true" aria-label="Ljósmynd skráningar" onClick={() => setLjos(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={publicUrl(ljos.slodir[ljos.i])} alt={`Ljósmynd ${ljos.i + 1} af ${ljos.slodir.length}`} onClick={(e) => e.stopPropagation()} />
          <div className="gk-ljos-stika" onClick={(e) => e.stopPropagation()}>
            {ljos.slodir.length > 1 && <button type="button" aria-label="Fyrri mynd" onClick={() => setLjos({ ...ljos, i: (ljos.i + ljos.slodir.length - 1) % ljos.slodir.length })}>‹</button>}
            <span>#{ljos.nr} · mynd {ljos.i + 1} af {ljos.slodir.length}</span>
            {ljos.slodir.length > 1 && <button type="button" aria-label="Næsta mynd" onClick={() => setLjos({ ...ljos, i: (ljos.i + 1) % ljos.slodir.length })}>›</button>}
            <button type="button" className="l" onClick={() => setLjos(null)}>Loka</button>
          </div>
        </div>
      )}
    </div>
  );
}

function LagUpp({ onVelja }: { onVelja: (f: File, fag: string) => void }) {
  const [fag, setFag] = useState("loftraesting");
  return (
    <div className="gk-rod gk-upp">
      <select value={fag} onChange={(e) => setFag(e.target.value)} aria-label="Fag nýs lags">{FOG.filter((f) => f[0] !== "golf").map((f) => <option key={f[0]} value={f[0]}>{f[1]}</option>)}</select>
      <label className="gk-skra">＋ Bæta við lagi (mynd)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => { const f = e.target.files?.[0]; if (f) onVelja(f, fag); e.target.value = ""; }} /></label>
    </div>
  );
}
