"use client";

/* Gatakort (11.11.2026): allar skráningar verks á yfirlitsteikningu (brunayfirlit með rauðum brunaveggjum) eða stakri
 * Ajour-teikningu, með LÖGUM (fagteikningar: loftræsting, sprinkler, vatn …; áætluð göt) og SÍUM (deild, tegund/stærð,
 * staða, starfsmaður, tímabil, lagfæringar, tvítök). Les skr_* beint; greiningin (deild, lagf, tvítak) er reiknuð í
 * tools/skraning-gatakort-innflutningur.cjs og geymd í skr_skraningar.ajour_gogn.
 *   /kjarni/skraning/kort[?verk=ID]
 * Skrif: aðeins áætluð göt (skr_aaetlud) og lög (skr_log) — við smell, aldrei í lykkju. Skráningum er ekki breytt hér.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sb, publicUrl, hladaUpp } from "../lib/sb";

type Vorpun = { a: number; e: number; f: number; b?: number; c?: number; d?: number };
/** Skarpar flísar (kvardi × upplausn grunnmyndar), hlaðið aðeins fyrir það sem sést þegar stækkað er inn. */
type Flisar = { kvardi: number; bx: number; by: number; dalkar: number; radir: number; slod: string; ending: string; til: string[] };
const FLISA_MORK = 1.15;   // skjápixlar per grunnmyndarpixil: þar yfir eru flísar notaðar
const FLISA_HAMARK = 24;   // mest þetta margar flísar í minni (hver ~15 MB afkóðuð)
type Verk = { id: number; heiti: string };
type Teikning = { id: number; heiti: string; haed: string | null; tegund: string; mynd_path: string | null; breidd_px: number | null; haed_px: number | null; yfirlit_id: number | null; vorpun: Vorpun | null; deildir: string[] | null; flisar: Flisar | null };
type Skr = { id: number; radnr: number; ajour_serial: number | null; teikning_id: number | null; x_px: number | null; y_px: number | null; flokkur_id: number | null; starfsmadur_id: number | null; stada: string; framkvaemt_til: string | null; deild: string | null; lagf: string | null; tvitak_af: number | null };
type Flokkur = { id: number; heiti: string };
type Starfsm = { id: number; numer: number | null; nafn: string | null };
type Lag = { id: number; teikning_id: number; heiti: string; fag: string; mynd_path: string | null; breidd_px: number | null; haed_px: number | null; vorpun: Vorpun | null; gegnsaei: number; synilegt: boolean; flisar: Flisar | null };
type Aaetlad = { id: number; teikning_id: number; x_px: number; y_px: number; fag: string; fjoldi: number; athugasemd: string | null; flokkur_id: number | null; parad: Parad | null };
/** Pörun áætlaðs gats við skráningar — reiknuð af tools/skraning-gatakort-para.cjs. */
type Parad = { ids: number[]; radnr: number[]; n: number; stada: "fullt" | "hluti" | "vantar"; reiknad?: string };
const AA_SEL = "id,teikning_id,x_px,y_px,fag,fjoldi,athugasemd,flokkur_id,parad";
const PARAD: Record<string, [string, string]> = { fullt: ["Fullt", "#86efac"], hluti: ["Vantar hluta", "#fde047"], vantar: ["Engin skráning", "#fca5a5"] };
// Flokkar (stærðir) sem eiga við hvert fag — notað til að stinga upp á stærð þegar áætlað gat er sett.
const FAG_FLOKKAR: Record<string, RegExp> = { loftraesting: /^(Loft|Raufar)/i, sprinkler: /^Stál/i, vatn: /^(Stál|Plast)/i, hiti: /^(Stál|Plast)/i, fravatn: /^(Stál|Plast)/i, gas: /^(Stál|Plast)/i, rafmagn: /^Raf/i, golf: /^Gólf/i };
type Nanar = { lysing: string | null; myndir: number; teikning: string | null; lagf_dags: string | null; a_stad: number | null; created_at: string };
type Punktur = { s: Skr; x: number; y: number; t: Takn };
type Takn = { logun: "x" | "o" | "t" | "s" | "d"; litur: string; r: number; heiti: string; hopur: string };

const FOG: [string, string, string][] = [["loftraesting", "Loftræsting", "#2563eb"], ["sprinkler", "Sprinkler", "#dc2626"], ["vatn", "Vatnslagnir", "#0891b2"], ["fravatn", "Frárennsli", "#7c2d12"], ["rafmagn", "Rafmagn", "#067429"], ["hiti", "Hiti", "#f97316"], ["gas", "Gas", "#9333ea"], ["golf", "Milliloft", "#0f766e"], ["annad", "Annað", "#6b7280"]];
const fagLitur = (f: string) => (FOG.find((x) => x[0] === f) || FOG[FOG.length - 1])[2];
const fagHeiti = (f: string) => (FOG.find((x) => x[0] === f) || FOG[FOG.length - 1])[1];
const HOPAR = ["Loft", "Stál", "Plast", "Gólf", "Rafmagn", "Annað"];
const ROD = ["Loft 125-160", "Loft 200-315", "Loft 400-630", "Loft annað", "Stál 15-35", "Stál 40-50", "Stál 75-110", "Stál 110-160", "Plast 20-34", "Plast 35-50", "Plast 75-100", "Milliloft", "Rafmagn", "Annað"];
const RAF = /Raf|Raufar/i;

/* Tákn eftir tegund og stærð — sama kerfi og á Landspítalasíðu hubsins: kross = loftræsting, hringur = stálrör,
 * þríhyrningur = plaströr, ferningur = milliloft, tígull = rafmagn; litur og stærð = stærðarflokkur. */
function takn(c: string): Takn {
  const m = /(\d+)\s*-\s*(\d+)/.exec(c), lo = m ? +m[1] : 0;
  if (/^Loft/i.test(c)) return !m ? { logun: "x", litur: "#64748b", r: 3.6, heiti: "Loft annað", hopur: "Loft" } : lo >= 400 ? { logun: "x", litur: "#c026d3", r: 5.2, heiti: "Loft 400-630", hopur: "Loft" } : lo >= 200 ? { logun: "x", litur: "#7c3aed", r: 4.4, heiti: "Loft 200-315", hopur: "Loft" } : { logun: "x", litur: "#2563eb", r: 3.6, heiti: "Loft 125-160", hopur: "Loft" };
  if (/^Stál/i.test(c)) return lo >= 110 ? { logun: "o", litur: "#7c2d12", r: 4.6, heiti: "Stál 110-160", hopur: "Stál" } : lo >= 75 ? { logun: "o", litur: "#c2410c", r: 3.9, heiti: "Stál 75-110", hopur: "Stál" } : lo >= 40 ? { logun: "o", litur: "#f97316", r: 3.2, heiti: "Stál 40-50", hopur: "Stál" } : { logun: "o", litur: "#fbbf24", r: 2.7, heiti: "Stál 15-35", hopur: "Stál" };
  if (/^Plast/i.test(c)) return lo >= 75 ? { logun: "t", litur: "#155e75", r: 4.8, heiti: "Plast 75-100", hopur: "Plast" } : lo >= 35 ? { logun: "t", litur: "#0891b2", r: 4.1, heiti: "Plast 35-50", hopur: "Plast" } : { logun: "t", litur: "#22d3ee", r: 3.4, heiti: "Plast 20-34", hopur: "Plast" };
  if (/^Gólf/i.test(c)) return { logun: "s", litur: "#0f766e", r: 3.8, heiti: "Milliloft", hopur: "Gólf" };
  if (RAF.test(c)) return { logun: "d", litur: "#067429", r: 4, heiti: "Rafmagn", hopur: "Rafmagn" };
  return { logun: "s", litur: "#9ca3af", r: 2.6, heiti: "Annað", hopur: "Annað" };
}
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
  const [aaStada, setAaStada] = useState("allt"); // sía áætlaðra gata eftir pörunarstöðu
  const [synaSkr, setSynaSkr] = useState(true); const [synaAaetlud, setSynaAaetlud] = useState(true);
  const [baetaFag, setBaetaFag] = useState(""); // fag áætlaðs gats sem er verið að setja (tómt = ekki í setja-ham)
  const [baetaFlokkur, setBaetaFlokkur] = useState<number | "">(""); const [baetaFjoldi, setBaetaFjoldi] = useState(2); // stærð (flokkur) og stök verk nýs gats
  const [valinn, setValinn] = useState<{ p?: Punktur; a?: Aaetlad; nanar?: Nanar | null } | null>(null);
  const [myndTeljari, setMyndTeljari] = useState(0); // hækkar þegar mynd hleðst → endurteikna

  const cnvRef = useRef<HTMLCanvasElement | null>(null);
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
        const [t, f, m, l, a] = await Promise.all([
          s.from("skr_teikningar").select("id,heiti,haed,tegund,mynd_path,breidd_px,haed_px,yfirlit_id,vorpun,deildir,flisar").eq("verk_id", vk.id).eq("eytt", false).order("rod").order("id"),
          s.from("skr_flokkar").select("id,heiti").or(`verk_id.eq.${vk.id},verk_id.is.null`),
          s.from("skr_starfsmenn").select("id,numer,nafn").order("numer"),
          s.from("skr_log").select("id,teikning_id,heiti,fag,mynd_path,breidd_px,haed_px,vorpun,gegnsaei,synilegt,flisar").eq("verk_id", vk.id).eq("eytt", false).order("rod").order("id"),
          s.from("skr_aaetlud").select(AA_SEL).eq("verk_id", vk.id).eq("eytt", false),
        ]);
        const err = t.error || f.error || m.error || l.error || a.error; if (err) throw new Error(err.message);
        const tt = t.data as Teikning[];
        setTeikn(tt); setFlokkar(f.data as Flokkur[]); setMenn(m.data as Starfsm[]); setLog(l.data as Lag[]); setAaetlud(a.data as Aaetlad[]);
        setSyn((tt.find((x) => x.tegund === "yfirlit") || tt[0])?.id ?? null);
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
    const out: Punktur[] = [];
    for (const s of skr) {
      if (s.teikning_id == null || s.x_px == null || s.y_px == null || !born.has(s.teikning_id)) continue;
      const v = born.get(s.teikning_id);
      out.push({ s, x: v ? v.a * +s.x_px + v.e : +s.x_px, y: v ? v.a * +s.y_px + v.f : +s.y_px, t: (s.flokkur_id != null && taknAf.get(s.flokkur_id)) || ANNAD });
    }
    return out;
  }, [teikning, teikn, skr, taknAf, ANNAD]);
  const deildir = useMemo(() => [...new Set(punktar.map((p) => p.s.deild).filter((d): d is string => !!d))].sort(), [punktar]);
  /** Skráningar sem eru paraðar við eitthvert áætlað gat á þessu blaði. */
  const paradIds = useMemo(() => { const m = new Set<number>(); for (const a of aaetlud) if (a.teikning_id === syn && a.parad) for (const id of a.parad.ids) m.add(id); return m; }, [aaetlud, syn]);
  /** Sía án táknasíunnar — skýringarnar sýna þá réttan fjölda per tákn. */
  const siaAn = useCallback((p: Punktur) => {
    const s = p.s;
    if (s.deild && afDeild[s.deild]) return false;
    if (madur && String(s.starfsmadur_id) !== madur) return false;
    if (fra && (!s.framkvaemt_til || s.framkvaemt_til.slice(0, 7) < fra)) return false;
    if (til && (!s.framkvaemt_til || s.framkvaemt_til.slice(0, 7) > til)) return false;
    if (lagf === "lagf" && !s.lagf) return false;
    if (lagf !== "allt" && lagf !== "lagf" && s.lagf !== lagf) return false;
    if (tvitok && !s.tvitak_af) return false;
    if (oparad && paradIds.has(s.id)) return false;
    return true;
  }, [afDeild, madur, fra, til, lagf, tvitok, oparad, paradIds]);
  /** Staða: Tilbúin = kláraðar skráningar · Í vinnslu = ókláraðar skráningar · Eftir = engar skráningar sýndar (aðeins rauðir punktar áætlaðra gata). */
  const grunnsia = useCallback((p: Punktur) => siaAn(p) && (stada === "allt" || (stada === "done" ? p.s.stada === "done" : stada === "opid" ? p.s.stada !== "done" : false)), [siaAn, stada]);
  const grunn = useMemo(() => punktar.filter(grunnsia), [punktar, grunnsia]);
  const syndir = useMemo(() => grunn.filter((p) => !afTakn[p.t.heiti]), [grunn, afTakn]);
  const aaetludBlads = useMemo(() => aaetlud.filter((a) => a.teikning_id === syn), [aaetlud, syn]);
  /** Tákn (stærðarflokkur) áætlaðs gats — sama flokkun og skráningar, svo stærðarsían gildir um hvort tveggja. */
  const aaTakn = useCallback((a: Aaetlad) => (a.flokkur_id != null && taknAf.get(a.flokkur_id)) || takn(a.fag === "rafmagn" ? "Raf" : a.fag === "golf" ? "Gólf" : "Annað"), [taknAf]);
  const aaEftir = (a: Aaetlad) => !a.parad || a.parad.stada === "vantar";   // engin skráning parast: handvirkur punktur eða merki án skráningar
  const aaStodusia = useCallback((a: Aaetlad) => {
    if (aaStada !== "allt" && (a.parad?.stada ?? "oreiknad") !== aaStada) return false;
    if (stada === "done") return false;
    if (stada === "opid") return a.parad?.stada === "hluti";
    if (stada === "eftir") return aaEftir(a);
    return true;
  }, [aaStada, stada]);
  const aaetludSynar = useMemo(() => aaetludBlads.filter((a) => aaStodusia(a) && !afTakn[aaTakn(a).heiti]), [aaetludBlads, aaStodusia, afTakn, aaTakn]);
  const stoduTal = useMemo(() => { let d = 0, o = 0; for (const q of punktar) if (siaAn(q) && !afTakn[q.t.heiti]) { if (q.s.stada === "done") d++; else o++; } const e = aaetludBlads.filter((a) => aaEftir(a) && !afTakn[aaTakn(a).heiti]).length; return { allt: d + o, done: d, opid: o, eftir: e }; }, [punktar, siaAn, afTakn, aaetludBlads, aaTakn]);
  const taknTal = useMemo(() => {
    const m = new Map<string, { t: Takn; n: number }>();
    for (const q of punktar) if (siaAn(q) && !m.has(q.t.heiti)) m.set(q.t.heiti, { t: q.t, n: 0 });
    for (const q of grunn) m.get(q.t.heiti)!.n++;
    if (stada !== "allt") for (const a of aaetludBlads) if (aaStodusia(a)) { const t = aaTakn(a), x = m.get(t.heiti); if (x) x.n++; else m.set(t.heiti, { t, n: 1 }); }
    return [...m.values()].sort((a, b) => ROD.indexOf(a.t.heiti) - ROD.indexOf(b.t.heiti));
  }, [punktar, siaAn, grunn, stada, aaetludBlads, aaStodusia, aaTakn]);
  const samantekt = useMemo(() => {
    const rod = new Map<string, { kl: number[]; op: number[] }>();
    for (const p of syndir) { const d = p.s.deild || "—"; let r = rod.get(d); if (!r) { r = { kl: HOPAR.map(() => 0), op: HOPAR.map(() => 0) }; rod.set(d, r); } const i = HOPAR.indexOf(p.t.hopur); (p.s.stada === "done" ? r.kl : r.op)[i]++; }
    return [...rod.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [syndir]);
  const logSynar = useMemo(() => log.filter((l) => l.teikning_id === syn), [log, syn]);
  const manudir = useMemo(() => [...new Set(skr.map((s) => (s.framkvaemt_til || "").slice(0, 7)).filter(Boolean))].sort(), [skr]);
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
    const dpr = window.devicePixelRatio || 1, cw = kassi.clientWidth, ch = kassi.clientHeight;
    if (cnv.width !== Math.round(cw * dpr) || cnv.height !== Math.round(ch * dpr)) { cnv.width = Math.round(cw * dpr); cnv.height = Math.round(ch * dpr); }
    const cx = cnv.getContext("2d"); if (!cx) return;
    const { k, tx, ty, k0 } = sjon.current;
    cx.setTransform(1, 0, 0, 1, 0, 0); cx.fillStyle = "#fff"; cx.fillRect(0, 0, cnv.width, cnv.height);
    cx.setTransform(dpr * k, 0, 0, dpr * k, dpr * tx, dpr * ty);
    // Skarpar flísar: sýnilegt svæði í grunnmyndarhnitum → flísar sem þarf; teiknað aðeins þegar ALLAR sýnilegar flísar lags eru
    // hlaðnar (annars grófa myndin áfram), svo gegnsæ lög teiknist aldrei tvisvar.
    flisRammi.current++;
    const skarpt = k * dpr >= FLISA_MORK, sx0 = -tx / k, sy0 = -ty / k, sx1 = (cw - tx) / k, sy1 = (ch - ty) / k;
    const teiknaFlisar = (f: Flisar | null, alfa: number): boolean => {
      if (!skarpt || !f || !f.til?.length) return false;
      const bw = f.bx / f.kvardi, bh = f.by / f.kvardi, tilSett = new Set(f.til), tharf: [number, number][] = [];
      for (let r = Math.max(0, Math.floor(sy0 / bh)); r <= Math.min(f.radir - 1, Math.floor(sy1 / bh)); r++) for (let c = Math.max(0, Math.floor(sx0 / bw)); c <= Math.min(f.dalkar - 1, Math.floor(sx1 / bw)); c++) if (tilSett.has(`${c}_${r}`)) tharf.push([c, r]);
      if (tharf.length > 12) return false;   // of stórt svæði fyrir flísar: grófa myndin dugar
      const hlada = tharf.map(([c, r]) => [flis(`${f.slod}/${c}_${r}.${f.ending}`), c, r] as [HTMLImageElement | null, number, number]);
      if (hlada.some((h) => !h[0])) return false;
      cx.save(); cx.globalAlpha = alfa; for (const [im, c, r] of hlada) cx.drawImage(im!, c * bw, r * bh, bw + 0.4 / k, bh + 0.4 / k); cx.restore();
      return true;
    };
    const grunnur = mynd(teikning.mynd_path); if (grunnur) cx.drawImage(grunnur, 0, 0, W, H);
    teiknaFlisar(teikning.flisar, 1);
    for (const l of logSynar) {
      if (!l.synilegt) continue;
      const eins = !l.vorpun || (l.vorpun.a === 1 && !l.vorpun.e && !l.vorpun.f && !l.vorpun.b && !l.vorpun.c && (l.vorpun.d ?? 1) === 1);
      if (eins && l.vorpun && teiknaFlisar(l.flisar, Number(l.gegnsaei))) continue;
      const im = mynd(l.mynd_path); if (!im) continue;
      const v = l.vorpun || { a: W / (l.breidd_px || im.naturalWidth), e: 0, f: 0 };
      cx.save(); cx.globalAlpha = Number(l.gegnsaei); cx.transform(v.a, v.b || 0, v.c || 0, v.d ?? v.a, v.e, v.f); cx.drawImage(im, 0, 0); cx.restore();
    }
    const zs = Math.max(0.75, Math.min(3.2, Math.sqrt(k / k0) * 0.9)) / k; // táknstærð í skjápixlum, vex hægt með stækkun
    if (synaSkr) for (const umf of [1, 0]) for (const p of syndir) {
      const kl = p.s.stada === "done"; if ((kl ? 1 : 0) !== umf) continue;
      const r = p.t.r * zs;
      slod(cx, p.t.logun, p.x, p.y, r);
      if (p.t.logun === "x") { cx.lineCap = "round"; cx.lineWidth = Math.max(1 / k, r * 0.5); cx.strokeStyle = kl ? p.t.litur : "#dc2626"; cx.stroke(); }
      else if (kl) { cx.fillStyle = p.t.litur + "d8"; cx.fill(); cx.lineWidth = 0.6 / k; cx.strokeStyle = "rgba(22,21,19,.45)"; cx.stroke(); }
      else { cx.fillStyle = "#ffffffe6"; cx.fill(); cx.lineWidth = 2 / k; cx.strokeStyle = "#dc2626"; cx.stroke(); }
      if (!kl) { cx.beginPath(); cx.arc(p.x, p.y, r + 3.5 * zs, 0, 6.2832); cx.lineWidth = 1.6 / k; cx.strokeStyle = "#dc2626"; cx.stroke(); }
      if (p.s.lagf) { cx.beginPath(); cx.arc(p.x, p.y, r + 2.2 * zs, 0, 6.2832); cx.lineWidth = 1.3 / k; cx.strokeStyle = p.s.lagf === "B" ? "#b45309" : p.s.lagf === "A" ? "#111827" : "#6b7280"; cx.setLineDash([3 / k, 2 / k]); cx.stroke(); cx.setLineDash([]); }
    }
    if (synaAaetlud) for (const a of aaetludSynar) {
      if (aaEftir(a)) { slod(cx, "o", +a.x_px, +a.y_px, 5.6 * zs); cx.fillStyle = "#dc2626"; cx.fill(); cx.lineWidth = 1.6 / k; cx.strokeStyle = "#ffffff"; cx.stroke(); continue; }
      const r = 6.5 * zs; slod(cx, "d", +a.x_px, +a.y_px, r);
      cx.fillStyle = (PARAD[a.parad!.stada]?.[1] ?? "#ffffff") + "dd"; cx.fill(); cx.lineWidth = 2 / k; cx.strokeStyle = fagLitur(a.fag); cx.setLineDash([4 / k, 2.5 / k]); cx.stroke(); cx.setLineDash([]);
    }
    const v = valinn?.p ? { x: valinn.p.x, y: valinn.p.y } : valinn?.a ? { x: +valinn.a.x_px, y: +valinn.a.y_px } : null;
    if (v) { cx.beginPath(); cx.arc(v.x, v.y, 11 * zs, 0, 6.2832); cx.lineWidth = 2.5 / k; cx.strokeStyle = "#111827"; cx.stroke(); }
  }, [teikning, W, H, mynd, flis, logSynar, syndir, aaetludSynar, synaSkr, synaAaetlud, valinn]);
  const bidjaUmTeikningu = useCallback(() => { cancelAnimationFrame(raf.current); raf.current = requestAnimationFrame(teikna); }, [teikna]);
  useEffect(() => { bidjaUmTeikningu(); }, [bidjaUmTeikningu, myndTeljari]);

  // passa má EKKI hanga á teiknifallinu: það breytist við hverja síu og hvert lag, og þá núllstilltist stækkunin (11.11.2026).
  const bidjaRef = useRef(bidjaUmTeikningu);
  useEffect(() => { bidjaRef.current = bidjaUmTeikningu; }, [bidjaUmTeikningu]);
  const passa = useCallback(() => {
    const kassi = kassiRef.current; if (!kassi) return;
    const k = Math.min(kassi.clientWidth / W, kassi.clientHeight / H);
    sjon.current = { k, k0: k, tx: (kassi.clientWidth - W * k) / 2, ty: (kassi.clientHeight - H * k) / 2 };
    bidjaRef.current();
  }, [W, H]);
  useEffect(() => { passa(); }, [passa, syn]);
  useEffect(() => { const f = () => { const kassi = kassiRef.current; if (kassi) sjon.current.k0 = Math.min(kassi.clientWidth / W, kassi.clientHeight / H); bidjaUmTeikningu(); }; window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, [W, H, bidjaUmTeikningu]);

  // ---------------------------------------------------------------- bendill: færa, stækka, velja, setja áætlað gat
  const bendlar = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ x: number; y: number; hreyft: number; klipa: number } | null>(null);
  const stadur = (e: { clientX: number; clientY: number }) => { const r = kassiRef.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
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
  };
  const hreyfa = (e: React.PointerEvent) => {
    if (!bendlar.current.has(e.pointerId) || !drag.current) return;
    const p = stadur(e), fyrri = bendlar.current.get(e.pointerId)!; bendlar.current.set(e.pointerId, p);
    const b = [...bendlar.current.values()];
    if (b.length === 2) { const d = Math.hypot(b[0].x - b[1].x, b[0].y - b[1].y); if (drag.current.klipa) staekka((b[0].x + b[1].x) / 2, (b[0].y + b[1].y) / 2, d / drag.current.klipa); drag.current.klipa = d; drag.current.hreyft = 99; return; }
    sjon.current.tx += p.x - fyrri.x; sjon.current.ty += p.y - fyrri.y; drag.current.hreyft += Math.abs(p.x - fyrri.x) + Math.abs(p.y - fyrri.y); bidjaUmTeikningu();
  };
  const upp = async (e: React.PointerEvent) => {
    const var_ = bendlar.current.has(e.pointerId); bendlar.current.delete(e.pointerId);
    const d = drag.current; if (!bendlar.current.size) drag.current = null;
    if (!var_ || !d || d.hreyft > 6 || !teikning || !verk) return;
    const p = stadur(e), s = sjon.current, wx = (p.x - s.tx) / s.k, wy = (p.y - s.ty) / s.k;
    if (baetaFag) {
      if (wx < 0 || wy < 0 || wx > W || wy > H) return;
      const r = await sb().from("skr_aaetlud").insert({ verk_id: verk.id, teikning_id: teikning.id, x_px: Math.round(wx * 10) / 10, y_px: Math.round(wy * 10) / 10, fag: baetaFag, flokkur_id: baetaFlokkur === "" ? null : baetaFlokkur, fjoldi: baetaFjoldi > 0 ? baetaFjoldi : 1, uppruni: "handvirkt" }).select(AA_SEL).single();
      if (r.error) { setVilla(r.error.message); return; }
      setAaetlud((a) => [...a, r.data as Aaetlad]); return;
    }
    const mork = 12 / s.k; let best: Punktur | null = null, bd = mork;
    if (synaSkr) for (const q of syndir) { const dd = Math.hypot(q.x - wx, q.y - wy); if (dd < bd) { bd = dd; best = q; } }
    let ba: Aaetlad | null = null; if (synaAaetlud) for (const a of aaetludSynar) { const dd = Math.hypot(+a.x_px - wx, +a.y_px - wy); if (dd < bd) { bd = dd; ba = a; } }
    if (ba) { setValinn({ a: ba }); return; }
    if (!best) { setValinn(null); return; }
    setValinn({ p: best, nanar: null });
    const r = await sb().from("skr_skraningar").select("lysing,created_at,ajour_gogn").eq("id", best.s.id).single();
    if (!r.error && r.data) { const g = (r.data.ajour_gogn || {}) as { myndir?: string[]; teikning?: string; lagf_dags?: string; a_stad?: number }; setValinn((v) => (v && v.p && v.p.s.id === best!.s.id ? { ...v, nanar: { lysing: r.data.lysing, created_at: r.data.created_at, myndir: (g.myndir || []).length, teikning: g.teikning || null, lagf_dags: g.lagf_dags || null, a_stad: g.a_stad ?? null } } : v)); }
  };

  // ---------------------------------------------------------------- lög og áætluð göt (skrif aðeins við smell)
  const breytaAaetludu = async (a: Aaetlad, breyting: Partial<Pick<Aaetlad, "flokkur_id" | "fjoldi" | "athugasemd" | "fag">>, vista = true) => {
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
    <div className="gk">
      <aside className="gk-hlid">
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
          <label className="gk-lag"><input type="checkbox" checked={synaSkr} onChange={(e) => setSynaSkr(e.target.checked)} /><span>Skráningar úr Ajour</span><small>{num(syndir.length)}</small></label>
          <label className="gk-lag"><input type="checkbox" checked={synaAaetlud} onChange={(e) => setSynaAaetlud(e.target.checked)} /><span>Áætluð göt</span><small>{num(aaetludSynar.length)}</small></label>
          {logSynar.map((l) => (
            <div key={l.id} className="gk-lag gk-lag-mynd">
              <label><input type="checkbox" checked={l.synilegt} onChange={(e) => breytaLagi(l, { synilegt: e.target.checked })} /><i style={{ background: fagLitur(l.fag) }} /><span title={l.heiti}>{fagHeiti(l.fag)} · {l.heiti}</span></label>
              <input type="range" min="0.1" max="1" step="0.05" value={l.gegnsaei} aria-label={`Gegnsæi ${l.heiti}`} onChange={(e) => breytaLagi(l, { gegnsaei: Number(e.target.value) }, false)} onPointerUp={(e) => breytaLagi(l, { gegnsaei: Number((e.target as HTMLInputElement).value) })} />
              <details><summary>Stilla af</summary>
                <div className="gk-vorpun">{(["a", "e", "f"] as const).map((kk) => <label key={kk}>{kk === "a" ? "Kvarði" : kk === "e" ? "x" : "y"}<input type="number" step={kk === "a" ? 0.001 : 1} value={(l.vorpun || { a: 1, e: 0, f: 0 })[kk]} onChange={(e) => breytaLagi(l, { vorpun: { ...(l.vorpun || { a: 1, e: 0, f: 0 }), [kk]: Number(e.target.value) } }, false)} onBlur={() => breytaLagi(l, { vorpun: l.vorpun })} /></label>)}</div>
              </details>
            </div>
          ))}
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
          {baetaFag ? <p className="gk-smatt gk-virkt">Smelltu á teikninguna þar sem lögnin fer gegnum brunavegg. Slökktu á hamnum þegar þú ert búinn.</p> : <p className="gk-smatt">{FOG.map((f) => [f, aaetludSynar.filter((a) => a.fag === f[0]).length] as const).filter((x) => x[1]).map(([f, n]) => `${f[1]} ${n}`).join(" · ") || "Engin áætluð göt skráð á þetta blað."}</p>}
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
        <div className={`gk-strigi${baetaFag ? " setja" : ""}`} ref={kassiRef} onPointerDown={nidur} onPointerMove={hreyfa} onPointerUp={upp} onPointerCancel={upp}>
          <canvas ref={cnvRef} />
        </div>
        <div className="gk-stjorn">
          <button type="button" onClick={() => { const k = kassiRef.current!; staekka(k.clientWidth / 2, k.clientHeight / 2, 1.5); }} aria-label="Stækka">+</button>
          <button type="button" onClick={() => { const k = kassiRef.current!; staekka(k.clientWidth / 2, k.clientHeight / 2, 1 / 1.5); }} aria-label="Minnka">−</button>
          <button type="button" onClick={passa}>Allt blaðið</button>
        </div>
        {valinn?.p && (
          <div className="gk-spjald">
            <button type="button" className="gk-x" onClick={() => setValinn(null)} aria-label="Loka">×</button>
            <h3>#{valinn.p.s.ajour_serial ?? valinn.p.s.radnr} <span className={valinn.p.s.stada === "done" ? "g" : "r"}>{valinn.p.s.stada === "done" ? "Klárað" : "Opið"}</span></h3>
            <dl>
              <dt>Flokkur</dt><dd>{fl(valinn.p.s.flokkur_id)}</dd>
              <dt>Deild</dt><dd>{valinn.p.s.deild || "—"}</dd>
              <dt>Starfsmaður</dt><dd>{nafn(valinn.p.s.starfsmadur_id)}</dd>
              <dt>Framkvæmt</dt><dd>{dmy(valinn.p.s.framkvaemt_til) || "—"}</dd>
              {valinn.nanar && <><dt>Teikning</dt><dd>{valinn.nanar.teikning || "—"}</dd><dt>Myndir í Ajour</dt><dd>{valinn.nanar.myndir}</dd></>}
            </dl>
            {valinn.p.s.lagf && <p className="gk-merki">{LAGF[valinn.p.s.lagf]}{valinn.nanar?.lagf_dags ? ` · ${dmy(valinn.nanar.lagf_dags)}` : ""}{valinn.nanar?.a_stad ? ` · á stað #${valinn.nanar.a_stad}` : ""}</p>}
            {valinn.p.s.tvitak_af && <p className="gk-merki">Á nákvæmlega sömu hnitum og #{valinn.p.s.tvitak_af}</p>}
            {valinn.nanar === null ? <p className="gk-smatt">Sæki lýsingu…</p> : valinn.nanar?.lysing ? <p className="gk-lysing">{valinn.nanar.lysing}</p> : null}
          </div>
        )}
        {valinn?.a && (
          <div className="gk-spjald">
            <button type="button" className="gk-x" onClick={() => setValinn(null)} aria-label="Loka">×</button>
            <h3>Áætlað gat <span style={{ color: fagLitur(valinn.a.fag) }}>{fagHeiti(valinn.a.fag)}</span></h3>
            <div className="gk-rod gk-tvo">
              <label>Stærð / flokkur<select value={valinn.a.flokkur_id ?? ""} onChange={(e) => breytaAaetludu(valinn.a!, { flokkur_id: e.target.value === "" ? null : Number(e.target.value) })}><option value="">— óvalið —</option>{(valinn.a.flokkur_id && !flokkarFags(valinn.a.fag).some((f) => f.id === valinn.a!.flokkur_id) ? [...flokkarFags(valinn.a.fag), ...flokkar.filter((f) => f.id === valinn.a!.flokkur_id)] : flokkarFags(valinn.a.fag)).map((f) => <option key={f.id} value={f.id}>{f.heiti}</option>)}</select></label>
              <label style={{ flex: "0 0 30%" }}>Stök verk<input type="number" min={1} step={1} value={valinn.a.fjoldi} onChange={(e) => breytaAaetludu(valinn.a!, { fjoldi: Math.max(1, Number(e.target.value) || 1) })} /></label>
            </div>
            {valinn.a.parad && <p className="gk-merki" style={{ background: PARAD[valinn.a.parad.stada]?.[1] + "66", color: "#1f2937" }}>{PARAD[valinn.a.parad.stada]?.[0]}: {valinn.a.parad.n} af {valinn.a.fjoldi} stökum verkum skráð{valinn.a.parad.radnr.length ? ` — ${valinn.a.parad.radnr.map((r) => "#" + r).join(", ")}` : ""}</p>}
            <label className="gk-rod">Athugasemd<textarea rows={3} value={valinn.a.athugasemd ?? ""} onChange={(e) => breytaAaetludu(valinn.a!, { athugasemd: e.target.value }, false)} onBlur={(e) => breytaAaetludu(valinn.a!, { athugasemd: e.target.value || null })} /></label>
            <button type="button" onClick={() => fjarlaegjaAaetlad(valinn.a!)}>Fjarlægja</button>
          </div>
        )}
      </div>
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
