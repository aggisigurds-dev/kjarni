"use client";

import { useState } from "react";
import { VERSION_PRESETS, type AvatarVersion } from "./versions";

type Props = {
  presetId: string;
  onPreset: (id: string) => void;
  versions: AvatarVersion[];
  onMake: (label: string) => void;
  onSave: (label: string) => void;
  onLoad: (row: AvatarVersion) => void;
  onDelete: (id: string) => void;
  busy: boolean;
  hasStill: boolean;
  hasProfile: boolean;
};

export default function VersionsPanel({
  presetId,
  onPreset,
  versions,
  onMake,
  onSave,
  onLoad,
  onDelete,
  busy,
  hasStill,
  hasProfile,
}: Props) {
  const [name, setName] = useState("");
  const preset = VERSION_PRESETS.find((p) => p.id === presetId) || VERSION_PRESETS[0];
  const label = name.trim() || preset.label;

  return (
    <div className="ac-versions">
      <h2>Útgáfur af avatar</h2>
      <p className="ac-hint">
        Vistaðu nokkrar útgáfur — sumar, elegant, jólafatnaður, diskó — eða gefðu
        nýju nafn. Þær fylgja prófílnum.
      </p>
      <div className="ac-row ac-chips">
        {VERSION_PRESETS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`ac-btn ghost ${presetId === item.id ? "on" : ""}`}
            onClick={() => {
              onPreset(item.id);
              setName("");
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="ac-row">
        <label>
          Nafn útgáfu
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={preset.label}
          />
        </label>
        <button
          type="button"
          className="ac-btn"
          onClick={() => onMake(label)}
          disabled={busy || !hasStill || !hasProfile}
        >
          {busy ? "Útgáfa…" : `Gera: ${label}`}
        </button>
        <button
          type="button"
          className="ac-btn ghost"
          onClick={() => onSave(label)}
          disabled={!hasStill || !hasProfile}
        >
          Vista núverandi
        </button>
      </div>
      {versions.length === 0 ? (
        <p className="ac-hint">
          {hasProfile ? "Engin útgáfa vistuð enn." : "Búðu til prófíl til að vista útgáfur."}
        </p>
      ) : (
        <div className="ac-version-grid">
          {versions.map((row) => (
            <figure key={row.id} className="ac-version-card">
              <button type="button" className="ac-version-thumb" onClick={() => onLoad(row)}>
                <img src={row.image} alt={row.label} />
              </button>
              <figcaption>
                <button type="button" className="ac-btn ghost" onClick={() => onLoad(row)}>
                  {row.label}
                </button>
                <button type="button" className="ac-btn ghost" onClick={() => onDelete(row.id)}>
                  Eyða
                </button>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
