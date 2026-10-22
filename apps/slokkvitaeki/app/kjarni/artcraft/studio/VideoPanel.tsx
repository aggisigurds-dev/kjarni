"use client";

import { useState } from "react";
import { catalogOf, findAction, type ActionCommand, type VideoSettings } from "./video";

type Props = {
  settings: VideoSettings;
  onChange: (next: VideoSettings) => void;
  onMake: () => void;
  busy: boolean;
  progress: string;
  videoUrl: string;
  hasStill: boolean;
  prompt: string;
  custom: ActionCommand[];
  onSaveAction: (label: string) => void;
  onDeleteAction: (id: string) => void;
};

export default function VideoPanel({
  settings,
  onChange,
  onMake,
  busy,
  progress,
  videoUrl,
  hasStill,
  prompt,
  custom,
  onSaveAction,
  onDeleteAction,
}: Props) {
  const [name, setName] = useState("");
  const actions = catalogOf(custom);
  const active = findAction(settings.kind, custom);

  function patch(next: Partial<VideoSettings>) {
    onChange({ ...settings, ...next });
  }

  function pick(action: ActionCommand) {
    patch({ kind: action.id, motion: action.motion });
  }

  return (
    <section className="ac-panel ac-video">
      <h2>Hreyfimynd</h2>
      <p className="ac-hint">
        Veldu athöfn — dansa, pósur, standa upp, snúa í hring — eða vistaðu nýja skipun úr
        promptinu. Prófíllinn heldur andlitinu. Útkoma er WebM.
      </p>
      <div className="ac-row ac-chips">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            className={`ac-btn ghost ${settings.kind === action.id ? "on" : ""}`}
            onClick={() => pick(action)}
          >
            {action.label}
          </button>
        ))}
      </div>
      <p className="ac-hint ac-action-prompt">{active.prompt}</p>
      <div className="ac-row">
        <label>
          Nafn nýrrar skipunar
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="t.d. Salsa, vinka, setjast"
          />
        </label>
        <button
          type="button"
          className="ac-btn ghost"
          disabled={!prompt.trim()}
          onClick={() => {
            onSaveAction(name.trim() || prompt.trim().slice(0, 32));
            setName("");
          }}
        >
          Vista skipun úr prompti
        </button>
        {active.custom && (
          <button type="button" className="ac-btn ghost" onClick={() => onDeleteAction(active.id)}>
            Eyða skipun
          </button>
        )}
      </div>
      <div className="ac-settings">
        <label>
          Rammar {settings.frames}
          <input
            type="range"
            min={4}
            max={16}
            value={settings.frames}
            onChange={(e) => patch({ frames: Number(e.target.value) })}
          />
        </label>
        <label>
          FPS {settings.fps}
          <input
            type="range"
            min={4}
            max={16}
            value={settings.fps}
            onChange={(e) => patch({ fps: Number(e.target.value) })}
          />
        </label>
        <label className="ac-range">
          Stykkur {settings.motion}/10
          <input
            type="range"
            min={1}
            max={10}
            value={settings.motion}
            onChange={(e) => patch({ motion: Number(e.target.value) })}
          />
          <span className="ac-hint">
            Dans og snúningur þurfa hærra gildi. Of hátt getur sljáðrað andlit.
          </span>
        </label>
      </div>
      {progress && <p className="ac-hint">{progress}</p>}
      <button type="button" className="ac-btn" onClick={onMake} disabled={busy || !hasStill}>
        {busy ? "Sauma…" : hasStill ? `Gera: ${active.label}` : "Settu inn mynd eða gerðu avatar fyrst"}
      </button>
      {videoUrl && (
        <figure className="ac-clip">
          <video src={videoUrl} controls loop playsInline />
          <figcaption>
            <a className="ac-btn ghost" href={videoUrl} download="kjarni-studio-hreyfimynd.webm">
              Sækja WebM
            </a>
          </figcaption>
        </figure>
      )}
    </section>
  );
}
