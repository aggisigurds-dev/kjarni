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

type TabId = "sidur" | "valmynd" | "verkfaeri" | "bordi" | "pantanir" | "fyrirspurnir";

export default function StjornClient() {
  const [secret, setSecret] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<TabId>("sidur");

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
        <span className="stjorn-gate-badge">B</span>
        <h1>Kjarni · Stjórnborð</h1>
        <p>Bakendi Brunahólf Slökkvitæki vefsins. Sláðu inn leyniorð til að stjórna síðum, valmynd, verkfærum og pöntunum.</p>
        <form onSubmit={openPanel}>
          <input
            type="password"
            placeholder="Leyniorð"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
          />
          <button className="btn" type="submit">Opna stjórnborð</button>
        </form>
        {err && <p className="form-err" style={{ color: "var(--red)" }}>{err}</p>}
      </div>
    );
  }

  const TABS: { id: TabId; icon: string; label: string; badge?: number }[] = [
    { id: "sidur", icon: "📄", label: "Síður" },
    { id: "valmynd", icon: "🧭", label: "Valmynd" },
    { id: "verkfaeri", icon: "🧰", label: "Verkfæri" },
    { id: "bordi", icon: "🔔", label: "Tilkynningaborði" },
    { id: "pantanir", icon: "📦", label: "Pantanir", badge: pantanir.length },
    { id: "fyrirspurnir", icon: "✉️", label: "Fyrirspurnir", badge: inq.length },
  ];

  const settingsSaveBar = (
    <div className="stj-savebar">
      <button className="btn" onClick={save} disabled={saving}>
        {saving ? "Vista…" : "Vista breytingar"}
      </button>
      {saved && <span className="stj-saved">Vistað ✓</span>}
    </div>
  );

  return (
    <div className="stjorn">
      <header className="stjorn-top">
        <div className="stjorn-top-l">
          <span className="stjorn-badge">B</span>
          <div>
            <h1>Kjarni · Stjórnborð</h1>
            <p>Brunahólf Slökkvitæki — bakendi vefsins</p>
          </div>
        </div>
        <div className="stjorn-top-r">
          <a className="stjorn-link" href="/" target="_blank" rel="noreferrer">Forsíða ↗</a>
          <a className="stjorn-link" href="/verslun" target="_blank" rel="noreferrer">Verslun ↗</a>
        </div>
      </header>

      <nav className="stj-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`stj-tab ${tab === t.id ? "on" : ""}`}
            onClick={() => setTab(t.id)}
          >
            <span aria-hidden="true">{t.icon}</span> {t.label}
            {t.badge ? <em>{t.badge}</em> : null}
          </button>
        ))}
      </nav>

      <div className="stj-body">
        {tab === "sidur" && (
          <>
            <div className="stj-intro">
              <h2>Síður</h2>
              <p>Búðu til nýjar síður og breyttu þeim sem til eru. Hver síða er byggð úr blokkum (hetja, texti, vörur, myndir, form …). Smelltu á <b>+ Ný síða</b>, dragðu til blokkir, og kveiktu á <b>Birt</b> þegar hún á að fara í loftið — hún birtist þá á <code>/slóð</code>.</p>
            </div>
            <SidurEditor secret={secret} />
          </>
        )}

        {tab === "valmynd" && (
          <>
            <div className="stj-intro">
              <h2>Valmynd</h2>
              <p>Stjórnaðu hlekkjunum efst á vefnum. Bættu við, endurraðaðu eða fjarlægðu — t.d. til að setja nýja síðu inn í efstu stikuna.</p>
            </div>
            <ValmyndEditor secret={secret} />
          </>
        )}

        {tab === "verkfaeri" && (
          <>
            <div className="stj-intro">
              <h2>Verkfæri</h2>
              <p>Kveiktu á tólum og límdu inn auðkenni frá þjónustunum. Mundu að ýta á <b>Vista breytingar</b> neðst.</p>
            </div>
            <section className="stj-card">
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
            {settingsSaveBar}
          </>
        )}

        {tab === "bordi" && (
          <>
            <div className="stj-intro">
              <h2>Tilkynningaborði</h2>
              <p>Skilaboð sem birtast efst á öllum síðum þegar kveikt er á honum — t.d. „Frí heimsending í þessari viku".</p>
            </div>
            <section className="stj-card">
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
            {settingsSaveBar}
          </>
        )}

        {tab === "pantanir" && (
          <section className="stj-card">
            <h2>Pantanir ({pantanir.length})</h2>
            {pantanir.length === 0 ? (
              <p className="stj-sub">Engar pantanir enn — þær birtast hér þegar viðskiptavinur klárar körfu í versluninni.</p>
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
        )}

        {tab === "fyrirspurnir" && (
          <section className="stj-card">
            <h2>Fyrirspurnir ({inq.length})</h2>
            {inq.length === 0 ? (
              <p className="stj-sub">Engar fyrirspurnir enn — skilaboð úr „Hafðu samband" forminu birtast hér.</p>
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
        )}
      </div>
    </div>
  );
}
