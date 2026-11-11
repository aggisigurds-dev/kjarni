"use client";

/* Stöðuskýrsla (11.11.2026): staða verks per hæð og deild (stúku) með tölum og prósentum, og samanburður við upprunalega
 * útboðið — allt reiknað úr skráningunum (skr_skraningar, greining í ajour_gogn) og LEIÐRÉTTANLEGT: markmið, klárað, gildandi
 * magn, „stök verk per einingu" og athugasemdir má yfirskrifa og vista (skr_skyrslur.gogn). Tómur reitur = reiknað gildi.
 *   /kjarni/skraning/skyrsla[?verk=ID]
 * Einingar (Agnar 11.11.2026): Ajour telur STÖK verk; tvö stök verk = ein lokun í tilboðinu — nema gólfgöt (eitt verk = ein þétting).
 * Sjálfgefin markmið eru sama aðferð og á Landspítalasíðu hubsins (brunaholf/js/nlsh-sections.js, hopStada): 6H = það sem er
 * klárað; 5H = sami hópur á sömu deild á 6H (loftræsting kvörðuð við Miro-talningu); milliloft 110 á deild á 4H og 5H.
 * Skrif: aðeins skr_skyrslur, við „Vista". Skráningum er ekki breytt.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { sb } from "../lib/sb";

type Verk = { id: number; heiti: string };
type Flokkur = { id: number; heiti: string };
type Skr = { flokkur_id: number | null; teikning_id: number | null; stada: string; haed: string | null; deild: string | null };
type StadaBr = { markmid?: number; klarad?: number; ath?: string };
type UtbodBr = { magn?: number; per?: number; lokid?: number; ath?: string };
type Gogn = { an_staerda?: boolean; aukaverk_med?: boolean; heiti?: string; dags?: string; inngangur?: string; lok?: string; stada?: Record<string, StadaBr>; utbod?: Record<string, UtbodBr> };

const HAEDIR = ["6H", "5H", "4H"], DEILDIR = ["S1", "S2", "S4", "S5", "—"];   // „—" = skráningar á hæðinni sem skiptast ekki á deild (rafmagn á sérteikningum)
const HOPAR: [string, string, RegExp][] = [["Loft", "Loftræsting", /^Loft/i], ["Stál", "Stálrör", /^Stál/i], ["Plast", "Plaströr", /^Plast/i], ["Gólf", "Milliloft", /^Gólf/i], ["Raufar", "Raufar við kantaða stokka", /^Raufar/i], ["Rafmagn", "Rafmagn", /^Raf/i]];
/** Hópar án reiknaðs markmiðs: þar er prósenta aðeins sýnd ef markmið er slegið inn. */
const AN_MARKMIDS = new Set(["Raufar"]);
const RAF_MARK = 104;                                    // rafmagnsgöt: 104 stök verk á hverja deild á 5H og 6H (Agnar 11.11.2026)
/** Aukaverk: skráningar á teikningu sem heitir „… Viðbótarverkefni" í Ajour — sýnd sér, utan stöðu og (sjálfgefið) útboðssamanburðar. */
const AUKA_RE = /vi[ðd]b[óo]tarverk|aukaverk/i;
const GOLF_MARK = 110;                                   // rúmlega 100 gólfgöt á deild á 4H og 5H (eitt verk á gat)
const MIRO_LOFT: Record<string, number> = { vidmid: 272, S1: 230, S2: 244 };   // Miro-talning lofts: 6H S2 viðmið; 5H S1 og S2 í stökum verkum
/** Upprunalega útboðsblaðið (mynd frá Agnari 11.11.2026). per = stök verk í Ajour per einingu tilboðs. */
const UTBOD: { nr: string; heiti: string; ein: string; magn: number; per: number | null; re: RegExp | null; kafli?: string }[] = [
  { nr: "1.1", heiti: "Ø100-150", ein: "stk", magn: 50, per: 1, re: null, kafli: "1 Frágangur lagnagata í hæðaskilum" },
  { nr: "1.2", heiti: "Ø160-200", ein: "stk", magn: 100, per: 1, re: /^Gólf/i },
  { nr: "1.3", heiti: "Ø210-300", ein: "stk", magn: 25, per: 1, re: null },
  { nr: "2.1", heiti: "Ø20-34 plaströr", ein: "stk", magn: 600, per: 2, re: /^Plast Ø20-34/i, kafli: "2 Frágangur lagnagata í gegnum létta veggi" },
  { nr: "2.2", heiti: "Ø35-50 plaströr með eldv. kraga", ein: "stk", magn: 600, per: 2, re: /^Plast Ø35-50/i },
  { nr: "2.3", heiti: "Ø75-100 plaströr", ein: "stk", magn: 100, per: 2, re: /^Plast Ø75-100/i },
  { nr: "2.4", heiti: "Ø15-35 stálrör", ein: "stk", magn: 800, per: 2, re: /^Stál Ø15-35/i },
  { nr: "2.5", heiti: "Ø40-50 stálrör", ein: "stk", magn: 1100, per: 2, re: /^Stál Ø40-50/i },
  { nr: "2.6", heiti: "Ø75-110 stálrör", ein: "stk", magn: 350, per: 2, re: /^Stál Ø75-110/i },
  { nr: "2.7", heiti: "Ø110-160 stálrör", ein: "stk", magn: 100, per: 2, re: /^Stál Ø110-160/i },
  { nr: "2.8", heiti: "Ø125-160 loftstokkar", ein: "stk", magn: 600, per: 2, re: /^Loft Ø125-160/i },
  { nr: "2.9", heiti: "Ø200-315 loftstokkar", ein: "stk", magn: 600, per: 2, re: /^Loft Ø200-315/i },
  { nr: "2.10", heiti: "Ø400-630 loftstokkar", ein: "stk", magn: 109, per: 2, re: /^Loft Ø400-630/i },
  { nr: "2.11", heiti: "Frágangur raufa meðfram köntuðum stokkum", ein: "m", magn: 102, per: null, re: /^Raufar/i },
  { nr: "3.1", heiti: "Lagnagöt með bruna-, reyk- og hljóðþéttingu", ein: "stk", magn: 768, per: 2, re: /^Raf/i, kafli: "3 Raflagnir — göt, raufar, þéttingar" },
];
const num = (n: number, aukast = 0) => { const [h, b] = Math.abs(n).toFixed(aukast).split("."); return (n < 0 ? "−" : "") + h.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (b && +b ? "," + b : ""); };
const pros = (a: number, b: number) => (b > 0 ? Math.round((100 * a) / b) : 0);
const dmy = (d: string) => (d ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : "");

/** Talnareitur sem má yfirskrifa: tómt = reiknað gildi (sýnt sem placeholder); breytt gildi er merkt. */
function Tala({ gildi, reiknad, onChange, aukast = 0 }: { gildi: number | undefined; reiknad: number | null; onChange: (v: number | undefined) => void; aukast?: number }) {
  return (
    <span className={`sk-tala${gildi !== undefined ? " br" : ""}`}>
      <input type="number" inputMode="decimal" step={aukast ? 0.5 : 1} value={gildi ?? ""} placeholder={reiknad == null ? "—" : num(reiknad, aukast)} onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))} aria-label="Leiðrétt gildi" />
      <b className="sk-prent">{gildi !== undefined ? num(gildi, aukast) : reiknad == null ? "—" : num(reiknad, aukast)}</b>
    </span>
  );
}

export default function SkyrslaClient() {
  const [verk, setVerk] = useState<Verk | null>(null);
  const [flokkar, setFlokkar] = useState<Flokkur[]>([]);
  const [skr, setSkr] = useState<Skr[]>([]);
  const [aukaTeikn, setAukaTeikn] = useState<Map<number, string>>(new Map()); // teikningar aukaverka: id → heiti
  const [teiknHaed, setTeiknHaed] = useState<Map<number, string>>(new Map()); // hæð úr heiti teikningar („6H 2S-1S Rafmagnsþéttingar")
  const [skyrslaId, setSkyrslaId] = useState<number | null>(null);
  const [gogn, setGogn] = useState<Gogn>({});
  const [ovistad, setOvistad] = useState(false);
  const [stadaTexti, setStadaTexti] = useState("Sæki skráningar…");
  const [villa, setVilla] = useState("");

  useEffect(() => {
    let lifir = true;
    (async () => {
      try {
        const s = sb(), vid = Number(new URLSearchParams(window.location.search).get("verk")) || 0;
        const v = vid ? await s.from("skr_verk").select("id,heiti").eq("id", vid).single() : await s.from("skr_verk").select("id,heiti").eq("eytt", false).ilike("heiti", "%gatakort%").order("id").limit(1).single();
        if (v.error || !v.data) throw new Error(v.error?.message || "Ekkert verk fannst");
        const vk = v.data as Verk;
        const [f, sk, tk] = await Promise.all([
          s.from("skr_flokkar").select("id,heiti").or(`verk_id.eq.${vk.id},verk_id.is.null`),
          s.from("skr_skyrslur").select("id,gogn").eq("verk_id", vk.id).eq("eytt", false).order("id", { ascending: false }).limit(1),
          s.from("skr_teikningar").select("id,heiti").eq("verk_id", vk.id).eq("eytt", false),
        ]);
        if (f.error) throw new Error(f.error.message);
        const allt: Skr[] = [];
        for (let i = 0; ; i += 1000) {
          const r = await s.from("skr_skraningar").select("flokkur_id,teikning_id,stada,haed:ajour_gogn->>haed,deild:ajour_gogn->>deild").eq("verk_id", vk.id).eq("eytt", false).order("id").range(i, i + 999);
          if (r.error) throw new Error(r.error.message);
          allt.push(...(r.data as unknown as Skr[]));
          if (lifir) setStadaTexti(`Sæki skráningar… ${num(allt.length)}`);
          if (!r.data || r.data.length < 1000) break;
        }
        if (!lifir) return;
        setVerk(vk); setFlokkar(f.data as Flokkur[]); setSkr(allt);
        setTeiknHaed(new Map(((tk.data || []) as { id: number; heiti: string }[]).flatMap((t) => { const m = /^\s*([456])\s*H/i.exec(t.heiti); return m ? [[t.id, `${m[1]}H`] as [number, string]] : []; })));
        setAukaTeikn(new Map(((tk.data || []) as { id: number; heiti: string }[]).filter((t) => AUKA_RE.test(t.heiti)).map((t) => [t.id, t.heiti] as [number, string])));
        const row = sk.data?.[0] as { id: number; gogn: Gogn } | undefined;
        if (row) { setSkyrslaId(row.id); setGogn(row.gogn || {}); }
        setStadaTexti("");
      } catch (e) { if (lifir) { setVilla(e instanceof Error ? e.message : String(e)); setStadaTexti(""); } }
    })();
    return () => { lifir = false; };
  }, []);

  const heitiAf = useMemo(() => new Map(flokkar.map((f) => [f.id, f.heiti])), [flokkar]);
  /** Talning per hæð|deild|hópur og per flokk (allt verkið). */
  const taln = useMemo(() => {
    const hd = new Map<string, { done: number; open: number }>(), fl = new Map<string, { done: number; open: number }>(), st = new Map<string, { done: number; open: number }>(), auka = new Map<string, { done: number; open: number }>();
    let utan = 0, utanDone = 0;
    for (const s of skr) {
      const h = (s.flokkur_id != null && heitiAf.get(s.flokkur_id)) || "", done = s.stada === "done";
      if (s.teikning_id != null && aukaTeikn.has(s.teikning_id)) {   // aukaverk: talin sér; aðeins með í flokkatalningu (útboð) ef hakað er við
        const a = auka.get(h) || { done: 0, open: 0 }; if (done) a.done++; else a.open++; auka.set(h, a);
        if (!gogn.aukaverk_med) continue;
      }
      const f = fl.get(h) || { done: 0, open: 0 }; if (done) f.done++; else f.open++; fl.set(h, f);
      const hop = HOPAR.find((x) => x[2].test(h));
      const haed = s.haed || (s.teikning_id != null ? teiknHaed.get(s.teikning_id) : undefined);
      if (!haed || (!s.deild && !hop)) { utan++; if (done) utanDone++; continue; }
      if (!hop) continue;
      const dd = s.deild || "—";
      const k = `${haed}|${dd}|${hop[0]}`, x = hd.get(k) || { done: 0, open: 0 }; if (done) x.done++; else x.open++; hd.set(k, x);
      const k2 = `${haed}|${dd}|${h}`, y = st.get(k2) || { done: 0, open: 0 }; if (done) y.done++; else y.open++; st.set(k2, y);
    }
    return { hd, fl, st, auka, utan, utanDone };
  }, [skr, heitiAf, teiknHaed, aukaTeikn, gogn.aukaverk_med]);

  /** Sjálfgefið markmið hóps (sama aðferð og Landspítalasíða hubsins). */
  const markmidReiknad = useCallback((haed: string, deild: string, hop: string): number | null => {
    if (deild === "—" || AN_MARKMIDS.has(hop)) return null;
    const t = (h: string, d: string, k: string) => taln.hd.get(`${h}|${d}|${k}`) || { done: 0, open: 0 };
    const x = t(haed, deild, hop);
    let mark: number;
    if (hop === "Gólf") mark = haed === "6H" ? 0 : GOLF_MARK;
    else if (hop === "Rafmagn") mark = haed === "4H" ? 0 : RAF_MARK;
    else if (haed === "4H") mark = 0;
    else if (haed === "6H") mark = x.done;
    else {
      const ref = t("6H", deild, hop); let studull = 1;
      if (hop === "Loft") {
        const l6 = (d: string) => t("6H", d, "Loft").done, kv = l6("S2") ? l6("S2") / MIRO_LOFT.vidmid : 1;
        const fw = (d: string) => (l6(d) ? Math.min(1, (MIRO_LOFT[d] * kv) / l6(d)) : 1);
        studull = MIRO_LOFT[deild] ? fw(deild) : (fw("S1") + fw("S2")) / 2;
      }
      mark = Math.round((ref.done + ref.open) * studull);
    }
    return Math.max(mark, x.done + x.open);
  }, [taln]);

  const radir = useMemo(() => HAEDIR.map((haed) => ({
    haed,
    deildir: DEILDIR.map((deild) => ({
      deild,
      hopar: HOPAR.map(([k, nafn]) => {
        const x = taln.hd.get(`${haed}|${deild}|${k}`) || { done: 0, open: 0 }, lykill = `${haed}|${deild}|${k}`, br = gogn.stada?.[lykill] || {};
        const markR = markmidReiknad(haed, deild, k), mark = br.markmid ?? markR, klar = br.klarad ?? x.done;
        const prosenta = mark == null ? null : pros(Math.min(klar, Math.max(mark, klar)), Math.max(mark, klar));
        // stærðarflokkar hópsins á þessari deild, með sama flokki á 6. hæð sem viðmið (aðeins til upplýsingar)
        const staerdir = flokkar.filter((f) => HOPAR.find((y) => y[0] === k)![2].test(f.heiti)).map((f) => { const a = taln.st.get(`${haed}|${deild}|${f.heiti}`) || { done: 0, open: 0 }, r6 = taln.st.get(`6H|${deild}|${f.heiti}`) || { done: 0, open: 0 }; return { heiti: f.heiti.replace(/^(Loft|Stál|Plast|Gólf)\s*/i, "").replace(/\s*L[Vv]\b.*$/, "").trim() || f.heiti, done: a.done, open: a.open, vidmid: haed === "5H" && markR != null ? r6.done + r6.open : 0 }; }).filter((z) => z.done + z.open + z.vidmid > 0).sort((a, b) => (parseInt(a.heiti.replace(/^\D+/, ""), 10) || 0) - (parseInt(b.heiti.replace(/^\D+/, ""), 10) || 0));
        return { k, nafn, lykill, done: x.done, open: x.open, markR, mark, klar, prosenta, br, staerdir: staerdir.length > 1 ? staerdir : [] };
      }).filter((h) => (h.mark ?? 0) > 0 || h.done + h.open > 0),
    })),
  })), [taln, gogn.stada, markmidReiknad, flokkar]);
  /** Samtala: aðeins línur með markmið (reiknað eða innslegið) teljast, svo heildarprósentan breytist ekki við hópa án markmiðs. */
  const summa = (hs: { klar: number; mark: number | null }[]) => hs.reduce<{ klar: number; mark: number }>((a, h) => (h.mark == null ? a : { klar: a.klar + Math.min(h.klar, Math.max(h.mark, h.klar)), mark: a.mark + Math.max(h.mark, h.klar) }), { klar: 0, mark: 0 });
  const alls = summa(radir.flatMap((r) => r.deildir.flatMap((d) => d.hopar)));

  const utbod = useMemo(() => UTBOD.map((u) => {
    let stok = 0, opid = 0;
    if (u.re) for (const [h, v] of taln.fl) if (u.re.test(h)) { stok += v.done; opid += v.open; }
    const br = gogn.utbod?.[u.nr] || {}, per = br.per ?? u.per, magn = br.magn ?? u.magn;
    const lokidR = per ? stok / per : null, lokid = br.lokid ?? lokidR;
    return { ...u, magn0: u.magn, per0: u.per, stok, opid, br, per, magn, lokidR, lokid };
  }), [taln, gogn.utbod]);
  const utanUtbods = useMemo(() => { let n = 0; const nofn: string[] = []; for (const [h, v] of taln.fl) if (!UTBOD.some((u) => u.re && u.re.test(h))) { n += v.done; if (v.done) nofn.push(`${h || "(enginn flokkur)"} ${v.done}`); } return { n, nofn }; }, [taln]);

  const aukaRadir = useMemo(() => { const rod = (h: string) => { const i = HOPAR.findIndex((x) => x[2].test(h)); return i < 0 ? HOPAR.length : i; }; return [...taln.auka].map(([heiti, v]) => ({ heiti: heiti || "(enginn flokkur)", hopur: HOPAR.find((x) => x[2].test(heiti))?.[1] || "Annað", rod: rod(heiti), ...v })).sort((a, b) => a.rod - b.rod || a.heiti.localeCompare(b.heiti, "is")); }, [taln]);
  const aukaAlls = aukaRadir.reduce((a, r) => ({ done: a.done + r.done, open: a.open + r.open }), { done: 0, open: 0 });

  const breytaStodu = (lykill: string, b: StadaBr) => { setGogn((g) => { const n = { ...(g.stada?.[lykill] || {}), ...b }; (Object.keys(n) as (keyof StadaBr)[]).forEach((k) => { if (n[k] === undefined || n[k] === "") delete n[k]; }); const st = { ...(g.stada || {}) }; if (Object.keys(n).length) st[lykill] = n; else delete st[lykill]; return { ...g, stada: st }; }); setOvistad(true); };
  const breytaUtbodi = (nr: string, b: UtbodBr) => { setGogn((g) => { const n = { ...(g.utbod?.[nr] || {}), ...b }; (Object.keys(n) as (keyof UtbodBr)[]).forEach((k) => { if (n[k] === undefined || n[k] === "") delete n[k]; }); const ut = { ...(g.utbod || {}) }; if (Object.keys(n).length) ut[nr] = n; else delete ut[nr]; return { ...g, utbod: ut }; }); setOvistad(true); };
  const breyta = (b: Partial<Gogn>) => { setGogn((g) => ({ ...g, ...b })); setOvistad(true); };
  const vista = async () => {
    if (!verk) return; setVilla("");
    const r = skyrslaId ? await sb().from("skr_skyrslur").update({ gogn, heiti: gogn.heiti || "Stöðuskýrsla" }).eq("id", skyrslaId).select("id").single() : await sb().from("skr_skyrslur").insert({ verk_id: verk.id, gogn, heiti: gogn.heiti || "Stöðuskýrsla" }).select("id").single();
    if (r.error) { setVilla(r.error.message); return; }
    if (r.data && (r.data as { id?: number }).id) setSkyrslaId((r.data as { id: number }).id);
    setOvistad(false);
  };
  const nBr = Object.keys(gogn.stada || {}).length + Object.keys(gogn.utbod || {}).length;

  if (stadaTexti) return <p className="sk-hl">{stadaTexti}</p>;
  if (villa && !verk) return <p className="sk-hl">Villa: {villa}</p>;
  return (
    <div className="sk">
      <div className="sk-stika">
        <span>{ovistad ? "Óvistaðar breytingar" : skyrslaId ? "Vistað" : "Ekkert vistað enn"} · {nBr} {nBr === 1 ? "leiðrétt lína" : "leiðréttar línur"}</span>
        <button type="button" onClick={vista} disabled={!ovistad}>Vista</button>
        <label className="sk-val"><input type="checkbox" checked={!gogn.an_staerda} onChange={(e) => breyta({ an_staerda: !e.target.checked })} /> Sýna stærðir</label>
        <button type="button" onClick={() => window.print()}>Prenta / PDF</button>
        <button type="button" onClick={() => { if (nBr && window.confirm("Hreinsa allar leiðréttingar á tölum? Textar haldast. Breytingin vistast ekki fyrr en þú velur Vista.")) breyta({ stada: {}, utbod: {} }); }} disabled={!nBr}>Hreinsa leiðréttingar</button>
        {villa && <em>Villa: {villa}</em>}
      </div>

      <header className="sk-haus">
        <input className="sk-titill" value={gogn.heiti ?? "Brunaþéttingar — staða verks"} onChange={(e) => breyta({ heiti: e.target.value })} aria-label="Heiti skýrslu" />
        <p>{verk?.heiti} · <input type="date" value={gogn.dags ?? new Date().toISOString().slice(0, 10)} onChange={(e) => breyta({ dags: e.target.value })} aria-label="Dagsetning" /><b className="sk-prent">{dmy(gogn.dags ?? new Date().toISOString().slice(0, 10))}</b> · Brunahólf ehf</p>
        <textarea className="sk-texti" rows={3} placeholder="Inngangur / samantekt (valfrjálst) …" value={gogn.inngangur ?? ""} onChange={(e) => breyta({ inngangur: e.target.value })} />
        <p className="sk-prent sk-malsgr">{gogn.inngangur}</p>
      </header>

      <section>
        <h2>Staða eftir hæð og deild</h2>
        <p className="sk-smatt">Tölur eru stök verk eins og þau eru skráð. Heild: <b>{num(alls.klar)}</b> af <b>{num(alls.mark)}</b> = <b>{pros(alls.klar, alls.mark)} %</b>.<span className="sk-skjar"> Reitirnir Klárað og Markmið eru breytanlegir; tómur reitur notar reiknaða gildið.</span></p>
        {radir.map((r) => {
          const hs = summa(r.deildir.flatMap((d) => d.hopar));
          return (
            <div key={r.haed} className="sk-haed">
              <h3>{r.haed.replace("H", ". hæð")} <span>{num(hs.klar)} af {num(hs.mark)} · {pros(hs.klar, hs.mark)} %</span></h3>
              <table className="sk-tafla">
                <thead><tr><th>Deild</th><th>Flokkur</th><th>Skráð klárað</th><th>Opið</th><th>Klárað</th><th>Markmið</th><th>%</th><th className="sk-stikud">Staða</th><th>Athugasemd</th></tr></thead>
                <tbody>
                  {r.deildir.map((d) => {
                    const ds = summa(d.hopar);
                    const synaSt = !gogn.an_staerda, nRod = d.hopar.length + 1 + (synaSt ? d.hopar.reduce((a, h) => a + h.staerdir.length, 0) : 0);
                    return d.hopar.length ? [
                      ...d.hopar.flatMap((h, i) => [
                        <tr key={h.lykill}>
                          {i === 0 && <td rowSpan={nRod} className="sk-deild">{d.deild === "—" ? "Án deildar" : d.deild}</td>}
                          <td className="sk-v">{h.nafn}</td><td>{num(h.done)}</td><td>{h.open ? num(h.open) : ""}</td>
                          <td><Tala gildi={h.br.klarad} reiknad={h.done} onChange={(v) => breytaStodu(h.lykill, { klarad: v })} /></td>
                          <td><Tala gildi={h.br.markmid} reiknad={h.markR} onChange={(v) => breytaStodu(h.lykill, { markmid: v })} /></td>
                          <td>{h.prosenta == null ? "—" : `${h.prosenta} %`}</td>
                          <td className="sk-stikud">{h.prosenta == null ? null : <i style={{ width: `${h.prosenta}%` }} />}</td>
                          <td className="sk-ath"><input value={h.br.ath ?? ""} onChange={(e) => breytaStodu(h.lykill, { ath: e.target.value })} aria-label="Athugasemd" /><span className="sk-prent">{h.br.ath}</span></td>
                        </tr>,
                        ...(synaSt ? h.staerdir.map((z) => (
                          <tr key={h.lykill + z.heiti} className="sk-undir">
                            <td className="sk-v">{z.heiti}</td><td>{num(z.done)}</td><td>{z.open ? num(z.open) : ""}</td><td></td>
                            <td>{z.vidmid ? num(z.vidmid) : ""}</td><td>{z.vidmid ? `${pros(z.done, z.vidmid)} %` : ""}</td><td className="sk-stikud">{z.vidmid ? <i style={{ width: `${Math.min(100, pros(z.done, z.vidmid))}%` }} /> : null}</td><td></td>
                          </tr>
                        )) : []),
                      ]),
                      <tr key={d.deild + "-s"} className="sk-sum"><td className="sk-v">Deild alls</td><td></td><td></td><td>{ds.mark ? num(ds.klar) : "—"}</td><td>{ds.mark ? num(ds.mark) : "—"}</td><td>{ds.mark ? `${pros(ds.klar, ds.mark)} %` : "—"}</td><td className="sk-stikud">{ds.mark ? <i style={{ width: `${pros(ds.klar, ds.mark)}%` }} /> : null}</td><td></td></tr>,
                    ] : null;
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
        <p className="sk-smatt">Sjálfgefin markmið: 6. hæð = það sem er klárað; 5. hæð = sami flokkahópur á sömu deild á 6. hæð (loftræsting kvörðuð við talningu á 5. hæð), en aldrei minna en klárað + opið; milliloft {GOLF_MARK} á deild á 4. og 5. hæð. Rafmagn: {RAF_MARK} stök verk á deild á 5. og 6. hæð, og telst með í samtölum. Raufar við kantaða stokka hafa ekkert reiknað markmið: þar birtist prósenta aðeins ef markmið er slegið inn, og sú lína telst þá fyrst með í samtölum. „Án deildar" eru skráningar á teikningum sem skiptast ekki á deildir. Stærðarlínurnar (inndregnar) sýna skráningar per stærð; á 5. hæð er sama stærð á sömu deild á 6. hæð sýnd sem viðmið — stærðaflokkun er ekki alltaf eins milli hæða, svo prósentan á við hópinn í heild. Utan hæða og hópa (skráningar án hæðar, Annað og Guide point{gogn.aukaverk_med ? ", aukaverk" : ""}): {num(taln.utan)} skráningar, þar af {num(taln.utanDone)} kláraðar — þær eru ekki í töflunum hér að ofan.{aukaRadir.length ? " Aukaverk eru í sér kafla hér að neðan." : ""}</p>
      </section>

      {aukaRadir.length > 0 && (
        <section>
          <h2>Aukaverk</h2>
          <p className="sk-smatt">Skráningar á teikningunni „{[...aukaTeikn.values()].map((n) => n.replace(/\.(jpe?g|png|pdf)$/i, "")).join("“, „")}“ í Ajour: <b>{num(aukaAlls.done)}</b> kláraðar{aukaAlls.open ? <> og {num(aukaAlls.open)} opnar</> : null}. Þær eru ekki í stöðutöflunum að ofan{gogn.aukaverk_med ? ", en teljast með í samanburði við útboð" : " og teljast ekki með í samanburði við útboð"}.<span className="sk-skjar"> <label className="sk-val"><input type="checkbox" checked={!!gogn.aukaverk_med} onChange={(e) => breyta({ aukaverk_med: e.target.checked || undefined })} /> Telja aukaverk með í útboðssamanburði</label></span></p>
          <table className="sk-tafla sk-auka">
            <thead><tr><th>Hópur</th><th>Flokkur</th><th>Klárað</th><th>Opið</th></tr></thead>
            <tbody>
              {aukaRadir.map((r) => <tr key={r.heiti}><td className="sk-v">{r.hopur}</td><td className="sk-v">{r.heiti}</td><td>{num(r.done)}</td><td>{r.open ? num(r.open) : ""}</td></tr>)}
              <tr className="sk-sum"><td className="sk-v">Aukaverk alls</td><td></td><td>{num(aukaAlls.done)}</td><td>{aukaAlls.open ? num(aukaAlls.open) : ""}</td></tr>
            </tbody>
          </table>
        </section>
      )}

      <section>
        <h2>Samanburður við upprunalegt útboð</h2>
        <p className="sk-smatt">Skráð stök verk eru kláraðar skráningar í öllu verkinu{aukaRadir.length && !gogn.aukaverk_med ? ", án aukaverka" : ""}. Lokið = stök verk ÷ „stök per ein." (tvö stök verk eru ein lokun; gólfgöt eitt).<span className="sk-skjar"> Gildandi magn, stök per ein., Lokið og athugasemd eru breytanleg.</span></p>
        <table className="sk-tafla sk-utbod">
          <thead><tr><th>Nr.</th><th>Verkþáttur</th><th>Ein.</th><th>Útboð</th><th>Gildandi magn</th><th>Skráð stök verk</th><th>Stök per ein.</th><th>Lokið</th><th>% af magni</th><th>Mismunur</th><th>Athugasemd</th></tr></thead>
          <tbody>
            {utbod.map((u) => [
              u.kafli ? <tr key={u.nr + "-k"} className="sk-kafli"><td colSpan={11}>{u.kafli}</td></tr> : null,
              <tr key={u.nr}>
                <td>{u.nr}</td><td className="sk-v">{u.heiti}</td><td>{u.ein}</td><td>{num(u.magn0)}</td>
                <td><Tala gildi={u.br.magn} reiknad={u.magn0} onChange={(v) => breytaUtbodi(u.nr, { magn: v })} /></td>
                <td>{u.re ? num(u.stok) : "—"}{u.opid ? <small> (+{num(u.opid)} opið)</small> : null}</td>
                <td><Tala gildi={u.br.per} reiknad={u.per0} onChange={(v) => breytaUtbodi(u.nr, { per: v })} /></td>
                <td><Tala gildi={u.br.lokid} reiknad={u.lokidR} aukast={1} onChange={(v) => breytaUtbodi(u.nr, { lokid: v })} /></td>
                <td>{u.lokid == null ? "—" : `${pros(u.lokid, u.magn)} %`}</td>
                <td className={u.lokid != null && u.lokid > u.magn ? "sk-yfir" : ""}>{u.lokid == null ? "—" : (u.lokid - u.magn > 0 ? "+" : "") + num(u.lokid - u.magn, 1)}</td>
                <td className="sk-ath"><input value={u.br.ath ?? ""} onChange={(e) => breytaUtbodi(u.nr, { ath: e.target.value })} aria-label="Athugasemd" /><span className="sk-prent">{u.br.ath}</span></td>
              </tr>,
            ])}
          </tbody>
        </table>
        <p className="sk-smatt">Liðir 1.1 og 1.3: Ajour hefur aðeins einn gólfflokk (Ø160-200), svo öll gólfgöt teljast á 1.2. Liður 2.11 er í metrum og reiknast ekki úr fjölda skráninga — metrarnir eru slegnir inn í „Lokið". Utan útboðsliða: {num(utanUtbods.n)} kláraðar skráningar{utanUtbods.nofn.length ? ` (${utanUtbods.nofn.join(", ")})` : ""}.</p>
      </section>

      <section>
        <textarea className="sk-texti" rows={3} placeholder="Lokaorð / næstu skref (valfrjálst) …" value={gogn.lok ?? ""} onChange={(e) => breyta({ lok: e.target.value })} />
        <p className="sk-prent sk-malsgr">{gogn.lok}</p>
      </section>
    </div>
  );
}
