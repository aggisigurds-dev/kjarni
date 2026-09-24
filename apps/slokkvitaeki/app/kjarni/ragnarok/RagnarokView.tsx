"use client";

import { useState, type FormEvent } from "react";
import { HeimilisfangLeit } from "../turbopaint/components/kjarni/HeimilisfangLeit";
import { CONNS, GALLERY, MOD_COUNT, QUICK_GROUPS, kr } from "../data";
import { SKINS, type SkinId } from "../skins";
import { useStationSkin } from "../StationChrome";
import { RagnarokRing } from "./Ring";

/* Stjórnstöðin í Ragnarök-útliti (bráðið gull á svörtu stáli).
 * Fyrirmynd: „Kjarni Ragnarok" í hönnunarkerfinu — röðin er sú sama:
 * einingar-röð → hetja + kjarnahringur → kaflar → kerfisspjöld → teikningaleit
 * → tölur → tenglar/virkni → vefir & kerfi → einingar → aðstoðarborð.
 * Gögnin eru þau sömu og í klassíska útlitinu (MasterClient sækir þau). */

type Site = { id: number; nafn: string; slug: string; tegund: string };
type Activity = { t: string; nafn: string; sub: string; when: string };

export type RagnarokData = {
  sites: Site[];
  userSites: Site[];
  sidurCount: number;
  ordersCount: number;
  inqCount: number;
  kKunnar: number;
  solurCount: number;
  salesTotal: number;
  einingarCount: number;
  readyCount: number;
  totalCount: number;
  activity: Activity[];
  onAddSite: (e: FormEvent<HTMLFormElement>) => void;
  onDelSite: (id: number) => void;
  addOpen: boolean;
  setAddOpen: (open: boolean) => void;
  saving: boolean;
};

const EMBER = "#ff9a3a";
const GOLD = "#ffcf6a";
const DIM = "#bf9a5d";

const SYSTEMS: { name: string; kind: string; desc: string; href: string; state: "VIRKT" | "DRÖG" | "YTRA" }[] = [
  { name: "TurboPaint", kind: "TÓL", desc: "Gólfplön — leitaðu eftir heimilisfangi og settu teikninguna á borðið.", href: "/kjarni/turbopaint", state: "VIRKT" },
  { name: "Borð", kind: "TÓL", desc: "Sérsniðið stjórnborð — draganleg spjöld með lifandi gögnum, tenglum og klukku.", href: "/bord", state: "VIRKT" },
  { name: "Stjórnborð", kind: "VEFUR", desc: "Stjórnborð vefsins — síður, pantanir, mælingar og tengingar.", href: "/stjorn", state: "VIRKT" },
  { name: "Kerfi", kind: "EINING", desc: "Þjónustukerfið — viðskiptavinir, búnaður, skoðanir, sala og verkstæði.", href: "/kerfi", state: "VIRKT" },
  { name: "Skjalarinn", kind: "TÓL", desc: "Skjöl, pdf og skrár á einum stað.", href: "/skjalarinn", state: "VIRKT" },
  { name: "Prufusvæði", kind: "DRÖG", desc: "Blokkir, þemu og skikt — tilraunir, ekkert hér er lokaútgáfa.", href: "/draft", state: "DRÖG" },
  { name: "3dwork", kind: "YTRA", desc: "STL/mesh vinnustöð — opnast í nýjum glugga.", href: "/3dwork", state: "YTRA" },
  { name: "Marks", kind: "YTRA", desc: "Whiteboard, möppur og covers — opnast í nýjum glugga.", href: "/marks", state: "YTRA" },
];
const stateColor = (s: string) => (s === "VIRKT" ? EMBER : s === "DRÖG" ? GOLD : DIM);

const SECTIONS = [
  { id: "rg-yfirlit", label: "Yfirlit" },
  { id: "rg-vefir", label: "Vefir" },
  { id: "rg-einingar", label: "Einingar" },
  { id: "rg-adstod", label: "Aðstoð" },
] as const;

const FILTERS = ["allt", "Kerfi", "Vefur", "Tól", "Verkfæri"] as const;
type Filter = (typeof FILTERS)[number];

const ext = (href: string) => (href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {});
const dags = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
};

function Panel({ children, className = "", variant = "" }: { children: React.ReactNode; className?: string; variant?: "" | "thin" | "dim" | "hot" }) {
  return (
    <div className={`rg-panel ${variant} ${className}`}>
      <div className="rg-face">{children}</div>
    </div>
  );
}

function Tag({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="rg-tag" style={{ color }}>
      <i className="rg-dot" />
      {children}
    </span>
  );
}

export function RagnarokView(d: RagnarokData) {
  const { skin, setSkin } = useStationSkin();
  const [sub, setSub] = useState<string>("rg-yfirlit");
  const [filter, setFilter] = useState<Filter>("allt");
  const current = SKINS.find((s) => s.id === skin);

  return (
    <div className="rg rgk">
      <div className="rgk-in">
        {/* einingar-röðin = útlitin; Ragnarök er þetta, hin fara í klassíska útlitið */}
        <div className="rgk-row" role="tablist" aria-label="Útlit">
          {SKINS.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={skin === s.id}
              title={s.hint}
              className={`rg-btn ${skin === s.id ? "on" : "dim"}`}
              onClick={() => setSkin(s.id as SkinId)}
            >
              <span>{s.label}</span>
            </button>
          ))}
        </div>

        <header className="rgk-hero">
          <div className="rgk-hero-txt">
            <div className="rgk-proto rg-kicker">
              <span>RAGNARÖK PROTOCOL</span>
              <span className="rgk-proto-tags">
                <span>STJÓRNSTÖÐ</span>
                <span>ARMED</span>
              </span>
            </div>
            <h1 className="rg-h1 rg-gold-text rg-flicker">Kjarni · Stjórnstöð</h1>
            <div className="rg-bar rgk-bar" aria-hidden="true" />
            <p className="rgk-lead">Master-bakendi — vefir, einingar og tól</p>
            <p className="rgk-hud">
              SYS · ONLINE // {(current?.label ?? "Ragnarök").toUpperCase()} // {d.sites.length} VEFIR · {d.readyCount}/{d.totalCount} EININGAR
            </p>
          </div>
          <div className="rgk-core">
            <RagnarokRing size={340} label="KJARNI" bearings />
          </div>
        </header>

        <nav className="rgk-row" aria-label="Kaflar">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} onClick={() => setSub(s.id)} className={`rg-btn ${sub === s.id ? "on" : "dim"}`}>
              <span>{s.label}</span>
            </a>
          ))}
        </nav>

        <section id="rg-yfirlit" className="rgk-sec">
          <div className="rgk-systems">
            {SYSTEMS.map((s) => (
              <a
                key={s.name}
                href={s.href}
                className="rg-panel rgk-sys"
                {...(s.state === "YTRA" ? { target: "_blank", rel: "noreferrer" } : {})}
              >
                <span className="rg-face">
                  <span className="rgk-sys-top">
                    <span>{s.kind}</span>
                    <span className="rgk-state" style={{ color: stateColor(s.state) }}>
                      <i className="rg-dot" />
                      {s.state}
                    </span>
                  </span>
                  <span className="rgk-sys-name">{s.name}</span>
                  <span className="rgk-sys-desc">{s.desc}</span>
                  <span className="rgk-sys-foot">
                    <span>{s.href}</span>
                    <span className="rgk-go">OPNA {s.state === "YTRA" ? "↗" : "→"}</span>
                  </span>
                </span>
              </a>
            ))}
          </div>

          <Panel className="rgk-leit">
            <div className="rgk-h2row">
              <h2 className="rg-h2">Teikningar — heimilisfang</h2>
              <a className="rgk-link" href="/kjarni/turbopaint">OPNA BORÐIÐ →</a>
            </div>
            <p className="rgk-sub">Leitaðu hér og smelltu á teikningu — hún opnast á TurboPaint-borðinu.</p>
            <div className="rg-input-wrap rgk-leit-reitur">
              <HeimilisfangLeit
                onVelja={(infoUrl) => {
                  window.location.href = `/kjarni/turbopaint?plan=${encodeURIComponent(infoUrl)}`;
                }}
              />
            </div>
          </Panel>

          <div className="rgk-stats">
            {[
              { l: "Vefir & kerfi", v: d.sites.length, of: "" },
              { l: "Einingar tilbúnar", v: d.readyCount, of: `/${d.totalCount}` },
              { l: "Pantanir", v: d.ordersCount, of: "" },
              { l: "Kerfi-viðskiptavinir", v: d.kKunnar, of: "" },
            ].map((s) => (
              <Panel key={s.l} variant="thin" className="rgk-stat">
                <div className="rgk-stat-l">{s.l}</div>
                <div className="rgk-stat-v">
                  <b>{s.v}</b>
                  {s.of && <small>{s.of}</small>}
                </div>
              </Panel>
            ))}
          </div>

          <div className="rgk-overview">
            <div className="rgk-col">
              <h2 className="rg-h2">Allt á einum stað</h2>
              {QUICK_GROUPS.map((g) => (
                <div key={g.title} className="rgk-group">
                  <div className="rgk-kick">{g.title.toUpperCase()}</div>
                  <div className="rgk-launch">
                    {g.items.map((q) => (
                      <a key={q.label} href={q.href} className="rgk-lnk" {...(q.ext ? { target: "_blank", rel: "noreferrer" } : {})}>
                        <span>
                          <i className="rg-diamond" />
                          {q.label}
                          {q.ext ? " ↗" : ""}
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="rgk-col">
              <h2 className="rg-h2">Nýjasta virknin</h2>
              <Panel>
                {d.activity.length === 0 ? (
                  <p className="rgk-empty">Engin virkni enn.</p>
                ) : (
                  <div className="rgk-act">
                    {d.activity.map((a, i) => (
                      <div className="rgk-actrow" key={i}>
                        <span className="rg-tag" style={{ color: a.t === "pöntun" ? EMBER : GOLD }}>
                          {a.t.toUpperCase()}
                        </span>
                        <span className="rgk-act-nafn">{a.nafn || "—"}</span>
                        <span className="rgk-act-when">{a.when ? dags(a.when) : ""}</span>
                        <span className="rgk-act-sub">{a.sub}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </div>
          </div>
        </section>

        <section id="rg-vefir" className="rgk-sec">
          <div className="rgk-h2row">
            <h2 className="rg-h2">Vefir &amp; kerfi</h2>
            <button type="button" className="rg-btn gold sm" onClick={() => d.setAddOpen(true)}>
              <span>+ Nýr vefur</span>
            </button>
          </div>
          <div className="rgk-sites">
            <Panel className="rgk-site">
              <div className="rgk-site-name">Slökkvitæki vefur</div>
              <div className="rgk-site-desc">Vefverslun + kynningarsíða</div>
              <div><Tag color={EMBER}>Í LOFTINU</Tag></div>
              <div className="rg-rule" />
              <div className="rgk-site-stats">
                <div><b>{d.sidurCount}</b> síður</div>
                <div><b>{d.ordersCount}</b> pantanir</div>
                <div><b>{d.inqCount}</b> fyrirspurnir</div>
              </div>
              <div className="rgk-site-btns">
                <a className="rg-btn sm" href="/" target="_blank" rel="noreferrer"><span>Forsíða ↗</span></a>
                <a className="rg-btn sm" href="/verslun" target="_blank" rel="noreferrer"><span>Verslun ↗</span></a>
                <a className="rg-btn gold sm" href="/stjorn"><span>Stjórnborð →</span></a>
              </div>
            </Panel>

            <Panel className="rgk-site">
              <div className="rgk-site-name">Kerfi — þjónustukerfi</div>
              <div className="rgk-site-desc">Viðskiptavinir · búnaður · sala · verkstæði</div>
              <div><Tag color={EMBER}>Í LOFTINU</Tag></div>
              <div className="rg-rule" />
              <div className="rgk-site-stats">
                <div><b>{d.kKunnar}</b> viðskiptavinir</div>
                <div><b>{d.einingarCount}</b>/{MOD_COUNT} einingar</div>
                <div><b>{d.solurCount}</b> sölur · {kr(d.salesTotal)}</div>
              </div>
              <div className="rgk-site-btns">
                <a className="rg-btn sm" href="/kerfi" target="_blank" rel="noreferrer"><span>Nýr gluggi ↗</span></a>
                <a className="rg-btn gold sm" href="/kerfi"><span>Opna kerfi →</span></a>
              </div>
            </Panel>

            {d.userSites.map((s) => (
              <Panel className="rgk-site" key={s.id}>
                <div className="rgk-site-name">{s.nafn}</div>
                <div className="rgk-site-desc">{s.tegund === "kerfi" ? "Þjónustukerfi" : "Vefur"} · /s/{s.slug}</div>
                <div><Tag color={GOLD}>NÝR</Tag></div>
                <div className="rg-rule" />
                <div className="rgk-site-stats"><div>Tilbúinn til að byggja</div></div>
                <div className="rgk-site-btns">
                  <button type="button" className="rg-btn danger sm" onClick={() => d.onDelSite(s.id)}><span>Eyða</span></button>
                  <a className="rg-btn gold sm" href={`/s/${s.slug}`} target="_blank" rel="noreferrer"><span>Opna →</span></a>
                </div>
              </Panel>
            ))}

            <button type="button" className="rgk-add" onClick={() => d.setAddOpen(true)}>
              <span className="rgk-add-plus">+</span>
              <b>Nýr vefur eða kerfi</b>
              <small>Settu upp næsta þjónustufyrirtæki eða vef á sama grunni.</small>
            </button>
          </div>
        </section>

        <section id="rg-einingar" className="rgk-sec">
          <div>
            <h2 className="rg-h2">Einingar &amp; tól sem þú getur notað</h2>
            <p className="rgk-sub">
              {d.readyCount} tilbúnar einingar og tól — kveiktu á þeim eftir þörf á hverjum vef eða kerfi.
            </p>
          </div>
          <div className="rgk-row" role="tablist" aria-label="Sía einingar">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={filter === f}
                className={`rg-btn sm ${filter === f ? "on" : "dim"}`}
                onClick={() => setFilter(f)}
              >
                <span>{f === "allt" ? "Allt" : f}</span>
              </button>
            ))}
          </div>
          {GALLERY.map((g) => {
            const items = g.items.filter((it) => filter === "allt" || it.tag === filter);
            if (items.length === 0) return null;
            return (
              <div className="rgk-gal" key={g.group}>
                <div className="rgk-gal-h">
                  <div>
                    <b>{g.group}</b>
                    <span>{g.sub}</span>
                  </div>
                  <span className="rgk-count">{items.length}</span>
                </div>
                <div className="rgk-gal-grid">
                  {items.map((it) => {
                    const inner = (
                      <span className="rgk-mod-face">
                        <span className="rgk-mod-top">
                          <b>{it.nafn}</b>
                          <span className="rgk-mod-kind">{it.tag.toUpperCase()}</span>
                        </span>
                        <span className="rgk-mod-desc">{it.desc}</span>
                        <span className="rgk-mod-state" style={{ color: it.ready ? EMBER : DIM }}>
                          {it.ready ? "TILBÚIÐ" : "Í VINNSLU"}
                        </span>
                      </span>
                    );
                    return it.href && it.ready ? (
                      <a key={it.nafn} href={it.href} className="rgk-mod">{inner}</a>
                    ) : (
                      <div key={it.nafn} className={`rgk-mod ${it.ready ? "" : "wip"}`}>{inner}</div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>

        <section id="rg-adstod" className="rgk-sec">
          <h2 className="rg-h2">Aðstoðarborð</h2>
          <div className="rgk-help">
            {CONNS.map((c) => (
              <Panel key={c.nafn} variant="thin" className="rgk-conn">
                <div className="rgk-conn-h">
                  <b>{c.nafn}</b>
                  <span className="rg-tag" style={{ color: c.on ? EMBER : DIM }}>{c.status.toUpperCase()}</span>
                </div>
                <p>{c.how}</p>
                <div>
                  <a className="rg-btn sm" href={c.href} {...ext(c.href)}>
                    <span>{c.cta} →</span>
                  </a>
                </div>
              </Panel>
            ))}
          </div>
        </section>
      </div>

      {d.addOpen && (
        <div className="rgk-modal-wrap" onClick={() => d.setAddOpen(false)}>
          <div className="rg-panel rgk-modal" onClick={(e) => e.stopPropagation()}>
            <div className="rg-face">
              <div className="rgk-h2row">
                <h2 className="rg-h2">Nýr vefur eða kerfi</h2>
                <button type="button" className="rg-btn icon sm dim" onClick={() => d.setAddOpen(false)} aria-label="Loka">
                  <span>✕</span>
                </button>
              </div>
              <form onSubmit={d.onAddSite} className="rgk-form">
                <label>
                  NAFN
                  <span className="rg-input-wrap"><input className="rg-input" name="nafn" required placeholder="t.d. Rafverk ehf" autoFocus /></span>
                </label>
                <label>
                  TEGUND
                  <span className="rg-input-wrap">
                    <select className="rg-input" name="tegund" defaultValue="vefur">
                      <option value="vefur">Vefur (kynningarsíða / verslun)</option>
                      <option value="kerfi">Kerfi (þjónustufyrirtæki)</option>
                    </select>
                  </span>
                </label>
                <button className="rg-btn gold" type="submit" disabled={d.saving}>
                  <span>{d.saving ? "Stofna…" : "Stofna vef"}</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
