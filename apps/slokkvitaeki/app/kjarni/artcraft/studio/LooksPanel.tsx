"use client";

import { LOOK_CHIPS, LOOK_GROUPS, toggleLook } from "./looks";

type Props = {
  selected: string[];
  onChange: (next: string[]) => void;
  onLookbook: () => void;
  busy: boolean;
  hasStill: boolean;
};

export default function LooksPanel({ selected, onChange, onLookbook, busy, hasStill }: Props) {
  function toggle(id: string) {
    onChange(toggleLook(selected, id));
  }

  return (
    <div className="ac-looks">
      <h2>Útlit og lookbook</h2>
      <p className="ac-hint">
        Myndavél, svipbrigði og fatnaður bætast við promptið. Lookbook gerir fjórar kyrrar
        stúdíómyndir (nálægt, ¾, heill líkami, hlið) úr avatar eða upprunamynd.
      </p>
      {LOOK_GROUPS.map((group) => (
        <div key={group.id} className="ac-look-group">
          <p className="ac-hint">{group.label}</p>
          <div className="ac-row ac-chips">
            {LOOK_CHIPS.filter((c) => c.group === group.id).map((chip) => (
              <button
                key={chip.id}
                type="button"
                className={`ac-btn ghost ${selected.includes(chip.id) ? "on" : ""}`}
                onClick={() => toggle(chip.id)}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="ac-row">
        <button type="button" className="ac-btn" onClick={onLookbook} disabled={busy || !hasStill}>
          {busy ? "Lookbook…" : "Lookbook · 4 myndir"}
        </button>
        {selected.length > 0 && (
          <button type="button" className="ac-btn ghost" onClick={() => onChange([])}>
            Hreinsa útlit
          </button>
        )}
      </div>
    </div>
  );
}

