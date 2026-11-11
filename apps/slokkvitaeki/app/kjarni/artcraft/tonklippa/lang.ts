"use client";

/** Á hvaða máli heiti stökka og hreyfinga eru sýnd (enska eða íslenska).
 *  Valið er geymt í tækinu; það sem er vistað um iðkendur breytist ekki. */

import { useSyncExternalStore } from "react";
import type { Lang } from "./elements";

const KEY = "tonklippa_heiti_v1";
/** Skautafólk notar alþjóðlegu (ensku) heitin mest, svo þau eru sjálfgefin. */
export const DEFAULT_LANG: Lang = "en";

const listeners = new Set<() => void>();
let current: Lang | null = null;

function read(): Lang {
  if (current) return current;
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(KEY);
  } catch {
    /* einkagluggi */
  }
  current = stored === "is" || stored === "en" ? stored : DEFAULT_LANG;
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setElementLang(lang: Lang): void {
  current = lang;
  try {
    window.localStorage.setItem(KEY, lang);
  } catch {
    /* einkagluggi */
  }
  listeners.forEach((l) => l());
}

export function useElementLang(): Lang {
  return useSyncExternalStore(subscribe, read, () => DEFAULT_LANG);
}
