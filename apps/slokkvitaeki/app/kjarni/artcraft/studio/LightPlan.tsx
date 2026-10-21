"use client";

import {
  applyPreset,
  BACKGROUNDS,
  bumpPower,
  LIGHT_COLORS,
  LIGHT_MODS,
  LIGHT_SLOTS,
  lightingPrompt,
  PLAN_PRESETS,
  type LightPlan,
  type LightSlot,
  type StudioLight,
} from "./lights";

type Props = {
  plan: LightPlan;
  onChange: (next: LightPlan) => void;
};

function patchLight(plan: LightPlan, slot: LightSlot, patch: Partial<StudioLight>): LightPlan {
  return { ...plan, [slot]: { ...plan[slot], ...patch } };
}

export default function LightPlanPanel({ plan, onChange }: Props) {
  const hint = lightingPrompt(plan);

  return (
    <div className="ac-lights">
      <h2>Stúdíóljós</h2>
      <p className="ac-hint">
        Þrjú flass eins og á ljósaáætlun — vinstri og hægri 85" paraply, lykilljós 110". +/- stillir
        styrk. Þetta fer inn í promptið við myndun.
      </p>
      <div className="ac-row ac-chips">
        {PLAN_PRESETS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`ac-btn ghost ${plan.preset === item.id ? "on" : ""}`}
            onClick={() => onChange(applyPreset(item.id))}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className={`ac-lights-stage bg-${plan.background}`}>
        <p className="ac-lights-bg">{BACKGROUNDS.find((b) => b.id === plan.background)?.label} bakgrunnur</p>
        <div className="ac-subject" aria-hidden="true" />
        {(["left", "right", "key"] as LightSlot[]).map((slot) => {
          const light = plan[slot];
          const meta = LIGHT_SLOTS.find((s) => s.id === slot)!;
          return (
            <article key={slot} className={`ac-lamp ${slot} ${light.power <= 0 ? "off" : ""}`}>
              <div className={`ac-lamp-icon ${slot === "key" ? "wide" : "side"}`} aria-hidden="true">
                <span className="ac-umb" />
                <span className="ac-head" />
              </div>
              <p className="ac-lamp-name">
                {meta.label}
                {slot === "key" ? " · 110\"" : " · 85\""}
              </p>
              <div className="ac-pm">
                <button
                  type="button"
                  className="ac-btn ghost"
                  aria-label={`${meta.label} minna`}
                  onClick={() => onChange(patchLight(plan, slot, { power: bumpPower(light.power, -1) }))}
                >
                  −
                </button>
                <strong>{light.power}</strong>
                <button
                  type="button"
                  className="ac-btn ghost"
                  aria-label={`${meta.label} meira`}
                  onClick={() => onChange(patchLight(plan, slot, { power: bumpPower(light.power, 1) }))}
                >
                  +
                </button>
              </div>
            </article>
          );
        })}
        <div className="ac-camera" title="Myndavél">
          <span />
          Myndavél
        </div>
      </div>

      <div className="ac-settings">
        <label>
          Bakgrunnur
          <select
            value={plan.background}
            onChange={(e) => onChange({ ...plan, background: e.target.value as LightPlan["background"] })}
          >
            {BACKGROUNDS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </label>
        {LIGHT_SLOTS.map((slot) => (
          <label key={`${slot.id}-color`}>
            {slot.label} litur
            <select
              value={plan[slot.id].color}
              onChange={(e) =>
                onChange(patchLight(plan, slot.id, { color: e.target.value as StudioLight["color"] }))
              }
            >
              {LIGHT_COLORS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        ))}
        {LIGHT_SLOTS.map((slot) => (
          <label key={`${slot.id}-mod`}>
            {slot.label} form
            <select
              value={plan[slot.id].modifier}
              onChange={(e) =>
                onChange(patchLight(plan, slot.id, { modifier: e.target.value as StudioLight["modifier"] }))
              }
            >
              {LIGHT_MODS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {hint ? <p className="ac-hint ac-lights-prompt">{hint}</p> : <p className="ac-hint">Öll ljós slökkt — ekkert ljósa-prompt.</p>}
    </div>
  );
}
