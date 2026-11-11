"use client";

/* Stöðuskýrsla — hæðakortið (11.11.2026, Agnar: „skýrsluna byggða í kringum punktahæðina“, með síukerfi og tölum).
 * Hver hæð er sýnd með ÖLLUM skráningum á sínum stað (sýnin skr_haedarhnit: staða á yfirlitsblaðinu, færðir punktar ráða),
 * hver deild skipt í Norðurhlið / Center / Suðurhlið með stöðulit og prósentu, og tafla með sömu tölum undir.
 * Síurnar (flokkur, stærð, staða, deild, hæð, tímabil) gilda um kortið, hlutana og töflurnar í þessum kafla.
 * Prósenta er aðeins sýnd þegar markmið er skilgreint fyrir það sem er síað: engin stærðarsía og ekkert tímabil.
 * Aðeins lestur — engin skrif.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { publicUrl } from "../lib/sb";

export type HkPunktur = { haed: string; deild: string; hluti: string; x: number; y: number; hop: string | null; fl: string; done: boolean; man: string | null };
/** Áætlað gat án skráningar („eftir“): n = stök verk sem vantar. */
export type HkEftir = { haed: string; deild: string; hluti: string; x: number; y: number; hop: string | null; n: number };
export type HkYfirlit = { id: number; haed: string; mynd: string | null; w: number; h: number };
type Props = {
  yfirlit: HkYfirlit[]; punktar: HkPunktur[]; eftir: HkEftir[];
  hopar: [string, string][];
  /** Markmið hóps á deild (með leiðréttingum úr töflunni) og á hluta deildar; null = ekkert markmið. */
  markDeild: (haed: string, deild: string, hop: string) => number | null;
  markHluta: (haed: string, deild: string, hluti: number, hop: string) => number | null;
};

const HAEDIR = ["6H", "5H", "4H"], DEILDIR = ["S1", "S2", "S4", "S5"];
const HLUTAR: [string, string][] = [["N", "Norður"], ["C", "Center"], ["S", "Suður"]];
// Álmurnar á yfirlitsblaðinu (útveggir, lesið af blaðinu): vinstri brún og breidd í % af breidd; hlutaskil í % af hæð (sömu skil og skr_haedarhnit).
const GEO: Record<string, [number, number]> = { S1: [0.85, 12.92], S2: [23.23, 13.94], S4: [63.35, 13.04], S5: [85.72, 12.99] };
const BIL: [number, number][] = [[2.3, 26.5], [28.8, 42.36], [71.16, 27.09]];
const num = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const pros = (a: number, b: number) => (b > 0 ? Math.round((100 * a) / b) : 0);
type Stada = "allt" | "done" | "opid" | "eftir";
type Reitur = { done: number; open: number; kl: number; m: number | null };
const TOMUR: Reitur = { done: 0, open: 0, kl: 0, m: null };
const leggja = (a: Reitur, b: Reitur): Reitur => ({ done: a.done + b.done, open: a.open + b.open, kl: a.kl + b.kl, m: a.m == null && b.m == null ? null : (a.m || 0) + (b.m || 0) });
/** Stöðulitur: bakgrunnur (gegnsær), rammi, texti. */
const litur = (p: number | null): [string, string, string] => (p == null ? ["rgba(226,232,240,.30)", "#94a3b8", "#334155"] : p >= 95 ? ["rgba(22,101,52,.17)", "#166534", "#166534"] : p >= 75 ? ["rgba(134,239,172,.24)", "#16a34a", "#166534"] : ["rgba(253,186,116,.30)", "#e8590c", "#9a3412"]);

/** Punktar hæðarinnar teiknaðir ofan á yfirlitsmyndina: grænn = klárað, rauður hringur = opið, rauður tígull = áætlað gat án skráningar. */
function Punktalag({ w, h, punktar, eftir, stada }: { w: number; h: number; punktar: HkPunktur[]; eftir: HkEftir[]; stada: Stada }) {
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
    c.width = Math.round(br * s); c.height = Math.round(((br * h) / w) * s);
    const cx = c.getContext("2d"); if (!cx) return;
    const k = c.width / w, r = Math.max(1.3, br / 520) * s;
    cx.clearRect(0, 0, c.width, c.height);
    if (stada === "allt" || stada === "done") { cx.fillStyle = "rgba(21,128,61,.88)"; for (const p of punktar) if (p.done) { cx.beginPath(); cx.arc(p.x * k, p.y * k, r, 0, 6.2832); cx.fill(); } }
    if (stada === "allt" || stada === "opid") { cx.lineWidth = Math.max(1, r * 0.55); cx.strokeStyle = "#dc2626"; cx.fillStyle = "#ffffff"; for (const p of punktar) if (!p.done) { cx.beginPath(); cx.arc(p.x * k, p.y * k, r * 1.35, 0, 6.2832); cx.fill(); cx.stroke(); } }
    if (stada === "allt" || stada === "eftir") { cx.fillStyle = "#dc2626"; cx.strokeStyle = "#ffffff"; cx.lineWidth = Math.max(1, r * 0.35); const t = r * 1.9; for (const e of eftir) { const x = e.x * k, y = e.y * k; cx.beginPath(); cx.moveTo(x, y - t); cx.lineTo(x + t, y); cx.lineTo(x, y + t); cx.lineTo(x - t, y); cx.closePath(); cx.fill(); cx.stroke(); } }
  }, [br, w, h, punktar, eftir, stada]);
  return <canvas ref={ref} aria-hidden="true" />;
}

export default function Haedir({ yfirlit, punktar, eftir, hopar, markDeild, markHluta }: Props) {
  const [hopVal, setHopVal] = useState<Set<string>>(new Set());     // tómt = allir flokkahópar
  const [flVal, setFlVal] = useState<Set<string>>(new Set());       // stærðir (flokkar) — aðeins þegar einn hópur er valinn
  const [stada, setStada] = useState<Stada>("allt");
  const [afDeild, setAfDeild] = useState<Record<string, boolean>>({});
  const [afHaed, setAfHaed] = useState<Record<string, boolean>>({});
  const [fra, setFra] = useState(""); const [til, setTil] = useState("");
  const skipta = (s: Set<string>, k: string) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; };

  const valdir = useMemo(() => (hopVal.size ? hopar.filter((h) => hopVal.has(h[0])).map((h) => h[0]) : hopar.map((h) => h[0])), [hopVal, hopar]);
  const einnHopur = hopVal.size === 1 ? [...hopVal][0] : null;
  /** Stærðir (flokkar) valda hópsins, í stærðarröð. */
  const staerdir = useMemo(() => {
    if (!einnHopur) return [];
    const m = new Map<string, number>(); for (const p of punktar) if (p.hop === einnHopur) m.set(p.fl, (m.get(p.fl) || 0) + 1);
    return [...m].sort((a, b) => (parseInt(a[0].replace(/^\D+/, ""), 10) || 0) - (parseInt(b[0].replace(/^\D+/, ""), 10) || 0));
  }, [einnHopur, punktar]);
  const manudir = useMemo(() => [...new Set(punktar.map((p) => p.man).filter((m): m is string => !!m))].sort(), [punktar]);
  const medMarkmid = flVal.size === 0 && !fra && !til;   // markmið eru skilgreind á flokkahóp: stærðar- og tímabilssía sýna aðeins fjölda

  const siadir = useMemo(() => punktar.filter((p) => {
    if (hopVal.size ? !p.hop || !hopVal.has(p.hop) : false) return false;
    if (flVal.size && !flVal.has(p.fl)) return false;
    if (afDeild[p.deild] || afHaed[p.haed]) return false;
    if (fra && (!p.man || p.man < fra)) return false;
    if (til && (!p.man || p.man > til)) return false;
    return true;
  }), [punktar, hopVal, flVal, afDeild, afHaed, fra, til]);
  const eftirSiad = useMemo(() => (flVal.size || fra || til ? [] : eftir.filter((e) => !(hopVal.size ? !e.hop || !hopVal.has(e.hop) : false) && !afDeild[e.deild] && !afHaed[e.haed])), [eftir, hopVal, flVal, afDeild, afHaed, fra, til]);

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
  const syndarHaedir = HAEDIR.filter((h) => !afHaed[h] && yfirlit.some((y) => y.haed === h));
  const syndarDeildir = DEILDIR.filter((d) => !afDeild[d]);
  const haedAlls = (haed: string) => syndarDeildir.reduce((a, d) => leggja(a, reiturD(haed, d)), TOMUR);
  const alls = syndarHaedir.reduce((a, h) => leggja(a, haedAlls(h)), TOMUR);
  const eftirAlls = eftirSiad.reduce((a, e) => a + e.n, 0);
  const virkar = hopVal.size + flVal.size + (stada !== "allt" ? 1 : 0) + Object.values(afDeild).filter(Boolean).length + Object.values(afHaed).filter(Boolean).length + (fra ? 1 : 0) + (til ? 1 : 0);
  const hreinsa = () => { setHopVal(new Set()); setFlVal(new Set()); setStada("allt"); setAfDeild({}); setAfHaed({}); setFra(""); setTil(""); };
  const siulysing = [
    hopVal.size ? hopar.filter((h) => hopVal.has(h[0])).map((h) => h[1]).join(", ") : "Allir flokkar",
    flVal.size ? [...flVal].join(", ") : "",
    stada === "done" ? "aðeins klárað" : stada === "opid" ? "aðeins opið" : stada === "eftir" ? "aðeins áætluð göt án skráningar" : "",
    Object.values(afDeild).some(Boolean) ? `deildir ${syndarDeildir.join(", ")}` : "",
    fra || til ? `tímabil ${fra || "…"} – ${til || "…"}` : "",
  ].filter(Boolean).join(" · ");
  const texti = (r: Reitur) => (r.m != null ? `${num(r.kl)} / ${num(r.m)}` : `${num(r.done)} klárað`);

  return (
    <div className="sk-hk">
      <div className="sk-sia sk-skjar">
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
        <div className="sk-sia-rod"><span>Staða</span>
          {([["allt", "Allt"], ["done", "Klárað"], ["opid", "Opið"], ["eftir", "Eftir (áætlað, óskráð)"]] as const).map(([k, nafn]) => <button key={k} type="button" className={stada === k ? "on" : ""} onClick={() => setStada(k)}>{nafn}</button>)}
        </div>
        <div className="sk-sia-rod"><span>Hæð og deild</span>
          {HAEDIR.filter((h) => yfirlit.some((y) => y.haed === h)).map((h) => <button key={h} type="button" className={afHaed[h] ? "" : "on"} aria-pressed={!afHaed[h]} onClick={() => setAfHaed((x) => ({ ...x, [h]: !x[h] }))}>{h.replace("H", ". hæð")}</button>)}
          <i />
          {DEILDIR.map((d) => <button key={d} type="button" className={afDeild[d] ? "" : "on"} aria-pressed={!afDeild[d]} onClick={() => setAfDeild((x) => ({ ...x, [d]: !x[d] }))}>{d}</button>)}
        </div>
        <div className="sk-sia-rod"><span>Tímabil</span>
          <label>Frá <select value={fra} onChange={(e) => setFra(e.target.value)}><option value="">—</option>{manudir.map((m) => <option key={m} value={m}>{m.slice(5)}.{m.slice(0, 4)}</option>)}</select></label>
          <label>Til <select value={til} onChange={(e) => setTil(e.target.value)}><option value="">—</option>{manudir.map((m) => <option key={m} value={m}>{m.slice(5)}.{m.slice(0, 4)}</option>)}</select></label>
          {virkar > 0 && <button type="button" className="sk-sia-hreinsa" onClick={hreinsa}>Hreinsa síur ({virkar})</button>}
        </div>
      </div>
      <p className="sk-prent sk-smatt">Síur: {siulysing}</p>

      <div className="sk-hk-tolur">
        <div><span>Klárað</span><b>{num(alls.done)}</b></div>
        <div><span>Opið</span><b>{num(alls.open)}</b></div>
        <div><span>Eftir, áætlað og óskráð</span><b>{num(eftirAlls)}</b></div>
        <div><span>Markmið</span><b>{alls.m != null ? num(alls.m) : "—"}</b></div>
        <div className="sk-hk-pros"><span>Hlutfall</span><b>{alls.m != null ? `${pros(alls.kl, alls.m)} %` : "—"}</b></div>
      </div>
      {!medMarkmid && <p className="sk-smatt">Prósentur eru ekki sýndar með stærðar- eða tímabilssíu: markmiðin eru skilgreind á flokkahóp, ekki á stærð eða mánuð.</p>}

      {syndarHaedir.map((haed) => {
        const y = yfirlit.find((q) => q.haed === haed)!; const ha = haedAlls(haed);
        const pH = siadir.filter((p) => p.haed === haed), eH = eftirSiad.filter((e) => e.haed === haed);
        if (ha.done + ha.open === 0 && ha.m == null && eH.length === 0) return null;   // sían skilur ekkert eftir á þessari hæð
        const eDeild = (d: string) => eH.filter((e) => e.deild === d).reduce((a, e) => a + e.n, 0);
        return (
          <div key={haed} className="sk-hk-haed">
            <h3>{haed.replace("H", ". hæð")} <span>{ha.m != null ? `${num(ha.kl)} af ${num(ha.m)} · ${pros(ha.kl, ha.m)} %` : `${num(ha.done)} klárað`}{ha.open ? ` · ${num(ha.open)} opið` : ""}{eH.length ? ` · ${num(eH.reduce((a, e) => a + e.n, 0))} eftir (áætlað)` : ""}</span></h3>
            <div className="sk-hk-flogg">
              {syndarDeildir.map((d) => { const r = reiturD(haed, d), p = r.m != null ? pros(r.kl, r.m) : null, c = litur(p); return <div key={d} style={{ left: `${GEO[d][0]}%`, width: `${GEO[d][1]}%`, borderColor: c[1], color: c[2], background: c[0] }}><b>{d}{p != null ? ` · ${p} %` : ""}</b><small>{texti(r)}</small></div>; })}
            </div>
            <div className="sk-hk-mynd" style={{ aspectRatio: `${y.w} / ${y.h}` }}>
              {y.mynd && <img src={publicUrl(y.mynd)} alt={`Yfirlitsteikning ${haed}`} />}
              <Punktalag w={y.w} h={y.h} punktar={pH} eftir={eH} stada={stada} />
              {syndarDeildir.flatMap((d) => HLUTAR.map(([s, nafn], i) => { const r = reiturH(haed, d, i), p = r.m != null ? pros(r.kl, r.m) : null, c = litur(p); return (
                <div key={d + s} className="sk-hk-hluti" style={{ left: `${GEO[d][0]}%`, width: `${GEO[d][1]}%`, top: `${BIL[i][0]}%`, height: `${BIL[i][1]}%`, borderColor: c[1], background: c[0] }} title={`${haed} ${d} ${nafn}: ${texti(r)}${r.open ? `, ${r.open} opið` : ""}`}>
                  <span style={{ color: c[2] }}><b>{p != null ? `${p} %` : num(r.done)}</b><small>{nafn}</small></span>
                </div>
              ); }))}
            </div>
            <table className="sk-tafla sk-hk-tafla">
              <thead><tr><th>Deild</th>{HLUTAR.map(([s, nafn]) => <th key={s}>{nafn}</th>)}<th>Deildin</th><th>Opið</th><th>Eftir (áætlað)</th></tr></thead>
              <tbody>
                {syndarDeildir.map((d) => { const rd = reiturD(haed, d), pd = rd.m != null ? pros(rd.kl, rd.m) : null; return (
                  <tr key={d}>
                    <td className="sk-v"><b>{d}</b></td>
                    {HLUTAR.map(([s], i) => { const r = reiturH(haed, d, i), p = r.m != null ? pros(r.kl, r.m) : null; return <td key={s} style={{ background: litur(p)[0] }}>{p != null ? <b>{p} % </b> : null}<small>{texti(r)}{r.open ? ` · +${num(r.open)}` : ""}</small></td>; })}
                    <td style={{ background: litur(pd)[0] }}>{pd != null ? <b>{pd} % </b> : null}<small>{texti(rd)}</small></td>
                    <td>{rd.open ? num(rd.open) : ""}</td><td>{eDeild(d) ? num(eDeild(d)) : ""}</td>
                  </tr>
                ); })}
              </tbody>
            </table>
          </div>
        );
      })}
      <p className="sk-hk-skyring"><i className="g" />klárað <i className="o" />opið í Ajour <i className="e" />áætlað gat án skráningar · litur hluta: <i className="l1" />95 % eða meira <i className="l2" />75–94 % <i className="l3" />undir 75 % <i className="l0" />ekkert markmið</p>
      <p className="sk-smatt">Hver punktur er ein skráning á sínum stað á hæðinni (færðir punktar á gatakortinu ráða). Deild og hluti ráðast af stöðu punktsins. Markmið hluta fylgir sömu reglu og deildin; föst markmið á deild (milliloft, rafmagn) skiptast jafnt á hlutana þrjá, svo summa hluta getur vikið lítillega frá markmiði deildar. „Eftir“ eru áætluð göt af gatakortinu sem engin skráning parast við — þau eru aðeins til þar sem göt hafa verið áætluð (6. hæð S1 og S2, loftræsting á 5. hæð S1 og S2).</p>
    </div>
  );
}
