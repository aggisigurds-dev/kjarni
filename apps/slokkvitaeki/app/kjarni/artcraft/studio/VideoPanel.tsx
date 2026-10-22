"use client";

import { MOTION_KINDS, type VideoSettings } from "./video";

type Props = {
  settings: VideoSettings;
  onChange: (next: VideoSettings) => void;
  onMake: () => void;
  busy: boolean;
  progress: string;
  videoUrl: string;
  hasStill: boolean;
};

export default function VideoPanel({ settings, onChange, onMake, busy, progress, videoUrl, hasStill }: Props) {
  function patch(next: Partial<VideoSettings>) {
    onChange({ ...settings, ...next });
  }

  return (
    <section className="ac-panel ac-video">
      <h2>Hreyfimynd</h2>
      <p className="ac-hint">
        Úr avatar eða stúdíómynd. Prófíllinn heldur andlitinu á milli ramma. Stutt lykkja — öndun,
        höfuðhreyfing eða snúningur — saumuð í WebM.
      </p>
      <div className="ac-settings">
        <label>
          Hreyfing
          <select value={settings.kind} onChange={(e) => patch({ kind: e.target.value as VideoSettings["kind"] })}>
            {MOTION_KINDS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Rammar {settings.frames}
          <input
            type="range"
            min={4}
            max={12}
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
          <span className="ac-hint">Lágt heldur avatarið. Hátt hreyfir meira — andlit getur sljáðrað.</span>
        </label>
      </div>
      {progress && <p className="ac-hint">{progress}</p>}
      <button type="button" className="ac-btn" onClick={onMake} disabled={busy || !hasStill}>
        {busy ? "Sauma…" : hasStill ? "Búa til hreyfimynd" : "Settu inn mynd eða gerðu avatar fyrst"}
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
