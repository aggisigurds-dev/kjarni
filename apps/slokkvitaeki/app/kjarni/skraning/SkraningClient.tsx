"use client";

/* Skráning — eftirmynd af AjourInspect & QA (HT-13.10) með endurbótunum sem Agnar bað um.
 *
 * Tvær sýnir, báðar í slóðinni:
 *   · ekkert verk valið  → „Öll verk": yfirlitið sem Ajour vantar — EITT kall (rpc skr_verk_yfirlit), ein röð per verk
 *   · verk valið (?verk=) → skjárinn eins og í Ajour: Project · Status on registrations · Registration drawings ·
 *     hóp-pillur · Create registration · skráningataflan — raðir þess verks úr viewinu skr_yfirlit
 *   · ?skyrsla=1          → Report generator-sýnin okkar: síur + skipting + CSV (án verks: allar raðir sóttar)
 *
 * skr_yfirlit = Ajour-innflutningurinn ∪ eigin skráningar (skr_*) í sömu dálkum; `uppruni` segir hvort er.
 * Talið eftir `execution_date` (framkvæmt) nema annað sé sagt; `checked_date` (lokið/hakað) sýnd við hlið.
 */

import { useEffect, useMemo, useState } from "react";
import { SUPABASE_URL, SUPABASE_KEY } from "@/app/lib/supabase";

type Row = {
  uppruni: "ajour" | "skraning";
  lykill: string;
  skraning_id: number | null;
  verk_id: number | null;
  teikning_id: number | null;
  serial_number: string | null;
  stada: string;
  project_name: string;
  category_group: string | null;
  category: string | null;
  category1: string | null;
  checklist_item: string | null;
  execution_date: string | null;
  checked_date: string | null;
  checked_by_user: string | null;
  registration_created_date: string | null;
  drawing_name: string | null;
  subject: string | null;
  receiver_company: string | null;
  imported_at: string | null;
  myndir: number;
  mynd_path: string | null;
};
type VerkYfirlit = {
  project_name: string; uppruni: "ajour" | "skraning"; verk_id: number | null; alls: number; done: number; created: number;
  i_dag: number; vika: number; manudur: number; fyrri_man_done: number; sidast: string | null; sott: string | null; teikn: number; menn: number;
};

const COLS = "uppruni,lykill,skraning_id,verk_id,teikning_id,serial_number,stada,project_name,category_group,category,category1,checklist_item,execution_date,checked_date,checked_by_user,registration_created_date,drawing_name,subject,receiver_company,imported_at,myndir,mynd_path";
const PAGE = 1000;
const SIDA = 100;
const HDR = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
const MYND = (p: string) => `${SUPABASE_URL}/storage/v1/object/public/skraning/${p}`;
const STODUR: Record<string, string> = { created: "Created", done: "Done", completed: "Completed", rejected: "Rejected", not_approved: "Not approved" };

type F = { verk: string; hopur: string; starfsm: string; teikning: string; stada: string; fra: string; til: string; q: string; sida: string; skyrsla: string };
const EMPTY: F = { verk: "", hopur: "", starfsm: "", teikning: "", stada: "", fra: "", til: "", q: "", sida: "", skyrsla: "" };
const KEYS = Object.keys(EMPTY) as (keyof F)[];

function readF(): F {
  if (typeof window === "undefined") return EMPTY;
  const p = new URLSearchParams(window.location.search);
  const f = { ...EMPTY };
  KEYS.forEach((k) => { f[k] = p.get(k) || ""; });
  return f;
}
function writeF(f: F) {
  const p = new URLSearchParams();
  KEYS.forEach((k) => { if (f[k]) p.set(k, f[k]); });
  const qs = p.toString();
  window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
}

const MANUDIR = ["janúar", "febrúar", "mars", "apríl", "maí", "júní", "júlí", "ágúst", "september", "október", "nóvember", "desember"];
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const fmt = (n: number) => n.toLocaleString("is-IS");
const dmy = (d: string | null) => (d ? `${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(0, 4)}` : "");
const isDone = (r: Row) => r.stada === "done";
const stadaLabel = (r: Row) => STODUR[r.stada] || r.stada;

async function fetchRows(filter: string): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/skr_yfirlit?select=${COLS}${filter}&order=lykill`, { headers: { ...HDR, Range: `${from}-${from + PAGE - 1}` } });
    if (!res.ok && res.status !== 206) throw new Error(`${res.status} ${await res.text()}`);
    const page = (await res.json()) as Row[];
    out.push(...page);
    if (page.length < PAGE) break;
  }
  return out;
}
async function fetchYfirlit(): Promise<VerkYfirlit[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/skr_verk_yfirlit`, { method: "POST", headers: { ...HDR, "Content-Type": "application/json" }, body: "{}" });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()) as VerkYfirlit[];
}

function tally(rows: Row[], key: (r: Row) => string | null): [string, number][] {
  const m = new Map<string, number>();
  for (const r of rows) { const k = key(r) || "—"; m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export default function SkraningClient() {
  const [yfirlit, setYfirlit] = useState<VerkYfirlit[] | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);       // raðir valins verks (eða allar í skýrsluham án verks)
  const [rowsFor, setRowsFor] = useState<string | null>(null); // hvaða verk raðirnar eiga við ("" = allar)
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState<F>(EMPTY);
  const [ready, setReady] = useState(false);

  useEffect(() => { setF(readF()); setReady(true); }, []);
  useEffect(() => { fetchYfirlit().then(setYfirlit).catch((e) => setError(String(e.message || e))); }, []);

  // raðir: fyrir valið verk, eða allar þegar skýrslugerð er opin án verks
  const vilRadir = ready && (f.verk || f.skyrsla);
  const radaLykill = f.verk ? f.verk : f.skyrsla ? "" : null;
  useEffect(() => {
    if (!vilRadir || radaLykill === null || radaLykill === rowsFor) return;
    let lifandi = true;
    setRows(null);
    const filter = radaLykill ? `&project_name=eq.${encodeURIComponent(radaLykill)}` : "";
    fetchRows(filter).then((r) => { if (lifandi) { setRows(r); setRowsFor(radaLykill); } }).catch((e) => setError(String(e.message || e)));
    return () => { lifandi = false; };
  }, [vilRadir, radaLykill, rowsFor]);

  // writeF (history.replaceState) má ekki keyra inni í setState-updater — React keyrir hann í render og Next-routerinn kvartar
  const set = (patch: Partial<F>) => { const n = { ...f, ...patch }; if (!("sida" in patch)) n.sida = ""; writeF(n); setF(n); };

  const today = isoDay(new Date());
  const weekAgo = isoDay(new Date(Date.now() - 6 * 864e5));
  const monthStart = today.slice(0, 7) + "-01";
  const nu = new Date();
  const fyrriFra = isoDay(new Date(Date.UTC(nu.getUTCFullYear(), nu.getUTCMonth() - 1, 1)));
  const fyrriTil = isoDay(new Date(Date.UTC(nu.getUTCFullYear(), nu.getUTCMonth(), 0)));
  const fyrriNafn = MANUDIR[(nu.getUTCMonth() + 11) % 12];
  const lokid = (r: Row) => r.checked_date || r.execution_date || "";
  const doneFyrri = (r: Row) => isDone(r) && lokid(r) >= fyrriFra && lokid(r) <= fyrriTil;

  const verkid = yfirlit?.find((v) => v.project_name === f.verk) || null;
  const iVerki = useMemo(() => (rows && rowsFor === (f.verk || "") ? rows : []), [rows, rowsFor, f.verk]);
  const q = f.q.trim().toLowerCase();
  const sidad = useMemo(() => iVerki.filter((r) =>
    (!f.hopur || r.category_group === f.hopur) &&
    (!f.starfsm || r.category === f.starfsm) &&
    (!f.teikning || r.drawing_name === f.teikning) &&
    (!f.stada || stadaLabel(r) === f.stada) &&
    (!f.fra || (r.execution_date || "") >= f.fra) &&
    (!f.til || (r.execution_date || "") <= f.til) &&
    (!q || `${r.serial_number} ${r.subject || ""} ${r.checklist_item || ""} ${r.drawing_name || ""} ${r.category || ""} ${r.project_name}`.toLowerCase().includes(q)),
  ), [iVerki, f.hopur, f.starfsm, f.teikning, f.stada, f.fra, f.til, q]);

  const nDone = iVerki.filter(isDone).length;
  const nCreated = iVerki.length - nDone;
  const hopar = useMemo(() => tally(iVerki, (r) => r.category_group), [iVerki]);
  const teikningar = useMemo(() => tally(iVerki, (r) => r.drawing_name), [iVerki]);
  const menn = useMemo(() => tally(sidad, (r) => r.category), [sidad]);
  const hoparSiad = useMemo(() => tally(sidad, (r) => r.category_group), [sidad]);
  const teiknSiad = useMemo(() => tally(sidad, (r) => r.drawing_name), [sidad]);
  const eftirDegi = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of sidad) if (r.execution_date) m.set(r.execution_date, (m.get(r.execution_date) || 0) + 1);
    const days: { d: string; n: number }[] = [];
    for (let i = 29; i >= 0; i--) { const d = isoDay(new Date(Date.now() - i * 864e5)); days.push({ d, n: m.get(d) || 0 }); }
    return days;
  }, [sidad]);
  const maxDag = Math.max(1, ...eftirDegi.map((x) => x.n));

  const rodud = useMemo(() => [...sidad].sort((a, b) => (Number(b.serial_number) || 0) - (Number(a.serial_number) || 0) || a.lykill.localeCompare(b.lykill)), [sidad]);
  const sidur = Math.max(1, Math.ceil(rodud.length / SIDA));
  const sidaNr = Math.min(sidur, Math.max(1, Number(f.sida) || 1));
  const aSidu = rodud.slice((sidaNr - 1) * SIDA, sidaNr * SIDA);

  const csv = () => {
    const h = ["radnr", "verk", "teikning", "flokkur", "starfsmadur", "stada", "framkvaemt", "lokid", "gatlisti", "athugasemd", "uppruni"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [h.join(";"), ...sidad.map((r) => [r.serial_number, r.project_name, r.drawing_name, r.category_group, r.category, stadaLabel(r), r.execution_date, r.checked_date, r.checklist_item, r.subject, r.uppruni].map(esc).join(";"))];
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `skraning-${f.verk || "oll-verk"}-${today}.csv`; a.click();
  };

  if (error) return <div className="skr"><p className="skr-villa">Gat ekki sótt skráningar: {error}</p></div>;

  const synd = sidad.length !== iVerki.length;
  const hledur = vilRadir && rows === null;
  const heild = yfirlit ? yfirlit.reduce((s, v) => s + v.alls, 0) : 0;
  const vinnuSlod = verkid?.verk_id ? `/kjarni/skraning/vinna?verk=${verkid.verk_id}` : "/kjarni/skraning/vinna";

  return (
    <div className="skr">
      {/* efsta stikan eins og í Ajour: QA-talning vinstra megin, aðgerðir hægra megin */}
      <div className="aj-tool">
        <button type="button" className="aj-qa" onClick={() => set({ stada: "", hopur: "", teikning: "", starfsm: "", q: "", fra: "", til: "" })} title="Allar QA-skráningar í verkinu">
          <span>✓</span> QA <b>{f.verk ? (verkid ? fmt(verkid.alls) : "…") : yfirlit ? fmt(heild) : "…"}</b>
        </button>
        <div className="aj-tool-r">
          <a className="aj-vinnuhlekkur" href={vinnuSlod}>📍 Vinna — punktar á teikningu</a>
          <a className="aj-vinnuhlekkur grar" href={verkid?.verk_id ? `/kjarni/skraning/verk?verk=${verkid.verk_id}` : "/kjarni/skraning/verk"}>🏢 Byggingar &amp; teikningar</a>
          <button type="button" onClick={() => window.print()}>Print</button>
          <a className="aj-takkahlekkur" href="/kjarni/skraning/flokkar">Categories/schema</a>
          <button type="button" className={f.skyrsla ? "on" : ""} onClick={() => set({ skyrsla: f.skyrsla ? "" : "1" })}>Report generator</button>
        </div>
      </div>

      {/* þrjú spjöld: Project · Status on registrations · Registration drawings */}
      <div className="aj-panels">
        <section className="aj-panel">
          <h3>Project</h3>
          <div className="aj-panel-b">
            <select className="aj-sel" value={f.verk} onChange={(e) => set({ verk: e.target.value, hopur: "", teikning: "", starfsm: "", stada: "" })}>
              <option value="">— Öll verk (yfirlit) —</option>
              {(yfirlit || []).map((v) => <option key={v.project_name} value={v.project_name}>{v.project_name}{v.uppruni === "skraning" ? " ★" : ""}</option>)}
            </select>
            <div className="aj-levels">
              {[1, 2, 3].map((n) => <div key={n}><i>{n}</i><select className="aj-sel" disabled><option>-</option></select></div>)}
            </div>
            {verkid && <p className="aj-uppruni">{verkid.uppruni === "skraning" ? "★ Skráð í Kjarna (eigin punktar, myndir)" : "Ajour-innflutningur (síðast sótt " + (verkid.sott ? verkid.sott.slice(0, 16).replace("T", " ") : "—") + ")"}</p>}
          </div>
        </section>

        <section className="aj-panel aj-status">
          <h3>Status on registrations</h3>
          <div className="aj-panel-b aj-status-b">
            <div className="aj-dist">
              <div className="aj-dist-l">%-distribution</div>
              <div className="aj-bar" title={`${nDone} Done af ${iVerki.length}`}>
                <i className="created" style={{ width: `${iVerki.length ? (nCreated / iVerki.length) * 100 : 0}%` }} />
                <i className="done" style={{ width: `${iVerki.length ? (nDone / iVerki.length) * 100 : 0}%` }} />
              </div>
              <div className="aj-dist-n">{iVerki.length ? Math.round((nDone / iVerki.length) * 100) : 0}</div>
            </div>
            <div className="aj-badges">
              <button type="button" className={`aj-badge all ${!f.stada ? "on" : ""}`} onClick={() => set({ stada: "" })}><b>{f.verk ? fmt(iVerki.length) : yfirlit ? fmt(heild) : "…"}</b> All</button>
              <button type="button" className={`aj-badge created ${f.stada === "Created" ? "on" : ""}`} onClick={() => set({ stada: f.stada === "Created" ? "" : "Created" })}><b>{f.verk ? fmt(nCreated) : yfirlit ? fmt(yfirlit.reduce((s, v) => s + v.created, 0)) : "…"}</b> Created</button>
              <button type="button" className={`aj-badge done ${f.stada === "Done" ? "on" : ""}`} onClick={() => set({ stada: f.stada === "Done" ? "" : "Done" })}><b>{f.verk ? fmt(nDone) : yfirlit ? fmt(yfirlit.reduce((s, v) => s + v.done, 0)) : "…"}</b> Done</button>
            </div>
            <div className="aj-tidni">
              <span>Í dag <b>{f.verk ? iVerki.filter((r) => r.execution_date === today).length : yfirlit?.reduce((s, v) => s + v.i_dag, 0) ?? "…"}</b></span>
              <span>7 dagar <b>{f.verk ? iVerki.filter((r) => (r.execution_date || "") >= weekAgo).length : yfirlit?.reduce((s, v) => s + v.vika, 0) ?? "…"}</b></span>
              <span>Mánuður <b>{f.verk ? iVerki.filter((r) => (r.execution_date || "") >= monthStart).length : yfirlit?.reduce((s, v) => s + v.manudur, 0) ?? "…"}</b></span>
              <span title={`Done með lokadag ${dmy(fyrriFra)}–${dmy(fyrriTil)}`}>Done {fyrriNafn} <b className="fyrri">{f.verk ? fmt(iVerki.filter(doneFyrri).length) : yfirlit ? fmt(yfirlit.reduce((s, v) => s + v.fyrri_man_done, 0)) : "…"}</b></span>
            </div>
          </div>
        </section>

        <section className="aj-panel">
          <h3>Registration drawings <button type="button" className="aj-mini" title="Teikningar koma úr skr_teikningar í áfanga 2" disabled>⟳</button></h3>
          <ul className="aj-drawings">
            {teikningar.filter(([k]) => k !== "—").map(([k, n]) => (
              <li key={k} className={f.teikning === k ? "on" : ""} onClick={() => set({ teikning: f.teikning === k ? "" : k })}><span>📄 {k}</span><b>{fmt(n)}</b></li>
            ))}
            {f.verk && !hledur && !teikningar.filter(([k]) => k !== "—").length && <li className="tomt">Engar teikningar í gögnunum fyrir þetta val.</li>}
            {!f.verk && <li className="tomt">Veldu verk til að sjá teikningar þess.</li>}
            {hledur && <li className="tomt">Sæki…</li>}
          </ul>
        </section>
      </div>

      {/* hóp-pillur eins og í Ajour — aðeins innan verks */}
      {f.verk && <div className="aj-chips">
        <button type="button" className={`aj-chip all ${!f.hopur ? "on" : ""}`} onClick={() => set({ hopur: "" })}>All groups</button>
        {hopar.filter(([k]) => k !== "—").map(([k, n]) => (
          <button type="button" key={k} className={`aj-chip ${f.hopur === k ? "on" : ""}`} onClick={() => set({ hopur: f.hopur === k ? "" : k })}>{k}<b>{fmt(n)}</b></button>
        ))}
      </div>}

      {/* Report generator-sýnin okkar */}
      {f.skyrsla && (
        <section className="aj-report">
          <h3>Report generator <small>— síur í slóðinni, CSV úr nákvæmlega því sem passar{!f.verk ? " · öll verk" : ""}</small></h3>
          {hledur ? <p className="vk-busy">⏳ Sæki raðir…</p> : (
            <>
              <div className="skr-siugrid">
                <label>Starfsmaður<select value={f.starfsm} onChange={(e) => set({ starfsm: e.target.value })}><option value="">Allir</option>{tally(iVerki, (r) => r.category).filter(([k]) => k !== "—").map(([k]) => <option key={k}>{k}</option>)}</select></label>
                <label>Frá<input type="date" value={f.fra} onChange={(e) => set({ fra: e.target.value })} /></label>
                <label>Til<input type="date" value={f.til} onChange={(e) => set({ til: e.target.value })} /></label>
                <label>Leit<input type="search" placeholder="raðnr · athugasemd · gátlisti" value={f.q} onChange={(e) => set({ q: e.target.value })} /></label>
                <button type="button" onClick={() => set({ hopur: "", starfsm: "", teikning: "", stada: "", fra: "", til: "", q: "" })}>Clear</button>
                <button type="button" className="aj-primary" onClick={csv}>Export as Csv ({fmt(sidad.length)})</button>
              </div>
              <div className="skr-grid3">
                <div><h4>Eftir flokki <small>(= verðskrárlínur)</small></h4><Listi items={hoparSiad} alls={sidad.length} valid={f.hopur} onPick={(k) => set({ hopur: f.hopur === k ? "" : k })} /></div>
                <div><h4>Eftir starfsmanni</h4><Listi items={menn} alls={sidad.length} valid={f.starfsm} onPick={(k) => set({ starfsm: f.starfsm === k ? "" : k })} /></div>
                <div><h4>Eftir teikningu</h4><Listi items={teiknSiad} alls={sidad.length} valid={f.teikning} onPick={(k) => set({ teikning: f.teikning === k ? "" : k })} /></div>
              </div>
              <h4>Síðustu 30 dagar <small>(framkvæmt)</small></h4>
              <div className="skr-sulur">
                {eftirDegi.map((x) => (
                  <div key={x.d} className="skr-sula" title={`${x.d}: ${x.n}`} onClick={() => set({ fra: x.d, til: x.d })}>
                    <i style={{ height: `${Math.round((x.n / maxDag) * 100)}%` }} /><b>{x.n || ""}</b><span>{x.d.slice(8)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {/* yfirlit yfir öll verk — það sem Ajour vantar */}
      {!f.verk && (
        <section className="aj-list">
          <div className="aj-listbar"><strong>Öll verk</strong><span>smelltu á verk til að opna það · ★ = skráð í Kjarna · <em>Sótt úr Ajour</em> rautt = eldra en vika</span></div>
          <table className="skr-tafla skr-verk">
            <thead><tr><th>Verk</th><th className="t">Alls</th><th className="t">Done</th><th className="t">Created</th><th className="t">Í dag</th><th className="t">7 dagar</th><th className="t">Mánuður</th><th className="t" title={`Done með lokadag ${dmy(fyrriFra)}–${dmy(fyrriTil)} (hakað/lokið, annars framkvæmt) — uppgjörsmánuðurinn`}>Done {fyrriNafn}</th><th>Síðast</th><th className="t">Teikn.</th><th className="t">Menn</th><th>Sótt úr Ajour</th></tr></thead>
            <tbody>
              {(yfirlit || []).map((v) => (
                <tr key={v.project_name} onClick={() => set({ verk: v.project_name })}>
                  <td><strong>{v.project_name}</strong>{v.uppruni === "skraning" && <span className="aj-stjarna" title="Skráð í Kjarna"> ★</span>}</td>
                  <td className="t">{fmt(v.alls)}</td>
                  <td className="t ok">{fmt(v.done)}</td>
                  <td className="t">{v.created ? <span className="bid">{fmt(v.created)}</span> : "0"}</td>
                  <td className="t">{v.i_dag || ""}</td><td className="t">{v.vika || ""}</td><td className="t">{v.manudur || ""}</td>
                  <td className="t fyrri">{v.fyrri_man_done ? fmt(v.fyrri_man_done) : ""}</td>
                  <td>{dmy(v.sidast) || "—"}</td>
                  <td className="t">{v.teikn}</td><td className="t">{v.menn}</td>
                  <td className={v.uppruni === "ajour" && v.sott && v.sott.slice(0, 10) < weekAgo ? "gamalt" : ""}>{v.uppruni === "skraning" ? "— (Kjarni)" : v.sott ? v.sott.slice(0, 16).replace("T", " ") : "—"}</td>
                </tr>
              ))}
              {!yfirlit && <tr><td colSpan={12}>Sæki yfirlit…</td></tr>}
            </tbody>
          </table>
        </section>
      )}

      {/* skráningataflan eins og í Ajour */}
      {f.verk && (
        <section className="aj-list">
          <div className="aj-listbar">
            {verkid?.verk_id
              ? <a className="aj-create on" href={`${vinnuSlod}`}>Create registration</a>
              : <button type="button" className="aj-create" disabled title="Ajour-verk: nýjar skráningar fara enn í Ajour þar til verkið er flutt yfir">Create registration</button>}
            <label className="aj-switch"><input type="checkbox" defaultChecked disabled /> Show forwarded</label>
            <label className="aj-switch"><input type="checkbox" disabled /> Show only forwards</label>
            <div className="aj-pager">
              <button type="button" onClick={() => set({ sida: "1" })} disabled={sidaNr <= 1}>⏮</button>
              <button type="button" onClick={() => set({ sida: String(sidaNr - 1) })} disabled={sidaNr <= 1}>◀</button>
              Page <input type="number" min={1} max={sidur} value={sidaNr} onChange={(e) => set({ sida: e.target.value })} /> of {sidur} ({fmt(sidad.length)} registrations{synd ? ` af ${fmt(iVerki.length)}` : ""})
              <button type="button" onClick={() => set({ sida: String(sidaNr + 1) })} disabled={sidaNr >= sidur}>▶</button>
              <button type="button" onClick={() => set({ sida: String(sidur) })} disabled={sidaNr >= sidur}>⏭</button>
            </div>
            <div className="aj-listbar-r">
              <input type="search" className="aj-search" placeholder="Search # / subject" value={f.q} onChange={(e) => set({ q: e.target.value })} />
              <button type="button" title="Hreinsa síur" onClick={() => set({ hopur: "", starfsm: "", teikning: "", stada: "", fra: "", til: "", q: "" })}>⨯</button>
            </div>
          </div>
          <table className="skr-tafla aj-reg">
            <thead><tr><th>#</th><th>Created</th><th>Drawing/GPS</th><th>Deadline</th><th>Category/List</th><th>Subject</th><th>Receiver</th><th>Responsible</th></tr></thead>
            <tbody>
              {aSidu.map((r) => (
                <tr key={r.lykill}>
                  <td className="aj-c-serial">
                    <span className={`aj-serial ${isDone(r) ? "done" : "created"}`}>{r.serial_number}</span>
                    {r.mynd_path
                      ? <a className="aj-thumb mynd" href={MYND(r.mynd_path)} target="_blank" rel="noreferrer" title={`${r.myndir} mynd${r.myndir === 1 ? "" : "ir"}`}><img src={MYND(r.mynd_path)} alt="" loading="lazy" />{r.myndir > 1 && <b>+{r.myndir - 1}</b>}</a>
                      : <div className="aj-thumb" title={r.uppruni === "ajour" ? "Ljósmyndir koma með innflutningi úr Ajour" : "Engin mynd"}>📷</div>}
                  </td>
                  <td className="aj-c-date">{dmy(r.execution_date)}<br /><small>{r.checked_date ? `lokið ${dmy(r.checked_date)}` : ""}</small></td>
                  <td>{r.drawing_name
                    ? (r.uppruni === "skraning" && r.verk_id
                      ? <a href={`/kjarni/skraning/vinna?verk=${r.verk_id}&teikning=${r.teikning_id}`} title="Opna teikninguna með pinnum">{r.drawing_name} (1)</a>
                      : <a href="#" onClick={(e) => { e.preventDefault(); set({ teikning: r.drawing_name || "" }); }}>{r.drawing_name} (1)</a>)
                    : <small>—</small>}</td>
                  <td></td>
                  <td className="aj-c-cat">
                    <em>{r.category_group}</em><br />{r.category}
                    <div className="aj-catbar">{r.category1 || "Brunaþéttingar / Fireproofing"}{r.checklist_item ? ` · ${r.checklist_item}` : ""}<span>≡</span></div>
                  </td>
                  <td>{r.subject}</td>
                  <td>{r.receiver_company && r.receiver_company !== "Brunahólf ehf" ? r.receiver_company : ""}</td>
                  <td className="aj-c-resp">
                    <small>Created {dmy(r.registration_created_date ? r.registration_created_date.slice(0, 10) : r.execution_date)}</small><br />
                    <strong>Brunahólf ehf</strong><br /><small>{r.checked_by_user || "Starfsmaður Brunahólf"}</small><br />
                    <span className={`aj-done ${isDone(r) ? "" : "off"}`}>{stadaLabel(r)}</span>
                  </td>
                </tr>
              ))}
              {hledur && <tr><td colSpan={8}>Sæki skráningar…</td></tr>}
              {!hledur && !aSidu.length && <tr><td colSpan={8}>NO DATA FOUND</td></tr>}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function Listi({ items, alls, onPick, valid }: { items: [string, number][]; alls: number; onPick: (k: string) => void; valid: string }) {
  return (
    <ul className="skr-listi">
      {items.slice(0, 40).map(([k, n]) => (
        <li key={k} className={valid === k ? "valid" : ""} onClick={() => onPick(k)}>
          <span>{k}</span><b>{n.toLocaleString("is-IS")}<small> {alls ? Math.round((n / alls) * 100) : 0}%</small></b>
        </li>
      ))}
      {!items.length && <li className="tomt">Ekkert passar</li>}
    </ul>
  );
}
