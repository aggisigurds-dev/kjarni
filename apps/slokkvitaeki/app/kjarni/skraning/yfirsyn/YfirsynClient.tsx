"use client";

/* Yfirsýndarborð (Agnar 14.10: „gott yfirsýndarborð … nánari greiningar … jafnvel tengja Tímaveru inn").
 * Eitt kall: rpc skr_maelabord(dagar) → allar tölur. Teikningar eru CSS/SVG, engin pakkasöfn. */

import { useEffect, useMemo, useState } from "react";
import { SUPABASE_URL, SUPABASE_KEY } from "@/app/lib/supabase";

type Kpi = { alls: number; done: number; created: number; i_dag: number; vika: number; manudur: number; done_thessi_man: number; done_fyrri_man: number; done_fyrri_man_sama?: number; elsta_opna_dagar: number | null; virk_verk: number; virkir_dagar_30: number; menn_30d: number; timar_30d: number; timar_30d_allt: number };
type Dagur = { d: string; alls: number; done: number; timar: number };
type Manudur = { m: string; alls: number; done: number; timar: number; menn: number };
type Verk = { project_name: string; verkheiti: string; uppruni: string; verk_id: number | null; alls: number; done: number; created: number; vika: number; manudur: number; sidast: string | null; elsta_opna: number | null; menn_30d: number; vikur12: number[]; timar_30d: number; timar_alls: number };
type Madur = { nr: number; nafn: string; got_30d: number; got_180d: number; got_alls: number; timar_30d: number; timar_180d: number; verk_30d: number; sidast: string | null; man6: number[] };
type Flokkur = { heiti: string; d30: number; d180: number; alls: number };
type Aldur = { project_name: string; a7: number; a30: number; a90: number; eldri: number; alls: number };
type Nyjast = { project_name: string; serial: string; flokkur: string | null; nr: number | null; stada: string; dags: string; mynd: string | null; uppruni: string; verk_id: number | null; teikning_id: number | null };
type Gogn = { kpi: Kpi; dagar: Dagur[]; manudir: Manudur[]; verk: Verk[]; menn: Madur[]; flokkar: Flokkur[]; aldur: Aldur[]; nyjast: Nyjast[]; tv_otengt: { verk: string; timar: number }[] | null; buid_til: string };

const MAN = ["jan", "feb", "mar", "apr", "maí", "jún", "júl", "ágú", "sep", "okt", "nóv", "des"];
const fmt = (n: number) => Math.round(n).toLocaleString("is-IS");
const f1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString("is-IS");
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const dmy = (d: string | null) => (d ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : "—");
const mlabel = (m: string) => `${MAN[Number(m.slice(5)) - 1]} ${m.slice(2, 4)}`;
const MYND = (p: string) => `${SUPABASE_URL}/storage/v1/object/public/skraning/${p}`;
const verkSlod = (p: string) => `/kjarni/skraning?verk=${encodeURIComponent(p)}`;

export default function YfirsynClient() {
  const [g, setG] = useState<Gogn | null>(null);
  const [villa, setVilla] = useState<string | null>(null);
  const [dagar, setDagar] = useState(90);
  useEffect(() => {
    setG(null);
    fetch(`${SUPABASE_URL}/rest/v1/rpc/skr_maelabord`, { method: "POST", headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ p_dagar: dagar }) })
      .then(async (r) => { if (!r.ok) throw new Error(`${r.status} ${await r.text()}`); return r.json(); })
      .then(setG).catch((e) => setVilla(String(e.message || e)));
  }, [dagar]);

  const virkVerk = useMemo(() => (g ? g.verk.filter((v) => v.manudur > 0 || v.created > 0) : []), [g]);
  const onnurVerk = useMemo(() => (g ? g.verk.filter((v) => !(v.manudur > 0 || v.created > 0)) : []), [g]);
  const maxDag = useMemo(() => (g ? Math.max(1, ...g.dagar.map((d) => Math.max(d.alls, d.done))) : 1), [g]);
  const maxMan = useMemo(() => (g ? Math.max(1, ...g.manudir.map((m) => Math.max(m.alls, m.done))) : 1), [g]);
  const maxManTimar = useMemo(() => (g ? Math.max(1, ...g.manudir.map((m) => m.timar)) : 1), [g]);

  if (villa) return <div className="yf"><p className="skr-villa">Gat ekki sótt mælaborðið: {villa}</p></div>;
  if (!g) return <div className="yf"><p className="yf-saeki">Sæki yfirsýn…</p></div>;
  const k = g.kpi;
  // samanburður við SAMA tímabil fyrri mánaðar (1.–í dag), ekki heilan mánuð
  const sama = k.done_fyrri_man_sama ?? k.done_fyrri_man;
  const trend = sama ? Math.round(((k.done_thessi_man - sama) / sama) * 100) : null;
  const gotPerTima = k.timar_30d ? k.manudur / k.timar_30d : null;

  return (
    <div className="yf">
      <div className="yf-haus">
        <div><h1>Yfirsýn</h1><p>Allar brunaþéttingar — Ajour-sagan og Kjarna-skráningar saman · tímar úr Tímaveru · uppfært {g.buid_til.slice(11, 16)}</p></div>
        <div className="yf-val">{[30, 90, 180, 365].map((n) => <button type="button" key={n} className={dagar === n ? "on" : ""} onClick={() => setDagar(n)}>{n} dagar</button>)}</div>
      </div>

      {/* KPI */}
      <section className="yf-kpi">
        <Kort t="Skráningar alls" v={fmt(k.alls)} u={`${pct(k.done, k.alls)} % Done`} />
        <Kort t="Opnar (Created)" v={fmt(k.created)} u={k.elsta_opna_dagar ? `elsta ${k.elsta_opna_dagar} daga` : "engin opin"} litur={k.created > 200 ? "gul" : ""} />
        <Kort t="Í dag / 7 dagar / 30 dagar" v={`${fmt(k.i_dag)} / ${fmt(k.vika)} / ${fmt(k.manudur)}`} u={`${k.virkir_dagar_30} virkir dagar · ${k.virkir_dagar_30 ? f1(k.manudur / k.virkir_dagar_30) : 0} á dag`} />
        <Kort t="Done þennan mánuð" v={fmt(k.done_thessi_man)} u={`sama tímabil fyrri mán. ${fmt(sama)}${trend !== null ? ` · ${trend >= 0 ? "+" : ""}${trend} %` : ""} · allur fyrri mán. ${fmt(k.done_fyrri_man)}`} litur={trend !== null && trend < 0 ? "gul" : "graen"} />
        <Kort t="Virk verk / menn (30 d)" v={`${k.virk_verk} / ${k.menn_30d}`} u="verk með skráningu sl. 14 daga" />
        <Kort t="Tímavera 30 dagar" v={`${fmt(k.timar_30d)} klst`} u={`${gotPerTima ? f1(gotPerTima) : "—"} göt/klst á þéttingaverkum · ${fmt(k.timar_30d_allt)} klst alls`} />
      </section>

      {/* dagar */}
      <section className="yf-spjald">
        <h2>Afköst per dag <small>— gular súlur skráð (framkvæmdadagur), grænar lokið, lína = Tímavera-tímar á þéttingaverkum</small></h2>
        <div className="yf-sulur" style={{ gridTemplateColumns: `repeat(${g.dagar.length}, 1fr)` }}>
          {g.dagar.map((d) => (
            <div key={d.d} className="yf-sula" title={`${dmy(d.d)}: ${d.alls} skráð · ${d.done} lokið · ${f1(d.timar)} klst`}>
              <i className="alls" style={{ height: `${(d.alls / maxDag) * 100}%` }} />
              <i className="done" style={{ height: `${(d.done / maxDag) * 100}%` }} />
              {d.timar > 0 && <b style={{ bottom: `${Math.min(100, (d.timar / Math.max(1, ...g.dagar.map((x) => x.timar))) * 100)}%` }} />}
              {(d.d.slice(8) === "01" || g.dagar.length <= 31) && <span>{g.dagar.length <= 31 ? d.d.slice(8) : mlabel(d.d.slice(0, 7))}</span>}
            </div>
          ))}
        </div>
      </section>

      <div className="yf-grid2">
        {/* mánuðir */}
        <section className="yf-spjald">
          <h2>12 mánuðir <small>— skráð · lokið · tímar · menn</small></h2>
          <table className="skr-tafla yf-tafla">
            <thead><tr><th>Mán.</th><th>Skráð</th><th className="t"></th><th className="t">Lokið</th><th className="t">Klst</th><th className="t">Göt/klst</th><th className="t">Menn</th></tr></thead>
            <tbody>
              {[...g.manudir].reverse().map((m) => (
                <tr key={m.m}>
                  <td>{mlabel(m.m)}</td>
                  <td className="yf-bar"><i style={{ width: `${(m.alls / maxMan) * 100}%` }} /><i className="done" style={{ width: `${(m.done / maxMan) * 100}%` }} /></td>
                  <td className="t">{fmt(m.alls)}</td><td className="t g">{fmt(m.done)}</td>
                  <td className="t"><span className="yf-timar" style={{ width: `${(m.timar / maxManTimar) * 60}px` }} />{fmt(m.timar)}</td>
                  <td className="t">{m.timar ? f1(m.alls / m.timar) : "—"}</td><td className="t">{m.menn}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* flokkar */}
        <section className="yf-spjald">
          <h2>Flokkar <small>— síðustu 30 / 180 dagar (= verðskrárlínur)</small></h2>
          <ul className="yf-listi">
            {g.flokkar.slice(0, 14).map((f) => (
              <li key={f.heiti}><span>{f.heiti}</span><i style={{ width: `${(f.d180 / Math.max(1, g.flokkar[0]?.d180 || 1)) * 100}%` }} /><b>{fmt(f.d30)} <small>/ {fmt(f.d180)}</small></b></li>
            ))}
          </ul>
        </section>
      </div>

      {/* verk */}
      <section className="yf-spjald">
        <h2>Verk <small>— virk fyrst (skráning sl. 30 daga eða opnir punktar); 12 vikna ferill, Tímavera-tímar þar sem heiti para saman</small></h2>
        <table className="skr-tafla yf-tafla yf-verk">
          <thead><tr><th>Verk</th><th>12 vikur</th><th className="t">Alls</th><th className="t">Done %</th><th className="t">Opnar</th><th className="t">Elsta opna</th><th className="t">7 d</th><th className="t">30 d</th><th className="t">Menn 30 d</th><th className="t">Klst 30 d</th><th className="t">Göt/klst</th><th>Síðast</th></tr></thead>
          <tbody>
            {virkVerk.map((v) => <VerkRod key={v.project_name} v={v} />)}
            {onnurVerk.length > 0 && <tr className="yf-skil"><td colSpan={12}>Óvirk verk ({onnurVerk.length}) — engin skráning sl. 30 daga og ekkert opið</td></tr>}
            {onnurVerk.map((v) => <VerkRod key={v.project_name} v={v} dauft />)}
          </tbody>
        </table>
        {g.tv_otengt && g.tv_otengt.length > 0 && <p className="yf-ath">Tímavera-tímar sl. 30 daga á verkum sem engin skráning passar við: {g.tv_otengt.map((t) => `${t.verk} (${fmt(t.timar)} klst)`).join(" · ")}. Para með <code>project_aliases</code> ef þetta eru þéttingaverk.</p>}
      </section>

      <div className="yf-grid2">
        {/* menn */}
        <section className="yf-spjald">
          <h2>Starfsmenn <small>— göt sl. 30 / 180 daga, Tímavera-tímar, 6 mánaða ferill</small></h2>
          <table className="skr-tafla yf-tafla">
            <thead><tr><th>Starfsmaður</th><th className="t">30 d</th><th className="t">180 d</th><th className="t">Klst 30 d</th><th className="t">Göt/klst</th><th className="t">Verk</th><th>6 mán.</th><th>Síðast</th></tr></thead>
            <tbody>
              {g.menn.map((m) => (
                <tr key={m.nr} className={m.got_30d ? "" : "dauft"}>
                  <td><b>{m.nr}</b> {m.nafn}</td>
                  <td className="t"><strong>{fmt(m.got_30d)}</strong></td><td className="t">{fmt(m.got_180d)}</td>
                  <td className="t">{m.timar_30d ? fmt(m.timar_30d) : ""}</td><td className="t">{m.timar_30d ? f1(m.got_30d / m.timar_30d) : ""}</td>
                  <td className="t">{m.verk_30d || ""}</td>
                  <td><Spark v={m.man6} /></td>
                  <td>{dmy(m.sidast)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* aldur opinna */}
        <section className="yf-spjald">
          <h2>Opnir punktar eftir aldri <small>— &lt;7 d · 7–30 · 30–90 · eldri</small></h2>
          <ul className="yf-aldur">
            {g.aldur.slice(0, 15).map((a) => (
              <li key={a.project_name}>
                <a href={verkSlod(a.project_name)}>{a.project_name}</a>
                <div className="yf-stapli" title={`${a.a7} <7 d · ${a.a30} 7–30 · ${a.a90} 30–90 · ${a.eldri} eldri`}>
                  {a.a7 > 0 && <i className="a7" style={{ flex: a.a7 }}>{a.a7}</i>}
                  {a.a30 > 0 && <i className="a30" style={{ flex: a.a30 }}>{a.a30}</i>}
                  {a.a90 > 0 && <i className="a90" style={{ flex: a.a90 }}>{a.a90}</i>}
                  {a.eldri > 0 && <i className="eldri" style={{ flex: a.eldri }}>{a.eldri}</i>}
                </div>
                <b>{a.alls}</b>
              </li>
            ))}
            {!g.aldur.length && <li className="tomt">Engir opnir punktar</li>}
          </ul>
          <h2 className="yf-undirh">Nýjustu skráningar</h2>
          <ul className="yf-nyjast">
            {g.nyjast.map((n, i) => (
              <li key={i}>
                {n.mynd ? <img src={MYND(n.mynd)} alt="" /> : <span className={`yf-punktur ${n.stada === "done" ? "done" : ""}`} />}
                <span><b>#{n.serial}</b> {n.flokkur || ""}{n.nr ? ` · Starfsmaður ${n.nr}` : ""}</span>
                <small>{n.uppruni === "skraning" && n.verk_id ? <a href={`/kjarni/skraning/vinna?verk=${n.verk_id}${n.teikning_id ? `&teikning=${n.teikning_id}` : ""}`}>{n.project_name} ★</a> : <a href={verkSlod(n.project_name)}>{n.project_name}</a>} · {dmy(n.dags)}</small>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Kort({ t, v, u, litur }: { t: string; v: string; u: string; litur?: string }) {
  return <div className={`yf-kort ${litur || ""}`}><span>{t}</span><strong>{v}</strong><small>{u}</small></div>;
}
function Spark({ v }: { v: number[] }) {
  const max = Math.max(1, ...v);
  return <span className="yf-spark">{v.map((n, i) => <i key={i} style={{ height: `${Math.max(2, (n / max) * 100)}%` }} title={String(n)} />)}</span>;
}
function VerkRod({ v, dauft }: { v: Verk; dauft?: boolean }) {
  const gpt = v.timar_30d ? v.manudur / v.timar_30d : null;
  return (
    <tr className={dauft ? "dauft" : ""}>
      <td><a href={verkSlod(v.project_name)}>{v.project_name}</a>{v.uppruni === "skraning" && <span className="aj-stjarna"> ★</span>}{v.verkheiti !== v.project_name && <small className="yf-tv">Tímavera: {v.verkheiti}</small>}</td>
      <td><Spark v={v.vikur12 || []} /></td>
      <td className="t">{fmt(v.alls)}</td>
      <td className="t"><span className="yf-pct"><i style={{ width: `${pct(v.done, v.alls)}%` }} /></span>{pct(v.done, v.alls)} %</td>
      <td className="t">{v.created ? <b className="y">{fmt(v.created)}</b> : "0"}</td>
      <td className="t">{v.elsta_opna != null ? `${v.elsta_opna} d` : ""}</td>
      <td className="t">{v.vika || ""}</td><td className="t">{v.manudur || ""}</td><td className="t">{v.menn_30d || ""}</td>
      <td className="t">{v.timar_30d ? fmt(v.timar_30d) : ""}</td><td className="t">{gpt ? f1(gpt) : ""}</td>
      <td>{dmy(v.sidast)}</td>
    </tr>
  );
}
