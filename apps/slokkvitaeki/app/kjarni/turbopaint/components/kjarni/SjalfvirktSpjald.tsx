"use client";

// Framvinduspjald sjálfvirka verkferlisins (lib/board/sjalfvirkt.ts): skrefin, staða hvers og tölur, „Stöðva" (hættir án
// þess að vista), spurningin á leiðréttri hæð („Bæta við nýju / Hætta við" — Hætta við sjálfgefið) og yfirlitið.

import { AlertTriangle, Check, CircleDashed, Loader2, Minus, Square, Wand2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useSjalfvirkt, type SkrefStada } from "../../lib/board/sjalfvirkt-stada";

const klukka = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function Takn({ stada }: { stada: SkrefStada }) {
  if (stada === "keyrir") return <Loader2 className="size-3.5 animate-spin text-[#FE653F]" />;
  if (stada === "lokid") return <Check className="size-3.5 text-emerald-400" />;
  if (stada === "villa") return <AlertTriangle className="size-3.5 text-amber-300" />;
  if (stada === "sleppt") return <Minus className="size-3.5 text-white/50" />;
  if (stada === "stodvad") return <Square className="size-3 text-white/40" />;
  return <CircleDashed className="size-3.5 text-white/30" />;
}

export function SjalfvirktSpjald() {
  const s = useSjalfvirkt();
  const [byrjad, setByrjad] = useState(() => Date.now());
  const [nu, setNu] = useState(() => Date.now());
  useEffect(() => {
    if (s.keyrir) setByrjad(Date.now());
  }, [s.keyrir]);
  useEffect(() => {
    if (!s.keyrir) return;
    const t = window.setInterval(() => setNu(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [s.keyrir]);
  if (!s.synilegt) return null;
  const btn = "rounded-md px-2.5 py-1.5 text-[12px] font-semibold";
  return (
    <div
      role="dialog"
      aria-label="Sjálfvirkt verkferli"
      data-sjalfvirkt={s.keyrir ? "keyrir" : s.vistun ?? "lokid"}
      className="pointer-events-auto absolute top-16 right-3 z-40 flex max-h-[calc(100%-5rem)] w-[372px] max-w-[calc(100%-1.5rem)] flex-col rounded-xl border border-white/10 bg-[#1a1d2e]/97 p-3 text-stone-100 shadow-2xl"
    >
      <div className="flex items-center gap-1.5">
        <Wand2 className="size-4 text-[#FE653F]" />
        <span className="text-[13px] font-semibold">Sjálfvirkt verkferli</span>
        {s.keyrir ? <span className="ml-1 text-[11px] tabular-nums text-white/50">{klukka(nu - byrjad)}</span> : null}
        {!s.keyrir && !s.spurning ? (
          <button type="button" aria-label="Loka" onClick={() => s.loka()} className="ml-auto rounded p-1 hover:bg-white/10">
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>
      <ol className="mt-2 flex min-h-0 flex-1 flex-col gap-1 overflow-auto" aria-label="Skref">
        {s.skref.map((k, i) => (
          <li key={k.id} data-skref={k.id} data-stada={k.stada} className="rounded-lg bg-white/5 px-2 py-1.5">
            <div className="flex items-center gap-1.5 text-[12px]">
              <Takn stada={k.stada} />
              <span className="font-semibold">
                {String.fromCharCode(97 + i)}) {k.heiti}
              </span>
              {k.ms != null && k.stada !== "keyrir" ? <span className="ml-auto text-[10.5px] tabular-nums text-white/40">{(k.ms / 1000).toFixed(1).replace(".", ",")} s</span> : null}
            </div>
            {k.texti ? (
              <div className={`mt-0.5 pl-5 text-[11.5px] leading-snug ${k.stada === "villa" ? "text-amber-200" : "text-white/70"}`}>{k.texti}</div>
            ) : null}
            {k.stada === "keyrir" && k.pros != null ? (
              <div className="mt-1 ml-5 h-1 overflow-hidden rounded bg-white/10">
                <div className="h-full rounded bg-[#FE653F] transition-[width] duration-500" style={{ width: `${Math.max(3, Math.min(100, k.pros))}%` }} />
              </div>
            ) : null}
          </li>
        ))}
      </ol>
      {s.yfirlit ? (
        <div data-sjalfvirkt-yfirlit className="mt-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[12px] leading-snug">
          {s.yfirlit}
        </div>
      ) : null}
      {s.spurning ? (
        <div role="alertdialog" aria-label="Hæðin er leiðrétt" data-sjalfvirkt-spurning className="mt-2 rounded-lg border border-amber-400/60 bg-amber-500/15 p-2">
          <div className="text-[12.5px] font-semibold text-amber-100">{s.spurning.texti}</div>
          <div className="mt-1 text-[11.5px] leading-snug text-amber-100/80">{s.spurning.skyring}</div>
          <div className="mt-2 flex gap-1.5">
            <button type="button" autoFocus onClick={() => s.spurning?.svara("haetta")} className={`${btn} bg-white/15 ring-1 ring-white/40 hover:bg-white/20`}>
              Hætta við
            </button>
            <button type="button" onClick={() => s.spurning?.svara("baeta")} className={`${btn} bg-[#FE653F] text-white hover:bg-[#ff7a58]`}>
              Bæta við nýju
            </button>
          </div>
        </div>
      ) : null}
      {s.vistun && s.vistun !== "vistar" ? (
        <div
          data-sjalfvirkt-vistun={s.vistun}
          className={`mt-2 rounded-lg px-2 py-1.5 text-[12px] font-semibold ${
            s.vistun === "vistad" ? "bg-emerald-500/15 text-emerald-200" : s.vistun === "villa" ? "bg-red-500/15 text-red-200" : "bg-white/5 text-white/75"
          }`}
        >
          {s.vistunTexti}
          {s.reynaAftur ? (
            <button type="button" onClick={() => s.reynaAftur?.()} className={`${btn} ml-2 bg-white/15 hover:bg-white/20`}>
              Reyna aftur
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="mt-2 flex items-center gap-1.5">
        {s.keyrir ? (
          <button
            type="button"
            onClick={() => s.stodvaKeyrslu()}
            disabled={s.stodva}
            className={`${btn} inline-flex items-center gap-1.5 bg-red-600/80 text-white hover:bg-red-600 disabled:opacity-50`}
            title="Hættir eftir núverandi skref — ekkert er vistað í úttekt"
          >
            <Square className="size-3" />
            {s.stodva ? "Stöðva…" : "Stöðva"}
          </button>
        ) : null}
        <span className="text-[10.5px] leading-tight text-white/45">⌘Z tekur allt verkferlið í einu skrefi</span>
      </div>
      {s.vikmorkTexti ? (
        <details className="mt-1.5 text-[10.5px] text-white/45">
          <summary className="cursor-pointer">Vikmörk</summary>
          <div className="mt-0.5 leading-snug">{s.vikmorkTexti}</div>
          <div className="mt-0.5 leading-snug">Stillt í localStorage „tp_sjalfvirkt_vikmork“ (JSON, t.d. {"{"}&quot;lengjaM&quot;:0.5{"}"}).</div>
        </details>
      ) : null}
    </div>
  );
}
