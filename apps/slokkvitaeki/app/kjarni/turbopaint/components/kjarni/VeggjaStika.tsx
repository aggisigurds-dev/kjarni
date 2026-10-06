"use client";

// Veggjastikan: birtist þegar einn eða fleiri veggir eru valdir í hömunum Teikning og Brunaþéttingar (þar sem
// veggjaaðgerðirnar búa — lib/board/hamir.ts). Agnar 06.10.2026: TurboPaint er leiðréttingarborð grunnmynda —
// tegund (veggur / gler / hurð), Tengja lausa enda og Eyða. Hver aðgerð er ein ⌘Z-færsla.

import { AppWindow, BrickWall, DoorOpen, Link2, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { isDrawnLocked, isDrawnVisible } from "../../lib/board/layers";
import { useHamur, type HamurId } from "../../lib/board/hamir";
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

export const VEGGJA_HAMIR: HamurId[] = ["teikning", "brunathettingar"];

const TEGUNDIR: { id: VeggTegund; texti: string; titill: string; takn: ReactNode }[] = [
  { id: "veggur", texti: "Veggur", titill: "Venjulegur veggur", takn: <BrickWall className="size-3.5" /> },
  { id: "gler", texti: "Gler", titill: "Glerveggur / gluggi — blár", takn: <AppWindow className="size-3.5" /> },
  { id: "hurd", texti: "Hurð", titill: "Hurð — brún", takn: <DoorOpen className="size-3.5" /> },
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
  if (!VEGGJA_HAMIR.includes(hamur) || !selectedIds.length) return null;
  const veggir = valdirVeggir(objects, selectedIds).filter((o) => !isDrawnLocked(o, layers));
  if (!veggir.length) return null;
  const tegundir = new Set(veggir.map(veggTegundAf));
  const sameiginleg = tegundir.size === 1 ? [...tegundir][0] : null;

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
  return (
    <div
      role="toolbar"
      aria-label="Leiðrétta veggi"
      className="pointer-events-auto flex items-center gap-0.5 rounded-xl border border-white/10 bg-[#1a1d2e]/95 px-1.5 py-1 shadow-xl"
    >
      <span className="px-1.5 text-[11px] whitespace-nowrap text-white/45">
        {veggir.length} {veggir.length === 1 ? "veggur" : "veggir"}
      </span>
      {TEGUNDIR.map((t) => (
        <button
          key={t.id}
          type="button"
          title={t.titill}
          aria-pressed={sameiginleg === t.id}
          onClick={() => setjaTegund(t.id)}
          className={`${btn} ${sameiginleg === t.id ? "bg-white/12 ring-1 ring-white/25" : ""}`}
        >
          <span style={{ color: t.id === "veggur" ? "#d6d3d1" : VEGG_LITIR[t.id] }}>{t.takn}</span>
          {t.texti}
        </button>
      ))}
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
      <button type="button" title="Eyða völdum veggjum (Delete) — ⌘Z afturkallar" onClick={eyda} className={btn}>
        <Trash2 className="size-3.5 text-[#FE653F]" />
        Eyða
      </button>
    </div>
  );
}
