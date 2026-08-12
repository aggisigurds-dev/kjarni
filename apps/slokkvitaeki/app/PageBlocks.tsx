import { PRODUCTS } from "./verslun/products";
import { ContactForm } from "./ContactForm";

export type Block = { gerd: string; [k: string]: string };

const kr = (n: number) =>
  Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".") + " kr";

export function PageBlocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.gerd) {
          case "hero":
            return (
              <section className="hero" key={i}>
                <div className="container hero-inner">
                  {b.fyrirsogn && <h1>{b.fyrirsogn}</h1>}
                  {b.undir && <p className="hero-lede">{b.undir}</p>}
                  {b.hnapp_texti && (
                    <div className="hero-cta">
                      <a className="btn" href={b.hnapp_href || "#"}>{b.hnapp_texti}</a>
                    </div>
                  )}
                </div>
              </section>
            );
          case "texti":
            return (
              <section className="section" key={i}>
                <div className="container" style={{ maxWidth: 780 }}>
                  {b.fyrirsogn && <h2 className="section-title">{b.fyrirsogn}</h2>}
                  {b.texti && <p className="section-sub" style={{ whiteSpace: "pre-wrap" }}>{b.texti}</p>}
                </div>
              </section>
            );
          case "mynd":
            return (
              <section className="section" key={i}>
                <div className="container" style={{ maxWidth: 900, textAlign: "center" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {b.url && <img src={b.url} alt={b.texti || ""} style={{ maxWidth: "100%", borderRadius: 14 }} />}
                  {b.texti && <p className="section-sub" style={{ marginTop: 12 }}>{b.texti}</p>}
                </div>
              </section>
            );
          case "cta":
            return (
              <section className="cta" key={i}>
                <div className="container">
                  {b.fyrirsogn && <h2>{b.fyrirsogn}</h2>}
                  {b.hnapp_texti && <a className="btn" href={b.hnapp_href || "#"}>{b.hnapp_texti}</a>}
                </div>
              </section>
            );
          case "vorur": {
            const n = Math.max(1, parseInt(b.fjoldi || "3", 10) || 3);
            let list = PRODUCTS.filter((p) => p.stock > 0);
            if (b.flokkur) list = list.filter((p) => p.category === b.flokkur);
            list = list.slice(0, n);
            return (
              <section className="section" key={i}>
                <div className="container">
                  {b.fyrirsogn && <h2 className="section-title">{b.fyrirsogn}</h2>}
                  <div className="pb-vorur">
                    {list.map((p) => (
                      <a className="pb-vara" href="/verslun" key={p.id}>
                        <div className="pb-vara-img" style={{ background: p.img ? "#fff" : "#f6f8fa" }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {p.img ? <img src={p.img} alt={p.name} /> : <span>🧯</span>}
                        </div>
                        <div className="pb-vara-nafn">{p.name}</div>
                        <div className="pb-vara-verd">{kr(p.price)}</div>
                      </a>
                    ))}
                  </div>
                  <div style={{ textAlign: "center", marginTop: 22 }}>
                    <a className="btn" href="/verslun">Skoða alla verslun</a>
                  </div>
                </div>
              </section>
            );
          }
          case "gallery": {
            const imgs = (b.myndir || "").split("\n").map((s) => s.trim()).filter(Boolean);
            return (
              <section className="section" key={i}>
                <div className="container">
                  {b.fyrirsogn && <h2 className="section-title">{b.fyrirsogn}</h2>}
                  <div className="pb-gallery">
                    {imgs.map((u, x) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={x} src={u} alt="" />
                    ))}
                  </div>
                </div>
              </section>
            );
          }
          case "faq": {
            const rows = (b.spurningar || "")
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean)
              .map((line) => {
                const idx = line.indexOf("::");
                return idx === -1
                  ? { q: line, a: "" }
                  : { q: line.slice(0, idx).trim(), a: line.slice(idx + 2).trim() };
              });
            return (
              <section className="section" key={i}>
                <div className="container" style={{ maxWidth: 780 }}>
                  {b.fyrirsogn && <h2 className="section-title">{b.fyrirsogn}</h2>}
                  <div className="pb-faq">
                    {rows.map((r, x) => (
                      <details key={x}>
                        <summary>{r.q}</summary>
                        <p>{r.a}</p>
                      </details>
                    ))}
                  </div>
                </div>
              </section>
            );
          }
          case "form":
            return (
              <section className="section" key={i} id="hafa-samband">
                <div className="container" style={{ maxWidth: 560, textAlign: "center" }}>
                  {b.fyrirsogn && <h2 className="section-title">{b.fyrirsogn}</h2>}
                  <ContactForm />
                </div>
              </section>
            );
          default:
            return null;
        }
      })}
    </>
  );
}
