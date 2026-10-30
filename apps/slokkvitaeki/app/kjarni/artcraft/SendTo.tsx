"use client";

import { useState } from "react";
import { addToStaging, type StagingMediaType } from "./artcraftStaging";

/** Dropdown-takki "Senda í..." sem birtist á útkomu-spjaldi hvers tóls.
 * Vistar blobinn í staging og navigate-ar á valið tól með ?use=<id> param
 * sem þá sjálft load-ar blobinn sem source. Engin download/upload hringrás.
 */

type Destination = {
  id: string;
  label: string;
  path: string;
  accepts: StagingMediaType[];
};

const DESTINATIONS: Destination[] = [
  // Image destinations
  { id: "upplyfting", label: "Upplyfting", path: "/kjarni/artcraft/upplyfting", accepts: ["image"] },
  { id: "endurljos", label: "Endurljós", path: "/kjarni/artcraft/endurljos", accepts: ["image"] },
  { id: "breyta", label: "Breyta mynd", path: "/kjarni/artcraft/breyta", accepts: ["image"] },
  { id: "innblastur", label: "Innblástur", path: "/kjarni/artcraft/innblastur", accepts: ["image"] },
  { id: "andlit", label: "Andlit", path: "/kjarni/artcraft/andlit", accepts: ["image"] },
  { id: "utvikka", label: "Útvíkka", path: "/kjarni/artcraft/utvikka", accepts: ["image"] },
  { id: "litun", label: "Litun", path: "/kjarni/artcraft/litun", accepts: ["image"] },
  { id: "dypt", label: "Dýpt", path: "/kjarni/artcraft/dypt", accepts: ["image"] },
  { id: "kastljos", label: "Kastljós", path: "/kjarni/artcraft/kastljos", accepts: ["image"] },
  { id: "mota", label: "Móta", path: "/kjarni/artcraft/mota", accepts: ["image"] },
  { id: "vidgerd", label: "Ljósmyndaviðgerð", path: "/kjarni/artcraft/vidgerd", accepts: ["image"] },
  { id: "bakgrunnur", label: "Fjarlægja bakgrunn", path: "/kjarni/artcraft/bakgrunnur", accepts: ["image"] },
  { id: "skyjahreyfimynd", label: "Skýjahreyfimynd (í video)", path: "/kjarni/artcraft/skyjahreyfimynd", accepts: ["image"] },
  // Video destinations
  { id: "video-upplyfting", label: "Myndbanda-upplyfting", path: "/kjarni/artcraft/video-upplyfting", accepts: ["video"] },
  { id: "myndband-andlit-video", label: "Myndband-andlit (sem source video)", path: "/kjarni/artcraft/myndband-andlit", accepts: ["video"] },
  { id: "myndband-framhald", label: "Myndband-framhald (teygja)", path: "/kjarni/artcraft/myndband-framhald", accepts: ["video"] },
  { id: "myndband-saumur", label: "Myndbanda-saumur (bæta við röð)", path: "/kjarni/artcraft/myndband-saumur", accepts: ["video"] },
  // Image → andlits-tilvísun fyrir myndband-andlit (sama path, en accepts image)
  { id: "myndband-andlit-face", label: "Myndband-andlit (sem andlits-tilvísun)", path: "/kjarni/artcraft/myndband-andlit", accepts: ["image"] },
];

export type SendToProps = {
  blob: Blob;
  mediaType: StagingMediaType;
  sourceTool: string;
  sourceToolName?: string;
  prompt?: string;
  name?: string;
  /** Útiloka tiltekin destination-id (til að hamla að senda í sama tól). */
  excludeIds?: string[];
};

export default function SendTo(props: SendToProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const available = DESTINATIONS.filter(
    (d) =>
      d.accepts.includes(props.mediaType) &&
      !(props.excludeIds || []).includes(d.id) &&
      d.id !== props.sourceTool,
  );

  async function sendTo(dest: Destination) {
    setBusy(dest.id);
    setError("");
    try {
      const id = await addToStaging(props.blob, {
        mediaType: props.mediaType,
        sourceTool: props.sourceTool,
        sourceToolName: props.sourceToolName,
        prompt: props.prompt,
        name: props.name,
      });
      // Navigate — single-page style via window.location so target tool
      // reads the new ?use= param on mount.
      window.location.href = `${dest.path}?use=${encodeURIComponent(id)}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Vistun í staging mistókst");
      setBusy(null);
    }
  }

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        className="ac-btn"
        onClick={() => setOpen((o) => !o)}
        disabled={busy !== null}
        aria-expanded={open}
      >
        {busy ? "Sendi…" : "Senda í… ▾"}
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 4,
            background: "var(--m-panel, #1a1a1a)",
            border: "1px solid var(--m-border, #333)",
            borderRadius: 6,
            padding: 4,
            minWidth: 220,
            zIndex: 10,
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
          }}
        >
          {available.map((d) => (
            <button
              key={d.id}
              type="button"
              role="menuitem"
              onClick={() => void sendTo(d)}
              disabled={busy !== null}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "8px 12px",
                background: "transparent",
                border: "none",
                color: "inherit",
                cursor: "pointer",
                borderRadius: 4,
                fontSize: 13,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {busy === d.id ? "⏳ " : "→ "}
              {d.label}
            </button>
          ))}
          {available.length === 0 && (
            <p style={{ padding: "8px 12px", margin: 0, opacity: 0.7, fontSize: 13 }}>
              Engin tól taka við {props.mediaType === "video" ? "video" : "mynd"}
            </p>
          )}
        </div>
      )}
      {error && (
        <p className="ac-error" style={{ marginTop: 4, fontSize: 12 }}>
          {error}
        </p>
      )}
    </div>
  );
}
