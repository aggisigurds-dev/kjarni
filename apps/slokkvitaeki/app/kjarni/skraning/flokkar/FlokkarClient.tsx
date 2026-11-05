"use client";

/* Categories/schema eins og í Ajour (Project Setup - Categories), en einfaldara:
 *   · Flokkar (= Ajour CategoryGroup = verðskrárlínur): heiti, tegund, mm-bil, röð, virkt
 *   · Gátlisti (= Ajour ControlSchema): atriði í hópunum brunamótstaða / efni / mynd / annað
 *   · Starfsmenn (= Ajour Category „Starfsmaður N"): númer + nafn, virkur
 * Sjálfgefið sniðmát (verk_id null) gildir fyrir öll verk; velja má verk og bæta við sérflokkum þess.
 * Ekkert er eytt — aðeins slökkt (virkt=false) svo eldri skráningar haldi tilvísunum. */

import { useEffect, useMemo, useState } from "react";
import { sb } from "../lib/sb";

type Verk = { id: number; heiti: string };
type Flokkur = { id: number; verk_id: number | null; heiti: string; tegund: string; mm_fra: number | null; mm_til: number | null; rod: number; virkt: boolean };
type Atridi = { id: number; verk_id: number | null; atridi: string; hopur: string | null; rod: number; virkt: boolean };
type Starfsm = { id: number; numer: number | null; nafn: string | null; virkur: boolean };

const TEGUNDIR = [["gat", "Gat (Ø)"], ["bordi", "Borði"], ["lina", "Línuþétting"], ["punktur", "Punktur"], ["annad", "Annað"]] as const;
const HOPAR = [["brunamotstada", "Brunamótstaða"], ["efni", "Efni"], ["mynd", "Mynd"], ["annad", "Annað"]] as const;

export default function FlokkarClient() {
  const [verk, setVerk] = useState<Verk[]>([]);
  const [verkId, setVerkId] = useState<number | null>(null);
  const [flokkar, setFlokkar] = useState<Flokkur[]>([]);
  const [atridi, setAtridi] = useState<Atridi[]>([]);
  const [menn, setMenn] = useState<Starfsm[]>([]);
  const [villa, setVilla] = useState<string | null>(null);
  const [tab, setTab] = useState<"flokkar" | "gatlisti" | "menn">("flokkar");
  const [nyF, setNyF] = useState({ heiti: "", tegund: "gat", mm_fra: "", mm_til: "" });
  const [nyA, setNyA] = useState({ atridi: "", hopur: "efni" });
  const [nyM, setNyM] = useState({ numer: "", nafn: "" });

  const hlada = async () => {
    const s = sb();
    const [v, f, a, m] = await Promise.all([
      s.from("skr_verk").select("id,heiti").eq("eytt", false).order("heiti"),
      s.from("skr_flokkar").select("id,verk_id,heiti,tegund,mm_fra,mm_til,rod,virkt").order("rod"),
      s.from("skr_gatlisti").select("id,verk_id,atridi,hopur,rod,virkt").order("rod"),
      s.from("skr_starfsmenn").select("id,numer,nafn,virkur").order("numer"),
    ]);
    const err = v.error || f.error || a.error || m.error;
    if (err) { setVilla(err.message); return; }
    setVerk(v.data as Verk[]); setFlokkar(f.data as Flokkur[]); setAtridi(a.data as Atridi[]); setMenn(m.data as Starfsm[]);
  };
  useEffect(() => { hlada(); }, []);

  const fl = useMemo(() => flokkar.filter((x) => x.verk_id === verkId), [flokkar, verkId]);
  const at = useMemo(() => atridi.filter((x) => x.verk_id === verkId), [atridi, verkId]);
  const upd = async (tafla: string, id: number, patch: Record<string, unknown>) => {
    const r = await sb().from(tafla).update(patch).eq("id", id);
    if (r.error) { setVilla(r.error.message); return false; }
    await hlada(); return true;
  };
  const ins = async (tafla: string, row: Record<string, unknown>) => {
    const r = await sb().from(tafla).insert(row);
    if (r.error) { setVilla(r.error.message); return false; }
    await hlada(); return true;
  };
  const faera = async (tafla: string, listi: { id: number; rod: number }[], id: number, att: -1 | 1) => {
    const i = listi.findIndex((x) => x.id === id); const j = i + att;
    if (i < 0 || j < 0 || j >= listi.length) return;
    const a = listi[i], b = listi[j];
    const ra = a.rod === b.rod ? b.rod + att : b.rod, rb = a.rod === b.rod ? a.rod : a.rod;
    await sb().from(tafla).update({ rod: ra }).eq("id", a.id);
    await sb().from(tafla).update({ rod: rb }).eq("id", b.id);
    await hlada();
  };

  return (
    <div className="vn fk">
      <div className="fk-haus">
        <h1>Categories/schema</h1>
        <label>Gildir fyrir
          <select className="aj-sel" value={verkId ?? ""} onChange={(e) => setVerkId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Sjálfgefið sniðmát (öll verk)</option>
            {verk.map((v) => <option key={v.id} value={v.id}>{v.heiti} — sérflokkar</option>)}
          </select>
        </label>
        <div className="fk-tabs">
          <button type="button" className={tab === "flokkar" ? "on" : ""} onClick={() => setTab("flokkar")}>Flokkar <b>{fl.filter((x) => x.virkt).length}</b></button>
          <button type="button" className={tab === "gatlisti" ? "on" : ""} onClick={() => setTab("gatlisti")}>Gátlisti <b>{at.filter((x) => x.virkt).length}</b></button>
          <button type="button" className={tab === "menn" ? "on" : ""} onClick={() => setTab("menn")}>Starfsmenn <b>{menn.filter((x) => x.virkur).length}</b></button>
        </div>
      </div>
      {villa && <p className="skr-villa">{villa}</p>}

      {tab === "flokkar" && (
        <section className="aj-panel">
          <h3>Flokkar <small>— stærðarflokkar sem starfsmaður velur; sama heiti og verðskrárlínan (hole_size_rates)</small></h3>
          <table className="skr-tafla fk-tafla">
            <thead><tr><th>Röð</th><th>Heiti</th><th>Tegund</th><th className="t">mm frá</th><th className="t">mm til</th><th>Virkt</th></tr></thead>
            <tbody>
              {fl.map((x) => (
                <tr key={x.id} className={x.virkt ? "" : "af"}>
                  <td className="fk-rod"><button type="button" onClick={() => faera("skr_flokkar", fl, x.id, -1)}>▲</button><button type="button" onClick={() => faera("skr_flokkar", fl, x.id, 1)}>▼</button></td>
                  <td><input type="text" defaultValue={x.heiti} onBlur={(e) => e.target.value.trim() && e.target.value !== x.heiti && upd("skr_flokkar", x.id, { heiti: e.target.value.trim() })} /></td>
                  <td><select value={x.tegund} onChange={(e) => upd("skr_flokkar", x.id, { tegund: e.target.value })}>{TEGUNDIR.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td>
                  <td className="t"><input type="number" className="fk-mm" defaultValue={x.mm_fra ?? ""} onBlur={(e) => upd("skr_flokkar", x.id, { mm_fra: e.target.value === "" ? null : Number(e.target.value) })} /></td>
                  <td className="t"><input type="number" className="fk-mm" defaultValue={x.mm_til ?? ""} onBlur={(e) => upd("skr_flokkar", x.id, { mm_til: e.target.value === "" ? null : Number(e.target.value) })} /></td>
                  <td><input type="checkbox" checked={x.virkt} onChange={(e) => upd("skr_flokkar", x.id, { virkt: e.target.checked })} /></td>
                </tr>
              ))}
              <tr className="fk-ny">
                <td>+</td>
                <td><input type="text" placeholder="Nýr flokkur, t.d. Gat Ø1300-1399" value={nyF.heiti} onChange={(e) => setNyF({ ...nyF, heiti: e.target.value })} /></td>
                <td><select value={nyF.tegund} onChange={(e) => setNyF({ ...nyF, tegund: e.target.value })}>{TEGUNDIR.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td>
                <td className="t"><input type="number" className="fk-mm" value={nyF.mm_fra} onChange={(e) => setNyF({ ...nyF, mm_fra: e.target.value })} /></td>
                <td className="t"><input type="number" className="fk-mm" value={nyF.mm_til} onChange={(e) => setNyF({ ...nyF, mm_til: e.target.value })} /></td>
                <td><button type="button" className="aj-primary" disabled={!nyF.heiti.trim()} onClick={async () => { if (await ins("skr_flokkar", { verk_id: verkId, heiti: nyF.heiti.trim(), tegund: nyF.tegund, mm_fra: nyF.mm_fra === "" ? null : Number(nyF.mm_fra), mm_til: nyF.mm_til === "" ? null : Number(nyF.mm_til), rod: (fl.at(-1)?.rod ?? 0) + 10 })) setNyF({ heiti: "", tegund: "gat", mm_fra: "", mm_til: "" }); }}>Bæta við</button></td>
              </tr>
            </tbody>
          </table>
        </section>
      )}

      {tab === "gatlisti" && (
        <section className="aj-panel">
          <h3>Gátlisti <small>— hakað við í skráningu; brunamótstaða og efni notað</small></h3>
          <table className="skr-tafla fk-tafla">
            <thead><tr><th>Röð</th><th>Atriði</th><th>Hópur</th><th>Virkt</th></tr></thead>
            <tbody>
              {at.map((x) => (
                <tr key={x.id} className={x.virkt ? "" : "af"}>
                  <td className="fk-rod"><button type="button" onClick={() => faera("skr_gatlisti", at, x.id, -1)}>▲</button><button type="button" onClick={() => faera("skr_gatlisti", at, x.id, 1)}>▼</button></td>
                  <td><input type="text" defaultValue={x.atridi} onBlur={(e) => e.target.value.trim() && e.target.value !== x.atridi && upd("skr_gatlisti", x.id, { atridi: e.target.value.trim() })} /></td>
                  <td><select value={x.hopur || "annad"} onChange={(e) => upd("skr_gatlisti", x.id, { hopur: e.target.value })}>{HOPAR.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td>
                  <td><input type="checkbox" checked={x.virkt} onChange={(e) => upd("skr_gatlisti", x.id, { virkt: e.target.checked })} /></td>
                </tr>
              ))}
              <tr className="fk-ny">
                <td>+</td>
                <td><input type="text" placeholder="Nýtt atriði, t.d. Steinull 100 mm" value={nyA.atridi} onChange={(e) => setNyA({ ...nyA, atridi: e.target.value })} /></td>
                <td><select value={nyA.hopur} onChange={(e) => setNyA({ ...nyA, hopur: e.target.value })}>{HOPAR.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td>
                <td><button type="button" className="aj-primary" disabled={!nyA.atridi.trim()} onClick={async () => { if (await ins("skr_gatlisti", { verk_id: verkId, atridi: nyA.atridi.trim(), hopur: nyA.hopur, rod: (at.at(-1)?.rod ?? 0) + 10 })) setNyA({ atridi: "", hopur: "efni" }); }}>Bæta við</button></td>
              </tr>
            </tbody>
          </table>
        </section>
      )}

      {tab === "menn" && (
        <section className="aj-panel">
          <h3>Starfsmenn <small>— númerin úr Ajour („Starfsmaður N"); settu rétt nöfn svo starfsmaður velji sjálfan sig í símanum</small></h3>
          <table className="skr-tafla fk-tafla fk-menn">
            <thead><tr><th className="t">Nr.</th><th>Nafn</th><th>Virkur</th></tr></thead>
            <tbody>
              {menn.map((x) => (
                <tr key={x.id} className={x.virkur ? "" : "af"}>
                  <td className="t">{x.numer}</td>
                  <td><input type="text" defaultValue={x.nafn || ""} onBlur={(e) => e.target.value !== (x.nafn || "") && upd("skr_starfsmenn", x.id, { nafn: e.target.value.trim() || null })} /></td>
                  <td><input type="checkbox" checked={x.virkur} onChange={(e) => upd("skr_starfsmenn", x.id, { virkur: e.target.checked })} /></td>
                </tr>
              ))}
              <tr className="fk-ny">
                <td className="t"><input type="number" className="fk-mm" placeholder="nr" value={nyM.numer} onChange={(e) => setNyM({ ...nyM, numer: e.target.value })} /></td>
                <td><input type="text" placeholder="Nafn" value={nyM.nafn} onChange={(e) => setNyM({ ...nyM, nafn: e.target.value })} /></td>
                <td><button type="button" className="aj-primary" disabled={!nyM.numer} onClick={async () => { if (await ins("skr_starfsmenn", { numer: Number(nyM.numer), nafn: nyM.nafn.trim() || `Starfsmaður ${nyM.numer}`, fyrirtaeki_id: 1 })) setNyM({ numer: "", nafn: "" }); }}>Bæta við</button></td>
              </tr>
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
