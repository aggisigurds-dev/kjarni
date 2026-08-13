"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { SUPABASE_URL, SUPABASE_KEY, sbSelect } from "../lib/supabase";

type Kunni = {
  id: number;
  nafn: string;
  tegund: string;
  kennitala: string;
  heimilisfang: string;
  postnr: string;
  stadur: string;
  simi: string;
  netfang: string;
};
type Taeki = {
  id: number;
  vidskiptavinur_id: number;
  tegund: string;
  eldflokkur: string;
  stadsetning: string;
  radnr: string;
  sidast_skodad: string | null;
  naesta_skodun: string | null;
};

type Vara = { id: number; heiti: string; tegund: string; verd: number; vsk: number; virk: boolean; rod: number };
type SolLina = { heiti: string; verd: number; fjoldi: number };
type SalaRec = {
  id: number;
  vidskiptavinur_nafn: string | null;
  linur: SolLina[];
  samtals: number;
  vsk: number;
  greidslumati: string;
  buid_til: string;
};

type ModId =
  | "bunadur" | "skodanir"
  | "sala" | "verkstaedi" | "afgreidsla"
  | "thjonusta" | "utkeyrsla"
  | "brunakerfi" | "reikningar";
const STAGES: { n: number; label: string }[] = [
  { n: 0, label: "Grunnur" },
  { n: 1, label: "Þrep 1 · Afgreiðsla" },
  { n: 2, label: "Þrep 2 · Þjónusta" },
  { n: 3, label: "Þrep 3 · Framlengt" },
];
const MODULES: { id: ModId; stage: number; label: string; icon: string; desc: string; soon?: boolean }[] = [
  { id: "bunadur", stage: 0, label: "Búnaður", icon: "🧯", desc: "Halda utan um tæki og búnað hvers viðskiptavinar með staðsetningu og raðnúmeri." },
  { id: "skodanir", stage: 0, label: "Skoðanir", icon: "📋", desc: "Skoðunardagatal — sjáðu hvað er komið á tíma og hvað er framundan." },
  { id: "sala", stage: 1, label: "Sala", icon: "🛒", desc: "Sölukerfi (POS) — afgreiðsla á vörum og þjónustu yfir borðið." },
  { id: "verkstaedi", stage: 1, label: "Verkstæði", icon: "🔧", desc: "Verkbeiðnir og viðgerðir á verkstæði.", soon: true },
  { id: "afgreidsla", stage: 1, label: "Afgreiðsla", icon: "📥", desc: "Afgreiðsluborð — móttaka og afhending tækja.", soon: true },
  { id: "thjonusta", stage: 2, label: "Fyrirtæki í þjónustu", icon: "🏢", desc: "Fyrirtæki með þjónustusamning — reglubundin skoðun og eftirlit.", soon: true },
  { id: "utkeyrsla", stage: 2, label: "Útkeyrsla", icon: "🚚", desc: "Vettvangsþjónusta og útkeyrslulistar með korti.", soon: true },
  { id: "brunakerfi", stage: 3, label: "Brunakerfi", icon: "🚨", desc: "Útkeyrsluþjónusta fyrir brunakerfi og viðvörunarkerfi.", soon: true },
  { id: "reikningar", stage: 3, label: "Reikningar & kröfur", icon: "💳", desc: "Payday-tenging og kröfuyfirlit — innheimta og staða reikninga.", soon: true },
];

const H = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" };

const kr = (n: number) => Math.round(n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") + " kr";
const GREIDSLA: Record<string, string> = { kort: "Kort", reikningur: "Reikningur", reidufe: "Reiðufé" };

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("is-IS", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
const fmtDateTime = (d: string) => new Date(d).toLocaleString("is-IS", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

function status(naesta: string | null): "ok" | "warn" | "late" {
  if (!naesta) return "ok";
  const days = Math.round((new Date(naesta).getTime() - Date.now()) / 86400000);
  if (days < 0) return "late";
  if (days <= 45) return "warn";
  return "ok";
}
const ST_LABEL = { ok: "Í lagi", warn: "Framundan", late: "Komið á tíma" };

export default function KerfiClient() {
  const [view, setView] = useState<string>("yfirlit");
  const [enabled, setEnabled] = useState<string[]>(["vidskiptavinir", "bunadur", "skodanir"]);
  const [kunnar, setKunnar] = useState<Kunni[]>([]);
  const [taeki, setTaeki] = useState<Taeki[]>([]);
  const [sel, setSel] = useState<Kunni | null>(null);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [nyrOpen, setNyrOpen] = useState(false);

  const [vorur, setVorur] = useState<Vara[]>([]);
  const [solur, setSolur] = useState<SalaRec[]>([]);
  const [salaTab, setSalaTab] = useState<"afgreidsla" | "solur">("afgreidsla");
  const [cart, setCart] = useState<Record<number, number>>({});
  const [salaKunni, setSalaKunni] = useState<string>("");
  const [greidsla, setGreidsla] = useState("kort");
  const [salaDone, setSalaDone] = useState<SalaRec | null>(null);

  async function loadAll() {
    setLoading(true);
    try {
      const [ks, ts, st, vs, ss] = await Promise.all([
        sbSelect<Kunni[]>("kerfi_vidskiptavinir?select=*&order=nafn"),
        sbSelect<Taeki[]>("kerfi_taeki?select=*"),
        sbSelect<{ lykill: string; gildi: string }[]>("kerfi_stillingar?select=lykill,gildi&lykill=eq.einingar"),
        sbSelect<Vara[]>("kerfi_vorur?select=*&virk=eq.true&order=rod"),
        sbSelect<SalaRec[]>("kerfi_solur?select=*&order=buid_til.desc&limit=50"),
      ]);
      setKunnar(ks);
      setTaeki(ts);
      setVorur(vs);
      setSolur(ss);
      try {
        const e = JSON.parse(st[0]?.gildi || "[]");
        if (Array.isArray(e) && e.length) setEnabled(e);
      } catch {}
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { loadAll().catch(() => setLoading(false)); }, []);

  const taekiByKunni = useMemo(() => {
    const m: Record<number, Taeki[]> = {};
    for (const t of taeki) (m[t.vidskiptavinur_id] ||= []).push(t);
    return m;
  }, [taeki]);

  const worst = (id: number): "ok" | "warn" | "late" => {
    const list = taekiByKunni[id] || [];
    if (list.some((t) => status(t.naesta_skodun) === "late")) return "late";
    if (list.some((t) => status(t.naesta_skodun) === "warn")) return "warn";
    return "ok";
  };

  const kpi = useMemo(() => {
    let late = 0, warn = 0;
    for (const t of taeki) {
      const s = status(t.naesta_skodun);
      if (s === "late") late++;
      else if (s === "warn") warn++;
    }
    return { kunnar: kunnar.length, taeki: taeki.length, late, warn };
  }, [kunnar, taeki]);

  async function toggleMod(id: ModId) {
    const next = enabled.includes(id) ? enabled.filter((x) => x !== id) : [...enabled, id];
    setEnabled(next);
    await fetch(`${SUPABASE_URL}/rest/v1/kerfi_stillingar?lykill=eq.einingar`, {
      method: "PATCH",
      headers: { ...H, Prefer: "return=minimal" },
      body: JSON.stringify({ gildi: JSON.stringify(next) }),
    }).catch(() => {});
  }

  async function addKunni(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const row = {
      nafn: f.get("nafn"),
      tegund: f.get("tegund") || "fyrirtaeki",
      kennitala: f.get("kennitala") || "",
      heimilisfang: f.get("heimilisfang") || "",
      stadur: f.get("stadur") || "",
      simi: f.get("simi") || "",
      netfang: f.get("netfang") || "",
    };
    await fetch(`${SUPABASE_URL}/rest/v1/kerfi_vidskiptavinir`, {
      method: "POST",
      headers: { ...H, Prefer: "return=minimal" },
      body: JSON.stringify(row),
    }).catch(() => {});
    setNyrOpen(false);
    await loadAll();
  }

  const voruById = useMemo(() => Object.fromEntries(vorur.map((v) => [v.id, v])) as Record<number, Vara>, [vorur]);
  const cartLines = useMemo(
    () => Object.entries(cart).map(([id, f]) => ({ v: voruById[Number(id)], f })).filter((l) => l.v),
    [cart, voruById],
  );
  const cartTotal = cartLines.reduce((s, l) => s + l.v.verd * l.f, 0);
  const cartVsk = cartLines.reduce((s, l) => s + Math.round((l.v.verd - l.v.verd / (1 + l.v.vsk / 100)) * l.f), 0);
  const cartCount = cartLines.reduce((s, l) => s + l.f, 0);
  const addToCart = (id: number) => setCart((c) => ({ ...c, [id]: (c[id] || 0) + 1 }));
  const decCart = (id: number) => setCart((c) => { const n = (c[id] || 0) - 1; const o = { ...c }; if (n <= 0) delete o[id]; else o[id] = n; return o; });

  async function ljukaSolu() {
    if (!cartLines.length) return;
    const k = salaKunni ? kunnar.find((x) => x.id === Number(salaKunni)) : null;
    const rec = {
      vidskiptavinur_id: k ? k.id : null,
      vidskiptavinur_nafn: k ? k.nafn : "Laus sala",
      linur: cartLines.map((l) => ({ heiti: l.v.heiti, verd: l.v.verd, fjoldi: l.f })),
      samtals: cartTotal,
      vsk: cartVsk,
      greidslumati: greidsla,
    };
    const res = await fetch(`${SUPABASE_URL}/rest/v1/kerfi_solur`, {
      method: "POST",
      headers: { ...H, Prefer: "return=representation" },
      body: JSON.stringify(rec),
    }).then((r) => r.json()).catch(() => null);
    const saved: SalaRec = Array.isArray(res) && res[0] ? res[0] : { ...rec, id: 0, buid_til: new Date().toISOString() } as SalaRec;
    setSalaDone(saved);
    setCart({});
    setSalaKunni("");
    setSolur((s) => [saved, ...s]);
  }

  const NAV = [
    { id: "yfirlit", label: "Yfirlit", icon: "📊", always: true },
    { id: "vidskiptavinir", label: "Viðskiptavinir", icon: "👥", always: true },
    ...MODULES.filter((m) => enabled.includes(m.id)).map((m) => ({ id: m.id, label: m.label, icon: m.icon, always: false })),
  ];

  const kunnarShown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? kunnar.filter((k) => `${k.nafn} ${k.stadur} ${k.kennitala}`.toLowerCase().includes(s)) : kunnar;
  }, [kunnar, q]);

  const Pill = ({ s }: { s: "ok" | "warn" | "late" }) => <span className={`k-pill ${s}`}>{ST_LABEL[s]}</span>;

  return (
    <div className="k">
      <aside className="k-side">
        <div className="k-brand">
          <span className="k-logo">◉</span>
          <div><b>Kerfi</b><small>þjónustukerfi</small></div>
        </div>
        <nav className="k-nav">
          {NAV.map((n) => (
            <button key={n.id} className={view === n.id ? "on" : ""} onClick={() => { setView(n.id); setSel(null); }}>
              <span aria-hidden="true">{n.icon}</span> {n.label}
            </button>
          ))}
        </nav>
        <button className={`k-nav-set ${view === "einingar" ? "on" : ""}`} onClick={() => { setView("einingar"); setSel(null); }}>
          <span aria-hidden="true">⚙️</span> Einingar
        </button>
      </aside>

      <main className="k-main">
        {loading ? (
          <p className="k-loading">Hleð…</p>
        ) : view === "yfirlit" ? (
          <>
            <h1 className="k-h1">Yfirlit</h1>
            <div className="k-kpis">
              <div className="k-kpi"><span>Viðskiptavinir</span><b>{kpi.kunnar}</b></div>
              {enabled.includes("bunadur") && <div className="k-kpi"><span>Tæki í kerfinu</span><b>{kpi.taeki}</b></div>}
              {enabled.includes("skodanir") && <div className="k-kpi late"><span>Komið á tíma</span><b>{kpi.late}</b></div>}
              {enabled.includes("skodanir") && <div className="k-kpi warn"><span>Skoðun framundan</span><b>{kpi.warn}</b></div>}
            </div>
            <div className="k-card">
              <div className="k-card-h"><h2>Viðskiptavinir</h2><span>{kunnar.length}</span></div>
              <div className="k-list">
                {kunnar.map((k) => (
                  <button className="k-row" key={k.id} onClick={() => { setView("vidskiptavinir"); setSel(k); }}>
                    <span className="k-row-nafn">{k.nafn}</span>
                    <span className="k-row-meta">{k.tegund === "heimili" ? "Heimili" : "Fyrirtæki"} · {k.stadur}</span>
                    <span className="k-row-taeki">{(taekiByKunni[k.id] || []).length} tæki</span>
                    <Pill s={worst(k.id)} />
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : view === "vidskiptavinir" ? (
          <>
            <div className="k-head">
              <h1 className="k-h1">Viðskiptavinir</h1>
              <button className="k-btn" onClick={() => setNyrOpen(true)}>+ Nýr viðskiptavinur</button>
            </div>
            <input className="k-search" placeholder="Leita…" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="k-card">
              <div className="k-list">
                {kunnarShown.map((k) => (
                  <button className="k-row" key={k.id} onClick={() => setSel(k)}>
                    <span className="k-row-nafn">{k.nafn}</span>
                    <span className="k-row-meta">{k.tegund === "heimili" ? "Heimili" : "Fyrirtæki"} · {k.stadur}</span>
                    <span className="k-row-taeki">{(taekiByKunni[k.id] || []).length} tæki</span>
                    <Pill s={worst(k.id)} />
                  </button>
                ))}
                {kunnarShown.length === 0 && <p className="k-empty">Enginn viðskiptavinur fannst.</p>}
              </div>
            </div>
          </>
        ) : view === "bunadur" ? (
          <>
            <h1 className="k-h1">Búnaður</h1>
            <div className="k-card">
              <table className="k-table">
                <thead><tr><th>Tæki</th><th>Viðskiptavinur</th><th>Staðsetning</th><th>Raðnr.</th><th>Næsta skoðun</th><th>Staða</th></tr></thead>
                <tbody>
                  {taeki.map((t) => {
                    const k = kunnar.find((x) => x.id === t.vidskiptavinur_id);
                    return (
                      <tr key={t.id}>
                        <td><b>{t.tegund}</b>{t.eldflokkur ? <em className="k-fl">{t.eldflokkur}</em> : null}</td>
                        <td>{k?.nafn || "—"}</td>
                        <td>{t.stadsetning}</td>
                        <td className="k-mono">{t.radnr}</td>
                        <td>{fmtDate(t.naesta_skodun)}</td>
                        <td><Pill s={status(t.naesta_skodun)} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : view === "skodanir" ? (
          <>
            <h1 className="k-h1">Skoðanir</h1>
            {(["late", "warn", "ok"] as const).map((grp) => {
              const rows = taeki.filter((t) => status(t.naesta_skodun) === grp).sort((a, b) => (a.naesta_skodun || "").localeCompare(b.naesta_skodun || ""));
              if (!rows.length) return null;
              return (
                <div className="k-card" key={grp}>
                  <div className="k-card-h"><h2>{ST_LABEL[grp]}</h2><span>{rows.length}</span></div>
                  <div className="k-list">
                    {rows.map((t) => {
                      const k = kunnar.find((x) => x.id === t.vidskiptavinur_id);
                      return (
                        <div className="k-row static" key={t.id}>
                          <span className="k-row-nafn">{t.tegund} <em className="k-dim">· {k?.nafn}</em></span>
                          <span className="k-row-meta">{t.stadsetning}</span>
                          <span className="k-row-taeki">{fmtDate(t.naesta_skodun)}</span>
                          <Pill s={grp} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </>
        ) : view === "einingar" ? (
          <>
            <h1 className="k-h1">Einingar</h1>
            <p className="k-lede">Kveiktu á eiginleikum eftir þörfum — þrepaskipt. Kerfið byrjar hreint og vex með fyrirtækinu, alveg eins og Slökkvitæki/Brunahólf gerðu.</p>
            {STAGES.map((stg) => (
              <div className="k-stage" key={stg.n}>
                <div className="k-stage-h"><span className="k-stage-n">{stg.n === 0 ? "◉" : stg.n}</span>{stg.label}</div>
                <div className="k-mods">
                  {stg.n === 0 && (
                    <div className="k-mod core">
                      <div className="k-mod-t"><span aria-hidden="true">👥</span><b>Viðskiptavinir</b></div>
                      <p>Grunneiningin — viðskiptavinaskrá. Alltaf virk.</p>
                      <span className="k-mod-core">Kjarni</span>
                    </div>
                  )}
                  {MODULES.filter((m) => m.stage === stg.n).map((m) => {
                    const on = enabled.includes(m.id);
                    return (
                      <div className={`k-mod ${on ? "on" : ""}`} key={m.id}>
                        <div className="k-mod-t"><span aria-hidden="true">{m.icon}</span><b>{m.label}</b>{m.soon && <em className="k-soon">í vinnslu</em>}</div>
                        <p>{m.desc}</p>
                        <button className={`k-switch ${on ? "on" : ""}`} onClick={() => toggleMod(m.id)} aria-pressed={on}>
                          <span className="k-switch-dot" />
                          {on ? "Virk" : "Óvirk"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </>
        ) : view === "sala" ? (
          <>
            <div className="k-head">
              <h1 className="k-h1">Sala</h1>
              <div className="k-subtabs">
                <button className={salaTab === "afgreidsla" ? "on" : ""} onClick={() => setSalaTab("afgreidsla")}>Afgreiðsla</button>
                <button className={salaTab === "solur" ? "on" : ""} onClick={() => setSalaTab("solur")}>Sölur ({solur.length})</button>
              </div>
            </div>
            {salaTab === "afgreidsla" ? (
              <div className="k-pos">
                <div className="k-pos-vorur">
                  {vorur.map((v) => (
                    <button className="k-vara" key={v.id} onClick={() => addToCart(v.id)}>
                      <span className="k-vara-teg">{v.tegund === "thjonusta" ? "Þjónusta" : "Vara"}</span>
                      <b>{v.heiti}</b>
                      <span className="k-vara-verd">{kr(v.verd)}</span>
                    </button>
                  ))}
                </div>
                <div className="k-pos-cart">
                  <div className="k-cart-h">Karfa{cartCount ? <em>{cartCount}</em> : null}</div>
                  <select className="k-cart-kunni" value={salaKunni} onChange={(e) => setSalaKunni(e.target.value)}>
                    <option value="">Laus sala (enginn viðskiptavinur)</option>
                    {kunnar.map((k) => <option key={k.id} value={k.id}>{k.nafn}</option>)}
                  </select>
                  {cartLines.length === 0 ? (
                    <p className="k-empty">Smelltu á vöru til að bæta í körfu.</p>
                  ) : (
                    <>
                      <div className="k-cart-lines">
                        {cartLines.map((l) => (
                          <div className="k-cl" key={l.v.id}>
                            <span className="k-cl-nafn">{l.v.heiti}</span>
                            <div className="k-cl-qty">
                              <button onClick={() => decCart(l.v.id)} aria-label="Fækka">−</button>
                              <span>{l.f}</span>
                              <button onClick={() => addToCart(l.v.id)} aria-label="Fjölga">+</button>
                            </div>
                            <span className="k-cl-verd">{kr(l.v.verd * l.f)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="k-cart-sum">
                        <div><span>VSK innifalið</span><span>{kr(cartVsk)}</span></div>
                        <div className="tot"><span>Samtals</span><span>{kr(cartTotal)}</span></div>
                      </div>
                      <div className="k-pay">
                        {["kort", "reidufe", "reikningur"].map((g) => (
                          <button key={g} className={greidsla === g ? "on" : ""} onClick={() => setGreidsla(g)}>{GREIDSLA[g]}</button>
                        ))}
                      </div>
                      <button className="k-btn k-ljuka" onClick={ljukaSolu}>Ljúka sölu · {kr(cartTotal)}</button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="k-card">
                {solur.length === 0 ? (
                  <p className="k-empty">Engin sala skráð enn.</p>
                ) : (
                  <div className="k-list">
                    {solur.map((s) => (
                      <div className="k-row static" key={s.id}>
                        <span className="k-row-nafn">{s.vidskiptavinur_nafn || "Laus sala"}</span>
                        <span className="k-row-meta">{(s.linur || []).reduce((a, l) => a + l.fjoldi, 0)} hlutir · {GREIDSLA[s.greidslumati] || s.greidslumati}</span>
                        <span className="k-row-taeki">{fmtDateTime(s.buid_til)}</span>
                        <b className="k-sol-tot">{kr(s.samtals)}</b>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (MODULES.find((m) => m.id === view)?.soon) ? (
          <div className="k-soon-view">
            <span className="k-soon-ico">{MODULES.find((m) => m.id === view)?.icon}</span>
            <h1 className="k-h1">{MODULES.find((m) => m.id === view)?.label}</h1>
            <p className="k-lede">Þessi eining er virk en sjálf virknin kemur fljótlega. Þú getur slökkt á henni aftur á Einingar-síðunni.</p>
          </div>
        ) : null}

        {sel && (
          <div className="k-drawer-wrap" onClick={() => setSel(null)}>
            <aside className="k-drawer" onClick={(e) => e.stopPropagation()}>
              <div className="k-drawer-h">
                <div>
                  <span className="k-tag">{sel.tegund === "heimili" ? "Heimili" : "Fyrirtæki"}</span>
                  <h2>{sel.nafn}</h2>
                </div>
                <button className="k-x" onClick={() => setSel(null)} aria-label="Loka">✕</button>
              </div>
              <div className="k-kv">
                {sel.kennitala && <div><span>Kennitala</span><b className="k-mono">{sel.kennitala}</b></div>}
                {sel.heimilisfang && <div><span>Heimilisfang</span><b>{sel.heimilisfang}{sel.stadur ? `, ${sel.stadur}` : ""}</b></div>}
                {sel.simi && <div><span>Sími</span><b>{sel.simi}</b></div>}
                {sel.netfang && <div><span>Netfang</span><b>{sel.netfang}</b></div>}
              </div>
              {enabled.includes("bunadur") && (
                <div className="k-drawer-taeki">
                  <h3>Búnaður ({(taekiByKunni[sel.id] || []).length})</h3>
                  {(taekiByKunni[sel.id] || []).map((t) => (
                    <div className="k-te" key={t.id}>
                      <div>
                        <b>{t.tegund}</b>{t.eldflokkur ? <em className="k-fl">{t.eldflokkur}</em> : null}
                        <span className="k-te-loc">{t.stadsetning} · <span className="k-mono">{t.radnr}</span></span>
                      </div>
                      <div className="k-te-r">
                        <span className="k-te-date">Næst: {fmtDate(t.naesta_skodun)}</span>
                        <Pill s={status(t.naesta_skodun)} />
                      </div>
                    </div>
                  ))}
                  {(taekiByKunni[sel.id] || []).length === 0 && <p className="k-empty">Enginn búnaður skráður.</p>}
                </div>
              )}
            </aside>
          </div>
        )}

        {nyrOpen && (
          <div className="k-drawer-wrap" onClick={() => setNyrOpen(false)}>
            <aside className="k-drawer" onClick={(e) => e.stopPropagation()}>
              <div className="k-drawer-h"><h2>Nýr viðskiptavinur</h2><button className="k-x" onClick={() => setNyrOpen(false)} aria-label="Loka">✕</button></div>
              <form className="k-form" onSubmit={addKunni}>
                <label>Nafn<input name="nafn" required /></label>
                <label>Tegund
                  <select name="tegund" defaultValue="fyrirtaeki"><option value="fyrirtaeki">Fyrirtæki</option><option value="heimili">Heimili</option></select>
                </label>
                <label>Kennitala<input name="kennitala" /></label>
                <label>Heimilisfang<input name="heimilisfang" /></label>
                <label>Staður<input name="stadur" /></label>
                <label>Sími<input name="simi" /></label>
                <label>Netfang<input name="netfang" type="email" /></label>
                <button className="k-btn" type="submit">Vista viðskiptavin</button>
              </form>
            </aside>
          </div>
        )}

        {salaDone && (
          <div className="k-drawer-wrap" onClick={() => setSalaDone(null)}>
            <aside className="k-drawer" onClick={(e) => e.stopPropagation()}>
              <div className="k-receipt">
                <span className="k-receipt-ok">✓</span>
                <h2>Sala kláruð</h2>
                <p className="k-dim">{salaDone.vidskiptavinur_nafn || "Laus sala"} · {GREIDSLA[salaDone.greidslumati] || salaDone.greidslumati}</p>
                <div className="k-receipt-lines">
                  {salaDone.linur.map((l, i) => (
                    <div key={i}><span>{l.fjoldi}× {l.heiti}</span><span>{kr(l.verd * l.fjoldi)}</span></div>
                  ))}
                </div>
                <div className="k-receipt-tot"><span>Samtals</span><span>{kr(salaDone.samtals)}</span></div>
                <button className="k-btn" onClick={() => setSalaDone(null)}>Loka</button>
              </div>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
