"use client";

// „Greining" — EINN samanbrotinn flipi með öllum greiningartólunum (Agnar 04.11.2026: „hafa einn stóran collapsed flipa
// með öllum greiningartólunum og geta valið staka eða combo" · „endurskipuleggja layoutið á því öllu").
//
// Efst til hægri á borðinu, undir „Vista" og hamvalinu. Tveir hlutar:
//   Combo   — veldu hópa (Veggir og hurðir · Eldveggir EI · Tæki og merki) og „Keyra valin": sjálfvirka verkferlið
//             (lib/board/sjalfvirkt.ts) keyrir aðeins þá, í réttri röð, á opnu hæðinni. Framvindan og „Hvernig?" koma í
//             framvinduspjaldinu.
//   Stök tól — hvert tól opnast sér með skýringu á því hvað það gerir og hvaða vél vinnur.

import { Box, ChevronDown, DoorOpen, Flame, ScanSearch, ScanText, Wand2, BrickWall, Search } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { HamAdgerd } from "../../lib/board/hamir";
import type { SkrefId } from "../../lib/board/sjalfvirkt-stada";
import { finnaHurdirTillogur, finnaVeggiTillogur } from "./VeggjaRitill";

type Hopur = { id: Extract<SkrefId, "veggir" | "ei" | "taeki">; heiti: string; skyring: string };
const HOPAR: Hopur[] = [
  {
    id: "veggir",
    heiti: "Veggir og hurðir",
    skyring: "Skurður að húsinu, veggir (vigur lesinn beint, skönnun greind af veggjavél), hreinsun og hurðir.",
  },
  { id: "ei", heiti: "Eldveggir (EI)", skyring: "EI-30 og EI-60 merkin lesin og fest á veggina, brunahólf reiknuð." },
  { id: "taeki", heiti: "Tæki og merki", skyring: "SLT, BRSL, búnaður í römmum og skilti sett á táknin og tengd tækjum staðarins." },
];

type Tol = { id: string; heiti: string; skyring: string; takn: ReactNode; keyra: () => void };

export function GreiningTolSpjald({
  onAdgerd,
  keyraCombo,
  uttekt,
}: {
  onAdgerd: (a: HamAdgerd) => void;
  keyraCombo: (valin: SkrefId[]) => void;
  /** Hæð úr úttekt er opin — combo þarf hana (vistar til baka). */
  uttekt: boolean;
}) {
  const [opid, setOpid] = useState(false);
  // Valmyndin er teiknuð á body með föstum stað (Agnar 05.11.2026: „greiningarglugginn opnast ekki"): efsta stikan (header með
  // overflow: auto) klippti hana af svo hún sást ekki á tölvu. Staðurinn kemur af hnappinum; lokast við smell utan og Esc.
  const hnappur = useRef<HTMLButtonElement>(null);
  const spjald = useRef<HTMLDivElement>(null);
  const [stadur, setStadur] = useState<{ top: number; right: number } | null>(null);
  useEffect(() => {
    if (!opid) return;
    const stilla = () => {
      const r = hnappur.current?.getBoundingClientRect();
      if (r) setStadur({ top: Math.round(r.bottom + 6), right: Math.max(8, Math.round(window.innerWidth - r.right)) });
    };
    stilla();
    const utan = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (t && (hnappur.current?.contains(t) || spjald.current?.contains(t))) return;
      setOpid(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpid(false);
    };
    window.addEventListener("resize", stilla);
    window.addEventListener("pointerdown", utan);
    window.addEventListener("keydown", esc, true);
    return () => {
      window.removeEventListener("resize", stilla);
      window.removeEventListener("pointerdown", utan);
      window.removeEventListener("keydown", esc, true);
    };
  }, [opid]);
  const [valin, setValin] = useState<Set<string>>(() => new Set(HOPAR.map((h) => h.id)));
  const fjoldi = valin.size;
  const skiptaVali = (id: string) =>
    setValin((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const keyra = (f: () => void) => {
    setOpid(false);
    f();
  };
  const tol: Tol[] = [
    { id: "veggir", heiti: "Greina veggi", skyring: "Opnar greiningargluggann: vigur-PDF lesið beint, skönnun greind af veggjavélinni eða í vafranum. Þú sérð niðurstöðuna áður en hún fer á borðið.", takn: <BrickWall className="size-4" />, keyra: () => onAdgerd("veggir") },
    { id: "finna-veggi", heiti: "Finna veggi", skyring: "Veggjavélin stingur upp á veggjum sem punktalínum. Smellur samþykkir, Shift+smellur hafnar.", takn: <ScanSearch className="size-4 text-teal-300" />, keyra: finnaVeggiTillogur },
    { id: "finna-hurdir", heiti: "Finna hurðir", skyring: "Hurðabogar og op í veggjum verða rauðar tillögur. Samþykkt hurð klippir vegginn undir sér.", takn: <DoorOpen className="size-4 text-[#ef5350]" />, keyra: () => void finnaHurdirTillogur() },
    { id: "ei", heiti: "Lesa EI", skyring: "Les EI-merkingar teikningarinnar með OCR og litar eldveggina rauða.", takn: <Flame className="size-4 text-[#FE653F]" />, keyra: () => onAdgerd("ei") },
    { id: "slt-brsl", heiti: "Búnaður af teikningu", skyring: "Les SLT, BRSL, reykskynjara og skilti af teikningunni og setur tækin á táknin.", takn: <ScanText className="size-4" />, keyra: () => onAdgerd("slt-brsl") },
    { id: "gegnumtok", heiti: "Gegnumtök", skyring: "Merkir þar sem lagnir krossa veggi, sterkast á EI-veggjum.", takn: <Search className="size-4" />, keyra: () => onAdgerd("gegnumtok") },
    { id: "thrividd", heiti: "3D", skyring: "Húsið í þrívídd úr veggjum og tækjum allra hæða.", takn: <Box className="size-4" />, keyra: () => onAdgerd("thrividd") },
  ];
  return (
    <div className="pointer-events-auto relative" data-greining-flipi>
      <button
        ref={hnappur}
        type="button"
        aria-expanded={opid}
        aria-controls="greining-spjald"
        data-greining-takki
        title="Öll greiningartólin á einum stað: combo eða stök tól"
        onClick={() => setOpid(!opid)}
        className="flex items-center gap-1.5 rounded-full border border-white/10 bg-[#1a1d2e]/95 py-1.5 pr-2.5 pl-3 text-[12px] font-semibold whitespace-nowrap text-stone-100 shadow-xl shadow-black/40 active:translate-y-px"
      >
        <Wand2 className="size-3.5 text-[#FE653F]" />
        Greining
        <ChevronDown className={`size-3.5 text-white/60 transition-transform ${opid ? "rotate-180" : ""}`} />
      </button>
      {opid && stadur && typeof document !== "undefined" ? createPortal(
        <div
          ref={spjald}
          id="greining-spjald"
          role="region"
          aria-label="Greining"
          style={{ position: "fixed", top: stadur.top, right: stadur.right, maxHeight: `calc(100dvh - ${stadur.top}px - 12px)` }}
          className="z-[80] w-[min(88vw,21rem)] overflow-y-auto rounded-xl border border-white/10 bg-[#1a1d2e] p-2.5 text-stone-100 shadow-2xl shadow-black/50"
        >
          <div className="text-[10.5px] font-semibold tracking-wide text-white/45 uppercase">Combo — keyrt í röð</div>
          <div className="mt-1.5 flex flex-col gap-1">
            {HOPAR.map((h) => (
              <label key={h.id} className="flex cursor-pointer items-start gap-2 rounded-lg bg-white/5 px-2 py-1.5 hover:bg-white/8">
                <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-[#FE653F]" checked={valin.has(h.id)} onChange={() => skiptaVali(h.id)} data-greining-hopur={h.id} />
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-semibold">{h.heiti}</span>
                  <span className="block text-[11px] leading-snug text-white/55">{h.skyring}</span>
                </span>
              </label>
            ))}
          </div>
          <button
            type="button"
            data-greining-keyra
            disabled={!uttekt || fjoldi === 0}
            onClick={() => keyra(() => keyraCombo(HOPAR.map((h) => h.id).filter((id) => valin.has(id))))}
            className="mt-2 w-full rounded-lg bg-[#FE653F] px-3 py-2 text-[12.5px] font-semibold text-white active:translate-y-px disabled:opacity-40"
          >
            {fjoldi === HOPAR.length ? "Keyra allt" : fjoldi ? `Keyra valin (${fjoldi})` : "Veldu hóp"}
          </button>
          <div className="mt-1 text-[10.5px] leading-snug text-white/45">
            {uttekt
              ? "Keyrir á opnu hæðinni og vistast sjálfkrafa nema þú hafir leiðrétt hana — þá er spurt. Allt er eitt Afturkalla-skref."
              : "Combo þarf hæð úr úttekt: opnaðu hana með „Opna í TurboPaint“ í Teikningu hjá félaginu."}
          </div>

          <div className="mt-3 text-[10.5px] font-semibold tracking-wide text-white/45 uppercase">Stök tól</div>
          <div className="mt-1.5 flex flex-col gap-0.5">
            {tol.map((t) => (
              <button
                key={t.id}
                type="button"
                data-greining-tol={t.id}
                onClick={() => keyra(t.keyra)}
                className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/8 active:translate-y-px"
              >
                <span className="mt-0.5 shrink-0">{t.takn}</span>
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-semibold">{t.heiti}</span>
                  <span className="block text-[11px] leading-snug text-white/55">{t.skyring}</span>
                </span>
              </button>
            ))}
          </div>

          <details className="mt-2 text-[11px] text-white/55">
            <summary className="cursor-pointer text-[11.5px] font-semibold text-white/70">Hvaða vél vinnur hvað?</summary>
            <ul className="mt-1 list-disc space-y-1 pl-4 leading-snug">
              <li>Vigur-PDF: línurnar eru lesnar beint, nákvæmast og hraðast.</li>
              <li>Skönnun: veggjavélin (U-Net á skrifstofutölvunni) og myndgreining í vafranum til vara.</li>
              <li>EI og tæki: textinn er lesinn með OCR, aðeins einu sinni í combo.</li>
              <li>Veggir sem þú hefur leiðrétt eru aldrei yfirskrifaðir.</li>
            </ul>
          </details>
        </div>,
        document.body
      ) : null}
    </div>
  );
}
