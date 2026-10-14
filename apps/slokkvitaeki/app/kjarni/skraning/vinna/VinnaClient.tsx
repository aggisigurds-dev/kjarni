"use client";

/* Vinnuútgáfa Skráningar (Agnar 14.10 00:07): „choose from already registered buildings, choose floor,
 * add dot … put in picture, size and material used … then another picture when job is done and mark
 * the work done." Síminn fyrst: stórir takkar, bottom-sheet form, myndir úr myndavél.
 *
 * Gögn: skr_verk → skr_teikningar (mynd_path = fasta renderingin, pinnar í pixlum hennar) → skr_skraningar
 * (+ skr_gatlisti_svor fyrir efni, skr_myndir stig fyrir/eftir, skr_atburdir). Starfsmaður = númer sem
 * síminn man (localStorage) þar til innskráning kemur.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sb, publicUrl, minnkaMynd, hladaUpp } from "../lib/sb";
import { lesaSkurd, skurdarBakgrunnur } from "../lib/skurdur";
import { bidrod, erNetvilla, type BidPunktur } from "../lib/bidrod";

type Verk = { id: number; heiti: string; heimilisfang: string | null; virkt: boolean };
type Teikning = { id: number; verk_id: number; heiti: string; haed: string | null; mynd_path: string | null; breidd_px: number | null; haed_px: number | null; rod: number; skurdur: unknown };
type Flokkur = { id: number; verk_id: number | null; heiti: string; tegund: string; rod: number };
type Atridi = { id: number; verk_id: number | null; atridi: string; hopur: string | null; rod: number };
type Skraning = { id: number; verk_id: number; radnr: number; teikning_id: number | null; x_px: number | null; y_px: number | null; flokkur_id: number | null; starfsmadur_id: number | null; stofnad_af: number | null; stada: string; lysing: string | null; framkvaemt_fra: string | null; lokid_at: string | null; created_at: string; eytt: boolean };
type Mynd = { id: number; skraning_id: number; path: string; stig: string; rod: number; created_at: string };
type Svar = { skraning_id: number; atridi_id: number; hakad: boolean };
type Starfsm = { id: number; numer: number | null; nafn: string | null; virkur: boolean };
type Atburdur = { id: number; hvad: string; gogn: Record<string, unknown> | null; hver: number | null; hvenaer: string };

const LS_STARFSM = "skr_starfsmadur";
const LOG_HEITI: Record<string, string> = { stofnad: "Stofnað", stada: "Staða breytt", mynd: "Mynd bætt við", eytt: "Falið", flokkur: "Flokkur breyttur", teikning: "Fært", texti: "Breytt", athugasemd: "Athugasemd", afrit: "Afritað" };
function lysaGogn(g: Record<string, unknown>): string {
  const b: string[] = [];
  if (typeof g.texti === "string") b.push(`„${g.texti}"`);
  if (typeof g.fra === "number") b.push(`úr #${g.fra}`);
  if (typeof g.stada === "string") b.push(g.stada === "done" ? "→ Done" : "→ Created");
  if (typeof g.stig === "string") b.push(g.stig === "eftir" ? "eftir þéttingu" : "fyrir þéttingu");
  if (typeof g.n === "number") b.push(`${g.n} mynd${g.n === 1 ? "" : "ir"}`);
  if (typeof g.myndir === "number" && g.myndir) b.push(`${g.myndir} mynd${g.myndir === 1 ? "" : "ir"}`);
  if (Array.isArray(g.efni) && g.efni.length) b.push(`${g.efni.length} gátlistaatriði`);
  return b.join(" · ");
}
const isoDay = () => new Date().toISOString().slice(0, 10);

function qs(): Record<string, string> {
  if (typeof window === "undefined") return {};
  return Object.fromEntries(new URLSearchParams(window.location.search).entries());
}
function setQs(p: Record<string, string | undefined>) {
  const u = new URLSearchParams(window.location.search);
  Object.entries(p).forEach(([k, v]) => (v ? u.set(k, v) : u.delete(k)));
  const s = u.toString();
  window.history.replaceState(null, "", s ? `?${s}` : window.location.pathname);
}

export default function VinnaClient() {
  const [verk, setVerk] = useState<Verk[]>([]);
  const [teikningar, setTeikningar] = useState<Teikning[]>([]);
  const [flokkar, setFlokkar] = useState<Flokkur[]>([]);
  const [atridi, setAtridi] = useState<Atridi[]>([]);
  const [skr, setSkr] = useState<Skraning[]>([]);
  const [myndir, setMyndir] = useState<Mynd[]>([]);
  const [svor, setSvor] = useState<Svar[]>([]);
  const [menn, setMenn] = useState<Starfsm[]>([]);
  const [verkId, setVerkId] = useState<number | null>(null);
  const [teikId, setTeikId] = useState<number | null>(null);
  const [villa, setVilla] = useState<string | null>(null);
  const [starfsm, setStarfsm] = useState<string>("");
  const [ready, setReady] = useState(false);
  const [hladid, setHladid] = useState(false);
  const [anTeikn, setAnTeikn] = useState(false);

  /* --- grunngögn --- */
  useEffect(() => {
    const q = qs();
    setVerkId(q.verk ? Number(q.verk) : null);
    setTeikId(q.teikning ? Number(q.teikning) : null);
    try { setStarfsm(window.localStorage.getItem(LS_STARFSM) || ""); } catch { /* einkagluggi */ }
    setReady(true);
    (async () => {
      const s = sb();
      const [v, t, f, a, m] = await Promise.all([
        s.from("skr_verk").select("id,heiti,heimilisfang,virkt").eq("eytt", false).eq("virkt", true).order("heiti"),
        s.from("skr_teikningar").select("id,verk_id,heiti,haed,mynd_path,breidd_px,haed_px,rod,skurdur").eq("eytt", false).order("rod"),
        s.from("skr_flokkar").select("id,verk_id,heiti,tegund,rod").eq("virkt", true).order("rod"),
        s.from("skr_gatlisti").select("id,verk_id,atridi,hopur,rod").eq("virkt", true).order("rod"),
        s.from("skr_starfsmenn").select("id,numer,nafn,virkur").eq("virkur", true).order("numer"),
      ]);
      const err = v.error || t.error || f.error || a.error || m.error;
      if (err) { setVilla(err.message); return; }
      setVerk(v.data as Verk[]); setTeikningar(t.data as Teikning[]); setFlokkar(f.data as Flokkur[]); setAtridi(a.data as Atridi[]); setMenn(m.data as Starfsm[]); setHladid(true);
    })();
  }, []);

  const hladaSkraningar = useCallback(async (vid: number) => {
    const s = sb();
    const r = await s.from("skr_skraningar").select("id,verk_id,radnr,teikning_id,x_px,y_px,flokkur_id,starfsmadur_id,stofnad_af,stada,lysing,framkvaemt_fra,lokid_at,created_at,eytt").eq("verk_id", vid).eq("eytt", false).order("radnr");
    if (r.error) { setVilla(r.error.message); return; }
    const rows = r.data as Skraning[];
    setSkr(rows);
    const ids = rows.map((x) => x.id);
    if (!ids.length) { setMyndir([]); setSvor([]); return; }
    const [m, sv] = await Promise.all([
      s.from("skr_myndir").select("id,skraning_id,path,stig,rod,created_at").in("skraning_id", ids).order("rod"),
      s.from("skr_gatlisti_svor").select("skraning_id,atridi_id,hakad").in("skraning_id", ids),
    ]);
    setMyndir((m.data || []) as Mynd[]); setSvor((sv.data || []) as Svar[]);
  }, []);
  useEffect(() => { if (verkId) hladaSkraningar(verkId); else { setSkr([]); setMyndir([]); setSvor([]); } }, [verkId, hladaSkraningar]);
  useEffect(() => {
    if (!verkId) return;
    const t = setInterval(() => { if (document.visibilityState === "visible" && navigator.onLine) hladaSkraningar(verkId); }, 60000);
    const vakna = () => { if (document.visibilityState === "visible") hladaSkraningar(verkId); };
    document.addEventListener("visibilitychange", vakna);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", vakna); };
  }, [verkId, hladaSkraningar]);

  const veljaVerk = (id: number | null) => { setVerkId(id); setTeikId(null); setQs({ verk: id ? String(id) : undefined, teikning: undefined }); };
  const veljaTeikningu = (id: number | null) => { setTeikId(id); setQs({ teikning: id ? String(id) : undefined }); };
  const vistaStarfsm = (v: string) => { setStarfsm(v); try { window.localStorage.setItem(LS_STARFSM, v); } catch { /* */ } };

  const verkid = verk.find((v) => v.id === verkId) || null;
  const teikning = teikningar.find((t) => t.id === teikId) || null;
  const flokkarVerks = useMemo(() => flokkar.filter((f) => f.verk_id === null || f.verk_id === verkId), [flokkar, verkId]);
  const atridiVerks = useMemo(() => atridi.filter((a) => a.verk_id === null || a.verk_id === verkId), [atridi, verkId]);

  if (villa) return <div className="vn"><p className="skr-villa">Villa: {villa}</p></div>;
  if (!ready) return <div className="vn" />;

  /* ---------- 1. bygging ---------- */
  if (!verkid) {
    return (
      <div className="vn">
        <div className="vn-haus"><h1>Veldu byggingu</h1>
          <label className="vn-starfsm">Ég er
            <select value={starfsm} onChange={(e) => vistaStarfsm(e.target.value)}>
              <option value="">— veldu þig —</option>
              {menn.map((m) => <option key={m.id} value={String(m.numer ?? "")}>{m.numer}. {m.nafn || `Starfsmaður ${m.numer}`}</option>)}
            </select>
          </label>
        </div>
        <div className="vn-listi">
          {verk.map((v) => {
            const n = teikningar.filter((t) => t.verk_id === v.id).length;
            return (
              <button type="button" key={v.id} className="vn-kort" onClick={() => veljaVerk(v.id)}>
                <strong>{v.heiti}</strong>
                <span>{v.heimilisfang || ""}</span>
                <small>{n} {n === 1 ? "teikning" : "teikningar"}</small>
              </button>
            );
          })}
          {!verk.length && <p className="vn-tomt">{hladid ? "Engin bygging skráð enn." : "Sæki byggingar…"}</p>}
          <a className="vn-kort vn-ny" href="/kjarni/skraning/verk"><strong>+ Ný bygging / teikningar</strong><span>Stofna byggingu og hlaða upp grunnmynd</span></a>
        </div>
      </div>
    );
  }

  /* ---------- 2. hæð ---------- */
  if (!teikning) {
    const tv = teikningar.filter((t) => t.verk_id === verkid.id);
    return (
      <div className="vn">
        <div className="vn-haus"><button type="button" className="vn-til-baka" onClick={() => veljaVerk(null)}>‹ Byggingar</button><h1>{verkid.heiti}</h1><span className="vn-undir">Veldu hæð / teikningu</span></div>
        <div className="vn-listi">
          {tv.map((t) => {
            const a = skr.filter((s) => s.teikning_id === t.id);
            const done = a.filter((s) => s.stada === "done").length;
            return (
              <button type="button" key={t.id} className="vn-kort vn-haed" onClick={() => veljaTeikningu(t.id)}>
                {t.mynd_path && <div className="vn-haed-mynd" style={skurdarBakgrunnur(publicUrl(t.mynd_path), t.breidd_px || 1, t.haed_px || 1, lesaSkurd(t.skurdur, t.breidd_px || 1, t.haed_px || 1), 260, 110)} />}
                <strong>{t.haed || t.heiti}</strong>
                <span>{t.haed ? t.heiti : ""}</span>
                <small><b className="g">{done}</b> lokið · <b className="y">{a.length - done}</b> opið</small>
              </button>
            );
          })}
          {!tv.length && <p className="vn-tomt">Engin teikning á þessari byggingu enn.</p>}
          {skr.some((x) => !x.teikning_id) && (
            <button type="button" className="vn-kort vn-anteikn" onClick={() => setAnTeikn(true)}>
              <strong>☰ Skráningar án teikningar (listi)</strong>
              <small><b>{skr.filter((x) => !x.teikning_id).length}</b> skráningar án pinna</small>
            </button>
          )}
        </div>
        {anTeikn && (
          <AnTeikningar skr={skr.filter((x) => !x.teikning_id)} myndir={myndir} svor={svor} flokkar={flokkarVerks} atridi={atridiVerks} starfsm={starfsm} menn={menn}
            onClose={() => setAnTeikn(false)} onChanged={() => hladaSkraningar(verkid.id)} />
        )}
      </div>
    );
  }

  /* ---------- 3. teikning með punktum ---------- */
  return (
    <Kort
      verk={verkid} teikning={teikning} skr={skr.filter((s) => s.teikning_id === teikning.id)} myndir={myndir} svor={svor}
      flokkar={flokkarVerks} atridi={atridiVerks} starfsm={starfsm} menn={menn}
      onBack={() => veljaTeikningu(null)} onChanged={() => hladaSkraningar(verkid.id)} allar={skr}
    />
  );
}

/* ===================== skráningar án teikningar ===================== */
function AnTeikningar({ skr, myndir, svor, flokkar, atridi, starfsm, menn, onClose, onChanged }: {
  skr: Skraning[]; myndir: Mynd[]; svor: Svar[]; flokkar: Flokkur[]; atridi: Atridi[]; starfsm: string; menn: Starfsm[]; onClose: () => void; onChanged: () => void;
}) {
  const [opid, setOpid] = useState<number | null>(null);
  const nafn = (id: number | null) => { const m = menn.find((x) => x.id === id); return m ? (m.nafn || `Starfsmaður ${m.numer}`) : null; };
  const opin = skr.find((x) => x.id === opid) || null;
  return (
    <>
      {!opin && (
        <div className="vn-sheet vn-listasyn" role="dialog" aria-label="Skráningar án teikningar">
          <div className="vn-sheet-haus"><strong>Skráningar án teikningar</strong><span>{skr.length}</span><button type="button" className="vn-loka" onClick={onClose}>✕</button></div>
          <ul className="vn-listi-radir">
            {[...skr].sort((a, b) => b.radnr - a.radnr).map((x) => (
              <li key={x.id} onClick={() => setOpid(x.id)}>
                <span className={`aj-serial ${x.stada === "done" ? "done" : "created"}`}>{x.radnr}</span>
                <b>{flokkar.find((f) => f.id === x.flokkur_id)?.heiti || "—"}</b>
                <small>{x.framkvaemt_fra}{nafn(x.starfsmadur_id) ? ` · ${nafn(x.starfsmadur_id)}` : ""}{x.lysing ? ` · ${x.lysing}` : ""}</small>
                <i>{myndir.filter((m) => m.skraning_id === x.id).length ? "📷" : ""}</i>
              </li>
            ))}
          </ul>
        </div>
      )}
      {opin && (
        <Punktur s={opin} myndir={myndir.filter((m) => m.skraning_id === opin.id)} svor={svor.filter((x) => x.skraning_id === opin.id && x.hakad)}
          flokkar={flokkar} atridi={atridi} starfsm={starfsm} nafn={nafn} onClose={() => setOpid(null)} onChanged={onChanged}
 />
      )}
    </>
  );
}

/* ===================== teikningin ===================== */
function Kort({ verk, teikning, skr, myndir, svor, flokkar, atridi, starfsm, menn, onBack, onChanged, allar }: {
  verk: Verk; teikning: Teikning; skr: Skraning[]; myndir: Mynd[]; svor: Svar[]; flokkar: Flokkur[]; atridi: Atridi[]; starfsm: string; menn: Starfsm[];
  onBack: () => void; onChanged: () => void; allar: Skraning[];
}) {
  const nafn = (id: number | null) => { const m = menn.find((x) => x.id === id); return m ? (m.nafn || `Starfsmaður ${m.numer}`) : null; };
  const FW = teikning.breidd_px || 1000, FH = teikning.haed_px || 700;            // öll myndin
  const sk = lesaSkurd(teikning.skurdur, FW, FH);                                   // fastur skurður (sýn)
  const CX = sk ? sk.x : 0, CY = sk ? sk.y : 0, W = sk ? sk.w : FW, H = sk ? sk.h : FH;
  const boxRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(0.3);
  const [zoom, setZoom] = useState(1);
  const [baeta, setBaeta] = useState(false);
  const [nyr, setNyr] = useState<{ x: number; y: number } | null>(null);
  const [opid, setOpid] = useState<number | null>(null);
  const [sia, setSia] = useState<"" | "created" | "done">("");
  const [hopur, setHopur] = useState<number | "">("");          // sía eftir flokki (Ajour: Filter → Group)
  const [faera, setFaera] = useState<number | null>(null);      // punktur sem verið er að færa
  const [listi, setListi] = useState(false);                     // listasýn (Ajour: List)
  const [breyta, setBreyta] = useState<Skraning | null>(null);   // Edit registration
  const [afrit, setAfrit] = useState<Skraning | null>(null);     // Copy registration
  const [bid, setBid] = useState(0);                             // punktar í biðröð (sambandslaust)
  const [sendi, setSendi] = useState(false);
  const telja = async () => setBid(await bidrod.fjoldi());
  const senda = async () => {
    if (sendi) return; setSendi(true);
    try { const r = await sendaBidrod(naestaRadnrUrGrunni); if (r.sent) onChanged(); setBid(r.eftir); } finally { setSendi(false); }
  };
  useEffect(() => {
    telja(); if (navigator.onLine) senda();
    const a = () => { telja(); senda(); }; const b = () => telja();
    window.addEventListener("online", a); window.addEventListener("skr-bidrod", b);
    return () => { window.removeEventListener("online", a); window.removeEventListener("skr-bidrod", b); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = boxRef.current; if (!el) return;
    const k = () => setFit(Math.max(0.05, (el.clientWidth - 2) / W));
    k(); const ro = new ResizeObserver(k); ro.observe(el); return () => ro.disconnect();
  }, [W]);
  const scale = fit * zoom;

  // klípu-zoom: tveir pointerar á kassanum → hlutfall fjarlægða breytir zoom (vafra-zoom á síðunni er látið í friði)
  const fingur = useRef(new Map<number, { x: number; y: number }>());
  const klipa = useRef<{ d: number; zoom: number } | null>(null);
  const pDown = (e: React.PointerEvent) => { if (e.pointerType !== "touch") return; fingur.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (fingur.current.size === 2) { const [a, b] = [...fingur.current.values()]; klipa.current = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom }; } };
  const pMove = (e: React.PointerEvent) => { if (!fingur.current.has(e.pointerId)) return; fingur.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (fingur.current.size === 2 && klipa.current) { const [a, b] = [...fingur.current.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (d > 10) setZoom(Math.min(12, Math.max(0.5, klipa.current.zoom * (d / klipa.current.d)))); } };
  const pUp = (e: React.PointerEvent) => { fingur.current.delete(e.pointerId); if (fingur.current.size < 2) klipa.current = null; };

  const smella = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (!baeta && !faera) return;
    const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const x = Math.round(CX + (e.clientX - r.left) / scale), y = Math.round(CY + (e.clientY - r.top) / scale);   // hnit í allri myndinni
    if (faera) {
      const id = faera; setFaera(null);
      const af = await starfsmId(starfsm);
      const u = await sb().from("skr_skraningar").update({ x_px: x, y_px: y }).eq("id", id);
      if (!u.error) { await sb().from("skr_atburdir").insert({ skraning_id: id, hvad: "teikning", hver: af, gogn: { x, y } }); onChanged(); setOpid(id); }
      return;
    }
    setNyr({ x, y }); setBaeta(false); setOpid(null);
  };

  const synd = skr.filter((s) => (!sia || s.stada === sia) && (!hopur || s.flokkur_id === hopur));
  const flHeiti = (id: number | null) => flokkar.find((f) => f.id === id)?.heiti || "—";
  const opin = skr.find((s) => s.id === opid) || null;
  const done = skr.filter((s) => s.stada === "done").length;

  return (
    <div className="vn vn-kortsida">
      <div className="vn-stika">
        <button type="button" className="vn-til-baka" onClick={onBack}>‹ Hæðir</button>
        <div className="vn-titill"><strong>{verk.heiti}</strong><span>{teikning.haed || teikning.heiti}</span></div>
        <div className="vn-stodur">
          <button type="button" className={`aj-badge all ${!sia ? "on" : ""}`} onClick={() => setSia("")}><b>{skr.length}</b> All</button>
          <button type="button" className={`aj-badge created ${sia === "created" ? "on" : ""}`} onClick={() => setSia(sia === "created" ? "" : "created")}><b>{skr.length - done}</b> Created</button>
          <button type="button" className={`aj-badge done ${sia === "done" ? "on" : ""}`} onClick={() => setSia(sia === "done" ? "" : "done")}><b>{done}</b> Done</button>
        </div>
        <select className="vn-hopsia" value={hopur} onChange={(e) => setHopur(e.target.value ? Number(e.target.value) : "")} title="Sía eftir flokki">
          <option value="">Allir flokkar</option>
          {flokkar.filter((f) => skr.some((s) => s.flokkur_id === f.id)).map((f) => <option key={f.id} value={f.id}>{f.heiti} ({skr.filter((s) => s.flokkur_id === f.id).length})</option>)}
        </select>
        <button type="button" className={`vn-listitakki ${listi ? "on" : ""}`} onClick={() => { setListi((v) => !v); setOpid(null); setNyr(null); }}>☰ List</button>
        <a className="vn-prenta" href={`/kjarni/skraning/prenta?verk=${verk.id}&teikning=${teikning.id}`} title="Hæðarskýrsla: teikning með pinnum + tafla (prenta / PDF)">🖨 Print</a>
        <div className="vn-zoom">
          <button type="button" onClick={() => setZoom((z) => Math.max(0.5, z / 1.4))}>−</button>
          <button type="button" onClick={() => setZoom(1)} title="Passa í glugga">⤢</button>
          <button type="button" onClick={() => setZoom((z) => Math.min(12, z * 1.4))}>+</button>
        </div>
        <button type="button" className={`vn-baeta ${baeta ? "on" : ""}`} onClick={() => { setBaeta((b) => !b); setNyr(null); setOpid(null); }}>{baeta ? "Smelltu á teikninguna…" : "+ Nýr punktur"}</button>
      </div>

      {bid > 0 && <div className="vn-bordi vn-bordi-bid">📵 {bid} punkt{bid === 1 ? "ur bíður" : "ar bíða"} sendingar (sambandslaust þegar skráð var) <button type="button" onClick={senda} disabled={sendi}>{sendi ? "Sendi…" : "Senda núna"}</button></div>}
      {faera && <div className="vn-bordi">Smelltu þar sem punktur #{skr.find((x) => x.id === faera)?.radnr} á að vera <button type="button" onClick={() => setFaera(null)}>Hætta við</button></div>}
      <div className={`vn-box ${baeta || faera ? "baeta" : ""}`} ref={boxRef} onPointerDown={pDown} onPointerMove={pMove} onPointerUp={pUp} onPointerCancel={pUp}>
        <div className="vn-flotur" style={{ width: W * scale, height: H * scale }} onClick={smella}>
          {teikning.mynd_path && <img src={publicUrl(teikning.mynd_path)} alt={teikning.heiti} width={FW * scale} height={FH * scale} draggable={false}
            style={{ position: "absolute", left: -CX * scale, top: -CY * scale, maxWidth: "none" }} />}
          {synd.map((s) => (
            <button type="button" key={s.id} className={`vn-pinni ${s.stada === "done" ? "done" : "created"} ${opid === s.id ? "on" : ""}`}
              style={{ left: ((s.x_px || 0) - CX) * scale, top: ((s.y_px || 0) - CY) * scale }}
              onClick={(e) => { e.stopPropagation(); if (!baeta) { setOpid(s.id); setNyr(null); } }} title={`#${s.radnr}`}>
              <i>#{s.radnr}</i>
            </button>
          ))}
          {nyr && <span className="vn-pinni nyr" style={{ left: (nyr.x - CX) * scale, top: (nyr.y - CY) * scale }} />}
        </div>
      </div>
      {/* appelsínuguli plúsinn eins og í Ajour-appinu */}
      <button type="button" className={`vn-fab ${baeta ? "on" : ""}`} onClick={() => { setBaeta((b) => !b); setNyr(null); setOpid(null); }} title="Nýr punktur">{baeta ? "✕" : "+"}</button>

      {nyr && (
        <NyrPunktur verk={verk} teikning={teikning} x={nyr.x} y={nyr.y} flokkar={flokkar} atridi={atridi} starfsm={starfsm} allar={allar}
          onClose={() => setNyr(null)} onSaved={() => { setNyr(null); onChanged(); }} />
      )}
      {afrit && (
        <NyrPunktur verk={verk} teikning={teikning} x={(Number(afrit.x_px) || 0) + 40} y={(Number(afrit.y_px) || 0) + 40} flokkar={flokkar} atridi={atridi} starfsm={starfsm} allar={allar}
          forskrift={{ flokkur_id: afrit.flokkur_id, efni: svor.filter((x) => x.skraning_id === afrit.id && x.hakad).map((x) => x.atridi_id), lysing: afrit.lysing || "", fra: afrit.radnr }}
          onClose={() => setAfrit(null)} onSaved={() => { setAfrit(null); onChanged(); }} />
      )}
      {breyta && (
        <NyrPunktur verk={verk} teikning={teikning} x={Number(breyta.x_px) || 0} y={Number(breyta.y_px) || 0} flokkar={flokkar} atridi={atridi} starfsm={starfsm} allar={allar}
          upphaf={{ id: breyta.id, radnr: breyta.radnr, flokkur_id: breyta.flokkur_id, efni: svor.filter((x) => x.skraning_id === breyta.id && x.hakad).map((x) => x.atridi_id), lysing: breyta.lysing || "" }}
          onClose={() => setBreyta(null)} onSaved={() => { const id = breyta.id; setBreyta(null); onChanged(); setOpid(id); }} />
      )}
      {opin && !breyta && (
        <Punktur s={opin} myndir={myndir.filter((m) => m.skraning_id === opin.id)} svor={svor.filter((x) => x.skraning_id === opin.id && x.hakad)}
          flokkar={flokkar} atridi={atridi} starfsm={starfsm} nafn={nafn} onClose={() => setOpid(null)} onChanged={onChanged}
          onBreyta={() => { setBreyta(opin); }} onFaera={() => { setFaera(opin.id); setOpid(null); }} onAfrita={() => { setAfrit(opin); setOpid(null); }} />
      )}
      {listi && !opin && !nyr && !breyta && (
        <div className="vn-sheet vn-listasyn" role="dialog" aria-label="Listi">
          <div className="vn-sheet-haus"><strong>Skráningar á {teikning.haed || teikning.heiti}</strong><span>{synd.length} af {skr.length}</span><button type="button" className="vn-loka" onClick={() => setListi(false)}>✕</button></div>
          <ul className="vn-listi-radir">
            {[...synd].sort((a, b) => b.radnr - a.radnr).map((x) => (
              <li key={x.id} onClick={() => { setOpid(x.id); }}>
                <span className={`aj-serial ${x.stada === "done" ? "done" : "created"}`}>{x.radnr}</span>
                <b>{flHeiti(x.flokkur_id)}</b>
                <small>{x.framkvaemt_fra}{nafn(x.starfsmadur_id) ? ` · ${nafn(x.starfsmadur_id)}` : ""}{x.lysing ? ` · ${x.lysing}` : ""}</small>
                <i>{myndir.filter((m) => m.skraning_id === x.id).length ? "📷" : ""}</i>
              </li>
            ))}
            {!synd.length && <li className="tomt">Engar skráningar passa</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ===================== nýr punktur ===================== */
async function starfsmId(numer: string): Promise<number | null> {
  const n = Number(numer); if (!n) return null;
  const s = sb();
  const r = await s.from("skr_starfsmenn").select("id").eq("numer", n).maybeSingle();
  if (r.data) return r.data.id as number;
  const ins = await s.from("skr_starfsmenn").insert({ numer: n, nafn: `Starfsmaður ${n}` }).select("id").single();
  return ins.data ? (ins.data.id as number) : null;
}

/** Vistar nýjan punkt (skráning + gátlisti + myndir + logg). Kastar við villu — kallandi ákveður hvort hann fer í biðröð. */
async function vistaNyjanPunkt(p: { verk_id: number; teikning_id: number; x_px: number; y_px: number; flokkur_id: number; efni: number[]; lysing: string | null; starfsm: string; myndir: File[]; radnr: number }) {
  const s = sb();
  const af = await starfsmId(p.starfsm);
  const setja = (radnr: number) => s.from("skr_skraningar").insert({
    verk_id: p.verk_id, radnr, teikning_id: p.teikning_id, x_px: p.x_px, y_px: p.y_px, flokkur_id: p.flokkur_id, starfsmadur_id: af, stofnad_af: af,
    stada: "created", lysing: p.lysing, framkvaemt_fra: isoDay(), abyrgd_id: 1,
  }).select("id").single();
  let ins = await setja(p.radnr);
  for (let reynt = 0; ins.error && /duplicate|23505|unique/i.test(ins.error.message) && reynt < 3; reynt++) {
    // annar starfsmaður tók númerið á sömu stundu — næsta laust úr grunni
    ins = await setja(await naestaRadnrUrGrunni(p.verk_id));
  }
  if (ins.error) throw new Error(ins.error.message);
  const id = ins.data.id as number;
  if (p.efni.length) {
    const r = await s.from("skr_gatlisti_svor").insert(p.efni.map((atridi_id) => ({ skraning_id: id, atridi_id, hakad: true, hakad_af: af, hakad_at: new Date().toISOString() })));
    if (r.error) throw new Error(r.error.message);
  }
  await vistaMyndir(p.verk_id, id, p.myndir, "fyrir", af);
  await s.from("skr_atburdir").insert({ skraning_id: id, hvad: "stofnad", hver: af, gogn: { flokkur: p.flokkur_id, efni: p.efni, myndir: p.myndir.length } });
  return id;
}

/** Sendir biðröðina (punkta sem urðu til án nets). Raðnúmer er úthlutað við sendingu. Skilar fjölda sem tókst. */
export async function sendaBidrod(naestaRadnr: (verkId: number) => Promise<number>): Promise<{ sent: number; eftir: number }> {
  const oll = await bidrod.oll();
  let sent = 0;
  for (const b of oll) {
    try {
      const radnr = await naestaRadnr(b.verk_id);
      await vistaNyjanPunkt({ verk_id: b.verk_id, teikning_id: b.teikning_id, x_px: b.x_px, y_px: b.y_px, flokkur_id: b.flokkur_id, efni: b.efni, lysing: b.lysing, starfsm: b.starfsm,
        myndir: b.myndir.map((m) => new File([m.blob], m.name, { type: m.blob.type || "image/jpeg", lastModified: m.lastModified })), radnr });
      await bidrod.eyda(b.id); sent++;
    } catch (e) {
      if (!erNetvilla(e)) { await bidrod.setja({ ...b, villa: String((e as Error).message || e) }); }
      else break; // enn sambandslaust — reyna seinna
    }
  }
  return { sent, eftir: await bidrod.fjoldi() };
}

async function naestaRadnrUrGrunni(verkId: number): Promise<number> {
  const r = await sb().from("skr_skraningar").select("radnr").eq("verk_id", verkId).order("radnr", { ascending: false }).limit(1);
  if (r.error) throw new Error(r.error.message);
  return ((r.data?.[0]?.radnr as number) || 0) + 1;
}

async function vistaMyndir(verkId: number, skraningId: number, files: File[], stig: "fyrir" | "eftir", af: number | null) {
  const s = sb();
  let rod = 0;
  for (const f of files) {
    const { blob, w, h } = await minnkaMynd(f);
    const path = `verk/${verkId}/skr/${skraningId}/${stig}-${Date.now()}-${rod}.jpg`;
    await hladaUpp(path, blob, "image/jpeg");
    const r = await s.from("skr_myndir").insert({ skraning_id: skraningId, path, stig, breidd: w, haed: h, af, rod: rod++, tekin_at: new Date(f.lastModified || Date.now()).toISOString() });
    if (r.error) throw new Error(r.error.message);
  }
}

type Upphaf = { id: number; radnr: number; flokkur_id: number | null; efni: number[]; lysing: string };
type Forskrift = { flokkur_id: number | null; efni: number[]; lysing: string; fra: number };
function NyrPunktur({ verk, teikning, x, y, flokkar, atridi, starfsm, allar, upphaf, forskrift, onClose, onSaved }: {
  verk: Verk; teikning: Teikning; x: number; y: number; flokkar: Flokkur[]; atridi: Atridi[]; starfsm: string; allar: Skraning[]; upphaf?: Upphaf; forskrift?: Forskrift; onClose: () => void; onSaved: () => void;
}) {
  const [flokkur, setFlokkur] = useState<number | "">(upphaf?.flokkur_id ?? forskrift?.flokkur_id ?? flokkar[0]?.id ?? "");
  const [efni, setEfni] = useState<Set<number>>(new Set(upphaf?.efni || forskrift?.efni || []));
  const [lysing, setLysing] = useState(upphaf?.lysing || forskrift?.lysing || "");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [villa, setVilla] = useState<string | null>(null);
  const efniListi = atridi.filter((a) => a.hopur === "efni" || a.hopur === "annad");
  const eiListi = atridi.filter((a) => a.hopur === "brunamotstada");
  const toggle = (id: number) => setEfni((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const vista = async () => {
    if (!flokkur) { setVilla("Veldu stærð (flokk)."); return; }
    setBusy(true); setVilla(null);
    try {
      const s = sb();
      if (upphaf) {
        const af = await starfsmId(starfsm);
        // Edit registration: flokkur, athugasemd, gátlisti (upsert — engin DELETE-heimild, óhakað = hakad:false)
        const u = await s.from("skr_skraningar").update({ flokkur_id: flokkur, lysing: lysing || null }).eq("id", upphaf.id);
        if (u.error) throw new Error(u.error.message);
        const snert = new Set<number>([...efni, ...upphaf.efni]);
        if (snert.size) {
          const r = await s.from("skr_gatlisti_svor").upsert([...snert].map((atridi_id) => ({ skraning_id: upphaf.id, atridi_id, hakad: efni.has(atridi_id), hakad_af: af, hakad_at: new Date().toISOString() })), { onConflict: "skraning_id,atridi_id" });
          if (r.error) throw new Error(r.error.message);
        }
        if (files.length) await vistaMyndir(verk.id, upphaf.id, files, "fyrir", af);
        await s.from("skr_atburdir").insert({ skraning_id: upphaf.id, hvad: "texti", hver: af, gogn: { flokkur, efni: [...efni], myndir: files.length } });
        onSaved(); return;
      }
      const radnr = allar.reduce((m, r) => Math.max(m, r.radnr), 0) + 1;
      const nyr = { verk_id: verk.id, teikning_id: teikning.id, x_px: x, y_px: y, flokkur_id: flokkur as number, efni: [...efni], lysing: lysing || null, starfsm, myndir: files, radnr };
      try {
        const id = await vistaNyjanPunkt(nyr);
        if (forskrift) await sb().from("skr_atburdir").insert({ skraning_id: id, hvad: "afrit", gogn: { fra: forskrift.fra } });
      } catch (e) {
        if (!erNetvilla(e) || !bidrod.studd()) throw e;
        // sambandslaust: geyma í símanum og senda þegar netið kemur
        const b: BidPunktur = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, verk_id: verk.id, teikning_id: teikning.id, x_px: x, y_px: y, flokkur_id: flokkur as number,
          efni: [...efni], lysing: lysing || null, starfsm, myndir: files.map((f) => ({ blob: f, name: f.name, lastModified: f.lastModified })), stofnad: new Date().toISOString() };
        await bidrod.setja(b);
        window.dispatchEvent(new Event("skr-bidrod"));
        onSaved(); return;
      }
      onSaved();
    } catch (e) { setVilla(String((e as Error).message || e)); } finally { setBusy(false); }
  };

  return (
    <div className="vn-sheet" role="dialog" aria-label="Nýr punktur">
      <div className="vn-sheet-haus"><strong>{upphaf ? `Breyta punkti #${upphaf.radnr}` : forskrift ? `Afrit af #${forskrift.fra}` : "Nýr punktur"}</strong><span>{teikning.haed || teikning.heiti} · x {x} · y {y}</span><button type="button" className="vn-loka" onClick={onClose}>✕</button></div>
      <label className="vn-reitur">Stærð (flokkur)
        <select value={flokkur} onChange={(e) => setFlokkur(Number(e.target.value))}>{flokkar.map((f) => <option key={f.id} value={f.id}>{f.heiti}</option>)}</select>
      </label>
      <div className="vn-reitur"><span>Brunamótstaða</span><div className="vn-hakar">{eiListi.map((a) => <label key={a.id} className={efni.has(a.id) ? "on" : ""}><input type="checkbox" checked={efni.has(a.id)} onChange={() => toggle(a.id)} />{a.atridi}</label>)}</div></div>
      <div className="vn-reitur"><span>Efni notað</span><div className="vn-hakar">{efniListi.map((a) => <label key={a.id} className={efni.has(a.id) ? "on" : ""}><input type="checkbox" checked={efni.has(a.id)} onChange={() => toggle(a.id)} />{a.atridi}</label>)}</div></div>
      <label className="vn-reitur">Athugasemd<input type="text" value={lysing} onChange={(e) => setLysing(e.target.value)} placeholder="t.d. erfitt að komast að" /></label>
      <label className="vn-reitur vn-mynd">
        <span>Mynd af gati (fyrir þéttingu)</span>
        <input type="file" accept="image/*" capture="environment" multiple onChange={(e) => setFiles([...(e.target.files || [])])} />
        <b className="vn-myndatakki">📷 {files.length ? `${files.length} mynd${files.length > 1 ? "ir" : ""} valin` : "Taka mynd"}</b>
      </label>
      {villa && <p className="skr-villa">{villa}</p>}
      <div className="vn-sheet-takkar">
        <button type="button" onClick={onClose} disabled={busy}>Hætta við</button>
        <button type="button" className="aj-primary" onClick={vista} disabled={busy}>{busy ? "Vista…" : upphaf ? "Vista breytingar" : "Vista punkt"}</button>
      </div>
    </div>
  );
}

/* ===================== punktur sem er til ===================== */
function Punktur({ s, myndir, svor, flokkar, atridi, starfsm, nafn, onClose, onChanged, onBreyta, onFaera, onAfrita }: {
  s: Skraning; myndir: Mynd[]; svor: Svar[]; flokkar: Flokkur[]; atridi: Atridi[]; starfsm: string; nafn: (id: number | null) => string | null; onClose: () => void; onChanged: () => void; onBreyta?: () => void; onFaera?: () => void; onAfrita?: () => void;
}) {
  const [ath, setAth] = useState("");
  const sendaAth = async () => {
    const t = ath.trim(); if (!t) return;
    const af = await starfsmId(starfsm);
    const r = await sb().from("skr_atburdir").insert({ skraning_id: s.id, hvad: "athugasemd", hver: af, gogn: { texti: t } });
    if (!r.error) { setAth(""); setSynaLog(true); setLog(null); }
  };
  // skráningalog (= Ajour „Show registration log")
  const [log, setLog] = useState<Atburdur[] | null>(null);
  const [synaLog, setSynaLog] = useState(false);
  useEffect(() => {
    if (!synaLog || log) return;
    sb().from("skr_atburdir").select("id,hvad,gogn,hver,hvenaer").eq("skraning_id", s.id).order("hvenaer", { ascending: false })
      .then((r) => setLog((r.data || []) as Atburdur[]));
  }, [synaLog, log, s.id]);
  useEffect(() => { setLog(null); }, [myndir.length, s.stada, s.id]);
  const [busy, setBusy] = useState(false);
  const [villa, setVilla] = useState<string | null>(null);
  const [stor, setStor] = useState<string | null>(null);
  const fl = flokkar.find((f) => f.id === s.flokkur_id);
  const efni = svor.map((x) => atridi.find((a) => a.id === x.atridi_id)?.atridi).filter(Boolean);
  const fyrir = myndir.filter((m) => m.stig === "fyrir"), eftir = myndir.filter((m) => m.stig === "eftir");

  const baetaMynd = async (files: File[], stig: "fyrir" | "eftir") => {
    if (!files.length) return;
    setBusy(true); setVilla(null);
    try { const af = await starfsmId(starfsm); await vistaMyndir(s.verk_id, s.id, files, stig, af); await sb().from("skr_atburdir").insert({ skraning_id: s.id, hvad: "mynd", hver: af, gogn: { stig, n: files.length } }); onChanged(); }
    catch (e) { setVilla(String((e as Error).message || e)); } finally { setBusy(false); }
  };
  const merkja = async (stada: "done" | "created") => {
    setBusy(true); setVilla(null);
    try {
      const af = await starfsmId(starfsm);
      const r = await sb().from("skr_skraningar").update({ stada, lokid_at: stada === "done" ? new Date().toISOString() : null }).eq("id", s.id);
      if (r.error) throw new Error(r.error.message);
      await sb().from("skr_atburdir").insert({ skraning_id: s.id, hvad: "stada", hver: af, gogn: { stada } });
      onChanged();
    } catch (e) { setVilla(String((e as Error).message || e)); } finally { setBusy(false); }
  };
  const eyda = async () => {
    if (!window.confirm(`Fela punkt #${s.radnr}?`)) return;
    setBusy(true);
    try { const af = await starfsmId(starfsm); await sb().from("skr_skraningar").update({ eytt: true }).eq("id", s.id); await sb().from("skr_atburdir").insert({ skraning_id: s.id, hvad: "eytt", hver: af }); onChanged(); onClose(); }
    finally { setBusy(false); }
  };

  const [stodu, setStodu] = useState(false);
  const fyrsta = myndir[0];
  return (
    <div className="vn-sheet vn-sheet-punktur" role="dialog" aria-label={`Punktur ${s.radnr}`}>
      {/* guli hausinn eins og í Ajour-appinu: „QA #6478 · Change status" */}
      <div className={`vn-qa-haus ${s.stada === "done" ? "done" : ""}`}>
        <strong>QA #{s.radnr}</strong>
        <div className="vn-stodu">
          <button type="button" className="vn-stodu-takki" onClick={() => setStodu((v) => !v)} disabled={busy}>Change status {stodu ? "⌄" : "⌃"}</button>
          {stodu && (
            <div className="vn-stodu-val">
              <button type="button" className={s.stada === "created" ? "on" : ""} onClick={() => { setStodu(false); merkja("created"); }}>Created</button>
              <button type="button" className={s.stada === "done" ? "on" : ""} onClick={() => { setStodu(false); merkja("done"); }}>Done</button>
            </div>
          )}
        </div>
        <button type="button" className="vn-loka vn-loka-gul" onClick={onClose}>✕</button>
      </div>
      <div className="vn-kortid">
        <div className="vn-kortid-mynd" onClick={() => fyrsta && setStor(publicUrl(fyrsta.path))}>
          {fyrsta ? <img src={publicUrl(fyrsta.path)} alt="" /> : <span>📷</span>}
          {myndir.length > 1 && <b>+{myndir.length - 1}</b>}
        </div>
        <div className="vn-kortid-texti">
          <strong>Created by Brunahólf ehf{nafn(s.stofnad_af ?? s.starfsmadur_id) ? `, ${nafn(s.stofnad_af ?? s.starfsmadur_id)}` : ""}</strong>
          <span><b>Receiver:</b> Brunahólf ehf</span>
          <span className="vn-kortid-flokkur">▦ {fl?.heiti || "—"}{efni.length > 0 ? ` · ${efni.join(", ")}` : ""}</span>
          {s.lysing && <span className="vn-kortid-ath">▭ {s.lysing}</span>}
          <small>{s.framkvaemt_fra}{s.lokid_at ? ` · lokið ${s.lokid_at.slice(0, 10)}` : ""}</small>
        </div>
      </div>
      <div className="vn-myndir">
        <div><span>Fyrir þéttingu</span><div className="vn-thumbs">{fyrir.map((m) => <img key={m.id} src={publicUrl(m.path)} alt="" onClick={() => setStor(publicUrl(m.path))} />)}
          <label className="vn-thumb-add"><input type="file" accept="image/*" capture="environment" multiple onChange={(e) => baetaMynd([...(e.target.files || [])], "fyrir")} />📷</label></div></div>
        <div><span>Eftir þéttingu</span><div className="vn-thumbs">{eftir.map((m) => <img key={m.id} src={publicUrl(m.path)} alt="" onClick={() => setStor(publicUrl(m.path))} />)}
          <label className="vn-thumb-add"><input type="file" accept="image/*" capture="environment" multiple onChange={(e) => baetaMynd([...(e.target.files || [])], "eftir")} />📷</label></div></div>
      </div>
      {villa && <p className="skr-villa">{villa}</p>}
      <div className="vn-ath">
        <input type="text" value={ath} onChange={(e) => setAth(e.target.value)} placeholder="Athugasemd (Comments)…" onKeyDown={(e) => { if (e.key === "Enter") sendaAth(); }} />
        <button type="button" onClick={sendaAth} disabled={!ath.trim() || busy}>Senda</button>
      </div>
      <button type="button" className="vn-log-takki" onClick={() => setSynaLog((v) => !v)}>{synaLog ? "Fela skráningalog" : "Show registration log"}</button>
      {synaLog && (
        <ul className="vn-log">
          {(log || []).map((a) => (
            <li key={a.id}><time>{a.hvenaer.slice(0, 16).replace("T", " ")}</time><b>{LOG_HEITI[a.hvad] || a.hvad}</b>{a.gogn && Object.keys(a.gogn).length ? <small>{lysaGogn(a.gogn)}</small> : null}<span>{nafn(a.hver) || ""}</span></li>
          ))}
          {log && !log.length && <li className="tomt">Ekkert skráð enn</li>}
          {!log && <li className="tomt">Sæki…</li>}
        </ul>
      )}
      <div className="vn-sheet-takkar">
        <button type="button" onClick={eyda} disabled={busy} className="vn-eyda">Fela</button>
        {onBreyta && <button type="button" onClick={onBreyta} disabled={busy}>✎ Breyta</button>}
        {onFaera && <button type="button" onClick={onFaera} disabled={busy}>✥ Færa</button>}
        {onAfrita && <button type="button" onClick={onAfrita} disabled={busy} title="Nýr punktur með sömu stærð, efni og athugasemd rétt hjá">⧉ Afrita</button>}
        {s.stada === "done"
          ? <button type="button" onClick={() => merkja("created")} disabled={busy}>Opna aftur</button>
          : <button type="button" className="vn-lokid" onClick={() => merkja("done")} disabled={busy}>{busy ? "…" : "✓ Merkja lokið"}</button>}
      </div>
      {stor && <div className="vn-stor" onClick={() => setStor(null)}><img src={stor} alt="" /></div>}
    </div>
  );
}
