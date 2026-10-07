// „Veggjavél (skrifstofutölvan)" í „Greina veggi" (Agnar 07.10.2026). Eigið veggjalíkan Slökkvitækis keyrir á
// skrifstofutölvunni um luna-bridge — sama leið og Designer-3D/Blender (slokkvitaeki 383):
//   1. TurboPaint setur röð í automation_triggers: workflow 'veggjavel', status 'bida',
//      gogn = { company_id, haed_id, image_url, skurdur, frum }  (dílar FRUMMYNDAR — sama kerfi og veggjaLinur);
//      vefurinn má aðeins setja inn og lesa (RLS), ekki uppfæra.
//   2. watcher.js á skrifstofutölvunni (á mínútu fresti) tekur hana; framvindan („Skrifstofutölvan greinir… 40 %")
//      stendur í `result` meðan unnið er; að lokum JSON { slod, veggir, gler, sek }.
//   3. `slod` = opinber JSON-skrá í turbopaint/veggjavel/<cid>/<haed>-<tími>.json: { linur: [{ p, t, tegund }] }.
//   4. Línurnar fara í borðhnit (eins og innflutningur hæðar, uttekt.ts bladIBordi) og inn í SAMA flæði og greiningin
//      í vafranum: Bæta við / Skipta út, ⌘Z tekur allt, „Eyða síðustu greiningu". Gler verður tegundin gler.

import { bladMyndar } from "./margar-haedir";
import type { VeggTegund } from "./teikning-veggir";
import type { ImageObject } from "./types";
import { bladIBordi, gilturSkurdur, type Svaedi } from "./uttekt";

export const VEGGJAVEL_WORKFLOW = "veggjavel";
/** Svari engin vél (röðin enn `bida`) innan þessa er það sagt skýrt. */
export const VEGGJAVEL_SVARAR_EKKI_MS = 2 * 60_000;
/** Annað verk í gangi á brúnni (t.d. Blender, 8–10 mín): beiðnin bíður — en ekki endalaust. */
export const VEGGJAVEL_HAMARK_MS = 20 * 60_000;
/** Eldri brúartölva (án verksins) hafnar stundum fyrst — skrifstofuvélin tekur við innan mínútu (watcher.js HAFNAD). */
export const VEGGJAVEL_HAFNAD_BID_MS = 3 * 60_000;

/** Lína veggjavélarinnar í dílum frummyndar. */
export type VelLina = { p: number[]; t: number; tegund: "veggur" | "gler" };

/** Beiðnin sem fer í automation_triggers.gogn. */
export type VeggjavelGogn = {
  company_id: number;
  haed_id: string;
  image_url: string;
  skurdur: Svaedi | null;
  frum: { b: number; h: number };
};

/** gogn beiðnar fyrir teikninguna — eða ástæða þess að vélin getur ekki greint hana. */
export function beidniGogn(plan: ImageObject, imageUrlHaedar?: string | null): { gogn: VeggjavelGogn } | { astaeda: string } {
  const blad = bladMyndar(plan, imageUrlHaedar ?? null, plan.uttekt?.companyId ?? null);
  if (!blad.imageUrl) return { astaeda: "Teikningin er ekki úr skjalasafninu (engin slóð blaðsins) — opnaðu hæðina úr úttektinni" };
  if (blad.companyId == null) return { astaeda: "Teikningin er ekki tengd stað — opnaðu hæðina úr úttektinni" };
  const haedId = plan.uttekt?.haedId || `mynd-${plan.id}`;
  const sk = gilturSkurdur(plan.uttekt?.skurdur ?? null);
  const sv = blad.svaedi;
  let skurdur: Svaedi | null = sk ?? sv ?? null;
  if (sk && sv) {
    // skorin mynd: aðeins sá hluti hússins sem myndin sýnir
    const x0 = Math.max(sk.x, sv.x), y0 = Math.max(sk.y, sv.y);
    const x1 = Math.min(sk.x + sk.w, sv.x + sv.w), y1 = Math.min(sk.y + sk.h, sv.y + sv.h);
    skurdur = x1 - x0 > 8 && y1 - y0 > 8 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : sv;
  }
  if (skurdur) skurdur = { x: Math.round(skurdur.x), y: Math.round(skurdur.y), w: Math.round(skurdur.w), h: Math.round(skurdur.h) };
  return { gogn: { company_id: blad.companyId, haed_id: haedId, image_url: blad.imageUrl, skurdur, frum: { b: blad.frum.b, h: blad.frum.h } } };
}

/** JSON veggjavélarinnar (fylki eða { linur }) → gildar línur. Rusl síast burt; allt sem er ekki gler er veggur. */
export function lesaVeggjavelJson(x: unknown): VelLina[] {
  const listi = Array.isArray(x) ? x : x && typeof x === "object" && Array.isArray((x as { linur?: unknown }).linur) ? (x as { linur: unknown[] }).linur : [];
  const ut: VelLina[] = [];
  for (const v of listi) {
    if (!v || typeof v !== "object") continue;
    const o = v as { p?: unknown; t?: unknown; tegund?: unknown };
    if (!Array.isArray(o.p) || o.p.length < 4 || !o.p.every((n) => typeof n === "number" && Number.isFinite(n))) continue;
    const p = (o.p as number[]).slice(0, o.p.length - (o.p.length % 2));
    let L = 0;
    for (let i = 2; i + 1 < p.length; i += 2) L += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
    if (L < 1) continue;
    ut.push({ p, t: Number(o.t) > 0 ? Number(o.t) : 1, tegund: o.tegund === "gler" ? "gler" : "veggur" });
  }
  return ut;
}

/** Línur (dílar frummyndar) → veggir í borðhnitum, á myndinni. Skorin mynd (`svaedi`): aðeins línur með miðju á hlutanum. */
export function velLinurIBord(
  linur: VelLina[],
  mynd: { x: number; y: number; width: number; height: number },
  frum: { b: number; h: number },
  svaedi?: Svaedi | null
): { p: number[]; t: number; tegund?: VeggTegund }[] {
  const b = bladIBordi(mynd, frum, svaedi);
  const kx = b.width / frum.b, ky = b.height / frum.h;
  const sv = gilturSkurdur(svaedi);
  const ut: { p: number[]; t: number; tegund?: VeggTegund }[] = [];
  for (const l of linur) {
    if (sv) {
      const n = l.p.length / 2;
      let mx = 0, my = 0;
      for (let i = 0; i < l.p.length; i += 2) { mx += l.p[i]; my += l.p[i + 1]; }
      mx /= n; my /= n;
      if (mx < sv.x || my < sv.y || mx > sv.x + sv.w || my > sv.y + sv.h) continue;
    }
    const v: { p: number[]; t: number; tegund?: VeggTegund } = {
      p: l.p.map((n, i) => (i % 2 === 0 ? b.x + n * kx : b.y + n * ky)),
      t: Math.max(1, l.t * (kx + ky) / 2),
    };
    if (l.tegund === "gler") v.tegund = "gler";
    ut.push(v);
  }
  return ut;
}

/** Lokasvar brúarinnar í `result`: NIDURSTADA-JSON. null ef ekki (enn framvindutexti eða villa). */
export function lesaNidurstodu(result: string | null | undefined): { slod: string; veggir: number; gler: number; sek: number | null } | null {
  const t = String(result || "");
  const a = t.indexOf("{"), e = t.lastIndexOf("}");
  if (a < 0 || e <= a) return null;
  try {
    const j = JSON.parse(t.slice(a, e + 1)) as { slod?: unknown; veggir?: unknown; gler?: unknown; sek?: unknown };
    if (typeof j.slod !== "string" || !j.slod) return null;
    return { slod: j.slod, veggir: Number(j.veggir) || 0, gler: Number(j.gler) || 0, sek: Number.isFinite(Number(j.sek)) ? Number(j.sek) : null };
  } catch {
    return null;
  }
}

/** Niðurstöðuskráin verður að liggja í turbopaint/veggjavel/ í Supabase verkefnisins (vörn: `result` er texti). */
export function leyfdSlod(slod: string, supabaseUrl: string): boolean {
  return slod.startsWith(supabaseUrl.replace(/\/+$/, "") + "/storage/v1/object/public/turbopaint/veggjavel/");
}

/** Prósenta í framvindutexta („Skrifstofutölvan greinir… 40 % — …"). */
export function framvinduProsenta(t: string | null | undefined): number | null {
  const m = /(\d{1,3})\s*%/.exec(String(t || ""));
  return m ? Math.min(100, Number(m[1])) : null;
}

export type BeidniRod = { status: string; result?: string | null; requested_at?: string | null };

export type VelStada =
  | { s: "bida"; upptekin: string | null; hafnad: boolean }
  | { s: "vinnur"; texti: string; pros: number | null }
  | { s: "lokid"; nid: NonNullable<ReturnType<typeof lesaNidurstodu>> }
  | { s: "villa"; texti: string };

/** Staða beiðnar á skjánum út frá röðinni og tímanum. `byrjad` = hvenær beiðnin var send (ms), `hafnadFra` = hvenær
 * höfnun eldri vélar sást fyrst (ms, eða null), `upptekin` = annað verk í gangi á brúnni (heiti, eða null). */
export function metaStodu(rod: BeidniRod, o: { nu: number; byrjad: number; hafnadFra: number | null; upptekin: string | null }): VelStada {
  const st = rod.status === "pending" ? "bida" : rod.status;
  const bid = o.nu - o.byrjad;
  if (st === "done") {
    const nid = lesaNidurstodu(rod.result);
    return nid ? { s: "lokid", nid } : { s: "villa", texti: "Veggjavélin skilaði engri niðurstöðu" + (rod.result ? ` (${String(rod.result).slice(0, 160)})` : "") };
  }
  if (st === "error") {
    const r = String(rod.result || "");
    if (/^Unknown workflow/i.test(r) && o.nu - (o.hafnadFra ?? o.nu) < VEGGJAVEL_HAFNAD_BID_MS) return { s: "bida", upptekin: null, hafnad: true };
    if (/^Unknown workflow/i.test(r)) return { s: "villa", texti: "Engin brúartölva með veggjavélina tók beiðnina — skrifstofutölvan þarf að vera í gangi" };
    const m = /Veggjavélin tókst ekki:\s*([\s\S]*)$/.exec(r);
    return { s: "villa", texti: m ? m[1].split(" | ")[0].trim() : r.slice(0, 220) || "óþekkt villa" };
  }
  if (st === "running") {
    if (bid > VEGGJAVEL_HAMARK_MS) return { s: "villa", texti: "Skrifstofutölvan kláraði ekki á 20 mínútum — reyndu aftur" };
    const texti = String(rod.result || "").trim() || "Skrifstofutölvan er byrjuð…";
    return { s: "vinnur", texti, pros: framvinduProsenta(texti) };
  }
  // bida
  if (bid > VEGGJAVEL_HAMARK_MS) return { s: "villa", texti: "Ekkert svar frá skrifstofutölvunni í 20 mínútur — er hún í gangi?" };
  if (bid > VEGGJAVEL_SVARAR_EKKI_MS && !o.upptekin) return { s: "villa", texti: "Skrifstofutölvan svarar ekki — er hún í gangi?" };
  return { s: "bida", upptekin: o.upptekin, hafnad: false };
}

/** dd/mm/yyyy kl. hh:mm */
export function dagsTexti(ms: number): string {
  const d = new Date(ms), t = (n: number) => String(n).padStart(2, "0");
  return `${t(d.getDate())}/${t(d.getMonth() + 1)}/${d.getFullYear()} kl. ${t(d.getHours())}:${t(d.getMinutes())}`;
}

/** Síðasta niðurstaða vélarinnar fyrir hæðina í þessari lotu (til samanburðar við greininguna í vafranum). */
export type VelMinni = { id: number; kl: number; linur: VelLina[]; veggir: number; gler: number; sek: number | null };
const minni = new Map<string, VelMinni>();
export const velMinniLykill = (g: Pick<VeggjavelGogn, "company_id" | "haed_id" | "image_url">) => `${g.company_id}:${g.haed_id}:${g.image_url}`;
export const velMinni = {
  fa: (k: string) => minni.get(k) ?? null,
  setja: (k: string, v: VelMinni) => void minni.set(k, v),
  hreinsa: () => minni.clear(),
};
