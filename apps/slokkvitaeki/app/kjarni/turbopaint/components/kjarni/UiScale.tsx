"use client";

import { useEffect, useState } from "react";

// Viðmótsstærð á snertiskjá (Agnar 2026-11-14: „texti og takkar of smá … eða setja +- takka").
// Stækkar stikurnar (ekki teikni-strigann) með CSS `zoom` gegnum --tp-ui breytuna á .tp-root.
// Sérstaklega gagnlegt þegar TurboPaint er opnað í „Tölvusíðu"-ham í Chrome á síma, þar sem
// skjáborðsþéttleiki verður örsmár á litlum skjá. Valið munast í símanum (localStorage).

export const UI_SCALE_STEPS = [1, 1.15, 1.3, 1.5, 1.75];
const LYKILL = "tp_ui_scale";

export function lesaUiScale(): number {
  try {
    const v = Number(window.localStorage.getItem(LYKILL));
    return UI_SCALE_STEPS.includes(v) ? v : 1;
  } catch {
    return 1; // einkagluggi
  }
}

export function vistaUiScale(v: number) {
  try {
    window.localStorage.setItem(LYKILL, String(v));
  } catch {
    /* einkagluggi — gildir þá aðeins þessa heimsókn */
  }
}

/** „Aa − +" — stillir viðmótsstærð. Sést aðeins á snertiskjá (sími/spjaldtölva, líka Chrome „Tölvusíða"). */
export function UiScale({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(pointer: coarse)");
    const uppf = () => setCoarse(mq.matches);
    uppf();
    mq.addEventListener("change", uppf);
    return () => mq.removeEventListener("change", uppf);
  }, []);

  if (!coarse) return null;

  const idx = Math.max(0, UI_SCALE_STEPS.indexOf(value));
  const breyta = (att: number) => {
    const ny = UI_SCALE_STEPS[Math.min(UI_SCALE_STEPS.length - 1, Math.max(0, idx + att))];
    if (ny !== value) onChange(ny);
  };

  return (
    <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-white/10 bg-[#1a1d2e]/95 px-1.5 py-1 text-stone-100 shadow-xl shadow-black/40">
      <button
        type="button"
        aria-label="Minnka viðmót"
        title="Minnka texta og takka"
        disabled={idx === 0}
        onClick={() => breyta(-1)}
        className="flex size-9 items-center justify-center rounded-full text-xl leading-none hover:bg-white/10 active:translate-y-px disabled:opacity-40"
      >
        −
      </button>
      <span className="select-none px-0.5 text-[11px] font-semibold tracking-wide text-stone-300" aria-hidden>
        Aa
      </span>
      <button
        type="button"
        aria-label="Stækka viðmót"
        title="Stækka texta og takka"
        disabled={idx === UI_SCALE_STEPS.length - 1}
        onClick={() => breyta(1)}
        className="flex size-9 items-center justify-center rounded-full text-xl leading-none hover:bg-white/10 active:translate-y-px disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}
