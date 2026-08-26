"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { SUPABASE_URL, SUPABASE_KEY, sbRpc, sbSelect } from "../lib/supabase";

const SKINS = [
  { id: "command", label: "Command", hint: "Ísblátt HUD-stjórnborð" },
  { id: "atlas", label: "Atlas", hint: "Bláprent · kortaborð" },
  { id: "pulse", label: "Pulse", hint: "Vaktborð · ops" },
  { id: "helix", label: "Helix", hint: "Rásir · lab" },
  { id: "vector", label: "Vector", hint: "Fjólublá geimstöð" },
  { id: "don", label: "Don", hint: "Gull · maffía" },
] as const;

type SkinId = (typeof SKINS)[number]["id"];
const SKIN_IDS: SkinId[] = SKINS.map((skin) => skin.id);
const SKIN_KEY = "kjarni_skin";

function readSkin(): SkinId {
  if (typeof window === "undefined") return "command";
  const stored = window.localStorage.getItem(SKIN_KEY);
  const fromHtml = document.documentElement.dataset.kjarniSkin;
  if (SKIN_IDS.includes(stored as SkinId)) return stored as SkinId;
  return SKIN_IDS.includes(fromHtml as SkinId) ? (fromHtml as SkinId) : "command";
}

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

type GItem = { icon: string; nafn: string; desc?: string; tag: string; ready: boolean; href?: string };
const GALLERY: { group: string; sub: string; items: GItem[] }[] = [
  {
    group: "Kerfi-einingar", sub: "Rekstrareiningar sem kveikt er á þrepaskipt í þjónustukerfinu",
    items: [
      { icon: "👥", nafn: "Viðskiptavinir", desc: "Viðskiptavinaskrá", tag: "Kerfi", ready: true, href: "/kerfi" },
      { icon: "🧯", nafn: "Búnaður", desc: "Tæki, staðsetning, raðnr.", tag: "Kerfi", ready: true, href: "/kerfi" },
      { icon: "📋", nafn: "Skoðanir", desc: "Skoðunardagatal", tag: "Kerfi", ready: true, href: "/kerfi" },
      { icon: "🛒", nafn: "Sala (POS)", desc: "Afgreiðsluborð", tag: "Kerfi", ready: true, href: "/kerfi" },
      { icon: "🔧", nafn: "Verkstæði", desc: "Verkbeiðnir", tag: "Kerfi", ready: true, href: "/kerfi" },
      { icon: "📥", nafn: "Afgreiðsla", desc: "Móttaka/afhending", tag: "Kerfi", ready: true, href: "/kerfi" },
      { icon: "🏢", nafn: "Fyrirtæki í þjónustu", desc: "Þjónustusamningar", tag: "Kerfi", ready: true, href: "/kerfi" },
      { icon: "🚚", nafn: "Útkeyrsla", desc: "Leiðir + kort", tag: "Kerfi", ready: true, href: "/kerfi" },
      { icon: "🚨", nafn: "Brunakerfi", desc: "Viðvörunarkerfi", tag: "Kerfi", ready: false },
      { icon: "💳", nafn: "Reikningar & kröfur", desc: "Payday/kröfuyfirlit", tag: "Kerfi", ready: false },
    ],
  },
  {
    group: "Vef-blokkir", sub: "Byggingareiningar fyrir síður í síðuritlinum",
    items: [
      { icon: "⛰️", nafn: "Hetja", desc: "Fyrirsögn + hnappur", tag: "Vefur", ready: true, href: "/draft" },
      { icon: "📝", nafn: "Texti", desc: "Textablokk", tag: "Vefur", ready: true, href: "/draft" },
      { icon: "🛍️", nafn: "Vörur", desc: "Vöruúrval", tag: "Vefur", ready: true, href: "/draft" },
      { icon: "🖼️", nafn: "Mynd", desc: "Stök mynd", tag: "Vefur", ready: true, href: "/draft" },
      { icon: "🎞️", nafn: "Myndasafn", desc: "Fleiri myndir", tag: "Vefur", ready: true, href: "/draft" },
      { icon: "❓", nafn: "Spurt & svarað", desc: "FAQ", tag: "Vefur", ready: true, href: "/draft" },
      { icon: "📣", nafn: "Ákall", desc: "Call-to-action", tag: "Vefur", ready: true, href: "/draft" },
      { icon: "✉️", nafn: "Form", desc: "Hafa samband", tag: "Vefur", ready: true, href: "/draft" },
    ],
  },
  {
    group: "Tól & tengingar", sub: "Eiginleikar og tengingar sem má kveikja á",
    items: [
      { icon: "🛒", nafn: "Vefverslun", desc: "Karfa + kassi", tag: "Vefur", ready: true, href: "/verslun" },
      { icon: "📊", nafn: "Vefmælingar", desc: "Vercel Analytics", tag: "Verkfæri", ready: true, href: "/stjorn" },
      { icon: "📈", nafn: "Meta Pixel", desc: "FB/IG auglýsingar", tag: "Verkfæri", ready: true, href: "/stjorn" },
      { icon: "💬", nafn: "Netspjall", desc: "Tawk.to", tag: "Verkfæri", ready: true, href: "/stjorn" },
      { icon: "🗺️", nafn: "Kort", desc: "Leaflet + OSM", tag: "Kerfi", ready: true, href: "/kerfi" },
      { icon: "🔔", nafn: "Tilkynningaborði", desc: "Borði efst", tag: "Vefur", ready: true, href: "/stjorn" },
      { icon: "🗂️", nafn: "Skjalarinn", desc: "Skjöl · pdf · skrár", tag: "Tól", ready: true, href: "/skjalarinn" },
      { icon: "🧊", nafn: "3dwork", desc: "STL/mesh vinnustöð", tag: "Tól", ready: true, href: "/3dwork" },
      { icon: "✎", nafn: "Prufusvæði", desc: "Blokkir · þemu · skikt", tag: "Tól", ready: true, href: "/draft" },
      { icon: "💳", nafn: "Payday", desc: "Reikningar", tag: "Verkfæri", ready: false },
      { icon: "📘", nafn: "Facebook", desc: "Tenging", tag: "Verkfæri", ready: false },
    ],
  },
];

const QUICK_GROUPS: { title: string; items: { icon: string; label: string; href: string; ext?: boolean }[] }[] = [
  {
    title: "Kjarni",
    items: [
      { icon: "🏠", label: "Forsíða", href: "/" },
      { icon: "🎛️", label: "Stjórnborð", href: "/stjorn" },
      { icon: "🧩", label: "Kerfi", href: "/kerfi" },
      { icon: "🛒", label: "Verslun", href: "/verslun" },
      { icon: "🗂️", label: "Skjalarinn", href: "/skjalarinn" },
      { icon: "🧊", label: "3dwork", href: "/3dwork" },
      { icon: "✎", label: "Prufusvæði", href: "/draft" },
    ],
  },
  {
    title: "Öpp",
    items: [
      { icon: "🛠️", label: "Verkfæri", href: "https://verkfaeri.vercel.app", ext: true },
      { icon: "🧯", label: "Slökkvitæki", href: "https://slokkvitaeki.netlify.app", ext: true },
      { icon: "🔥", label: "Brunahólf", href: "https://brunaholf.netlify.app", ext: true },
    ],
  },
  {
    title: "Þróun",
    items: [
      { icon: "💻", label: "GitHub", href: "https://github.com/aggisigurds-dev/kjarni", ext: true },
      { icon: "▲", label: "Vercel", href: "https://vercel.com/kjarni", ext: true },
    ],
  },
];
function SkinSwitcher({ skin, onChange }: { skin: SkinId; onChange: (id: SkinId) => void }) {
  return (
    <div className="ms-skins-rail">
      <div className="ms-skins" role="tablist" aria-label="Þema og útlit">
        {SKINS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            data-id={option.id}
            aria-selected={skin === option.id}
            aria-label={`${option.label} — ${option.hint}`}
            title={option.hint}
            className={skin === option.id ? "on" : ""}
            onClick={() => onChange(option.id)}
          >
            <i className="ms-skin-pip" aria-hidden="true" />
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function StationShell({
  skin,
  onSkin,
  showNav,
  children,
}: {
  skin: SkinId;
  onSkin: (id: SkinId) => void;
  showNav?: boolean;
  children: ReactNode;
}) {
  const current = SKINS.find((option) => option.id === skin);
  return (
    <div className="ms" data-skin={skin}>
      <div className="ms-head">
        <SkinSwitcher skin={skin} onChange={onSkin} />
        <div className="ms-head-in">
          <header className="ms-top">
            <div className="ms-top-l">
              <span className="ms-badge">◉</span>
              <div>
                <h1>Kjarni · Stjórnstöð</h1>
                <p>Master-bakendi — vefir, einingar og tól</p>
              </div>
            </div>
            {current && <p className="ms-skin-hint">{current.hint}</p>}
          </header>
          {showNav && (
            <>
              <p className="ms-hud" aria-hidden="true">
                <span>SYS · ONLINE</span>
                <span>{current?.label.toUpperCase()}</span>
                <span>LIGHT · HUD</span>
              </p>
              <nav className="ms-nav" aria-label="Kaflar">
                <a href="#ms-yfirlit">Yfirlit</a>
                <a href="#ms-vefir">Vefir</a>
                <a href="#ms-einingar">Einingar</a>
                <a href="#ms-adstod">Aðstoð</a>
              </nav>
            </>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

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
  const [galFilter, setGalFilter] = useState<"allt" | "Kerfi" | "Vefur" | "Tól" | "Verkfæri">("allt");
  const [galOpen, setGalOpen] = useState<Record<string, boolean>>({
    "Kerfi-einingar": true,
    "Vef-blokkir": false,
    "Tól & tengingar": true,
  });
  const [saving, setSaving] = useState(false);
  const [skin, setSkin] = useState<SkinId>("command");
  const [skinReady, setSkinReady] = useState(false);

  useEffect(() => {
    setSkin(readSkin());
    setSkinReady(true);
  }, []);

  useEffect(() => {
    if (!skinReady) return;
    window.localStorage.setItem(SKIN_KEY, skin);
    document.documentElement.dataset.kjarniSkin = skin;
    return () => {
      delete document.documentElement.dataset.kjarniSkin;
    };
  }, [skin, skinReady]);

  async function loadSites() {
    const s = await sbSelect<Site[]>("kjarni_sites?select=*&order=id").catch(() => []);
    setSites(Array.isArray(s) ? s : []);
  }

  // Innskráning TÍMABUNDIÐ óvirk (ósk Agnars — kveikir á síðar). Til að kveikja
  // aftur: fjarlægðu booting/auto-load useEffect og skilaðu gate-inu til baka.
  const [booting, setBooting] = useState(true);

  async function loadData(sec: string) {
    const [o, i, p, kk, ks, en] = await Promise.all([
      sbRpc<Order[]>("kjarni_get_pantanir", { p_leyni: sec }).catch(() => []),
      sbRpc<Inq[]>("kjarni_get_fyrirspurnir", { p_leyni: sec }).catch(() => []),
      sbRpc<Page[]>("kjarni_sidur_admin", { p_leyni: sec }).catch(() => []),
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
  }

  useEffect(() => {
    (async () => {
      const sec = "BrunaStjorn2026";
      setSecret(sec);
      try { await loadData(sec); } catch {}
      setUnlocked(true);
      setBooting(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openPanel(e: FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      const ok = await sbRpc<string>("kjarni_set_stilling", { p_lykill: "master_innskrad", p_gildi: new Date().toISOString(), p_leyni: secret });
      if (ok !== "ok") { setErr("Rangt leyniorð."); return; }
      await loadData(secret);
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

  if (booting) {
    return (
      <StationShell skin={skin} onSkin={setSkin}>
        <div className="ms-gate">
          <span className="ms-gate-badge">◉</span>
          <h1>Hleð…</h1>
        </div>
      </StationShell>
    );
  }

  if (!unlocked) {
    return (
      <StationShell skin={skin} onSkin={setSkin}>
        <div className="ms-gate">
          <span className="ms-gate-badge">◉</span>
          <h1>Aðgangur</h1>
          <p>Master-bakendi platformsins. Sláðu inn leyniorð til að sjá alla vefi, einingar og tól á einum stað.</p>
          <form onSubmit={openPanel}>
            <input type="password" placeholder="Leyniorð" value={secret} onChange={(e) => setSecret(e.target.value)} />
            <button className="ms-btn" type="submit">Opna stjórnstöð</button>
          </form>
          {err && <p className="ms-err">{err}</p>}
        </div>
      </StationShell>
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
    <StationShell skin={skin} onSkin={setSkin} showNav>
      <section id="ms-yfirlit" className="ms-section">
        <div className="ms-kpis">
          <div className="ms-kpi"><span>Vefir &amp; kerfi</span><b>{sites.length}</b></div>
          <div className="ms-kpi"><span>Einingar tilbúnar</span><b>{readyCount}<small>/{totalCount}</small></b></div>
          <div className="ms-kpi"><span>Pantanir</span><b>{orders.length}</b></div>
          <div className="ms-kpi"><span>Kerfi-viðskiptavinir</span><b>{kKunnar}</b></div>
        </div>

        <div className="ms-overview">
          <div>
            <h2 className="ms-h2">Allt á einum stað</h2>
            {QUICK_GROUPS.map((group) => (
              <div className="ms-launch-group" key={group.title}>
                <h3 className="ms-h3">{group.title}</h3>
                <div className="ms-launch">
                  {group.items.map((q) => (
                    <a key={q.label} href={q.href} {...(q.ext ? { target: "_blank", rel: "noreferrer" } : {})}>
                      <span aria-hidden="true">{q.icon}</span> {q.label}{q.ext ? " ↗" : ""}
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div>
            <h2 className="ms-h2" id="ms-virkni">Nýjasta virknin</h2>
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
          </div>
        </div>
      </section>

      <section id="ms-vefir" className="ms-section">
      <div className="ms-h2row"><h2 className="ms-h2">Vefir &amp; kerfi</h2><button className="ms-add-btn" onClick={() => setAddOpen(true)}>+ Nýr vefur</button></div>
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
      </section>

      <section id="ms-einingar" className="ms-section">
      <h2 className="ms-h2">Einingar &amp; tól sem þú getur notað</h2>
      <p className="ms-galsub">{readyCount} tilbúnar einingar og tól — kveiktu á þeim eftir þörf á hverjum vef eða kerfi.</p>
      <div className="ms-filters" role="tablist" aria-label="Sía einingar">
        {(["allt", "Kerfi", "Vefur", "Tól", "Verkfæri"] as const).map((tag) => (
          <button
            key={tag}
            type="button"
            role="tab"
            aria-selected={galFilter === tag}
            className={galFilter === tag ? "on" : ""}
            onClick={() => setGalFilter(tag)}
          >
            {tag === "allt" ? "Allt" : tag}
          </button>
        ))}
      </div>
      {GALLERY.map((g) => {
        const items = g.items.filter((it) => galFilter === "allt" || it.tag === galFilter);
        if (items.length === 0) return null;
        return (
        <div className={`ms-gal ${galOpen[g.group] ? "is-open" : ""}`} key={g.group}>
          <button
            type="button"
            className="ms-gal-h"
            aria-expanded={galOpen[g.group] !== false}
            onClick={() => setGalOpen((current) => ({ ...current, [g.group]: !current[g.group] }))}
          >
            <h3>{g.group}</h3>
            <span>{g.sub}</span>
            <span className="ms-gal-count">{items.length}</span>
          </button>
          <div className="ms-gal-grid">
            {items.map((it) => {
              const inner = (
                <>
                <span className="ms-gitem-ico">{it.icon}</span>
                <div className="ms-gitem-b">
                  <b>{it.nafn}</b>
                  {it.desc && <span>{it.desc}</span>}
                </div>
                <div className="ms-gitem-r">
                  <span className="ms-gtag">{it.tag}</span>
                  <span className={`ms-gstatus ${it.ready ? "on" : ""}`}>{it.ready ? "Tilbúið" : "Í vinnslu"}</span>
                </div>
                </>
              );
              return it.href && it.ready ? (
                <a className="ms-gitem" href={it.href} key={it.nafn}>
                  {inner}
                </a>
              ) : (
                <div className={`ms-gitem ${it.ready ? "" : "soon"}`} key={it.nafn}>
                  {inner}
                </div>
              );
            })}
          </div>
        </div>
        );
      })}
      </section>

      <section id="ms-adstod" className="ms-section">
      <h2 className="ms-h2">Aðstoðarborð</h2>
      <div className="ms-help2">
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
      </section>

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
    </StationShell>
  );
}
