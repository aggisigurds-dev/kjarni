"use client";

/* Stöðuskýrsla — hæðakortið (11.11.2026, Agnar: „skýrsluna byggða í kringum punktahæðina“, með síukerfi og tölum).
 * Hver hæð er sýnd með ÖLLUM skráningum á sínum stað (sýnin skr_haedarhnit: staða á yfirlitsblaðinu, færðir punktar ráða),
 * hver deild skipt í Norðurhlið / Center / Suðurhlið með stöðulit og prósentu, og tafla með sömu tölum undir.
 * Síurnar (flokkur, stærð, staða, deild, hæð, tímabil) gilda um kortið, hlutana og töflurnar í þessum kafla.
 * Prósenta er aðeins sýnd þegar markmið er skilgreint fyrir það sem er síað: engin stærðarsía og enginn „Frá“-mánuður.
 * Gagnvirkt (12.11.2026, Agnar: „geta sýnt nákvæmlega það sem maður vill sjá“): aðdráttur og færsla á hverri hæð, smellur á punkt
 * sýnir skráninguna (númer, flokkur, dagsetning, starfsmaður, myndafjöldi í Ajour), leit eftir skráningarnúmeri og framvindurit
 * eftir mánuðum þar sem smellur á mánuð sýnir stöðuna eins og hún var í lok hans.
 * Aðeins lestur — engin skrif.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { publicUrl, sb } from "../lib/sb";

export type HkPunktur = { kerfi: string | null; kvafi: boolean; kmynd: boolean; id: number; nr: number | null; haed: string; deild: string; hluti: string; x: number; y: number; hop: string | null; fl: string; done: boolean; man: string | null; dags: string | null };
/** Áætlað gat án skráningar („eftir“): n = stök verk sem vantar. */
export type HkEftir = { haed: string; deild: string; hluti: string; x: number; y: number; hop: string | null; n: number };
export type HkYfirlit = { id: number; haed: string; mynd: string | null; w: number; h: number };
type Props = {
  yfirlit: HkYfirlit[]; punktar: HkPunktur[]; eftir: HkEftir[];
  hopar: [string, string][];
  /** Nöfn starfsmanna (skr_starfsmenn) — sýnd á skráningarspjaldinu. */
  starfsmenn: Map<number, string>;
  /** Lagnateikningar (skr_log) per hæð og fag: sýndar ofan á hæðinni þegar síað er á kerfi stálröra. */
  log?: { haed: string; fag: string; mynd: string }[];
  /** Opnar skráningar í Ajour án teikningar. Ekki birt: þetta eru færslur sem Brunahólf eyðir (Agnar 12.11.2026), ekki óunnið verk. */
  opidAnStadar?: number;
  /** Markmið hóps á deild (með leiðréttingum úr töflunni) og á hluta deildar; null = ekkert markmið. */
  markDeild: (haed: string, deild: string, hop: string) => number | null;
  markHluta: (haed: string, deild: string, hluti: number, hop: string) => number | null;
};

const HAEDIR = ["6H", "5H", "4H"], DEILDIR = ["S1", "S2", "S4", "S5"];
const HLUTAR: [string, string][] = [["N", "Norður"], ["C", "Center"], ["S", "Suður"]];
// Álmurnar á yfirlitsblaðinu (útveggir, lesið af blaðinu): vinstri brún og breidd í % af breidd; hlutaskil í % af hæð (sömu skil og skr_haedarhnit).
const GEO: Record<string, [number, number]> = { S1: [0.85, 12.92], S2: [23.23, 13.94], S4: [63.35, 13.04], S5: [85.72, 12.99] };
const BIL: [number, number][] = [[2.3, 26.5], [28.8, 42.36], [71.16, 27.09]];
/** Lagnakerfi stálröra (skr_kerfi): lesið af lagnateikningum eftir nálægð — áætlun, ekki skráð í Ajour. */
const KERFI: [string, string][] = [["udi", "Úðakerfi"], ["vatn", "Vatn og hiti"], ["lyfjaloft", "Lyfjaloft"]];
/** Fag lagnateikningar (skr_log.fag) fyrir hvert kerfi. */
const KERFI_FAG: Record<string, string> = { udi: "sprinkler", vatn: "vatn", lyfjaloft: "gas" };
/** Fag teikningar fyrir flokkahóp: valinn hópur sýnir teikningu síns fags ofan á hæðinni. */
const HOP_FAG: Record<string, string> = { Loft: "loftraesting", Rafmagn: "rafmagn" };
const MAN = ["janúar", "febrúar", "mars", "apríl", "maí", "júní", "júlí", "ágúst", "september", "október", "nóvember", "desember"];
/** Litir hæðanna í framvinduritinu — sannprófaðir með validate_palette.js (litblinduaðskilnaður ΔE 12,8; ljós flötur). Fylgja hæðinni, ekki röðinni. */
const LITUR_H: Record<string, string> = { "6H": "#1d4f91", "5H": "#f07f1b", "4H": "#2a9d8f" };
const num = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const pros = (a: number, b: number) => (b > 0 ? Math.round((100 * a) / b) : 0);
const dmy = (d: string | null | undefined) => (d ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : "—");
/** Heiti hæðar í skýrslunni. 4. hæð er GÓLF 5. hæðar (Agnar 12.11.2026): þéttingar í gólfplötu 5. hæðar, unnar neðan frá á 4. hæð —
 *  hún er því hluti af verkinu á 5. og 6. hæð, ekki sér hæð. Lyklarnir í gögnunum (4H/5H/6H) eru óbreyttir. */
export const haedHeiti = (h: string) => (h === "4H" ? "Gólf 5. hæðar" : h.replace("H", ". hæð"));
export const haedUndir = (h: string) => (h === "4H" ? "unnið neðan frá á 4. hæð" : "");
type Stada = "allt" | "done" | "opid" | "eftir";
type Reitur = { done: number; open: number; kl: number; m: number | null };
const TOMUR: Reitur = { done: 0, open: 0, kl: 0, m: null };
const leggja = (a: Reitur, b: Reitur): Reitur => ({ done: a.done + b.done, open: a.open + b.open, kl: a.kl + b.kl, m: a.m == null && b.m == null ? null : (a.m || 0) + (b.m || 0) });
/** Stöðulitur: bakgrunnur (gegnsær), rammi, texti. */
const litur = (p: number | null): [string, string, string] => (p == null ? ["rgba(226,232,240,.30)", "#94a3b8", "#334155"] : p >= 95 ? ["rgba(22,101,52,.17)", "#166534", "#166534"] : p >= 75 ? ["rgba(134,239,172,.24)", "#16a34a", "#166534"] : ["rgba(253,186,116,.30)", "#e8590c", "#9a3412"]);
/** Nánari upplýsingar um valda skráningu, sóttar þegar smellt er á punkt. */
type Nanar = { lysing: string | null; athugasemd: string | null; sm: number | null; myndir: number; lagf: string | null; skrad: string | null; slodir: string[] };   // slodir = myndir skráningarinnar í geymslu (skr_myndir)
type Syn = { z: number; fx: number; fy: number };   // aðdráttur og hliðrun sem hlutfall af kortinu (óháð breidd, svo prentun heldur sýninni)
/** r = hæð kortglugga / hæð teikningar (1 í skýrslunni, > 1 í stóru sýninni): teikning sem er lægri en glugginn er miðjuð lóðrétt. */
const klemma = (z: number, fx: number, fy: number, r = 1): Syn => ({ z, fx: Math.min(0, Math.max(1 - z, fx)), fy: z <= r ? (r - z) / 2 : Math.min(0, Math.max(r - z, fy)) });
const Gler = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 21 21" /><path d="M10.5 7.8v5.4M7.8 10.5h5.4" /></svg>;

/** Punktar hæðarinnar teiknaðir ofan á yfirlitsmyndina: grænn = klárað, rauður hringur = opið, rauður tígull = áætlað gat án skráningar.
 *  z = aðdráttur: striginn er teiknaður í hærri upplausn og punktarnir stækka hægar en kortið, svo þétt svæði greinast í sundur. */
function Punktalag({ w, h, punktar, eftir, stada, z }: { w: number; h: number; punktar: HkPunktur[]; eftir: HkEftir[]; stada: Stada; z: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [br, setBr] = useState(0);
  useEffect(() => {
    const el = ref.current?.parentElement; if (!el) return;
    const ro = new ResizeObserver(() => setBr(el.clientWidth)); ro.observe(el); setBr(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const c = ref.current; if (!c || !br) return;
    const s = Math.min(3, Math.max(2, window.devicePixelRatio || 1));   // minnst tvöföld upplausn svo prentunin verði skörp
    const q = Math.max(1, Math.min(z, 5200 / (br * s)));                 // hærri upplausn við aðdrátt, með þaki á stærð strigans
    c.width = Math.round(br * s * q); c.height = Math.round(((br * h) / w) * s * q);
    const cx = c.getContext("2d"); if (!cx) return;
    const k = c.width / w, r = Math.max(1.3, br / 520) * Math.pow(z, 0.45) * (c.width / (br * z));
    cx.clearRect(0, 0, c.width, c.height);
    if (stada === "allt" || stada === "done") { const brun = z >= 2; cx.fillStyle = brun ? "rgb(21,128,61)" : "rgba(21,128,61,.88)"; cx.strokeStyle = "#ffffff"; cx.lineWidth = Math.max(1, r * 0.28); for (const p of punktar) if (p.done) { cx.beginPath(); cx.arc(p.x * k, p.y * k, r, 0, 6.2832); cx.fill(); if (brun) cx.stroke(); } }   // hvít brún við aðdrátt: punktar greinast frá lögnum og stokkum
    if (stada === "allt" || stada === "opid") { cx.lineWidth = Math.max(1, r * 0.55); cx.strokeStyle = "#dc2626"; cx.fillStyle = "#ffffff"; for (const p of punktar) if (!p.done) { cx.beginPath(); cx.arc(p.x * k, p.y * k, r * 1.35, 0, 6.2832); cx.fill(); cx.stroke(); } }
    if (stada === "allt" || stada === "eftir") { cx.fillStyle = "#dc2626"; cx.strokeStyle = "#ffffff"; cx.lineWidth = Math.max(1, r * 0.35); const t = r * 1.9; for (const e of eftir) { const x = e.x * k, y = e.y * k; cx.beginPath(); cx.moveTo(x, y - t); cx.lineTo(x + t, y); cx.lineTo(x, y + t); cx.lineTo(x - t, y); cx.closePath(); cx.fill(); cx.stroke(); } }
  }, [br, w, h, punktar, eftir, stada, z]);
  return <canvas ref={ref} aria-hidden="true" />;
}

/** Framvindurit: kláraðar skráningar á mánuði, staflað eftir hæð. Smellur á mánuð = staðan í lok hans (sían „Til“). */
function Framvinda({ punktar, haedir, fra, til, onVelja }: { punktar: HkPunktur[]; haedir: string[]; fra: string; til: string; onVelja: (m: string) => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [br, setBr] = useState(0);
  const [yfir, setYfir] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setBr(el.clientWidth)); ro.observe(el); setBr(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const gogn = useMemo(() => {
    const m = new Map<string, Record<string, number>>();
    for (const p of punktar) if (p.done && p.man) { const r = m.get(p.man) || {}; r[p.haed] = (r[p.haed] || 0) + 1; m.set(p.man, r); }
    const lyklar = [...m.keys()].sort(); if (!lyklar.length) return [];
    const ut: { k: string; r: Record<string, number>; alls: number; upps: number }[] = [];
    let a = Number(lyklar[0].slice(0, 4)), b = Number(lyklar[0].slice(5, 7)), upps = 0; const sid = lyklar[lyklar.length - 1];
    for (let i = 0; i < 120; i++) {   // samfelld mánaðaröð frá fyrsta til síðasta mánaðar (tómir mánuðir sjást sem eyður)
      const k = `${a}-${String(b).padStart(2, "0")}`, r = m.get(k) || {}, alls = haedir.reduce((s, h) => s + (r[h] || 0), 0);
      upps += alls; ut.push({ k, r, alls, upps });
      if (k >= sid) break;
      b++; if (b > 12) { b = 1; a++; }
    }
    return ut;
  }, [punktar, haedir]);
  if (!gogn.length) return null;
  const anDags = punktar.reduce((a, p) => a + (p.done && !p.man ? 1 : 0), 0);   // kláraðar skráningar án lokadagsetningar komast ekki á tímaás
  const H = 196, V = 44, HG = 8, T = 20, B = 24, n = gogn.length, plotW = Math.max(60, br - V - HG), skref = plotW / n, bw = Math.max(3, Math.min(34, skref - 4));
  const hrMax = Math.max(1, ...gogn.map((g) => g.alls)), st = Math.pow(10, Math.floor(Math.log10(hrMax))), max = Math.ceil(hrMax / (st / 2)) * (st / 2);
  const yAf = (v: number) => T + (H - T - B) * (1 - v / max);
  const manHeiti = (k: string) => `${MAN[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}`;
  const nth = Math.max(1, Math.ceil(n / Math.max(1, plotW / 46)));
  const virkur = (k: string) => (!fra || k >= fra) && (!til || k <= til);
  const g = yfir != null ? gogn[yfir] : null;
  return (
    <div className="sk-fv">
      <div className="sk-fv-haus">
        <h3>Framvinda eftir mánuðum <span>kláraðar skráningar · {num(gogn[gogn.length - 1].upps)} alls{anDags ? ` · ${num(anDags)} án dagsetningar eru ekki í ritinu` : ""}</span></h3>
        <div className="sk-fv-skyring">{haedir.map((h) => <span key={h}><i style={{ background: LITUR_H[h] }} />{haedHeiti(h)}</span>)}</div>
      </div>
      <div className="sk-fv-rit" ref={ref} onPointerLeave={() => setYfir(null)}>
        {br > 0 && (
          <svg width={br} height={H} role="img" aria-label="Kláraðar skráningar á mánuði, staflað eftir hæð">
            {[0, max / 2, max].map((v) => <g key={v}><line x1={V} x2={br - HG} y1={yAf(v)} y2={yAf(v)} stroke={v === 0 ? "#9aa7bd" : "#e7ecf3"} strokeWidth="1" /><text x={V - 6} y={yAf(v) + 4} textAnchor="end" fontSize="11" fill="#5a6882">{num(v)}</text></g>)}
            {gogn.map((d, i) => {
              const x = V + i * skref + (skref - bw) / 2; let y0 = yAf(0);
              return (
                <g key={d.k} opacity={virkur(d.k) ? 1 : 0.28}>
                  {haedir.map((h) => { const v = d.r[h] || 0; if (!v) return null; const hh = (v / max) * (H - T - B), y = y0 - hh; y0 = y; return <rect key={h} x={x} y={y + (hh > 3 ? 1 : 0)} width={bw} height={Math.max(1, hh - (hh > 3 ? 2 : 0))} rx={Math.min(3, bw / 2)} fill={LITUR_H[h]} />; })}
                  {skref >= 30 && d.alls > 0 && <text x={x + bw / 2} y={y0 - 4} textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#2e4064">{num(d.alls)}</text>}
                  {i % nth === 0 && <text x={x + bw / 2} y={H - 7} textAnchor="middle" fontSize="10.5" fill="#5a6882">{d.k.slice(5)}.{d.k.slice(2, 4)}</text>}
                  {yfir === i && <rect x={V + i * skref} y={T - 6} width={skref} height={H - T - B + 6} fill="#0b2d5f" opacity="0.07" />}
                  <rect x={V + i * skref} y={0} width={skref} height={H} fill="transparent" style={{ cursor: "pointer" }} tabIndex={0} role="button" aria-label={`${manHeiti(d.k)}: ${d.alls} kláraðar skráningar. Sýna stöðuna í lok mánaðarins.`}
                    onPointerEnter={() => setYfir(i)} onFocus={() => setYfir(i)} onBlur={() => setYfir(null)} onClick={() => onVelja(d.k)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onVelja(d.k); } }} />
                </g>
              );
            })}
          </svg>
        )}
        {g && yfir != null && (
          <div className="sk-fv-tip" style={{ left: Math.min(Math.max(8, V + yfir * skref + skref / 2 - 90), Math.max(8, br - 188)) }}>
            <b>{manHeiti(g.k)}</b>
            {haedir.map((h) => <div key={h}><i style={{ background: LITUR_H[h] }} /><span>{haedHeiti(h)}</span><em>{num(g.r[h] || 0)}</em></div>)}
            <div className="s"><span>Alls í mánuðinum</span><em>{num(g.alls)}</em></div>
            <div><span>Uppsafnað</span><em>{num(g.upps)}</em></div>
          </div>
        )}
      </div>
      <p className="sk-smatt sk-skjar sk-gagnv">Smelltu á mánuð til að sjá stöðuna á kortunum eins og hún var í lok hans{til && !fra ? <> · nú sýnt: <b>til og með {manHeiti(til)}</b></> : null}.</p>
      <details className="sk-fv-tafla">
        <summary>Sýna tölurnar í töflu</summary>
        <table className="sk-tafla">
          <thead><tr><th>Mánuður</th>{haedir.map((h) => <th key={h}>{haedHeiti(h)}</th>)}<th>Alls</th><th>Uppsafnað</th></tr></thead>
          <tbody>{gogn.map((d) => <tr key={d.k}><td className="sk-v">{manHeiti(d.k)}</td>{haedir.map((h) => <td key={h}>{d.r[h] ? num(d.r[h]) : ""}</td>)}<td><b>{num(d.alls)}</b></td><td>{num(d.upps)}</td></tr>)}</tbody>
        </table>
      </details>
    </div>
  );
}

/** Ein hæð: deildaflögg, kort með aðdrætti og færslu, smellanlegir punktar, skráningarspjald og tafla. */
function Haedarkort({ haed, y, punktar, eftir, stada, deildir, reiturD, reiturH, texti, haus, valinn, nanar, starfsmenn, onVelja, fokus, stor, byrjunDeild, onOpna, onMynd, lagmyndir }: {
  haed: string; y: HkYfirlit; punktar: HkPunktur[]; eftir: HkEftir[]; stada: Stada; deildir: string[];
  reiturD: (haed: string, deild: string) => Reitur; reiturH: (haed: string, deild: string, i: number) => Reitur; texti: (r: Reitur) => string; haus: string;
  valinn: HkPunktur | null; nanar: Nanar | null; starfsmenn: Map<number, string>; onVelja: (p: HkPunktur | null) => void; fokus: { id: number; t: number } | null;
  /** stor = stóra sýnin (yfir allan skjáinn): engin tafla, glugginn fyllir plássið. byrjunDeild = deild sem sýnin opnast á. onOpna = opna stóru sýnina. */
  stor?: boolean; byrjunDeild?: string | null; onOpna?: (deild: string | null) => void; onMynd: (slodir: string[], i: number) => void; lagmyndir: string[];
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const [v, setV] = useState<Syn>({ z: 1, fx: 0, fy: 0 });
  const [zT, setZT] = useState(1);            // aðdráttur strigans — fylgir v.z með smá töf svo ekki sé endurteiknað á hverju skrunskrefi
  const [fDeild, setFDeild] = useState<string | null>(null);
  const [r, setR] = useState(1);              // hæð kortglugga / hæð teikningar
  const drag = useRef<{ x: number; y: number; fx: number; fy: number; hreyft: boolean } | null>(null);
  useEffect(() => { const t = setTimeout(() => setZT(v.z), 140); return () => clearTimeout(t); }, [v.z]);
  /** Aðdráttur um margfeldi f þannig að staðurinn (cx, cy) — hlutfall af kortglugganum — haldist kyrr. */
  const zoomVid = useCallback((f: number, cx: number, cy: number) => setV((o) => { const z = Math.min(8, Math.max(1, o.z * f)), mx = (cx - o.fx) / o.z, my = (cy - o.fy) / o.z; return klemma(z, cx - mx * z, cy - my * z, r); }), [r]);
  const midja = useCallback((z: number, mx: number, my: number) => setV(klemma(z, 0.5 - mx * z, r / 2 - my * z, r)), [r]);
  useEffect(() => {   // hlutfall gluggans mælt (stóra sýnin); sýnin klemmd upp á nýtt þegar það breytist
    const el = box.current; if (!el || !stor) return;
    const maela = () => { if (el.clientWidth) setR(Math.max(1, el.clientHeight / ((el.clientWidth * y.h) / y.w))); };
    const ro = new ResizeObserver(maela); ro.observe(el); maela();
    return () => ro.disconnect();
  }, [stor, y.w, y.h]);
  const byrjad = useRef(false);
  useEffect(() => {
    if (stor && byrjunDeild && r > 1 && !byrjad.current) { byrjad.current = true; setFDeild(byrjunDeild); setV(klemma(Math.max(r, 2.2), 0.5 - ((GEO[byrjunDeild][0] + GEO[byrjunDeild][1] / 2) / 100) * Math.max(r, 2.2), r / 2 - 0.5 * Math.max(r, 2.2), r)); }
    else setV((o) => klemma(o.z, o.fx, o.fy, r));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r]);
  useEffect(() => {   // Ctrl + skrun (og klípa á snertifleti) = aðdráttur; venjulegt skrun flettir síðunni áfram
    const el = box.current; if (!el) return;
    const wh = (e: WheelEvent) => { if (!stor && !e.ctrlKey && !e.metaKey) return; e.preventDefault(); const q = el.getBoundingClientRect(); zoomVid(e.deltaY < 0 ? 1.25 : 0.8, (e.clientX - q.left) / q.width, (e.clientY - q.top) / ((q.width * y.h) / y.w)); };
    el.addEventListener("wheel", wh, { passive: false });
    return () => el.removeEventListener("wheel", wh);
  }, [zoomVid, stor, y.w, y.h]);
  useEffect(() => {   // leit eftir skráningarnúmeri: færa sýnina að punktinum
    if (!fokus || !valinn || valinn.id !== fokus.id || valinn.haed !== haed) return;
    midja(5, valinn.x / y.w, valinn.y / y.h); setFDeild(null);
    if (!stor) box.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fokus]);
  const hnit = (e: { clientX: number; clientY: number }) => { const q = box.current!.getBoundingClientRect(); return { cx: (e.clientX - q.left) / q.width, cy: (e.clientY - q.top) / ((q.width * y.h) / y.w), br: q.width }; };   // cy í einingum teikningarhæðar
  const velja = (e: { clientX: number; clientY: number }) => {
    if (stada === "eftir") { onVelja(null); return; }
    const { cx, cy, br } = hnit(e), X = ((cx - v.fx) / v.z) * y.w, Y = ((cy - v.fy) / v.z) * y.h, R = (14 / br / v.z) * y.w;
    let best: HkPunktur | null = null, bd = R * R;
    for (const p of punktar) { if (stada === "done" ? !p.done : stada === "opid" ? p.done : false) continue; const d = (p.x - X) ** 2 + (p.y - Y) ** 2; if (d < bd) { bd = d; best = p; } }
    onVelja(best);
  };
  const aDeild = (d: string) => { if (!stor && onOpna) { onOpna(d); return; } if (fDeild === d) { setFDeild(null); setV(klemma(1, 0, 0, r)); } else { setFDeild(d); midja(Math.max(r, 2.6), (GEO[d][0] + GEO[d][1] / 2) / 100, 0.5); } };
  const stoppa = { onPointerDown: (e: React.PointerEvent) => e.stopPropagation(), onPointerUp: (e: React.PointerEvent) => e.stopPropagation(), onDoubleClick: (e: React.MouseEvent) => e.stopPropagation() };
  const minn = valinn && valinn.haed === haed ? valinn : null;
  const eDeild = (d: string) => eftir.filter((e) => e.deild === d).reduce((a, e) => a + e.n, 0);
  return (
    <div className={`sk-hk-haed${stor ? " stor" : ""}`}>
      {!stor && <h3>{haedHeiti(haed)} <span>{haus}</span>{onOpna && <button type="button" className="sk-hk-opna sk-skjar sk-gagnv" onClick={() => onOpna(null)} title="Opna hæðina í stórri sýn með síum til hliðar"><Gler />Stór sýn</button>}</h3>}
      <div className="sk-hk-flogg">
        {deildir.map((d) => { const r = reiturD(haed, d), p = r.m != null ? pros(r.kl, r.m) : null, c = litur(p); return <button key={d} type="button" className={fDeild === d ? "on" : ""} title={!stor ? `Opna deild ${d} í stórri sýn` : fDeild === d ? "Sýna alla hæðina" : `Stækka deild ${d}`} onClick={() => aDeild(d)} style={{ left: `${GEO[d][0]}%`, width: `${GEO[d][1]}%`, borderColor: c[1], color: c[2], background: c[0] }}><b>Deild {d}{p != null ? ` · ${p} %` : ""}</b><small>{texti(r)}</small>{!stor && onOpna && <Gler />}</button>; })}
      </div>
      <div className="sk-hk-rammi">
      <div className={`sk-hk-mynd${v.z > 1 ? " ad" : ""}${lagmyndir.length ? " medlag" : ""}`} ref={box} style={stor ? undefined : { aspectRatio: `${y.w} / ${y.h}` }}
        onPointerDown={(e) => { if (e.button !== 0) return; drag.current = { x: e.clientX, y: e.clientY, fx: v.fx, fy: v.fy, hreyft: false }; if (v.z > 1) e.currentTarget.setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => { const d = drag.current; if (!d) return; const dx = e.clientX - d.x, dy = e.clientY - d.y; if (!d.hreyft && Math.abs(dx) + Math.abs(dy) < 5) return; d.hreyft = true; if (v.z <= 1) return; const q = e.currentTarget.getBoundingClientRect(); setV((o) => klemma(o.z, d.fx + dx / q.width, d.fy + dy / ((q.width * y.h) / y.w), r)); }}
        onPointerUp={(e) => { const d = drag.current; drag.current = null; if (!d || d.hreyft) return; velja(e); }}
        onPointerCancel={() => { drag.current = null; }}
        onDoubleClick={(e) => { const { cx, cy } = hnit(e); zoomVid(2, cx, cy); }}>
        <div className="sk-hk-lag" style={{ aspectRatio: `${y.w} / ${y.h}`, transform: `translate(${v.fx * 100}%, ${v.fy * 100}%) scale(${v.z})`, ["--z" as string]: v.z }}>
          {y.mynd && <img src={publicUrl(y.mynd)} alt={`Yfirlitsteikning ${haedHeiti(haed)}`} draggable={false} />}
          {lagmyndir.map((s) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={s} className="sk-hk-lagmynd" src={publicUrl(s)} alt="" draggable={false} />
          ))}
          <Punktalag w={y.w} h={y.h} punktar={punktar} eftir={eftir} stada={stada} z={zT} />
          {deildir.flatMap((d) => HLUTAR.map(([s, nafn], i) => { const r = reiturH(haed, d, i), p = r.m != null ? pros(r.kl, r.m) : null, c = litur(p); return (
            <div key={d + s} className="sk-hk-hluti" style={{ left: `${GEO[d][0]}%`, width: `${GEO[d][1]}%`, top: `${BIL[i][0]}%`, height: `${BIL[i][1]}%`, borderColor: c[1], background: c[0] }} title={`${haedHeiti(haed)} ${d} ${nafn}: ${texti(r)}${r.open ? `, ${r.open} opið` : ""}`}>
              <span style={{ color: c[2] }}><b>{p != null ? `${p} %` : num(r.done)}</b><small>{nafn}</small></span>
            </div>
          ); }))}
          {minn && <i className="sk-hk-valinn" style={{ left: `${(minn.x / y.w) * 100}%`, top: `${(minn.y / y.h) * 100}%` }} />}
        </div>
        <div className="sk-hk-takkar sk-skjar sk-gagnv" {...stoppa}>
          <button type="button" aria-label="Stækka" title="Stækka" onClick={() => zoomVid(1.6, 0.5, r / 2)}>+</button>
          <button type="button" aria-label="Minnka" title="Minnka" onClick={() => zoomVid(1 / 1.6, 0.5, r / 2)} disabled={v.z <= 1}>−</button>
          <button type="button" aria-label="Sýna alla hæðina" title="Sýna alla hæðina" onClick={() => { setV(klemma(1, 0, 0, r)); setFDeild(null); }} disabled={v.z <= 1}>⤢</button>
        </div>
      </div>
        {minn && (
          <div className="sk-hk-kort" {...stoppa}>
            <button type="button" className="sk-skjar sk-gagnv" aria-label="Loka" onClick={() => onVelja(null)}>×</button>
            <div className="sk-hk-kort-h"><b>Skráning{minn.nr != null ? ` nr. ${minn.nr}` : ""}</b><em className={minn.done ? "ok" : "op"}>{minn.done ? "Klárað" : "Opið"}</em></div>
            <dl>
              <dt>Flokkur</dt><dd>{minn.fl || "—"}</dd>
              {minn.kerfi && minn.kerfi !== "oflokkad" && <><dt>Kerfi</dt><dd>{KERFI.find((k) => k[0] === minn.kerfi)?.[1]} <small>({minn.kvafi ? "óvíst, " : ""}{minn.kmynd ? "greint af rauðum lit á ljósmynd" : "áætlað af teikningu"})</small></dd></>}
              <dt>Staður</dt><dd>{haedHeiti(haed)} · deild {minn.deild} · {minn.hluti === "N" ? "Norðurhlið" : minn.hluti === "S" ? "Suðurhlið" : "Center"}</dd>
              <dt>{minn.done ? "Klárað" : "Skráð"}</dt><dd>{minn.done ? dmy(minn.dags) : dmy(nanar?.skrad)}</dd>
              <dt>Starfsmaður</dt><dd>{nanar ? (nanar.sm != null && starfsmenn.get(nanar.sm)) || "—" : "…"}</dd>
              <dt>Myndir</dt><dd>{nanar ? (nanar.slodir.length ? nanar.slodir.length : nanar.myndir ? `${nanar.myndir} í Ajour (ekki sóttar enn)` : "engar") : "…"}</dd>
              {nanar?.lagf && <><dt>Lagfært</dt><dd>{dmy(nanar.lagf)}</dd></>}
              {nanar?.lysing && <><dt>Lýsing</dt><dd>{nanar.lysing.slice(0, 240)}</dd></>}
              {nanar?.athugasemd && <><dt>Athugasemd</dt><dd>{nanar.athugasemd.slice(0, 240)}</dd></>}
            </dl>
            {nanar && nanar.slodir.length > 0 && <div className="sk-hk-myndir">{nanar.slodir.slice(0, 6).map((s, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <button key={s} type="button" onClick={() => onMynd(nanar.slodir, i)} aria-label={`Opna mynd ${i + 1} af ${nanar.slodir.length}`}><img src={publicUrl(s)} alt="" loading="lazy" /></button>
            ))}</div>}
          </div>
        )}
      </div>
      {stor ? <p className="sk-hk-hint">Skrunaðu til að stækka og minnka · dragðu til að færa · smelltu á punkt til að sjá skráninguna · smelltu á deild til að fara að henni</p> : <p className="sk-hk-hint sk-skjar sk-gagnv">Smelltu á punkt til að sjá skráninguna · tvísmelltu eða notaðu + til að stækka · dragðu til að færa · stækkunarglerið opnar hæðina eða deildina í stórri sýn</p>}
      {!stor && <table className="sk-tafla sk-hk-tafla">
        <thead><tr><th>Deild</th>{HLUTAR.map(([s, nafn]) => <th key={s}>{nafn}</th>)}<th>Deildin</th><th>Opið</th><th>Eftir (áætlað)</th></tr></thead>
        <tbody>
          {deildir.map((d) => { const rd = reiturD(haed, d), pd = rd.m != null ? pros(rd.kl, rd.m) : null; return (
            <tr key={d}>
              <td className="sk-v"><b>Deild {d}</b> <small>{haedHeiti(haed)}</small></td>
              {HLUTAR.map(([s], i) => { const r = reiturH(haed, d, i), p = r.m != null ? pros(r.kl, r.m) : null; return <td key={s} style={{ background: litur(p)[0] }}>{p != null ? <b>{p} % </b> : null}<small>{texti(r)}{r.open ? ` · +${num(r.open)}` : ""}</small></td>; })}
              <td style={{ background: litur(pd)[0] }}>{pd != null ? <b>{pd} % </b> : null}<small>{texti(rd)}</small></td>
              <td>{rd.open ? num(rd.open) : ""}</td><td>{eDeild(d) ? num(eDeild(d)) : ""}</td>
            </tr>
          ); })}
        </tbody>
      </table>}
    </div>
  );
}

export default function Haedir({ yfirlit, punktar, eftir, hopar, starfsmenn, log, markDeild, markHluta }: Props) {
  const [hopVal, setHopVal] = useState<Set<string>>(new Set());     // tómt = allir flokkahópar
  const [flVal, setFlVal] = useState<Set<string>>(new Set());       // stærðir (flokkar) — aðeins þegar einn hópur er valinn
  const [stada, setStada] = useState<Stada>("allt");
  const [kerfiVal, setKerfiVal] = useState<Set<string>>(new Set());   // lagnakerfi stálröra; tómt = öll
  const [afDeild, setAfDeild] = useState<Record<string, boolean>>({});
  const [afHaed, setAfHaed] = useState<Record<string, boolean>>({});
  const [fra, setFra] = useState(""); const [til, setTil] = useState("");
  const [valinn, setValinn] = useState<HkPunktur | null>(null);
  const [nanar, setNanar] = useState<Nanar | null>(null);
  const [leit, setLeit] = useState(""); const [leitSvar, setLeitSvar] = useState("");
  const [fokus, setFokus] = useState<{ id: number; t: number } | null>(null);
  const [ljos, setLjos] = useState<{ slodir: string[]; i: number } | null>(null);   // stór mynd (ljósakassi)
  const ljosRef = useRef(false); ljosRef.current = !!ljos;
  useEffect(() => {
    if (!ljos) return;
    const lykill = (e: KeyboardEvent) => { if (e.key === "Escape") setLjos(null); else if (e.key === "ArrowRight") setLjos((l) => (l ? { ...l, i: (l.i + 1) % l.slodir.length } : l)); else if (e.key === "ArrowLeft") setLjos((l) => (l ? { ...l, i: (l.i + l.slodir.length - 1) % l.slodir.length } : l)); };
    window.addEventListener("keydown", lykill);
    return () => window.removeEventListener("keydown", lykill);
  }, [ljos]);
  const onMynd = useCallback((slodir: string[], i: number) => setLjos({ slodir, i }), []);
  const [skodari, setSkodari] = useState<{ haed: string; deild: string | null; t: number } | null>(null);   // stóra sýnin: hæð og deild sem hún opnast á
  useEffect(() => {   // stóra sýnin: síðan undir skrunar ekki, Esc lokar
    if (!skodari) return;
    const fyrra = document.body.style.overflow; document.body.style.overflow = "hidden";
    const lykill = (e: KeyboardEvent) => { if (e.key === "Escape" && !ljosRef.current) setSkodari(null); };
    window.addEventListener("keydown", lykill);
    return () => { document.body.style.overflow = fyrra; window.removeEventListener("keydown", lykill); };
  }, [skodari]);
  const skipta = (s: Set<string>, k: string) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; };

  const valdir = useMemo(() => (hopVal.size ? hopar.filter((h) => hopVal.has(h[0])).map((h) => h[0]) : hopar.map((h) => h[0])), [hopVal, hopar]);
  const einnHopur = hopVal.size === 1 ? [...hopVal][0] : null;
  /** Stærðir (flokkar) valda hópsins, í stærðarröð. */
  const staerdir = useMemo(() => {
    if (!einnHopur) return [];
    const m = new Map<string, number>(); for (const p of punktar) if (p.hop === einnHopur) m.set(p.fl, (m.get(p.fl) || 0) + (kerfiVal.size && (!p.kerfi || !kerfiVal.has(p.kerfi)) ? 0 : 1));   // allar stærðir hópsins sjást; teljarinn fylgir völdu kerfi
    return [...m].sort((a, b) => (parseInt(a[0].replace(/^\D+/, ""), 10) || 0) - (parseInt(b[0].replace(/^\D+/, ""), 10) || 0));
  }, [einnHopur, punktar, kerfiVal]);
  const manudir = useMemo(() => [...new Set(punktar.map((p) => p.man).filter((m): m is string => !!m))].sort(), [punktar]);
  const medMarkmid = flVal.size === 0 && !fra && kerfiVal.size === 0;   // markmið eru skilgreind á flokkahóp: stærðarsía og „Frá“-mánuður sýna aðeins fjölda; „Til“ = staðan í lok mánaðar á móti markmiði

  /** Síað á allt nema tímabil — framvinduritið sýnir alla mánuði þess sem er valið. */
  const anTima = useMemo(() => punktar.filter((p) => {
    if (hopVal.size ? !p.hop || !hopVal.has(p.hop) : false) return false;
    if (flVal.size && !flVal.has(p.fl)) return false;
    if (kerfiVal.size && (!p.kerfi || !kerfiVal.has(p.kerfi))) return false;
    if (afDeild[p.deild] || afHaed[p.haed]) return false;
    return true;
  }), [punktar, hopVal, flVal, kerfiVal, afDeild, afHaed]);
  const kerfiTal = useMemo(() => { const m = new Map<string, number>(); let vafi = 0, alls = 0; for (const p of punktar) if (p.kerfi) { m.set(p.kerfi, (m.get(p.kerfi) || 0) + 1); alls++; if (p.kvafi) vafi++; } return { m, vafi, alls }; }, [punktar]);
  const siadir = useMemo(() => (fra || til ? anTima.filter((p) => !(fra && (!p.man || p.man < fra)) && !(til && (!p.man || p.man > til))) : anTima), [anTima, fra, til]);
  const eftirSiad = useMemo(() => (flVal.size || fra || til || kerfiVal.size ? [] : eftir.filter((e) => !(hopVal.size ? !e.hop || !hopVal.has(e.hop) : false) && !afDeild[e.deild] && !afHaed[e.haed])), [eftir, hopVal, flVal, kerfiVal, afDeild, afHaed, fra, til]);

  // nánari upplýsingar um valda skráningu (ein röð, aðeins lestur)
  useEffect(() => {
    setNanar(null); if (!valinn) return;
    let lifir = true;
    Promise.all([sb().from("skr_skraningar").select("lysing,athugasemd,starfsmadur_id,created_at,ajour_gogn").eq("id", valinn.id).single(), sb().from("skr_myndir").select("path").eq("skraning_id", valinn.id).order("rod")]).then(([r, m]) => {
      if (!lifir || r.error || !r.data) return;
      const d = r.data as { lysing: string | null; athugasemd: string | null; starfsmadur_id: number | null; created_at: string | null; ajour_gogn: { myndir?: string[]; lagf_dags?: string } | null };
      setNanar({ lysing: d.lysing, athugasemd: d.athugasemd, sm: d.starfsmadur_id, myndir: (d.ajour_gogn?.myndir || []).length, lagf: d.ajour_gogn?.lagf_dags || null, skrad: d.created_at, slodir: ((m.data || []) as { path: string }[]).map((x) => x.path) });
    });
    return () => { lifir = false; };
  }, [valinn]);

  /** Talning síaðra punkta per hæð|deild|hluti|hópur. */
  const tel = useMemo(() => {
    const m = new Map<string, { done: number; open: number }>();
    for (const p of siadir) { const k = `${p.haed}|${p.deild}|${p.hluti}|${p.hop ?? ""}`, x = m.get(k) || { done: 0, open: 0 }; if (p.done) x.done++; else x.open++; m.set(k, x); }
    return m;
  }, [siadir]);
  const hopLyklar = useMemo(() => (hopVal.size ? valdir : [...valdir, ""]), [hopVal, valdir]);   // "" = skráningar utan hópa (Annað) þegar ekkert er síað
  const reiturH = (haed: string, deild: string, i: number): Reitur => {
    const r: Reitur = { done: 0, open: 0, kl: 0, m: null };
    for (const k of hopLyklar) {
      const c = tel.get(`${haed}|${deild}|${HLUTAR[i][0]}|${k}`) || { done: 0, open: 0 }; r.done += c.done; r.open += c.open;
      const mk = medMarkmid && k ? markHluta(haed, deild, i, k) : null;
      if (mk != null && mk > 0) { r.kl += Math.min(c.done, mk); r.m = (r.m || 0) + mk; }
    }
    return r;
  };
  const reiturD = (haed: string, deild: string): Reitur => {
    const r: Reitur = { done: 0, open: 0, kl: 0, m: null };
    for (const k of hopLyklar) {
      let done = 0, open = 0; for (const [s] of HLUTAR) { const c = tel.get(`${haed}|${deild}|${s}|${k}`); if (c) { done += c.done; open += c.open; } }
      r.done += done; r.open += open;
      const mk = medMarkmid && k ? markDeild(haed, deild, k) : null;
      if (mk != null && mk > 0) { r.kl += Math.min(done, mk); r.m = (r.m || 0) + mk; }
    }
    return r;
  };
  const allarHaedir = useMemo(() => HAEDIR.filter((h) => yfirlit.some((y) => y.haed === h)), [yfirlit]);
  const syndarHaedir = allarHaedir.filter((h) => !afHaed[h]);
  const syndarDeildir = DEILDIR.filter((d) => !afDeild[d]);
  const haedAlls = (haed: string) => syndarDeildir.reduce((a, d) => leggja(a, reiturD(haed, d)), TOMUR);
  const alls = syndarHaedir.reduce((a, h) => leggja(a, haedAlls(h)), TOMUR);
  const eftirAlls = eftirSiad.reduce((a, e) => a + e.n, 0);
  const virkar = hopVal.size + flVal.size + kerfiVal.size + (stada !== "allt" ? 1 : 0) + Object.values(afDeild).filter(Boolean).length + Object.values(afHaed).filter(Boolean).length + (fra ? 1 : 0) + (til ? 1 : 0);
  const hreinsa = () => { setKerfiVal(new Set()); setHopVal(new Set()); setFlVal(new Set()); setStada("allt"); setAfDeild({}); setAfHaed({}); setFra(""); setTil(""); };
  const manTexti = (m: string) => `${m.slice(5)}.${m.slice(0, 4)}`;
  const siulysing = [
    hopVal.size ? hopar.filter((h) => hopVal.has(h[0])).map((h) => h[1]).join(", ") : "Allir flokkar",
    flVal.size ? [...flVal].join(", ") : "",
    kerfiVal.size ? `stálrör: ${KERFI.filter((k) => kerfiVal.has(k[0])).map((k) => k[1].toLowerCase()).join(", ")} (úðakerfi greint af ljósmynd, annað áætlað af teikningu)` : "",
    stada === "done" ? "aðeins klárað" : stada === "opid" ? "aðeins opið" : stada === "eftir" ? "aðeins áætluð göt án skráningar" : "",
    Object.values(afDeild).some(Boolean) ? `deildir ${syndarDeildir.join(", ")}` : "",
    fra ? `tímabil ${manTexti(fra)} – ${til ? manTexti(til) : "…"}` : til ? `staðan í lok ${manTexti(til)}` : "",
  ].filter(Boolean).join(" · ");
  const texti = (r: Reitur) => (r.m != null ? `${num(r.kl)} / ${num(r.m)}` : `${num(r.done)} klárað`);
  /** Teikningar valinna kerfa og flokka á hæðinni: lagnateikning kerfis (úði, vatn, lyfjaloft) og teikning flokks (loftræsting, rafmagn). */
  const lagAf = (haed: string) => { if (!log) return []; const fog = new Set<string>(); for (const k of kerfiVal) fog.add(KERFI_FAG[k]); for (const h of hopVal) if (HOP_FAG[h]) fog.add(HOP_FAG[h]); return fog.size ? log.filter((l) => l.haed === haed && fog.has(l.fag)).map((l) => l.mynd) : []; };
  /** Kerfi valið: flokkurinn fer á Stálrör; stærðaröðin sýnir þá hve margar þéttingar kerfisins eru í hverri stærð. */
  const veljaKerfi = (k: string | null) => {
    const n = k ? skipta(kerfiVal, k) : new Set<string>(); setKerfiVal(n);
    if (!n.size) { setFlVal(new Set()); return; }
    setHopVal(new Set(["Stál"]));
    setFlVal(new Set());   // engin stærðarregla: úðarör eru í öllum stálstærðum (grönn rauð rör líka í Ø15-35); teljararnir á stærðunum sýna skiptinguna
  };
  const veljaManud = (m: string) => { if (til === m && !fra) setTil(""); else { setFra(""); setTil(m); } };
  const leita = () => {
    const n = Number(leit.trim()); if (!leit.trim() || !Number.isFinite(n)) { setLeitSvar(""); return; }
    const p = punktar.find((q) => q.nr === n);
    if (!p) { setLeitSvar(`Skráning nr. ${n} er ekki á hæðakortunum.`); return; }
    setLeitSvar(`${haedHeiti(p.haed)} · deild ${p.deild}`); setAfHaed((x) => ({ ...x, [p.haed]: false })); setAfDeild((x) => ({ ...x, [p.deild]: false }));
    setValinn(p); setFokus({ id: p.id, t: Date.now() });
  };

  const hausAf = (haed: string) => { const ha = haedAlls(haed), eH = eftirSiad.filter((e) => e.haed === haed); return `${haedUndir(haed) ? `${haedUndir(haed)} · ` : ""}${ha.m != null ? `${num(ha.kl)} af ${num(ha.m)} · ${pros(ha.kl, ha.m)} %` : `${num(ha.done)} klárað`}${ha.open ? ` · ${num(ha.open)} opið` : ""}${eH.length ? ` · ${num(eH.reduce((a, e) => a + e.n, 0))} eftir (áætlað)` : ""}`; };
  const siuradir = (
    <>
        <div className="sk-sia-rod"><span>Flokkur</span>
          <button type="button" className={hopVal.size ? "" : "on"} onClick={() => { setHopVal(new Set()); setFlVal(new Set()); }}>Allir</button>
          {hopar.map(([k, nafn]) => <button key={k} type="button" className={hopVal.has(k) ? "on" : ""} aria-pressed={hopVal.has(k)} onClick={() => { setHopVal((s) => skipta(s, k)); setFlVal(new Set()); }}>{nafn}</button>)}
        </div>
        {einnHopur && staerdir.length > 1 && (
          <div className="sk-sia-rod"><span>Stærð</span>
            <button type="button" className={flVal.size ? "" : "on"} onClick={() => setFlVal(new Set())}>Allar</button>
            {staerdir.map(([fl, n]) => <button key={fl} type="button" className={flVal.has(fl) ? "on" : ""} aria-pressed={flVal.has(fl)} onClick={() => setFlVal((s) => skipta(s, fl))}>{fl.replace(/^(Loft|Stál|Plast|Gólf)\s*/i, "").replace(/\s*L[Vv]\b.*$/, "").trim() || fl} <small>{num(n)}</small></button>)}
          </div>
        )}
        {kerfiTal.alls > 0 && (
          <div className="sk-sia-rod"><span>Stálrör eftir kerfi</span>
            <button type="button" className={kerfiVal.size ? "" : "on"} onClick={() => veljaKerfi(null)}>Öll</button>
            {KERFI.map(([k, nafn]) => <button key={k} type="button" className={kerfiVal.has(k) ? "on" : ""} aria-pressed={kerfiVal.has(k)} onClick={() => veljaKerfi(k)}>{nafn} <small>{num(kerfiTal.m.get(k) || 0)}</small></button>)}
            <em className="sk-sia-ath" title={`Ajour flokkar stálrör aðeins eftir stærð. Úðalagnirnar eru rauðmálaðar: stálröraþétting telst til úðakerfis ef rautt rör sést á ljósmynd hennar. Önnur stálrör eru merkt vatni og hita eða lyfjalofti eftir því hvaða lögn liggur næst á lagnateikningu. Þegar kerfi er valið birtist lagnateikning þess á hæðinni. ${num(kerfiTal.vafi)} af ${num(kerfiTal.alls)} eru óviss (tvö kerfi jafn nærri eða lögn fjarri).`}>úðakerfi greint af ljósmynd · annað áætlað af teikningu</em>
          </div>
        )}
        <div className="sk-sia-rod"><span>Staða</span>
          {([["allt", "Allt"], ["done", "Klárað"], ["opid", "Opið"], ["eftir", "Eftir (áætlað, óskráð)"]] as const).map(([k, nafn]) => <button key={k} type="button" className={stada === k ? "on" : ""} onClick={() => setStada(k)}>{nafn}</button>)}
        </div>
        <div className="sk-sia-rod"><span>Hæð</span>
          {allarHaedir.map((h) => <button key={h} type="button" className={afHaed[h] ? "" : "on"} aria-pressed={!afHaed[h]} onClick={() => setAfHaed((x) => ({ ...x, [h]: !x[h] }))}>{haedHeiti(h)}</button>)}
        </div>
        <div className="sk-sia-rod"><span>Deild</span>
          {DEILDIR.map((d) => <button key={d} type="button" className={afDeild[d] ? "" : "on"} aria-pressed={!afDeild[d]} onClick={() => setAfDeild((x) => ({ ...x, [d]: !x[d] }))}>Deild {d}</button>)}
        </div>
        <div className="sk-sia-rod"><span>Tímabil</span>
          <label>Frá <select value={fra} onChange={(e) => setFra(e.target.value)}><option value="">—</option>{manudir.map((m) => <option key={m} value={m}>{manTexti(m)}</option>)}</select></label>
          <label>Til <select value={til} onChange={(e) => setTil(e.target.value)}><option value="">—</option>{manudir.map((m) => <option key={m} value={m}>{manTexti(m)}</option>)}</select></label>
          <i />
          <label>Skráning nr. <input type="text" inputMode="numeric" value={leit} placeholder="t.d. 4312" onChange={(e) => setLeit(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") leita(); }} /></label>
          <button type="button" onClick={leita}>Finna</button>
          {leitSvar && <em>{leitSvar}</em>}
          {virkar > 0 && <button type="button" className="sk-sia-hreinsa" onClick={hreinsa}>Hreinsa síur ({virkar})</button>}
        </div>
    </>
  );

  return (
    <div className="sk-hk">
      <div className="sk-sia sk-skjar sk-gagnv">{siuradir}</div>
      <p className="sk-prent sk-smatt">Síur: {siulysing}</p>

      <div className="sk-hk-tolur">
        <div><span>Klárað</span><b>{num(alls.done)}</b></div>
        <div><span>Opið</span><b>{num(alls.open)}</b></div>
        <div><span>Eftir, áætlað og óskráð</span><b>{num(eftirAlls)}</b></div>
        <div><span>Áætlað</span><b>{alls.m != null ? num(alls.m) : "—"}</b></div>
        <div className="sk-hk-pros"><span>Hlutfall</span><b>{alls.m != null ? `${pros(alls.kl, alls.m)} %` : "—"}</b></div>
      </div>
      {!medMarkmid && <p className="sk-smatt">Prósentur eru ekki sýndar með stærðarsíu, kerfissíu eða „Frá“-mánuði: áætlunin er skilgreind á flokkahóp, ekki á stærð, kerfi eða tímabil.{kerfiVal.size ? ` Úðakerfi er greint af rauðum lit á ljósmynd; vatn og hiti og lyfjaloft eru áætluð af lagnateikningu: ${num(kerfiTal.vafi)} af ${num(kerfiTal.alls)} stálröraþéttingum eru óvissar.` : ""}</p>}

      <Framvinda punktar={anTima} haedir={syndarHaedir} fra={fra} til={til} onVelja={veljaManud} />

      {syndarHaedir.map((haed) => {
        const y = yfirlit.find((q) => q.haed === haed)!; const ha = haedAlls(haed);
        const pH = siadir.filter((p) => p.haed === haed), eH = eftirSiad.filter((e) => e.haed === haed);
        if (ha.done + ha.open === 0 && ha.m == null && eH.length === 0) return null;   // sían skilur ekkert eftir á þessari hæð
        return <Haedarkort key={haed} onOpna={(d) => setSkodari({ haed, deild: d, t: Date.now() })} haed={haed} y={y} punktar={pH} eftir={eH} stada={stada} deildir={syndarDeildir} reiturD={reiturD} reiturH={reiturH} texti={texti} haus={hausAf(haed)} valinn={valinn} nanar={nanar} starfsmenn={starfsmenn} onVelja={setValinn} fokus={fokus} onMynd={onMynd} lagmyndir={lagAf(haed)} />;
      })}
      {skodari && (() => {
        const y = yfirlit.find((q) => q.haed === skodari.haed); if (!y) return null;
        const ha = haedAlls(skodari.haed), pH = siadir.filter((p) => p.haed === skodari.haed), eH = eftirSiad.filter((e) => e.haed === skodari.haed);
        return (
          <div className="sk-skodari" role="dialog" aria-modal="true" aria-label={`Stór sýn: ${haedHeiti(skodari.haed)}`}>
            <aside className="sk-sko-hlid">
              <h3>Síur</h3>
              <div className="sk-sia">{siuradir}</div>
              <div className="sk-sko-tolur">
                <div><span>Klárað</span><b>{num(ha.done)}</b></div>
                <div><span>Opið</span><b>{num(ha.open)}</b></div>
                <div><span>Áætlað</span><b>{ha.m != null ? num(ha.m) : "—"}</b></div>
                <div className="p"><span>Hlutfall</span><b>{ha.m != null ? `${pros(ha.kl, ha.m)} %` : "—"}</b></div>
              </div>
              <p className="sk-hk-skyring"><i className="g" />klárað <i className="o" />opið <i className="e" />áætlað gat án skráningar</p>
            </aside>
            <div className="sk-sko-adal">
              <div className="sk-sko-stika">
                <div className="sk-sko-flipar">{allarHaedir.map((h) => <button key={h} type="button" className={h === skodari.haed ? "on" : ""} onClick={() => { setAfHaed((x) => ({ ...x, [h]: false })); setSkodari({ haed: h, deild: null, t: Date.now() }); }}>{haedHeiti(h)}</button>)}</div>
                <span>{hausAf(skodari.haed)}</span>
                <button type="button" className="sk-sko-loka" onClick={() => setSkodari(null)}>Loka</button>
              </div>
              <Haedarkort key={`stor-${skodari.haed}-${skodari.t}`} stor byrjunDeild={skodari.deild} haed={skodari.haed} y={y} punktar={pH} eftir={eH} stada={stada} deildir={syndarDeildir} reiturD={reiturD} reiturH={reiturH} texti={texti} haus="" valinn={valinn} nanar={nanar} starfsmenn={starfsmenn} onVelja={setValinn} fokus={fokus} onMynd={onMynd} lagmyndir={lagAf(skodari.haed)} />
            </div>
          </div>
        );
      })()}
      {ljos && (
        <div className="sk-ljos" role="dialog" aria-modal="true" aria-label="Ljósmynd skráningar" onClick={() => setLjos(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={publicUrl(ljos.slodir[ljos.i])} alt={`Ljósmynd ${ljos.i + 1} af ${ljos.slodir.length}`} onClick={(e) => e.stopPropagation()} />
          <div className="sk-ljos-stika" onClick={(e) => e.stopPropagation()}>
            {ljos.slodir.length > 1 && <button type="button" aria-label="Fyrri mynd" onClick={() => setLjos({ ...ljos, i: (ljos.i + ljos.slodir.length - 1) % ljos.slodir.length })}>‹</button>}
            <span>{valinn?.nr != null ? `Skráning nr. ${valinn.nr} · ` : ""}mynd {ljos.i + 1} af {ljos.slodir.length}</span>
            {ljos.slodir.length > 1 && <button type="button" aria-label="Næsta mynd" onClick={() => setLjos({ ...ljos, i: (ljos.i + 1) % ljos.slodir.length })}>›</button>}
            <button type="button" className="l" onClick={() => setLjos(null)}>Loka</button>
          </div>
        </div>
      )}
      <p className="sk-hk-skyring"><i className="g" />klárað <i className="o" />opið í Ajour <i className="e" />áætlað gat án skráningar · litur hluta: <i className="l1" />95 % eða meira <i className="l2" />75–94 % <i className="l3" />undir 75 % <i className="l0" />engin áætlun</p>
      <p className="sk-smatt">Hver punktur er ein skráning á sínum stað á hæðinni (færðir punktar á gatakortinu ráða). Deild og hluti ráðast af stöðu punktsins. Áætlun hluta fylgir sömu reglu og deildin; föst áætlun á deild (milliloft, rafmagn) skiptist jafnt á hlutana þrjá, svo summa hluta getur vikið lítillega frá áætlun deildar. „Gólf 5. hæðar“ eru þéttingar í gólfplötu 5. hæðar, unnar neðan frá á 4. hæð; milliloft á 5. hæð er á sama hátt gólf 6. hæðar. „Eftir“ eru áætluð göt af gatakortinu sem engin skráning parast við — þau eru aðeins til þar sem göt hafa verið áætluð (6. hæð S1 og S2, loftræsting á 5. hæð S1 og S2).</p>
    </div>
  );
}
