"use client";

import { useRef, useState, type DragEvent } from "react";
import { PAINT_SHOT_KINDS, type PaintShotKind } from "./paintEdit";

const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/jpg";

type Props = {
  src: string;
  kind: PaintShotKind;
  onSrc: (src: string) => void;
  onKind: (kind: PaintShotKind) => void;
  onClear: () => void;
};

export default function WantShot({ src, kind, onSrc, onKind, onClear }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  function take(file: File | undefined) {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => onSrc(String(reader.result || ""));
    reader.readAsDataURL(file);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setOver(false);
    take(e.dataTransfer.files[0]);
  }

  return (
    <div
      className={`ac-want-shot ${over ? "on" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <p className="ac-hint">Skjáskot af því sem á að koma</p>
      {src ? <img src={src} alt="Skjáskot af ósk" /> : <p className="ac-hint">bikini / sundföt eða haus</p>}
      <div className="ac-row ac-chips">
        {PAINT_SHOT_KINDS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`ac-btn ghost ${kind === item.id ? "on" : ""}`}
            title={item.hint}
            onClick={() => onKind(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="ac-row">
        <button type="button" className="ac-btn ghost" onClick={() => input.current?.click()}>
          Velja
        </button>
        {src && (
          <button type="button" className="ac-btn ghost" onClick={onClear}>
            Hreinsa
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept={IMAGE_ACCEPT}
        hidden
        onChange={(e) => {
          take(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
