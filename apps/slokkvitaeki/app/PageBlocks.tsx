export type Block =
  | { gerd: "hero"; fyrirsogn?: string; undir?: string; hnapp_texti?: string; hnapp_href?: string }
  | { gerd: "texti"; fyrirsogn?: string; texti?: string }
  | { gerd: "mynd"; url?: string; texti?: string }
  | { gerd: "cta"; fyrirsogn?: string; hnapp_texti?: string; hnapp_href?: string };

export function PageBlocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        if (b.gerd === "hero") {
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
        }
        if (b.gerd === "texti") {
          return (
            <section className="section" key={i}>
              <div className="container" style={{ maxWidth: 780 }}>
                {b.fyrirsogn && <h2 className="section-title">{b.fyrirsogn}</h2>}
                {b.texti && (
                  <p className="section-sub" style={{ whiteSpace: "pre-wrap" }}>{b.texti}</p>
                )}
              </div>
            </section>
          );
        }
        if (b.gerd === "mynd") {
          return (
            <section className="section" key={i}>
              <div className="container" style={{ maxWidth: 900, textAlign: "center" }}>
                {b.url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.url} alt={b.texti || ""} style={{ maxWidth: "100%", borderRadius: 14 }} />
                )}
                {b.texti && <p className="section-sub" style={{ marginTop: 12 }}>{b.texti}</p>}
              </div>
            </section>
          );
        }
        if (b.gerd === "cta") {
          return (
            <section className="cta" key={i}>
              <div className="container">
                {b.fyrirsogn && <h2>{b.fyrirsogn}</h2>}
                {b.hnapp_texti && (
                  <a className="btn" href={b.hnapp_href || "#"}>{b.hnapp_texti}</a>
                )}
              </div>
            </section>
          );
        }
        return null;
      })}
    </>
  );
}
