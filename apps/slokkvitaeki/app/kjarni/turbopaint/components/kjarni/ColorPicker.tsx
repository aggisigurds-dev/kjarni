"use client";

import { useEffect, useRef } from "react";
import { cn } from "../../lib/utils";
import { normalizeHex, rememberCustomColor } from "../../lib/board/custom-colors";

/**
 * The "+" swatch: opens the browser's own colour picker. `onPreview` fires
 * while the picker is being dragged (no history step), `onChange` when it is
 * dismissed — that one is remembered as a recent custom colour.
 *
 * ATH (Agnar 04.11.2026: „bættust óvart fullt af svörtum litum í stikuna"): React-`onChange` á `<input type=color>` er
 * `input`-atburðurinn og kviknar við HVERT skref þegar dregið er í litaveljaranum — hvert skref var vistað sem nýr
 * litur og sex nánast svartir skygging fylltu stikuna. Við vistum aðeins á raunverulega `change`-atburðinum
 * (veljari lokað / lit staðfestur).
 */
export function CustomColorSwatch({
  value,
  onPreview,
  onChange,
  className,
  title = "Sérsniðinn litur",
}: {
  value: string;
  onPreview?: (hex: string) => void;
  onChange: (hex: string) => void;
  className?: string;
  title?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const base = normalizeHex(value) ?? "#ff4d00";
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const kominn = () => {
      rememberCustomColor(el.value);
      onChangeRef.current(el.value);
    };
    el.addEventListener("change", kominn);
    return () => el.removeEventListener("change", kominn);
  }, []);
  // Óstýrður reitur: stýrður reitur (value=) er settur aftur á gamla litinn eftir hvert `input`-skref því forskoðunin
  // breytir ekki stílnum — veljarinn rykktist til baka. Liturinn er samræmdur hér þegar stíllinn breytist.
  useEffect(() => {
    const el = inputRef.current;
    if (el && el.value !== base) el.value = base;
  }, [base]);
  return (
    <span className={cn("relative inline-flex size-6 shrink-0", className)}>
      <button
        type="button"
        title={title}
        aria-label={title}
        onClick={() => inputRef.current?.click()}
        className="size-full rounded-md border border-white/25 text-[13px] font-bold leading-none text-white shadow-[inset_0_0_0_1px_rgba(0,0,0,.35)]"
        style={{
          background: "conic-gradient(from 90deg, #f43f5e, #f59e0b, #84cc16, #06b6d4, #6366f1, #d946ef, #f43f5e)",
        }}
      >
        +
      </button>
      <input
        ref={inputRef}
        type="color"
        defaultValue={base}
        aria-label={`${title} — velja`}
        className="absolute inset-0 size-full cursor-pointer opacity-0"
        onInput={(e) => onPreview?.(e.currentTarget.value)}
      />
    </span>
  );
}
