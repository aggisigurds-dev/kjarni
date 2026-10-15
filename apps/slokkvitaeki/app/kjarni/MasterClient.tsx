"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { SUPABASE_URL, SUPABASE_KEY, sbRpc, sbSelect } from "../lib/supabase";
import { StationChrome, useStationSkin } from "./StationChrome";
import { SKINS } from "./skins";
import "./heimilisfang-leit.css";
import { GALLERY, kr } from "./data";
import { RagnarokView, type RagnarokData } from "./ragnarok/RagnarokView";
import { StodView } from "./thema/StodView";

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

/* Ragnarök er sitt eigið útlit; hin fjögur (Miðakerfi, Brunastál, Big Boss, Brunahólf — 15.10.2026) fá sömu
 * uppröðun í þemasýninni (thema/StodView), hvert með hlutum síns hönnunarkerfis. Sömu gögn í báðum. */
function SkinSwitch({ data }: { data: RagnarokData }) {
  const { skin } = useStationSkin();
  return skin === "ragnarok" ? <RagnarokView {...data} /> : <StodView {...data} />;
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

  const data: RagnarokData = {
    sites,
    userSites,
    sidurCount: sidur.length,
    ordersCount: orders.length,
    inqCount: inq.length,
    kKunnar,
    solurCount: kSolur.length,
    salesTotal,
    einingarCount: einingar.length,
    readyCount,
    totalCount,
    activity,
    onAddSite: addSite,
    onDelSite: delSite,
    addOpen,
    setAddOpen,
    saving,
  };

  return (
    <StationChrome tool="kjarni">
      <SkinSwitch data={data} />
    </StationChrome>
  );
}
