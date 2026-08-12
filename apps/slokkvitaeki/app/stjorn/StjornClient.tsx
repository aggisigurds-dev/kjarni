"use client";

import { useState, type FormEvent } from "react";
import { sbRpc, sbSelect } from "../lib/supabase";

type Inquiry = {
  id: number;
  buid_til: string;
  nafn: string;
  netfang: string;
  simi: string;
  skilabod: string;
};
type Setting = { lykill: string; gildi: string };

export default function StjornClient() {
  const [secret, setSecret] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [err, setErr] = useState("");
  const [bordiOn, setBordiOn] = useState(false);
  const [bordiText, setBordiText] = useState("");
  const [inq, setInq] = useState<Inquiry[]>([]);
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
      setBordiOn(rows.find((x) => x.lykill === "bordi_virkur")?.gildi === "true");
      setBordiText(rows.find((x) => x.lykill === "bordi_texti")?.gildi ?? "");
      const list = await sbRpc<Inquiry[]>("kjarni_get_fyrirspurnir", { p_leyni: secret });
      setInq(Array.isArray(list) ? list : []);
      setUnlocked(true);
    } catch {
      setErr("Villa við tengingu.");
    }
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      await sbRpc("kjarni_set_stilling", {
        p_lykill: "bordi_virkur",
        p_gildi: bordiOn ? "true" : "false",
        p_leyni: secret,
      });
      await sbRpc("kjarni_set_stilling", {
        p_lykill: "bordi_texti",
        p_gildi: bordiText,
        p_leyni: secret,
      });
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
        {err && <p className="form-err">{err}</p>}
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
        <div className="stj-actions">
          <button className="btn" onClick={save} disabled={saving}>
            {saving ? "Vista…" : "Vista breytingar"}
          </button>
          {saved && <span className="stj-saved">Vistað ✓</span>}
        </div>
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
