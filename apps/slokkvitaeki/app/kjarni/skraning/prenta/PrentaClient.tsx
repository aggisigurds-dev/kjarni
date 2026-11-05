"use client";

/* Hæðarskýrsla / „Print large" (Ajour: Shown coordinates → Print): teikningin (skorin) með pinnum,
 * talning per flokk og tafla yfir skráningarnar. Vafrinn prentar (Ctrl+P → Vista sem PDF).
 *   /kjarni/skraning/prenta?verk=ID&teikning=ID[&stada=done|created][&myndir=1]
 */

import { useEffect, useMemo, useState } from "react";
import { sb, publicUrl } from "../lib/sb";
import { lesaSkurd } from "../lib/skurdur";

type Verk = { id: number; heiti: string; heimilisfang: string | null; verkkaupi: string | null };
type Teikning = { id: number; verk_id: number; heiti: string; haed: string | null; mynd_path: string | null; breidd_px: number | null; haed_px: number | null; skurdur: unknown };
type Skraning = { id: number; radnr: number; x_px: number | null; y_px: number | null; flokkur_id: number | null; starfsmadur_id: number | null; stada: string; lysing: string | null; framkvaemt_fra: string | null; lokid_at: string | null };
type Flokkur = { id: number; heiti: string };
type Starfsm = { id: number; numer: number | null; nafn: string | null };
type Svar = { skraning_id: number; atridi_id: number };
type Atridi = { id: number; atridi: string };
type Mynd = { skraning_id: number; path: string; stig: string };

const dmy = (d: string | null) => (d ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : "");

export default function PrentaClient() {
  const [data, setData] = useState<{ verk: Verk; teikning: Teikning; skr: Skraning[]; flokkar: Flokkur[]; menn: Starfsm[]; svor: Svar[]; atridi: Atridi[]; myndir: Mynd[] } | null>(null);
  const [villa, setVilla] = useState<string | null>(null);
  const [stada, setStada] = useState("");
  const [synaMyndir, setSynaMyndir] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const verkId = Number(q.get("verk")), teikId = Number(q.get("teikning"));
    setStada(q.get("stada") || ""); setSynaMyndir(q.get("myndir") === "1");
    if (!verkId || !teikId) { setVilla("Vantar ?verk= og ?teikning= í slóðina."); return; }
    (async () => {
      const s = sb();
      const [v, t, r, f, m, a] = await Promise.all([
        s.from("skr_verk").select("id,heiti,heimilisfang,verkkaupi").eq("id", verkId).single(),
        s.from("skr_teikningar").select("id,verk_id,heiti,haed,mynd_path,breidd_px,haed_px,skurdur").eq("id", teikId).single(),
        s.from("skr_skraningar").select("id,radnr,x_px,y_px,flokkur_id,starfsmadur_id,stada,lysing,framkvaemt_fra,lokid_at").eq("teikning_id", teikId).eq("eytt", false).order("radnr"),
        s.from("skr_flokkar").select("id,heiti"),
        s.from("skr_starfsmenn").select("id,numer,nafn"),
        s.from("skr_gatlisti").select("id,atridi"),
      ]);
      const err = v.error || t.error || r.error || f.error || m.error || a.error;
      if (err) { setVilla(err.message); return; }
      const ids = (r.data as Skraning[]).map((x) => x.id);
      const [sv, my] = ids.length ? await Promise.all([
        s.from("skr_gatlisti_svor").select("skraning_id,atridi_id").in("skraning_id", ids).eq("hakad", true),
        s.from("skr_myndir").select("skraning_id,path,stig").in("skraning_id", ids).order("rod"),
      ]) : [{ data: [] }, { data: [] }];
      setData({ verk: v.data as Verk, teikning: t.data as Teikning, skr: r.data as Skraning[], flokkar: f.data as Flokkur[], menn: m.data as Starfsm[], svor: (sv.data || []) as Svar[], atridi: a.data as Atridi[], myndir: (my.data || []) as Mynd[] });
    })();
  }, []);

  const synd = useMemo(() => (data ? data.skr.filter((x) => !stada || x.stada === stada) : []), [data, stada]);
  const eftirFlokki = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of synd) { const k = data?.flokkar.find((f) => f.id === x.flokkur_id)?.heiti || "—"; m.set(k, (m.get(k) || 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [synd, data]);

  if (villa) return <div className="pr"><p className="skr-villa">{villa}</p></div>;
  if (!data) return <div className="pr"><p>Sæki…</p></div>;

  const { verk, teikning } = data;
  const FW = teikning.breidd_px || 1000, FH = teikning.haed_px || 700;
  const sk = lesaSkurd(teikning.skurdur, FW, FH);
  const CX = sk ? sk.x : 0, CY = sk ? sk.y : 0, W = sk ? sk.w : FW, H = sk ? sk.h : FH;
  const fl = (id: number | null) => data.flokkar.find((f) => f.id === id)?.heiti || "—";
  const nafn = (id: number | null) => { const m = data.menn.find((x) => x.id === id); return m ? (m.nafn || `Starfsmaður ${m.numer}`) : ""; };
  const efni = (id: number) => data.svor.filter((x) => x.skraning_id === id).map((x) => data.atridi.find((a) => a.id === x.atridi_id)?.atridi).filter(Boolean).join(", ");
  const done = synd.filter((x) => x.stada === "done").length;
  const R = Math.max(10, Math.round(W / 140)); // pinnastærð í teikningarpixlum

  return (
    <div className="pr">
      <div className="pr-stika noprint">
        <a href={`/kjarni/skraning/vinna?verk=${verk.id}&teikning=${teikning.id}`}>‹ Vinnuútgáfa</a>
        <label>Staða <select value={stada} onChange={(e) => setStada(e.target.value)}><option value="">Allar</option><option value="created">Created</option><option value="done">Done</option></select></label>
        <label><input type="checkbox" checked={synaMyndir} onChange={(e) => setSynaMyndir(e.target.checked)} /> Myndir með</label>
        <button type="button" className="aj-primary" onClick={() => window.print()}>🖨 Prenta / vista PDF</button>
      </div>

      <header className="pr-haus">
        <div>
          <h1>{verk.heiti} — {teikning.haed || teikning.heiti}</h1>
          <p>{verk.heimilisfang || ""}{verk.verkkaupi ? ` · Verkkaupi: ${verk.verkkaupi}` : ""} · Brunaþéttingar · prentað {dmy(new Date().toISOString().slice(0, 10))}</p>
        </div>
        <div className="pr-tolur">
          <span><b>{synd.length}</b> skráningar</span>
          <span className="g"><b>{done}</b> Done</span>
          <span className="y"><b>{synd.length - done}</b> Created</span>
        </div>
      </header>

      <figure className="pr-teikning">
        <svg viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg">
          {teikning.mynd_path && <image href={publicUrl(teikning.mynd_path)} x={-CX} y={-CY} width={FW} height={FH} />}
          {synd.map((x) => (
            <g key={x.id} transform={`translate(${(x.x_px || 0) - CX} ${(x.y_px || 0) - CY})`}>
              <circle r={R} fill={x.stada === "done" ? "#5fc33b" : "#f5b942"} stroke="#fff" strokeWidth={R / 5} />
              <text y={-R * 1.3} textAnchor="middle" fontSize={R * 1.6} fontWeight="700" fill="#111" stroke="#fff" strokeWidth={R / 4} paintOrder="stroke">#{x.radnr}</text>
            </g>
          ))}
        </svg>
        <figcaption>Gulur = Created · Grænn = Done · númer = raðnúmer skráningar</figcaption>
      </figure>

      <section className="pr-flokkar">
        <h2>Eftir flokki</h2>
        <table><tbody>{eftirFlokki.map(([k, n]) => <tr key={k}><td>{k}</td><td className="t">{n}</td></tr>)}</tbody></table>
      </section>

      <section>
        <h2>Skráningar</h2>
        <table className="pr-tafla">
          <thead><tr><th>#</th><th>Flokkur</th><th>Brunamótstaða / efni</th><th>Staða</th><th>Framkvæmt</th><th>Lokið</th><th>Starfsmaður</th><th>Athugasemd</th>{synaMyndir && <th>Myndir</th>}</tr></thead>
          <tbody>
            {synd.map((x) => (
              <tr key={x.id}>
                <td><span className={`pr-nr ${x.stada === "done" ? "g" : "y"}`}>{x.radnr}</span></td>
                <td>{fl(x.flokkur_id)}</td><td>{efni(x.id)}</td>
                <td>{x.stada === "done" ? "Done" : "Created"}</td>
                <td>{dmy(x.framkvaemt_fra)}</td><td>{x.lokid_at ? dmy(x.lokid_at.slice(0, 10)) : ""}</td>
                <td>{nafn(x.starfsmadur_id)}</td><td>{x.lysing}</td>
                {synaMyndir && <td className="pr-myndir">{data.myndir.filter((m) => m.skraning_id === x.id).map((m) => <img key={m.path} src={publicUrl(m.path)} alt="" title={m.stig} />)}</td>}
              </tr>
            ))}
            {!synd.length && <tr><td colSpan={9}>Engar skráningar</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
