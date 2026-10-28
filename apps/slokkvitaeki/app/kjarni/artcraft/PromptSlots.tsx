"use client";

import { useEffect, useRef, useState } from "react";

export type PromptSlotData = {
  slots: [string, string, string];
  active: 0 | 1 | 2;
};

export function createDefaultPromptSlots(initial: string): PromptSlotData {
  return { slots: [initial, "", ""], active: 0 };
}

export function normalizePromptSlots(
  raw: unknown,
  fallbackPrompt: string,
): PromptSlotData {
  const src = (raw && typeof raw === "object" ? (raw as Partial<PromptSlotData>) : {}) as Partial<PromptSlotData>;
  const slotsIn = Array.isArray(src.slots) ? src.slots : [];
  const slots: [string, string, string] = [
    typeof slotsIn[0] === "string" ? slotsIn[0] : fallbackPrompt,
    typeof slotsIn[1] === "string" ? slotsIn[1] : "",
    typeof slotsIn[2] === "string" ? slotsIn[2] : "",
  ];
  const active: 0 | 1 | 2 = src.active === 1 ? 1 : src.active === 2 ? 2 : 0;
  return { slots, active };
}

export function readStoredPromptSlots(storageKey: string, fallbackPrompt: string): PromptSlotData {
  if (typeof window === "undefined") return createDefaultPromptSlots(fallbackPrompt);
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return createDefaultPromptSlots(fallbackPrompt);
    return normalizePromptSlots(JSON.parse(raw), fallbackPrompt);
  } catch {
    return createDefaultPromptSlots(fallbackPrompt);
  }
}

type Props = {
  label: string;
  data: PromptSlotData;
  onChange: (next: PromptSlotData) => void;
  rows?: number;
  placeholder?: string;
};

export function PromptSlots({ label, data, onChange, rows = 3, placeholder }: Props) {
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
    const next: [string, string, string] = [data.slots[0], data.slots[1], data.slots[2]];
    next[i] = value;
    onChange({ ...data, slots: next });
  }

  function setActive(i: 0 | 1 | 2) {
    onChange({ ...data, active: i });
  }

  return (
    <div className="ac-prompt-slots" aria-label={label}>
      <p className="ac-prompt-slots-label">{label}</p>
      {([0, 1, 2] as const).map((i) => {
        const text = data.slots[i];
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
