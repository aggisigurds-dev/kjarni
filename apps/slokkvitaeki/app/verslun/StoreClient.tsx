"use client";

import { useEffect, useMemo, useState } from "react";
import { PRODUCTS, CATEGORIES, type Product } from "./products";
import { Logo } from "../Logo";
import { Banner } from "../Banner";

const kr = (n: number) =>
  Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".") + " kr";

export default function StoreClient() {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [cat, setCat] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState(false);

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

  const shown = cat === "all" ? PRODUCTS : PRODUCTS.filter((p) => p.category === cat);

  return (
    <div className="store">
      <Banner />
      <header className="store-bar">
        <div className="container store-bar-inner">
          <a className="store-back" href="/" aria-label="Forsíða">
            <Logo light />
          </a>
          <span className="store-title">
            Verslun <span className="store-badge">prufa</span>
          </span>
          <button className="cart-btn" onClick={() => setOpen(true)} aria-label="Opna körfu">
            🛒 Karfa
            {count > 0 && <span className="cart-count">{count}</span>}
          </button>
        </div>
      </header>

      <div className="container store-main">
        <div className="cat-row">
          <button className={`chip ${cat === "all" ? "on" : ""}`} onClick={() => setCat("all")}>
            Allt
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              className={`chip ${cat === c.id ? "on" : ""}`}
              onClick={() => setCat(c.id)}
            >
              <span aria-hidden="true">{c.icon}</span> {c.label}
            </button>
          ))}
        </div>

        <div className="prod-grid">
          {shown.map((p) => {
            const c = catById[p.category];
            const sold = p.stock <= 0;
            return (
              <article className="prod" key={p.id}>
                <div className="prod-img" style={{ background: p.img ? "#fff" : c?.tint }}>
                  {p.img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="prod-photo" src={p.img} alt={p.name} loading="lazy" />
                  ) : (
                    <span className="prod-emoji" aria-hidden="true">
                      {c?.icon}
                    </span>
                  )}
                  <span className={`pill ${sold ? "pill-out" : "pill-in"}`}>
                    {sold ? "Uppselt" : "Á lager"}
                  </span>
                </div>
                <div className="prod-body">
                  <h3>{p.name}</h3>
                  <div className="prod-price">{kr(p.price)}</div>
                  <div className="prod-sub">{kr(p.priceNoVsk)} án vsk</div>
                  <button className="add-btn" disabled={sold} onClick={() => add(p.id)}>
                    {sold ? "Ekki til" : "Bæta í körfu"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      <div
        className={`drawer-wrap ${open ? "show" : ""}`}
        onClick={() => setOpen(false)}
        aria-hidden={!open}
      >
        <aside
          className="drawer"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label="Karfa"
        >
          <div className="drawer-head">
            <strong>Karfan þín</strong>
            <button className="drawer-x" onClick={() => setOpen(false)} aria-label="Loka">
              ✕
            </button>
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
                      <button onClick={() => dec(l.p.id)} aria-label="Fækka">
                        −
                      </button>
                      <span className="qty-n">{l.qty}</span>
                      <button onClick={() => add(l.p.id)} aria-label="Fjölga">
                        +
                      </button>
                      <button className="dline-rm" onClick={() => remove(l.p.id)}>
                        Fjarlægja
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="drawer-sum">
                <div className="srow">
                  <span>Án vsk</span>
                  <span>{kr(totalNoVsk)}</span>
                </div>
                <div className="srow">
                  <span>VSK (24%)</span>
                  <span>{kr(vsk)}</span>
                </div>
                <div className="srow srow-total">
                  <span>Samtals</span>
                  <span>{kr(totalVsk)}</span>
                </div>
              </div>

              <button className="checkout" onClick={() => setNotice(true)}>
                Til kassa →
              </button>
              {notice && (
                <p className="drawer-note">
                  🔧 Þetta er prufuverslun — kassinn og greiðslur tengjast þegar gagnagrunnurinn er
                  kominn.
                </p>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
