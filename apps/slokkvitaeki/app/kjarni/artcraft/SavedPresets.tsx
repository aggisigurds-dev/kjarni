"use client";

import { useState } from "react";

export type SavedPreset = {
  id: string;
  name: string;
  prompt: string;
  negativePrompt?: string;
  seed: number;
  createdAt: number;
};

export function readStoredPresets(storageKey: string): SavedPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (p): p is SavedPreset =>
          !!p &&
          typeof p === "object" &&
          typeof (p as SavedPreset).id === "string" &&
          typeof (p as SavedPreset).name === "string" &&
          typeof (p as SavedPreset).prompt === "string",
      )
      .map((p) => ({
        id: p.id,
        name: p.name,
        prompt: p.prompt,
        negativePrompt: typeof p.negativePrompt === "string" ? p.negativePrompt : undefined,
        seed: Number.isFinite(p.seed) ? Math.trunc(p.seed) : -1,
        createdAt: Number.isFinite(p.createdAt) ? p.createdAt : Date.now(),
      }));
  } catch {
    return [];
  }
}

export function writeStoredPresets(storageKey: string, presets: SavedPreset[]) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(presets));
  } catch {
    /* ignore quota errors */
  }
}

export function makePresetId(): string {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

type Props = {
  title: string;
  presets: SavedPreset[];
  onApply: (preset: SavedPreset) => void;
  onDelete: (id: string) => void;
  onSave: (name: string) => void;
  canSave: boolean;
  saveHint?: string;
  showNegativePrompt?: boolean;
};

export function SavedPresets({
  title,
  presets,
  onApply,
  onDelete,
  onSave,
  canSave,
  saveHint,
  showNegativePrompt = false,
}: Props) {
  const [draftName, setDraftName] = useState("");
  const [open, setOpen] = useState(false);

  function submit() {
    const trimmed = draftName.trim();
    if (!trimmed) return;
    onSave(trimmed);
    setDraftName("");
    setOpen(false);
  }

  return (
    <section className="ac-panel">
      <h2>{title}</h2>
      {canSave && !open && (
        <button type="button" className="ac-btn ghost" onClick={() => setOpen(true)}>
          Vista stillingu
        </button>
      )}
      {canSave && open && (
        <div className="ac-saved-save-row">
          <input
            type="text"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder="Nafn á stillingunni (t.d. „strönd um kvöld“)"
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") {
                setDraftName("");
                setOpen(false);
              }
            }}
            autoFocus
          />
          <button type="button" className="ac-btn" onClick={submit} disabled={!draftName.trim()}>
            Vista
          </button>
          <button
            type="button"
            className="ac-btn ghost"
            onClick={() => {
              setDraftName("");
              setOpen(false);
            }}
          >
            Hætta við
          </button>
        </div>
      )}
      {saveHint && canSave && !open && <p className="ac-hint">{saveHint}</p>}
      {!canSave && presets.length === 0 && (
        <p className="ac-hint">Keyrðu einn góðan bakgrunn fyrst — svo geturðu vistað hann hér.</p>
      )}
      {presets.length > 0 && (
        <ul className="ac-saved-list">
          {presets.map((p) => (
            <li key={p.id} className="ac-saved-row">
              <div className="ac-saved-main">
                <b>{p.name}</b>
                <span className="ac-saved-text">
                  {p.prompt.length > 120 ? `${p.prompt.slice(0, 120)}…` : p.prompt}
                </span>
                {showNegativePrompt && p.negativePrompt && (
                  <span className="ac-saved-neg">neikvætt: {p.negativePrompt}</span>
                )}
                <span className="ac-saved-seed">seed: {p.seed === -1 ? "slembið" : p.seed}</span>
              </div>
              <div className="ac-saved-actions">
                <button type="button" className="ac-btn" onClick={() => onApply(p)}>
                  Nota
                </button>
                <button type="button" className="ac-btn ghost" onClick={() => onDelete(p.id)}>
                  Eyða
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
