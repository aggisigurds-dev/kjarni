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
import Haedir, { haedHeiti, haedUndir, type HkPunktur, type HkEftir, type HkStutar, type HkYfirlit } from "./Haedir";
import { Efni, Verkferli, type EfniGogn } from "./Efni";

type Verk = { id: number; heiti: string };
type Flokkur = { id: number; heiti: string };
type Skr = { id: number; ajour_serial: number | null; flokkur_id: number | null; teikning_id: number | null; stada: string; framkvaemt_til: string | null; haed: string | null; deild: string | null };
/** Staða skráningar á yfirlitsblaði hæðarinnar (sýnin skr_haedarhnit). */
type Hnit = { skraning_id: number; haed: string | null; deild: string | null; hluti: string | null; x_px: number; y_px: number; faerdur?: boolean };
/** parad á stútum viðbótarverksins (tools/skraning-gatakort-vidbot-stutar.cjs) ber auk stöðunnar: númer stúts, flokkun, úttekt skjalsins og skráninguna sem parast. */
type Aaetlad = { teikning_id: number; x_px: number; y_px: number; fag: string; flokkur_id: number | null; fjoldi: number | null; parad: { stada?: string; stutur?: number; flokkun?: string; uttekt?: { texti?: string | null } | null; skr?: { nr: number; stada: string } | null; naest?: { nr: number; d_m: number; stada: string } | null } | null };
const HLUTAR = ["N", "C", "S"];
const thridj = (m: number, i: number) => [Math.ceil(m / 3), Math.round(m / 3), Math.floor(m / 3)][i];   // fast deildarmarkmið skipt á hlutana þrjá
const FAG_HOP: Record<string, string | null> = { loftraesting: "Loft", rafmagn: "Rafmagn", golf: "Gólf", annad: null };
type StadaBr = { markmid?: number; klarad?: number; ath?: string };
type UtbodBr = { magn?: number; per?: number; lokid?: number; ath?: string };
type Gogn = EfniGogn & { an_staerda?: boolean; aukaverk_med?: boolean; kaflar?: Record<string, boolean>; heiti?: string; dags?: string; inngangur?: string; lok?: string; stada?: Record<string, StadaBr>; utbod?: Record<string, UtbodBr> };

/** Kaflar skýrslunnar sem má fela í stillingunum (gogn.kaflar[lykill] === false = falinn). */
const KAFLAR: [string, string][] = [["texti", "Inngangur og lokaorð"], ["spjold", "Lykiltölur hæða"], ["forsendur", "Forsendur og fyrirvarar"], ["kort", "Staðan á hæðunum"], ["flokkar", "Heild eftir flokkum"], ["tafla", "Tölur eftir hæð og deild"], ["aukaverk", "Aukaverk"], ["anstadar", "Skráningar án teikningar (verður eytt)"], ["utbod", "Samanburður við útboð"], ["efni", "Efni og kerfi"], ["verkferli", "Verkferli"]];
/** Efnisyfirlit: akkeri kaflanna (sýnd aðeins ef kaflinn er sýnilegur). */
const AKKERI: [string, string, string][] = [["k-yfirlit", "Yfirlit", "spjold"], ["k-haedir", "Hæðir", "kort"], ["k-flokkar", "Flokkar", "flokkar"], ["k-tolur", "Tölur", "tafla"], ["k-utbod", "Útboð", "utbod"], ["k-efni", "Efni", "efni"], ["k-verkferli", "Verkferli", "verkferli"]];
/** Kaflar sem eru faldir nema kveikt sé á þeim (gogn.kaflar[lykill] === true). */
const SJALFG_FALDIR = new Set(["anstadar"]);
const MAN = ["janúar", "febrúar", "mars", "apríl", "maí", "júní", "júlí", "ágúst", "september", "október", "nóvember", "desember"];
const HAEDIR = ["6H", "5H", "4H"], DEILDIR = ["S1", "S2", "S4", "S5", "—"];   // „—" = skráningar á hæðinni sem skiptast ekki á deild (rafmagn á sérteikningum)
const HOPAR: [string, string, RegExp][] = [["Loft", "Loftræsting", /^Loft/i], ["Stál", "Stálrör", /^Stál/i], ["Plast", "Plaströr", /^Plast/i], ["Gólf", "Milliloft", /^Gólf/i], ["Raufar", "Raufar við kantaða stokka", /^Raufar/i], ["Rafmagn", "Rafmagn", /^Raf/i]];
/** Hópar án reiknaðs markmiðs: þar er prósenta aðeins sýnd ef markmið er slegið inn. */
const AN_MARKMIDS = new Set(["Raufar"]);
const RAF_MARK = 104;                                    // rafmagnsgöt: 104 stök verk á hverja deild á 5H og 6H (Agnar 11.11.2026)
/** Aukaverk: skráningar á teikningu sem heitir „… Viðbótarverkefni" í Ajour — sýnd sér, utan stöðu og (sjálfgefið) útboðssamanburðar. */
const AUKA_RE = /vi[ðd]b[óo]tarverk|aukaverk/i;
/** Milliloft skráð OFAN FRÁ á 6. hæð, deild S2 (24.09.–14.11.2025): í gólfi er aðeins neðri vinnan talin (Agnar 14.11.2026: „30 eða 32 … skráninga í
 *  gólf 160 sem teljast ekki með“, „þessar mátti setja í hide“). Fundnar af ljósmyndum (rör niður í gólfið); Ajour-númer. Aðeins þessi skýrsla sleppir
 *  þeim: skráningarnar sjálfar, Ajour og uppgjör eru óbreytt. Sjá .claude/agents/skraning.md. */
const OFAN_FRA = new Set([145, 1060, 1061, 1063, 1064, 1065, 1066, 1077, 1078, 1079, 1080, 1081, 1082, 1083, 1084, 1089, 1090, 1092, 1094, 1095, 1097, 1098, 1099, 1363, 1364, 1365, 1366, 1367, 1368, 1369, 1370]);
const GOLF_MARK = 110;                                  // rúmlega 100 gólfgöt á deild á 4H og 5H (eitt verk á gat)
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
/** Skiptir heiltölu á liði í hlutfalli við vog (stærsta afgangs-aðferð), svo summan verði nákvæmlega „alls“. */
const deila = (alls: number, vog: number[]): number[] => {
  const sv = vog.reduce((a, b) => a + b, 0); if (sv <= 0) return vog.map(() => 0);
  const hra = vog.map((v) => (alls * v) / sv), ut = hra.map(Math.floor); let eftir = Math.round(alls) - ut.reduce((a, b) => a + b, 0);
  for (const i of hra.map((h, j) => [h - Math.floor(h), j] as [number, number]).sort((a, b) => b[0] - a[0]).map((x) => x[1])) { if (eftir <= 0) break; ut[i]++; eftir--; }
  return ut;
};
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
  /** Skráningar sem skýrslan sleppir (OFAN_FRA): fjöldi og þar af kláraðar, fyrir afstemminguna við Ajour. */
  const [ofanFra, setOfanFra] = useState({ n: 0, done: 0 });
  /** Skráningar án teikningar sem eru faldar í grunninum (eytt=true): fjöldi og þar af merktar kláraðar. Þær lifa áfram í Ajour. */
  const [faldarAnT, setFaldarAnT] = useState({ n: 0, done: 0 });
  const [hnit, setHnit] = useState<Map<number, Hnit>>(new Map());
  const [yfirlit, setYfirlit] = useState<HkYfirlit[]>([]);
  const [aaetlud, setAaetlud] = useState<Aaetlad[]>([]);
  const [aukaTeikn, setAukaTeikn] = useState<Map<number, string>>(new Map()); // teikningar aukaverka: id → heiti
  const [teiknHaed, setTeiknHaed] = useState<Map<number, string>>(new Map()); // hæð úr heiti teikningar („6H 2S-1S Rafmagnsþéttingar")
  const [skyrslaId, setSkyrslaId] = useState<number | null>(null);
  const [gogn, setGogn] = useState<Gogn>({});
  const [ovistad, setOvistad] = useState(false);
  const [stadaTexti, setStadaTexti] = useState("Sæki skráningar…");
  const [villa, setVilla] = useState("");
  const [starfsmenn, setStarfsmenn] = useState<Map<number, string>>(new Map());
  /** Lagnakerfi stálröraþéttinga (skr_kerfi): lesið af lagnateikningum, áætlun. */
  const [kerfi, setKerfi] = useState<Map<number, { k: string; v: boolean; m: boolean }>>(new Map());
  /** Lagnateikningar gatakortsins (skr_log) per hæð og fag — sýndar ofan á hæðinni þegar síað er á kerfi. */
  const [log, setLog] = useState<{ haed: string; fag: string; mynd: string }[]>([]);
  /** Kynningarhamur (?kynning=1): engin stjórntæki til breytinga og engin vistun — aðeins síur, kort og prentun. */
  const [les, setLes] = useState(false);
  useEffect(() => { setLes(new URLSearchParams(window.location.search).has("kynning")); }, []);

  useEffect(() => {
    let lifir = true;
    (async () => {
      try {
        const s = sb(), vid = Number(new URLSearchParams(window.location.search).get("verk")) || 0;
        const v = vid ? await s.from("skr_verk").select("id,heiti").eq("id", vid).single() : await s.from("skr_verk").select("id,heiti").eq("eytt", false).ilike("heiti", "%gatakort%").order("id").limit(1).single();
        if (v.error || !v.data) throw new Error(v.error?.message || "Ekkert verk fannst");
        const vk = v.data as Verk;
        const [f, sk, tk, sm, lg] = await Promise.all([
          s.from("skr_flokkar").select("id,heiti").or(`verk_id.eq.${vk.id},verk_id.is.null`),
          s.from("skr_skyrslur").select("id,gogn").eq("verk_id", vk.id).eq("eytt", false).order("id", { ascending: false }).limit(1),
          s.from("skr_teikningar").select("id,heiti,tegund,haed,mynd_path,breidd_px,haed_px").eq("verk_id", vk.id).eq("eytt", false),
          s.from("skr_starfsmenn").select("id,nafn"),
          s.from("skr_log").select("teikning_id,fag,mynd_path").eq("verk_id", vk.id).eq("eytt", false),
        ]);
        if (f.error) throw new Error(f.error.message);
        const allt: Skr[] = []; const sleppt = { n: 0, done: 0 };
        for (let i = 0; ; i += 1000) {
          const r = await s.from("skr_skraningar").select("id,ajour_serial,flokkur_id,teikning_id,stada,framkvaemt_til,haed:ajour_gogn->>haed,deild:ajour_gogn->>deild").eq("verk_id", vk.id).eq("eytt", false).order("id").range(i, i + 999);
          if (r.error) throw new Error(r.error.message);
          for (const q of r.data as unknown as Skr[]) { if (q.ajour_serial != null && OFAN_FRA.has(q.ajour_serial)) { sleppt.n++; if (q.stada === "done") sleppt.done++; } else allt.push(q); }
          if (lifir) setStadaTexti(`Sæki skráningar… ${num(allt.length)}`);
          if (!r.data || r.data.length < 1000) break;
        }
        // OFAN_FRA-skráningarnar eru faldar í grunninum (eytt=true, 14.11.2026) en lifa áfram í Ajour: taldar hér svo afstemmingin við Ajour haldi
        // Sama á við um skráningar ÁN TEIKNINGAR sem voru faldar sama dag (vinnufærslur): taldar sér (anT) fyrir afstemminguna og liðinn um þær.
        const anT = { n: 0, done: 0 };
        for (let i = 0; ; i += 1000) {
          const r = await s.from("skr_skraningar").select("id,stada,teikning_id,ajour_serial").eq("verk_id", vk.id).eq("eytt", true).order("id").range(i, i + 999);
          if (r.error) break;
          for (const q of (r.data || []) as { stada: string; teikning_id: number | null; ajour_serial: number | null }[]) {
            const t = q.ajour_serial != null && OFAN_FRA.has(q.ajour_serial) ? sleppt : q.teikning_id == null ? anT : null;
            if (t) { t.n++; if (q.stada === "done") t.done++; }
          }
          if (!r.data || r.data.length < 1000) break;
        }
        // hæðarhnit (sýnin skr_haedarhnit): hæð og deild úr STÖÐU punktsins á yfirlitsblaðinu — ræður þar sem hún er til, svo færðir punktar fylgi nýja staðnum
        const hn = new Map<number, Hnit>();
        for (let i = 0; ; i += 1000) {
          const r = await s.from("skr_haedarhnit").select("skraning_id,haed,deild,hluti,x_px,y_px,faerdur").eq("verk_id", vk.id).order("skraning_id").range(i, i + 999);
          if (r.error) throw new Error(r.error.message);
          for (const q of (r.data || []) as Hnit[]) hn.set(q.skraning_id, q);
          if (lifir) setStadaTexti(`Sæki staðsetningar… ${num(hn.size)}`);
          if (!r.data || r.data.length < 1000) break;
        }
        for (const q of allt) { const h = hn.get(q.id); if (h) { q.haed = h.haed || q.haed; q.deild = h.deild || q.deild; } }
        // áætluð göt gatakortsins: þau sem engin skráning parast við birtast sem „eftir“ á hæðakortinu
        const aa: Aaetlad[] = [];
        for (let i = 0; ; i += 1000) {
          const r = await s.from("skr_aaetlud").select("teikning_id,x_px,y_px,fag,flokkur_id,fjoldi,parad").eq("verk_id", vk.id).eq("eytt", false).not("uppruni", "like", "tillaga:%").order("id").range(i, i + 999);
          if (r.error) throw new Error(r.error.message);
          aa.push(...((r.data || []) as Aaetlad[]));
          if (!r.data || r.data.length < 1000) break;
        }
        const kf = new Map<number, { k: string; v: boolean; m: boolean }>();
        for (let i = 0; ; i += 1000) {
          const r = await s.from("skr_kerfi").select("skraning_id,kerfi,vafi,uppruni").eq("verk_id", vk.id).order("skraning_id").range(i, i + 999);
          if (r.error) break;   // taflan er viðbót: án hennar virkar skýrslan, aðeins kerfissían vantar
          for (const q of (r.data || []) as { skraning_id: number; kerfi: string; vafi: boolean; uppruni: string }[]) kf.set(q.skraning_id, { k: q.kerfi, v: q.vafi, m: q.uppruni === "mynd" });
          if (!r.data || r.data.length < 1000) break;
        }
        if (!lifir) return;
        setHnit(hn); setAaetlud(aa); setKerfi(kf);
        { const th = new Map(((tk.data || []) as { id: number; haed?: string | null }[]).map((t) => [t.id, t.haed || ""])); setLog(((lg.data || []) as { teikning_id: number; fag: string; mynd_path: string | null }[]).filter((l) => l.mynd_path && th.get(l.teikning_id)).map((l) => ({ haed: th.get(l.teikning_id) as string, fag: l.fag, mynd: l.mynd_path as string }))); }
        setStarfsmenn(new Map(((sm.data || []) as { id: number; nafn: string }[]).map((x) => [x.id, x.nafn] as [number, string])));
        setYfirlit(((tk.data || []) as { id: number; tegund?: string; haed?: string | null; mynd_path?: string | null; breidd_px?: number | null; haed_px?: number | null }[]).filter((t) => t.tegund === "yfirlit" && t.haed && t.breidd_px && t.haed_px).map((t) => ({ id: t.id, haed: t.haed as string, mynd: t.mynd_path ?? null, w: Number(t.breidd_px), h: Number(t.haed_px) })));
        setVerk(vk); setFlokkar(f.data as Flokkur[]); setSkr(allt); setOfanFra(sleppt); setFaldarAnT(anT);
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
    const hd = new Map<string, { done: number; open: number }>(), fl = new Map<string, { done: number; open: number }>(), st = new Map<string, { done: number; open: number }>(), auka = new Map<string, { done: number; open: number }>(), hp = new Map<string, { done: number; open: number }>();
    let utan = 0, utanDone = 0; const utanFl = new Map<string, { done: number; open: number }>();   // skráningar án staðsetningar, per flokk
    for (const s of skr) {
      const h = (s.flokkur_id != null && heitiAf.get(s.flokkur_id)) || "", done = s.stada === "done";
      if (s.teikning_id != null && aukaTeikn.has(s.teikning_id)) {   // aukaverk: talin sér; aðeins með í flokkatalningu (útboð) ef hakað er við
        const a = auka.get(h) || { done: 0, open: 0 }; if (done) a.done++; else a.open++; auka.set(h, a);
        if (!gogn.aukaverk_med) continue;
      }
      const f = fl.get(h) || { done: 0, open: 0 }; if (done) f.done++; else f.open++; fl.set(h, f);
      const hop = HOPAR.find((x) => x[2].test(h));
      const haed = s.haed || (s.teikning_id != null ? teiknHaed.get(s.teikning_id) : undefined);
      if (!haed || (!s.deild && !hop)) { utan++; if (done) utanDone++; const u = utanFl.get(h) || { done: 0, open: 0 }; if (done) u.done++; else u.open++; utanFl.set(h, u); continue; }
      if (!hop) continue;
      const dd = s.deild || "—";
      const k = `${haed}|${dd}|${hop[0]}`, x = hd.get(k) || { done: 0, open: 0 }; if (done) x.done++; else x.open++; hd.set(k, x);
      const k2 = `${haed}|${dd}|${h}`, y = st.get(k2) || { done: 0, open: 0 }; if (done) y.done++; else y.open++; st.set(k2, y);
      const hl = hnit.get(s.id)?.hluti;   // hluti deildar (N/C/S) úr stöðu punktsins — fyrir markmið hluta á hæðakortinu
      if (hl) { const k3 = `${haed}|${dd}|${hl}|${hop[0]}`, z = hp.get(k3) || { done: 0, open: 0 }; if (done) z.done++; else z.open++; hp.set(k3, z); }
    }
    return { hd, fl, st, auka, hp, utan, utanDone, utanFl };
  }, [skr, heitiAf, teiknHaed, aukaTeikn, gogn.aukaverk_med, hnit]);

  /** Viðbótarverk á 4H (Agnar 12.11.2026: „Jú inn“): áætluð gólfgöt á 4H ÁN skráningar (stútar af 5. hæð niður í inntaksrými 4. hæðar,
   *  tools/skraning-gatakort-vidbot-stutar.cjs). Lykill: deild og „deild|hluti“. Pöruð göt eru þegar skráð í Ajour og teljast ekki aftur. */
  const vidbot4 = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of aaetlud) {
      if (a.fag !== "golf" || (a.parad && a.parad.stada !== "vantar")) continue;
      const y = yfirlit.find((q) => q.id === a.teikning_id); if (!y || y.haed !== "4H") continue;
      const fx = Number(a.x_px) / y.w, fy = Number(a.y_px) / y.h, d = fx < 0.179 ? "S1" : fx < 0.5 ? "S2" : fx < 0.812 ? "S4" : "S5", hl = fy < 0.288 ? "N" : fy < 0.7116 ? "C" : "S", fj = a.fjoldi || 1;
      m.set(d, (m.get(d) || 0) + fj); m.set(`${d}|${hl}`, (m.get(`${d}|${hl}`) || 0) + fj);
    }
    return m;
  }, [aaetlud, yfirlit]);
  /** Áætluð milliloft á deild: 110 á 5H; á 4H (gólf 5. hæðar) það sem er skráð á sömu deild á 5H ef það er meira (Agnar 12.11.2026),
   *  að viðbættu óskráðu viðbótarverki á 4H (vidbot4). */
  const golfMark = useCallback((haed: string, deild: string) => { if (haed === "6H") return 0; if (haed !== "4H") return GOLF_MARK; const t5 = taln.hd.get(`5H|${deild}|Gólf`) || { done: 0, open: 0 }; return Math.max(GOLF_MARK, t5.done + t5.open) + (vidbot4.get(deild) || 0); }, [taln, vidbot4]);
  /** Sjálfgefið markmið hóps (sama aðferð og Landspítalasíða hubsins). */
  const markmidReiknad = useCallback((haed: string, deild: string, hop: string): number | null => {
    if (deild === "—" || AN_MARKMIDS.has(hop)) return null;
    const t = (h: string, d: string, k: string) => taln.hd.get(`${h}|${d}|${k}`) || { done: 0, open: 0 };
    const x = t(haed, deild, hop);
    let mark: number;
    if (hop === "Gólf") mark = golfMark(haed, deild);
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
  }, [taln, golfMark]);

  /** Markmið hóps á HLUTA deildar (Norður/Center/Suður): sama regla og deildin, reiknuð á hlutann; föstu deildarmarkmiðin (milliloft,
   *  rafmagn) skiptast jafnt á hlutana þrjá. Summa hluta getur því vikið lítillega frá markmiði deildar. */
  const markmidHluta = useCallback((haed: string, deild: string, i: number, hop: string): number | null => {
    if (AN_MARKMIDS.has(hop)) return null;
    const t = (h: string, k: string) => taln.hp.get(`${h}|${deild}|${HLUTAR[i]}|${k}`) || { done: 0, open: 0 };
    const x = t(haed, hop);
    let mark: number;
    if (hop === "Gólf") { const vb = haed === "4H" ? vidbot4.get(deild) || 0 : 0; mark = thridj(golfMark(haed, deild) - vb, i) + (haed === "4H" ? vidbot4.get(`${deild}|${HLUTAR[i]}`) || 0 : 0); }   // viðbótarverkið fer á réttan hluta, ekki jafnt á þrjá
    else if (hop === "Rafmagn") mark = haed === "4H" ? 0 : thridj(RAF_MARK, i);
    else if (haed === "4H") mark = 0;
    else if (haed === "6H") mark = x.done;
    else {
      const ref = t("6H", hop); let studull = 1;
      if (hop === "Loft") {
        const l6 = (d: string) => (taln.hd.get(`6H|${d}|Loft`) || { done: 0 }).done, kv = l6("S2") ? l6("S2") / MIRO_LOFT.vidmid : 1;
        const fw = (d: string) => (l6(d) ? Math.min(1, (MIRO_LOFT[d] * kv) / l6(d)) : 1);
        studull = MIRO_LOFT[deild] ? fw(deild) : (fw("S1") + fw("S2")) / 2;
      }
      mark = Math.round((ref.done + ref.open) * studull);
    }
    return Math.max(mark, x.done + x.open);
  }, [taln, golfMark, vidbot4]);
  /** Punktar hæðakortsins: skráningar með hæðarhnit (aukaverk eru sér). */
  const hkPunktar = useMemo<HkPunktur[]>(() => {
    const ut: HkPunktur[] = [];
    for (const s of skr) {
      const h = hnit.get(s.id); if (!h || !h.haed || !h.deild || !h.hluti) continue;
      if (s.teikning_id != null && aukaTeikn.has(s.teikning_id)) continue;
      const fl = (s.flokkur_id != null && heitiAf.get(s.flokkur_id)) || "", hop = HOPAR.find((x) => x[2].test(fl));
      const kq = kerfi.get(s.id);
      ut.push({ kerfi: kq ? kq.k : null, kvafi: kq ? kq.v : false, kmynd: kq ? kq.m : false, id: s.id, nr: s.ajour_serial, dags: s.framkvaemt_til ? s.framkvaemt_til.slice(0, 10) : null, haed: h.haed, deild: h.deild, hluti: h.hluti, x: Number(h.x_px), y: Number(h.y_px), hop: hop ? hop[0] : null, fl, done: s.stada === "done", man: s.framkvaemt_til ? s.framkvaemt_til.slice(0, 7) : null });
    }
    return ut;
  }, [skr, hnit, heitiAf, aukaTeikn, kerfi]);
  /** Áætluð göt án skráningar („eftir“): deild og hluti úr stöðu gatsins á yfirlitinu (sömu skil og skr_haedarhnit). */
  const hkEftir = useMemo<HkEftir[]>(() => aaetlud.flatMap((a) => {
    if (a.parad && a.parad.stada !== "vantar") return [];
    const y = yfirlit.find((q) => q.id === a.teikning_id); if (!y) return [];
    const fl = (a.flokkur_id != null && heitiAf.get(a.flokkur_id)) || "", hf = HOPAR.find((x) => x[2].test(fl));
    const hop = hf ? hf[0] : a.fag in FAG_HOP ? FAG_HOP[a.fag] : "Stál", fx = Number(a.x_px) / y.w, fy = Number(a.y_px) / y.h;
    const st = a.parad && a.parad.stutur != null ? { nr: a.parad.stutur, fl: a.parad.flokkun || "ometid", uttekt: a.parad.uttekt?.texti || null, naest: a.parad.naest || null } : undefined;   // stútur úr viðbótarverkinu: merktur sérstaklega á kortinu
    return [{ haed: y.haed, deild: fx < 0.179 ? "S1" : fx < 0.5 ? "S2" : fx < 0.812 ? "S4" : "S5", hluti: fy < 0.288 ? "N" : fy < 0.7116 ? "C" : "S", x: Number(a.x_px), y: Number(a.y_px), hop, n: a.fjoldi || 1, st }];
  }), [aaetlud, yfirlit, heitiAf]);
  /** Samantekt stúta viðbótarverksins per hæð: hve margir eiga skráningu (kláraða / opna) og hvernig hinir skiptast eftir úttekt skjalsins. */
  const hkStutar = useMemo(() => {
    const m: Record<string, HkStutar> = {};
    for (const a of aaetlud) {
      if (!a.parad || a.parad.stutur == null) continue;
      const y = yfirlit.find((q) => q.id === a.teikning_id); if (!y) continue;
      const t = m[y.haed] || (m[y.haed] = { alls: 0, klarad: 0, opid: 0, eftir: 0, thett: 0, annad: 0 });
      t.alls++;
      if (a.parad.stada !== "vantar") { if (a.parad.skr?.stada === "done") t.klarad++; else t.opid++; }
      else if (a.parad.flokkun === "eftir_oskrad") t.eftir++; else if (a.parad.flokkun === "thett_oskrad") t.thett++; else t.annad++;
    }
    return m;
  }, [aaetlud, yfirlit]);

  const radir = useMemo(() => HAEDIR.map((haed) => ({
    haed,
    deildir: DEILDIR.map((deild) => ({
      deild,
      hopar: HOPAR.map(([k, nafn]) => {
        const x = taln.hd.get(`${haed}|${deild}|${k}`) || { done: 0, open: 0 }, lykill = `${haed}|${deild}|${k}`, br = gogn.stada?.[lykill] || {};
        const markR = markmidReiknad(haed, deild, k), mark = br.markmid ?? markR, klar = br.klarad ?? x.done;
        const prosenta = mark == null ? null : pros(Math.min(klar, Math.max(mark, klar)), Math.max(mark, klar));
        // stærðarflokkar hópsins á þessari deild. Markmið stærðar = markmið hópsins skipt á stærðirnar eftir vog: það sem er skráð (klárað + opið),
        // og á 5. hæð sama stærð á sömu deild á 6. hæð ef hún er stærri. Fyrst fær hver stærð það sem er skráð; afgangi hópmarkmiðsins er skipt á
        // stærðirnar sem vantar upp á viðmiðið. Summa stærða = markmið hópsins.
        const st0 = flokkar.filter((f) => HOPAR.find((y) => y[0] === k)![2].test(f.heiti)).map((f) => { const a = taln.st.get(`${haed}|${deild}|${f.heiti}`) || { done: 0, open: 0 }, r6 = taln.st.get(`6H|${deild}|${f.heiti}`) || { done: 0, open: 0 }; return { heiti: f.heiti.replace(/^(Loft|Stál|Plast|Gólf)\s*/i, "").replace(/\s*L[Vv]\b.*$/, "").trim() || f.heiti, done: a.done, open: a.open, vog: Math.max(a.done + a.open, haed === "5H" ? r6.done + r6.open : 0) }; }).filter((z) => z.vog > 0).sort((a, b) => (parseInt(a.heiti.replace(/^\D+/, ""), 10) || 0) - (parseInt(b.heiti.replace(/^\D+/, ""), 10) || 0));
        const skrad = st0.reduce((a, z) => a + z.done + z.open, 0), vantar = st0.map((z) => Math.max(0, z.vog - z.done - z.open));
        const afgangur = mark != null && mark > 0 ? deila(Math.max(0, Math.max(mark, klar) - skrad), vantar.some((v) => v > 0) ? vantar : st0.map((z) => z.vog)) : null;
        const staerdir = st0.map((z, i) => ({ heiti: z.heiti, done: z.done, open: z.open, vidmid: afgangur ? z.done + z.open + afgangur[i] : 0 })).filter((z) => z.done + z.open + z.vidmid > 0);   // stærð sem ekkert er skráð á og fær ekkert af markmiðinu er ekki sýnd
        return { k, nafn, lykill, done: x.done, open: x.open, markR, mark, klar, prosenta, br, staerdir: staerdir.length > 1 ? staerdir : [] };
      }).filter((h) => (h.mark ?? 0) > 0 || h.done + h.open > 0),
    })),
  })), [taln, gogn.stada, markmidReiknad, flokkar]);
  /** Samtala: aðeins línur með markmið (reiknað eða innslegið) teljast, svo heildarprósentan breytist ekki við hópa án markmiðs. */
  const summa = (hs: { klar: number; mark: number | null }[]) => hs.reduce<{ klar: number; mark: number }>((a, h) => (h.mark == null ? a : { klar: a.klar + Math.min(h.klar, Math.max(h.mark, h.klar)), mark: a.mark + Math.max(h.mark, h.klar) }), { klar: 0, mark: 0 });
  const alls = summa(radir.flatMap((r) => r.deildir.flatMap((d) => d.hopar)));
  /** Markmið hóps á deild eins og það stendur í töflunni (með leiðréttingum) — hæðakortið notar sömu tölu. */
  const markDeild = useCallback((haed: string, deild: string, hop: string) => radir.find((r) => r.haed === haed)?.deildir.find((d) => d.deild === deild)?.hopar.find((h) => h.k === hop)?.mark ?? null, [radir]);
  const hkHopar = useMemo(() => HOPAR.map(([k, nafn]) => [k, nafn] as [string, string]), []);

  const utbod = useMemo(() => UTBOD.map((u) => {
    let stok = 0, opid = 0;
    if (u.re) for (const [h, v] of taln.fl) if (u.re.test(h)) { stok += v.done; opid += v.open; }
    const br = gogn.utbod?.[u.nr] || {}, per = br.per ?? u.per, magn = br.magn ?? u.magn;
    const lokidR = per ? stok / per : null, lokid = br.lokid ?? lokidR;
    return { ...u, magn0: u.magn, per0: u.per, stok, opid, br, per, magn, lokidR, lokid };
  }), [taln, gogn.utbod]);
  const utanUtbods = useMemo(() => { let n = 0; const nofn: string[] = []; for (const [h, v] of taln.fl) if (!UTBOD.some((u) => u.re && u.re.test(h))) { n += v.done; if (v.done) nofn.push(`${h || "(enginn flokkur)"} ${v.done}`); } return { n, nofn }; }, [taln]);

  const aukaRadir = useMemo(() => { const rod = (h: string) => { const i = HOPAR.findIndex((x) => x[2].test(h)); return i < 0 ? HOPAR.length : i; }; return [...taln.auka].map(([heiti, v]) => ({ heiti: heiti || "(enginn flokkur)", hopur: HOPAR.find((x) => x[2].test(heiti))?.[1] || "Annað", rod: rod(heiti), ...v })).sort((a, b) => a.rod - b.rod || a.heiti.localeCompare(b.heiti, "is")); }, [taln]);
  const utanRadir = useMemo(() => { const rod = (h: string) => { const i = HOPAR.findIndex((x) => x[2].test(h)); return i < 0 ? HOPAR.length : i; }; return [...taln.utanFl].map(([heiti, v]) => ({ heiti: heiti || "(enginn flokkur)", rod: rod(heiti), ...v })).sort((a, b) => a.rod - b.rod || a.heiti.localeCompare(b.heiti, "is")); }, [taln]);
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
  const synaKafla = (k: string) => (SJALFG_FALDIR.has(k) ? gogn.kaflar?.[k] === true : gogn.kaflar?.[k] !== false);
  /** Fyrir kaflann „Forsendur og fyrirvarar“: hve margir punktar eru færðir á teikningunni og dagsetning nýjustu kláruðu skráningar. */
  const faerdirN = [...hnit.values()].filter((h) => h.faerdur).length;
  const klaradAlls = skr.reduce((n, s) => n + (s.stada === "done" ? 1 : 0), 0);
  const nyjast = skr.reduce((m, s) => (s.framkvaemt_til && s.framkvaemt_til.slice(0, 10) > m ? s.framkvaemt_til.slice(0, 10) : m), "");
  const skiptaKafla = (k: string) => breyta({ kaflar: { ...(gogn.kaflar || {}), [k]: !synaKafla(k) } });
  const dags = gogn.dags ?? new Date().toISOString().slice(0, 10);
  const dagsTexti = `${Number(dags.slice(8, 10))}. ${MAN[Number(dags.slice(5, 7)) - 1] || ""} ${dags.slice(0, 4)}`;
  /** Lykiltölur hverrar hæðar (sömu tölur og í töflunum). */
  const haedaspjold = radir.map((r) => { const hs = summa(r.deildir.flatMap((d) => d.hopar)); return { haed: r.haed, klar: hs.klar, mark: hs.mark, p: pros(hs.klar, hs.mark) }; }).filter((h) => h.mark > 0);
  /** Heild hvers flokkahóps yfir allar hæðir og deildir. */
  const flokkaheild = HOPAR.map(([k, nafn]) => {
    let done = 0, open = 0, klar = 0, mark = 0, erM = false;
    for (const r of radir) for (const d of r.deildir) for (const h of d.hopar) if (h.k === k) { done += h.done; open += h.open; if (h.mark != null) { erM = true; klar += Math.min(h.klar, Math.max(h.mark, h.klar)); mark += Math.max(h.mark, h.klar); } }
    return { k, nafn, done, open, klar, mark: erM ? mark : null };
  }).filter((x) => x.done + x.open > 0 || x.mark);
  const utbodStikur = utbod.filter((u) => u.lokid != null && u.magn > 0 && (u.re != null || u.br.lokid != null))   // liðir án gagna (enginn flokkur í Ajour) sjást aðeins í töflunni
   .map((u) => ({ nr: u.nr, heiti: u.heiti, lokid: u.lokid as number, magn: u.magn, p: pros(u.lokid as number, u.magn), ein: u.ein }));

  if (stadaTexti) return <p className="sk-hl">{stadaTexti}</p>;
  if (villa && !verk) return <p className="sk-hl">Villa: {villa}</p>;
  return (
    <div className={`sk sk-v2${les ? " sk-les" : ""}`}>
      {les && <div className="sk-lesstika"><b>Brunahólf ehf</b><span>{verk?.heiti}</span><button type="button" onClick={() => window.print()}>Prenta / PDF</button></div>}
      <div className="sk-stika">
        <span>{ovistad ? "Óvistaðar breytingar" : skyrslaId ? "Vistað" : "Ekkert vistað enn"} · {nBr} {nBr === 1 ? "leiðrétt lína" : "leiðréttar línur"}</span>
        <button type="button" onClick={vista} disabled={!ovistad}>Vista</button>
        <label className="sk-val"><input type="checkbox" checked={!gogn.an_staerda} onChange={(e) => breyta({ an_staerda: !e.target.checked })} /> Sýna stærðir</label>
        <button type="button" onClick={() => window.print()}>Prenta / PDF</button>
        <button type="button" title="Opnar skýrsluna án stjórntækja til breytinga — til að sýna öðrum" onClick={() => window.open(`${window.location.pathname}?kynning=1`, "_blank")}>Kynningarhamur</button>
        <button type="button" onClick={() => { if (nBr && window.confirm("Hreinsa allar leiðréttingar á tölum? Textar haldast. Breytingin vistast ekki fyrr en þú velur Vista.")) breyta({ stada: {}, utbod: {} }); }} disabled={!nBr}>Hreinsa leiðréttingar</button>
        {villa && <em>Villa: {villa}</em>}
      </div>

      <div className="sk-rammi">
      <aside className="sk-hlid sk-skjar">
        <div className="sk-spjald">
          <h3>Stillingar skýrslu</h3>
          <div className="sk-spjald-efni">
            <div className="sk-merki">Kaflar</div>
            {KAFLAR.map(([k, nafn]) => <label key={k} className="sk-rofi"><input type="checkbox" checked={synaKafla(k)} onChange={() => skiptaKafla(k)} /><i /><span>{nafn}</span></label>)}
            <label className="sk-rofi"><input type="checkbox" checked={!gogn.an_staerda} onChange={(e) => breyta({ an_staerda: !e.target.checked })} /><i /><span>Stærðir undir hverjum flokki</span></label>
            <div className="sk-merki">Dagsetning skýrslu</div>
            <input type="date" value={dags} onChange={(e) => breyta({ dags: e.target.value })} aria-label="Dagsetning" />
            <div className="sk-merki">Einingar</div>
            <p>Tölur eru stök verk eins og Ajour telur þau. Tvö stök verk eru ein lokun; gólfgöt: eitt verk er ein þétting. Samanburður við útboð er í einingum tilboðsins.</p>
            <div className="sk-merki">Áætlað</div>
            <p>6. hæð: það sem er klárað. 5. hæð: sami flokkur á sömu deild á 6. hæð. Milliloft {GOLF_MARK} á deild (gólf 5. hæðar: minnst jafnmörg og á sömu deild á 5. hæð, auk óskráðra stúta úr viðbótarverki) og rafmagn {RAF_MARK} á deild. Áætlað og klárað má leiðrétta í töflunni „Tölur eftir hæð og deild“.</p>
          </div>
        </div>
        <div className="sk-spjald">
          <div className="sk-spjald-efni">
            <div className="sk-merki">Vistun</div>
            <p className={ovistad ? "sk-ovistad" : ""}>{ovistad ? "Óvistaðar breytingar" : skyrslaId ? "Allt vistað" : "Ekkert vistað enn"} · {nBr} {nBr === 1 ? "leiðrétt lína" : "leiðréttar línur"}</p>
            <button type="button" className="sk-adal" onClick={vista} disabled={!ovistad}>Vista</button>
            <button type="button" onClick={() => window.print()}>Prenta / PDF</button>
          </div>
        </div>
      </aside>
      <div className="sk-blad">
      <header className="sk-hetja">
        <div className="sk-hetja-v">
          <div className="sk-kicker">Stöðuskýrsla · {dagsTexti}</div>
          <input className="sk-titill" readOnly={les} value={gogn.heiti ?? "Brunaþéttingar — staða verks"} onChange={(e) => breyta({ heiti: e.target.value })} aria-label="Heiti skýrslu" />
          <p>{verk?.heiti} · Brunahólf ehf</p>
        </div>
        <div className="sk-hetja-h"><b>{pros(alls.klar, alls.mark)}<i> %</i></b><span>{num(alls.klar)} af áætluðum {num(alls.mark)} stökum verkum</span></div>
      </header>
      <nav className="sk-yfirlit sk-skjar sk-gagnv" aria-label="Efnisyfirlit">{AKKERI.filter((a) => synaKafla(a[2])).map(([id, nafn]) => <a key={id} href={`#${id}`}>{nafn}</a>)}</nav>
      <div className="sk-efni">
      {synaKafla("texti") && <div className="sk-inngangur">
        <textarea className="sk-texti" rows={3} placeholder="Inngangur / samantekt (valfrjálst) …" value={gogn.inngangur ?? ""} onChange={(e) => breyta({ inngangur: e.target.value })} />
        <p className="sk-prent sk-malsgr">{gogn.inngangur}</p>
      </div>}
      {synaKafla("spjold") && <div className="sk-haedaspjold" id="k-yfirlit">
        {haedaspjold.map((h) => <div key={h.haed}>
          <div><span>{haedHeiti(h.haed)}</span><em className={h.p >= 95 ? "ok" : h.p >= 75 ? "vinna" : "eftir"}>{h.klar >= h.mark ? "Lokið" : h.p >= 95 ? "Á lokastigi" : "Í vinnslu"}</em></div>
          <b>{h.p} %</b>
          <i><u style={{ width: `${Math.min(100, h.p)}%` }} className={h.p >= 95 ? "ok" : ""} /></i>
          <small>{num(h.klar)} af {num(h.mark)} stökum verkum{haedUndir(h.haed) ? ` · ${haedUndir(h.haed)}` : ""}</small>
        </div>)}
      </div>}

      {synaKafla("forsendur") && <div className="sk-forsendur">
        <h2>Forsendur og fyrirvarar</h2>
        <ul>
          <li><b>Gögnin:</b> skráningar Brunahólfs í Ajour. Hver þétting er skráð með staðsetningu á teikningu, flokki, starfsmanni, dagsetningu og að jafnaði myndum.{nyjast ? ` Nýjasta kláraða skráning í þessari skýrslu er frá ${dmy(nyjast)}.` : ""}</li>
          <li><b>Einingar:</b> tölur eru stök verk, þ.e. þétting öðrum megin við vegg. Tvö stök verk eru ein lokun; í gólfi er eitt verk ein þétting.</li>
          <li><b>„Áætlað“ er áætlaður fjöldi, ekki talning á öllum götum.</b> Á 6. hæð er áætlunin það sem er skráð (klárað og opið), svo hlutfallið þar sýnir hve stórum hluta skráðra þéttinga er lokið. Á 5. hæð er miðað við sama flokk á sömu deild á 6. hæð. Milliloft: {GOLF_MARK} á deild; á gólfi 5. hæðar þó aldrei færri en skráð eru á sömu deild á 5. hæð, og við bætast stútar af 5. hæð niður í inntaksrými 4. hæðar sem eiga enga skráningu enn (viðbótarverk, 12.11.2026). Rafmagn: {RAF_MARK} á deild. Prósenturnar eru því mat á framvindu og staðfesta ekki einar sér að öllum götum hafi verið lokað.</li>
          <li><b>Staðsetning punkta:</b> punktarnir eru settir á teikningu á verkstað.{faerdirN ? ` ${num(faerdirN)} punktar hafa verið færðir að næsta skurðpunkti lagnar og brunaveggjar á teikningunni (sjálfvirkt, að miðgildi 0,3 m og mest 1,0 m); skráð staða í Ajour er óbreytt.` : ""}</li>
          <li><b>Afstemming við Ajour:</b> í gögnunum eru {num(skr.length + ofanFra.n + faldarAnT.n)} skráningar, þar af {num(klaradAlls + ofanFra.done + faldarAnT.done)} kláraðar. {num(alls.klar)} þeirra eru taldar á móti áætlun. Hinar {num(klaradAlls + ofanFra.done + faldarAnT.done - alls.klar)} eru raufar (engin áætlun), aukaverk ({num(aukaAlls.done)} kláruð, sýnd sér), skráningar án teikningar ({num(taln.utanDone + faldarAnT.done)} merktar kláraðar; þeim verður eytt){ofanFra.n ? `, milliloft skráð ofan frá (${num(ofanFra.done)}, sjá næsta lið)` : ""} og flokkurinn „Annað“.</li>
          {ofanFra.n > 0 && <li><b>Milliloft skráð ofan frá:</b> {num(ofanFra.n)} {ofanFra.n % 10 === 1 && ofanFra.n % 100 !== 11 ? "skráning í milliloft á 6. hæð, deild S2, frá september til nóvember 2025 var skráð ofan frá. Í gólfi er aðeins neðri vinnan talin, svo hún er ekki talin með í þessari skýrslu." : "skráningar í milliloft á 6. hæð, deild S2, frá september til nóvember 2025 voru skráðar ofan frá. Í gólfi er aðeins neðri vinnan talin, svo þær eru ekki taldar með í þessari skýrslu."}</li>}
          <li><b>Skráningar án teikningar:</b> í Ajour eru {num(taln.utan + faldarAnT.n)} skráningar sem ekki eru settar á teikningu („Registrations without drawing“). Það eru vinnufærslur sem Brunahólf eyðir úr Ajour. Þær eru hvorki unnið verk né óunnið og teljast ekki með í tölum eða á kortum.</li>
        </ul>
      </div>}
      {synaKafla("kort") && yfirlit.length > 0 && (
        <section id="k-haedir">
          <h2>Staðan á hæðunum <small>Hver punktur er ein skráning á sínum stað · deildir skiptar í Norðurhlið, Center og Suðurhlið</small></h2>
          <Haedir yfirlit={yfirlit} punktar={hkPunktar} eftir={hkEftir} stutar={hkStutar} hopar={hkHopar} starfsmenn={starfsmenn} log={log} opidAnStadar={taln.utan - taln.utanDone + faldarAnT.n - faldarAnT.done} markDeild={markDeild} markHluta={markmidHluta} />
        </section>
      )}

      {synaKafla("flokkar") && (
        <section id="k-flokkar">
          <h2>Heild eftir flokkum <small>Allar hæðir og deildir · áætlað er summa deildanna</small></h2>
          <table className="sk-tafla sk-flokkar">
            <thead><tr><th>Flokkur</th><th>Klárað</th><th>Opið</th><th>Áætlað</th><th>%</th><th className="sk-stikud">Staða</th></tr></thead>
            <tbody>
              {flokkaheild.map((x) => { const p = x.mark ? pros(x.klar, x.mark) : null; return (
                <tr key={x.k}><td className="sk-v"><b>{x.nafn}</b></td><td>{num(x.done)}</td><td>{x.open ? num(x.open) : ""}</td><td>{x.mark ? num(x.mark) : "—"}</td><td><b>{p == null ? "—" : `${p} %`}</b></td><td className="sk-stikud">{p == null ? null : <i style={{ width: `${p}%` }} className={p < 75 ? "lagt" : ""} />}</td></tr>
              ); })}
              <tr className="sk-sum"><td className="sk-v">Heild með áætlun</td><td>{num(alls.klar)}</td><td></td><td>{num(alls.mark)}</td><td>{pros(alls.klar, alls.mark)} %</td><td className="sk-stikud"><i style={{ width: `${pros(alls.klar, alls.mark)}%` }} /></td></tr>
            </tbody>
          </table>
        </section>
      )}

      <section id="k-tolur" className={synaKafla("tafla") ? "" : "sk-falinn"}>
        <h2>Staða eftir hæð og deild</h2>
        <p className="sk-smatt">Tölur eru stök verk eins og þau eru skráð. Heild: <b>{num(alls.klar)}</b> af <b>{num(alls.mark)}</b> = <b>{pros(alls.klar, alls.mark)} %</b>.<span className="sk-skjar"> Reitirnir Klárað og Áætlað eru breytanlegir; tómur reitur notar reiknaða gildið.</span></p>
        {radir.map((r) => {
          const hs = summa(r.deildir.flatMap((d) => d.hopar));
          return (
            <div key={r.haed} className="sk-haed">
              <h3>{haedHeiti(r.haed)} <span>{haedUndir(r.haed) ? `${haedUndir(r.haed)} · ` : ""}{num(hs.klar)} af {num(hs.mark)} · {pros(hs.klar, hs.mark)} %</span></h3>
              <table className="sk-tafla">
                <thead><tr><th>Deild</th><th>Flokkur</th><th>Skráð klárað</th><th>Opið</th><th>Klárað</th><th>Áætlað</th><th>%</th><th className="sk-stikud">Staða</th><th>Athugasemd</th></tr></thead>
                <tbody>
                  {r.deildir.map((d) => {
                    const ds = summa(d.hopar);
                    const synaSt = !gogn.an_staerda, nRod = d.hopar.length + 1 + (synaSt ? d.hopar.reduce((a, h) => a + h.staerdir.length, 0) : 0);
                    return d.hopar.length ? [
                      ...d.hopar.flatMap((h, i) => [
                        <tr key={h.lykill}>
                          {i === 0 && <td rowSpan={nRod} className="sk-deild">{d.deild === "—" ? "Án deildar" : <>Deild {d.deild}</>}<small>{haedHeiti(r.haed)}</small></td>}
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
                      <tr key={d.deild + "-s"} className="sk-sum"><td className="sk-v">{d.deild === "—" ? "Án deildar alls" : `Deild ${d.deild} alls`} · {haedHeiti(r.haed)}</td><td></td><td></td><td>{ds.mark ? num(ds.klar) : "—"}</td><td>{ds.mark ? num(ds.mark) : "—"}</td><td>{ds.mark ? `${pros(ds.klar, ds.mark)} %` : "—"}</td><td className="sk-stikud">{ds.mark ? <i style={{ width: `${pros(ds.klar, ds.mark)}%` }} /> : null}</td><td></td></tr>,
                    ] : null;
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
        <p className="sk-smatt">Sjálfgefin áætlun: 6. hæð = það sem er klárað; 5. hæð = sami flokkahópur á sömu deild á 6. hæð (loftræsting kvörðuð við talningu á 5. hæð), en aldrei minna en klárað + opið; milliloft {GOLF_MARK} á deild á 5. hæð og á gólfi 5. hæðar, þar þó aldrei færri en skráð eru í milliloft á sömu deild á 5. hæð. Rafmagn: {RAF_MARK} stök verk á deild á 5. og 6. hæð, og telst með í samtölum. Raufar við kantaða stokka hafa enga reiknaða áætlun: þar birtist prósenta aðeins ef áætlun er slegin inn, og sú lína telst þá fyrst með í samtölum. „Án deildar" eru skráningar á teikningum sem skiptast ekki á deildir. Stærðarlínurnar (inndregnar) sýna skráningar per stærð. Áætlun stærðar er áætlun flokksins skipt á stærðirnar: hver stærð fær fyrst það sem er skráð (klárað + opið), og því sem þá vantar upp á áætlun flokksins er á 5. hæð skipt eftir sömu stærð á sömu deild á 6. hæð. Summa stærða er því áætlun flokksins. Stærðaflokkun er ekki alltaf eins milli hæða, svo áætlun stærðar er viðmið; prósentan sem gildir er flokksins. Utan hæða og hópa (skráningar án hæðar, Annað og Guide point{gogn.aukaverk_med ? ", aukaverk" : ""}): {num(taln.utan)} skráningar, þar af {num(taln.utanDone)} kláraðar — þær eru ekki í töflunum hér að ofan.{aukaRadir.length ? " Aukaverk eru í sér kafla hér að neðan." : ""}</p>
      </section>

      {aukaRadir.length > 0 && synaKafla("aukaverk") && (
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

      {taln.utan > 0 && synaKafla("anstadar") && (
        <section id="k-anstadar">
          <h2>Skráningar án teikningar <small>„Registrations without drawing“ í Ajour · færslur sem verður eytt</small></h2>
          <p className="sk-smatt"><b>{num(taln.utan)}</b> skráningar í Ajour eru ekki settar á teikningu: {num(taln.utan - taln.utanDone)} opnar og {num(taln.utanDone)} merktar kláraðar. Þetta eru vinnufærslur sem Brunahólf eyðir úr Ajour; þær eru ekki óunnið verk og teljast hvorki á kortunum né í tölum hæðanna.</p>
          <table className="sk-tafla sk-auka">
            <thead><tr><th>Flokkur</th><th>Klárað</th><th>Opið</th><th>Alls</th></tr></thead>
            <tbody>
              {utanRadir.map((r) => <tr key={r.heiti}><td className="sk-v">{r.heiti}</td><td>{r.done ? num(r.done) : ""}</td><td>{r.open ? num(r.open) : ""}</td><td>{num(r.done + r.open)}</td></tr>)}
              <tr className="sk-sum"><td className="sk-v">Án teikningar alls</td><td>{num(taln.utanDone)}</td><td>{num(taln.utan - taln.utanDone)}</td><td>{num(taln.utan)}</td></tr>
            </tbody>
          </table>
        </section>
      )}

      <section id="k-utbod" className={synaKafla("utbod") ? "" : "sk-falinn"}>
        <h2>Samanburður við upprunalegt útboð <small>Lokið í einingum tilboðs · strikið er útboðsmagnið</small></h2>
        <div className="sk-ustikur">
          {utbodStikur.map((u) => <div key={u.nr}>
            <span>{u.nr}</span>
            <div><b>{u.heiti}</b><i><u style={{ width: `${Math.min(100, u.p / 1.5)}%` }} className={u.p > 100 ? "yfir" : u.p >= 75 ? "ok" : ""} /><s /></i></div>
            <em><b>{u.p} %</b><small>{num(u.lokid, 1)} af {num(u.magn)} {u.ein}</small></em>
          </div>)}
        </div>
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

      {synaKafla("efni") && (
        <section id="k-efni">
          <h2>Efni og kerfi <small>Brunaþéttiefnin sem notuð eru í verkinu</small></h2>
          <Efni />
        </section>
      )}

      {synaKafla("verkferli") && (
        <section id="k-verkferli">
          <h2>Verkferli <small>Frá skoðun gats að skráðri og staðfestri þéttingu</small></h2>
          <Verkferli gogn={gogn} onChange={breyta} les={les} />
        </section>
      )}

      <section className={synaKafla("texti") ? "" : "sk-falinn"}>
        <textarea className="sk-texti" rows={3} placeholder="Lokaorð / næstu skref (valfrjálst) …" value={gogn.lok ?? ""} onChange={(e) => breyta({ lok: e.target.value })} />
        <p className="sk-prent sk-malsgr">{gogn.lok}</p>
      </section>
      </div>
      </div>
      </div>
    </div>
  );
}
