// SJÁLFVIRKA VERKFERLIÐ (Agnar 08.10.2026): „setja takka sem setur í gang eitthvað automatic verkferli.. að t.d. myndin í
// hæstu gæðum sendist í TurboPaint. skera að byggingu. Les brunaveggi og merkingar. Til aðstoðar við að merkja inn veggi
// og hurðir.. automater sem reynir að tengja saman veggina og henda burtu stökum veggjaeiningum og aðra hluti. Og birtist
// síðan aftur inn í Teikningar". Markmið hans: ~200 hreinar 2D-teikningar og ~40 3D fyrir tilboð — mælikvarðinn er hve
// mikið hann þarf að laga sjálfur.
//
// Teikning (slokkvitaeki 383) „Sjálfvirkt" → TurboPaint ?uttekt=…&haed=…&sjalfvirkt=1 → hæðin opnast í hæstu gæðum
// (TIF-frumrit / vigur-PDF) og þetta ferli keyrir:
//   a) gæði      hvaðan teikningin kom (TIF-frumrit, vigur-PDF, JPEG)
//   b) skurður   engan skurð / allt blaðið → húsið fundið (stærsti veggjaklasinn, veggja-hreinsun.ts husKassi) + 2,5 %
//                spássía; skurður sem er til heldur sér
//   c) veggir    vigur-PDF → tillöguflokkurinn (línuflokkar); skönnun → Veggjavél (skrifstofutölvan), annars ~2 mín
//                myndgreining í vafranum. Gler með.
//   d) hreinsun  veggja-hreinsun.ts (strik-punkt, rétta, sameina, smella, lengja, stakir)
//   e) hurðir    hurdagreining.ts (bil 0,7–1,3 m, bogi, bílahurð í útvegg; gluggar → gler) og svo „utan húss"
//   f) EI        texti teikningarinnar lesinn EINU sinni (OCR) → eldveggir festir á veggi (ei-beiting.ts)
//   g) tæki      SLT / BRSL úr sama texta → tæki á táknin (slt-brsl-bord.ts); sjálftenging við vistun
//   h) vista     óleiðrétt hæð (eða áður sjálfvirk) vistast sjálfkrafa með leidrett {af:'sjalfvirkt'}; hæð sem Agnar
//                leiðrétti (af:'turbopaint') er ALDREI yfirskrifuð — spurt „Bæta við nýju / Hætta við" (Hætta við
//                sjálfgefið). Sama vistunarleið og „Vista í úttekt".
// Allt er EITT ⌘Z-skref (ein sögufærsla í upphafi). „Stöðva" hættir án þess að vista. Bregðist skref heldur ferlið áfram
// með það sem er til og segir frá því.
//
// VEGGIR AGNARS (hæð með leidrett af:'turbopaint', eða veggjaLinur án leidrett) eru FASTAR línur: ekkert skref breytir
// þeim — nýjar línur bætast aðeins við þar sem engin er (sameinaVidVeggi), smellast AÐ þeim, og EI festist ekki á þær.

import { getAssetBlob } from "./assets";
import { replaceCrossingMarks } from "./crossings";
import { eiUrTexta, lesaTextaTeikningar } from "./detect-firewalls";
import { beitaEi, veggirTeikningar } from "./ei-beiting";
import { finnaHurdir, type HurdKandidat } from "./hurdagreining";
import { bogaProf, hurdirUrBogum, nyjarBogahurdir, skeraVeggiUndirHurdum, type Bogi } from "./hurdabogar";
import { bogarTeikningar } from "./hurdabogar-mynd";
import { bladMyndar } from "./margar-haedir";
import { flokkaYfirlit, klemmaGreindaThykkt, pdfErSkonnun, ptIBord, skurdurIPt, strikValinna, veggirUrStrikumPt } from "./pdf-veggjaflokkar";
import { useSjalfvirkt, type MaelLina, type SkrefId } from "./sjalfvirkt-stada";
import { greinaVeggiSkonnunar } from "./skonnun-veggir-mynd";
import { beitaSltBrsl } from "./slt-brsl-bord";
import { sltBrslUrTexta } from "./slt-brsl-lestur";
import { newId, useBoardStore } from "./store";
import { lesaPdfSidu, type PdfSida } from "./strip";
import { getSupabase, supabaseUrl } from "./supabase";
import { veggirUrHanddregnum, type VeggTegund } from "./teikning-veggir";
import type { BoardObject, ImageObject, LineObject } from "./types";
import { bladIBordi, gilturSkurdur, saekjaUttekt, skurdurIBord, veggirIBord, veggirIFrum, vorpunMyndar, type LeidrettAf, type UttektHaed } from "./uttekt";
import { useUttektGogn } from "./uttekt-gogn";
import { husKassi, husUtlina, hreinsaVeggi, lesaVikmork, utanHuss, VIKMORK_LYKILL, type HLina, type Rammi, type Vikmork } from "./veggja-hreinsun";
import { heimsPunktar, nyGreiningarLota, nyrVeggur, sameinaVidVeggi } from "./veggja-ritill";
import { ritillDilarAMetra } from "./veggja-ritill-adgerdir";
import {
  beidniGogn,
  lesaNidurstodu,
  lesaVeggjavelJson,
  leyfdSlod,
  metaStodu,
  velLinurIBord,
  VEGGJAVEL_HAMARK_MS,
  VEGGJAVEL_SVARAR_EKKI_MS,
  VEGGJAVEL_WORKFLOW,
} from "./veggjavel";

/** Hvaðan teikningin kom inn (sett við innflutning í WhiteboardApp runUrlImport). */
export type GaediLysing = { gerd: "tif" | "pdf" | "jpeg" | "mynd"; b: number; h: number; texti: string };

export interface SjalfvirktDeps {
  /** „Vista í úttekt" (sama leið og takkinn): skilar texta eða villu. */
  vista: (opts: { leidrettAf: LeidrettAf }) => Promise<{ ok: true; texti: string } | { ok: false; villa: string }>;
  /** Hvaðan teikningin kom í hæstu gæðum. */
  gaedi: GaediLysing | null;
  /** Rammar myndavélina á svæði (borðhnit). */
  ramma?: (r: { x: number; y: number; width: number; height: number }) => void;
}

/** Lengsta bið eftir textalestri teikningarinnar (OCR) — eftir það heldur ferlið áfram án EI og tækja. */
export const OCR_THAK_MS = 8 * 60_000;

/** Bíður eftir loforði, en ekki lengur en `ms` og ekki eftir að ýtt var á Stöðva. */
async function medThaki<T>(p: Promise<T>, ms: number, stodvad: () => boolean, hvad: string): Promise<T> {
  const t0 = Date.now();
  let buid = false;
  p.catch(() => {}).finally(() => (buid = true));
  for (;;) {
    const r = await Promise.race([p.then((v) => ({ v })), bida(500).then(() => null)]);
    if (r) return r.v;
    if (buid) return p;
    if (stodvad()) throw new Error("stöðvað");
    if (Date.now() - t0 > ms) throw new Error(hvad + " svaraði ekki á " + Math.round(ms / 60000) + " mín");
  }
}

/** Hve lengi beðið er eftir að Veggjavélin KLÁRI eftir að skrifstofutölvan tók beiðnina (hún tekur oftast 1–2 mín). */
export const VEGGJAVEL_BID_MS = 6 * 60_000;

const VEGG_TEG = new Set<VeggTegund>(["veggur", "ei60", "ei30"]);
const erVeggTeg = (l: { tegund?: VeggTegund }) => VEGG_TEG.has(l.tegund ?? "veggur");
const fjoldi = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const m2 = (n: number) => n.toFixed(1).replace(".", ",");
const bida = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Línur borðsins (LineObject) → HLina (heimshnit). */
function semHLina(o: LineObject): HLina {
  const h: HLina = { p: heimsPunktar(o), t: o.strokeWidth };
  if (o.veggTegund && o.veggTegund !== "veggur") h.tegund = o.veggTegund;
  return h;
}

/** Vikmörkin eins og þau eru stillt (localStorage `tp_sjalfvirkt_vikmork`), annars sjálfgefin. */
export function virkVikmork(): Vikmork {
  try {
    return lesaVikmork(localStorage.getItem(VIKMORK_LYKILL));
  } catch {
    return lesaVikmork(null);
  }
}

export function vikmorkTexti(v: Vikmork): string {
  const cm = (m: number) => Math.round(m * 100) + " cm";
  return (
    `smella ${cm(v.smellaM)} · samlína ${cm(v.samlinaBilM)} · rétta ±${v.rettaGradur}° · lengja ${cm(v.lengjaM)} · stakur < ${cm(v.stakurM)} (skönnun ${cm(v.stakurSkonnunM)}) · ` +
    `hurð ${m2(v.hurd.minM)}–${m2(v.hurd.maxM)} m (með boga ${m2(v.hurd.bogiMinM)}–${m2(v.hurd.bogiMaxM)}) · bílahurð > ${m2(v.hurd.bilahurdM)} m`
  );
}

// ── myndprófanir (bogi hurðarblaðs, línur þvert yfir gat) ─────────────────────────────────────────────────────

type P = [number, number];

/** Grátóna sýni af teikningunni innan `kassi` (borðhnit) — ~3.200 dílar á lengri hlið. */
async function myndSyni(plan: ImageObject, kassi: Rammi): Promise<{ bogi: (A: P, B: P, t: number) => boolean; linaIBili: (A: P, B: P, t: number) => boolean } | null> {
  const blob = getAssetBlob(plan.assetId);
  if (!blob) return null;
  const heil = await createImageBitmap(blob);
  const iw = heil.width, ih = heil.height;
  heil.close();
  const kx = iw / plan.width, ky = ih / plan.height;
  const ix0 = Math.max(0, Math.floor((kassi.x0 - plan.x) * kx)), iy0 = Math.max(0, Math.floor((kassi.y0 - plan.y) * ky));
  const ix1 = Math.min(iw, Math.ceil((kassi.x1 - plan.x) * kx)), iy1 = Math.min(ih, Math.ceil((kassi.y1 - plan.y) * ky));
  const rw = ix1 - ix0, rh = iy1 - iy0;
  if (rw < 16 || rh < 16) return null;
  const k = Math.min(1, 3200 / Math.max(rw, rh));
  const W = Math.max(1, Math.round(rw * k)), H = Math.max(1, Math.round(rh * k));
  const bmp = await createImageBitmap(blob, ix0, iy0, rw, rh, { resizeWidth: W, resizeHeight: H, resizeQuality: "high" });
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const x = c.getContext("2d", { willReadFrequently: true });
  if (!x) return null;
  x.fillStyle = "#fff";
  x.fillRect(0, 0, W, H);
  x.drawImage(bmp, 0, 0);
  bmp.close();
  const d = x.getImageData(0, 0, W, H).data;
  c.width = 0;
  c.height = 0;
  const gra = new Uint8Array(W * H);
  for (let i = 0, j = 0; i < W * H; i++, j += 4) gra[i] = (d[j] * 77 + d[j + 1] * 150 + d[j + 2] * 29) >> 8;
  const dimmt = (bx: number, by: number) => {
    const px = Math.round(((bx - plan.x) * kx - ix0) * k), py = Math.round(((by - plan.y) * ky - iy0) * k);
    for (let yy = py - 1; yy <= py + 1; yy++) {
      if (yy < 0 || yy >= H) continue;
      for (let xx = px - 1; xx <= px + 1; xx++) if (xx >= 0 && xx < W && gra[yy * W + xx] < 140) return true;
    }
    return false;
  };
  const horn = Array.from({ length: 11 }, (_, i) => ((20 + i * 5) * Math.PI) / 180);
  /** Hlutfall horna (20–70°) þar sem dökkur díll er í radíusbandinu [r0, r1] frá C. */
  const bandProf = (C: P, u: P, n: P, r0: number, r1: number) => {
    let hit = 0;
    for (const f of horn) {
      const cs = Math.cos(f), sn = Math.sin(f);
      for (let q = 0; q <= 12; q++) {
        const r = r0 + ((r1 - r0) * q) / 12;
        if (dimmt(C[0] + r * (cs * u[0] + sn * n[0]), C[1] + r * (cs * u[1] + sn * n[1]))) {
          hit++;
          break;
        }
      }
    }
    return hit / horn.length;
  };
  const bogi = (A: P, B: P) => {
    const g = Math.hypot(B[0] - A[0], B[1] - A[1]);
    if (g < 1e-6) return false;
    const u: P = [(B[0] - A[0]) / g, (B[1] - A[1]) / g];
    for (const s of [1, -1]) {
      const n: P = [-u[1] * s, u[0] * s];
      if (bandProf(A, u, n, 0.72 * g, 1.08 * g) >= 0.8 || bandProf(B, [-u[0], -u[1]], n, 0.72 * g, 1.08 * g) >= 0.8) return true;
      if (bandProf(A, u, n, 0.36 * g, 0.56 * g) >= 0.8 && bandProf(B, [-u[0], -u[1]], n, 0.36 * g, 0.56 * g) >= 0.8) return true;
    }
    return false;
  };
  const linaIBili = (A: P, B: P, t: number) => {
    const g = Math.hypot(B[0] - A[0], B[1] - A[1]);
    if (g < 1e-6) return false;
    const u: P = [(B[0] - A[0]) / g, (B[1] - A[1]) / g], n: P = [-u[1], u[0]];
    for (const off of [-0.35, 0, 0.35]) {
      let hit = 0;
      const N = 16;
      for (let q = 0; q < N; q++) {
        const f = 0.12 + (0.76 * q) / (N - 1);
        if (dimmt(A[0] + u[0] * g * f + n[0] * t * off, A[1] + u[1] * g * f + n[1] * t * off)) hit++;
      }
      if (hit / N >= 0.85) return true;
    }
    return false;
  };
  return { bogi, linaIBili };
}

// ── Veggjavél (skrifstofutölvan) ───────────────────────────────────────────────────────────────────────────

type VelUt = { veggir: HLina[]; texti: string; fyrri: boolean } | { villa: string };

/** Veggjavélin á hæðina: nýleg niðurstaða sama blaðs og skurðar, verk í gangi, eða ný beiðni. Svari skrifstofutölvan
 * ekki innan ~2 mín (eða klári ekki innan VEGGJAVEL_BID_MS) kemur villa — myndgreiningin í vafranum tekur þá við. */
async function keyraVeggjavel(planId: string, imageUrlHaedar: string | null, uppfaera: (texti: string, pros: number | null) => void, stodvad: () => boolean): Promise<VelUt> {
  const mynd = () => useBoardStore.getState().objects.find((o): o is ImageObject => o.id === planId && o.type === "image") ?? null;
  const p0 = mynd();
  if (!p0) return { villa: "teikningin fannst ekki" };
  // Slóð blaðsins úr hæðinni sjálfri (teikning_bord) — líka PDF utan Reykjavíkur (Hafnarfjörður), sem myndSlodBlads þekkir ekki
  const bg = beidniGogn(p0, imageUrlHaedar);
  if ("astaeda" in bg) return { villa: bg.astaeda };
  const gogn = bg.gogn;
  const sb = getSupabase();
  if (!sb) return { villa: "engin tenging við gagnagrunninn" };
  const lesa = async (slod: string) => {
    if (!leyfdSlod(slod, supabaseUrl())) throw new Error("niðurstaðan er ekki í geymslu TurboPaint");
    const r = await fetch(slod, { cache: "no-store" });
    if (!r.ok) throw new Error(`niðurstaðan fékkst ekki (${r.status})`);
    const linur = lesaVeggjavelJson(await r.json());
    const p = mynd();
    if (!p) throw new Error("teikningin hvarf af borðinu");
    const blad = bladMyndar(p);
    return velLinurIBord(linur, p, blad.frum, blad.svaedi) as HLina[];
  };
  const sami = (a: unknown) => {
    const s = a as { x: number; y: number; w: number; h: number } | null;
    const g = gogn.skurdur;
    if (!s || !g) return !s && !g;
    const vik = Math.max(g.w, g.h) * 0.02;
    return Math.abs(s.x - g.x) <= vik && Math.abs(s.y - g.y) <= vik && Math.abs(s.w - g.w) <= vik && Math.abs(s.h - g.h) <= vik;
  };
  let id: number | null = null;
  let byrjad = Date.now();
  // 1) verk í gangi eða nýleg niðurstaða fyrir sama blað og skurð
  const r = await sb
    .from("automation_triggers")
    .select("id,status,result,requested_at,finished_at,gogn")
    .eq("workflow", VEGGJAVEL_WORKFLOW)
    .eq("gogn->>company_id", String(gogn.company_id))
    .eq("gogn->>haed_id", gogn.haed_id)
    .eq("gogn->>image_url", gogn.image_url)
    .order("id", { ascending: false })
    .limit(6);
  if (!r.error) {
    const radir = (r.data || []) as { id: number; status: string; result: string | null; requested_at: string; finished_at: string | null; gogn: { skurdur?: unknown } }[];
    const iGangi = radir.find((x) => (x.status === "bida" || x.status === "pending" || x.status === "running") && Date.now() - Date.parse(x.requested_at) < VEGGJAVEL_HAMARK_MS && sami(x.gogn?.skurdur));
    if (iGangi) {
      id = iGangi.id;
      byrjad = Date.parse(iGangi.requested_at) || Date.now();
    } else {
      for (const x of radir) {
        const n = x.status === "done" ? lesaNidurstodu(x.result) : null;
        if (!n || !sami(x.gogn?.skurdur)) continue;
        try {
          const veggir = await lesa(n.slod);
          const kl = new Date(Date.parse(x.finished_at || x.requested_at)).toLocaleString("is-IS");
          return { veggir, fyrri: true, texti: `Veggjavél (skrifstofutölvan): ${n.veggir} veggir, ${n.gler} gler — síðasta niðurstaða hæðarinnar (${kl})` };
        } catch {
          /* næsta / ný beiðni */
        }
      }
    }
  }
  // 2) ný beiðni
  if (id == null) {
    const ins = await sb.from("automation_triggers").insert({ workflow: VEGGJAVEL_WORKFLOW, status: "bida", requested_by: "turbopaint-sjalfvirkt", gogn }).select("id");
    const nid = (ins.data as { id: number }[] | null)?.[0]?.id;
    if (ins.error || !nid) return { villa: "beiðnin til skrifstofutölvunnar vistaðist ekki (" + (ins.error?.message || "ekkert auðkenni") + ")" };
    id = nid;
    byrjad = Date.now();
  }
  let tekin: number | null = null;
  for (;;) {
    if (stodvad()) return { villa: "stöðvað" };
    await bida(3000);
    const q = await sb.from("automation_triggers").select("status,result,requested_at").eq("id", id).limit(1);
    const rod = (q.data as { status: string; result: string | null }[] | null)?.[0];
    if (!rod) continue;
    const st = metaStodu(rod, { nu: Date.now(), byrjad, hafnadFra: null, upptekin: null });
    const bid = Date.now() - byrjad;
    if (st.s === "lokid") {
      try {
        const veggir = await lesa(st.nid.slod);
        return { veggir, fyrri: false, texti: `Veggjavél (skrifstofutölvan): ${st.nid.veggir} veggir, ${st.nid.gler} gler${st.nid.sek != null ? ` (${st.nid.sek} s)` : ""}` };
      } catch (err) {
        return { villa: err instanceof Error ? err.message : "niðurstaðan fékkst ekki" };
      }
    }
    if (st.s === "villa") return { villa: st.texti };
    if (st.s === "vinnur") {
      tekin ??= Date.now();
      uppfaera(st.texti.split(" — ")[0], st.pros);
      if (Date.now() - tekin > VEGGJAVEL_BID_MS) return { villa: `skrifstofutölvan kláraði ekki á ${Math.round(VEGGJAVEL_BID_MS / 60000)} mín` };
    } else {
      uppfaera(`Bíð eftir skrifstofutölvunni… ${Math.round(bid / 1000)} s`, null);
      if (bid > VEGGJAVEL_SVARAR_EKKI_MS) return { villa: "skrifstofutölvan svaraði ekki á 2 mín" };
    }
  }
}

// ── verkferlið ──────────────────────────────────────────────────────────────────────────────────────────────

/** Keyrir sjálfvirka verkferlið á teikninguna `planId` (tengda úttektarhæð). */
export async function keyraSjalfvirkt(planId: string, deps: SjalfvirktDeps): Promise<void> {
  const S = useSjalfvirkt.getState;
  if (S().keyrir) return;
  S().byrja();
  const vik = virkVikmork();
  S().set({ vikmorkTexti: vikmorkTexti(vik) });
  const ms: Record<string, number> = {};
  const stodvad = () => S().stodva;
  const bord = () => useBoardStore.getState();
  const mynd = () => bord().objects.find((o): o is ImageObject => o.id === planId && o.type === "image") ?? null;
  const t0 = performance.now();
  let skrefT = performance.now();
  const hefja = (id: SkrefId, texti = "") => {
    skrefT = performance.now();
    S().setja(id, { stada: "keyrir", texti, pros: null });
  };
  const ljuka = (id: SkrefId, texti: string, stada: "lokid" | "sleppt" | "villa" = "lokid") => {
    ms[id] = Math.round(performance.now() - skrefT);
    S().setja(id, { stada, texti, pros: null, ms: ms[id] });
  };
  const villa = (id: SkrefId, err: unknown, eftir = "") => {
    console.warn("[sjálfvirkt] " + id, err);
    ljuka(id, (err instanceof Error ? err.message : String(err)) + (eftir ? " — " + eftir : ""), "villa");
  };
  const stoppa = () => {
    for (const k of S().skref) if (k.stada === "bida" || k.stada === "keyrir") S().setja(k.id, { stada: "stodvad", texti: "Stöðvað" });
    S().set({ keyrir: false, vistun: "stodvad", vistunTexti: "Stöðvað — ekkert var vistað. ⌘Z tekur það sem komið var á borðið." });
  };

  const p0 = mynd();
  const t = p0?.uttekt;
  if (!p0 || !t) {
    S().set({ keyrir: false, yfirlit: "Teikningin er ekki tengd úttektarhæð — ekkert gert." });
    return;
  }
  const cid = t.companyId;
  const gogn = useUttektGogn.getState().gogn;
  const haed: UttektHaed | null = (gogn && gogn.companyId === cid ? gogn.haedir.find((h) => h.id === t.haedId) : null) ?? null;
  const frum = { b: t.frumB, h: t.frumH };
  const dpm = ritillDilarAMetra(bord().objects, bord().pixelsPerMeter) ?? 71.4 * (p0.width / Math.max(1, t.myndSkurdur?.w || t.frumB));
  // Hver á veggina sem fyrir eru?
  const vl = Array.isArray(haed?.veggjaLinur) && (haed?.veggjaLinur?.length ?? 0) > 0;
  const af = haed?.leidrett?.af;
  const handLeidrett = af === "turbopaint" || (vl && !haed?.leidrett);
  const fyrir = veggirTeikningar(bord().objects, p0);
  // Handdregnir veggir Teikning-gluggans (✏) eru hans líka — fastar línur (smellt AÐ þeim), aldrei snertar.
  const v0 = vorpunMyndar(p0);
  const hand = haed && Array.isArray(haed.veggir) && haed.veggir.length && v0 ? veggirIBord(veggirUrHanddregnum(haed.veggir as number[][], frum), p0, frum, v0.svaedi).map(semHLina) : [];
  const handABordi = new Set(
    fyrir
      .filter((o) => hand.some((h) => {
        const p = heimsPunktar(o);
        return p.length === 4 && Math.hypot(p[0] - h.p[0], p[1] - h.p[1]) < 2 && Math.hypot(p[2] - h.p[2], p[3] - h.p[3]) < 2;
      }))
      .map((o) => o.id)
  );
  const fastIds = new Set(handLeidrett ? fyrir.map((o) => o.id) : [...handABordi]);
  const skiptaIds = new Set(fyrir.filter((o) => !fastIds.has(o.id)).map((o) => o.id));
  const fastarH: HLina[] = [...fyrir.filter((o) => fastIds.has(o.id)).map(semHLina), ...hand.filter(() => !handLeidrett && !handABordi.size)];
  console.info("[sjálfvirkt] byrja " + JSON.stringify({ cid, haed: t.haedId, af: af ?? null, handLeidrett, fyrir: fyrir.length, fastar: fastarH.length, skipta: skiptaIds.size, dpm: Math.round(dpm * 10) / 10 }));

  // EITT ⌘Z-skref: sögufærslan er tekin hér og ekkert skref hér á eftir tekur aðra.
  bord().commitHistory();
  const lota = nyGreiningarLota();
  const talning: Record<string, unknown> = { fastar: fastarH.length, skipt: skiptaIds.size };

  // ── a) hæstu gæði ──
  hefja("gaedi");
  const g = deps.gaedi;
  let sida: PdfSida | null = null;
  try {
    sida = await lesaPdfSidu(p0);
  } catch (err) {
    console.warn("[sjálfvirkt] PDF-lestur", err);
  }
  const vigur = !!sida && !pdfErSkonnun(sida.flokkar);
  // Upplausn myndarinnar sem greiningin vinnur á (eignin á borðinu).
  let upplausn = "";
  try {
    const blob = getAssetBlob(p0.assetId);
    if (blob) {
      const bmp = await createImageBitmap(blob);
      upplausn = `${fjoldi(bmp.width)}×${fjoldi(bmp.height)} dílar`;
      bmp.close();
    }
  } catch {
    upplausn = "";
  }
  ljuka(
    "gaedi",
    vigur
      ? `Vigur-PDF frumskjalið (${fjoldi(sida!.breidd)}×${fjoldi(sida!.haed)} pt) — línurnar lesnar beint úr vigrinum, skarpt við aðdrátt`
      : g?.gerd === "tif"
        ? g.texti
        : g?.gerd === "pdf"
          ? `Skönnuð PDF (frumskjalið) teiknuð í ${upplausn || "hæstu gæðum"}`
          : g?.texti || `Mynd ${upplausn}`,
    g && g.gerd === "jpeg" ? "villa" : "lokid"
  );
  if (stodvad()) return stoppa();

  // ── b) skera að byggingu ──
  hefja("skurdur");
  let skurdurFundinn = false;
  let heilBladVeggir: HLina[] | null = null; // myndgreining alls blaðsins (skönnun) — nýtt aftur í c)
  let tillaga: string | null = null;
  try {
    const skH = gilturSkurdur(t.skurdur ?? null);
    const heilt = !skH || skH.w * skH.h >= 0.9 * frum.b * frum.h;
    if (t.myndSkurdur) {
      ljuka("skurdur", "Teikningin er skorinn hluti blaðs — skurðurinn heldur sér", "sleppt");
    } else if (handLeidrett) {
      // Leiðrétt hæð: nýr skurður gæti klippt veggi Agnars í 3D (383 klippaButa) — hann er aldrei snertur.
      ljuka("skurdur", "Hæðin er leiðrétt í höndunum — skurðurinn heldur sér", "sleppt");
    } else if (!heilt) {
      ljuka("skurdur", `Skurður hæðarinnar heldur sér (${m2((skH!.w / frum.b) * (bladIBordi(p0, frum).width / dpm))} × ${m2((skH!.h / frum.h) * (bladIBordi(p0, frum).height / dpm))} m)`, "sleppt");
    } else {
      let veggir: HLina[] = [];
      if (vigur && sida) {
        const tl = flokkaYfirlit(sida.flokkar, sida.breidd, sida.haed).find((f) => f.tillaga);
        if (tl) {
          tillaga = tl.breidd;
          const strik = strikValinna(sida.flokkar, [tl.breidd], { svaedi: null, burt: p0.hvittad, bladB: sida.breidd, bladH: sida.haed });
          veggir = ptIBord(veggirUrStrikumPt(strik, sida.breidd, sida.haed, { gler: true, stakar: true }), p0, sida.breidd, sida.haed);
        }
      } else {
        S().setja("skurdur", { texti: "Greini veggi alls blaðsins til að finna húsið…" });
        const gr = await greinaVeggiSkonnunar(p0, (pr) => S().setja("skurdur", { pros: pr }));
        veggir = klemmaGreindaThykkt(gr.veggir, dpm);
        heilBladVeggir = veggir;
      }
      const k = husKassi(veggir, dpm, { spassia: 0.025 });
      const blad = bladIBordi(p0, frum);
      if (!k) {
        ljuka("skurdur", `Fann ekki húsið á blaðinu (${veggir.length} veggir) — allt blaðið greint`, "villa");
      } else {
        const fx = (x: number) => Math.max(0, Math.min(frum.b, ((x - blad.x) / blad.width) * frum.b));
        const fy = (y: number) => Math.max(0, Math.min(frum.h, ((y - blad.y) / blad.height) * frum.h));
        const sk = { x: Math.round(fx(k.x0)), y: Math.round(fy(k.y0)), w: Math.round(fx(k.x1) - fx(k.x0)), h: Math.round(fy(k.y1) - fy(k.y0)) };
        bord().patchObject(planId, { uttekt: { ...t, skurdur: sk, skurdurSjalfvirkt: true } } as Partial<BoardObject>, false);
        skurdurFundinn = true;
        const r = skurdurIBord(sk, p0, frum, null);
        if (r && deps.ramma) deps.ramma(r);
        ljuka("skurdur", `Húsið fundið: ${m2((k.x1 - k.x0) / dpm)} × ${m2((k.y1 - k.y0) / dpm)} m (${k.klasar} klasar, 2,5 % spássía) — ásalínur, titilreitur og lóð utan við`);
      }
    }
  } catch (err) {
    villa("skurdur", err, "allt blaðið greint");
  }
  if (stodvad()) return stoppa();

  // ── c) veggir ──
  hefja("veggir");
  let hrar: HLina[] = [];
  let leid = "";
  try {
    const p = mynd()!;
    const tt = p.uttekt!;
    if (vigur && sida) {
      const tl = tillaga ? { breidd: tillaga } : flokkaYfirlit(sida.flokkar, sida.breidd, sida.haed).find((f) => f.tillaga);
      if (!tl) throw new Error("enginn línuflokkur í PDF-inu líkist veggjum");
      const sv = skurdurIPt(tt.skurdur, frum, sida.breidd, sida.haed);
      const strik = strikValinna(sida.flokkar, [tl.breidd], { svaedi: sv, burt: p.hvittad, bladB: sida.breidd, bladH: sida.haed });
      hrar = klemmaGreindaThykkt(ptIBord(veggirUrStrikumPt(strik, sida.breidd, sida.haed, { gler: true, stakar: true }), p, sida.breidd, sida.haed), dpm);
      leid = "vigur";
      const gl = hrar.filter((v) => v.tegund === "gler").length;
      ljuka("veggir", `Vigur-PDF, línuflokkur ${tl.breidd.replace(".", ",")} pt: ${fjoldi(strik.length)} línur → ${hrar.length - gl} veggir · ${gl} gler`);
    } else {
      // Skönnun: Veggjavél á skrifstofutölvunni; myndgreining vafrans keyrir samhliða sem varaleið.
      const skB = skurdurIBord(tt.skurdur, p, frum, gilturSkurdur(tt.myndSkurdur));
      const innan = (l: HLina) => {
        if (!skB) return true;
        const mx = (l.p[0] + l.p[l.p.length - 2]) / 2, my = (l.p[1] + l.p[l.p.length - 1]) / 2;
        return mx >= skB.x && my >= skB.y && mx <= skB.x + skB.width && my <= skB.y + skB.height;
      };
      const vafri: Promise<HLina[]> = heilBladVeggir
        ? Promise.resolve(heilBladVeggir.filter(innan))
        : greinaVeggiSkonnunar(p, undefined, dpm).then((gr) => klemmaGreindaThykkt(gr.veggir, dpm));
      vafri.catch(() => {});
      // Prófanir/samanburður: localStorage `tp_sjalfvirkt_leid` = „vafri" sleppir Veggjavélinni.
      let leidVal: string | null = null;
      try {
        leidVal = localStorage.getItem("tp_sjalfvirkt_leid");
      } catch {
        leidVal = null;
      }
      const vel: VelUt = leidVal === "vafri" ? { villa: "sleppt (tp_sjalfvirkt_leid = vafri)" } : await keyraVeggjavel(planId, (haed?.image_url as string | null) ?? null, (texti, pros) => S().setja("veggir", { texti, pros }), stodvad);
      if (stodvad()) return stoppa();
      if ("veggir" in vel && vel.veggir.length) {
        hrar = klemmaGreindaThykkt(vel.veggir.filter(innan), dpm);
        leid = vel.fyrri ? "veggjavel-fyrri" : "veggjavel";
        ljuka("veggir", vel.texti);
      } else {
        S().setja("veggir", { texti: `Veggjavélin: ${"villa" in vel ? vel.villa : "engir veggir"} — greini í vafranum…` });
        hrar = await vafri;
        leid = "vafri";
        const gl = hrar.filter((v) => v.tegund === "gler").length;
        ljuka("veggir", `Veggjavélin: ${"villa" in vel ? vel.villa : "engir veggir"} → myndgreining í vafranum: ${hrar.length - gl} veggir · ${gl} gler`, "lokid");
      }
    }
  } catch (err) {
    villa("veggir", err, "engir nýir veggir");
  }
  if (stodvad()) return stoppa();
  // Tvítekningar ofan á föstum línum (veggjum Agnars) falla — aðeins óþakið bætist við.
  if (fastarH.length && hrar.length) {
    const s = sameinaVidVeggi(fastarH, hrar, { vik: 0.1 * dpm, lagmark: 0.25 * dpm });
    talning.tvitekningar = s.tviteknir;
    hrar = s.baeta as HLina[];
  }
  talning.leid = leid;

  // ── d) hreinsun ──
  hefja("hreinsun");
  let hreinar: HLina[] = hrar;
  try {
    // Skönnun: stakir bútar < stakurSkonnunM fara (húsgögn, texti sem varð að vegg); vigur-PDF heldur stakurM.
    const h = hreinsaVeggi(hrar, fastarH, dpm, leid === "vigur" ? vik : { ...vik, stakurM: Math.max(vik.stakurM, vik.stakurSkonnunM) });
    hreinar = h.linur;
    Object.assign(talning, { hreinsun: h.talning });
    const tl = h.talning;
    ljuka(
      "hreinsun",
      `${tl.sameinadir} sameinaðir · ${tl.smellt} smellt · ${tl.lengdir} lengdir · ${tl.rettir} réttir · ${tl.stakir} stakir fjarlægðir` +
        (tl.strikPunkt ? ` · ${tl.strikPunkt} strik-punkt` : "") +
        ` (${hrar.length} → ${hreinar.length})`
    );
  } catch (err) {
    villa("hreinsun", err, "óhreinsaðir veggir notaðir");
  }
  if (stodvad()) return stoppa();

  // ── e) hurðir (+ utan húss) ──
  hefja("hurdir");
  let hurdir: HLina[] = [];
  let kandidatar: HurdKandidat[] = [];
  let lokaNy: HLina[] = hreinar;
  try {
    const veggirH = [...hreinar.filter(erVeggTeg), ...fastarH.filter(erVeggTeg)];
    const adrar = [...hreinar.filter((l) => !erVeggTeg(l)), ...fastarH.filter((l) => !erVeggTeg(l))];
    let kassi: Rammi | null = null;
    for (const l of [...veggirH, ...adrar])
      for (let i = 0; i + 1 < l.p.length; i += 2)
        kassi = kassi
          ? { x0: Math.min(kassi.x0, l.p[i]), y0: Math.min(kassi.y0, l.p[i + 1]), x1: Math.max(kassi.x1, l.p[i]), y1: Math.max(kassi.y1, l.p[i + 1]) }
          : { x0: l.p[i], y0: l.p[i + 1], x1: l.p[i], y1: l.p[i + 1] };
    let syni: Awaited<ReturnType<typeof myndSyni>> = null;
    if (kassi) {
      const sp = 2 * dpm;
      try {
        syni = await myndSyni(mynd()!, { x0: kassi.x0 - sp, y0: kassi.y0 - sp, x1: kassi.x1 + sp, y1: kassi.y1 + sp });
      } catch (err) {
        console.warn("[sjálfvirkt] myndsýni", err);
      }
    }
    // Hurðabogar teikningarinnar (Agnar 10.10.2026: „eitthvað sem nær að spotta hurðarnar automatically"): staðfesta
    // boga við göt OG gefa hurðir þar sem veggurinn brúaði gatið (þá er ekkert bil að finna).
    let bogar: Bogi[] = [];
    if (kassi) {
      try {
        const sp = 2 * dpm;
        bogar = (await bogarTeikningar(mynd()!, dpm, { x0: kassi.x0 - sp, y0: kassi.y0 - sp, x1: kassi.x1 + sp, y1: kassi.y1 + sp })).bogar;
      } catch (err) {
        console.warn("[sjálfvirkt] hurðabogar", err);
      }
    }
    const bogiVid = bogaProf(bogar, dpm);
    const d = finnaHurdir(veggirH, adrar, dpm, {
      vik: vik.hurd,
      bogi: (A, B, t) => bogiVid(A, B, t) || !!syni?.bogi(A, B, t),
      linaIBili: syni?.linaIBili,
    });
    const urBogum: HLina[] = nyjarBogahurdir(hurdirUrBogum(bogar, veggirH, dpm, { krefjastVeggjar: true }), [...d.hurdir, ...d.gler, ...adrar], dpm).map(
      (h) => ({ p: h.p, t: h.t, tegund: "hurd" as const })
    );
    if (urBogum.length) {
      // veggur sem brúaði gatið er klipptur undir hurðinni
      const veggirNyir = hreinar.filter(erVeggTeg), annad = hreinar.filter((l) => !erVeggTeg(l));
      hreinar = [...skeraVeggiUndirHurdum(veggirNyir, urBogum, dpm).veggir, ...annad];
    }
    hurdir = [...d.hurdir, ...urBogum];
    talning.hurdabogar = { bogar: bogar.length, hurdir: urBogum.length };
    kandidatar = d.kandidatar;
    const nyttGler: HLina[] = d.gler;
    // utan húss: útlína hússins (hurðargöt og gler loka henni) — allt nýtt utan hennar fer
    const allar = [...hreinar, ...hurdir, ...nyttGler, ...fastarH];
    const u = husUtlina(allar, dpm, vik.lokunM);
    const burtV = utanHuss(hreinar, u), burtH = utanHuss(hurdir, u), burtG = utanHuss(nyttGler, u);
    hreinar = hreinar.filter((_, i) => !burtV.has(i));
    hurdir = hurdir.filter((_, i) => !burtH.has(i));
    lokaNy = [...hreinar, ...nyttGler.filter((_, i) => !burtG.has(i)), ...hurdir];
    talning.hurdir = d.talning;
    talning.utan = { veggir: burtV.size, hurdir: burtH.size, gler: burtG.size, lokud: u.lokud };
    ljuka(
      "hurdir",
      `${hurdir.length} hurðir` +
        (d.talning.bilahurdir ? ` (${d.talning.bilahurdir} bílahurðir)` : "") +
        (urBogum.length ? ` · ${urBogum.length} úr hurðabogum` : "") +
        (d.talning.medBoga ? ` · ${d.talning.medBoga} með boga` : "") +
        (nyttGler.length ? ` · ${nyttGler.length - burtG.size} gluggar → gler` : "") +
        ` · utan húss: ${burtV.size + burtH.size + burtG.size} fjarlægð${u.lokud ? "" : " (útlínan lokaðist ekki — aðeins kassinn)"}` +
        (d.talning.hafnad.kross || d.talning.hafnad.skavegg ? ` · hafnað: ${d.talning.hafnad.kross} í krossi` : "")
    );
  } catch (err) {
    villa("hurdir", err, "engar hurðir");
  }
  if (stodvad()) return stoppa();

  // Á borðið (ein færsla — sögufærslan var tekin í upphafi): veggir sem skipt er út fara, nýjar línur koma.
  const nyjarObj = lokaNy.map((l) => nyrVeggur(l.p, { id: newId(), thykkt: l.t, tegund: l.tegund ?? "veggur", parentId: planId, greining: lota }));
  // Greiningin skilaði engu (brást): veggirnir sem fyrir eru standa — aldrei skipt út fyrir ekkert.
  const ekkertGreint = !lokaNy.some(erVeggTeg);
  if (ekkertGreint) skiptaIds.clear();
  useBoardStore.setState({ objects: replaceCrossingMarks([...bord().objects.filter((o) => !skiptaIds.has(o.id)), ...nyjarObj]), selectedIds: [] });

  // ── f) EI — textinn lesinn einu sinni (EI + SLT/BRSL) ──
  // Prófanir: localStorage `tp_sjalfvirkt_sleppa` = "ocr" sleppir textalestrinum (EI + SLT/BRSL) — stilling vikmarka á sekúndum.
  let sleppaOcr = false;
  try {
    sleppaOcr = localStorage.getItem("tp_sjalfvirkt_sleppa") === "ocr";
  } catch {
    sleppaOcr = false;
  }
  hefja("ei", "Les texta teikningarinnar (OCR)…");
  let texti: Awaited<ReturnType<typeof lesaTextaTeikningar>> | null = null;
  let eldveggir = 0;
  try {
    if (sleppaOcr) throw new Error("textalestri sleppt (tp_sjalfvirkt_sleppa = ocr)");
    // Textalesturinn (Tesseract) getur hangið (minnisleysi drap vinnuþráðinn — mælt 08.10.2026): tímaþak, og Stöðva virkar.
    texti = await medThaki(lesaTextaTeikningar(mynd()!, { medBlek: true, lodrett: true, onProgress: (msg, pr) => S().setja("ei", { texti: msg, pros: pr }) }), OCR_THAK_MS, stodvad, "textalesturinn");
    if (stodvad()) return stoppa();
    const ei = await eiUrTexta(mynd()!, texti);
    const midar = ei.midar.filter((x) => !x.reyk);
    if (!midar.length) ljuka("ei", ei.hits.length ? `${ei.hits.length} EI-merki, öll reykþéttar hurðir (EI-CS) — engir eldveggir` : "Engin EI-30 / EI-60 merki á teikningunni");
    else {
      // Veggir Agnars eru læstir á meðan svo EI festist aldrei á þá (og breyti þeim ekki).
      const objs = bord().objects.map((o) => (fastIds.has(o.id) ? { ...o, locked: true } : o));
      const b = beitaEi(objs, mynd()!, ei.midar, { seiling: 1.1 * dpm, sjalf: null, lota, nyttId: newId });
      const upph = new Map(bord().objects.map((o) => [o.id, o]));
      const ut = b.objects.map((o) => (fastIds.has(o.id) ? upph.get(o.id) ?? o : o));
      useBoardStore.setState({ objects: replaceCrossingMarks(ut), selectedIds: [] });
      eldveggir = b.eldveggir;
      talning.ei = { merki: ei.hits.length, eldveggir: b.eldveggir, breyttir: b.breyttir, lausir: b.festing.lausir.length };
      ljuka("ei", `${b.eldveggir} eldveggir á veggjum úr ${ei.hits.length} EI-merkjum` + (b.festing.lausir.length ? ` · ${b.festing.lausir.length} merki fundu engan vegg` : ""));
    }
  } catch (err) {
    villa("ei", err, "engir eldveggir");
  }
  if (stodvad()) return stoppa();

  // ── g) SLT / BRSL ──
  hefja("taeki");
  let taekiFj = 0;
  try {
    if (!texti) throw new Error("textinn var ekki lesinn");
    const { teikning } = await medThaki(sltBrslUrTexta(mynd()!, texti, (msg, pr) => S().setja("taeki", { texti: msg, pros: pr })), 3 * 60_000, stodvad, "endurlestur slöngukefla");
    let taeki = gogn?.taeki ?? null;
    let haedir = gogn?.haedir ?? [];
    try {
      const u = await saekjaUttekt(cid);
      taeki = u.taeki;
      haedir = u.haedir;
    } catch {
      /* eldri listinn */
    }
    const b = beitaSltBrsl(bord().objects, [teikning], { taeki, haedir, draegi: false });
    useBoardStore.setState({ objects: b.objects, selectedIds: [] });
    const brsl = b.samantekt.reduce((s, x) => s + x.brsl, 0), slt = b.samantekt.reduce((s, x) => s + x.slt, 0);
    const tengd = b.samantekt.reduce((s, x) => s + x.tengd.length, 0), fyrirT = b.samantekt.reduce((s, x) => s + x.fyrir, 0);
    taekiFj = brsl + slt;
    talning.taeki = { brsl, slt, tengd, fyrir: fyrirT };
    ljuka("taeki", brsl || slt ? `${brsl} BRSL · ${slt} SLT á táknin · ${tengd} tengd við tæki staðarins` + (fyrirT ? ` · ${fyrirT} áttu tæki fyrir` : "") : "Engin SLT / BRSL á teikningunni");
  } catch (err) {
    villa("taeki", err, "engin tæki sett");
  }
  if (stodvad()) return stoppa();

  // ── h) yfirlit og vistun ──
  const nyV = lokaNy.filter(erVeggTeg).length, nyG = lokaNy.filter((l) => l.tegund === "gler").length;
  const ht = talning.hreinsun as { sameinadir: number; stakir: number } | undefined;
  const yfirlit =
    `Fann ${nyV} veggi, ${hurdir.length} hurðir, ${nyG} gler, ${eldveggir} eldveggi, ${taekiFj} tæki. ` +
    `Hreinsun: ${ht?.sameinadir ?? 0} sameinaðir, ${ht?.stakir ?? 0} stakir fjarlægðir.` +
    (fastarH.length ? ` ${fastarH.length} veggir Agnars óbreyttir.` : "");
  S().set({ yfirlit });
  // Mælingin (dílar frummyndar) — prófanir bera hana saman við leiðréttingar Agnars.
  try {
    const p = mynd()!;
    const v = vorpunMyndar(p)!;
    const b = v.blad;
    const iFrum = (l: HLina): MaelLina => {
      const o: MaelLina = { p: l.p.map((n, i) => Math.round((i % 2 === 0 ? ((n - b.x) / b.width) * v.frum.b : ((n - b.y) / b.height) * v.frum.h) * 10) / 10), t: Math.round((l.t / b.width) * v.frum.b * 10) / 10 };
      if (l.tegund) o.tegund = l.tegund;
      return o;
    };
    S().set({
      maeling: {
        cid,
        haedId: t.haedId,
        frum: v.frum,
        skurdur: p.uttekt?.skurdur ?? null,
        skurdurFundinn,
        leid,
        hrar: hrar.map(iFrum),
        hreinsadar: hreinar.map(iFrum),
        hurdir: hurdir.map(iFrum),
        kandidatar: kandidatar.map((k) => ({ ...k, p: iFrum({ p: k.p, t: k.t }).p, t: iFrum({ p: k.p, t: k.t }).t })),
        lokalinur: veggirIFrum(bord().objects, p, v.frum, v.svaedi),
        fastar: fastarH.length,
        talning,
        ms: { ...ms, alls: Math.round(performance.now() - t0) },
      },
    });
  } catch (err) {
    console.warn("[sjálfvirkt] mæling", err);
  }
  console.info("[sjálfvirkt] " + JSON.stringify({ yfirlit, talning, ms }));
  if (ekkertGreint) {
    hefja("vista");
    ljuka("vista", "Veggjagreiningin skilaði engu — ekkert vistað, hæðin er óbreytt í úttektinni. Reyndu aftur eða „Greina veggi“.", "villa");
    S().set({ keyrir: false, vistun: "haett", vistunTexti: "Ekkert vistað — engir veggir greindust." });
    return;
  }
  await vistaStig(handLeidrett, deps, hefja, ljuka);
}

/** h) Vistun: óleiðrétt / áður sjálfvirk hæð vistast sjálfkrafa; leiðrétt hæð Agnars aðeins með „Bæta við nýju". */
async function vistaStig(
  handLeidrett: boolean,
  deps: SjalfvirktDeps,
  hefja: (id: SkrefId, texti?: string) => void,
  ljuka: (id: SkrefId, texti: string, stada?: "lokid" | "sleppt" | "villa") => void
) {
  const S = useSjalfvirkt.getState;
  hefja("vista");
  let leidrettAf: LeidrettAf = "sjalfvirkt";
  if (handLeidrett) {
    const svar = await new Promise<"baeta" | "haetta">((resolve) => {
      S().set({
        spurning: {
          texti: "Hæðin er leiðrétt í höndunum — Bæta við nýju / Hætta við",
          skyring: "Veggir Agnars eru óbreyttir á borðinu; „Bæta við nýju“ vistar aðeins það sem verkferlið bætti við þá. „Hætta við“ vistar ekkert.",
          svara: (s) => {
            S().set({ spurning: null });
            resolve(s);
          },
        },
      });
    });
    if (svar !== "baeta" || S().stodva) {
      ljuka("vista", "Ekkert vistað — leiðrétting Agnars óbreytt í úttektinni. Nýju línurnar eru á borðinu (⌘Z tekur þær).", "sleppt");
      S().set({ keyrir: false, vistun: "haett", vistunTexti: "Ekkert vistað." });
      return;
    }
    leidrettAf = "turbopaint";
  }
  const reyna = async () => {
    S().set({ vistun: "vistar", reynaAftur: null });
    S().setja("vista", { stada: "keyrir", texti: "Vista í úttekt…" });
    const r = await deps.vista({ leidrettAf });
    if (r.ok) {
      ljuka("vista", r.texti + (leidrettAf === "sjalfvirkt" ? " · merkt „sjálfvirkt“ í Teikningu" : ""));
      S().set({ keyrir: false, vistun: "vistad", vistunTexti: "Vistað í úttekt" + (leidrettAf === "sjalfvirkt" ? " (sjálfvirkt)" : "") + ". Teikning sækir hæðina þegar þú ferð þangað aftur." });
    } else {
      ljuka("vista", "Vistun brást: " + r.villa + " — ekkert glatað: borðið stendur, „Reyna aftur“ eða „Vista í úttekt“.", "villa");
      S().set({ keyrir: false, vistun: "villa", vistunTexti: "Vistun brást: " + r.villa, reynaAftur: () => void reyna() });
    }
  };
  await reyna();
}

