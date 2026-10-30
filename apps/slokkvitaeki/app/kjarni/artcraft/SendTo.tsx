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
  { id: "myndband-portret-andlit-video", label: "Myndband-portret-andlit (sem source video)", path: "/kjarni/artcraft/myndband-portret-andlit", accepts: ["video"] },
  // Image → andlits-tilvísun fyrir myndband-andlit (sama path, en accepts image)
  { id: "myndband-andlit-face", label: "Myndband-andlit (sem andlits-tilvísun)", path: "/kjarni/artcraft/myndband-andlit", accepts: ["image"] },
  { id: "myndband-portret-andlit-face", label: "Myndband-portret-andlit (sem andlits-tilvísun)", path: "/kjarni/artcraft/myndband-portret-andlit", accepts: ["image"] },
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
        className="ac-btn ac-sendto-btn"
        onClick={() => setOpen((o) => !o)}
        disabled={busy !== null}
        aria-expanded={open}
        style={{
          background: busy ? undefined : "linear-gradient(180deg, #22c55e, #16a34a)",
          color: busy ? undefined : "white",
          borderColor: busy ? undefined : "#15803d",
          fontWeight: 600,
          boxShadow: busy ? undefined : "0 2px 6px rgba(34, 197, 94, 0.35)",
        }}
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
            marginTop: 6,
            background: "#0b0b0b",
            border: "2px solid #22c55e",
            borderRadius: 8,
            padding: 6,
            minWidth: 260,
            zIndex: 10,
            boxShadow: "0 10px 28px rgba(0,0,0,0.6), 0 0 0 1px rgba(34, 197, 94, 0.2)",
          }}
        >
          <div
            style={{
              padding: "4px 10px 8px",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#4ade80",
              borderBottom: "1px solid rgba(34, 197, 94, 0.25)",
              marginBottom: 4,
            }}
          >
            Senda í
          </div>
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
                padding: "10px 12px",
                background: "transparent",
                border: "none",
                color: "#f3f4f6",
                cursor: "pointer",
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 500,
                lineHeight: 1.3,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(34, 197, 94, 0.22)";
                e.currentTarget.style.color = "#ffffff";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "#f3f4f6";
              }}
            >
              <span style={{ color: "#4ade80", fontWeight: 700, marginRight: 6 }}>
                {busy === d.id ? "⏳" : "→"}
              </span>
              {d.label}
            </button>
          ))}
          {available.length === 0 && (
            <p style={{ padding: "8px 12px", margin: 0, color: "#9ca3af", fontSize: 13 }}>
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
