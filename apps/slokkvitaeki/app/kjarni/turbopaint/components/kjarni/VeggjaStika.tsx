"use client";

// Veggjastikan: birtist þegar einn eða fleiri veggir eru valdir í hömunum Teikning og Brunaþéttingar (þar sem
// veggjaaðgerðirnar búa — lib/board/hamir.ts). Agnar 06.10.2026: TurboPaint er leiðréttingarborð grunnmynda —
// tegund (veggur / gler / hurð), Tengja lausa enda og Eyða. Hver aðgerð er ein ⌘Z-færsla.
// Veggjaritillinn bætti við: þykkt valinna veggja, Sameina (samlínu → einn), Lengja að (tveir valdir) og Hurð í bil.

import { AppWindow, BrickWall, DoorOpen, Fence, Flame, Link2, Merge, MoveHorizontal, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { isDrawnLocked, isDrawnVisible } from "../../lib/board/layers";
import { useHamur, type HamAdgerd, type HamurId } from "../../lib/board/hamir";
import { ADGERDIR } from "./HamStika";
import { useBoardStore } from "../../lib/board/store";
import type { VeggTegund } from "../../lib/board/teikning-veggir";
import type { BoardObject, LineObject } from "../../lib/board/types";
import {
  bordDilarAMetra,
  erVeggur,
  stillaVeggTegund,
  tengjaVeggi,
  tengjaVikmork,
  veggTegundAf,
  VEGG_LITIR,
} from "../../lib/board/veggja-leidretting";
import { metraTexti, THYKKTIR_CM, veggLengd } from "../../lib/board/veggja-ritill";
import { cmIDila, ritillDilarAMetra, setjaThykkt } from "../../lib/board/veggja-ritill-adgerdir";
import { useVeggjaRitill } from "../../lib/board/veggja-ritill-stada";
import { hurdIBilValda, lengjaValda, sameinaValda } from "./VeggjaRitill";

export const VEGGJA_HAMIR: HamurId[] = ["teikning", "brunathettingar"];

const TEGUNDIR: { id: VeggTegund; texti: string; titill: string; takn: ReactNode }[] = [
  { id: "veggur", texti: "Veggur", titill: "Venjulegur veggur (1)", takn: <BrickWall className="size-3.5" /> },
  { id: "gler", texti: "Gler", titill: "Glerveggur / gluggi — blár (2)", takn: <AppWindow className="size-3.5" /> },
  { id: "hurd", texti: "Hurð", titill: "Hurð — brún (3)", takn: <DoorOpen className="size-3.5" /> },
  // „Gera að EI-60 / EI-30" (Agnar 07.10.2026): eldveggur er veggur með tegund — rauður á teikningunni og í Teikning/3D.
  { id: "ei60", texti: "EI-60", titill: "Gera að eldvegg EI-60 — rauður (4)", takn: <Flame className="size-3.5" /> },
  { id: "ei30", texti: "EI-30", titill: "Gera að eldvegg EI-30 — ljósrauður (5)", takn: <Flame className="size-3.5" /> },
  { id: "svalir", texti: "Svalir", titill: "Svalir / svalahandrið — lágur veggur 1,1 m í 3D (6)", takn: <Fence className="size-3.5" /> },
  { id: "stigi", texti: "Stigi", titill: "Stigi — þrepastigi frá neðri enda upp á efri í 3D (7)", takn: <Fence className="size-3.5" /> },
];

function valdirVeggir(objects: BoardObject[], selectedIds: string[]): LineObject[] {
  const sel = new Set(selectedIds);
  return objects.filter((o): o is LineObject => sel.has(o.id) && erVeggur(o));
}

export function VeggjaStika() {
  const hamur = useHamur((s) => s.hamur);
  const selectedIds = useBoardStore((s) => s.selectedIds);
  const objects = useBoardStore((s) => s.objects);
  const layers = useBoardStore((s) => s.layers);
  const pixelsPerMeter = useBoardStore((s) => s.pixelsPerMeter);
  const [thykktOpin, setThykktOpin] = useState(false);
  // Aukaaðgerðir ritilsins (þykkt, sameina, lengja, hurð í bil) aðeins meðan hann er opinn — utan hans er stikan
  // eins og í 1. áfanga og skyggir ekki meira á teikninguna.
  const ritill = useVeggjaRitill((s) => s.virkur);
  // Þéttur veggjaritill (Agnar 09.10.2026: „Margt fyrir … Sýna bara velja, teikna, eyða, undo"): stikan víkur líka —
  // tegund, þykkt, tengja o.fl. eru í „Meira".
  const thettur = useVeggjaRitill((s) => s.virkur && s.thett);
  if (thettur || !VEGGJA_HAMIR.includes(hamur) || !selectedIds.length) return null;
  const veggir = valdirVeggir(objects, selectedIds).filter((o) => !isDrawnLocked(o, layers));
  if (!veggir.length) return null;
  const tegundir = new Set(veggir.map(veggTegundAf));
  const sameiginleg = tegundir.size === 1 ? [...tegundir][0] : null;
  const dpm = ritillDilarAMetra(objects, pixelsPerMeter);
  const thykktCm = (o: LineObject) => (dpm ? Math.round((o.strokeWidth / dpm) * 100) : null);

  const ids = () => {
    const s = useBoardStore.getState();
    return valdirVeggir(s.objects, s.selectedIds)
      .filter((o) => !isDrawnLocked(o, s.layers))
      .map((o) => o.id);
  };
  const setjaTegund = (tegund: VeggTegund) => {
    const v = ids();
    useBoardStore.getState().updateObjects(v, (o) => (erVeggur(o) ? stillaVeggTegund(o, tegund) : o));
  };
  const tengja = () => {
    const s = useBoardStore.getState();
    const valdir = valdirVeggir(s.objects, s.selectedIds).filter((o) => !isDrawnLocked(o, s.layers));
    const allir = s.objects.filter((o): o is LineObject => erVeggur(o) && isDrawnVisible(o, s.layers));
    const st = tengjaVikmork(valdir.length, bordDilarAMetra(s.objects, s.pixelsPerMeter), valdir.map((o) => o.strokeWidth));
    const r = tengjaVeggi(valdir, allir, st);
    if (!r.punktar.size) {
      toast.message("Ekkert að tengja — endarnir eru þegar tengdir eða of langt á milli");
      return;
    }
    s.updateObjects([...r.punktar.keys()], (o) =>
      (o.type === "polyline" || o.type === "line") && r.punktar.has(o.id) ? { ...o, points: r.punktar.get(o.id)! } : o
    );
    toast.success(`Tengt: ${r.fjoldi} samskeyti · ⌘Z afturkallar`);
  };
  const eyda = () => {
    const v = ids();
    useBoardStore.getState().deleteIds(v);
    toast.message(`${v.length} ${v.length === 1 ? "veggur eyddur" : "veggjum eytt"} · ⌘Z afturkallar`);
  };

  const btn =
    "flex items-center gap-1 rounded-lg px-2 py-1 text-[11.5px] font-medium text-stone-100 hover:bg-white/10 disabled:opacity-50";
  const einn = veggir.length === 1 ? veggir[0] : null;
  const thykktir = new Set(veggir.map((o) => thykktCm(o)));
  const sameiginThykkt = thykktir.size === 1 ? [...thykktir][0] : null;
  return (
    <div
      role="toolbar"
      aria-label="Leiðrétta veggi"
      className="pointer-events-auto flex max-w-[calc(100vw-1rem)] flex-wrap items-center justify-center gap-0.5 rounded-xl border border-white/10 bg-[#1a1d2e]/95 px-1.5 py-1 shadow-xl"
    >
      <span className="px-1.5 text-[11px] whitespace-nowrap text-white/45">
        {veggir.length} {veggir.length === 1 ? "veggur" : "veggir"}
        {einn && ritill ? ` · ${metraTexti(veggLengd(einn), dpm)}` : ""}
      </span>
      {TEGUNDIR.map((t) => (
        <button
          key={t.id}
          type="button"
          title={t.titill}
          aria-pressed={sameiginleg === t.id}
          data-stika-tegund={t.id}
          onClick={() => setjaTegund(t.id)}
          className={`${btn} ${sameiginleg === t.id ? "bg-white/12 ring-1 ring-white/25" : ""}`}
        >
          <span style={{ color: t.id === "veggur" ? "#d6d3d1" : VEGG_LITIR[t.id] }}>{t.takn}</span>
          {t.texti}
        </button>
      ))}
      {ritill ? (
        <>
          <span className="mx-0.5 h-4 w-px bg-white/15" />
          <button
            type="button"
            title="Þykkt valinna veggja ([ / ] í veggjaritlinum)"
            aria-expanded={thykktOpin}
            onClick={() => setThykktOpin(!thykktOpin)}
            className={btn}
          >
            Þykkt{sameiginThykkt != null ? ` ${sameiginThykkt} cm` : ""}
          </button>
        </>
      ) : null}
      {ritill && thykktOpin
        ? THYKKTIR_CM.map((cm) => (
            <button
              key={cm}
              type="button"
              title={`Setja ${cm} cm á valda veggi`}
              aria-label={`Þykkt ${cm} cm`}
              onClick={() => {
                setjaThykkt(ids(), cmIDila(cm, dpm));
                setThykktOpin(false);
              }}
              className={`${btn} ${sameiginThykkt === cm ? "bg-white/12 ring-1 ring-white/25" : "bg-white/5"}`}
            >
              {cm}
            </button>
          ))
        : null}
      <span className="mx-0.5 h-4 w-px bg-white/15" />
      <button
        type="button"
        title="Tengja: lausir endar valinna veggja mætast (horn, T eða samlína) — ⌘Z afturkallar"
        onClick={tengja}
        className={btn}
      >
        <Link2 className="size-3.5" />
        Tengja
      </button>
      {ritill && veggir.length >= 2 ? (
        <button type="button" title="Sameina valda samlínu veggi í einn (J)" onClick={sameinaValda} className={btn}>
          <Merge className="size-3.5" />
          Sameina
        </button>
      ) : null}
      {ritill && veggir.length === 2 ? (
        <>
          <button
            type="button"
            title="Lengja / stytta fyrst valda vegginn að þeim seinni (L)"
            onClick={lengjaValda}
            className={btn}
          >
            <MoveHorizontal className="size-3.5" />
            Lengja að
          </button>
          <button type="button" title="Hurð í opið milli tveggja samlínu veggja (D)" onClick={hurdIBilValda} className={btn}>
            <DoorOpen className="size-3.5 text-[#b45309]" />
            Hurð í bil
          </button>
        </>
      ) : null}
      <button type="button" title="Eyða völdum veggjum (Delete) — ⌘Z afturkallar" onClick={eyda} className={btn}>
        <Trash2 className="size-3.5 text-[#FE653F]" />
        Eyða
      </button>
    </div>
  );
}

// ── Sími (Agnar 04.11.2026, Fiskislóð 41: „pirrandi að ég get ekkert breytt þessu í símanum … frekar bara haft að maður
// geti skipt milli ham uppi og tækjastikan sé þá veggjagerðar- og breytingastika") ──────────────────────────────────
// Í síma er hægra spjaldið lokað og veggjastikan að ofan víkur fyrir þétta ritlinum, svo tegund veggjar varð aldrei breytt.
// Nú: hamrofi efst (Tæki ↔ Veggir) og í veggjaham kemur VeggjaSimaStika í stað táknaborðsins neðst — tegundirnar sjö.
// Valdir veggir fá tegundina (sama og stikan að ofan); sé enginn valinn ræður hún tegund NÝRRA veggja og kveikir á Teikna.

/** Valdir, ólæstir veggir borðsins (auðkenni) — sama val og stikan að ofan notar. */
function valdirIds(): string[] {
  const s = useBoardStore.getState();
  return valdirVeggir(s.objects, s.selectedIds)
    .filter((o) => !isDrawnLocked(o, s.layers))
    .map((o) => o.id);
}

/** Tengja lausa enda valinna veggja — sama aðgerð og „Tengja" í stikunni að ofan. */
export function tengjaValdaVeggi() {
  const s = useBoardStore.getState();
  const valdir = valdirVeggir(s.objects, s.selectedIds).filter((o) => !isDrawnLocked(o, s.layers));
  if (!valdir.length) return toast.message("Veldu veggi fyrst — Velja og smelltu á vegginn", { duration: 1600 });
  const allir = s.objects.filter((o): o is LineObject => erVeggur(o) && isDrawnVisible(o, s.layers));
  const st = tengjaVikmork(valdir.length, bordDilarAMetra(s.objects, s.pixelsPerMeter), valdir.map((o) => o.strokeWidth));
  const r = tengjaVeggi(valdir, allir, st);
  if (!r.punktar.size) return toast.message("Ekkert að tengja — endarnir eru þegar tengdir eða of langt á milli");
  s.updateObjects([...r.punktar.keys()], (o) =>
    (o.type === "polyline" || o.type === "line") && r.punktar.has(o.id) ? { ...o, points: r.punktar.get(o.id)! } : o
  );
  toast.success(`Tengt: ${r.fjoldi} samskeyti · Afturkalla skilar`);
}

/** Veggjategundirnar + þykkt neðst í síma — í stað lita- og stærðarstikunnar (StyleStrip) í veggjaham
 * (Agnar: „neðsta litalínan séu tegundir af veggjum, og stærðarstikan þar við hliðina sé veggjaþykkt"). */
export function VeggjaTegundSimaStika() {
  const hamur = useHamur((s) => s.hamur);
  const selectedIds = useBoardStore((s) => s.selectedIds);
  const objects = useBoardStore((s) => s.objects);
  const layers = useBoardStore((s) => s.layers);
  const pixelsPerMeter = useBoardStore((s) => s.pixelsPerMeter);
  const nyTegund = useVeggjaRitill((s) => s.tegund);
  const nyThykkt = useVeggjaRitill((s) => s.thykktCm);
  if (!VEGGJA_HAMIR.includes(hamur)) return null;
  const veggir = valdirVeggir(objects, selectedIds).filter((o) => !isDrawnLocked(o, layers));
  const tegundir = new Set(veggir.map(veggTegundAf));
  const merkt: VeggTegund | null = veggir.length ? (tegundir.size === 1 ? [...tegundir][0] : null) : nyTegund;
  const dpm = ritillDilarAMetra(objects, pixelsPerMeter);
  const thykktir = new Set(veggir.map((o) => (dpm ? Math.round((o.strokeWidth / dpm) * 100) : null)));
  const merktThykkt: number | null = veggir.length ? (thykktir.size === 1 ? [...thykktir][0] : null) : nyThykkt;
  const velja = (tegund: VeggTegund) => {
    if (veggir.length) {
      useBoardStore.getState().updateObjects(
        veggir.map((o) => o.id),
        (o) => (erVeggur(o) ? stillaVeggTegund(o, tegund) : o)
      );
      const heiti = TEGUNDIR.find((t) => t.id === tegund)?.texti ?? tegund;
      toast.message(`${veggir.length} ${veggir.length === 1 ? "veggur" : "veggir"} → ${heiti} · Afturkalla skilar`, { duration: 1400 });
      return;
    }
    const r = useVeggjaRitill.getState();
    if (!r.virkur) r.kveikja("teikna");
    else r.setTol("teikna");
    r.setTegund(tegund);
  };
  const veljaThykkt = (cm: number) => {
    if (veggir.length) {
      setjaThykkt(
        veggir.map((o) => o.id),
        cmIDila(cm, dpm)
      );
      return;
    }
    useVeggjaRitill.getState().setThykkt(cm);
  };
  const lit = (t: VeggTegund) => (t === "veggur" ? "#d6d3d1" : VEGG_LITIR[t]);
  return (
    <div
      role="toolbar"
      aria-label="Veggjategund og þykkt"
      data-veggja-simastika
      className="pointer-events-auto flex max-w-[calc(100vw-1rem)] items-center gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-[#1a1d2e]/95 px-2 py-1.5 shadow-2xl shadow-black/40"
    >
      <span className="text-[10px] whitespace-nowrap text-white/45">{veggir.length ? `${veggir.length} valdir` : "nýir"}</span>
      {TEGUNDIR.map((t) => (
        <button
          key={t.id}
          type="button"
          title={veggir.length ? `Gera valda veggi að: ${t.texti}` : `Nýir veggir verða: ${t.texti}`}
          aria-label={t.texti}
          aria-pressed={merkt === t.id}
          data-sima-tegund={t.id}
          onClick={() => velja(t.id)}
          className={`flex size-8 shrink-0 items-center justify-center rounded-full transition active:translate-y-px ${
            merkt === t.id ? "ring-2 ring-white ring-offset-2 ring-offset-[#1a1d2e]" : "ring-1 ring-white/25"
          }`}
          style={{ background: lit(t.id) }}
        >
          <span className="sr-only">{t.texti}</span>
        </button>
      ))}
      <span className="mx-1 h-5 w-px shrink-0 bg-white/15" />
      {THYKKTIR_CM.map((cm) => (
        <button
          key={cm}
          type="button"
          title={veggir.length ? `Setja ${cm} cm á valda veggi` : `Nýir veggir ${cm} cm`}
          aria-pressed={merktThykkt === cm}
          onClick={() => veljaThykkt(cm)}
          className={`shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold whitespace-nowrap transition active:translate-y-px ${
            merktThykkt === cm ? "bg-white/20 text-white" : "text-stone-300 hover:bg-white/10"
          }`}
        >
          {cm} cm
        </button>
      ))}
    </div>
  );
}

/** Greiningar- og veggjatólin neðst í síma — í stað táknaborðsins í veggjaham (Agnar: „gera greiningartólin fyrir
 * veggina sýnilegri"). Aðgerðirnar fara sömu leið og hamstikan (hamAdgerd í WhiteboardApp). */
export function VeggjaTolSimaStika({ onAdgerd }: { onAdgerd: (a: HamAdgerd) => void }) {
  const hamur = useHamur((s) => s.hamur);
  const valdir = useBoardStore((s) => {
    if (!s.selectedIds.length) return 0;
    const sel = new Set(s.selectedIds);
    let n = 0;
    for (const o of s.objects) if (sel.has(o.id) && erVeggur(o)) n++;
    return n;
  });
  if (!VEGGJA_HAMIR.includes(hamur)) return null;
  const takki =
    "flex min-w-12 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1.5 py-1 text-[10px] leading-none font-medium whitespace-nowrap text-stone-100 transition hover:bg-white/10 active:translate-y-px";
  const tol: { id: string; texti: string; titill: string; takn: ReactNode; a: () => void }[] = [
    { id: "veggir", texti: "Greina veggi", titill: ADGERDIR.veggir.titill, takn: ADGERDIR.veggir.takn, a: () => onAdgerd("veggir") },
    { id: "ei", texti: "Lesa EI", titill: ADGERDIR.ei.titill, takn: ADGERDIR.ei.takn, a: () => onAdgerd("ei") },
    { id: "tengja", texti: "Tengja", titill: "Tengja lausa enda valinna veggja — Afturkalla skilar", takn: <Link2 className="size-3.5" />, a: tengjaValdaVeggi },
    { id: "sameina", texti: "Sameina", titill: "Sameina valda samlínu veggi í einn", takn: <Merge className="size-3.5" />, a: sameinaValda },
    { id: "hurd", texti: "Hurð í bil", titill: "Hurð í opið milli tveggja valinna samlínu veggja", takn: <DoorOpen className="size-3.5 text-[#b45309]" />, a: hurdIBilValda },
    { id: "thrividd", texti: "3D", titill: ADGERDIR.thrividd.titill, takn: ADGERDIR.thrividd.takn, a: () => onAdgerd("thrividd") },
  ];
  return (
    <div
      role="toolbar"
      aria-label="Veggjatól"
      data-veggja-tol-simi
      className="pointer-events-auto flex max-w-[calc(100vw-1rem)] items-stretch gap-0.5 overflow-x-auto rounded-2xl border border-white/10 bg-[#1a1d2e]/95 p-1 shadow-2xl shadow-black/40"
    >
      {tol.map((t) => {
        const tharfTvo = t.id === "sameina" || t.id === "hurd";
        const tharfEinn = t.id === "tengja";
        const ovirkt = (tharfTvo && valdir < 2) || (tharfEinn && valdir < 1);
        return (
          <button key={t.id} type="button" title={t.titill} disabled={ovirkt} onClick={t.a} className={`${takki} disabled:opacity-40`}>
            {t.takn}
            {t.texti}
          </button>
        );
      })}
    </div>
  );
}

/** Hamrofi í síma, efst á borðinu: Tæki (táknaborðið) ↔ Veggir (þétti ritillinn + tegundastikan). */
export function HamRofiSimi() {
  const hamur = useHamur((s) => s.hamur);
  const setHamur = useHamur((s) => s.setHamur);
  const veggja = VEGGJA_HAMIR.includes(hamur);
  const skipta = (iVeggi: boolean) => {
    const r = useVeggjaRitill.getState();
    if (iVeggi) {
      setHamur("brunathettingar");
      if (!r.virkur) r.kveikja("velja");
      r.setThett(true);
    } else {
      setHamur("slokkvitaeki");
      if (r.virkur) r.slokkva();
    }
  };
  const t = "rounded-full px-3 py-1 text-[12px] font-semibold transition";
  return (
    <div
      role="tablist"
      aria-label="Hamur"
      data-hamrofi-simi
      className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-white/10 bg-[#1a1d2e]/95 p-0.5 shadow-xl shadow-black/40"
    >
      <button type="button" role="tab" aria-selected={!veggja} onClick={() => skipta(false)} className={`${t} ${!veggja ? "bg-[#FE653F] text-white" : "text-stone-300"}`}>
        Tæki
      </button>
      <button type="button" role="tab" aria-selected={veggja} onClick={() => skipta(true)} className={`${t} ${veggja ? "bg-[#FE653F] text-white" : "text-stone-300"}`}>
        Veggir
      </button>
    </div>
  );
}
