"use client";

/** Velja rammann sem framhald byrjar á: forsýn af rammanum, sleði og
 *  ramma-fyrir-ramma takkar. Sjálfgefið sekúndu fyrir enda. */

import { useEffect, useRef, useState } from "react";
import { seekVideo } from "./frames";
import { formatSeconds, snapToFrame } from "./timeline";

export type FramePickerProps = {
  blob: Blob;
  duration: number;
  value: number;
  onChange: (t: number) => void;
  fps?: number;
  /** Hæð forsýnar í punktum. */
  height?: number;
};

export default function FramePicker({ blob, duration, value, onChange, fps = 16, height = 200 }: FramePickerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [url, setUrl] = useState("");
  const seekingRef = useRef(false);
  const wantedRef = useRef(value);

  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);

  // Ein leit í einu; ef sleðinn hreyfðist á meðan er leitað aftur að nýjasta gildinu.
  useEffect(() => {
    wantedRef.current = value;
    const v = videoRef.current;
    if (!v || seekingRef.current || !url) return;
    seekingRef.current = true;
    void (async () => {
      try {
        while (true) {
          const t = wantedRef.current;
          if (v.readyState < 1) await new Promise((r) => v.addEventListener("loadedmetadata", r, { once: true }));
          await seekVideo(v, t);
          if (wantedRef.current === t) break;
        }
      } catch {
        /* forsýn er bara til sýnis */
      } finally {
        seekingRef.current = false;
      }
    })();
  }, [value, url]);

  const step = 1 / fps;
  const set = (t: number) => onChange(snapToFrame(Math.max(0, Math.min(duration, t)), fps));
  const btn: React.CSSProperties = {
    minWidth: 44,
    height: 36,
    padding: "0 10px",
    borderRadius: 10,
    border: "1px solid rgba(128,128,128,.4)",
    background: "transparent",
    color: "inherit",
    font: "inherit",
    cursor: "pointer",
  };

  return (
    <div className="ac-framepicker" style={{ display: "grid", gap: 8 }}>
      <video
        ref={videoRef}
        src={url || undefined}
        muted
        playsInline
        preload="auto"
        style={{ width: "100%", height, objectFit: "contain", background: "#111", borderRadius: 10 }}
      />
      <input
        type="range"
        min={0}
        max={Math.max(step, duration)}
        step={step}
        value={value}
        onChange={(e) => set(Number(e.target.value))}
        aria-label="Rammi til að halda áfram frá"
        style={{ width: "100%" }}
      />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        <button type="button" style={btn} onClick={() => set(value - 1)} aria-label="Sekúndu fyrr">
          −1 s
        </button>
        <button type="button" style={btn} onClick={() => set(value - step)} aria-label="Einn ramma fyrr">
          ◀
        </button>
        <button type="button" style={btn} onClick={() => set(value + step)} aria-label="Einn ramma seinna">
          ▶
        </button>
        <button type="button" style={btn} onClick={() => set(duration - 1)}>
          1 s fyrir enda
        </button>
        <span style={{ fontSize: 13, opacity: 0.8 }}>
          Halda áfram frá {formatSeconds(value)} s af {formatSeconds(duration)} s
          {duration - value > 0.05 ? ` — síðustu ${formatSeconds(duration - value)} s detta út` : ""}
        </span>
      </div>
    </div>
  );
}
