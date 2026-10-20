"use client";

import { useState, type ReactNode } from "react";
import { HeimilisfangLeit } from "../turbopaint/components/kjarni/HeimilisfangLeit";
import { ARTCRAFT_INTERFACES } from "../artcraft/apps";
import { CONNS, GALLERY, MOD_COUNT, QUICK_GROUPS, kr } from "../data";
import { SYSTEMS, FILTERS, ext, dags, type Filter, type StodKerfi } from "../stod-gogn";
import { useStationSkin } from "../StationChrome";
import type { RagnarokData } from "../ragnarok/RagnarokView";
import "./stod.css";

/* Stjórnstöðin í hönnunarkerfum fyrirtækjanna (15.10.2026). Agnar: „breyta líka layoutinu, boxunum, fonts, eins
 * og þetta væri síða þar, svipað layout og í Ragnarök" · „settu smá metnað í þetta".
 * Sama röð og í Ragnarök — hetja með merki → kaflar → kerfin → teikningaleit + ArtCraft → tölur → yfirsýn →
 * vefir → einingar → aðstoð — og sömu gögn (MasterClient). Hvert kerfi teiknar hlutina á sinn hátt (stod.css):
 *   Miðakerfi  — kerfin eru afhendingarmiðar (rifflipi, götun, Sækja), dálkar á stálplötu undir málmhaus
 *   Brunastál  — stálspjöld með hnoðuðum málmhaus og silfurplötu, síðuhaus í málmi, Playfair-tölur
 *   Big Boss   — upphleyptar pappírsplötur með rjómaræmu, gullpeningur í stað kjarnahringsins, gulllínur
 *   Brunahólf  — navy hetja, flísar með appelsínugulum táknhring, traustræma, pillur — eins og vefurinn */

type Thema = "midakerfi" | "brunastal" | "boss" | "brunaholf";

const YFIR: Record<Thema, string> = {
  midakerfi: "Afgreiðsla · Stjórnstöð",
  brunastal: "Brunastál · Master-bakendi",
  boss: "Brunahólf · Kjarni",
  brunaholf: "Kjarni · stjórnstöð",
};

const STADA: Record<StodKerfi["state"], string> = { VIRKT: "Virkt", "DRÖG": "Drög", YTRA: "Ytra" };

const KAFLAR = [
  { id: "st-yfirlit", label: "Yfirlit" },
  { id: "st-vefir", label: "Vefir" },
  { id: "st-einingar", label: "Einingar" },
  { id: "st-adstod", label: "Aðstoð" },
] as const;

/* stroke-tákn (24 × 24, currentColor) — engin emoji í kerfunum */
const TAKN: Record<string, ReactNode> = {
  pensill: <><path d="M4 20c2.5 0 4-1.2 4-3.5a2 2 0 0 1 4 0" /><path d="M10.5 14.5 20 5a2.1 2.1 0 0 0-3-3l-9.5 9.5" /></>,
  litir: <><path d="M12 3a9 9 0 1 0 0 18 2 2 0 0 0 1.5-3.3 2 2 0 0 1 1.5-3.3h2.4A4.6 4.6 0 0 0 21 9.8C21 6 17 3 12 3z" /><circle cx="7.5" cy="10.5" r="1" /><circle cx="10.5" cy="7" r="1" /><circle cx="15" cy="7.5" r="1" /></>,
  grind: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  maelabord: <><path d="M4 18a8 8 0 1 1 16 0" /><path d="m12 18 4-6" /><path d="M3 18h18" /></>,
  lykill: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z" />,
  skjal: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h6" /></>,
  flug: <path d="M10.5 13.5 3 11l1-2 8 .5L16 5a1.8 1.8 0 0 1 3 2l-4 4 .5 8-2 1-2.5-7.5-3 3v3l-1.5.5-1-3-3-1 .5-1.5h3z" />,
  tilraun: <><path d="M9 3h6" /><path d="M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3" /><path d="M7 15h10" /></>,
  teningur: <><path d="M12 2 3 7v10l9 5 9-5V7z" /><path d="m3 7 9 5 9-5" /><path d="M12 12v10" /></>,
  merki: <path d="M6 3h12v18l-6-4-6 4z" />,
  vefur: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9z" /></>,
  poki: <><path d="M6 7h12l-1 13H7z" /><path d="M9 7a3 3 0 0 1 6 0" /></>,
  hopur: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.6c1.6.8 2.7 2.5 3 5.4" /></>,
  or: <path d="M5 12h14M13 6l6 6-6 6" />,
  ytri: <path d="M7 17 17 7M9 7h8v8" />,
  plus: <path d="M12 5v14M5 12h14" />,
  loka: <path d="M6 6l12 12M18 6 6 18" />,
};
function Ico({ n, className = "kst-ico" }: { n: string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {TAKN[n]}
    </svg>
  );
}

/* Spjald: stálspjald / dálkur / pappírsplata / hvítt spjald — hausinn er málmur, rjómaræma eða fyrirsögn eftir kerfi */
function Spjald({ titill, plata, haegri, className = "", children }: { titill: string; plata?: ReactNode; haegri?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`kst-spjald ${className}`}>
      <header className="kst-spjald-h">
        <h2 className="kst-spjald-t">{titill}</h2>
        {plata != null && <span className="kst-plata">{plata}</span>}
        {haegri}
      </header>
      <div className="kst-spjald-b">{children}</div>
    </section>
  );
}

/* Merki hetjunnar — kemur í stað kjarnahrings Ragnaraks */
function Merki({ thema, d }: { thema: Thema; d: RagnarokData }) {
  const rodir = [
    { l: "Vefir & kerfi", v: d.sites.length, i: "vefur" },
    { l: "Pantanir", v: d.ordersCount, i: "poki" },
    { l: "Fyrirspurnir", v: d.inqCount, i: "skjal" },
    { l: "Viðskiptavinir", v: d.kKunnar, i: "hopur" },
  ];
  if (thema === "boss") {
    return (
      <div className="kst-merki kst-mynt" aria-label={`Kjarni — ${d.readyCount} af ${d.totalCount} einingum tilbúnar`}>
        <div className="kst-mynt-hringur">
          <span className="kst-mynt-efst">Stjórnstöð</span>
          <span className="kst-mynt-nafn">Kjarni</span>
          <span className="kst-mynt-lina" aria-hidden="true" />
          <span className="kst-mynt-tala">{d.readyCount}<small>/{d.totalCount}</small></span>
          <span className="kst-mynt-nedst">einingar</span>
        </div>
      </div>
    );
  }
  return (
    <div className="kst-merki kst-stadspjald">
      <div className="kst-stadspjald-h">
        <i className="kst-led" aria-hidden="true" />
        <span className="kst-stadspjald-t">Staða kjarnans</span>
        <span className="kst-stadspjald-n">
          {d.readyCount}
          <small>/{d.totalCount}</small>
        </span>
      </div>
      <ul className="kst-stadspjald-b">
        {rodir.map((r) => (
          <li key={r.l}>
            <span className="kst-stadspjald-ico"><Ico n={r.i} /></span>
            <span className="kst-stadspjald-l">{r.l}</span>
            <b>{r.v}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StodView(d: RagnarokData) {
  const { skin } = useStationSkin();
  const thema = (skin === "ragnarok" ? "midakerfi" : skin) as Thema;
  const [kafli, setKafli] = useState<string>("st-yfirlit");
  const [sia, setSia] = useState<Filter>("allt");

  const tolur = [
    { l: "Vefir & kerfi", v: d.sites.length, of: "", i: "vefur" },
    { l: "Einingar tilbúnar", v: d.readyCount, of: `/${d.totalCount}`, i: "grind" },
    { l: "Pantanir", v: d.ordersCount, of: "", i: "poki" },
    { l: "Kerfi-viðskiptavinir", v: d.kKunnar, of: "", i: "hopur" },
  ];

  return (
    <div className="kst" data-thema={thema}>
      <div className="kst-in">
        {/* ── hetjan ─────────────────────────────────────────────────────── */}
        <header className="kst-hetja">
          <div className="kst-hetja-txt">
            <span className="kst-yfir"><i className="kst-led" aria-hidden="true" />{YFIR[thema]}</span>
            <h1 className="kst-h1">
              Kjarni · <em>Stjórnstöð</em>
            </h1>
            <span className="kst-gulllina" aria-hidden="true" />
            <p className="kst-inng">Master-bakendi — vefir, einingar og tól á einum stað. Opnaðu tól, fylgstu með vefjum og settu upp næsta kerfi.</p>
            <div className="kst-hnappar">
              <a className="kst-btn adal" href="/kjarni/turbopaint">
                Opna TurboPaint <Ico n="or" />
              </a>
              <a className="kst-btn" href="/kerfi">Kerfi</a>
              <a className="kst-btn" href="/stjorn">Stjórnborð</a>
            </div>
          </div>
          <Merki thema={thema} d={d} />
        </header>

        {/* ── kaflar ─────────────────────────────────────────────────────── */}
        <nav className="kst-kaflar" aria-label="Kaflar">
          {KAFLAR.map((k) => (
            <a key={k.id} href={`#${k.id}`} onClick={() => setKafli(k.id)} className={`kst-kafli ${kafli === k.id ? "on" : ""}`} aria-current={kafli === k.id ? "true" : undefined}>
              {k.label}
            </a>
          ))}
        </nav>

        {/* ── yfirlit: kerfin ────────────────────────────────────────────── */}
        <section id="st-yfirlit" className="kst-kafla">
          <div className="kst-kafla-h">
            <h2 className="kst-h2">Kerfin</h2>
            <span className="kst-fjoldi">{SYSTEMS.length} kerfi · {SYSTEMS.filter((s) => s.state === "VIRKT").length} virk</span>
          </div>
          <div className="kst-kerfi">
            {SYSTEMS.map((s) => (
              <a key={s.name} href={s.href} className="kst-sys" data-state={s.state} {...(s.state === "YTRA" ? { target: "_blank", rel: "noreferrer" } : {})}>
                <span className="kst-sys-in">
                  {/* rifflipinn (Miðakerfi): tegund + stimpill */}
                  <span className="kst-sys-stub" aria-hidden="true">
                    <span className="kst-sys-kind">{s.kind}</span>
                    <span className="kst-sys-stimp">{STADA[s.state]}</span>
                  </span>
                  <span className="kst-sys-b">
                    <span className="kst-sys-h">
                      <span className="kst-sys-ico"><Ico n={s.ico} /></span>
                      <span className="kst-sys-kick">{s.kind}</span>
                      <b className="kst-sys-n">{s.name}</b>
                      <span className="kst-sys-plata"><i className="kst-led" aria-hidden="true" />{STADA[s.state]}</span>
                    </span>
                    <span className="kst-sys-d">{s.desc}</span>
                    <span className="kst-sys-f">
                      <code>{s.href}</code>
                      <span className="kst-sys-go">
                        Opna <Ico n={s.state === "YTRA" ? "ytri" : "or"} />
                      </span>
                    </span>
                  </span>
                </span>
              </a>
            ))}
          </div>

          {/* ── teikningaleit + ArtCraft ─────────────────────────────────── */}
          <div className="kst-tvo">
            <section className="kst-leit">
              <div className="kst-leit-h">
                <div>
                  <h2 className="kst-leit-t">Teikningar — heimilisfang</h2>
                  <p>Leitaðu og smelltu á teikningu — hún opnast á TurboPaint-borðinu.</p>
                </div>
                <a className="kst-leit-link" href="/kjarni/turbopaint">Opna borðið <Ico n="or" /></a>
              </div>
              <div className="kst-leit-reitur">
                <HeimilisfangLeit
                  onVelja={(infoUrl) => {
                    window.location.href = `/kjarni/turbopaint?plan=${encodeURIComponent(infoUrl)}`;
                  }}
                />
              </div>
            </section>
            <Spjald titill="ArtCraft — viðmót" plata={`${ARTCRAFT_INTERFACES.filter((i) => i.id !== "hub").length} viðmót`} haegri={<a className="kst-hlekkur" href="/kjarni/artcraft">Opna yfirlit <Ico n="or" /></a>}>
              <div className="kst-tenglar">
                {ARTCRAFT_INTERFACES.filter((item) => item.id !== "hub").map((item) => (
                  <a key={item.id} href={item.href} className="kst-tengill">{item.name}</a>
                ))}
              </div>
            </Spjald>
          </div>

          {/* ── tölur ────────────────────────────────────────────────────── */}
          <div className="kst-tolur">
            {tolur.map((t) => (
              <div key={t.l} className="kst-tala">
                <span className="kst-tala-ico"><Ico n={t.i} /></span>
                <span className="kst-tala-l"><i className="kst-led" aria-hidden="true" />{t.l}</span>
                <b className="kst-tala-v">
                  {t.v}
                  {t.of && <small>{t.of}</small>}
                </b>
              </div>
            ))}
          </div>

          {/* ── yfirsýn: allt á einum stað + virkni ─────────────────────── */}
          <div className="kst-yfirsyn">
            <Spjald titill="Allt á einum stað">
              {QUICK_GROUPS.map((g) => (
                <div key={g.title} className="kst-hopur">
                  <div className="kst-merkimidi">{g.title}</div>
                  <div className="kst-tenglar">
                    {g.items.map((q) => (
                      <a key={q.label} href={q.href} className="kst-tengill" {...(q.ext ? { target: "_blank", rel: "noreferrer" } : {})}>
                        {q.label}
                        {q.ext && <Ico n="ytri" />}
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </Spjald>
            <Spjald titill="Nýjasta virknin" plata={d.activity.length ? `${d.activity.length} nýjast` : "Engin"}>
              {d.activity.length === 0 ? (
                <p className="kst-tomt">Engin virkni enn. Pantanir og fyrirspurnir af vefjunum birtast hér.</p>
              ) : (
                <ul className="kst-virkni">
                  {d.activity.map((a, i) => (
                    <li key={i}>
                      <span className={`kst-virkni-t ${a.t === "pöntun" ? "pontun" : "fyrirspurn"}`}>{a.t}</span>
                      <b>{a.nafn || "—"}</b>
                      <time>{a.when ? dags(a.when) : ""}</time>
                      <span className="kst-virkni-s">{a.sub}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Spjald>
          </div>
        </section>

        {/* ── vefir & kerfi ──────────────────────────────────────────────── */}
        <section id="st-vefir" className="kst-kafla">
          <div className="kst-kafla-h">
            <h2 className="kst-h2">Vefir &amp; kerfi</h2>
            <button type="button" className="kst-btn adal sm" onClick={() => d.setAddOpen(true)}>
              <Ico n="plus" /> Nýr vefur
            </button>
          </div>
          <div className="kst-vefir">
            <Spjald titill="Slökkvitæki vefur" plata="Í loftinu" className="kst-vefur">
              <p className="kst-vefur-d">Vefverslun + kynningarsíða</p>
              <dl className="kst-reitir">
                <div><dt>Síður</dt><dd>{d.sidurCount}</dd></div>
                <div><dt>Pantanir</dt><dd>{d.ordersCount}</dd></div>
                <div><dt>Fyrirspurnir</dt><dd>{d.inqCount}</dd></div>
              </dl>
              <div className="kst-vefur-btns">
                <a className="kst-btn sm" href="/" target="_blank" rel="noreferrer">Forsíða <Ico n="ytri" /></a>
                <a className="kst-btn sm" href="/verslun" target="_blank" rel="noreferrer">Verslun <Ico n="ytri" /></a>
                <a className="kst-btn adal sm" href="/stjorn">Stjórnborð <Ico n="or" /></a>
              </div>
            </Spjald>
            <Spjald titill="Kerfi — þjónustukerfi" plata="Í loftinu" className="kst-vefur">
              <p className="kst-vefur-d">Viðskiptavinir · búnaður · sala · verkstæði</p>
              <dl className="kst-reitir">
                <div><dt>Viðskiptavinir</dt><dd>{d.kKunnar}</dd></div>
                <div><dt>Einingar</dt><dd>{d.einingarCount}<small>/{MOD_COUNT}</small></dd></div>
                <div><dt>Sölur</dt><dd>{d.solurCount}</dd></div>
              </dl>
              <p className="kst-vefur-sala">Sala samtals <b>{kr(d.salesTotal)}</b></p>
              <div className="kst-vefur-btns">
                <a className="kst-btn sm" href="/kerfi" target="_blank" rel="noreferrer">Nýr gluggi <Ico n="ytri" /></a>
                <a className="kst-btn adal sm" href="/kerfi">Opna kerfi <Ico n="or" /></a>
              </div>
            </Spjald>
            {d.userSites.map((s) => (
              <Spjald key={s.id} titill={s.nafn} plata="Nýr" className="kst-vefur">
                <p className="kst-vefur-d">{s.tegund === "kerfi" ? "Þjónustukerfi" : "Vefur"} · /s/{s.slug}</p>
                <p className="kst-tomt">Tilbúinn til að byggja.</p>
                <div className="kst-vefur-btns">
                  <button type="button" className="kst-btn haetta sm" onClick={() => d.onDelSite(s.id)}>Eyða</button>
                  <a className="kst-btn adal sm" href={`/s/${s.slug}`} target="_blank" rel="noreferrer">Opna <Ico n="ytri" /></a>
                </div>
              </Spjald>
            ))}
            <button type="button" className="kst-nyr" onClick={() => d.setAddOpen(true)}>
              <span className="kst-nyr-plus"><Ico n="plus" /></span>
              <b>Nýr vefur eða kerfi</b>
              <small>Settu upp næsta þjónustufyrirtæki eða vef á sama grunni.</small>
            </button>
          </div>
        </section>

        {/* ── einingar ───────────────────────────────────────────────────── */}
        <section id="st-einingar" className="kst-kafla">
          <div className="kst-kafla-h">
            <div>
              <h2 className="kst-h2">Einingar &amp; tól</h2>
              <p className="kst-undir">{d.readyCount} tilbúnar einingar og tól — kveiktu á þeim eftir þörf á hverjum vef eða kerfi.</p>
            </div>
          </div>
          <div className="kst-sia" role="tablist" aria-label="Sía einingar">
            {FILTERS.map((f) => (
              <button key={f} type="button" role="tab" aria-selected={sia === f} className={`kst-sia-btn ${sia === f ? "on" : ""}`} onClick={() => setSia(f)}>
                {f === "allt" ? "Allt" : f}
              </button>
            ))}
          </div>
          {GALLERY.map((g) => {
            const items = g.items.filter((it) => sia === "allt" || it.tag === sia);
            if (items.length === 0) return null;
            return (
              <Spjald key={g.group} titill={g.group} plata={items.length} className="kst-gal">
                <p className="kst-undir">{g.sub}</p>
                <div className="kst-gal-grid">
                  {items.map((it) => {
                    const inner = (
                      <>
                        <span className="kst-eining-h">
                          <b>{it.nafn}</b>
                          <span className="kst-eining-tag">{it.tag}</span>
                        </span>
                        <span className="kst-eining-d">{it.desc}</span>
                        <span className={`kst-eining-s ${it.ready ? "tilbuid" : ""}`}><i className="kst-led" aria-hidden="true" />{it.ready ? "Tilbúið" : "Í vinnslu"}</span>
                      </>
                    );
                    return it.href && it.ready ? (
                      <a key={it.nafn} href={it.href} className="kst-eining">{inner}</a>
                    ) : (
                      <div key={it.nafn} className={`kst-eining ${it.ready ? "" : "wip"}`}>{inner}</div>
                    );
                  })}
                </div>
              </Spjald>
            );
          })}
        </section>

        {/* ── aðstoð ─────────────────────────────────────────────────────── */}
        <section id="st-adstod" className="kst-kafla">
          <div className="kst-kafla-h">
            <h2 className="kst-h2">Aðstoðarborð</h2>
          </div>
          <div className="kst-adstod">
            {CONNS.map((c) => (
              <Spjald key={c.nafn} titill={c.nafn} plata={c.status} className={`kst-tenging ${c.on ? "on" : ""}`}>
                <p className="kst-tenging-d">{c.how}</p>
                <a className="kst-btn sm" href={c.href} {...ext(c.href)}>
                  {c.cta} <Ico n="or" />
                </a>
              </Spjald>
            ))}
          </div>
        </section>
      </div>

      {d.addOpen && (
        <div className="kst-gluggi-bak" onClick={() => d.setAddOpen(false)}>
          <div className="kst-gluggi" role="dialog" aria-modal="true" aria-labelledby="kst-gluggi-t" onClick={(e) => e.stopPropagation()}>
            <header className="kst-spjald-h">
              <h2 className="kst-spjald-t" id="kst-gluggi-t">Nýr vefur eða kerfi</h2>
              <button type="button" className="kst-x" onClick={() => d.setAddOpen(false)} aria-label="Loka">
                <Ico n="loka" />
              </button>
            </header>
            <form onSubmit={d.onAddSite} className="kst-form">
              <label>
                <span>Nafn</span>
                <input className="kst-reitur" name="nafn" required placeholder="t.d. Rafverk ehf" autoFocus />
              </label>
              <label>
                <span>Tegund</span>
                <select className="kst-reitur" name="tegund" defaultValue="vefur">
                  <option value="vefur">Vefur (kynningarsíða / verslun)</option>
                  <option value="kerfi">Kerfi (þjónustufyrirtæki)</option>
                </select>
              </label>
              <button className="kst-btn adal" type="submit" disabled={d.saving}>
                {d.saving ? "Stofna…" : "Stofna vef"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
