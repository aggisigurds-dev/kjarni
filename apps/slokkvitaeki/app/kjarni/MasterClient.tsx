"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { SUPABASE_URL, SUPABASE_KEY, sbRpc, sbSelect } from "../lib/supabase";
import { StationChrome, useStationSkin } from "./StationChrome";
import { SKINS } from "./skins";
import { HeimilisfangLeit } from "./turbopaint/components/kjarni/HeimilisfangLeit";
import "./heimilisfang-leit.css";
import { CONNS, GALLERY, MOD_COUNT, QUICK_GROUPS, kr } from "./data";
import { RagnarokView } from "./ragnarok/RagnarokView";

type Order = { id: number; buid_til: string; nafn: string; samtals: number };
type Inq = { id: number; buid_til: string; nafn: string; skilabod: string };
type Page = { id: number; slod: string; birt: boolean };
type Site = { id: number; nafn: string; slug: string; tegund: string; stada: string };

const H = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" };

const ICE: Record<string, string> = { "á": "a", "é": "e", "í": "i", "ó": "o", "ú": "u", "ý": "y", "þ": "th", "æ": "ae", "ö": "o", "ð": "d" };
const slugify = (s: string) =>
  s.toLowerCase().split("").map((c) => ICE[c] ?? c).join("")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "vefur";

function StationShell({
  showNav,
  children,
}: {
  showNav?: boolean;
  children: ReactNode;
}) {
  const { skin } = useStationSkin();
  const current = SKINS.find((option) => option.id === skin);
  return (
    <div className="ms" data-skin={skin}>
      <div className="ms-head">
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

/* Ragnarök er sitt eigið útlit (eigin uppröðun eftir hönnunarkerfinu); hin sex
 * útlitin deila klassísku uppröðuninni og skipta aðeins um liti. */
function SkinSwitch({ ragnarok, classic }: { ragnarok: ReactNode; classic: ReactNode }) {
  const { skin } = useStationSkin();
  return <>{skin === "ragnarok" ? ragnarok : classic}</>;
}

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
      <StationChrome tool="kjarni">
        <StationShell>
          <div className="ms-gate">
            <span className="ms-gate-badge">◉</span>
            <h1>Hleð…</h1>
          </div>
        </StationShell>
      </StationChrome>
    );
  }

  if (!unlocked) {
    return (
      <StationChrome tool="kjarni">
        <StationShell>
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
      </StationChrome>
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

  const classic = (
    <StationShell showNav>
      <section id="ms-yfirlit" className="ms-section">
        <div className="ms-card" style={{ marginBottom: 18, padding: 14, background: "#1a1d2e", color: "#f5f5f4" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <h2 className="ms-h2" style={{ color: "#fff", margin: 0 }}>Teikningar — heimilisfang</h2>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "#a8a29e" }}>
                Leitaðu hér og smelltu á teikningu — hún opnast á TurboPaint-borðinu.
              </p>
            </div>
            <a href="/kjarni/turbopaint" style={{ color: "#fdba74", fontWeight: 700, fontSize: 13 }}>
              Opna borðið →
            </a>
          </div>
          <div style={{ marginTop: 10 }}>
            <HeimilisfangLeit
              onVelja={(infoUrl) => {
                window.location.href = `/kjarni/turbopaint?plan=${encodeURIComponent(infoUrl)}`;
              }}
            />
          </div>
        </div>
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

  return (
    <StationChrome tool="kjarni">
      <SkinSwitch
        classic={classic}
        ragnarok={
          <RagnarokView
            sites={sites}
            userSites={userSites}
            sidurCount={sidur.length}
            ordersCount={orders.length}
            inqCount={inq.length}
            kKunnar={kKunnar}
            solurCount={kSolur.length}
            salesTotal={salesTotal}
            einingarCount={einingar.length}
            readyCount={readyCount}
            totalCount={totalCount}
            activity={activity}
            onAddSite={addSite}
            onDelSite={delSite}
            addOpen={addOpen}
            setAddOpen={setAddOpen}
            saving={saving}
          />
        }
      />
    </StationChrome>
  );
}
