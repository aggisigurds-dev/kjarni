"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { PRODUCTS, CATEGORIES, ELDFLOKKAR, type Product } from "./products";
import { Banner } from "../Banner";
import { sbInsert } from "../lib/supabase";

const kr = (n: number) =>
  Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".") + " kr";

export default function StoreClient() {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [cat, setCat] = useState<string>("all");
  const [fire, setFire] = useState<string>("");
  const [query, setQuery] = useState("");
  const [onlyStock, setOnlyStock] = useState(false);
  const [showVsk, setShowVsk] = useState(true);
  const [open, setOpen] = useState(false);
  const [checkout, setCheckout] = useState(false);
  const [ord, setOrd] = useState({ nafn: "", netfang: "", simi: "", heimilisfang: "" });
  const [ordState, setOrdState] = useState<"idle" | "sending" | "done" | "error">("idle");

  const setOrdF = (k: keyof typeof ord, v: string) => setOrd((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    try {
      const raw = localStorage.getItem("slok_cart");
      if (raw) setCart(JSON.parse(raw));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("slok_cart", JSON.stringify(cart));
    } catch {}
  }, [cart]);

  const add = (id: string) => setCart((c) => ({ ...c, [id]: (c[id] || 0) + 1 }));
  const dec = (id: string) =>
    setCart((c) => {
      const q = (c[id] || 0) - 1;
      const n = { ...c };
      if (q <= 0) delete n[id];
      else n[id] = q;
      return n;
    });
  const remove = (id: string) =>
    setCart((c) => {
      const n = { ...c };
      delete n[id];
      return n;
    });

  const byId = useMemo(
    () => Object.fromEntries(PRODUCTS.map((p) => [p.id, p])) as Record<string, Product>,
    [],
  );
  const catById = useMemo(() => Object.fromEntries(CATEGORIES.map((c) => [c.id, c])), []);

  const counts = useMemo(() => {
    const m: Record<string, number> = { all: PRODUCTS.length };
    for (const c of CATEGORIES) m[c.id] = PRODUCTS.filter((p) => p.category === c.id).length;
    return m;
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PRODUCTS.filter((p) => {
      if (cat !== "all" && p.category !== cat) return false;
      if (fire && !p.eldflokkur.includes(fire)) return false;
      if (onlyStock && p.stock <= 0) return false;
      if (q && !(`${p.name} ${p.eldflokkur}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [cat, fire, onlyStock, query]);

  const lines = useMemo(
    () =>
      Object.entries(cart)
        .map(([id, qty]) => ({ p: byId[id], qty }))
        .filter((l) => l.p),
    [cart, byId],
  );
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const totalVsk = lines.reduce((s, l) => s + l.p.price * l.qty, 0);
  const totalNoVsk = lines.reduce((s, l) => s + l.p.priceNoVsk * l.qty, 0);
  const vsk = totalVsk - totalNoVsk;

  async function submitOrder(e: FormEvent) {
    e.preventDefault();
    setOrdState("sending");
    try {
      await sbInsert("kjarni_pantanir", {
        ...ord,
        karfa: lines.map((l) => ({ id: l.p.id, nafn: l.p.name, fjoldi: l.qty, verd: l.p.price })),
        samtals: totalVsk,
        uppruni: "slokkvitaeki-vefur",
      });
      setCart({});
      setOrd({ nafn: "", netfang: "", simi: "", heimilisfang: "" });
      setOrdState("done");
    } catch {
      setOrdState("error");
    }
  }

  const catLabel = cat === "all" ? "Brunavarnabúnaður" : catById[cat]?.label;

  return (
    <div className="vs">
      <Banner />
      <header className="vs-bar">
        <a className="vs-brand" href="/" aria-label="Forsíða">
          <span className="vs-badge">B</span>
          <span className="vs-brand-name">
            Brunahólf<small>SLÖKKVITÆKI EHF.</small>
          </span>
        </a>
        <label className="vs-search">
          <span className="vs-search-ico" aria-hidden="true">⌕</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Leita að tæki, stærð eða eldflokki…"
            aria-label="Leita"
          />
          <kbd>⌘K</kbd>
        </label>
        <nav className="vs-nav">
          <a href="/#thjonusta">Þjónusta</a>
          <a href="/#hafa-samband">Fyrirtæki</a>
          <button className="vs-cart-btn" onClick={() => setOpen(true)} aria-label="Opna körfu">
            Karfa
            <span className="vs-cart-n">{count}</span>
          </button>
        </nav>
      </header>

      <div className="vs-main">
        <aside className="vs-side">
          <div className="vs-card vs-filter">
            <p className="vs-filter-h">Flokkar</p>
            <ul>
              <li>
                <button className={cat === "all" ? "on" : ""} onClick={() => setCat("all")}>
                  <span>Allt</span>
                  <em>{counts.all}</em>
                </button>
              </li>
              {CATEGORIES.map((c) => (
                <li key={c.id}>
                  <button className={cat === c.id ? "on" : ""} onClick={() => setCat(c.id)}>
                    <span>{c.label}</span>
                    <em>{counts[c.id]}</em>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="vs-card vs-filter">
            <p className="vs-filter-h">Eldflokkur</p>
            <div className="vs-fire">
              <button className={fire === "" ? "on" : ""} onClick={() => setFire("")}>Allir</button>
              {ELDFLOKKAR.map((e) => (
                <button
                  key={e.k}
                  className={fire === e.k ? "on" : ""}
                  onClick={() => setFire(fire === e.k ? "" : e.k)}
                >
                  {e.k}
                </button>
              ))}
            </div>
            <p className="vs-fire-legend">
              {ELDFLOKKAR.map((e, i) => (
                <span key={e.k}>
                  <b>{e.k}</b> = {e.label}
                  {i < ELDFLOKKAR.length - 1 ? " · " : ""}
                </span>
              ))}
            </p>
          </div>

          <div className="vs-card vs-advice">
            <b>Þarftu ráðgjöf?</b>
            <p>Við förum yfir húsnæðið og setjum upp réttan búnað — með QR-merkingu og eftirliti.</p>
            <a href="tel:5654080">Hringdu · 565-4080</a>
          </div>
        </aside>

        <div className="vs-content">
          <p className="vs-eyebrow">Verslun</p>
          <h1 className="vs-title">
            {catLabel} <span>á lager í Hafnarfirði</span>
          </h1>
          <p className="vs-lede">
            Ertu ekki viss hvað þú þarft? Veldu eldflokk í síunni til vinstri eða hringdu í 565-4080.
          </p>

          <div className="vs-tools">
            <span className="vs-tools-count">{shown.length} vörur</span>
            <div className="vs-tools-right">
              <button
                className={`vs-toggle ${onlyStock ? "on" : ""}`}
                onClick={() => setOnlyStock((v) => !v)}
              >
                Aðeins á lager
              </button>
              <div className="vs-seg">
                <button className={showVsk ? "on" : ""} onClick={() => setShowVsk(true)}>Með vsk</button>
                <button className={!showVsk ? "on" : ""} onClick={() => setShowVsk(false)}>Án vsk</button>
              </div>
            </div>
          </div>

          {shown.length === 0 ? (
            <p className="vs-empty">Engin vara fannst — prófaðu annan flokk eða leit.</p>
          ) : (
            <div className="vs-grid">
              {shown.map((p) => {
                const c = catById[p.category];
                const sold = p.stock <= 0;
                const big = showVsk ? p.price : p.priceNoVsk;
                const small = showVsk ? `${kr(p.priceNoVsk)} án vsk` : `${kr(p.price)} m. vsk`;
                return (
                  <article className="vs-prod" key={p.id}>
                    <div className="vs-prod-img" style={{ background: p.img ? "#fff" : c?.tint }}>
                      {p.eldflokkur && <span className="vs-tag">{p.eldflokkur}</span>}
                      {!p.eldflokkur && <span className="vs-tag vs-tag-muted">—</span>}
                      <span className={`vs-pill ${sold ? "out" : "in"}`}>{sold ? "Uppselt" : "Á lager"}</span>
                      {p.img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.img} alt={p.name} loading="lazy" />
                      ) : (
                        <span className="vs-emoji" aria-hidden="true">{c?.icon}</span>
                      )}
                    </div>
                    <div className="vs-prod-b">
                      <h3>{p.name}</h3>
                      <div className="vs-price">
                        <span className="vs-price-big">{kr(big)}</span>
                        <span className="vs-price-small">{small}</span>
                      </div>
                      {sold ? (
                        <a className="vs-notify" href="/#hafa-samband">Láta vita þegar til</a>
                      ) : (
                        <button className="vs-add" onClick={() => add(p.id)}>Bæta í körfu</button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <div className="vs-help">
            <div>
              <b>Sérðu ekki það sem þú leitar að?</b>
              <span>Við útvegum búnað fyrir skip, iðnað og stærri rekstur — sendu fyrirspurn og við finnum rétta tækið.</span>
            </div>
            <a href="/#hafa-samband">Senda fyrirspurn</a>
          </div>
        </div>
      </div>

      <div
        className={`drawer-wrap ${open ? "show" : ""}`}
        onClick={() => setOpen(false)}
        aria-hidden={!open}
      >
        <aside className="drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Karfa">
          <div className="drawer-head">
            <strong>Karfan þín</strong>
            <button className="drawer-x" onClick={() => setOpen(false)} aria-label="Loka">✕</button>
          </div>

          {lines.length === 0 ? (
            <p className="drawer-empty">Karfan er tóm — bættu við vöru til að byrja.</p>
          ) : (
            <>
              <div className="drawer-lines">
                {lines.map((l) => (
                  <div className="dline" key={l.p.id}>
                    <div className="dline-top">
                      <span className="dline-name">{l.p.name}</span>
                      <span className="dline-price">{kr(l.p.price * l.qty)}</span>
                    </div>
                    <div className="qty">
                      <button onClick={() => dec(l.p.id)} aria-label="Fækka">−</button>
                      <span className="qty-n">{l.qty}</span>
                      <button onClick={() => add(l.p.id)} aria-label="Fjölga">+</button>
                      <button className="dline-rm" onClick={() => remove(l.p.id)}>Fjarlægja</button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="drawer-sum">
                <div className="srow"><span>Án vsk</span><span>{kr(totalNoVsk)}</span></div>
                <div className="srow"><span>VSK (24%)</span><span>{kr(vsk)}</span></div>
                <div className="srow srow-total"><span>Samtals</span><span>{kr(totalVsk)}</span></div>
              </div>

              {ordState === "done" ? (
                <p className="order-done">✓ Pöntun móttekin! Við höfum samband og staðfestum hana.</p>
              ) : checkout ? (
                <form className="checkout-form" onSubmit={submitOrder}>
                  <input required placeholder="Nafn" value={ord.nafn} onChange={(e) => setOrdF("nafn", e.target.value)} />
                  <input required type="email" placeholder="Netfang" value={ord.netfang} onChange={(e) => setOrdF("netfang", e.target.value)} />
                  <input placeholder="Sími" value={ord.simi} onChange={(e) => setOrdF("simi", e.target.value)} />
                  <input placeholder="Heimilisfang / afhending" value={ord.heimilisfang} onChange={(e) => setOrdF("heimilisfang", e.target.value)} />
                  <button className="checkout" type="submit" disabled={ordState === "sending"}>
                    {ordState === "sending" ? "Sendi…" : "Senda pöntun"}
                  </button>
                  <button type="button" className="checkout-back" onClick={() => setCheckout(false)}>← Til baka í körfu</button>
                  {ordState === "error" && <p className="checkout-err">Villa — reyndu aftur.</p>}
                </form>
              ) : (
                <button className="checkout" onClick={() => setCheckout(true)}>Til kassa →</button>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
