"use client";

// Einn takki við hlið Greining-flipans (Agnar 11.11.2026: „auto multistep greiningarferli aukalega").
// Eitt smellur keyrir allt sjálfvirka verkferlið (8 skref) — combo í flipanum stendur óbreytt til samanburðar.

import { ListOrdered, Loader2 } from "lucide-react";
import { useSjalfvirkt } from "../../lib/board/sjalfvirkt-stada";
import { SJALFVIRKT_SKREF_LYSING } from "../../lib/board/sjalfvirkt-takki";

export function SjalfvirktTakki({ onKeyra, uttekt }: { onKeyra: () => void; uttekt: boolean }) {
  const keyrir = useSjalfvirkt((s) => s.keyrir);
  return (
    <button
      type="button"
      data-sjalfvirkt-takki
      disabled={keyrir}
      title={
        uttekt
          ? SJALFVIRKT_SKREF_LYSING
          : "Tengdu teikninguna við hæð fyrst — sjálfvirka ferlið vistar til baka á hæðina"
      }
      onClick={onKeyra}
      className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-emerald-400/45 bg-[#1a1d2e]/95 py-1.5 pr-3 pl-2.5 text-[12px] font-semibold whitespace-nowrap text-stone-100 shadow-xl shadow-black/40 active:translate-y-px disabled:opacity-60"
    >
      {keyrir ? <Loader2 className="size-3.5 animate-spin text-emerald-400" /> : <ListOrdered className="size-3.5 text-emerald-400" />}
      {keyrir ? "Keyrir…" : "Sjálfvirkt"}
    </button>
  );
}
