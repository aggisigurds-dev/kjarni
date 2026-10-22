"use client";

import { useRef } from "react";
import { mannequinDataUrl, STUDIO_BASES, studioBase } from "./bases";

type Props = {
  baseId: string;
  customBase: string;
  onBase: (id: string) => void;
  onCustom: (src: string) => void;
  onClearCustom: () => void;
  onAdapt: () => void;
  busy: boolean;
  canAdapt: boolean;
};

const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/jpg";

export default function BasesPanel({
  baseId,
  customBase,
  onBase,
  onCustom,
  onClearCustom,
  onAdapt,
  busy,
  canAdapt,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const selected = studioBase(baseId);

  function readFile(file: File | undefined) {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => onCustom(String(reader.result || ""));
    reader.readAsDataURL(file);
  }

  return (
    <div className="ac-bases">
      <h2>Grunnur með hlutföllum</h2>
      <p className="ac-hint">
        Byrjaðu á fullorðnum líkama með rúmmáli og liðamótum — búðarmannikin,
        ekki spitukall. Prófíllinn málar andlit og húð ofan á. Eigin grunnur má
        vera skjámynd af Ready Player Me, VRoid eða Mixamo T-pose.
      </p>
      <div className="ac-base-grid">
        {STUDIO_BASES.map((base) => (
          <button
            key={base.id}
            type="button"
            className={`ac-base-card ${!customBase && baseId === base.id ? "on" : ""}`}
            onClick={() => onBase(base.id)}
          >
            <img src={mannequinDataUrl(base)} alt={base.label} />
            <span>{base.label}</span>
          </button>
        ))}
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
