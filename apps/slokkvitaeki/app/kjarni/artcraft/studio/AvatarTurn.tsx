"use client";

import type { OrbitView } from "./refs";

type Props = {
  yaw: number;
  onYaw: (deg: number) => void;
  view: OrbitView | null;
  onOpen: () => void;
  onFix: () => void;
  busy: boolean;
  hasMask: boolean;
};

export default function AvatarTurn({ yaw, onYaw, view, onOpen, onFix, busy, hasMask }: Props) {
  return (
    <div className="ac-turn">
      <h2>Snúa avatar og laga galla</h2>
      <p className="ac-hint">
        Dragðu til að skipta um sjónarhorn úr hringmyndunum. Opnaðu það, málaðu gallann
        rauðan á stillingarborðinu og biðja um lagfæringu — restin helst.
      </p>
      <label className="ac-range">
        Sjónarhorn {yaw}° · {view ? view.label : "vantar hringmynd"}
        <input
          type="range"
          min={0}
          max={359}
          value={yaw}
          onChange={(e) => onYaw(Number(e.target.value))}
        />
      </label>
      {view && (
        <figure className="ac-turn-view">
          <img src={view.src} alt={view.label} />
          <figcaption>{view.label}</figcaption>
        </figure>
      )}
      <div className="ac-row">
        <button type="button" className="ac-btn" onClick={onOpen} disabled={!view}>
          Opna þetta sjónarhorn
        </button>
        <button type="button" className="ac-btn ghost" onClick={onFix} disabled={busy || !hasMask}>
          {hasMask ? "Laga málað svæði" : "Málaðu gallann fyrst"}
        </button>
      </div>
    </div>
  );
}
