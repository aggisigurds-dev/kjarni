"use client";

import { useRef, type DragEvent } from "react";
import { BODY_PARTS, coverageLabel, type BodyPart } from "./parts";

type Props = {
  still: string;
  stamps: Partial<Record<string, string>>;
  onStamp: (part: BodyPart, image: string) => void;
  onBake: (partId: string) => void;
  onBakeAll: () => void;
  onClear: (partId: string) => void;
  busy: boolean;
};

const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/jpg";

export default function PartsPanel({ still, stamps, onStamp, onBake, onBakeAll, onClear, busy }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const pending = useRef<BodyPart | null>(null);
  const done = Object.keys(stamps);
  const filled = done.length;

  function readFile(file: File | undefined, part: BodyPart) {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => onStamp(part, String(reader.result || ""));
    reader.readAsDataURL(file);
  }

  function onPartDrop(e: DragEvent, part: BodyPart) {
    e.preventDefault();
    e.stopPropagation();
    readFile(e.dataTransfer.files[0], part);
  }

  return (
    <div className="ac-parts">
      <h2>Mála avatarinn part fyrir part</h2>
      <p className="ac-hint">
        Dragðu ljósmynd yfir andlit, bol, hendur eða fætur. Myndin prentast strax á
        svæðið. Síðan má baka hvern part (eða alla) svo Forge blandar saumana.
        {still ? ` ${coverageLabel(done)}.` : " Veldu grunn eða gerðu avatar fyrst."}
      </p>
      {still && (
        <div className="ac-parts-stage">
          <img src={still} alt="Avatar til að mála" />
          {BODY_PARTS.map((part) => (
            <button
              key={part.id}
              type="button"
              className={`ac-part-zone ${stamps[part.id] ? "on" : ""}`}
              style={{
                left: `${part.x * 100}%`,
                top: `${part.y * 100}%`,
                width: `${part.w * 100}%`,
                height: `${part.h * 100}%`,
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={(e) => onPartDrop(e, part)}
              onClick={() => {
                pending.current = part;
                fileRef.current?.click();
              }}
            >
              {part.label}
              {stamps[part.id] ? " · tilbúið" : ""}
            </button>
          ))}
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept={IMAGE_ACCEPT}
        hidden
        onChange={(e) => {
          const part = pending.current;
          if (part) readFile(e.target.files?.[0], part);
          pending.current = null;
          e.target.value = "";
        }}
      />
      {filled > 0 && (
        <div className="ac-row">
          <button type="button" className="ac-btn" onClick={onBakeAll} disabled={busy}>
            {busy ? "Baka…" : `Baka alla (${filled})`}
          </button>
          {done.map((id) => (
            <button
              key={id}
              type="button"
              className="ac-btn ghost"
              onClick={() => onBake(id)}
              disabled={busy}
            >
              Baka {BODY_PARTS.find((p) => p.id === id)?.label}
            </button>
          ))}
          {done.map((id) => (
            <button key={`x-${id}`} type="button" className="ac-btn ghost" onClick={() => onClear(id)}>
              Hreinsa {BODY_PARTS.find((p) => p.id === id)?.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
