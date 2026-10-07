/** „SLT / BRSL af teikningu" (Slökkvitæki-hamur) — hreinar aðgerðir, prófanlegar.
 *
 * Agnar 07.10.2026 (Álfaborg 661, 1. hæð, skönnuð FotoWeb-PDF): „slt/brsl lesturinn er ekki að lesa það heldur ei-60
 * sýnist mér". Orsakirnar (mældar á teikningunni, tools/turbopaint-slt-brsl.cjs):
 *   1. takkinn keyrði EI-greininguna líka (sama fall) — þaðan kom EI-60-miðinn;
 *   2. OCR-orðin eru í DÍLUM MYNDARINNAR (7478 × 5349) en voru sett á borðið eins og þau væru borðeiningar (2379 × 1702)
 *      — 3,14× of langt frá horni myndarinnar, flest utan blaðsins (þekjuhringirnir „hægra megin ofan við", „neðan við");
 *   3. „titilreitur" var reiknaður með borðstærð á móti myndardílum — orð hægra megin við x ≈ 2000 dílar hurfu;
 *   4. tækin urðu 165.BR1-hönnunartákn án tengingar — þau vistuðust aldrei í úttekt.
 *
 * Nú: hvert BRSL/SLT á teikningunni → staður. Við BRSL er TÁKNIÐ (hringur/spírall slöngukeflisins) fundið í
 * blekgrímu OCR-myndarinnar og tækið sett á það, ekki á textann; SLT við sama tákn fer við hliðina. SLT án tákns stendur
 * þar sem textinn er. Svo tengist hver staður ÓSTAÐSETTU tæki staðarins af réttri tegund (sjalftenging.ts); þegar
 * þau duga ekki kemur ótengt tákn („ótengt" → „Nýtt" við vistun). */

import type { OcrWord } from "./firewall-rating";
import { erTengtTaekiTakn, SLT_TEGUNDIR, tegundABordi, TaekjaSjodur, type TaekjaTegund } from "./sjalftenging";
import type { BoardObject, SymbolObject } from "./types";

export type SbTegund = "brsl" | "slt";

/** Blekgríma OCR-myndarinnar (sjá detect-firewalls.ts lesaTextaTeikningar): 1 = blek. kvardi = OCR-dílar á myndardíl. */
export type Blek = { w: number; h: number; kvardi: number; data: Uint8Array };

/* ── Orðin ─────────────────────────────────────────────────────────────────────────────────────────────────────── */

const SKIL = /[|/+,;·]+/;

function hreint(t: string) {
  return t.toUpperCase().replace(/[ÚÜ]/g, "U").replace(/[^A-Z0-9$]/g, "");
}

/** Hvað orðið segir: BRSL og/eða SLT. `sterkt` = nákvæmlega rétt stafsett (BRSL / SLT); annars algengar OCR-villur
 * (8RSL, BR5L, BRS, SL1, 5LT, SLI …) sem þurfa meiri vissu. „BRSL | SLT" / „BRSL/SLT" / „BRSLSLT" gefa bæði. */
export function ordTegundir(texti: string): { tegund: SbTegund; sterkt: boolean }[] {
  const ut: { tegund: SbTegund; sterkt: boolean }[] = [];
  const baeta = (tegund: SbTegund, sterkt: boolean) => {
    const f = ut.find((x) => x.tegund === tegund);
    if (f) f.sterkt = f.sterkt || sterkt;
    else ut.push({ tegund, sterkt });
  };
  for (const hluti of String(texti || "").split(SKIL)) {
    const c = hreint(hluti);
    if (!c) continue;
    if (/^BRSL\d{0,2}$/.test(c)) baeta("brsl", true);
    else if (/^SLT\d{0,2}$/.test(c)) baeta("slt", true);
    else if (/^BRSLSLT$/.test(c)) {
      baeta("brsl", true);
      baeta("slt", true);
    } else if (/^[B8]R[S5$]([L1I]|LL)?$/.test(c)) baeta("brsl", false);
    else if (/^[S5$][L1I][T7I1]$/.test(c)) baeta("slt", false);
    else if (/^[B8]R[S5$][L1I]?[S5$][L1I][T7I1]$/.test(c)) {
      baeta("brsl", false);
      baeta("slt", false);
    }
  }
  return ut;
}

/** Lágmarksvissa OCR: rétt stafsett orð eru sjaldan tilviljun (Álfaborg: „BRSL" 29 % og 43 % voru raunveruleg); OCR-
 * villur þurfa ≥ 50 % eins og áður. */
export const VISSA_STERKT = 20;
export const VISSA_VEIKT = 50;

export interface SbOrd {
  tegund: SbTegund;
  /** Miðja orðsins (myndardílar). */
  x: number;
  y: number;
  /** Hæð stafanna (myndardílar) — mælikvarði leitarinnar að tákninu. */
  h: number;
  vissa: number;
  texti: string;
}

export type Svaedi = { x0: number; y0: number; x1: number; y1: number };

/** BRSL/SLT-orð teikningarinnar, innan `svaedi` (hússins á blaðinu, myndardílar) ef það er gefið, annars utan
 * titilreitsins (neðst til hægri á blaðinu). Tvítekin orð (sami staður, sama tegund) talin einu sinni. */
export function sltBrslOrd(words: OcrWord[], mynd: { b: number; h: number }, svaedi?: Svaedi | null): SbOrd[] {
  const ut: SbOrd[] = [];
  for (const w of words) {
    if (w.vertical) continue;
    const x = w.x + w.width / 2, y = w.y + w.height / 2;
    if (svaedi) {
      if (x < svaedi.x0 || y < svaedi.y0 || x > svaedi.x1 || y > svaedi.y1) continue;
    } else if (x > mynd.b * 0.84 && y > mynd.h * 0.42) continue;
    for (const { tegund, sterkt } of ordTegundir(w.text)) {
      if (w.confidence < (sterkt ? VISSA_STERKT : VISSA_VEIKT)) continue;
      // „BRSL SLT" í einu orði: hvor hluti fær sinn helming svo staðirnir verði réttir
      const tvi = ordTegundir(w.text).length === 2;
      const hx = tvi ? (tegund === "brsl" ? w.x + w.width * 0.3 : w.x + w.width * 0.8) : x;
      // stafahæð: OCR-kassi orðs með litla vissu er oft of hár (Álfaborg: „BRSL" 29 % = 63 × 45) — breiddin ræður þá
      const stafir = Math.max(2, hreint(w.text).length);
      ut.push({ tegund, x: hx, y, h: Math.max(4, Math.min(w.height, w.width / (0.8 * stafir))), vissa: w.confidence, texti: w.text });
    }
  }
  const rodud = ut.sort((a, b) => b.vissa - a.vissa);
  const haldid: SbOrd[] = [];
  for (const o of rodud) {
    if (haldid.some((k) => k.tegund === o.tegund && Math.hypot(k.x - o.x, k.y - o.y) < Math.max(k.h, o.h) * 1.5)) continue;
    haldid.push(o);
  }
  return haldid.sort((a, b) => a.y - b.y || a.x - b.x);
}

/* ── Táknið: hringur / spírall slöngukeflisins ──────────────────────────────────────────────────────────────────── */

export interface Hringur {
  /** Miðja táknsins (myndardílar). */
  x: number;
  y: number;
  /** Hálf breidd táknsins (myndardílar). */
  r: number;
  /** Hlutfall stefna frá miðjunni sem rekast á táknið (0–1) — lokað form ≈ 1. */
  lokun: number;
}

/** Leitar að tákni slöngukeflis (hringur / spírall, oft með ör) nálægt orði — miðja (cx, cy) og stafahæð h í
 * myndardílum. Í blekgrímu OCR-myndarinnar:
 *   1. beinar línur (veggir, ásalínur, málsetning: lárétt/lóðrétt blek lengra en 3,2 stafahæðir) teknar burt, svo
 *      táknið losni frá veggnum sem það snertir;
 *   2. smá þensla (3×3) lokar götum skönnunarinnar; samfelldir þættir (8-nágrannar);
 *   3. þáttur er tákn ef hann er 2,2–8 stafahæðir á kant, nokkurn veginn ferningslaga (≤ 1,6), gisinn (≤ 30 % blek),
 *      lokaður (≥ 75 % stefna frá miðju rekast á hann), kringlóttur (ysta blek í hverri stefnu víkur ≤ 30 % frá
 *      meðaltalinu — spírall 12–20 %, hrúga af línum/texta 40–70 %), ekki kassi/rammi (engin bein lína > 60 % af breiddinni) og ekki
 *      gegnheill (súla, fylltur veggur);
 *   4. miðja hans innan 7,5 stafahæða frá orðinu.
 * Skilar tákninu næst orðinu sem stenst (Álfaborg: stafir 20 dílar, keflið ~80 dílar + ör), eða null. */
export function finnaHring(blek: Blek, cx: number, cy: number, h: number, skra?: (lina: string) => void): Hringur | null {
  const k = blek.kvardi;
  const hk = Math.max(3, h * k);
  const leit = 7.5 * hk, minD = 2.2 * hk, maxD = 8 * hk, L = 3.2 * hk;
  const ocx = cx * k, ocy = cy * k;
  const sp = leit + maxD / 2 + 4;
  const x0 = Math.max(0, Math.floor(ocx - sp)), y0 = Math.max(0, Math.floor(ocy - sp));
  const x1 = Math.min(blek.w - 1, Math.ceil(ocx + sp)), y1 = Math.min(blek.h - 1, Math.ceil(ocy + sp));
  const W = x1 - x0 + 1, H = y1 - y0 + 1;
  if (W < 8 || H < 8) return null;
  const g = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    const row = (y + y0) * blek.w + x0;
    for (let x = 0; x < W; x++) if (blek.data[row + x]) g[y * W + x] = 1;
  }
  // 1. beinar línur burt
  const lina = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      if (!g[y * W + x]) { x++; continue; }
      let e = x;
      while (e < W && g[y * W + e]) e++;
      if (e - x > L) for (let i = x; i < e; i++) lina[y * W + i] = 1;
      x = e;
    }
  }
  for (let x = 0; x < W; x++) {
    let y = 0;
    while (y < H) {
      if (!g[y * W + x]) { y++; continue; }
      let e = y;
      while (e < H && g[e * W + x]) e++;
      if (e - y > L) for (let i = y; i < e; i++) lina[i * W + x] = 1;
      y = e;
    }
  }
  // 2. þensla + þættir
  const m = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!g[i] || lina[i]) continue;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx >= 0 && xx < W) m[yy * W + xx] = 1;
        }
      }
    }
  }
  const lab = new Int32Array(W * H);
  const stafli: number[] = [];
  let id = 0;
  let besti: (Hringur & { n: number }) | null = null;
  for (let s = 0; s < W * H; s++) {
    if (!m[s] || lab[s]) continue;
    id++;
    lab[s] = id;
    stafli.push(s);
    const px: number[] = [];
    let mnx = W, mny = H, mxx = 0, mxy = 0;
    while (stafli.length) {
      const j = stafli.pop()!;
      px.push(j);
      const x = j % W, y = (j / W) | 0;
      if (x < mnx) mnx = x;
      if (x > mxx) mxx = x;
      if (y < mny) mny = y;
      if (y > mxy) mxy = y;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= W) continue;
          const q = yy * W + xx;
          if (m[q] && !lab[q]) {
            lab[q] = id;
            stafli.push(q);
          }
        }
      }
    }
    const bw = mxx - mnx + 1, bh = mxy - mny + 1;
    const hvar = () => `${Math.round((mnx + mxx) / 2 / k + x0 / k)},${Math.round((mny + mxy) / 2 / k + y0 / k)} ${Math.round(bw / k)}×${Math.round(bh / k)}`;
    if (skra && px.length > 40 && Math.max(bw, bh) >= minD) skra(`þáttur ${hvar()} n${px.length}`);
    if (Math.min(bw, bh) < minD || Math.max(bw, bh) > maxD) continue;
    if (Math.max(bw, bh) / Math.min(bw, bh) > 1.6) continue;
    if (px.length / (bw * bh) > 0.3) continue;
    const mx = (mnx + mxx) / 2, my = (mny + mxy) / 2;
    if (Math.hypot(mx + x0 - ocx, my + y0 - ocy) > leit) continue;
    // 3. lokað form: stefnur frá miðjunni sem rekast á þáttinn
    // og hve kringlótt: ysta blek þáttarins í hverri stefnu (spírall ≈ 0,65–1 R; hrúga af línum og texta óregluleg)
    let lok = 0;
    const NA = 32, R = Math.max(bw, bh) * 0.75;
    const ytri: number[] = [];
    for (let a = 0; a < NA; a++) {
      const c = Math.cos((2 * Math.PI * a) / NA), sn = Math.sin((2 * Math.PI * a) / NA);
      let fyrst = 0, sidast = 0;
      for (let r = 1; r <= R; r++) {
        const xx = Math.round(mx + r * c), yy = Math.round(my + r * sn);
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) break;
        if (lab[yy * W + xx] === id) {
          if (!fyrst) fyrst = r;
          sidast = r;
        }
      }
      if (fyrst) lok++;
      ytri.push(sidast);
    }
    const medal = ytri.reduce((s, v) => s + v, 0) / NA;
    const frav = Math.sqrt(ytri.reduce((s, v) => s + (v - medal) ** 2, 0) / NA) / (medal || 1);
    if (lok / NA < 0.75) { skra?.(`  opinn ${hvar()} ${lok}/${NA}`); continue; }
    if (frav > 0.3) { skra?.(`  ekki kringlótt ${hvar()} frávik ${frav.toFixed(2)}`); continue; }
    // ekki kassi/rammi: lengsta beina blekið (hrá gríma, innan þáttarins) stutt miðað við breiddina; ekki gegnheilt
    let lengst = 0, gegnheilt = 0;
    for (const j of px) {
      if (!g[j]) continue;
      const x = j % W, y = (j / W) | 0;
      if (x === 0 || !g[j - 1] || lab[j - 1] !== id) {
        let e = x;
        while (e < W && g[y * W + e] && lab[y * W + e] === id) e++;
        lengst = Math.max(lengst, e - x);
      }
      if (y === 0 || !g[j - W] || lab[j - W] !== id) {
        let e = y;
        while (e < H && g[e * W + x] && lab[e * W + x] === id) e++;
        lengst = Math.max(lengst, e - y);
      }
      if (x >= 2 && y >= 2 && x < W - 2 && y < H - 2) {
        let full = true;
        for (let dy = -2; dy <= 2 && full; dy++) for (let dx = -2; dx <= 2; dx++) if (!g[j + dy * W + dx]) { full = false; break; }
        if (full) gegnheilt++;
      }
    }
    if (lengst > 0.6 * Math.max(bw, bh)) { skra?.(`  bein lína ${hvar()} ${lengst}`); continue; }
    if (gegnheilt > 60 + 0.02 * bw * bh) { skra?.(`  gegnheilt ${hvar()} ${gegnheilt}`); continue; }
    skra?.(`  TÁKN ${hvar()} lokun ${lok}/${NA} frávik ${frav.toFixed(2)} fjarl ${(Math.hypot(mx + x0 - ocx, my + y0 - ocy) / hk).toFixed(1)}h`);
    const fjarl = Math.hypot(mx + x0 - ocx, my + y0 - ocy);
    if (!besti || fjarl < besti.n) {
      besti = { x: (mx + x0) / k, y: (my + y0) / k, r: (bw + bh) / 4 / k, lokun: Math.round((lok / NA) * 100) / 100, n: fjarl };
    }
  }
  if (!besti) return null;
  const { n: _n, ...ut } = besti;
  void _n;
  return ut;
}

/* ── Staðirnir ─────────────────────────────────────────────────────────────────────────────────────────────────── */

export interface SbStadur {
  /** Miðja staðarins (myndardílar): miðja táknsins, eða textans ef ekkert tákn fannst. */
  x: number;
  y: number;
  brsl: boolean;
  slt: boolean;
  /** Táknið (hringur slöngukeflisins) — null = staðurinn er textinn sjálfur. */
  takn: Hringur | null;
  /** Miðja SLT-orðsins (stefnan sem SLT fer í við hliðina á tákninu). */
  sltVid: { x: number; y: number } | null;
  ord: string[];
}

/** Orð → staðir. Við hvert BRSL er leitað að tákni slöngukeflisins (finnaHring) og staðurinn er Á TÁKNINU; finnist
 * ekkert tákn er staðurinn textinn. SLT nálægt BRSL-stað (≤ 6,5 stafahæðir frá tákninu / textanum — merkingin
 * „BRSL SLT" við keflið) fer á þann stað (varnarstaður: slanga + slökkvitæki); annað SLT er sér staður þar sem
 * textinn er (teikningin sýnir ekkert tákn fyrir stakt slökkvitæki). Slanga er ALDREI ályktuð af tákni einu saman —
 * aðeins af BRSL-orði. */
export function sltBrslStadir(ord: SbOrd[], blek: Blek | null, skra?: (lina: string) => void): SbStadur[] {
  const stadir: SbStadur[] = [];
  const merki = (o: SbOrd) => `${o.texti.trim()} (${Math.round(o.vissa)} %)`;
  for (const o of ord.filter((x) => x.tegund === "brsl")) {
    skra?.(`BRSL ${Math.round(o.x)},${Math.round(o.y)} h${Math.round(o.h)}`);
    const takn = blek ? finnaHring(blek, o.x, o.y, o.h, skra) : null;
    // sama kefli lesið tvisvar (t.d. „BRSL" + „BRSL|SLT")
    const sami = takn && stadir.find((s) => s.takn && Math.hypot(s.takn.x - takn.x, s.takn.y - takn.y) < Math.max(s.takn.r, takn.r));
    if (sami) {
      sami.ord.push(merki(o));
      continue;
    }
    stadir.push({
      x: takn ? takn.x : o.x,
      y: takn ? takn.y : o.y,
      brsl: true,
      slt: false,
      takn,
      sltVid: null,
      ord: [merki(o)],
    });
  }
  for (const o of ord.filter((x) => x.tegund === "slt")) {
    let naest: SbStadur | null = null;
    let nd = Infinity;
    for (const s of stadir) {
      if (!s.brsl || s.slt) continue;
      const d = Math.hypot(s.x - o.x, s.y - o.y);
      if (d < nd) {
        nd = d;
        naest = s;
      }
    }
    if (naest && nd <= o.h * 6.5) {
      naest.slt = true;
      naest.sltVid = { x: o.x, y: o.y };
      naest.ord.push(merki(o));
      continue;
    }
    stadir.push({ x: o.x, y: o.y, brsl: false, slt: true, takn: null, sltVid: { x: o.x, y: o.y }, ord: [merki(o)] });
  }
  return stadir.sort((a, b) => a.y - b.y || a.x - b.x);
}

/* ── Á borðið: tæki á staðina, tengd við óstaðsett tæki ────────────────────────────────────────────────────────── */

type Tki = { id: number; serial: string | null; type: string | null; status: string | null };

export interface SbTaekiABord {
  /** Tegund táknsins (lettvatn/duft/co2/slanga). */
  tegund: TaekjaTegund;
  /** Miðja (borðhnit). */
  x: number;
  y: number;
  /** Tengt tæki, eða null = ótengt. */
  taeki: Tki | null;
  hvad: SbTegund;
  stadur: number;
}

export interface SbAetlun {
  taeki: SbTaekiABord[];
  /** Staðir þar sem tæki af réttri tegund var þegar á borðinu (innan seilingar) — ekkert nýtt sett. */
  fyrir: { hvad: SbTegund; stadur: number }[];
}

/** SLT-tegundir í röð (býr í sjalftenging.ts — forgangsröð úthlutunar notar hana líka). */
export { SLT_TEGUNDIR };

/** Hvar hvert tæki fer og við hvaða skráða tæki það tengist. `stadir` í BORÐHNITUM (miðja; takn.r í borðeiningum).
 * Tæki af sömu tegund sem er þegar innan `seiling` (borðeiningar) frá staðnum — sett handvirkt, eða í fyrri lestri —
 * þjónar staðnum: ekkert nýtt (endurkeyrsla tvítekur ekki). `sjodur` = óstaðsett tæki staðarins (null = borðið er ekki
 * tengt úttekt → allt ótengt). */
export function aetlaSltBrsl(
  stadir: SbStadur[],
  objects: BoardObject[],
  st: { staerd: number; seiling: number; sjodur: TaekjaSjodur | null; taekiEftirId?: Map<string, Tki>; fyrirMynd?: (o: SymbolObject) => boolean }
): SbAetlun {
  const fyrirTaeki: { tegund: TaekjaTegund; x: number; y: number }[] = [];
  for (const o of objects) {
    if (o.type !== "symbol" || o.hidden) continue;
    if (st.fyrirMynd && !st.fyrirMynd(o)) continue;
    const t = tegundABordi(o, st.taekiEftirId);
    if (!t) continue;
    fyrirTaeki.push({ tegund: t, x: o.x + o.size / 2, y: o.y + o.size / 2 });
  }
  const ut: SbAetlun = { taeki: [], fyrir: [] };
  const thjonad = (tegundir: TaekjaTegund[], p: { x: number; y: number }) =>
    [...fyrirTaeki, ...ut.taeki].some((f) => tegundir.includes(f.tegund) && Math.hypot(f.x - p.x, f.y - p.y) <= st.seiling);
  stadir.forEach((s, i) => {
    if (s.brsl) {
      const p = { x: s.x, y: s.y };
      if (thjonad(["slanga"], p)) ut.fyrir.push({ hvad: "brsl", stadur: i });
      else ut.taeki.push({ tegund: "slanga", ...p, taeki: st.sjodur?.taka(["slanga"]) ?? null, hvad: "brsl", stadur: i });
    }
    if (s.slt) {
      // við slöngutáknið: SLT við hliðina (í átt að SLT-textanum), annars á staðnum sjálfum
      let p = { x: s.x, y: s.y };
      if (s.brsl) {
        const vx = s.sltVid ? s.sltVid.x - s.x : 1, vy = s.sltVid ? s.sltVid.y - s.y : 0;
        const L = Math.hypot(vx, vy) || 1;
        const fjar = Math.min(st.staerd * 0.72, st.seiling * 0.375);
        p = { x: s.x + (vx / L) * fjar, y: s.y + (vy / L) * fjar };
      }
      if (thjonad([...SLT_TEGUNDIR, "annad"], p) || thjonad([...SLT_TEGUNDIR, "annad"], { x: s.x, y: s.y })) {
        ut.fyrir.push({ hvad: "slt", stadur: i });
      } else {
        const t = st.sjodur?.taka(SLT_TEGUNDIR) ?? null;
        ut.taeki.push({ tegund: t ? tegundUrSkrad(t.type) : "lettvatn", ...p, taeki: t, hvad: "slt", stadur: i });
      }
    }
  });
  return ut;
}

function tegundUrSkrad(type: string | null): TaekjaTegund {
  const s = String(type || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
  if (/co2|kolsyr/.test(s)) return "co2";
  if (/duft|abc|pfc/.test(s)) return "duft";
  if (/slang|slong/.test(s)) return "slanga";
  return "lettvatn";
}

/** Tengd tæki á borðinu (fyrir talningu í prófum / skýrslu). */
export function tengdTaekiABordi(objects: BoardObject[]): SymbolObject[] {
  return objects.filter((o): o is SymbolObject => o.type === "symbol" && erTengtTaekiTakn(o));
}

/* ── Húsið á myndinni ──────────────────────────────────────────────────────────────────────────────────────────── */

/** Skurður hæðarinnar (dílar FRUMMYNDAR, `uttekt.skurdur`) → svæði í dílum MYNDARINNAR (srcW × srcH), með 3 % svigrúmi.
 * Mynd sem var skorin úr blaðinu (`svaedi`) sýnir aðeins þann hluta. null = enginn skurður (þá titilreitsreglan). */
export function husSvaediIMynd(
  skurdur: { x: number; y: number; w: number; h: number } | null | undefined,
  frum: { b: number; h: number },
  svaedi: { x: number; y: number; w: number; h: number } | null | undefined,
  src: { b: number; h: number }
): Svaedi | null {
  if (!skurdur || !(skurdur.w > 8) || !(skurdur.h > 8) || !(frum.b > 0) || !(frum.h > 0)) return null;
  const sv = svaedi && svaedi.w > 0 && svaedi.h > 0 ? svaedi : { x: 0, y: 0, w: frum.b, h: frum.h };
  const kx = src.b / sv.w, ky = src.h / sv.h;
  const mx = skurdur.w * 0.03, my = skurdur.h * 0.03;
  return {
    x0: (skurdur.x - mx - sv.x) * kx,
    y0: (skurdur.y - my - sv.y) * ky,
    x1: (skurdur.x + skurdur.w + mx - sv.x) * kx,
    y1: (skurdur.y + skurdur.h + my - sv.y) * ky,
  };
}

/** Staðir í myndardílum → borðhnit (plan.x + x · plan.width / srcW). ÞETTA var villan: orðin voru sett á borðið
 * óbreytt, eins og myndardílar væru borðeiningar. */
export function stadirABord(stadir: SbStadur[], plan: { x: number; y: number; width: number; height: number }, src: { b: number; h: number }): SbStadur[] {
  const kx = plan.width / src.b, ky = plan.height / src.h;
  const p = (q: { x: number; y: number }) => ({ x: plan.x + q.x * kx, y: plan.y + q.y * ky });
  return stadir.map((s) => ({
    ...s,
    ...p(s),
    takn: s.takn ? { ...s.takn, ...p(s.takn), r: s.takn.r * kx } : null,
    sltVid: s.sltVid ? p(s.sltVid) : null,
  }));
}

/** Rammar (myndardílar) til að endurlesa við slöngukefli sem fékk ekkert SLT: ±8 stafahæðir kringum keflið. */
export function endurlestrarRammar(stadir: SbStadur[], h: number): Svaedi[] {
  const r = h * 8;
  return stadir.filter((s) => s.brsl && !s.slt).map((s) => ({ x0: s.x - r, y0: s.y - r, x1: s.x + r, y1: s.y + r }));
}

/** Algeng slöngulengd brunaslöngukefla (EN 671-1: ≤ 30 m) — drægi slöngu, aðeins teiknað ef beðið er um það. */
export const DRAEGI_SLONGU_M = 25;
/** localStorage: „Sýna drægi slangna (165.BR1)" í Slökkvitæki-hamnum — sjálfgefið AF (Agnar 07.10.2026: „og taka þennan
 * rauða hring"). Útlitsval vafrans, ekki gögn. */
export const DRAEGI_LYKILL = "tp_draegi_slangna";
