"use client";

import { useEffect, useRef, useState } from "react";
import {
  listStaging,
  removeFromStaging,
  type StagingItem,
} from "./artcraftStaging";

/** „Myndir í vinnslu" dock — birtist í ArtCraft-stikunni á öllum artcraft-
 *  síðum. Lítill takki með teljara; opnast modal með öllum staged items.
 *  Hver mynd fær „Opna í..." dropdown sem er navigation í target-tól með
 *  ?use=<id> paraminu (reusar existing staging entry — engin double-upload).
 *
 *  Hugmyndin: notandi getur haldið safn af í-vinnslu-myndum opið á meðan
 *  hann hoppar á milli tóla, án þess að þurfa að fara aftur í upprunalegt
 *  tól til að „Senda í" áfram.
 */

type Destination = {
  id: string;
  label: string;
  path: string;
};

const IMAGE_DESTINATIONS: Destination[] = [
  { id: "upplyfting", label: "Upplyfting", path: "/kjarni/artcraft/upplyfting" },
  { id: "endurljos", label: "Endurljós", path: "/kjarni/artcraft/endurljos" },
  { id: "breyta", label: "Breyta mynd", path: "/kjarni/artcraft/breyta" },
  { id: "innblastur", label: "Innblástur", path: "/kjarni/artcraft/innblastur" },
  { id: "andlit", label: "Andlit", path: "/kjarni/artcraft/andlit" },
  { id: "utvikka", label: "Útvíkka", path: "/kjarni/artcraft/utvikka" },
  { id: "litun", label: "Litun", path: "/kjarni/artcraft/litun" },
  { id: "dypt", label: "Dýpt", path: "/kjarni/artcraft/dypt" },
  { id: "kastljos", label: "Kastljós", path: "/kjarni/artcraft/kastljos" },
  { id: "mota", label: "Móta", path: "/kjarni/artcraft/mota" },
  { id: "vidgerd", label: "Ljósmyndaviðgerð", path: "/kjarni/artcraft/vidgerd" },
  { id: "bakgrunnur", label: "Fjarlægja bakgrunn", path: "/kjarni/artcraft/bakgrunnur" },
  { id: "skyjahreyfimynd", label: "Skýjahreyfimynd", path: "/kjarni/artcraft/skyjahreyfimynd" },
  { id: "myndband-andlit-face", label: "Myndband-andlit (andlits-tilvísun)", path: "/kjarni/artcraft/myndband-andlit" },
];

const VIDEO_DESTINATIONS: Destination[] = [
  { id: "video-upplyfting", label: "Myndbanda-upplyfting", path: "/kjarni/artcraft/video-upplyfting" },
  { id: "myndband-andlit", label: "Myndband-andlit", path: "/kjarni/artcraft/myndband-andlit" },
];

function formatRelative(ts: number): string {
  const diffSec = Math.round((Date.now() - ts) / 1000);
  if (diffSec < 60) return `${diffSec}s`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} mín`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} klst`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d`;
}

export default function GlobalStagingDock() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<StagingItem[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const thumbsRef = useRef<Record<string, string>>({});

  thumbsRef.current = thumbs;

  async function refresh() {
    const list = await listStaging(50);
    setItems(list);
    const newThumbs: Record<string, string> = {};
    for (const item of list) {
      if (!thumbsRef.current[item.id]) {
        try {
          newThumbs[item.id] = URL.createObjectURL(item.blob);
        } catch {
          /* skip */
        }
      }
    }
    if (Object.keys(newThumbs).length > 0) {
      setThumbs((prev) => ({ ...prev, ...newThumbs }));
    }
  }

  useEffect(() => {
    void refresh();
    // Endurnýjum á 10 sek. fresti svo badge sé í samræmi þótt annar tabur
    // bæti við eitthvað staged. Ódýrt — bara IDB keys lesinn.
    const id = window.setInterval(() => void refresh(), 10000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (open) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    return () => {
      for (const url of Object.values(thumbsRef.current)) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  async function handleRemove(id: string) {
    await removeFromStaging(id);
    setThumbs((prev) => {
      const next = { ...prev };
      if (next[id]) {
        try {
          URL.revokeObjectURL(next[id]);
        } catch {
          /* ignore */
        }
        delete next[id];
      }
      return next;
    });
    setItems((prev) => prev.filter((i) => i.id !== id));
    if (openMenu === id) setOpenMenu(null);
  }

  function openIn(item: StagingItem, dest: Destination) {
    window.location.href = `${dest.path}?use=${encodeURIComponent(item.id)}`;
  }

  if (items.length === 0) return null;

  return (
    <>
      <button
        type="button"
        className="ac-staging-dock-btn"
        onClick={() => setOpen(true)}
        title="Myndir sem þú hefur sent á milli tóla"
        aria-label={`${items.length} myndir í vinnslu`}
      >
        📎 <span>{items.length}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Myndir í vinnslu"
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--m-panel, #1a1a1a)",
              border: "1px solid var(--m-border, #333)",
              borderRadius: 10,
              maxWidth: 1000,
              width: "100%",
              maxHeight: "85vh",
              overflow: "auto",
              padding: 20,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Myndir í vinnslu ({items.length})</h3>
              <button type="button" className="ac-btn" onClick={() => setOpen(false)} style={{ fontSize: 13 }}>
                Loka
              </button>
            </div>
            <p style={{ margin: "0 0 16px 0", opacity: 0.7, fontSize: 12 }}>
              Þessar myndir eru vistaðar í vafranum þínum (7 daga geymsla). Smelltu „Opna í…" til að halda áfram með þær í öðru tóli.
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                gap: 14,
              }}
            >
              {items.map((item) => (
                <div
                  key={item.id}
                  style={{
                    border: "1px solid var(--m-border, #333)",
                    borderRadius: 8,
                    overflow: "visible",
                    background: "rgba(0,0,0,0.3)",
                    position: "relative",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => void handleRemove(item.id)}
                    aria-label="Eyða"
                    title="Eyða úr vinnslu"
                    style={{
                      position: "absolute",
                      top: 4,
                      right: 4,
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      background: "rgba(0,0,0,0.6)",
                      color: "white",
                      border: "none",
                      cursor: "pointer",
                      zIndex: 2,
                      fontSize: 14,
                      lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                  {thumbs[item.id] ? (
                    item.mediaType === "video" ? (
                      // eslint-disable-next-line jsx-a11y/media-has-caption
                      <video
                        src={thumbs[item.id]}
                        style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block", borderRadius: "7px 7px 0 0" }}
                        muted
                        playsInline
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumbs[item.id]}
                        alt={item.name || item.sourceTool}
                        style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block", borderRadius: "7px 7px 0 0" }}
                      />
                    )
                  ) : (
                    <div style={{ aspectRatio: "1", background: "#222", borderRadius: "7px 7px 0 0" }} />
                  )}
                  <div style={{ padding: 10, position: "relative" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>
                      {item.sourceToolName || item.sourceTool}
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 8 }}>
                      fyrir {formatRelative(item.createdAt)} síðan
                    </div>
                    <>
                      <button
                        type="button"
                        className="ac-btn"
                        onClick={() => setOpenMenu((m) => (m === item.id ? null : item.id))}
                        style={{ fontSize: 12, width: "100%" }}
                        aria-expanded={openMenu === item.id}
                      >
                        Opna í… ▾
                      </button>
                      {openMenu === item.id && (
                        <div
                          role="menu"
                          style={{
                            position: "absolute",
                            top: "100%",
                            left: 10,
                            right: 10,
                            marginTop: 4,
                            background: "var(--m-panel, #1a1a1a)",
                            border: "1px solid var(--m-border, #333)",
                            borderRadius: 6,
                            padding: 4,
                            zIndex: 20,
                            boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
                            maxHeight: 300,
                            overflowY: "auto",
                          }}
                        >
                          {(item.mediaType === "image" ? IMAGE_DESTINATIONS : VIDEO_DESTINATIONS)
                            .filter((d) => d.id !== item.sourceTool)
                            .map((d) => (
                              <button
                                key={d.id}
                                type="button"
                                role="menuitem"
                                onClick={() => openIn(item, d)}
                                style={{
                                  display: "block",
                                  width: "100%",
                                  textAlign: "left",
                                  padding: "6px 10px",
                                  background: "transparent",
                                  border: "none",
                                  color: "inherit",
                                  cursor: "pointer",
                                  borderRadius: 4,
                                  fontSize: 12,
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
                                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                              >
                                → {d.label}
                              </button>
                            ))}
                        </div>
                      )}
                    </>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
