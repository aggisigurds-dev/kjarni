/**
 * Custom colours picked with the native colour input, remembered per browser
 * so the last few show up as swatches next to the presets.
 */

import { useSyncExternalStore } from "react";

export const CUSTOM_COLORS_KEY = "turbopaint:custom-colors";
const MAX_REMEMBERED = 6;
const EMPTY: string[] = [];

/** `#rgb`, `#rrggbb` or `#rrggbbaa` → lowercase `#rrggbb`; null for anything else. */
export function normalizeHex(value: string | undefined | null): string | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  const long = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/.exec(v);
  return long ? `#${long[1]}` : null;
}

/** `#rrggbb` + two-digit alpha, e.g. withAlpha("#ff0000", "66") → "#ff000066". */
export function withAlpha(hex: string, alpha: string | undefined): string {
  const base = normalizeHex(hex);
  if (!base) return hex;
  return alpha ? `${base}${alpha}` : base;
}

let cached: string[] = EMPTY;
let cachedRaw: string | null | undefined;
const listeners = new Set<() => void>();

function read(): string[] {
  if (typeof window === "undefined") return EMPTY;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(CUSTOM_COLORS_KEY);
  } catch {
    return cached;
  }
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    cached = Array.isArray(parsed)
      ? parsed.map((c) => normalizeHex(typeof c === "string" ? c : "")).filter((c): c is string => Boolean(c))
      : EMPTY;
  } catch {
    cached = EMPTY;
  }
  return cached;
}

export function readCustomColors(): string[] {
  return read();
}

export function rememberCustomColor(value: string): void {
  const hex = normalizeHex(value);
  if (!hex) return;
  const next = [hex, ...read().filter((c) => c !== hex)].slice(0, MAX_REMEMBERED);
  try {
    window.localStorage.setItem(CUSTOM_COLORS_KEY, JSON.stringify(next));
  } catch {
    /* private mode — the colour still applies, it just is not remembered */
  }
  cachedRaw = undefined;
  read();
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useCustomColors(): string[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
