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
const LOG_HEITI: Record<string, string> = { stofnad: "Stofnað", stada: "Staða breytt", mynd: "Mynd bætt við", eytt: "Falið", flokkur: "Flokkur breyttur", teikning: "Fært", texti: "Texti breyttur" };
function lysaGogn(g: Record<string, unknown>): string {
  const b: string[] = [];
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
      setVerk(v.data as Verk[]); setTeikningar(t.data as Teikning[]); setFlokkar(f.data as Flokkur[]); setAtridi(a.data as Atridi[]); setMenn(m.data as Starfsm[]);
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
          {!verk.length && <p className="vn-tomt">Engin bygging skráð enn.</p>}
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
        </div>
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

  useEffect(() => {
    const el = boxRef.current; if (!el) return;
    const k = () => setFit(Math.max(0.05, (el.clientWidth - 2) / W));
    k(); const ro = new ResizeObserver(k); ro.observe(el); return () => ro.disconnect();
  }, [W]);
  const scale = fit * zoom;

  const smella = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!baeta) return;
    const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const x = CX + (e.clientX - r.left) / scale, y = CY + (e.clientY - r.top) / scale;   // hnit í allri myndinni
    setNyr({ x: Math.round(x), y: Math.round(y) }); setBaeta(false); setOpid(null);
  };

  const synd = skr.filter((s) => !sia || s.stada === sia);
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
        <a className="vn-prenta" href={`/kjarni/skraning/prenta?verk=${verk.id}&teikning=${teikning.id}`} title="Hæðarskýrsla: teikning með pinnum + tafla (prenta / PDF)">🖨 Print</a>
        <div className="vn-zoom">
          <button type="button" onClick={() => setZoom((z) => Math.max(0.5, z / 1.4))}>−</button>
          <button type="button" onClick={() => setZoom(1)} title="Passa í glugga">⤢</button>
          <button type="button" onClick={() => setZoom((z) => Math.min(12, z * 1.4))}>+</button>
        </div>
        <button type="button" className={`vn-baeta ${baeta ? "on" : ""}`} onClick={() => { setBaeta((b) => !b); setNyr(null); setOpid(null); }}>{baeta ? "Smelltu á teikninguna…" : "+ Nýr punktur"}</button>
      </div>

      <div className={`vn-box ${baeta ? "baeta" : ""}`} ref={boxRef}>
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
      {opin && (
        <Punktur s={opin} myndir={myndir.filter((m) => m.skraning_id === opin.id)} svor={svor.filter((x) => x.skraning_id === opin.id && x.hakad)}
          flokkar={flokkar} atridi={atridi} starfsm={starfsm} nafn={nafn} onClose={() => setOpid(null)} onChanged={onChanged} />
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

function NyrPunktur({ verk, teikning, x, y, flokkar, atridi, starfsm, allar, onClose, onSaved }: {
  verk: Verk; teikning: Teikning; x: number; y: number; flokkar: Flokkur[]; atridi: Atridi[]; starfsm: string; allar: Skraning[]; onClose: () => void; onSaved: () => void;
}) {
  const [flokkur, setFlokkur] = useState<number | "">(flokkar[0]?.id ?? "");
  const [efni, setEfni] = useState<Set<number>>(new Set());
  const [lysing, setLysing] = useState("");
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
      const af = await starfsmId(starfsm);
      const radnr = allar.reduce((m, r) => Math.max(m, r.radnr), 0) + 1;
      const ins = await s.from("skr_skraningar").insert({
        verk_id: verk.id, radnr, teikning_id: teikning.id, x_px: x, y_px: y, flokkur_id: flokkur, starfsmadur_id: af, stofnad_af: af,
        stada: "created", lysing: lysing || null, framkvaemt_fra: isoDay(), abyrgd_id: 1,
      }).select("id").single();
      if (ins.error) throw new Error(ins.error.message);
      const id = ins.data.id as number;
      if (efni.size) {
        const r = await s.from("skr_gatlisti_svor").insert([...efni].map((atridi_id) => ({ skraning_id: id, atridi_id, hakad: true, hakad_af: af, hakad_at: new Date().toISOString() })));
        if (r.error) throw new Error(r.error.message);
      }
      await vistaMyndir(verk.id, id, files, "fyrir", af);
      await s.from("skr_atburdir").insert({ skraning_id: id, hvad: "stofnad", hver: af, gogn: { flokkur, efni: [...efni], myndir: files.length } });
      onSaved();
    } catch (e) { setVilla(String((e as Error).message || e)); } finally { setBusy(false); }
  };

  return (
    <div className="vn-sheet" role="dialog" aria-label="Nýr punktur">
      <div className="vn-sheet-haus"><strong>Nýr punktur</strong><span>{teikning.haed || teikning.heiti} · x {x} · y {y}</span><button type="button" className="vn-loka" onClick={onClose}>✕</button></div>
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
        <button type="button" className="aj-primary" onClick={vista} disabled={busy}>{busy ? "Vista…" : "Vista punkt"}</button>
      </div>
    </div>
  );
}

/* ===================== punktur sem er til ===================== */
function Punktur({ s, myndir, svor, flokkar, atridi, starfsm, nafn, onClose, onChanged }: {
  s: Skraning; myndir: Mynd[]; svor: Svar[]; flokkar: Flokkur[]; atridi: Atridi[]; starfsm: string; nafn: (id: number | null) => string | null; onClose: () => void; onChanged: () => void;
}) {
  // skráningalog (= Ajour „Show registration log")
  const [log, setLog] = useState<Atburdur[] | null>(null);
  const [synaLog, setSynaLog] = useState(false);
  useEffect(() => {
    if (!synaLog) return;
    sb().from("skr_atburdir").select("id,hvad,gogn,hver,hvenaer").eq("skraning_id", s.id).order("hvenaer", { ascending: false })
      .then((r) => setLog((r.data || []) as Atburdur[]));
  }, [synaLog, s.id, myndir.length, s.stada]);
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
        {s.stada === "done"
          ? <button type="button" onClick={() => merkja("created")} disabled={busy}>Opna aftur</button>
          : <button type="button" className="vn-lokid" onClick={() => merkja("done")} disabled={busy}>{busy ? "…" : "✓ Merkja lokið"}</button>}
      </div>
      {stor && <div className="vn-stor" onClick={() => setStor(null)}><img src={stor} alt="" /></div>}
    </div>
  );
}
