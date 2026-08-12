"use client";

import { useState, type FormEvent } from "react";
import { sbRpc, sbSelect } from "../lib/supabase";
import { SidurEditor } from "../SidurEditor";
import { ValmyndEditor } from "../ValmyndEditor";

type Inquiry = {
  id: number;
  buid_til: string;
  nafn: string;
  netfang: string;
  simi: string;
  skilabod: string;
};
type Line = { id: string; nafn: string; fjoldi: number; verd: number };
type Order = {
  id: number;
  buid_til: string;
  nafn: string;
  netfang: string;
  simi: string;
  heimilisfang: string;
  karfa: Line[];
  samtals: number;
  stada: string;
};
type Setting = { lykill: string; gildi: string };

const kr = (n: number) =>
  Math.round(n || 0)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".") + " kr";

export default function StjornClient() {
  const [secret, setSecret] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [err, setErr] = useState("");

  const [bordiOn, setBordiOn] = useState(false);
  const [bordiText, setBordiText] = useState("");
  const [analyticsOn, setAnalyticsOn] = useState(true);
  const [pixelId, setPixelId] = useState("");
  const [chatOn, setChatOn] = useState(false);
  const [chatId, setChatId] = useState("");

  const [inq, setInq] = useState<Inquiry[]>([]);
  const [pantanir, setPantanir] = useState<Order[]>([]);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function openPanel(e: FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      const ok = await sbRpc<string>("kjarni_set_stilling", {
        p_lykill: "sidast_innskrad",
        p_gildi: new Date().toISOString(),
        p_leyni: secret,
      });
      if (ok !== "ok") {
        setErr("Rangt leyniorð.");
        return;
      }
      const rows = await sbSelect<Setting[]>("kjarni_stillingar?select=lykill,gildi");
      const g = (k: string) => rows.find((x) => x.lykill === k)?.gildi ?? "";
      setBordiOn(g("bordi_virkur") === "true");
      setBordiText(g("bordi_texti"));
      setAnalyticsOn(g("analytics_virk") !== "false");
      setPixelId(g("pixel_id"));
      setChatOn(g("chat_virkt") === "true");
      setChatId(g("chat_id"));
      const list = await sbRpc<Inquiry[]>("kjarni_get_fyrirspurnir", { p_leyni: secret });
      setInq(Array.isArray(list) ? list : []);
      const orders = await sbRpc<Order[]>("kjarni_get_pantanir", { p_leyni: secret });
      setPantanir(Array.isArray(orders) ? orders : []);
      setUnlocked(true);
    } catch {
      setErr("Villa við tengingu.");
    }
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    const set = (k: string, v: string) =>
      sbRpc("kjarni_set_stilling", { p_lykill: k, p_gildi: v, p_leyni: secret });
    try {
      await set("bordi_virkur", bordiOn ? "true" : "false");
      await set("bordi_texti", bordiText);
      await set("analytics_virk", analyticsOn ? "true" : "false");
      await set("pixel_id", pixelId.trim());
      await set("chat_virkt", chatOn ? "true" : "false");
      await set("chat_id", chatId.trim());
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  if (!unlocked) {
    return (
      <div className="stjorn-gate">
        <h1>Stjórnborð</h1>
        <p>Sláðu inn leyniorð til að stjórna versluninni.</p>
        <form onSubmit={openPanel}>
          <input
            type="password"
            placeholder="Leyniorð"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
          />
          <button className="btn" type="submit">Opna</button>
        </form>
        {err && <p className="form-err" style={{ color: "var(--red)" }}>{err}</p>}
      </div>
    );
  }

  return (
    <div className="stjorn">
      <header className="stjorn-top">
        <h1>Stjórnborð</h1>
        <a className="stjorn-link" href="/verslun">Skoða verslun →</a>
      </header>

      <section className="stj-card">
        <h2>Tilkynningaborði</h2>
        <p className="stj-sub">Birtist efst á síðunni þegar kveikt er á honum.</p>
        <label className="stj-toggle">
          <input type="checkbox" checked={bordiOn} onChange={(e) => setBordiOn(e.target.checked)} />
          <span>{bordiOn ? "Kveikt" : "Slökkt"}</span>
        </label>
        <textarea
          rows={2}
          value={bordiText}
          onChange={(e) => setBordiText(e.target.value)}
          placeholder="Texti borðans"
        />
      </section>

      <section className="stj-card">
        <h2>Verkfæri</h2>
        <p className="stj-sub">Kveiktu á tólum og límdu inn auðkenni frá þjónustunum.</p>
        <label className="stj-toggle">
          <input type="checkbox" checked={analyticsOn} onChange={(e) => setAnalyticsOn(e.target.checked)} />
          <span>Vefmælingar · Vercel Analytics</span>
        </label>
        <label className="stj-field">
          <span>Meta Pixel auðkenni (fyrir Facebook/Instagram auglýsingar)</span>
          <input value={pixelId} onChange={(e) => setPixelId(e.target.value)} placeholder="t.d. 123456789012345" />
        </label>
        <label className="stj-toggle">
          <input type="checkbox" checked={chatOn} onChange={(e) => setChatOn(e.target.checked)} />
          <span>Netspjall · Tawk.to</span>
        </label>
        <label className="stj-field">
          <span>Tawk.to auðkenni</span>
          <input value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder="t.d. 65f1a.../1abcd2efg" />
        </label>
      </section>

      <div className="stj-savebar">
        <button className="btn" onClick={save} disabled={saving}>
          {saving ? "Vista…" : "Vista breytingar"}
        </button>
        {saved && <span className="stj-saved">Vistað ✓</span>}
      </div>

      <SidurEditor secret={secret} />
      <ValmyndEditor secret={secret} />

      <section className="stj-card">
        <h2>Pantanir ({pantanir.length})</h2>
        {pantanir.length === 0 ? (
          <p className="stj-sub">Engar pantanir enn.</p>
        ) : (
          <div className="stj-inq">
            {pantanir.map((o) => (
              <div className="inq" key={o.id}>
                <div className="inq-head">
                  <b>{o.nafn || "—"} · {kr(o.samtals)}</b>
                  <span>{new Date(o.buid_til).toLocaleString("is-IS")}</span>
                </div>
                <div className="inq-meta">
                  {o.netfang}
                  {o.simi ? " · " + o.simi : ""}
                  {o.heimilisfang ? " · " + o.heimilisfang : ""}
                </div>
                <ul className="ord-lines">
                  {(o.karfa || []).map((l, i) => (
                    <li key={i}>
                      {l.fjoldi}× {l.nafn} — {kr(l.verd * l.fjoldi)}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="stj-card">
        <h2>Fyrirspurnir ({inq.length})</h2>
        {inq.length === 0 ? (
          <p className="stj-sub">Engar fyrirspurnir enn.</p>
        ) : (
          <div className="stj-inq">
            {inq.map((i) => (
              <div className="inq" key={i.id}>
                <div className="inq-head">
                  <b>{i.nafn || "—"}</b>
                  <span>{new Date(i.buid_til).toLocaleString("is-IS")}</span>
                </div>
                <div className="inq-meta">
                  {i.netfang}
                  {i.simi ? " · " + i.simi : ""}
                </div>
                {i.skilabod && <p className="inq-msg">{i.skilabod}</p>}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
