/* Sameiginleg gögn og vistun Skráningar fyrir síma (Vinna og Starfsmannahamur): tegundir, starfsmaður, nýr punktur,
 * myndir og biðröð án nets. Flutt óbreytt úr vinna/VinnaClient.tsx 26.11.2026 svo báðir skjáirnir vistuðu eins. */

import { sb, minnkaMynd, hladaUpp } from "./sb";
import { bidrod, erNetvilla } from "./bidrod";

export type Verk = { id: number; heiti: string; heimilisfang: string | null; virkt: boolean };
export type Teikning = { id: number; verk_id: number; heiti: string; haed: string | null; mynd_path: string | null; breidd_px: number | null; haed_px: number | null; rod: number; skurdur: unknown };
export type Flokkur = { id: number; verk_id: number | null; heiti: string; tegund: string; rod: number };
export type Atridi = { id: number; verk_id: number | null; atridi: string; hopur: string | null; rod: number };
export type Skraning = { id: number; verk_id: number; radnr: number; teikning_id: number | null; x_px: number | null; y_px: number | null; flokkur_id: number | null; starfsmadur_id: number | null; stofnad_af: number | null; stada: string; lysing: string | null; framkvaemt_fra: string | null; lokid_at: string | null; created_at: string; eytt: boolean };
export type Mynd = { id: number; skraning_id: number; path: string; stig: string; rod: number; created_at: string };
export type Svar = { skraning_id: number; atridi_id: number; hakad: boolean };
export type Starfsm = { id: number; numer: number | null; nafn: string | null; virkur: boolean };
export type Atburdur = { id: number; hvad: string; gogn: Record<string, unknown> | null; hver: number | null; hvenaer: string };

/** Númer starfsmanns sem síminn man („hver er við vélina“). */
export const LS_STARFSM = "skr_starfsmadur";
export const isoDay = () => new Date().toISOString().slice(0, 10);

export async function starfsmId(numer: string): Promise<number | null> {
  const n = Number(numer); if (!n) return null;
  const s = sb();
  const r = await s.from("skr_starfsmenn").select("id").eq("numer", n).maybeSingle();
  if (r.data) return r.data.id as number;
  const ins = await s.from("skr_starfsmenn").insert({ numer: n, nafn: `Starfsmaður ${n}` }).select("id").single();
  return ins.data ? (ins.data.id as number) : null;
}

/** Vistar nýjan punkt (skráning + gátlisti + myndir + logg). Kastar við villu — kallandi ákveður hvort hann fer í biðröð. */
export async function vistaNyjanPunkt(p: { verk_id: number; teikning_id: number; x_px: number; y_px: number; flokkur_id: number; efni: number[]; lysing: string | null; starfsm: string; myndir: File[]; radnr: number }) {
  const s = sb();
  const af = await starfsmId(p.starfsm);
  const setja = (radnr: number) => s.from("skr_skraningar").insert({
    verk_id: p.verk_id, radnr, teikning_id: p.teikning_id, x_px: p.x_px, y_px: p.y_px, flokkur_id: p.flokkur_id, starfsmadur_id: af, stofnad_af: af,
    stada: "created", lysing: p.lysing, framkvaemt_fra: isoDay(), abyrgd_id: 1,
  }).select("id").single();
  let ins = await setja(p.radnr);
  for (let reynt = 0; ins.error && /duplicate|23505|unique/i.test(ins.error.message) && reynt < 3; reynt++) {
    // annar starfsmaður tók númerið á sömu stundu — næsta laust úr grunni
    ins = await setja(await naestaRadnrUrGrunni(p.verk_id));
  }
  if (ins.error) throw new Error(ins.error.message);
  const id = ins.data.id as number;
  if (p.efni.length) {
    const r = await s.from("skr_gatlisti_svor").insert(p.efni.map((atridi_id) => ({ skraning_id: id, atridi_id, hakad: true, hakad_af: af, hakad_at: new Date().toISOString() })));
    if (r.error) throw new Error(r.error.message);
  }
  await vistaMyndir(p.verk_id, id, p.myndir, "fyrir", af);
  await s.from("skr_atburdir").insert({ skraning_id: id, hvad: "stofnad", hver: af, gogn: { flokkur: p.flokkur_id, efni: p.efni, myndir: p.myndir.length } });
  return id;
}

/** Sendir biðröðina (punkta sem urðu til án nets). Raðnúmer er úthlutað við sendingu. Skilar fjölda sem tókst. */
export async function sendaBidrod(naestaRadnr: (verkId: number) => Promise<number>): Promise<{ sent: number; eftir: number }> {
  const oll = await bidrod.oll();
  let sent = 0;
  for (const b of oll) {
    try {
      const radnr = await naestaRadnr(b.verk_id);
      await vistaNyjanPunkt({ verk_id: b.verk_id, teikning_id: b.teikning_id, x_px: b.x_px, y_px: b.y_px, flokkur_id: b.flokkur_id, efni: b.efni, lysing: b.lysing, starfsm: b.starfsm,
        myndir: b.myndir.map((m) => new File([m.blob], m.name, { type: m.blob.type || "image/jpeg", lastModified: m.lastModified })), radnr });
      await bidrod.eyda(b.id); sent++;
    } catch (e) {
      if (!erNetvilla(e)) { await bidrod.setja({ ...b, villa: String((e as Error).message || e) }); }
      else break; // enn sambandslaust — reyna seinna
    }
  }
  return { sent, eftir: await bidrod.fjoldi() };
}

export async function naestaRadnrUrGrunni(verkId: number): Promise<number> {
  const r = await sb().from("skr_skraningar").select("radnr").eq("verk_id", verkId).order("radnr", { ascending: false }).limit(1);
  if (r.error) throw new Error(r.error.message);
  return ((r.data?.[0]?.radnr as number) || 0) + 1;
}

export async function vistaMyndir(verkId: number, skraningId: number, files: File[], stig: "fyrir" | "eftir", af: number | null) {
  const s = sb();
  let rod = 0;
  for (const f of files) {
    const { blob, w, h } = await minnkaMynd(f);
    const path = `verk/${verkId}/skr/${skraningId}/${stig}-${Date.now()}-${rod}.jpg`;
    await hladaUpp(path, blob, "image/jpeg");
    const r = await s.from("skr_myndir").insert({ skraning_id: skraningId, path, stig, breidd: w, haed: h, af, rod: rod++, tekin_at: new Date(f.lastModified || Date.now()).toISOString() });
    if (r.error) throw new Error(r.error.message);
  }
}
