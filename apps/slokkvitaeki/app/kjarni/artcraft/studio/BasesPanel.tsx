"use client";

import { useRef } from "react";
import {
  BUILD_CHIPS,
  DEFAULT_LOOK,
  HAIR_COLORS,
  HAIR_LENGTHS,
  SKIN_TONES,
  lookLine,
  mannequinDataUrl,
  parseLook,
  STUDIO_BASES,
  studioBase,
  type BodyLook,
} from "./bases";

type Props = {
  baseId: string;
  look?: BodyLook;
  customBase: string;
  onBase: (id: string) => void;
  onLook: (next: BodyLook) => void;
  onCustom: (src: string) => void;
  onClearCustom: () => void;
  onAdapt: () => void;
  busy: boolean;
  canAdapt: boolean;
};

const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/jpg";

export default function BasesPanel({
  baseId,
  look,
  customBase,
  onBase,
  onLook,
  onCustom,
  onClearCustom,
  onAdapt,
  busy,
  canAdapt,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const selected = studioBase(baseId);
  const body = parseLook(look || DEFAULT_LOOK);

  function readFile(file: File | undefined) {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => onCustom(String(reader.result || ""));
    reader.readAsDataURL(file);
  }

  function patch(next: Partial<BodyLook>) {
    onLook({ ...body, ...next });
  }

  return (
    <div className="ac-bases">
      <h2>Grunnur með hlutföllum</h2>
      <p className="ac-hint">
        Stilltu hæð, þyngd, slim/athletic, húðlit, hárlit og hárlengd. Mannikininn
        uppfærist strax; Aðlaga sendir þetta með prófílnum. Eigin grunnur má vera
        skjámynd af Ready Player Me, VRoid eða Mixamo T-pose.
      </p>
      <div className="ac-base-grid">
        {STUDIO_BASES.map((base) => (
          <button
            key={base.id}
            type="button"
            className={`ac-base-card ${!customBase && baseId === base.id ? "on" : ""}`}
            onClick={() => onBase(base.id)}
          >
            <img src={mannequinDataUrl(base, { ...body, build: base.build })} alt={base.label} />
            <span>{base.label}</span>
          </button>
        ))}
      </div>
      <div className="ac-look">
        <label className="ac-range">
          Hæð {body.heightCm} cm
          <input
            type="range"
            min={150}
            max={200}
            value={body.heightCm}
            onChange={(e) => patch({ heightCm: Number(e.target.value) })}
          />
        </label>
        <label className="ac-range">
          Þyngd {body.weightKg} kg
          <input
            type="range"
            min={45}
            max={130}
            value={body.weightKg}
            onChange={(e) => patch({ weightKg: Number(e.target.value) })}
          />
        </label>
        <div className="ac-row ac-chips" role="group" aria-label="Bygging">
          {BUILD_CHIPS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`ac-btn ghost ${body.build === item.id ? "on" : ""}`}
              onClick={() => patch({ build: item.id })}
            >
              {item.label}
            </button>
          ))}
        </div>
        <p className="ac-look-label">Húðlitur</p>
        <div className="ac-swatches" role="listbox" aria-label="Húðlitur">
          {SKIN_TONES.map((item) => (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={body.skin === item.id}
              className={`ac-swatch ${body.skin === item.id ? "on" : ""}`}
              style={{ background: item.mid }}
              title={item.label}
              onClick={() => patch({ skin: item.id })}
            >
              <span className="sr-only">{item.label}</span>
            </button>
          ))}
        </div>
        <p className="ac-look-label">Hárlitur</p>
        <div className="ac-swatches" role="listbox" aria-label="Hárlitur">
          {HAIR_COLORS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={body.hair === item.id}
              className={`ac-swatch ${body.hair === item.id ? "on" : ""}`}
              style={{ background: item.hex }}
              title={item.label}
              onClick={() => patch({ hair: item.id })}
            >
              <span className="sr-only">{item.label}</span>
            </button>
          ))}
        </div>
        <div className="ac-row ac-chips" role="group" aria-label="Hárlengd">
          {HAIR_LENGTHS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`ac-btn ghost ${body.hairLength === item.id ? "on" : ""}`}
              onClick={() => patch({ hairLength: item.id })}
            >
              {item.label}
            </button>
          ))}
        </div>
        <p className="ac-hint">{lookLine(body)}</p>
      </div>
      {customBase && (
        <figure className="ac-turn-view">
          <img src={customBase} alt="Eigin grunnur" />
          <figcaption>Eigin grunnur</figcaption>
        </figure>
      )}
      <div className="ac-row">
        <button type="button" className="ac-btn ghost" onClick={() => fileRef.current?.click()}>
          Setja inn eigin grunn
        </button>
        {customBase && (
          <button type="button" className="ac-btn ghost" onClick={onClearCustom}>
            Nota líkamsgrunn
          </button>
        )}
        <button type="button" className="ac-btn" onClick={onAdapt} disabled={busy || !canAdapt}>
          {busy ? "Aðlaga…" : `Aðlaga: ${customBase ? "eigin grunn" : selected.label}`}
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept={IMAGE_ACCEPT}
        hidden
        onChange={(e) => {
          readFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
