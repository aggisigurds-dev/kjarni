// „Vegghjálp" úr Búnaðargreiningu (Agnar 21.10.2026: „í búnaðargreiningarlestrinum að hann lesi EI60 í leiðinni og hurðarop — þá
// kannski auðveldara að fara síðan í veggjagreiningu"): vigur-PDF-lesturinn (slokkvitaeki .claude/skills/arnold … vigur.py) geymir EI-merki
// (úr textalaginu — nákvæm, enginn OCR) og hurðarop (hurðarbogar úr vigurteikningunni) í `bunadargreining.vegghjalp`:
//   { "<haed_id>": { ei: [{ t, x, y, ori }], hurdir: [{ hjor, a, b, breidd_m, blad }], pxm } }   — hnit = dílar FRUMMYNDAR (rammi blaðsins).
// Hér: lestur + varpa á borðið. EI-merkin fara sömu leið og OCR-merkin (EiMidi → beitaEi), hurðaropin eru tilbúin fyrir hurðagreiningu.

import type { EiMidi } from "./ei-festing";
import type { Bogi } from "./hurdabogar";
import { parseFirewallRating } from "./firewall-rating";
import { bladMyndar } from "./margar-haedir";
import { getSupabase } from "./supabase";
import type { ImageObject } from "./types";
import { bladIBordi, innanSvaedis } from "./uttekt";

export interface VegghjalpEi {
  t: string;
  x: number;
  y: number;
  /** v = lóðréttur texti (veggurinn þá líklegast lóðréttur) */
  ori?: "v" | "h";
}
export interface VegghjalpHurd {
  /** hjörin (miðja bogans) */
  hjor: [number, number];
  /** bogaendar — opið liggur eftir veggnum frá hjörunni að öðrum þeirra */
  a: [number, number];
  b: [number, number];
  breidd_m: number;
  /** hurðarblaðið fannst (staðfest) */
  blad?: boolean;
}
export interface VegghjalpHaed {
  ei: VegghjalpEi[];
  hurdir: VegghjalpHurd[];
  pxm: number | null;
}

const tala = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const punktur = (p: unknown): p is [number, number] => Array.isArray(p) && p.length >= 2 && tala(p[0]) && tala(p[1]);

/** JSON úr gagnagrunninum → hæð (rusl síast burt). null = ekkert nothæft. */
export function lesaVegghjalpHaed(x: unknown): VegghjalpHaed | null {
  if (!x || typeof x !== "object") return null;
  const o = x as { ei?: unknown; hurdir?: unknown; pxm?: unknown };
  const ei: VegghjalpEi[] = [];
  for (const e of Array.isArray(o.ei) ? o.ei : []) {
    const v = e as { t?: unknown; x?: unknown; y?: unknown; ori?: unknown };
    if (typeof v?.t === "string" && tala(v.x) && tala(v.y)) ei.push({ t: v.t, x: v.x, y: v.y, ori: v.ori === "v" ? "v" : "h" });
  }
  const hurdir: VegghjalpHurd[] = [];
  for (const h of Array.isArray(o.hurdir) ? o.hurdir : []) {
    const v = h as { hjor?: unknown; a?: unknown; b?: unknown; breidd_m?: unknown; blad?: unknown };
    if (punktur(v?.hjor) && punktur(v.a) && punktur(v.b) && tala(v.breidd_m)) {
      hurdir.push({ hjor: [v.hjor[0], v.hjor[1]], a: [v.a[0], v.a[1]], b: [v.b[0], v.b[1]], breidd_m: v.breidd_m, blad: v.blad === true });
    }
  }
  if (!ei.length && !hurdir.length) return null;
  return { ei, hurdir, pxm: tala(o.pxm) ? o.pxm : null };
}

/** EI-merkin sem borðshnit (sama snið og OCR-leiðin): „A-EI60" → EI60; EI90/120 og REIM falla (ekki okkar flokkar), EI-CS er hurð. Skorin mynd:
 * aðeins merki innan hlutans sem myndin sýnir. */
export function eiMidarUrVegghjalpi(vh: VegghjalpHaed, plan: ImageObject): EiMidi[] {
  const m = bladMyndar(plan);
  const b = bladIBordi(plan, m.frum, m.svaedi);
  const kx = b.width / m.frum.b;
  const ky = b.height / m.frum.h;
  const ut: EiMidi[] = [];
  for (const e of vh.ei) {
    const r = parseFirewallRating(e.t.replace(/^A-/i, ""));
    if (!r) continue;
    if (m.svaedi && !innanSvaedis(e, m.svaedi)) continue;
    ut.push({ x: b.x + e.x * kx, y: b.y + e.y * ky, lodrett: e.ori === "v", minutur: r.minutes, reyk: r.smoke });
  }
  return ut;
}

/** Hurðarop → hurðabogar (borðhnit) fyrir vinnaLinur: hjörin = miðja, annar bogendinn er blaðið lokað (eftir veggnum, u), hinn blaðið opið (n).
 * Vigur-lesturinn veit ekki hvor er hvor — báðar stefnur eru gefnar og hurðin verður aðeins þar sem veggur liggur að gatinu (krefjastVeggjar), svo
 * röng stefna fellur sjálf. Aðeins staðfestir bogar (blaðið fannst) eru geymdir, svo öll stig eru 1. */
export function hurdirBogarUrVegghjalpi(vh: VegghjalpHaed, plan: ImageObject): Bogi[] {
  const m = bladMyndar(plan);
  const b = bladIBordi(plan, m.frum, m.svaedi);
  const kx = b.width / m.frum.b;
  const ky = b.height / m.frum.h;
  const hnit = (p: [number, number]): [number, number] => [b.x + p[0] * kx, b.y + p[1] * ky];
  const ut: Bogi[] = [];
  for (const h of vh.hurdir) {
    if (!h.blad) continue;
    if (m.svaedi && !innanSvaedis({ x: h.hjor[0], y: h.hjor[1] }, m.svaedi)) continue;
    const c = hnit(h.hjor);
    const A = hnit(h.a);
    const B = hnit(h.b);
    const ra = Math.hypot(A[0] - c[0], A[1] - c[1]);
    const rb = Math.hypot(B[0] - c[0], B[1] - c[1]);
    const r = (ra + rb) / 2;
    if (!(r > 0)) continue;
    const ea: [number, number] = [(A[0] - c[0]) / ra, (A[1] - c[1]) / ra];
    const eb: [number, number] = [(B[0] - c[0]) / rb, (B[1] - c[1]) / rb];
    const stig = { thekja: 1, blad: 1, veggur: 1, tom: 1, stig: 1 };
    ut.push({ c, r, u: ea, n: eb, ...stig }, { c, r, u: eb, n: ea, ...stig });
  }
  return ut;
}

/** Vegghjálp þessarar hæðar úr Búnaðargreiningu félagsins (virk röð), eða null (engin greining / skönnun / engin hjálp). */
export async function saekjaVegghjalp(plan: ImageObject): Promise<VegghjalpHaed | null> {
  const t = plan.uttekt;
  const sb = getSupabase();
  if (!t?.companyId || !t.haedId || !sb) return null;
  const r = await sb.from("bunadargreining").select("vegghjalp").eq("company_id", t.companyId).is("fjarlaegt_at", null).limit(1);
  if (r.error) return null;
  const vh = ((r.data as { vegghjalp?: Record<string, unknown> | null }[] | null) ?? [])[0]?.vegghjalp;
  return vh ? lesaVegghjalpHaed(vh[t.haedId]) : null;
}
