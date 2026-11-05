"use client";

import { ORBIT_SLOTS } from "./profile";
import { yawToSlot, type TurnPreview } from "./refs";

type Props = {
  yaw: number;
  onYaw: (deg: number) => void;
  view: TurnPreview | null;
  onTurn: () => void;
  onOpen: () => void;
  onFix: () => void;
  busy: boolean;
  hasMask: boolean;
  hasStill: boolean;
};

export default function AvatarTurn({
  yaw,
  onYaw,
  view,
  onTurn,
  onOpen,
  onFix,
  busy,
  hasMask,
  hasStill,
}: Props) {
  const slot = yawToSlot(yaw);
  const kindHint =
    view?.kind === "avatar"
      ? "Snúinn avatar — málaðu gallann"
      : view?.kind === "orbit"
        ? "Hringmynd — snúðu avatarnum til að fá þetta horn"
        : view
          ? "Núverandi avatar — veldu horn og snúðu"
          : "Gerðu avatar fyrst";

  return (
    <div className="ac-turn">
      <h2>Snúa avatar og laga galla</h2>
      <p className="ac-hint">
        Dragðu eða veldu horn. Snúðu avatarnum, málaðu gallann rauðan á
        stillingarborðinu, skrifaðu hvað á að laga og ýttu á Laga málað svæði —
        restin helst.
      </p>
      <div className="ac-row ac-chips">
        {ORBIT_SLOTS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`ac-btn ghost ${slot === item.id ? "on" : ""}`}
            onClick={() => onYaw(item.deg)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <label className="ac-range">
        Sjónarhorn {yaw}° · {view ? view.label : "ekkert"}
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
          <figcaption>
            {view.label} · {kindHint}
          </figcaption>
        </figure>
      )}
      {!view && <p className="ac-hint">{kindHint}</p>}
      <div className="ac-row">
        <button type="button" className="ac-btn" onClick={onTurn} disabled={busy || !hasStill}>
          {busy ? "Sný…" : "Snúa avatar"}
        </button>
        <button type="button" className="ac-btn ghost" onClick={onOpen} disabled={!view}>
          Opna til að mála
        </button>
        <button type="button" className="ac-btn ghost" onClick={onFix} disabled={busy || !hasMask}>
          {hasMask ? "Laga málað svæði" : "Málaðu gallann fyrst"}
        </button>
      </div>
    </div>
  );
}
