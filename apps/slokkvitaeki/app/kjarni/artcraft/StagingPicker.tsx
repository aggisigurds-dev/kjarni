"use client";

import { useEffect, useState } from "react";
import {
  listStaging,
  removeFromStaging,
  type StagingItem,
  type StagingMediaType,
} from "./artcraftStaging";

/** „Myndir í vinnslu" picker — birtist nálægt upload-reit hvers tóls svo
 * notandi geti valið eldri útkomu úr öðrum tólum án þess að upload-a aftur.
 *
 * Notkun:
 *   <StagingPicker
 *     accepts="image"
 *     onPick={(blob, item) => {
 *       const file = new File([blob], item.name || "from-staging.png", { type: blob.type });
 *       void addFile(file);
 *     }}
 *   />
 *
 * Fær takka með teljara ef eitthvað er í vinnslu, opnar modal með
 * thumbnails, Þú smellir á thumbnail -> onPick kallast. X eyðir item úr
 * staging.
 */

export type StagingPickerProps = {
  accepts: StagingMediaType;
  onPick: (blob: Blob, item: StagingItem) => void | Promise<void>;
  /** Lokar modal eftir pick. Default true. */
  closeOnPick?: boolean;
};

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

export default function StagingPicker(props: StagingPickerProps) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<StagingItem[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  async function refresh() {
    const list = (await listStaging(50)).filter((i) => i.mediaType === props.accepts);
    setItems(list);
    const newThumbs: Record<string, string> = {};
    for (const item of list) {
      if (!thumbs[item.id]) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (open) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    return () => {
      // Revoke all thumb URLs on unmount
      for (const url of Object.values(thumbs)) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* ignore */
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handlePick(item: StagingItem) {
    await props.onPick(item.blob, item);
    if (props.closeOnPick !== false) setOpen(false);
  }

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
  }

  if (items.length === 0 && !open) return null;

  return (
    <>
      <button
        type="button"
        className="ac-btn"
        onClick={() => setOpen(true)}
        style={{ fontSize: 13 }}
      >
        📎 Myndir í vinnslu ({items.length})
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
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
              maxWidth: 900,
              width: "100%",
              maxHeight: "80vh",
              overflow: "auto",
              padding: 20,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>Myndir í vinnslu</h3>
              <button
                type="button"
                className="ac-btn"
                onClick={() => setOpen(false)}
                style={{ fontSize: 13 }}
              >
                Loka
              </button>
            </div>

            {items.length === 0 ? (
              <p style={{ opacity: 0.7 }}>
                Engar myndir í vinnslu. Smelltu „Senda í…" á útkomu-spjaldi í einhverju tóli til að vista
                hér.
              </p>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                  gap: 12,
                }}
              >
                {items.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      position: "relative",
                      border: "1px solid var(--m-border, #333)",
                      borderRadius: 8,
                      overflow: "hidden",
                      background: "rgba(0,0,0,0.3)",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => void handleRemove(item.id)}
                      aria-label="Eyða"
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
                    <button
                      type="button"
                      onClick={() => void handlePick(item)}
                      style={{
                        display: "block",
                        width: "100%",
                        padding: 0,
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      {thumbs[item.id] ? (
                        item.mediaType === "video" ? (
                          // eslint-disable-next-line jsx-a11y/media-has-caption
                          <video
                            src={thumbs[item.id]}
                            style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block" }}
                            muted
                            playsInline
                          />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={thumbs[item.id]}
                            alt={item.name || item.sourceTool}
                            style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block" }}
                          />
                        )
                      ) : (
                        <div style={{ aspectRatio: "1", background: "#222" }} />
                      )}
                      <div style={{ padding: "6px 8px", textAlign: "left", color: "inherit" }}>
                        <div style={{ fontSize: 12, fontWeight: 600 }}>
                          {item.sourceToolName || item.sourceTool}
                        </div>
                        <div style={{ fontSize: 11, opacity: 0.6 }}>
                          fyrir {formatRelative(item.createdAt)} síðan
                        </div>
                      </div>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
