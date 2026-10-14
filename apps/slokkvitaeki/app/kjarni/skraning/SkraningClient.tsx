"use client";

/* Skráning — eftirmynd af AjourInspect & QA (HT-13.10) með endurbótunum sem Agnar bað um.
 *
 * Tvær sýnir, báðar í slóðinni:
 *   · ekkert verk valið  → „Öll verk": yfirlitið sem Ajour vantar (allt á einum skjá)
 *   · verk valið (?verk=) → skjárinn eins og í Ajour: Project · Status on registrations ·
 *     Registration drawings · hóp-pillur · Create registration · skráningataflan
 *   · ?skyrsla=1          → Report generator-sýnin okkar: síur + skipting + CSV
 *
 * Gögn: `skr_ajour_lesid` (lesgluggi á Ajour-innflutninginn). Þegar skr_*-töflurnar fyllast
 * (áfangi 0/2) kemur sama svið úr þeim — dálkaheitin hér eru valin með það í huga.
 * Talið eftir `execution_date` (framkvæmt) nema annað sé sagt; `checked_date` sýnd við hlið.
 */

import { useEffect, useMemo, useState } from "react";
import { SUPABASE_URL, SUPABASE_KEY } from "@/app/lib/supabase";

type Row = {
  id: number;
  serial_number: string | null;
  registration_status: string | null;
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
};

const COLS =
  "id,serial_number,registration_status,project_name,category_group,category,category1,checklist_item,execution_date,checked_date,checked_by_user,registration_created_date,drawing_name,subject,receiver_company,imported_at";
const PAGE = 1000;
const SIDA = 100;

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
const isDone = (r: Row) => r.registration_status === "Done";
const stadaLabel = (r: Row) => (isDone(r) ? "Done" : "Created");

async function fetchAll(): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/skr_ajour_lesid?select=${COLS}&order=id`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Range: `${from}-${from + PAGE - 1}` },
    });
    if (!res.ok && res.status !== 206) throw new Error(`${res.status} ${await res.text()}`);
    const page = (await res.json()) as Row[];
    out.push(...page);
    if (page.length < PAGE) break;
  }
  return out;
}

function tally(rows: Row[], key: (r: Row) => string | null): [string, number][] {
  const m = new Map<string, number>();
  for (const r of rows) { const k = key(r) || "—"; m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export default function SkraningClient() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState<F>(EMPTY);

  useEffect(() => { setF(readF()); }, []);
  useEffect(() => { fetchAll().then(setRows).catch((e) => setError(String(e.message || e))); }, []);
  // writeF (history.replaceState) má ekki keyra inni í setState-updater — React keyrir hann í render og Next-routerinn kvartar
  const set = (patch: Partial<F>) => { const n = { ...f, ...patch }; if (!("sida" in patch)) n.sida = ""; writeF(n); setF(n); };

  const today = isoDay(new Date());
  const weekAgo = isoDay(new Date(Date.now() - 6 * 864e5));
  const monthStart = today.slice(0, 7) + "-01";
  // síðasti almanaksmánuður (uppgjörsmánuðurinn): Done talið eftir lokadegi = checked_date, annars execution_date
  const nu = new Date();
  const fyrriFra = isoDay(new Date(Date.UTC(nu.getUTCFullYear(), nu.getUTCMonth() - 1, 1)));
  const fyrriTil = isoDay(new Date(Date.UTC(nu.getUTCFullYear(), nu.getUTCMonth(), 0)));
  const fyrriNafn = MANUDIR[(nu.getUTCMonth() + 11) % 12]; // fast heiti, ekki locale (SSR og vafri skila ólíkri há-/lágstöfun)
  const lokid = (r: Row) => r.checked_date || r.execution_date || "";
  const doneFyrri = (r: Row) => isDone(r) && lokid(r) >= fyrriFra && lokid(r) <= fyrriTil;

  /* ---------- Öll verk ---------- */
  const verk = useMemo(() => {
    if (!rows) return [];
    const m = new Map<string, { nafn: string; alls: number; done: number; created: number; dag: number; vika: number; man: number; fyrri: number; sidast: string; sott: string; teikn: Set<string>; menn: Set<string> }>();
    for (const r of rows) {
      let v = m.get(r.project_name);
      if (!v) { v = { nafn: r.project_name, alls: 0, done: 0, created: 0, dag: 0, vika: 0, man: 0, fyrri: 0, sidast: "", sott: "", teikn: new Set(), menn: new Set() }; m.set(r.project_name, v); }
      v.alls++;
      if (isDone(r)) v.done++; else v.created++;
      if (doneFyrri(r)) v.fyrri++;
      const d = r.execution_date || "";
      if (d === today) v.dag++;
      if (d >= weekAgo) v.vika++;
      if (d >= monthStart) v.man++;
      if (d > v.sidast) v.sidast = d;
      if ((r.imported_at || "") > v.sott) v.sott = r.imported_at || "";
      if (r.drawing_name) v.teikn.add(r.drawing_name);
      if (r.category) v.menn.add(r.category);
    }
    return [...m.values()].sort((a, b) => (b.sidast > a.sidast ? 1 : -1));
  }, [rows, today, weekAgo, monthStart]);

  /* ---------- verkið sem er valið ---------- */
  const iVerki = useMemo(() => (rows || []).filter((r) => !f.verk || r.project_name === f.verk), [rows, f.verk]);
  const q = f.q.trim().toLowerCase();
  const sidad = useMemo(() => iVerki.filter((r) =>
    (!f.hopur || r.category_group === f.hopur) &&
    (!f.starfsm || r.category === f.starfsm) &&
    (!f.teikning || r.drawing_name === f.teikning) &&
    (!f.stada || stadaLabel(r) === f.stada) &&
    (!f.fra || (r.execution_date || "") >= f.fra) &&
    (!f.til || (r.execution_date || "") <= f.til) &&
    (!q || `${r.serial_number} ${r.subject || ""} ${r.checklist_item || ""} ${r.drawing_name || ""} ${r.category || ""}`.toLowerCase().includes(q)),
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

  const rodud = useMemo(() => [...sidad].sort((a, b) => (Number(b.serial_number) || 0) - (Number(a.serial_number) || 0) || b.id - a.id), [sidad]);
  const sidur = Math.max(1, Math.ceil(rodud.length / SIDA));
  const sidaNr = Math.min(sidur, Math.max(1, Number(f.sida) || 1));
  const aSidu = rodud.slice((sidaNr - 1) * SIDA, sidaNr * SIDA);

  const csv = () => {
    const h = ["radnr", "verk", "teikning", "flokkur", "starfsmadur", "stada", "framkvaemt", "hakad", "gatlisti", "athugasemd"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [h.join(";"), ...sidad.map((r) => [r.serial_number, r.project_name, r.drawing_name, r.category_group, r.category, stadaLabel(r), r.execution_date, r.checked_date, r.checklist_item, r.subject].map(esc).join(";"))];
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `skraning-${f.verk || "oll-verk"}-${today}.csv`; a.click();
  };

  if (error) return <div className="skr"><p className="skr-villa">Gat ekki sótt skráningar: {error}</p></div>;

  const synd = sidad.length !== iVerki.length;

  return (
    <div className="skr">
      {/* efsta stikan eins og í Ajour: QA-talning vinstra megin, aðgerðir hægra megin */}
      <div className="aj-tool">
        <button type="button" className="aj-qa" onClick={() => set({ stada: "", hopur: "", teikning: "", starfsm: "", q: "", fra: "", til: "" })} title="Allar QA-skráningar í verkinu">
          <span>✓</span> QA <b>{rows ? fmt(iVerki.length) : "…"}</b>
        </button>
        <div className="aj-tool-r">
          <a className="aj-vinnuhlekkur" href="/kjarni/skraning/vinna">📍 Vinna — punktar á teikningu</a>
          <button type="button" onClick={() => window.print()} disabled={!rows}>Print</button>
          <button type="button" disabled title="Flokkar og gátlistar — kemur með áfanga 2 (skr_flokkar / skr_gatlisti)">Categories/schema</button>
          <button type="button" className={f.skyrsla ? "on" : ""} onClick={() => set({ skyrsla: f.skyrsla ? "" : "1" })} disabled={!rows}>Report generator</button>
        </div>
      </div>

      {/* þrjú spjöld: Project · Status on registrations · Registration drawings */}
      <div className="aj-panels">
        <section className="aj-panel">
          <h3>Project</h3>
          <div className="aj-panel-b">
            <select className="aj-sel" value={f.verk} onChange={(e) => set({ verk: e.target.value, hopur: "", teikning: "", starfsm: "", stada: "" })}>
              <option value="">— Öll verk (yfirlit) —</option>
              {verk.map((v) => <option key={v.nafn} value={v.nafn}>{v.nafn}</option>)}
            </select>
            <div className="aj-levels">
              {[1, 2, 3].map((n) => <div key={n}><i>{n}</i><select className="aj-sel" disabled><option>-</option></select></div>)}
            </div>
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
              <button type="button" className={`aj-badge all ${!f.stada ? "on" : ""}`} onClick={() => set({ stada: "" })}><b>{fmt(iVerki.length)}</b> All</button>
              <button type="button" className={`aj-badge created ${f.stada === "Created" ? "on" : ""}`} onClick={() => set({ stada: f.stada === "Created" ? "" : "Created" })}><b>{fmt(nCreated)}</b> Created</button>
              <button type="button" className={`aj-badge done ${f.stada === "Done" ? "on" : ""}`} onClick={() => set({ stada: f.stada === "Done" ? "" : "Done" })}><b>{fmt(nDone)}</b> Done</button>
            </div>
            <div className="aj-tidni">
              <span>Í dag <b>{iVerki.filter((r) => r.execution_date === today).length}</b></span>
              <span>7 dagar <b>{iVerki.filter((r) => (r.execution_date || "") >= weekAgo).length}</b></span>
              <span>Mánuður <b>{iVerki.filter((r) => (r.execution_date || "") >= monthStart).length}</b></span>
              <span title={`Done með lokadag ${dmy(fyrriFra)}–${dmy(fyrriTil)}`}>Done {fyrriNafn} <b className="fyrri">{fmt(iVerki.filter(doneFyrri).length)}</b></span>
            </div>
          </div>
        </section>

        <section className="aj-panel">
          <h3>Registration drawings <button type="button" className="aj-mini" title="Teikningar koma úr skr_teikningar í áfanga 2" disabled>⟳</button></h3>
          <ul className="aj-drawings">
            {teikningar.filter(([k]) => k !== "—").map(([k, n]) => (
              <li key={k} className={f.teikning === k ? "on" : ""} onClick={() => set({ teikning: f.teikning === k ? "" : k })}><span>📄 {k}</span><b>{fmt(n)}</b></li>
            ))}
            {!teikningar.filter(([k]) => k !== "—").length && <li className="tomt">Engar teikningar í innflutningnum fyrir þetta val — pinnar og teikningar koma með áfanga 0/2.</li>}
          </ul>
        </section>
      </div>

      {/* hóp-pillur eins og í Ajour — aðeins innan verks (í yfirlitinu væru þær 60+ úr öllum verkum) */}
      {f.verk && <div className="aj-chips">
        <button type="button" className={`aj-chip all ${!f.hopur ? "on" : ""}`} onClick={() => set({ hopur: "" })}>All groups</button>
        {hopar.filter(([k]) => k !== "—").map(([k, n]) => (
          <button type="button" key={k} className={`aj-chip ${f.hopur === k ? "on" : ""}`} onClick={() => set({ hopur: f.hopur === k ? "" : k })}>{k}<b>{fmt(n)}</b></button>
        ))}
      </div>}

      {/* Report generator-sýnin okkar: síur + skipting + CSV */}
      {f.skyrsla && (
        <section className="aj-report">
          <h3>Report generator <small>— síur í slóðinni, CSV úr nákvæmlega því sem passar</small></h3>
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
        </section>
      )}

      {/* yfirlit yfir öll verk — það sem Ajour vantar */}
      {!f.verk && (
        <section className="aj-list">
          <div className="aj-listbar"><strong>Öll verk</strong><span>smelltu á verk til að opna það · <em>Sótt úr Ajour</em> rautt = ekki í sjálfvirku sókninni (áfangi 0 lagar)</span></div>
          <table className="skr-tafla skr-verk">
            <thead><tr><th>Verk</th><th className="t">Alls</th><th className="t">Done</th><th className="t">Created</th><th className="t">Í dag</th><th className="t">7 dagar</th><th className="t">Mánuður</th><th className="t" title={`Done með lokadag ${dmy(fyrriFra)}–${dmy(fyrriTil)} (hakað, annars framkvæmt) — uppgjörsmánuðurinn`}>Done {fyrriNafn}</th><th>Síðast</th><th className="t">Teikn.</th><th className="t">Menn</th><th>Sótt úr Ajour</th></tr></thead>
            <tbody>
              {verk.map((v) => (
                <tr key={v.nafn} onClick={() => set({ verk: v.nafn })}>
                  <td><strong>{v.nafn}</strong></td>
                  <td className="t">{fmt(v.alls)}</td>
                  <td className="t ok">{fmt(v.done)}</td>
                  <td className="t">{v.created ? <span className="bid">{fmt(v.created)}</span> : "0"}</td>
                  <td className="t">{v.dag || ""}</td><td className="t">{v.vika || ""}</td><td className="t">{v.man || ""}</td>
                  <td className="t fyrri">{v.fyrri ? fmt(v.fyrri) : ""}</td>
                  <td>{dmy(v.sidast) || "—"}</td>
                  <td className="t">{v.teikn.size}</td><td className="t">{v.menn.size}</td>
                  <td className={v.sott && v.sott.slice(0, 10) < weekAgo ? "gamalt" : ""}>{v.sott ? v.sott.slice(0, 16).replace("T", " ") : "—"}</td>
                </tr>
              ))}
              {!rows && <tr><td colSpan={11}>Sæki skráningar…</td></tr>}
            </tbody>
          </table>
        </section>
      )}

      {/* skráningataflan eins og í Ajour */}
      {f.verk && (
        <section className="aj-list">
          <div className="aj-listbar">
            <button type="button" className="aj-create" disabled title="Ný skráning með pinna, mynd og gátlista — áfangi 2">Create registration</button>
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
                <tr key={r.id}>
                  <td className="aj-c-serial">
                    <span className={`aj-serial ${isDone(r) ? "done" : "created"}`}>{r.serial_number}</span>
                    <div className="aj-thumb" title="Ljósmyndir koma með áfanga 0 (útflutningur úr Ajour)">📷</div>
                  </td>
                  <td className="aj-c-date">{dmy(r.execution_date)}<br /><small>{r.checked_date ? `hakað ${dmy(r.checked_date)}` : ""}</small></td>
                  <td>{r.drawing_name ? <a href={`?${new URLSearchParams({ verk: r.project_name, teikning: r.drawing_name })}`} onClick={(e) => { e.preventDefault(); set({ teikning: r.drawing_name || "" }); }}>{r.drawing_name} (1)</a> : <small>—</small>}</td>
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
                    <span className={`aj-done ${isDone(r) ? "" : "off"}`}>Done</span>
                  </td>
                </tr>
              ))}
              {!rows && <tr><td colSpan={8}>Sæki skráningar…</td></tr>}
              {rows && !aSidu.length && <tr><td colSpan={8}>NO DATA FOUND</td></tr>}
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
