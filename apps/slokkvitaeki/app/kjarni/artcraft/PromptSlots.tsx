"use client";

import { useEffect, useRef, useState } from "react";

export type PromptSlotData = {
  slots: string[];
  active: number;
};

const DEFAULT_COUNT = 3;

export function createDefaultPromptSlots(initial: string, count: number = DEFAULT_COUNT): PromptSlotData {
  const slots: string[] = Array.from({ length: count }, (_, i) => (i === 0 ? initial : ""));
  return { slots, active: 0 };
}

export function normalizePromptSlots(
  raw: unknown,
  fallbackPrompt: string,
  count: number = DEFAULT_COUNT,
): PromptSlotData {
  const src = (raw && typeof raw === "object" ? (raw as Partial<PromptSlotData>) : {}) as Partial<PromptSlotData>;
  const slotsIn = Array.isArray(src.slots) ? src.slots : [];
  const slots: string[] = Array.from({ length: count }, (_, i) => {
    const v = slotsIn[i];
    if (typeof v === "string") return v;
    return i === 0 ? fallbackPrompt : "";
  });
  const activeRaw = typeof src.active === "number" ? src.active : 0;
  const active = Math.max(0, Math.min(count - 1, Math.floor(activeRaw)));
  return { slots, active };
}

export function readStoredPromptSlots(
  storageKey: string,
  fallbackPrompt: string,
  count: number = DEFAULT_COUNT,
): PromptSlotData {
  if (typeof window === "undefined") return createDefaultPromptSlots(fallbackPrompt, count);
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return createDefaultPromptSlots(fallbackPrompt, count);
    return normalizePromptSlots(JSON.parse(raw), fallbackPrompt, count);
  } catch {
    return createDefaultPromptSlots(fallbackPrompt, count);
  }
}

type Props = {
  label: string;
  data: PromptSlotData;
  onChange: (next: PromptSlotData) => void;
  rows?: number;
  placeholder?: string;
  /** Fjöldi slots — default 3. Hækka í 5 fyrir tól sem þurfa fleiri. */
  count?: number;
};

export function PromptSlots({ label, data, onChange, rows = 3, placeholder, count = DEFAULT_COUNT }: Props) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (editingIndex !== null && taRef.current) {
      const el = taRef.current;
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }
  }, [editingIndex]);

  function setSlot(i: number, value: string) {
    const next = [...data.slots];
    while (next.length < count) next.push("");
    next[i] = value;
    onChange({ ...data, slots: next });
  }

  function setActive(i: number) {
    onChange({ ...data, active: i });
  }

  const indices = Array.from({ length: count }, (_, i) => i);

  return (
    <div className="ac-prompt-slots" aria-label={label}>
      <p className="ac-prompt-slots-label">{label}</p>
      {indices.map((i) => {
        const text = data.slots[i] ?? "";
        const isActive = data.active === i;
        const isEditing = editingIndex === i;
        return (
          <div key={i} className={`ac-prompt-slot ${isActive ? "on" : ""}`}>
            <span className="ac-prompt-slot-num" aria-hidden="true">{i + 1}</span>
            {isEditing ? (
              <textarea
                ref={taRef}
                value={text}
                rows={rows}
                placeholder={placeholder}
                onChange={(e) => setSlot(i, e.target.value)}
                onBlur={() => setEditingIndex(null)}
              />
            ) : (
              <button
                type="button"
                className="ac-prompt-slot-preview"
                onClick={() => setEditingIndex(i)}
                aria-label={`Breyta prompt-i ${i + 1}`}
              >
                {text ? (
                  <span className="ac-prompt-slot-text">{text}</span>
                ) : (
                  <span className="ac-prompt-slot-empty">Tómt — tappaðu til að skrifa</span>
                )}
              </button>
            )}
            <button
              type="button"
              className={`ac-prompt-slot-pick ${isActive ? "on" : ""}`}
              onClick={() => setActive(i)}
              aria-pressed={isActive}
              aria-label={isActive ? `Prompt ${i + 1} er virkt` : `Velja prompt ${i + 1}`}
              title={isActive ? "Virkt" : "Veldu þetta prompt"}
            >
              {isActive ? "✓" : "+"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
