"use client";

import { useRef } from "react";
import { cn } from "../../lib/utils";
import { normalizeHex, rememberCustomColor } from "../../lib/board/custom-colors";

/**
 * The "+" swatch: opens the browser's own colour picker. `onPreview` fires
 * while the picker is being dragged (no history step), `onChange` when it is
 * dismissed — that one is remembered as a recent custom colour.
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
        value={base}
        aria-label={`${title} — velja`}
        className="absolute inset-0 size-full cursor-pointer opacity-0"
        onInput={(e) => onPreview?.(e.currentTarget.value)}
        onChange={(e) => {
          const hex = e.currentTarget.value;
          rememberCustomColor(hex);
          onChange(hex);
        }}
      />
    </span>
  );
}
