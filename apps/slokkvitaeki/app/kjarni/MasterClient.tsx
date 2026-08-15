"use client";

import { useState, type FormEvent } from "react";
import { SUPABASE_URL, SUPABASE_KEY, sbRpc, sbSelect } from "../lib/supabase";

type Order = { id: number; buid_til: string; nafn: string; samtals: number };
type Inq = { id: number; buid_til: string; nafn: string; skilabod: string };
type Page = { id: number; slod: string; birt: boolean };
type Site = { id: number; nafn: string; slug: string; tegund: string; stada: string };

const kr = (n: number) => Math.round(n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") + " kr";
const MOD_COUNT = 9;
const H = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" };

const ICE: Record<string, string> = { "á": "a", "é": "e", "í": "i", "ó": "o", "ú": "u", "ý": "y", "þ": "th", "æ": "ae", "ö": "o", "ð": "d" };
const slugify = (s: string) =>
  s.toLowerCase().split("").map((c) => ICE[c] ?? c).join("")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "vefur";

type GItem = { icon: string; nafn: string; desc?: string; tag: string; ready: boolean };
const GALLERY: { group: string; sub: string; items: GItem[] }[] = [
  {
    group: "Kerfi-einingar", sub: "Rekstrareiningar sem kveikt er á þrepaskipt í þjónustukerfinu",
    items: [
      { icon: "👥", nafn: "Viðskiptavinir", desc: "Viðskiptavinaskrá", tag: "Kerfi", ready: true },
      { icon: "🧯", nafn: "Búnaður", desc: "Tæki, staðsetning, raðnr.", tag: "Kerfi", ready: true },
      { icon: "📋", nafn: "Skoðanir", desc: "Skoðunardagatal", tag: "Kerfi", ready: true },
      { icon: "🛒", nafn: "Sala (POS)", desc: "Afgreiðsluborð", tag: "Kerfi", ready: true },
      { icon: "🔧", nafn: "Verkstæði", desc: "Verkbeiðnir", tag: "Kerfi", ready: true },
      { icon: "📥", nafn: "Afgreiðsla", desc: "Móttaka/afhending", tag: "Kerfi", ready: true },
      { icon: "🏢", nafn: "Fyrirtæki í þjónustu", desc: "Þjónustusamningar", tag: "Kerfi", ready: true },
      { icon: "🚚", nafn: "Útkeyrsla", desc: "Leiðir + kort", tag: "Kerfi", ready: true },
      { icon: "🚨", nafn: "Brunakerfi", desc: "Viðvörunarkerfi", tag: "Kerfi", ready: false },
      { icon: "💳", nafn: "Reikningar & kröfur", desc: "Payday/kröfuyfirlit", tag: "Kerfi", ready: false },
    ],
  },
  {
    group: "Vef-blokkir", sub: "Byggingareiningar fyrir síður í síðuritlinum",
    items: [
      { icon: "⛰️", nafn: "Hetja", desc: "Fyrirsögn + hnappur", tag: "Vefur", ready: true },
      { icon: "📝", nafn: "Texti", desc: "Textablokk", tag: "Vefur", ready: true },
      { icon: "🛍️", nafn: "Vörur", desc: "Vöruúrval", tag: "Vefur", ready: true },
      { icon: "🖼️", nafn: "Mynd", desc: "Stök mynd", tag: "Vefur", ready: true },
      { icon: "🎞️", nafn: "Myndasafn", desc: "Fleiri myndir", tag: "Vefur", ready: true },
      { icon: "❓", nafn: "Spurt & svarað", desc: "FAQ", tag: "Vefur", ready: true },
      { icon: "📣", nafn: "Ákall", desc: "Call-to-action", tag: "Vefur", ready: true },
      { icon: "✉️", nafn: "Form", desc: "Hafa samband", tag: "Vefur", ready: true },
    ],
  },
  {
    group: "Tól & tengingar", sub: "Eiginleikar og tengingar sem má kveikja á",
    items: [
      { icon: "🛒", nafn: "Vefverslun", desc: "Karfa + kassi", tag: "Vefur", ready: true },
      { icon: "📊", nafn: "Vefmælingar", desc: "Vercel Analytics", tag: "Verkfæri", ready: true },
      { icon: "📈", nafn: "Meta Pixel", desc: "FB/IG auglýsingar", tag: "Verkfæri", ready: true },
      { icon: "💬", nafn: "Netspjall", desc: "Tawk.to", tag: "Verkfæri", ready: true },
      { icon: "🗺️", nafn: "Kort", desc: "Leaflet + OSM", tag: "Kerfi", ready: true },
      { icon: "🔔", nafn: "Tilkynningaborði", desc: "Borði efst", tag: "Vefur", ready: true },
      { icon: "🗂️", nafn: "Skjalarinn", desc: "Skjöl · pdf · skrár", tag: "Tól", ready: true },
      { icon: "💳", nafn: "Payday", desc: "Reikningar", tag: "Verkfæri", ready: false },
      { icon: "📘", nafn: "Facebook", desc: "Tenging", tag: "Verkfæri", ready: false },
    ],
  },
];

const QUICK: { icon: string; label: string; href: string; ext?: boolean }[] = [
  { icon: "🛠", label: "Stjórnborð", href: "/stjorn" },
  { icon: "🧩", label: "Kerfi", href: "/kerfi" },
  { icon: "🛒", label: "Verslun", href: "/verslun" },
  { icon: "🗂️", label: "Skjalarinn", href: "/skjalarinn" },
  { icon: "🧰", label: "Verkfæri", href: "/stjorn" },
  { icon: "💻", label: "GitHub", href: "https://github.com/aggisigurds-dev/kjarni", ext: true },
  { icon: "▲", label: "Vercel", href: "https://vercel.com/kjarni", ext: true },
];
const CONNS: { icon: string; nafn: string; status: string; on: boolean; how: string; cta: string; href: string }[] = [
  { icon: "🌐", nafn: "Tengja lén", status: "Ekki tengt", on: false, how: "Bættu léninu þínu við verkefnið í Vercel og vísaðu DNS-færslu (CNAME) á cname.vercel-dns.com. Vefurinn birtist þá á þínu eigin léni.", cta: "Opna Vercel Domains", href: "https://vercel.com/kjarni/slokkvitaeki/settings/domains" },
  { icon: "💳", nafn: "Payday", status: "Ekki tengt", on: false, how: "Sæktu API Client ID + Secret í Payday (Stillingar → API) og límdu í Verkfæri. Þá má sækja reikninga og senda kröfur beint úr kerfinu.", cta: "Opna Payday", href: "https://att.payday.is" },
  { icon: "✉️", nafn: "Gmail", status: "Ekki tengt", on: false, how: "Tengdu Google-reikning gegnum OAuth til að lesa og senda tölvupóst úr kerfinu (t.d. fyrirspurnir og kröfur). Bætist við sem tól.", cta: "Google Cloud", href: "https://console.cloud.google.com" },
  { icon: "📘", nafn: "Facebook / Meta", status: "Pixel til", on: true, how: "Límdu Meta Pixel auðkenni í Verkfæri fyrir auglýsingamælingar. Full Facebook-síðutenging kemur í Þrep 3.", cta: "Opna Verkfæri", href: "/stjorn" },
];

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
  const [sites, setSites] = useState<Site[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function loadSites() {
    const s = await sbSelect<Site[]>("kjarni_sites?select=*&order=id").catch(() => []);
    setSites(Array.isArray(s) ? s : []);
  }

  async function openPanel(e: FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      const ok = await sbRpc<string>("kjarni_set_stilling", { p_lykill: "master_innskrad", p_gildi: new Date().toISOString(), p_leyni: secret });
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
      try { const e2 = JSON.parse(en[0]?.gildi || "[]"); setEiningar(Array.isArray(e2) ? e2.filter((x: string) => x !== "vidskiptavinir") : []); } catch {}
      await loadSites();
      setUnlocked(true);
    } catch { setErr("Villa við tengingu."); }
  }

  async function addSite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const f = new FormData(e.currentTarget);
    const nafn = ((f.get("nafn") as string) || "").trim();
    const tegund = (f.get("tegund") as string) || "vefur";
    if (!nafn) { setSaving(false); return; }
    let base = slugify(nafn);
    if (sites.some((s) => s.slug === base)) base = `${base}-${Date.now().toString().slice(-4)}`;
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/kjarni_sites`, { method: "POST", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify({ nafn, slug: base, tegund }) });
      await loadSites();
      setAddOpen(false);
    } finally { setSaving(false); }
  }
  async function delSite(id: number) {
    setSites((s) => s.filter((x) => x.id !== id));
    await fetch(`${SUPABASE_URL}/rest/v1/kjarni_sites?id=eq.${id}`, { method: "DELETE", headers: H }).catch(() => {});
  }

  if (!unlocked) {
    return (
      <div className="ms-gate">
        <span className="ms-gate-badge">◉</span>
        <h1>Kjarni · Stjórnstöð</h1>
        <p>Master-bakendi platformsins. Sláðu inn leyniorð til að sjá alla vefi, einingar og tól á einum stað.</p>
        <form onSubmit={openPanel}>
          <input type="password" placeholder="Leyniorð" value={secret} onChange={(e) => setSecret(e.target.value)} />
          <button className="ms-btn" type="submit">Opna stjórnstöð</button>
        </form>
        {err && <p className="ms-err">{err}</p>}
      </div>
    );
  }

  const salesTotal = kSolur.reduce((s, x) => s + (x.samtals || 0), 0);
  const readyCount = GALLERY.reduce((n, g) => n + g.items.filter((i) => i.ready).length, 0);
  const totalCount = GALLERY.reduce((n, g) => n + g.items.length, 0);
  const activity = [
    ...orders.map((o) => ({ t: "pöntun", nafn: o.nafn, sub: kr(o.samtals), when: o.buid_til })),
    ...inq.map((i) => ({ t: "fyrirspurn", nafn: i.nafn, sub: (i.skilabod || "").slice(0, 60), when: i.buid_til })),
  ].sort((a, b) => (b.when || "").localeCompare(a.when || "")).slice(0, 6);
  const userSites = sites.filter((s) => s.slug !== "slokkvitaeki" && s.slug !== "kerfi");

  return (
    <div className="ms">
      <header className="ms-top">
        <div className="ms-top-l">
          <span className="ms-badge">◉</span>
          <div><h1>Kjarni · Stjórnstöð</h1><p>Master-bakendi — vefir, einingar og tól</p></div>
        </div>
      </header>

      <div className="ms-kpis">
        <div className="ms-kpi"><span>Vefir & kerfi</span><b>{sites.length}</b></div>
        <div className="ms-kpi"><span>Einingar tilbúnar</span><b>{readyCount}<small>/{totalCount}</small></b></div>
        <div className="ms-kpi"><span>Pantanir</span><b>{orders.length}</b></div>
        <div className="ms-kpi"><span>Kerfi-viðskiptavinir</span><b>{kKunnar}</b></div>
      </div>

      <div className="ms-h2row"><h2 className="ms-h2">Vefir & kerfi</h2><button className="ms-add-btn" onClick={() => setAddOpen(true)}>+ Nýr vefur</button></div>
      <div className="ms-props">
        <div className="ms-prop">
          <div className="ms-prop-h">
            <span className="ms-prop-ico" style={{ background: "#e8551f" }}>🧯</span>
            <div><b>Slökkvitæki vefur</b><small>Vefverslun + kynningarsíða</small></div>
            <span className="ms-live">● Í loftinu</span>
          </div>
          <div className="ms-stats"><span><b>{sidur.length}</b> síður</span><span><b>{orders.length}</b> pantanir</span><span><b>{inq.length}</b> fyrirspurnir</span></div>
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
          <div className="ms-stats"><span><b>{kKunnar}</b> viðskiptavinir</span><span><b>{einingar.length}</b>/{MOD_COUNT} einingar</span><span><b>{kSolur.length}</b> sölur · {kr(salesTotal)}</span></div>
          <div className="ms-links"><a className="ms-primary" href="/kerfi">Opna kerfi →</a><a href="/kerfi" target="_blank" rel="noreferrer">Nýr gluggi ↗</a></div>
        </div>

        {userSites.map((s) => (
          <div className="ms-prop" key={s.id}>
            <div className="ms-prop-h">
              <span className="ms-prop-ico" style={{ background: s.tegund === "kerfi" ? "#0f1626" : "#2fa56b" }}>{s.tegund === "kerfi" ? "🧩" : "🌐"}</span>
              <div><b>{s.nafn}</b><small>{s.tegund === "kerfi" ? "Þjónustukerfi" : "Vefur"} · /s/{s.slug}</small></div>
              <span className="ms-live">● Nýr</span>
            </div>
            <div className="ms-stats"><span>Tilbúinn til að byggja</span></div>
            <div className="ms-links">
              <a className="ms-primary" href={`/s/${s.slug}`} target="_blank" rel="noreferrer">Opna →</a>
              <button className="ms-del" onClick={() => delSite(s.id)}>Eyða</button>
            </div>
          </div>
        ))}

        <button className="ms-prop ms-add" onClick={() => setAddOpen(true)}>
          <span className="ms-add-plus">+</span>
          <b>Nýr vefur eða kerfi</b>
          <small>Settu upp næsta þjónustufyrirtæki eða vef á sama grunni.</small>
        </button>
      </div>

      <h2 className="ms-h2">Einingar & tól sem þú getur notað</h2>
      <p className="ms-galsub">{readyCount} tilbúnar einingar og tól — kveiktu á þeim eftir þörf á hverjum vef eða kerfi.</p>
      {GALLERY.map((g) => (
        <div className="ms-gal" key={g.group}>
          <div className="ms-gal-h"><h3>{g.group}</h3><span>{g.sub}</span></div>
          <div className="ms-gal-grid">
            {g.items.map((it) => (
              <div className={`ms-gitem ${it.ready ? "" : "soon"}`} key={it.nafn}>
                <span className="ms-gitem-ico">{it.icon}</span>
                <div className="ms-gitem-b">
                  <b>{it.nafn}</b>
                  {it.desc && <span>{it.desc}</span>}
                </div>
                <div className="ms-gitem-r">
                  <span className="ms-gtag">{it.tag}</span>
                  <span className={`ms-gstatus ${it.ready ? "on" : ""}`}>{it.ready ? "Tilbúið" : "Í vinnslu"}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <h2 className="ms-h2">Aðstoðarborð</h2>
      <div className="ms-help2">
        <div className="ms-hcard">
          <h3>Flýtileiðir</h3>
          <div className="ms-quick">
            {QUICK.map((q) => (
              <a key={q.label} href={q.href} {...(q.ext ? { target: "_blank", rel: "noreferrer" } : {})}>
                <span aria-hidden="true">{q.icon}</span> {q.label}
              </a>
            ))}
          </div>
        </div>
        <div className="ms-conns">
          {CONNS.map((c) => (
            <div className="ms-conn" key={c.nafn}>
              <div className="ms-conn-h">
                <span className="ms-conn-ico">{c.icon}</span>
                <b>{c.nafn}</b>
                <span className={`ms-cstat ${c.on ? "on" : ""}`}>{c.status}</span>
              </div>
              <p>{c.how}</p>
              <a href={c.href} {...(c.href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}>{c.cta} →</a>
            </div>
          ))}
        </div>
      </div>

      <h2 className="ms-h2">Nýjasta virknin</h2>
      <div className="ms-card">
        {activity.length === 0 ? <p className="ms-empty">Engin virkni enn.</p> : (
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

      {addOpen && (
        <div className="ms-modal-wrap" onClick={() => setAddOpen(false)}>
          <div className="ms-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ms-modal-h"><h2>Nýr vefur eða kerfi</h2><button className="ms-x" onClick={() => setAddOpen(false)} aria-label="Loka">✕</button></div>
            <form onSubmit={addSite} className="ms-form">
              <label>Nafn<input name="nafn" required placeholder="t.d. Rafverk ehf" autoFocus /></label>
              <label>Tegund
                <select name="tegund" defaultValue="vefur">
                  <option value="vefur">Vefur (kynningarsíða / verslun)</option>
                  <option value="kerfi">Kerfi (þjónustufyrirtæki)</option>
                </select>
              </label>
              <button className="ms-btn" type="submit" disabled={saving}>{saving ? "Stofna…" : "Stofna vef"}</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
