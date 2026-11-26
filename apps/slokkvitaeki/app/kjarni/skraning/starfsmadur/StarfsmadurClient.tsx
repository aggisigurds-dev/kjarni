"use client";

/* Starfsmannahamur (Agnar 26.11.2026: „mjög svipað viðmót og þetta [EG Ajour-appið] í símalayout í starfsmannaham").
 *
 * Sama flæði og Ajour-appið: verk → listi teikninga með fjölda skráninga → teikning með punktum → „QA #n"-spjald →
 * skráning með flokki (stærð), starfsmanni, gátlista (brunamótstaða og efni), lýsingu, myndum og stöðu.
 * Gögn og vistun eru þau sömu og í Vinnu (lib/vinna-gogn.ts): nýr punktur fer í biðröð í símanum ef netið vantar.
 * Engu er eytt: „Fela" setur eytt=true og skráir atburð. Staða skjásins er í slóðinni (?verk=&teikning=&skr=);
 * aðeins „Ég er" geymist í símanum (hver er við vélina). Bakk-takki símans fer eitt skref til baka. */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { sb, publicUrl } from "../lib/sb";
import { lesaSkurd, skurdarBakgrunnur } from "../lib/skurdur";
import { bidrod, erNetvilla, type BidPunktur } from "../lib/bidrod";
import {
  LS_STARFSM, starfsmId, vistaNyjanPunkt, sendaBidrod, naestaRadnrUrGrunni, vistaMyndir,
  type Verk, type Teikning, type Flokkur, type Atridi, type Skraning, type Mynd, type Svar, type Starfsm, type Atburdur,
} from "../lib/vinna-gogn";

const COLS = "id,verk_id,radnr,teikning_id,x_px,y_px,flokkur_id,starfsmadur_id,stofnad_af,stada,lysing,framkvaemt_fra,lokid_at,created_at,eytt";
type Nyr = { teikning_id: number; x: number; y: number; fra?: { radnr: number; flokkur_id: number | null; efni: number[]; lysing: string } };
type Sia = "" | "created" | "done";
/** Síðasta verk í þessum síma (tímabundin staða eins og opinn flipi): appið í Firestarters opnast beint á því. */
const LS_VERK = "skr_sm_verk";

const STADA: Record<string, string> = { created: "Created", done: "Done", completed: "Completed", rejected: "Rejected", not_approved: "Not approved" };
const LOG: Record<string, string> = { stofnad: "Stofnað", stada: "Staða breytt", mynd: "Mynd bætt við", eytt: "Falið", flokkur: "Flokkur breyttur", teikning: "Fært á teikningu", texti: "Breytt", athugasemd: "Athugasemd", afrit: "Afritað" };
const stadaKlasi = (s: string) => (s === "done" ? "done" : s === "created" ? "created" : "annad");

async function soekjaSkraningar(vid: number): Promise<Skraning[]> {
  const out: Skraning[] = [];
  for (let fra = 0; ; fra += 1000) {   // PostgREST skilar mest 1000 í einu; NLSH hefur þúsundir
    const r = await sb().from("skr_skraningar").select(COLS).eq("verk_id", vid).eq("eytt", false).order("radnr").range(fra, fra + 999);
    if (r.error) throw new Error(r.error.message);
    out.push(...((r.data || []) as Skraning[]));
    if (!r.data || r.data.length < 1000) break;
  }
  return out;
}
function lesaSlod() {
  if (typeof window === "undefined") return { verk: 0, teikning: 0, skr: 0 };
  const q = new URLSearchParams(window.location.search);
  return { verk: Number(q.get("verk")) || 0, teikning: Number(q.get("teikning")) || 0, skr: Number(q.get("skr")) || 0 };
}
function skrifaSlod(p: { verk: number | null; teikning: number | null; skr: number | null }) {
  const u = new URLSearchParams();
  if (p.verk) u.set("verk", String(p.verk));
  if (p.teikning) u.set("teikning", String(p.teikning));
  if (p.skr) u.set("skr", String(p.skr));
  const s = u.toString();
  window.history.replaceState(window.history.state, "", s ? `?${s}` : window.location.pathname);
}

/* ============================================================ aðalskjár */
export default function StarfsmadurClient() {
  const [verkListi, setVerkListi] = useState<Verk[]>([]);
  const [verkId, setVerkId] = useState<number | null>(null);
  const [teikningar, setTeikningar] = useState<Teikning[]>([]);
  const [flokkarAllir, setFlokkarAllir] = useState<Flokkur[]>([]);
  const [atridiOll, setAtridiOll] = useState<Atridi[]>([]);
  const [menn, setMenn] = useState<Starfsm[]>([]);
  const [skr, setSkr] = useState<Skraning[]>([]);
  const [hladid, setHladid] = useState(false);
  const [saekir, setSaekir] = useState(false);
  const [villa, setVilla] = useState<string | null>(null);

  const [teikningId, setTeikningId] = useState<number | null>(null);
  const [opinId, setOpinId] = useState<number | null>(null);
  const [nyr, setNyr] = useState<Nyr | null>(null);
  const [listi, setListi] = useState<"allt" | "an" | null>(null);
  const [faera, setFaera] = useState<number | null>(null);
  const [midja, setMidja] = useState<number | null>(null);   // teikning opnuð á þessum punkti („Skoða")

  const [skuffa, setSkuffa] = useState(false);
  const [sia, setSia] = useState<Sia>("");
  const [siaOpin, setSiaOpin] = useState(false);
  const [farA, setFarA] = useState(false);
  const [veljaTeikn, setVeljaTeikn] = useState(false);
  const [starfsm, setStarfsm] = useState("");
  const [bid, setBid] = useState(0);

  // ---- grunngögn
  useEffect(() => {
    try { setStarfsm(window.localStorage.getItem(LS_STARFSM) || ""); } catch { /* einkagluggi */ }
    const p = lesaSlod();
    if (p.teikning) setTeikningId(p.teikning);
    if (p.skr) setOpinId(p.skr);
    (async () => {
      const s = sb();
      const [v, f, a, m] = await Promise.all([
        s.from("skr_verk").select("id,heiti,heimilisfang,virkt").eq("eytt", false).eq("virkt", true).order("heiti"),
        s.from("skr_flokkar").select("id,verk_id,heiti,tegund,rod").order("rod"),
        s.from("skr_gatlisti").select("id,verk_id,atridi,hopur,rod").eq("virkt", true).order("rod"),
        s.from("skr_starfsmenn").select("id,numer,nafn,virkur").eq("virkur", true).order("numer"),
      ]);
      if (v.error) { setVilla(v.error.message); return; }
      const vl = (v.data || []) as Verk[];
      setVerkListi(vl); setFlokkarAllir((f.data || []) as Flokkur[]); setAtridiOll((a.data || []) as Atridi[]); setMenn((m.data || []) as Starfsm[]);
      let sidast = 0; try { sidast = Number(window.localStorage.getItem(LS_VERK)) || 0; } catch { /* einkagluggi */ }
      const upphaf = [p.verk, sidast].find((v) => v && vl.some((x) => x.id === v)) || null;
      setVerkId(upphaf);
      if (!upphaf) setSkuffa(true);   // ekkert verk: valmyndin opnast með verkalistanum
      setHladid(true);
    })();
    bidrod.fjoldi().then(setBid);
  }, []);

  const hlada = useCallback(async (vid: number) => {
    setSaekir(true); setVilla(null);
    try {
      const s = sb();
      const [t, rows] = await Promise.all([
        s.from("skr_teikningar").select("id,verk_id,heiti,haed,mynd_path,breidd_px,haed_px,rod,skurdur").eq("verk_id", vid).eq("eytt", false).order("rod"),
        soekjaSkraningar(vid),
      ]);
      if (t.error) throw new Error(t.error.message);
      setTeikningar((t.data || []) as Teikning[]); setSkr(rows);
    } catch (e) { setVilla(String((e as Error).message || e)); }
    finally { setSaekir(false); }
  }, []);
  useEffect(() => { if (verkId) hlada(verkId); else { setTeikningar([]); setSkr([]); } }, [verkId, hlada]);

  // slóðin fylgir skjánum (endurhleðsla heldur sama stað)
  useEffect(() => { if (hladid) skrifaSlod({ verk: verkId, teikning: teikningId, skr: opinId }); }, [hladid, verkId, teikningId, opinId]);

  // ---- biðröð án nets
  const sendaNuna = useCallback(async () => {
    const r = await sendaBidrod(naestaRadnrUrGrunni);
    setBid(r.eftir);
    if (r.sent && verkId) hlada(verkId);
  }, [verkId, hlada]);
  useEffect(() => {
    const f = () => { sendaNuna(); };
    window.addEventListener("online", f);
    return () => window.removeEventListener("online", f);
  }, [sendaNuna]);

  // ---- bakk-takki símans: hvert skref inn ýtir einni stöðu, bakk lokar efsta laginu
  const lag = useRef({ teikningId, opinId, nyr, listi, faera });
  lag.current = { teikningId, opinId, nyr, listi, faera };
  const lokaEfsta = useCallback((): boolean => {
    const l = lag.current;
    setSiaOpin(false); setFarA(false); setVeljaTeikn(false); setSkuffa(false);
    if (l.faera) { setFaera(null); return true; }
    if (l.nyr) { setNyr(null); return true; }
    if (l.opinId) { setOpinId(null); return true; }
    if (l.listi) { setListi(null); return true; }
    if (l.teikningId) { setTeikningId(null); setMidja(null); return true; }
    return false;
  }, []);
  useEffect(() => {
    // færsla sem lokaði engu (skjár sem var skipt út, t.d. „Skoða") er hoppað yfir
    const f = (e: PopStateEvent) => { if (!lokaEfsta() && e.state && e.state.sm) window.history.back(); };
    window.addEventListener("popstate", f);
    return () => window.removeEventListener("popstate", f);
  }, [lokaEfsta]);
  const inn = (fn: () => void) => { window.history.pushState({ sm: 1 }, ""); fn(); };
  const tilBaka = () => { if (window.history.state && window.history.state.sm) window.history.back(); else lokaEfsta(); };

  // ---- afleidd gögn
  const verk = verkListi.find((v) => v.id === verkId) || null;
  const flokkar = useMemo(() => flokkarAllir.filter((f) => f.verk_id === null || f.verk_id === verkId), [flokkarAllir, verkId]);
  const atridi = useMemo(() => atridiOll.filter((a) => a.verk_id === null || a.verk_id === verkId), [atridiOll, verkId]);
  const synd = useMemo(() => skr.filter((s) => !sia || s.stada === sia), [skr, sia]);
  const fjoldi = useMemo(() => { const m = new Map<number | null, number>(); synd.forEach((s) => m.set(s.teikning_id, (m.get(s.teikning_id) || 0) + 1)); return m; }, [synd]);
  const teikning = teikningar.find((t) => t.id === teikningId) || null;
  const opin = skr.find((s) => s.id === opinId) || null;
  const nafn = useCallback((id: number | null) => { const m = menn.find((x) => x.id === id); return m ? `${m.numer}. ${m.nafn || `Starfsmaður ${m.numer}`}` : null; }, [menn]);
  const vistaStarfsm = (v: string) => { setStarfsm(v); try { window.localStorage.setItem(LS_STARFSM, v); } catch { /* */ } };
  const endurhlada = () => { if (verkId) hlada(verkId); bidrod.fjoldi().then(setBid); };
  // breyting á einni skráningu: uppfæra hana í listanum (ekki sækja þúsundir raða aftur)
  const plastra = useCallback((id: number, patch: Partial<Skraning>) => setSkr((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r))), []);

  const veljaVerk = (id: number) => {
    setSkuffa(false);
    try { window.localStorage.setItem(LS_VERK, String(id)); } catch { /* */ }
    if (id === verkId) return;
    setTeikningId(null); setOpinId(null); setNyr(null); setListi(null); setMidja(null);
    setVerkId(id);
  };

  // ============================================================ skjáirnir, efsta lagið fyrst
  let skjar: React.ReactNode;
  if (!hladid) skjar = <div className="sm-hledur">Hleð…</div>;
  else if (nyr || opin) {
    const t = teikningar.find((x) => x.id === (nyr ? nyr.teikning_id : opin?.teikning_id)) || null;
    skjar = (
      <SkraningSkjar key={nyr ? `nyr-${nyr.teikning_id}-${nyr.x}-${nyr.y}` : `s-${opin!.id}`}
        verk={verk!} s={nyr ? null : opin} nyr={nyr} teikning={t} flokkar={flokkar} atridi={atridi} menn={menn} starfsm={starfsm} nafn={nafn} allar={skr}
        onBack={tilBaka}
        onVistad={async (id) => { await hlada(verk!.id); setNyr(null); if (id) setOpinId(id); else tilBaka(); bidrod.fjoldi().then(setBid); }}
        onBreytt={(patch) => { if (opin && patch) plastra(opin.id, patch); }}
        onFalid={() => { if (opin) setSkr((rows) => rows.filter((r) => r.id !== opin.id)); tilBaka(); }}
        onSkoda={(s) => { setOpinId(null); setListi(null); setTeikningId(s.teikning_id); setMidja(s.id); }}
        onAfrita={(s) => { if (!s.teikning_id) return; setOpinId(null); setNyr({ teikning_id: s.teikning_id, x: (Number(s.x_px) || 0) + 40, y: (Number(s.y_px) || 0) + 40, fra: { radnr: s.radnr, flokkur_id: s.flokkur_id, efni: [], lysing: s.lysing || "" } }); }}
        onFaera={(s) => { if (!s.teikning_id) return; setOpinId(null); setListi(null); setTeikningId(s.teikning_id); setMidja(s.id); setFaera(s.id); }}
      />
    );
  } else if (listi) {
    const rows = synd.filter((s) => listi === "allt" || !s.teikning_id);
    skjar = (
      <div className="sm-skjar">
        <Haus titill={listi === "an" ? "Skráningar án teikningar" : `Allar skráningar (${rows.length})`} onBack={tilBaka} onSync={endurhlada} saekir={saekir} />
        <div className="sm-listi">
          {rows.length === 0 && <p className="sm-tomt">Engar skráningar{sia ? " með þessari stöðu" : ""}.</p>}
          {rows.slice(0, 500).map((s) => (
            <button type="button" key={s.id} className="sm-lina" onClick={() => inn(() => setOpinId(s.id))}>
              <span className={`sm-merki ${stadaKlasi(s.stada)}`}>#{s.radnr}</span>
              <span className="sm-lina-txt"><b>{flokkar.find((f) => f.id === s.flokkur_id)?.heiti || "—"}</b><small>{[nafn(s.starfsmadur_id), s.framkvaemt_fra, s.lysing].filter(Boolean).join(" · ")}</small></span>
              <i className="sm-ör" aria-hidden>›</i>
            </button>
          ))}
          {rows.length > 500 && <p className="sm-tomt">Sýni 500 fyrstu af {rows.length}. Notaðu „Fara á #" til að finna númer.</p>}
        </div>
      </div>
    );
  } else if (teikning) {
    skjar = (
      <TeikningSkjar key={teikning.id} teikning={teikning} skr={synd.filter((s) => s.teikning_id === teikning.id)} flokkar={flokkar} nafn={nafn}
        starfsm={starfsm} sia={sia} midja={midja} faera={faera} saekir={saekir}
        onBack={tilBaka} onSync={endurhlada} onSia={() => setSiaOpin(true)} onListi={() => inn(() => setListi("allt"))}
        onOpna={(id) => inn(() => setOpinId(id))}
        onNyr={(x, y) => inn(() => setNyr({ teikning_id: teikning.id, x, y }))}
        onFaert={async (id, x, y) => {
          const af = await starfsmId(starfsm);
          const u = await sb().from("skr_skraningar").update({ x_px: x, y_px: y }).eq("id", id);
          if (u.error) { setVilla(u.error.message); return; }
          await sb().from("skr_atburdir").insert({ skraning_id: id, hvad: "teikning", hver: af, gogn: { x, y } });
          plastra(id, { x_px: x, y_px: y }); setFaera(null); setMidja(id);
        }}
        onHaettaFaera={() => setFaera(null)}
        onStadaBreytt={plastra}
      />
    );
  } else {
    // ---- verkskjárinn: QA-borði, listi teikninga með fjölda, „+" og neðri stika
    const an = fjoldi.get(null) || 0;
    skjar = (
      <div className="sm-skjar">
        <header className="sm-haus">
          <button type="button" className="sm-ikon" aria-label="Valmynd" onClick={() => setSkuffa(true)}><Ikon n="valmynd" /></button>
          <h1>{verk ? verk.heiti.replace(/\s*·\s*gatakort\s*$/i, "") : "Veldu verk"}</h1>
          <button type="button" className={`sm-ikon ${saekir ? "snyst" : ""}`} aria-label="Sækja aftur" onClick={endurhlada}><Ikon n="sync" /></button>
        </header>
        <div className="sm-qa-bordi">QA{sia ? <span> · {STADA[sia]}</span> : null}</div>
        {!starfsm && <button type="button" className="sm-advorun" onClick={() => setSkuffa(true)}>Veldu þig („Ég er") svo skráningar fái starfsmannanúmerið þitt ›</button>}
        {bid > 0 && <button type="button" className="sm-advorun bid" onClick={sendaNuna}>📵 {bid} skráning{bid === 1 ? " bíður" : "ar bíða"} sendingar · Senda núna</button>}
        {villa && <p className="sm-villa">{villa}</p>}
        <div className="sm-listi">
          {verk && (
            <button type="button" className="sm-kort" onClick={() => inn(() => setListi("an"))}>
              <span className="sm-kort-ikon"><Ikon n="listi" /></span>
              <span className="sm-kort-txt">Skráningar án teikningar (listi)</span>
              <span className="sm-fjoldi">{an}</span><i className="sm-ör" aria-hidden>›</i>
            </button>
          )}
          {teikningar.map((t) => (
            <button type="button" key={t.id} className="sm-kort" onClick={() => inn(() => { setTeikningId(t.id); setMidja(null); })}>
              {t.mynd_path
                ? <span className="sm-smamynd" style={skurdarBakgrunnur(publicUrl(t.mynd_path), t.breidd_px || 1, t.haed_px || 1, lesaSkurd(t.skurdur, t.breidd_px || 1, t.haed_px || 1), 92, 66)} />
                : <span className="sm-smamynd" />}
              <span className="sm-kort-txt">{t.heiti}</span>
              <span className="sm-fjoldi">{fjoldi.get(t.id) || 0}</span><i className="sm-ör" aria-hidden>›</i>
            </button>
          ))}
          {verk && !saekir && !teikningar.length && <p className="sm-tomt">Engar teikningar í þessu verki. Þeim er hlaðið upp í Byggingum.</p>}
        </div>
        {verk && <button type="button" className="sm-fab" aria-label="Ný skráning" onClick={() => setVeljaTeikn(true)}>+</button>}
        <nav className="sm-nedri">
          <button type="button" onClick={() => setSiaOpin(true)} className={sia ? "on" : ""}><Ikon n="sia" /><span>Sía</span></button>
          <button type="button" onClick={() => verk && inn(() => setListi("allt"))}><Ikon n="listi" /><span>Listi</span></button>
          <button type="button" onClick={() => setFarA(true)}><b className="sm-hash">#</b><span>Fara á</span></button>
        </nav>
      </div>
    );
  }

  return (
    <div className="sm">
      {skjar}

      {skuffa && (
        <div className="sm-skuffa-bak" onClick={() => setSkuffa(false)}>
          <aside className="sm-skuffa" onClick={(e) => e.stopPropagation()} aria-label="Valmynd">
            <div className="sm-skuffa-haus">
              <button type="button" className="sm-ikon" aria-label="Loka" onClick={() => setSkuffa(false)}><Ikon n="valmynd" /></button>
              <h2>Brunahólf ehf</h2>
            </div>
            <div className="sm-verkval">
              <span>Verk</span>
              {verkListi.map((v) => (
                <button type="button" key={v.id} className={v.id === verkId ? "on" : ""} onClick={() => veljaVerk(v.id)}>
                  <b>{v.heiti.replace(/\s*·\s*gatakort\s*$/i, "")}</b><small>{v.heimilisfang || "—"}</small><i aria-hidden>›</i>
                </button>
              ))}
            </div>
            <label className="sm-eger">Ég er
              <select value={starfsm} onChange={(e) => vistaStarfsm(e.target.value)}>
                <option value="">— veldu þig —</option>
                {menn.map((m) => <option key={m.id} value={String(m.numer ?? "")}>{m.numer}. {m.nafn || `Starfsmaður ${m.numer}`}</option>)}
              </select>
            </label>
            <nav className="sm-skuffa-valmynd">
              <a href={verkId ? `/kjarni/skraning/kort?verk=${verkId}` : "/kjarni/skraning/kort"}>Gatakort</a>
              <a href={verkId ? `/kjarni/skraning/vinna?verk=${verkId}` : "/kjarni/skraning/vinna"}>Vinna (eldri skjár)</a>
              <a href="/kjarni/skraning/verk">Byggingar &amp; teikningar</a>
            </nav>
            <p className="sm-utgafa">Apex Ajour · starfsmenn</p>
          </aside>
        </div>
      )}

      {siaOpin && (
        <Blad titill="Sía eftir stöðu" onLoka={() => setSiaOpin(false)}>
          {([["", "Allar"], ["created", "Created (opnar)"], ["done", "Done (lokið)"]] as [Sia, string][]).map(([k, h]) => (
            <button type="button" key={k || "allt"} className={`sm-val ${sia === k ? "on" : ""}`} onClick={() => { setSia(k); setSiaOpin(false); }}>
              <span>{h}</span><i className="sm-radio" aria-hidden />
            </button>
          ))}
        </Blad>
      )}

      {farA && <FaraA onLoka={() => setFarA(false)} onFara={(n) => {
        const s = skr.find((x) => x.radnr === n);
        if (!s) return `Engin skráning #${n} í þessu verki.`;
        setFarA(false); inn(() => setOpinId(s.id)); return null;
      }} />}

      {veljaTeikn && (
        <Blad titill="Ný skráning: veldu teikningu" onLoka={() => setVeljaTeikn(false)}>
          {teikningar.map((t) => (
            <button type="button" key={t.id} className="sm-val" onClick={() => { setVeljaTeikn(false); inn(() => { setTeikningId(t.id); setMidja(null); }); }}>
              <span>{t.heiti}</span><i className="sm-ör" aria-hidden>›</i>
            </button>
          ))}
          <p className="sm-tomt">Opnaðu teikninguna og ýttu á „+ Skráning", svo á staðinn.</p>
        </Blad>
      )}
    </div>
  );
}

/* ============================================================ teikningin */
function TeikningSkjar({ teikning, skr, flokkar, nafn, starfsm, sia, midja, faera, saekir, onBack, onSync, onSia, onListi, onOpna, onNyr, onFaert, onHaettaFaera, onStadaBreytt }: {
  teikning: Teikning; skr: Skraning[]; flokkar: Flokkur[]; nafn: (id: number | null) => string | null; starfsm: string; sia: Sia; midja: number | null; faera: number | null; saekir: boolean;
  onBack: () => void; onSync: () => void; onSia: () => void; onListi: () => void; onOpna: (id: number) => void; onNyr: (x: number, y: number) => void;
  onFaert: (id: number, x: number, y: number) => void; onHaettaFaera: () => void; onStadaBreytt: (id: number, patch: Partial<Skraning>) => void;
}) {
  const FW = teikning.breidd_px || 1000, FH = teikning.haed_px || 700;
  const sk = lesaSkurd(teikning.skurdur, FW, FH);
  const CX = sk ? sk.x : 0, CY = sk ? sk.y : 0, W = sk ? sk.w : FW, H = sk ? sk.h : FH;
  const boxRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(0);
  const [zoom, setZoom] = useState(1);
  const scale = fit * zoom;
  const [spjald, setSpjald] = useState<number | null>(midja);
  const [baeta, setBaeta] = useState(false);
  const [merki, setMerki] = useState<{ x: number; y: number } | null>(null);   // guli pinninn í „bæta við"-ham

  useLayoutEffect(() => {
    const el = boxRef.current; if (!el) return;
    const k = () => setFit(Math.max(0.02, Math.min((el.clientWidth - 2) / W, (el.clientHeight - 2) / H)));
    k(); const ro = new ResizeObserver(k); ro.observe(el); return () => ro.disconnect();
  }, [W, H]);

  // klípa: halda punktinum undir fingrunum kyrrum (skrun stillt eftir að ný stærð teiknast)
  const fingur = useRef(new Map<number, { x: number; y: number }>());
  const klipa = useRef<{ d: number; zoom: number } | null>(null);
  const akkeri = useRef<{ cx: number; cy: number; mx: number; my: number } | null>(null);
  const midjaSkjas = (mx: number, my: number, z: number) => {
    const el = boxRef.current; if (!el || Math.abs(z - zoom) < 0.001) return;
    const r = el.getBoundingClientRect(), s0 = fit * zoom;
    akkeri.current = { cx: (el.scrollLeft + mx - r.left) / s0, cy: (el.scrollTop + my - r.top) / s0, mx: mx - r.left, my: my - r.top };
    setZoom(z);
  };
  useLayoutEffect(() => {
    const el = boxRef.current, a = akkeri.current; if (!el || !a) return;
    el.scrollLeft = a.cx * scale - a.mx; el.scrollTop = a.cy * scale - a.my; akkeri.current = null;
  }, [scale]);
  const pDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch") return;
    fingur.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (fingur.current.size === 2) { const [a, b] = [...fingur.current.values()]; klipa.current = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom }; }
  };
  const pMove = (e: React.PointerEvent) => {
    if (!fingur.current.has(e.pointerId)) return;
    fingur.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (fingur.current.size === 2 && klipa.current) {
      const [a, b] = [...fingur.current.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > 10) midjaSkjas((a.x + b.x) / 2, (a.y + b.y) / 2, Math.min(16, Math.max(1, klipa.current.zoom * (d / klipa.current.d))));
    }
  };
  const pUp = (e: React.PointerEvent) => { fingur.current.delete(e.pointerId); if (fingur.current.size < 2) klipa.current = null; };
  const hnappaZoom = (k: number) => { const el = boxRef.current; if (!el) return; const r = el.getBoundingClientRect(); midjaSkjas(r.left + r.width / 2, r.top + r.height / 2, Math.min(16, Math.max(1, zoom * k))); };

  // „Skoða" eða færsla: stækka og miðja á punktinum
  const midjad = useRef<number | null>(null);
  useEffect(() => {
    const id = midja ?? faera; const s = skr.find((x) => x.id === id);
    if (!fit || !s || midjad.current === s.id || s.x_px == null || s.y_px == null) return;
    midjad.current = s.id;
    setSpjald(faera ? null : s.id);
    const el = boxRef.current; if (!el) return;
    const a = { cx: Number(s.x_px) - CX, cy: Number(s.y_px) - CY, mx: el.clientWidth / 2, my: el.clientHeight / 2 };
    if (Math.abs(zoom - 3) < 0.001) { el.scrollLeft = a.cx * scale - a.mx; el.scrollTop = a.cy * scale - a.my; }
    else { akkeri.current = a; setZoom(3); }
  }, [fit, midja, faera, skr, CX, CY, zoom, scale]);

  const midjaSjonar = () => { const el = boxRef.current; if (!el || !scale) return { x: CX + W / 2, y: CY + H / 2 }; return { x: Math.round(CX + (el.scrollLeft + el.clientWidth / 2) / scale), y: Math.round(CY + (el.scrollTop + el.clientHeight / 2) / scale) }; };
  const smella = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!baeta && !faera) { setSpjald(null); return; }
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.round(CX + (e.clientX - r.left) / scale), y = Math.round(CY + (e.clientY - r.top) / scale);
    if (x < CX || y < CY || x > CX + W || y > CY + H) return;
    if (faera) { onFaert(faera, x, y); return; }
    setMerki({ x, y });
  };
  const byrjaBaeta = () => { setSpjald(null); setBaeta(true); setMerki(midjaSjonar()); };
  const haetta = () => { setBaeta(false); setMerki(null); };

  const opinSkr = skr.find((s) => s.id === spjald) || null;
  return (
    <div className="sm-skjar sm-teikning">
      <Haus titill={teikning.heiti} onBack={onBack} onSync={onSync} saekir={saekir} />
      {faera && <div className="sm-bordi">Ýttu þar sem skráning #{skr.find((s) => s.id === faera)?.radnr ?? ""} á að vera <button type="button" onClick={onHaettaFaera}>Hætta við</button></div>}
      <div className={`sm-flotur-kassi ${baeta || faera ? "baeta" : ""}`} ref={boxRef} onPointerDown={pDown} onPointerMove={pMove} onPointerUp={pUp} onPointerCancel={pUp}>
        <div className="sm-flotur" style={{ width: W * scale, height: H * scale }} onClick={smella}>
          {teikning.mynd_path && scale > 0 && <img src={publicUrl(teikning.mynd_path)} alt={teikning.heiti} draggable={false}
            style={{ position: "absolute", left: -CX * scale, top: -CY * scale, width: FW * scale, height: FH * scale, maxWidth: "none" }} />}
          {scale > 0 && skr.map((s) => s.x_px == null || s.y_px == null ? null : (
            <button type="button" key={s.id} className={`sm-pinni ${stadaKlasi(s.stada)} ${spjald === s.id ? "on" : ""}`}
              style={{ left: (Number(s.x_px) - CX) * scale, top: (Number(s.y_px) - CY) * scale }}
              onClick={(e) => { e.stopPropagation(); if (baeta || faera) return; setSpjald(s.id); }} aria-label={`Skráning ${s.radnr}`}>
              <i>#{s.radnr}</i>
            </button>
          ))}
          {merki && <span className="sm-nyr-merki" style={{ left: (merki.x - CX) * scale, top: (merki.y - CY) * scale }} aria-hidden><Ikon n="pinni" /></span>}
        </div>
      </div>
      <div className="sm-zoom"><button type="button" onClick={() => hnappaZoom(1.5)} aria-label="Stækka">+</button><button type="button" onClick={() => hnappaZoom(1 / 1.5)} aria-label="Minnka">−</button></div>

      {opinSkr && !baeta && !faera && <QaSpjald s={opinSkr} flokkar={flokkar} nafn={nafn} starfsm={starfsm} onOpna={() => onOpna(opinSkr.id)} onBreytt={(patch) => onStadaBreytt(opinSkr.id, patch)} onLoka={() => setSpjald(null)} />}

      {!opinSkr && !faera && (baeta ? (
        <div className="sm-baeta-stika">
          <button type="button" className="sm-midja-takki" aria-label="Setja í miðju" onClick={() => setMerki(midjaSjonar())}><Ikon n="midja" /></button>
          <button type="button" className="sm-baeta-takki" disabled={!merki} onClick={() => { if (merki) { const m = merki; haetta(); onNyr(m.x, m.y); } }}>Bæta við skráningu</button>
          <button type="button" className="sm-haetta-takki" aria-label="Hætta við" onClick={haetta}>✕</button>
        </div>
      ) : (
        <div className="sm-teikn-stika">
          <button type="button" className={`sm-sia-takki ${sia ? "virk" : ""}`} onClick={onSia}><Ikon n="sia" /> Sía{sia && <b>1</b>}</button>
          <button type="button" className="sm-qa-takki" onClick={byrjaBaeta}>+ Skráning</button>
          <button type="button" className="sm-listi-takki" onClick={onListi}><Ikon n="listi" /> Listi</button>
        </div>
      ))}
    </div>
  );
}

/* ---- spjaldið neðst þegar ýtt er á punkt („QA #8980 · Change status") */
function QaSpjald({ s, flokkar, nafn, starfsm, onOpna, onBreytt, onLoka }: {
  s: Skraning; flokkar: Flokkur[]; nafn: (id: number | null) => string | null; starfsm: string; onOpna: () => void; onBreytt: (patch: Partial<Skraning>) => void; onLoka: () => void;
}) {
  const [myndir, setMyndir] = useState<Mynd[] | null>(null);
  useEffect(() => {
    let lifir = true;
    sb().from("skr_myndir").select("id,skraning_id,path,stig,rod,created_at").eq("skraning_id", s.id).order("rod").then((r) => { if (lifir) setMyndir((r.data || []) as Mynd[]); });
    return () => { lifir = false; };
  }, [s.id]);
  return (
    <div className="sm-qa-spjald" role="dialog" aria-label={`QA ${s.radnr}`}>
      <StoduHaus s={s} starfsm={starfsm} onBreytt={onBreytt} />
      <button type="button" className="sm-qa-meginmal" onClick={onOpna}>
        <span className="sm-qa-mynd">
          {myndir && myndir[0] ? <img src={publicUrl(myndir[0].path)} alt="" /> : <span className="sm-qa-engin">📷</span>}
          {myndir && myndir.length > 1 && <b>+{myndir.length - 1}</b>}
        </span>
        <span className="sm-qa-txt">
          <b>Stofnað af Brunahólf ehf{nafn(s.stofnad_af ?? s.starfsmadur_id) ? `, ${nafn(s.stofnad_af ?? s.starfsmadur_id)}` : ""}</b>
          <span><Ikon n="flokkur" /> {flokkar.find((f) => f.id === s.flokkur_id)?.heiti || "—"}</span>
          {s.lysing && <span className="sm-qa-lysing">{s.lysing}</span>}
        </span>
        <i className="sm-ör" aria-hidden>›</i>
      </button>
      <button type="button" className="sm-qa-loka" onClick={onLoka} aria-label="Loka">✕</button>
    </div>
  );
}

/* ---- „QA #n" með lit stöðunnar og „Breyta stöðu" */
function StoduHaus({ s, starfsm, onBreytt }: { s: Skraning; starfsm: string; onBreytt: (patch: Partial<Skraning>) => void }) {
  const [opid, setOpid] = useState(false);
  const [busy, setBusy] = useState(false);
  const merkja = async (stada: "created" | "done") => {
    setOpid(false); if (stada === s.stada) return;
    setBusy(true);
    try {
      const af = await starfsmId(starfsm);
      const lokid_at = stada === "done" ? new Date().toISOString() : null;
      const r = await sb().from("skr_skraningar").update({ stada, lokid_at }).eq("id", s.id);
      if (r.error) throw new Error(r.error.message);
      await sb().from("skr_atburdir").insert({ skraning_id: s.id, hvad: "stada", hver: af, gogn: { stada } });
      onBreytt({ stada, lokid_at });
    } catch (e) { window.alert(String((e as Error).message || e)); } finally { setBusy(false); }
  };
  return (
    <div className={`sm-stodu-haus ${stadaKlasi(s.stada)}`}>
      <strong>QA #{s.radnr}</strong>
      <button type="button" className="sm-stodu-takki" onClick={() => setOpid((v) => !v)} disabled={busy}>{busy ? "Vista…" : "Breyta stöðu"} <span aria-hidden>{opid ? "⌄" : "⌃"}</span></button>
      {opid && (
        <div className="sm-stodu-val">
          <button type="button" className={`created ${s.stada === "created" ? "on" : ""}`} onClick={() => merkja("created")}>Created</button>
          <button type="button" className={`done ${s.stada === "done" ? "on" : ""}`} onClick={() => merkja("done")}>Done</button>
        </div>
      )}
    </div>
  );
}

/* ============================================================ skráningin (eins og Ajour: flokkur, starfsmaður, gátlisti, lýsing, myndir) */
function SkraningSkjar({ verk, s, nyr, teikning, flokkar, atridi, menn, starfsm, nafn, allar, onBack, onVistad, onBreytt, onFalid, onSkoda, onAfrita, onFaera }: {
  verk: Verk; s: Skraning | null; nyr: Nyr | null; teikning: Teikning | null; flokkar: Flokkur[]; atridi: Atridi[]; menn: Starfsm[]; starfsm: string;
  nafn: (id: number | null) => string | null; allar: Skraning[];
  onBack: () => void; onVistad: (id: number | null) => void; onBreytt: (patch?: Partial<Skraning>) => void; onFalid: () => void;
  onSkoda: (s: Skraning) => void; onAfrita: (s: Skraning) => void; onFaera: (s: Skraning) => void;
}) {
  const ny = !s;
  const [flokkur, setFlokkur] = useState<number | null>(s ? s.flokkur_id : (nyr?.fra?.flokkur_id ?? null));
  const [starfsmNr, setStarfsmNr] = useState<string>(() => {
    if (s) { const m = menn.find((x) => x.id === s.starfsmadur_id); return m ? String(m.numer ?? "") : ""; }
    return starfsm;
  });
  const [efni, setEfni] = useState<Set<number>>(new Set(nyr?.fra?.efni || []));
  const [lysing, setLysing] = useState(s ? s.lysing || "" : nyr?.fra?.lysing || "");
  const [myndir, setMyndir] = useState<Mynd[]>([]);
  const [nyjarMyndir, setNyjarMyndir] = useState<File[]>([]);
  const [valmynd, setValmynd] = useState<"flokkur" | "starfsm" | "gatlisti" | "saga" | "meira" | null>(null);
  const [busy, setBusy] = useState(false);
  const [villa, setVilla] = useState<string | null>(null);
  const [stor, setStor] = useState<string | null>(null);

  // gátlisti og myndir skráningar sem er til
  const hladaSvorOgMyndir = useCallback(async () => {
    if (!s) return;
    const [sv, m] = await Promise.all([
      sb().from("skr_gatlisti_svor").select("skraning_id,atridi_id,hakad").eq("skraning_id", s.id),
      sb().from("skr_myndir").select("id,skraning_id,path,stig,rod,created_at").eq("skraning_id", s.id).order("rod"),
    ]);
    setEfni(new Set(((sv.data || []) as Svar[]).filter((x) => x.hakad).map((x) => x.atridi_id)));
    setMyndir((m.data || []) as Mynd[]);
  }, [s]);
  useEffect(() => { hladaSvorOgMyndir(); }, [hladaSvorOgMyndir]);

  const breyta = async (fn: (af: number | null) => Promise<void>, patch?: Partial<Skraning>): Promise<boolean> => {
    setBusy(true); setVilla(null);
    try { const af = await starfsmId(starfsm); await fn(af); if (patch) onBreytt(patch); return true; }
    catch (e) { setVilla(String((e as Error).message || e)); return false; }
    finally { setBusy(false); }
  };
  const uppfaera = (gildi: Partial<Skraning>, hvad: string, gogn: Record<string, unknown>) => breyta(async (af) => {
    const r = await sb().from("skr_skraningar").update(gildi).eq("id", s!.id);
    if (r.error) throw new Error(r.error.message);
    await sb().from("skr_atburdir").insert({ skraning_id: s!.id, hvad, hver: af, gogn });
  }, gildi);

  const veljaFlokk = (id: number) => { setValmynd(null); setFlokkur(id); if (s && id !== s.flokkur_id) uppfaera({ flokkur_id: id }, "flokkur", { flokkur: id }); };
  const veljaStarfsm = async (nr: string) => {
    setValmynd(null); setStarfsmNr(nr);
    if (!s) return;
    const id = await starfsmId(nr);
    if (id !== s.starfsmadur_id) uppfaera({ starfsmadur_id: id }, "texti", { starfsmadur: id });
  };
  const hakaVid = (id: number) => {
    const n = new Set(efni); const hakad = !n.has(id); if (hakad) n.add(id); else n.delete(id); setEfni(n);
    if (s) breyta(async (af) => {
      const r = await sb().from("skr_gatlisti_svor").upsert([{ skraning_id: s.id, atridi_id: id, hakad, hakad_af: af, hakad_at: new Date().toISOString() }], { onConflict: "skraning_id,atridi_id" });
      if (r.error) throw new Error(r.error.message);
    });
  };
  const vistaLysingu = () => { if (s && lysing !== (s.lysing || "")) uppfaera({ lysing: lysing || null }, "texti", { texti: lysing }); };
  const baetaMyndum = (files: File[]) => {
    if (!files.length) return;
    if (!s) { setNyjarMyndir((m) => [...m, ...files]); return; }
    breyta(async (af) => {
      const stig = s.stada === "done" ? "eftir" : "fyrir";
      await vistaMyndir(s.verk_id, s.id, files, stig, af);
      await sb().from("skr_atburdir").insert({ skraning_id: s.id, hvad: "mynd", hver: af, gogn: { stig, n: files.length } });
      await hladaSvorOgMyndir();
    });
  };
  const fela = () => {
    if (!s || !window.confirm(`Fela skráningu #${s.radnr}? Hún hverfur af teikningunni en er ekki eytt.`)) return;
    breyta(async (af) => {
      const r = await sb().from("skr_skraningar").update({ eytt: true }).eq("id", s.id); if (r.error) throw new Error(r.error.message);
      await sb().from("skr_atburdir").insert({ skraning_id: s.id, hvad: "eytt", hver: af });
    }).then((ok) => { if (ok) onFalid(); });
  };

  // vista nýja skráningu (sama leið og Vinna; án nets fer hún í biðröðina í símanum)
  const vistaNyja = async () => {
    if (!nyr) return;
    if (!flokkur) { setVilla("Veldu flokk (stærð) fyrst."); setValmynd("flokkur"); return; }
    setBusy(true); setVilla(null);
    const radnr = allar.reduce((m, r) => Math.max(m, r.radnr), 0) + 1;
    const p = { verk_id: verk.id, teikning_id: nyr.teikning_id, x_px: nyr.x, y_px: nyr.y, flokkur_id: flokkur, efni: [...efni], lysing: lysing.trim() || null, starfsm: starfsmNr, myndir: nyjarMyndir, radnr };
    try {
      const id = await vistaNyjanPunkt(p);
      if (nyr.fra) await sb().from("skr_atburdir").insert({ skraning_id: id, hvad: "afrit", gogn: { fra: nyr.fra.radnr } });
      onVistad(id);
    } catch (e) {
      if (erNetvilla(e) && bidrod.studd()) {
        const b: BidPunktur = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, verk_id: p.verk_id, teikning_id: p.teikning_id, x_px: p.x_px, y_px: p.y_px, flokkur_id: p.flokkur_id,
          efni: p.efni, lysing: p.lysing, starfsm: p.starfsm, myndir: p.myndir.map((f) => ({ blob: f, name: f.name, lastModified: f.lastModified })), stofnad: new Date().toISOString() };
        await bidrod.setja(b);
        onVistad(null);
      } else setVilla(String((e as Error).message || e));
    } finally { setBusy(false); }
  };

  const fl = flokkar.find((f) => f.id === flokkur);
  const mNafn = (() => { const m = menn.find((x) => String(x.numer ?? "") === starfsmNr); return m ? `${m.numer}. ${m.nafn || `Starfsmaður ${m.numer}`}` : null; })();
  const brunamot = atridi.filter((a) => a.hopur === "brunamotstada"), efniL = atridi.filter((a) => a.hopur !== "brunamotstada");
  const hakadNofn = atridi.filter((a) => efni.has(a.id)).map((a) => a.atridi);
  const nyjarSlodir = useMemo(() => nyjarMyndir.map((f) => URL.createObjectURL(f)), [nyjarMyndir]);
  useEffect(() => () => nyjarSlodir.forEach((u) => URL.revokeObjectURL(u)), [nyjarSlodir]);
  const vidhengi = [...myndir.map((m) => ({ k: `m${m.id}`, src: publicUrl(m.path) })), ...nyjarSlodir.map((u, i) => ({ k: `n${i}`, src: u }))];

  return (
    <div className="sm-skjar sm-skraning">
      <Haus titill={verk.heiti.replace(/\s*·\s*gatakort\s*$/i, "")} onBack={onBack} />
      <div className="sm-skr-efni">
        <div className="sm-hver">
          <Ikon n="madur" />
          <span><b>Brunahólf ehf{s ? (nafn(s.stofnad_af) ? `, ${nafn(s.stofnad_af)}` : "") : ""}</b>
            <small>{s ? `Skráð ${s.framkvaemt_fra || s.created_at.slice(0, 10)}${teikning ? ` · ${teikning.haed || teikning.heiti}` : ""}` : `Ný skráning${teikning ? ` · ${teikning.haed || teikning.heiti}` : ""}`}</small></span>
          {s && s.teikning_id && <button type="button" className="sm-skoda" onClick={() => onSkoda(s)}>Skoða</button>}
        </div>
        <button type="button" className="sm-reitur sm-reitur-flokkur" onClick={() => setValmynd("flokkur")}><Ikon n="flokkur" /><b>{fl ? fl.heiti : "Veldu flokk (stærð)"}</b></button>
        <button type="button" className="sm-reitur" onClick={() => setValmynd("starfsm")}><Ikon n="flokkur" /><span>{mNafn || "Veldu starfsmann"}</span></button>
        <div className="sm-reitur-rod">
          <button type="button" className="sm-reitur" onClick={() => setValmynd("gatlisti")}><Ikon n="gatlisti" /><span>Brunaþéttingar / Fireproofing{hakadNofn.length ? <small>{hakadNofn.join(" · ")}</small> : null}</span></button>
          <button type="button" className="sm-gatlisti-takki" aria-label="Gátlisti" onClick={() => setValmynd("gatlisti")}><Ikon n="gatlisti-stort" /></button>
        </div>
        <div className="sm-lysing">
          <textarea placeholder="Skrifaðu lýsingu" value={lysing} onChange={(e) => setLysing(e.target.value)} onBlur={vistaLysingu} rows={5} />
          <div className="sm-lysing-ikon">
            <label aria-label="Mynd úr safni"><Ikon n="safn" /><input type="file" accept="image/*" multiple onChange={(e) => { baetaMyndum([...(e.target.files || [])]); e.target.value = ""; }} /></label>
            <label aria-label="Taka mynd"><Ikon n="myndavel" /><input type="file" accept="image/*" capture="environment" onChange={(e) => { baetaMyndum([...(e.target.files || [])]); e.target.value = ""; }} /></label>
          </div>
        </div>
        {vidhengi.length > 0 && (
          <div className="sm-myndir">{vidhengi.map((v) => <button type="button" key={v.k} onClick={() => setStor(v.src)}><img src={v.src} alt="" /></button>)}</div>
        )}
        {villa && <p className="sm-villa">{villa}</p>}
      </div>

      {s ? (
        <>
          <StoduHaus s={s} starfsm={starfsm} onBreytt={onBreytt} />
          <nav className="sm-nedri sm-skr-stika">
            <button type="button" onClick={() => setValmynd("saga")}><Ikon n="saga" /><span>Saga</span></button>
            <button type="button" onClick={() => onAfrita(s)} disabled={!s.teikning_id}><Ikon n="afrita" /><span>Afrita</span></button>
            <button type="button" onClick={fela} disabled={busy}><Ikon n="fela" /><span>Fela</span></button>
            <button type="button" onClick={() => setValmynd("meira")}><b className="sm-hash">⋮</b><span>Meira</span></button>
          </nav>
        </>
      ) : (
        <div className="sm-vista-stika">
          <span>{nyr?.fra ? `Afrit af #${nyr.fra.radnr}` : "Ný skráning"}{starfsmNr ? "" : " · enginn starfsmaður valinn"}</span>
          <button type="button" onClick={vistaNyja} disabled={busy}>{busy ? "Vista…" : "Vista skráningu"}</button>
        </div>
      )}

      {valmynd === "flokkur" && (
        <Blad titill="Breyta flokki" onLoka={() => setValmynd(null)}>
          {flokkar.map((f) => <button type="button" key={f.id} className={`sm-val ${f.id === flokkur ? "on" : ""}`} onClick={() => veljaFlokk(f.id)}><span>{f.heiti}</span><i className="sm-radio" aria-hidden /></button>)}
        </Blad>
      )}
      {valmynd === "starfsm" && (
        <Blad titill="Breyta starfsmanni" onLoka={() => setValmynd(null)}>
          {menn.map((m) => <button type="button" key={m.id} className={`sm-val ${String(m.numer ?? "") === starfsmNr ? "on" : ""}`} onClick={() => veljaStarfsm(String(m.numer ?? ""))}><span>{m.numer}. {m.nafn || `Starfsmaður ${m.numer}`}</span><i className="sm-radio" aria-hidden /></button>)}
        </Blad>
      )}
      {valmynd === "gatlisti" && (
        <Blad titill="Gátlisti" onLoka={() => setValmynd(null)}>
          <div className="sm-gat-haus">Brunaþéttingar / Fireproofing</div>
          {[["Brunamótstaða", brunamot], ["Efni og annað", efniL]].map(([h, listi]) => (listi as Atridi[]).length ? (
            <div key={h as string}>
              <div className="sm-gat-undir">{h as string}</div>
              {(listi as Atridi[]).map((a) => (
                <label key={a.id} className={`sm-gat ${efni.has(a.id) ? "on" : ""}`}>
                  <span>{a.atridi}</span><input type="checkbox" checked={efni.has(a.id)} onChange={() => hakaVid(a.id)} />
                </label>
              ))}
            </div>
          ) : null)}
        </Blad>
      )}
      {valmynd === "saga" && s && <Saga s={s} starfsm={starfsm} nafn={nafn} onLoka={() => setValmynd(null)} />}
      {valmynd === "meira" && s && (
        <Blad titill={`QA #${s.radnr}`} onLoka={() => setValmynd(null)}>
          <button type="button" className="sm-val" disabled={!s.teikning_id} onClick={() => { setValmynd(null); onFaera(s); }}><span>Færa á teikningu</span><i className="sm-ör" aria-hidden>›</i></button>
          {s.teikning_id && <a className="sm-val" href={`/kjarni/skraning/prenta?verk=${s.verk_id}&teikning=${s.teikning_id}`}><span>Prenta hæðarskýrslu</span><i className="sm-ör" aria-hidden>›</i></a>}
        </Blad>
      )}
      {stor && <div className="sm-stor" onClick={() => setStor(null)}><img src={stor} alt="" /></div>}
    </div>
  );
}

/* ---- saga og athugasemdir (= Ajour „Comments") */
function Saga({ s, starfsm, nafn, onLoka }: { s: Skraning; starfsm: string; nafn: (id: number | null) => string | null; onLoka: () => void }) {
  const [log, setLog] = useState<Atburdur[] | null>(null);
  const [ath, setAth] = useState("");
  const hlada = useCallback(() => {
    sb().from("skr_atburdir").select("id,hvad,gogn,hver,hvenaer").eq("skraning_id", s.id).order("hvenaer", { ascending: false }).then((r) => setLog((r.data || []) as Atburdur[]));
  }, [s.id]);
  useEffect(() => { hlada(); }, [hlada]);
  const senda = async () => {
    const t = ath.trim(); if (!t) return;
    const af = await starfsmId(starfsm);
    const r = await sb().from("skr_atburdir").insert({ skraning_id: s.id, hvad: "athugasemd", hver: af, gogn: { texti: t } });
    if (!r.error) { setAth(""); hlada(); }
  };
  return (
    <Blad titill={`Saga · QA #${s.radnr}`} onLoka={onLoka}>
      <div className="sm-ath">
        <input type="text" placeholder="Skrifa athugasemd" value={ath} onChange={(e) => setAth(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") senda(); }} />
        <button type="button" onClick={senda} disabled={!ath.trim()}>Senda</button>
      </div>
      {log === null ? <p className="sm-tomt">Hleð…</p> : log.length === 0 ? <p className="sm-tomt">Engin saga enn.</p> : log.map((a) => (
        <div key={a.id} className="sm-saga">
          <b>{LOG[a.hvad] || a.hvad}</b>
          <small>{new Date(a.hvenaer).toLocaleString("is-IS", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}{nafn(a.hver) ? ` · ${nafn(a.hver)}` : ""}</small>
          {a.gogn && typeof a.gogn.texti === "string" && <span>„{a.gogn.texti}"</span>}
          {a.gogn && typeof a.gogn.stada === "string" && <span>→ {STADA[a.gogn.stada] || a.gogn.stada}</span>}
        </div>
      ))}
    </Blad>
  );
}

/* ---- „Fara á #" */
function FaraA({ onLoka, onFara }: { onLoka: () => void; onFara: (n: number) => string | null }) {
  const [n, setN] = useState("");
  const [villa, setVilla] = useState<string | null>(null);
  const fara = () => { const t = Number(n.replace(/\D/g, "")); if (!t) return; setVilla(onFara(t)); };
  return (
    <Blad titill="Fara á skráningu" onLoka={onLoka}>
      <div className="sm-ath">
        <input type="tel" inputMode="numeric" placeholder="Númer, t.d. 1042" value={n} autoFocus onChange={(e) => setN(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") fara(); }} />
        <button type="button" onClick={fara}>Opna</button>
      </div>
      {villa && <p className="sm-villa">{villa}</p>}
    </Blad>
  );
}

/* ============================================================ smáhlutir */
function Haus({ titill, onBack, onSync, saekir }: { titill: string; onBack: () => void; onSync?: () => void; saekir?: boolean }) {
  return (
    <header className="sm-haus">
      <button type="button" className="sm-ikon" aria-label="Til baka" onClick={onBack}><Ikon n="bakk" /></button>
      <h1>{titill}</h1>
      {onSync ? <button type="button" className={`sm-ikon ${saekir ? "snyst" : ""}`} aria-label="Sækja aftur" onClick={onSync}><Ikon n="sync" /></button> : <span className="sm-ikon" />}
    </header>
  );
}
function Blad({ titill, onLoka, children }: { titill: string; onLoka: () => void; children: React.ReactNode }) {
  return (
    <div className="sm-blad-bak" onClick={onLoka}>
      <div className="sm-blad" role="dialog" aria-label={titill} onClick={(e) => e.stopPropagation()}>
        <div className="sm-blad-haus"><button type="button" className="sm-ikon" aria-label="Til baka" onClick={onLoka}><Ikon n="bakk" /></button><h2>{titill}</h2></div>
        <div className="sm-blad-efni">{children}</div>
      </div>
    </div>
  );
}
function Ikon({ n }: { n: string }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (n) {
    case "valmynd": return <svg viewBox="0 0 24 24" width="26" height="26" {...p}><path d="M4 7h16M4 12h16M4 17h16" /></svg>;
    case "bakk": return <svg viewBox="0 0 24 24" width="26" height="26" {...p}><path d="M20 12H5M11 6l-6 6 6 6" /></svg>;
    case "sync": return <svg viewBox="0 0 24 24" width="26" height="26" {...p}><path d="M20 11a8 8 0 0 0-14.3-4.7M4 13a8 8 0 0 0 14.3 4.7" /><path d="M5 3v4h4M19 21v-4h-4" /></svg>;
    case "listi": return <svg viewBox="0 0 24 24" width="24" height="24" {...p}><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" /></svg>;
    case "sia": return <svg viewBox="0 0 24 24" width="22" height="22" {...p}><path d="M3 4h18l-7 8v6l-4 2v-8Z" /></svg>;
    case "flokkur": return <svg viewBox="0 0 24 24" width="22" height="22" {...p}><rect x="4" y="4" width="6" height="6" /><rect x="14" y="4" width="6" height="6" /><rect x="4" y="14" width="6" height="6" /><rect x="14" y="14" width="6" height="6" /></svg>;
    case "gatlisti": return <svg viewBox="0 0 24 24" width="22" height="22" {...p}><path d="M4 6l1.5 1.5L8 5M4 12l1.5 1.5L8 11M11 6h9M11 12h9M11 18h9M5 18h.01" /></svg>;
    case "gatlisti-stort": return <svg viewBox="0 0 24 24" width="34" height="34" {...p}><path d="M3 6l1.5 1.5L7 5M3 12l1.5 1.5L7 11M10 6h11M10 12h11M10 18h11M4 18h.01" /></svg>;
    case "madur": return <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7Z" /></svg>;
    case "safn": return <svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M5 17l4.5-5.5 3.5 4 2.5-3L19 17Z" fill="#fff" /><circle cx="16.5" cy="8.5" r="1.5" fill="#fff" /></svg>;
    case "myndavel": return <svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor"><path d="M4 7h3l2-3h6l2 3h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" /><circle cx="12" cy="13" r="3.6" fill="#fff" /></svg>;
    case "saga": return <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H8l-4 4Z" /><path d="M7 8h10M7 12h7" stroke="#fff" strokeWidth="1.8" /></svg>;
    case "afrita": return <svg viewBox="0 0 24 24" width="24" height="24" {...p}><rect x="8" y="8" width="12" height="12" rx="1" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></svg>;
    case "fela": return <svg viewBox="0 0 24 24" width="24" height="24" {...p}><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c5 0 9 4.5 10 7a13 13 0 0 1-2.6 3.6M6.1 6.1A13 13 0 0 0 2 12c1 2.5 5 7 10 7a9.8 9.8 0 0 0 5-1.3" /></svg>;
    case "midja": return <svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor"><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" /></svg>;
    case "pinni": return <svg viewBox="0 0 24 32" width="40" height="52"><path d="M12 1C6 1 1.5 5.5 1.5 11.3 1.5 19 12 31 12 31s10.5-12 10.5-19.7C22.5 5.5 18 1 12 1Z" fill="#f6b93b" stroke="#c98a10" strokeWidth="1.2" /><circle cx="12" cy="11" r="4.2" fill="#fff" /></svg>;
    default: return null;
  }
}
