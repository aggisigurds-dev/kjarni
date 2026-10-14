"use client";

/* Skera grunnmynd: draga kassa utan um gólfplanið. Hnit vistast í px renderingarinnar. */
import { useEffect, useRef, useState } from "react";
import type { Skurdur } from "../lib/skurdur";

export function SkurdurModal({ url, breidd, haed, nuverandi, heiti, onSave, onClose }: {
  url: string; breidd: number; haed: number; nuverandi: Skurdur | null; heiti: string;
  onSave: (s: Skurdur | null) => Promise<void>; onClose: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.2);
  const [s, setS] = useState<Skurdur | null>(nuverandi);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const el = boxRef.current; if (!el) return;
    const k = () => setScale(Math.min((el.clientWidth - 4) / breidd, (window.innerHeight * 0.68) / haed));
    k(); window.addEventListener("resize", k); return () => window.removeEventListener("resize", k);
  }, [breidd, haed]);

  const px = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: Math.max(0, Math.min(breidd, (e.clientX - r.left) / scale)), y: Math.max(0, Math.min(haed, (e.clientY - r.top) / scale)) };
  };
  const down = (e: React.PointerEvent) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); const p = px(e); setDrag(p); setS({ x: p.x, y: p.y, w: 0, h: 0 }); };
  const move = (e: React.PointerEvent) => { if (!drag) return; const p = px(e); setS({ x: Math.min(drag.x, p.x), y: Math.min(drag.y, p.y), w: Math.abs(p.x - drag.x), h: Math.abs(p.y - drag.y) }); };
  const up = () => setDrag(null);

  const gilt = s && s.w >= 50 && s.h >= 50;
  const vista = async (v: Skurdur | null) => { setBusy(true); try { await onSave(v ? { x: Math.round(v.x), y: Math.round(v.y), w: Math.round(v.w), h: Math.round(v.h) } : null); onClose(); } finally { setBusy(false); } };

  return (
    <div className="sk-bak" onClick={onClose}>
      <div className="sk-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sk-haus"><strong>Skera: {heiti}</strong><span>Dragðu kassa utan um gólfplanið — vinnuútgáfan sýnir aðeins það sem er innan hans.</span><button type="button" className="vn-loka" onClick={onClose}>✕</button></div>
        <div className="sk-box" ref={boxRef}>
          <div className="sk-flotur" style={{ width: breidd * scale, height: haed * scale }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
            <img src={url} alt="" draggable={false} width={breidd * scale} height={haed * scale} />
            {s && s.w > 0 && (
              <>
                <div className="sk-skuggi" style={{ clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 ${s.y * scale}px, ${s.x * scale}px ${s.y * scale}px, ${s.x * scale}px ${(s.y + s.h) * scale}px, ${(s.x + s.w) * scale}px ${(s.y + s.h) * scale}px, ${(s.x + s.w) * scale}px ${s.y * scale}px, 0 ${s.y * scale}px)` }} />
                <div className="sk-rammi" style={{ left: s.x * scale, top: s.y * scale, width: s.w * scale, height: s.h * scale }} />
              </>
            )}
          </div>
        </div>
        <div className="sk-takkar">
          <span className="sk-tolur">{gilt ? `${Math.round(s!.w)} × ${Math.round(s!.h)} px frá (${Math.round(s!.x)}, ${Math.round(s!.y)})` : "Enginn skurður valinn"}</span>
          <button type="button" onClick={() => vista(null)} disabled={busy || !nuverandi}>Hreinsa skurð</button>
          <button type="button" onClick={onClose} disabled={busy}>Hætta við</button>
          <button type="button" className="aj-primary" onClick={() => vista(s)} disabled={busy || !gilt}>{busy ? "Vista…" : "Vista skurð"}</button>
        </div>
      </div>
    </div>
  );
}
