"use client";

import { useState, type FormEvent } from "react";
import { sbRpc, sbSelect } from "../lib/supabase";

type Order = { id: number; buid_til: string; nafn: string; samtals: number };
type Inq = { id: number; buid_til: string; nafn: string; skilabod: string };
type Page = { id: number; slod: string; birt: boolean };

const kr = (n: number) => Math.round(n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") + " kr";
const MOD_COUNT = 9; // total available kerfi modules (excl. core Viðskiptavinir)

export default function MasterClient() {
  const [secret, setSecret] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [err, setErr] = useState("");

  const [orders, setOrders] = useState<Order[]>([]);
  const [inq, setInq] = useState<Inq[]>([]);
  const [sidur, setSidur] = useState<Page[]>([]);
  const [kKunnar, setKKunnar] = useState(0);
  const [kSolur, setKSolur] = useState<{ samtals: number }[]>([]);
  const [einingar, setEiningar] = useState<string[]>([]);

  async function openPanel(e: FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      const ok = await sbRpc<string>("kjarni_set_stilling", {
        p_lykill: "master_innskrad",
        p_gildi: new Date().toISOString(),
        p_leyni: secret,
      });
      if (ok !== "ok") { setErr("Rangt leyniorð."); return; }
      const [o, i, p, kk, ks, en] = await Promise.all([
        sbRpc<Order[]>("kjarni_get_pantanir", { p_leyni: secret }).catch(() => []),
        sbRpc<Inq[]>("kjarni_get_fyrirspurnir", { p_leyni: secret }).catch(() => []),
        sbRpc<Page[]>("kjarni_sidur_admin", { p_leyni: secret }).catch(() => []),
        sbSelect<{ id: number }[]>("kerfi_vidskiptavinir?select=id").catch(() => []),
        sbSelect<{ samtals: number }[]>("kerfi_solur?select=samtals").catch(() => []),
        sbSelect<{ gildi: string }[]>("kerfi_stillingar?select=gildi&lykill=eq.einingar").catch(() => []),
      ]);
      setOrders(Array.isArray(o) ? o : []);
      setInq(Array.isArray(i) ? i : []);
      setSidur(Array.isArray(p) ? p : []);
      setKKunnar(Array.isArray(kk) ? kk.length : 0);
      setKSolur(Array.isArray(ks) ? ks : []);
      try {
        const e2 = JSON.parse(en[0]?.gildi || "[]");
        setEiningar(Array.isArray(e2) ? e2.filter((x: string) => x !== "vidskiptavinir") : []);
      } catch {}
      setUnlocked(true);
    } catch {
      setErr("Villa við tengingu.");
    }
  }

  if (!unlocked) {
    return (
      <div className="ms-gate">
        <span className="ms-gate-badge">◉</span>
        <h1>Kjarni · Stjórnstöð</h1>
        <p>Master-bakendi platformsins. Sláðu inn leyniorð til að sjá alla vefi og kerfi á einum stað.</p>
        <form onSubmit={openPanel}>
          <input type="password" placeholder="Leyniorð" value={secret} onChange={(e) => setSecret(e.target.value)} />
          <button className="ms-btn" type="submit">Opna stjórnstöð</button>
        </form>
        {err && <p className="ms-err">{err}</p>}
      </div>
    );
  }

  const salesTotal = kSolur.reduce((s, x) => s + (x.samtals || 0), 0);
  const activity = [
    ...orders.map((o) => ({ t: "pöntun", nafn: o.nafn, sub: kr(o.samtals), when: o.buid_til })),
    ...inq.map((i) => ({ t: "fyrirspurn", nafn: i.nafn, sub: (i.skilabod || "").slice(0, 60), when: i.buid_til })),
  ].sort((a, b) => (b.when || "").localeCompare(a.when || "")).slice(0, 6);

  return (
    <div className="ms">
      <header className="ms-top">
        <div className="ms-top-l">
          <span className="ms-badge">◉</span>
          <div><h1>Kjarni · Stjórnstöð</h1><p>Master-bakendi — allir vefir og kerfi</p></div>
        </div>
      </header>

      <div className="ms-kpis">
        <div className="ms-kpi"><span>Vefir & kerfi</span><b>2</b></div>
        <div className="ms-kpi"><span>Pantanir</span><b>{orders.length}</b></div>
        <div className="ms-kpi"><span>Fyrirspurnir</span><b>{inq.length}</b></div>
        <div className="ms-kpi"><span>Kerfi-viðskiptavinir</span><b>{kKunnar}</b></div>
      </div>

      <h2 className="ms-h2">Vefir & kerfi</h2>
      <div className="ms-props">
        <div className="ms-prop">
          <div className="ms-prop-h">
            <span className="ms-prop-ico" style={{ background: "#e8551f" }}>🧯</span>
            <div><b>Slökkvitæki vefur</b><small>Vefverslun + kynningarsíða</small></div>
            <span className="ms-live">● Í loftinu</span>
          </div>
          <div className="ms-stats">
            <span><b>{sidur.length}</b> síður</span>
            <span><b>{orders.length}</b> pantanir</span>
            <span><b>{inq.length}</b> fyrirspurnir</span>
          </div>
          <div className="ms-links">
            <a href="/" target="_blank" rel="noreferrer">Forsíða ↗</a>
            <a href="/verslun" target="_blank" rel="noreferrer">Verslun ↗</a>
            <a className="ms-primary" href="/stjorn">Stjórnborð →</a>
          </div>
        </div>

        <div className="ms-prop">
          <div className="ms-prop-h">
            <span className="ms-prop-ico" style={{ background: "#0f1626" }}>🧩</span>
            <div><b>Kerfi — þjónustukerfi</b><small>Viðskiptavinir · búnaður · sala · verkstæði</small></div>
            <span className="ms-live">● Í loftinu</span>
          </div>
          <div className="ms-stats">
            <span><b>{kKunnar}</b> viðskiptavinir</span>
            <span><b>{einingar.length}</b>/{MOD_COUNT} einingar</span>
            <span><b>{kSolur.length}</b> sölur · {kr(salesTotal)}</span>
          </div>
          <div className="ms-links">
            <a className="ms-primary" href="/kerfi">Opna kerfi →</a>
            <a href="/kerfi" target="_blank" rel="noreferrer">Nýr gluggi ↗</a>
          </div>
        </div>

        <div className="ms-prop ms-add">
          <span className="ms-add-plus">+</span>
          <b>Nýr vefur eða kerfi</b>
          <small>Settu upp næsta þjónustufyrirtæki á sama grunni.</small>
        </div>
      </div>

      <h2 className="ms-h2">Nýjasta virknin</h2>
      <div className="ms-card">
        {activity.length === 0 ? (
          <p className="ms-empty">Engin virkni enn.</p>
        ) : (
          <div className="ms-act">
            {activity.map((a, i) => (
              <div className="ms-actrow" key={i}>
                <span className={`ms-chip ${a.t === "pöntun" ? "ord" : "inq"}`}>{a.t}</span>
                <span className="ms-act-nafn">{a.nafn || "—"}</span>
                <span className="ms-act-sub">{a.sub}</span>
                <span className="ms-act-when">{a.when ? new Date(a.when).toLocaleDateString("is-IS") : ""}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
