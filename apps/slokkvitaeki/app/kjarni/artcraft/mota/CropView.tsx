"use client";

/** Skurður í Móta: birtist þegar mynd er flutt inn (og úr ⋮-valmyndinni).
 *  Dragðu horn eða hliðar, eða færðu rammann; veldu hlutfall neðst. Skilar
 *  rammanum í pixlum myndarinnar (null = ekkert klippt). */

import { useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { createPortal } from "react-dom";
import {
  CROP_ASPECTS,
  aspectRatio,
  dragCrop,
  fitAspect,
  isFullImage,
  roundRect,
  type CropAspectId,
  type CropHandle,
  type CropRect,
} from "./crop";
import "./editor.css";

type Props = {
  /** Slóð myndarinnar sem birtist (objectURL). */
  url: string;
  width: number;
  height: number;
  title: string;
  /** Takki sem opnar óklippt (við innflutning); án hans er bara „Hætta við“. */
  skipLabel?: string;
  onClose: () => void;
  onApply: (rect: CropRect | null) => void;
};

const HANDLES: CropHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

export default function CropView({ url, width, height, title, skipLabel, onClose, onApply }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [aspect, setAspect] = useState<CropAspectId>("free");
  const [rect, setRect] = useState<CropRect>({ x: 0, y: 0, w: width, h: height });
  const dragRef = useRef<{ handle: CropHandle; start: CropRect; px: number; py: number; id: number } | null>(null);

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pad = 22;
  const scale = box.w > 0 ? Math.max(0.0001, Math.min((box.w - pad * 2) / width, (box.h - pad * 2) / height)) : 0;
  const offX = (box.w - width * scale) / 2;
  const offY = (box.h - height * scale) / 2;
  const ratio = aspectRatio(aspect, width, height);
  const minSize = Math.max(16, scale > 0 ? 48 / scale : 16);

  function down(handle: CropHandle) {
    return (e: RPointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      dragRef.current = { handle, start: rect, px: e.clientX, py: e.clientY, id: e.pointerId };
    };
  }
  function move(e: RPointerEvent) {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId || scale <= 0) return;
    const dx = (e.clientX - d.px) / scale;
    const dy = (e.clientY - d.py) / scale;
    setRect(dragCrop(d.start, d.handle, dx, dy, ratio, width, height, minSize));
  }
  function up(e: RPointerEvent) {
    if (dragRef.current?.id === e.pointerId) dragRef.current = null;
  }

  function chooseAspect(id: CropAspectId) {
    setAspect(id);
    const r = aspectRatio(id, width, height);
    if (r) setRect(fitAspect({ x: 0, y: 0, w: width, h: height }, r, width, height));
  }

  const shown = roundRect(rect, width, height);
  const full = isFullImage(rect, width, height);

  const view = (
    <div className="mx-root mx-crop-root" role="dialog" aria-modal="true" aria-label={title}>
      <header className="mx-top">
        <button type="button" className="mx-icon-btn" onClick={onClose} aria-label="Hætta við">
          ✕
        </button>
        <div className="mx-title-block">
          <strong>{title}</strong>
          <span>
            {shown.w} × {shown.h} px
          </span>
        </div>
        <div className="mx-spacer" />
      </header>
      <div ref={stageRef} className="mx-crop-stage" onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        {scale > 0 && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt=""
              draggable={false}
              className="mx-crop-img"
              style={{ left: offX, top: offY, width: width * scale, height: height * scale }}
            />
            <div
              className="mx-crop-box"
              style={{ left: offX + rect.x * scale, top: offY + rect.y * scale, width: rect.w * scale, height: rect.h * scale }}
              onPointerDown={down("move")}
            >
              <i className="mx-crop-grid v1" />
              <i className="mx-crop-grid v2" />
              <i className="mx-crop-grid h1" />
              <i className="mx-crop-grid h2" />
              {HANDLES.map((h) => (
                <span key={h} className={`mx-crop-handle ${h}`} onPointerDown={down(h)} aria-hidden="true" />
              ))}
            </div>
          </>
        )}
      </div>
      <div className="mx-crop-panel">
        <div className="mx-chips scroll" role="radiogroup" aria-label="Hlutfall">
          {CROP_ASPECTS.map((a) => (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={aspect === a.id}
              className={`mx-chip${aspect === a.id ? " on" : ""}`}
              onClick={() => chooseAspect(a.id)}
            >
              {a.label}
            </button>
          ))}
        </div>
        <div className="mx-crop-actions">
          {skipLabel ? (
            <button type="button" className="mx-run ghost" onClick={() => onApply(null)}>
              {skipLabel}
            </button>
          ) : (
            <button type="button" className="mx-run ghost" onClick={onClose}>
              Hætta við
            </button>
          )}
          <button
            type="button"
            className="mx-run ghost"
            disabled={full && aspect === "free"}
            onClick={() => {
              setAspect("free");
              setRect({ x: 0, y: 0, w: width, h: height });
            }}
          >
            Öll myndin
          </button>
          <button type="button" className="mx-run" disabled={full} onClick={() => onApply(roundRect(rect, width, height))}>
            Skera
          </button>
        </div>
      </div>
    </div>
  );
  return typeof document === "undefined" ? null : createPortal(view, document.body);
}
