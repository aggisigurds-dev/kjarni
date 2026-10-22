"use client";

import { useRef, type DragEvent } from "react";
import { BODY_PARTS, clipFrameCount, coverageLabel, isClipStamp, stampIds, type BodyPart, type PartStamp } from "./parts";

type Props = {
  still: string;
  stamps: Partial<Record<string, PartStamp>>;
  onFile: (part: BodyPart, file: File) => void;
  onBake: (partId: string) => void;
  onBakeAll: () => void;
  onPlay: (partId: string) => void;
  onClear: (partId: string) => void;
  busy: boolean;
};

const FILE_ACCEPT = "image/png,image/jpeg,image/webp,image/jpg,video/mp4,video/webm,video/quicktime";

export default function PartsPanel({
  still,
  stamps,
  onFile,
  onBake,
  onBakeAll,
  onPlay,
  onClear,
  busy,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const pending = useRef<BodyPart | null>(null);
  const done = stampIds(stamps);
  const filled = done.length;
  const clipIds = done.filter((id) => isClipStamp(stamps[id]));

  function take(file: File | undefined, part: BodyPart) {
    if (!file) return;
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) return;
    onFile(part, file);
  }

  function onPartDrop(e: DragEvent, part: BodyPart) {
    e.preventDefault();
    e.stopPropagation();
    take(e.dataTransfer.files[0], part);
  }

  return (
    <div className="ac-parts">
      <h2>Mála avatarinn part fyrir part</h2>
      <p className="ac-hint">
        Dragðu ljósmynd eða stutt videóbrot yfir andlit, bol, hendur eða fætur.
        Kyrr mynd prentast strax. Videó er lesið í ramma — hægt er að hreyfa
        aðeins þann part. Baka blandar saumana.
        {still ? ` ${coverageLabel(done)}.` : " Veldu grunn eða gerðu avatar fyrst."}
      </p>
      {still && (
        <div className="ac-parts-stage">
          <img src={still} alt="Avatar til að mála" />
          {BODY_PARTS.map((part) => {
            const stamp = stamps[part.id];
            const clips = clipFrameCount(stamp);
            return (
              <button
                key={part.id}
                type="button"
                className={`ac-part-zone ${stamp ? "on" : ""} ${clips > 1 ? "clip" : ""}`}
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
                {stamp ? (clips > 1 ? ` · ${clips} rammar` : " · tilbúið") : ""}
              </button>
            );
          })}
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept={FILE_ACCEPT}
        hidden
        onChange={(e) => {
          const part = pending.current;
          if (part) take(e.target.files?.[0], part);
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
          {clipIds.map((id) => (
            <button
              key={`play-${id}`}
              type="button"
              className="ac-btn ghost"
              onClick={() => onPlay(id)}
              disabled={busy}
            >
              Hreyfa {BODY_PARTS.find((p) => p.id === id)?.label}
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
