"use client";

/* Greining í anda Power BI (Agnar 14.10: „multi action súlurit … flakka á milli mánaða, starfsmanna, verks, daga, viku").
 * Ein staðreyndatafla (rpc skr_stadreyndir) í vafranum; öll ritin reiknuð úr henni. Smellur á súlu í einu riti síar hin
 * (krossía). Hvert rit sýnir sínar súlur með öllum síum NEMA eigin vídd, svo valið sést í samhengi. Tímaásinn borar:
 * mánuður → vikur → dagar. Tímavera-tímar fylgja sömu síum (verk + starfsmaður + tímabil). */

import { useEffect, useMemo, useState } from "react";
import { SUPABASE_URL, SUPABASE_KEY } from "@/app/lib/supabase";

type Fact = { d: string; vi: number; nr: number | null; fi: number; st: number; n: number };
type TvFact = { d: string; vi: number; nr: number | null; klst: number };
type Gogn = { fra: string; til: string; verk: string[]; flokkar: string[]; menn: Record<string, string>; skr: [string, number, number | null, number, number, number][]; tv: [string, number, number | null, number][] | null; radir: number };

type Korn = "dagur" | "vika" | "manudur";
type Maeli = "skr" | "done" | "timar" | "gpt";
type Sia = { verk: Set<number>; menn: Set<string>; flokkar: Set<number>; stada: Set<number>; fra: string; til: string };

const STODUR = ["Created", "Done", "Annað"];
const MAN = ["jan", "feb", "mar", "apr", "maí", "jún", "júl", "ágú", "sep", "okt", "nóv", "des"];
const fmt = (n: number) => Math.round(n).toLocaleString("is-IS");
const f1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString("is-IS");
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: string, n: number) => isoDay(new Date(new Date(d + "T00:00:00Z").getTime() + n * 864e5));
function vikuLykill(d: string) { // ISO-vika: mánudagur vikunnar
  const dt = new Date(d + "T00:00:00Z"); const wd = (dt.getUTCDay() + 6) % 7; return isoDay(new Date(dt.getTime() - wd * 864e5));
}
const lykill = (d: string, k: Korn) => (k === "dagur" ? d : k === "vika" ? vikuLykill(d) : d.slice(0, 7));
const merki = (key: string, k: Korn) => (k === "manudur" ? `${MAN[Number(key.slice(5)) - 1]} ${key.slice(2, 4)}` : k === "vika" ? `v. ${key.slice(8, 10)}.${key.slice(5, 7)}` : `${key.slice(8, 10)}.${key.slice(5, 7)}`);
const nrLykill = (nr: number | null) => (nr === null ? "—" : String(nr));

export default function GreiningClient() {
  const [g, setG] = useState<Gogn | null>(null);
  const [villa, setVilla] = useState<string | null>(null);
  const [korn, setKorn] = useState<Korn>("manudur");
  const [maeli, setMaeli] = useState<Maeli>("skr");
  const [skipta, setSkipta] = useState<"engin" | "verk" | "menn" | "flokkar" | "stada">("engin");
  const [sia, setSia] = useState<Sia>({ verk: new Set(), menn: new Set(), flokkar: new Set(), stada: new Set(), fra: "", til: "" });
  const [slod, setSlod] = useState<{ korn: Korn; fra: string; til: string; merki: string }[]>([]);
  const [taflaVidd, setTaflaVidd] = useState<"verk" | "menn" | "flokkar" | "timi">("verk");

  useEffect(() => {
    fetch(`${SUPABASE_URL}/rest/v1/rpc/skr_stadreyndir`, { method: "POST", headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" }, body: "{}" })
      .then(async (r) => { if (!r.ok) throw new Error(`${r.status} ${await r.text()}`); return r.json(); })
      .then((d: Gogn) => { setG(d); setSia((s) => ({ ...s, fra: addDays(d.til, -89), til: d.til })); })
      .catch((e) => setVilla(String(e.message || e)));
  }, []);

  const facts = useMemo<Fact[]>(() => (g ? g.skr.map(([d, vi, nr, fi, st, n]) => ({ d, vi, nr, fi, st, n })) : []), [g]);
  const tvf = useMemo<TvFact[]>(() => (g && g.tv ? g.tv.map(([d, vi, nr, klst]) => ({ d, vi, nr, klst })) : []), [g]);

  // síun — `nema` = vídd sem á að sleppa (krossía)
  const passar = (f: { d: string; vi: number; nr: number | null; fi?: number; st?: number }, nema?: string) =>
    (!sia.fra || f.d >= sia.fra) && (!sia.til || f.d <= sia.til) &&
    (nema === "verk" || !sia.verk.size || sia.verk.has(f.vi)) &&
    (nema === "menn" || !sia.menn.size || sia.menn.has(nrLykill(f.nr))) &&
    (nema === "flokkar" || f.fi === undefined || !sia.flokkar.size || sia.flokkar.has(f.fi)) &&
    (nema === "stada" || f.st === undefined || !sia.stada.size || sia.stada.has(f.st));

  // mæligildi fyrir mengi
  const gildi = (ff: Fact[], tt: TvFact[]) => {
    const skr = ff.reduce((a, f) => a + f.n, 0), done = ff.reduce((a, f) => a + (f.st === 1 ? f.n : 0), 0), timar = tt.reduce((a, t) => a + t.klst, 0);
    return maeli === "skr" ? skr : maeli === "done" ? done : maeli === "timar" ? timar : timar ? skr / timar : 0;
  };

  // samtölur fyrir vídd (með krossíu)
  const eftirVidd = (vidd: "verk" | "menn" | "flokkar" | "stada") => {
    const nema = vidd;
    const ff = facts.filter((f) => passar(f, nema)), tt = tvf.filter((t) => passar(t, nema));
    const key = (x: { vi: number; nr: number | null; fi?: number; st?: number }) => vidd === "verk" ? String(x.vi) : vidd === "menn" ? nrLykill(x.nr) : vidd === "flokkar" ? String(x.fi) : String(x.st);
    const m = new Map<string, { ff: Fact[]; tt: TvFact[] }>();
    for (const f of ff) { const k = key(f); if (!m.has(k)) m.set(k, { ff: [], tt: [] }); m.get(k)!.ff.push(f); }
    if (vidd === "verk" || vidd === "menn") for (const t of tt) { const k = key(t); if (!m.has(k)) m.set(k, { ff: [], tt: [] }); m.get(k)!.tt.push(t); }
    const heiti = (k: string) => vidd === "verk" ? g!.verk[Number(k)] : vidd === "menn" ? (k === "—" ? "Óþekktur" : `${k} · ${g!.menn[k] || "Starfsmaður " + k}`) : vidd === "flokkar" ? g!.flokkar[Number(k)] : STODUR[Number(k)];
    return [...m.entries()].map(([k, v]) => ({ k, heiti: heiti(k), v: gildi(v.ff, v.tt), skr: v.ff.reduce((a, f) => a + f.n, 0), timar: v.tt.reduce((a, t) => a + t.klst, 0) }))
      .filter((r) => r.v > 0 || r.skr > 0).sort((a, b) => b.v - a.v);
  };

  const vald = useMemo(() => ({ ff: facts.filter((f) => passar(f)), tt: tvf.filter((t) => passar(t)) }), [facts, tvf, sia]);
  const verkRit = useMemo(() => (g ? eftirVidd("verk") : []), [g, facts, tvf, sia, maeli]);
  const mennRit = useMemo(() => (g ? eftirVidd("menn") : []), [g, facts, tvf, sia, maeli]);
  const flokkRit = useMemo(() => (g ? eftirVidd("flokkar") : []), [g, facts, tvf, sia, maeli]);
  const stadaRit = useMemo(() => (g ? eftirVidd("stada") : []), [g, facts, tvf, sia, maeli]);

  // tímalína með skiptingu
  const timalina = useMemo(() => {
    if (!g) return { lyklar: [] as string[], radir: [] as { key: string; heiti: string; gildi: number[] }[], timar: [] as number[], alls: [] as number[] };
    const ff = vald.ff, tt = vald.tt;
    const lyklar = new Set<string>();
    for (const f of ff) lyklar.add(lykill(f.d, korn));
    for (const t of tt) lyklar.add(lykill(t.d, korn));
    // fylla eyður innan tímabils
    if (sia.fra && sia.til) for (let d = sia.fra; d <= sia.til; d = addDays(d, 1)) lyklar.add(lykill(d, korn));
    const L = [...lyklar].sort();
    const idx = new Map(L.map((k, i) => [k, i]));
    const skKey = (f: Fact) => skipta === "verk" ? String(f.vi) : skipta === "menn" ? nrLykill(f.nr) : skipta === "flokkar" ? String(f.fi) : skipta === "stada" ? String(f.st) : "alls";
    const skHeiti = (k: string) => skipta === "verk" ? g.verk[Number(k)] : skipta === "menn" ? (k === "—" ? "Óþekktur" : g.menn[k] || "Starfsmaður " + k) : skipta === "flokkar" ? g.flokkar[Number(k)] : skipta === "stada" ? STODUR[Number(k)] : "Skráningar";
    const radirM = new Map<string, number[]>();
    const timar = Array.from({ length: L.length }, () => 0), alls = Array.from({ length: L.length }, () => 0);
    for (const f of ff) { const i = idx.get(lykill(f.d, korn))!; const k = skKey(f); if (!radirM.has(k)) radirM.set(k, Array.from({ length: L.length }, () => 0)); if (maeli === "done" ? f.st === 1 : maeli !== "timar") radirM.get(k)![i] += f.n; alls[i] += f.n; }
    for (const t of tt) { const i = idx.get(lykill(t.d, korn))!; timar[i] += t.klst; if (maeli === "timar") { const k = skipta === "verk" ? String(t.vi) : skipta === "menn" ? nrLykill(t.nr) : "alls"; if (skipta === "flokkar" || skipta === "stada") continue; if (!radirM.has(k)) radirM.set(k, Array.from({ length: L.length }, () => 0)); radirM.get(k)![i] += t.klst; } }
    if (maeli === "gpt") { radirM.clear(); radirM.set("alls", L.map((_, i) => (timar[i] ? alls[i] / timar[i] : 0))); }
    let radir = [...radirM.entries()].map(([k, gildi]) => ({ key: k, heiti: skHeiti(k), gildi, sum: gildi.reduce((a, b) => a + b, 0) })).sort((a, b) => b.sum - a.sum);
    if (radir.length > 9) { const top = radir.slice(0, 8); const rest = radir.slice(8); top.push({ key: "annad", heiti: `Annað (${rest.length})`, gildi: L.map((_, i) => rest.reduce((a, r) => a + r.gildi[i], 0)), sum: rest.reduce((a, r) => a + r.sum, 0) }); radir = top; }
    return { lyklar: L, radir, timar, alls };
  }, [g, vald, korn, skipta, maeli, sia.fra, sia.til]);

  if (villa) return <div className="gr"><p className="skr-villa">Gat ekki sótt gögn: {villa}</p></div>;
  if (!g) return <div className="gr"><p className="yf-saeki">Sæki staðreyndir…</p></div>;

  const toggle = (vidd: keyof Sia, k: string | number) => setSia((s) => { const n = { ...s }; const set = new Set(n[vidd] as Set<string | number>); if (set.has(k)) set.delete(k); else set.add(k); (n as Record<string, unknown>)[vidd] = set; return n; });
  const hreinsa = () => { setSia({ verk: new Set(), menn: new Set(), flokkar: new Set(), stada: new Set(), fra: addDays(g.til, -89), til: g.til }); setSlod([]); setKorn("manudur"); };
  const timabil = (dagar: number) => { setSia((s) => ({ ...s, fra: addDays(g.til, -(dagar - 1)), til: g.til })); setSlod([]); };
  const bora = (key: string) => { // smella á tímasúlu: þrengja tímabilið og fínna korn
    const fra = korn === "manudur" ? `${key}-01` : key;
    const til = korn === "manudur" ? isoDay(new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5)), 0))) : korn === "vika" ? addDays(key, 6) : key;
    if (korn === "dagur") return;
    setSlod((s) => [...s, { korn, fra: sia.fra, til: sia.til, merki: merki(key, korn) }]);
    setSia((s) => ({ ...s, fra, til: til > g.til ? g.til : til }));
    setKorn(korn === "manudur" ? "vika" : "dagur");
  };
  const tilBaka = (i: number) => { const s = slod[i]; setSia((x) => ({ ...x, fra: s.fra, til: s.til })); setKorn(s.korn); setSlod(slod.slice(0, i)); };

  const skr = vald.ff.reduce((a, f) => a + f.n, 0), done = vald.ff.reduce((a, f) => a + (f.st === 1 ? f.n : 0), 0), timar = vald.tt.reduce((a, t) => a + t.klst, 0);
  const dagarMed = new Set(vald.ff.map((f) => f.d)).size, mennMed = new Set(vald.ff.map((f) => nrLykill(f.nr))).size, verkMed = new Set(vald.ff.map((f) => f.vi)).size;
  const virkarSiur = sia.verk.size + sia.menn.size + sia.flokkar.size + sia.stada.size;
  const eining = maeli === "timar" ? "klst" : maeli === "gpt" ? "göt/klst" : "";
  const maxT = Math.max(1, ...timalina.lyklar.map((_, i) => timalina.radir.reduce((a, r) => a + r.gildi[i], 0)));
  const maxTimar = Math.max(1, ...timalina.timar);
  const LITIR = ["#1a9bb1", "#f5b942", "#5fc33b", "#f0883e", "#7c5cff", "#d9534f", "#2f5d6e", "#9bbf2e", "#8a8f95"];

  const taflaRadir = taflaVidd === "timi" ? timalina.lyklar.map((k, i) => ({ heiti: merki(k, korn), skr: timalina.alls[i], timar: timalina.timar[i] })) : (taflaVidd === "verk" ? verkRit : taflaVidd === "menn" ? mennRit : flokkRit).map((r) => ({ heiti: r.heiti, skr: r.skr, timar: r.timar }));
  const csv = () => {
    const lines = ["heiti;skraningar;timar;got_per_klst", ...taflaRadir.map((r) => `"${r.heiti.replace(/"/g, '""')}";${r.skr};${f1(r.timar)};${r.timar ? f1(r.skr / r.timar) : ""}`)];
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `greining-${taflaVidd}-${sia.fra}-${sia.til}.csv`; a.click();
  };

  return (
    <div className="gr">
      {/* sneiðarar */}
      <div className="gr-sneid">
        <div className="gr-hopur"><span>Tímabil</span>{[30, 90, 180, 365].map((n) => <button type="button" key={n} className={!slod.length && sia.fra === addDays(g.til, -(n - 1)) ? "on" : ""} onClick={() => timabil(n)}>{n} d</button>)}
          <input type="date" value={sia.fra} onChange={(e) => setSia((s) => ({ ...s, fra: e.target.value }))} /><input type="date" value={sia.til} onChange={(e) => setSia((s) => ({ ...s, til: e.target.value }))} /></div>
        <div className="gr-hopur"><span>Tímaás</span>{(["dagur", "vika", "manudur"] as Korn[]).map((k) => <button type="button" key={k} className={korn === k ? "on" : ""} onClick={() => setKorn(k)}>{k === "dagur" ? "Dagar" : k === "vika" ? "Vikur" : "Mánuðir"}</button>)}</div>
        <div className="gr-hopur"><span>Mælikvarði</span>{(["skr", "done", "timar", "gpt"] as Maeli[]).map((m) => <button type="button" key={m} className={maeli === m ? "on" : ""} onClick={() => setMaeli(m)}>{m === "skr" ? "Skráningar" : m === "done" ? "Done" : m === "timar" ? "Tímavera klst" : "Göt/klst"}</button>)}</div>
        <div className="gr-hopur"><span>Skipta súlum</span>{(["engin", "verk", "menn", "flokkar", "stada"] as const).map((s) => <button type="button" key={s} className={skipta === s ? "on" : ""} onClick={() => setSkipta(s)}>{s === "engin" ? "Engin" : s === "verk" ? "Verk" : s === "menn" ? "Starfsmenn" : s === "flokkar" ? "Flokkar" : "Staða"}</button>)}</div>
        <button type="button" className="gr-hreinsa" onClick={hreinsa} disabled={!virkarSiur && !slod.length}>⨯ Hreinsa síur{virkarSiur ? ` (${virkarSiur})` : ""}</button>
      </div>

      {/* KPI fyrir valið */}
      <div className="gr-kpi">
        <div><span>Skráningar</span><strong>{fmt(skr)}</strong></div>
        <div><span>Done</span><strong>{fmt(done)}</strong><small>{skr ? Math.round((done / skr) * 100) : 0} %</small></div>
        <div><span>Tímavera klst</span><strong>{fmt(timar)}</strong></div>
        <div><span>Göt / klst</span><strong>{timar ? f1(skr / timar) : "—"}</strong></div>
        <div><span>Dagar · menn · verk</span><strong>{dagarMed} · {mennMed} · {verkMed}</strong><small>{dagarMed ? f1(skr / dagarMed) : 0} á dag</small></div>
      </div>

      {/* tímalína */}
      <section className="gr-rit gr-timalina">
        <h2>
          {slod.length > 0 && <button type="button" className="gr-brauð" onClick={() => tilBaka(0)}>Allt ›</button>}
          {slod.slice(0, -1).map((s, j) => <button type="button" key={j} className="gr-brauð" onClick={() => tilBaka(j + 1)}>{s.merki} ›</button>)}
          {slod.length > 0 && <span className="gr-brauð-nu">{slod[slod.length - 1].merki}</span>}
          {korn === "manudur" ? "Mánuðir" : korn === "vika" ? "Vikur" : "Dagar"} <small>— smelltu á súlu til að bora niður{maeli !== "timar" ? " · blá lína = Tímavera klst" : ""}</small>
        </h2>
        <div className="gr-sulur" style={{ gridTemplateColumns: `repeat(${timalina.lyklar.length}, 1fr)` }}>
          {timalina.lyklar.map((k, i) => {
            const alls = timalina.radir.reduce((a, r) => a + r.gildi[i], 0);
            return (
              <div key={k} className={`gr-sula ${korn !== "dagur" ? "bora" : ""}`} onClick={() => bora(k)} title={`${merki(k, korn)}: ${f1(alls)} ${eining}${timalina.timar[i] ? ` · ${fmt(timalina.timar[i])} klst` : ""}`}>
                <div className="gr-stafli" style={{ height: `${(alls / maxT) * 100}%` }}>
                  {timalina.radir.map((r, j) => r.gildi[i] > 0 && <i key={r.key} style={{ flex: r.gildi[i], background: LITIR[j % LITIR.length] }} />)}
                </div>
                {maeli !== "timar" && timalina.timar[i] > 0 && <b style={{ bottom: `${(timalina.timar[i] / maxTimar) * 100}%` }} />}
                {alls > 0 && <em>{maeli === "gpt" ? f1(alls) : fmt(alls)}</em>}
                <span>{merki(k, korn)}</span>
              </div>
            );
          })}
        </div>
        {skipta !== "engin" && <div className="gr-skyring">{timalina.radir.map((r, j) => <span key={r.key}><i style={{ background: LITIR[j % LITIR.length] }} />{r.heiti}</span>)}</div>}
      </section>

      {/* fjögur samtengd rit */}
      <div className="gr-grid">
        <Rit titill="Verk" radir={verkRit} valin={sia.verk} key2={(k) => Number(k)} onPick={(k) => toggle("verk", Number(k))} eining={eining} />
        <Rit titill="Starfsmenn" radir={mennRit} valin={sia.menn} key2={(k) => k} onPick={(k) => toggle("menn", k)} eining={eining} />
        <Rit titill="Flokkar" radir={flokkRit} valin={sia.flokkar} key2={(k) => Number(k)} onPick={(k) => toggle("flokkar", Number(k))} eining={eining} ath={maeli === "timar" ? "Tímavera þekkir ekki flokka — sýnir skráningar" : undefined} />
        <Rit titill="Staða" radir={stadaRit} valin={sia.stada} key2={(k) => Number(k)} onPick={(k) => toggle("stada", Number(k))} eining={eining} litil />
      </div>

      {/* tafla + CSV */}
      <section className="gr-rit">
        <h2>Tafla <small>— sömu síur</small>
          <span className="gr-tafla-val">{(["verk", "menn", "flokkar", "timi"] as const).map((v) => <button type="button" key={v} className={taflaVidd === v ? "on" : ""} onClick={() => setTaflaVidd(v)}>{v === "verk" ? "Verk" : v === "menn" ? "Starfsmenn" : v === "flokkar" ? "Flokkar" : "Tími"}</button>)}<button type="button" className="aj-primary" onClick={csv}>Export as Csv</button></span>
        </h2>
        <table className="skr-tafla gr-tafla">
          <thead><tr><th>Heiti</th><th className="t">Skráningar</th><th className="t">Hlutfall</th><th className="t">Klst</th><th className="t">Göt/klst</th></tr></thead>
          <tbody>
            {taflaRadir.map((r, i) => <tr key={i}><td>{r.heiti}</td><td className="t">{fmt(r.skr)}</td><td className="t">{skr ? Math.round((r.skr / skr) * 100) : 0} %</td><td className="t">{r.timar ? fmt(r.timar) : ""}</td><td className="t">{r.timar ? f1(r.skr / r.timar) : ""}</td></tr>)}
            <tr className="gr-sum"><td>Alls</td><td className="t">{fmt(skr)}</td><td className="t">100 %</td><td className="t">{fmt(timar)}</td><td className="t">{timar ? f1(skr / timar) : ""}</td></tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Rit({ titill, radir, valin, key2, onPick, eining, ath, litil }: {
  titill: string; radir: { k: string; heiti: string; v: number; skr: number; timar: number }[]; valin: Set<string | number>; key2: (k: string) => string | number; onPick: (k: string) => void; eining: string; ath?: string; litil?: boolean;
}) {
  const [oll, setOll] = useState(false);
  const synd = oll ? radir : radir.slice(0, litil ? 5 : 12);
  const max = Math.max(1, ...synd.map((r) => r.v));
  const nokkud = valin.size > 0;
  return (
    <section className={`gr-rit ${litil ? "litil" : ""}`}>
      <h2>{titill} <small>{nokkud ? `${valin.size} valið` : "smelltu til að sía"}</small>{ath && <small className="gr-ath"> · {ath}</small>}</h2>
      <ul className="gr-lar">
        {synd.map((r) => {
          const on = valin.has(key2(r.k));
          return (
            <li key={r.k} className={`${on ? "on" : ""} ${nokkud && !on ? "dauf" : ""}`} onClick={() => onPick(r.k)} title={`${r.heiti}: ${fmt(r.skr)} skráningar${r.timar ? ` · ${fmt(r.timar)} klst` : ""}`}>
              <span>{r.heiti}</span>
              <div className="gr-la"><i style={{ width: `${(r.v / max) * 100}%` }} /></div>
              <b>{eining === "göt/klst" ? f1(r.v) : fmt(r.v)}</b>
            </li>
          );
        })}
        {!radir.length && <li className="tomt">Ekkert í þessu vali</li>}
      </ul>
      {radir.length > synd.length && <button type="button" className="gr-meira" onClick={() => setOll(true)}>Sýna öll ({radir.length})</button>}
      {oll && radir.length > 12 && <button type="button" className="gr-meira" onClick={() => setOll(false)}>Færri</button>}
    </section>
  );
}
