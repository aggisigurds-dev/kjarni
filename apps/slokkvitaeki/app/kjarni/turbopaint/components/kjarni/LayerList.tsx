"use client";

import { useEffect } from "react";
import { Eye, EyeOff, Lock, Unlock } from "lucide-react";
import { toast } from "sonner";
import { isCrossingMark } from "../../lib/board/crossings";
import { objectLayerId, type BoardLayer } from "../../lib/board/layers";
import { PIPES_OPEN_KEY, useBoardStore } from "../../lib/board/store";
import type { BoardObject } from "../../lib/board/types";
import { cn } from "../../lib/utils";

export function LayerList() {
  const layers = useBoardStore((s) => s.layers);
  const activeLayerId = useBoardStore((s) => s.activeLayerId);
  const objects = useBoardStore((s) => s.objects);
  const setActiveLayer = useBoardStore((s) => s.setActiveLayer);
  const toggleLayerVisible = useBoardStore((s) => s.toggleLayerVisible);
  const toggleLayerLocked = useBoardStore((s) => s.toggleLayerLocked);
  const toggleSoloLayer = useBoardStore((s) => s.toggleSoloLayer);
  const gegnumtakOn = useBoardStore((s) => s.tool === "gegnumtak");
  const gegnumtakMm = useBoardStore((s) => s.gegnumtakMm);
  const setGegnumtakMm = useBoardStore((s) => s.setGegnumtakMm);
  const pipesOpen = useBoardStore((s) => s.pipesOpen);
  const setPipesOpen = useBoardStore((s) => s.setPipesOpen);

  // Geymda valið les eftir hleðslu, ekki í store-inu sjálfu — annars stangaðist
  // fyrsta teikning vafrans á við þjóninn.
  useEffect(() => {
    try {
      // Lagnirnar eru opnar nema notandinn hafi lokað þeim sjálfur — lokaðar færist teiknunin á Almennt og
      // lagaveljarinn hverfur, svo ný lög (t.d. Gegnumtök loft) virtust „ekki virka".
      if (window.localStorage.getItem(PIPES_OPEN_KEY) !== "0") setPipesOpen(true);
    } catch {
      /* privat gluggi — sjálfgefið lokað */
    }
  }, [setPipesOpen]);

  const counts = countByLayer(objects);
  const activeLayer = layers.find((l) => l.id === activeLayerId);
  const onlyActiveVisible = layers.every((l) => (l.id === activeLayerId ? l.visible : !l.visible));
  const drawing = layers.filter((l) => l.kind !== "piping");
  const piping = layers.filter((l) => l.kind === "piping");
  const pipingCount = piping.reduce((n, l) => n + (counts.get(l.id) ?? 0), 0);

  return (
    <details
      className="group"
      open={pipesOpen}
      onToggle={(e) => setPipesOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="mb-2 flex cursor-pointer list-none items-center justify-between select-none text-[11px] font-medium tracking-[0.12em] text-[#FE653F] [&::-webkit-details-marker]:hidden">
        <span>LAGNIR</span>
        <span className="font-normal tracking-normal text-stone-600 group-open:hidden">
          {pipingCount || ""} opna
        </span>
        <span className="hidden font-normal tracking-normal text-stone-600 group-open:inline">fella</span>
      </summary>
      <p className="mb-2 text-[11px] leading-relaxed text-stone-500">
        Lagnir liggja ofan á teikningunni — feldu Teikning til að sjá bara veggi og lagnir, eða hafðu
        skönnunina sýnilega. Nýjar strokur lenda á virka laginu.
      </p>
      <div className="mb-2 flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs">
        <span className="size-3 shrink-0 rounded-full ring-1 ring-white/30" style={{ background: activeLayer?.color }} />
        <span className="min-w-0 flex-1 truncate text-white">
          <span className="text-stone-500">Teiknar á: </span>
          {activeLayer?.name ?? "—"}
        </span>
        <button
          type="button"
          onClick={() => toggleSoloLayer(activeLayerId)}
          className="shrink-0 rounded border border-white/15 px-1.5 py-0.5 text-[11px] text-stone-300 hover:bg-white/10 hover:text-white"
        >
          {onlyActiveVisible ? "Öll lög" : "Bara þetta"}
        </button>
      </div>
      <div className="mb-2 flex items-center gap-2 rounded-md border border-[#16a34a]/40 bg-[#16a34a]/10 px-2 py-1.5 text-xs">
        <button
          type="button"
          aria-pressed={gegnumtakOn}
          onClick={() => {
            const st = useBoardStore.getState();
            if (gegnumtakOn) {
              st.setTool("select");
              return;
            }
            st.setActiveLayer("loftræsting");
            st.setTool("gegnumtak");
          }}
          className={cn(
            "shrink-0 rounded border px-2 py-0.5 text-[11px]",
            gegnumtakOn
              ? "border-[#16a34a] bg-[#16a34a] text-white"
              : "border-white/15 text-stone-200 hover:bg-white/10"
          )}
        >
          {gegnumtakOn ? "Hætta" : "Setja gegnumtak"}
        </button>
        <label className="flex min-w-0 flex-1 items-center justify-end gap-1 text-stone-400">
          <input
            type="number"
            min={10}
            max={3000}
            step={50}
            value={gegnumtakMm}
            onChange={(e) => setGegnumtakMm(Number(e.target.value))}
            className="w-16 rounded border border-white/15 bg-transparent px-1 py-0.5 text-right tabular-nums text-white"
          />
          mm
        </label>
      </div>
      <div className="space-y-0.5">
        {drawing.map((layer) => (
          <LayerRow
            key={layer.id}
            layer={layer}
            count={counts.get(layer.id) ?? 0}
            active={layer.id === activeLayerId}
            onActivate={() => setActiveLayer(layer.id)}
            onToggleVisible={() => toggleLayerVisible(layer.id)}
            onToggleLocked={() => toggleLayerLocked(layer.id)}
          />
        ))}
      </div>
      <div className="mt-3 mb-1 text-[11px] font-medium tracking-[0.12em] text-stone-500">Lagnir</div>
      <div className="space-y-0.5">
        {piping.map((layer) => (
          <LayerRow
            key={layer.id}
            layer={layer}
            count={counts.get(layer.id) ?? 0}
            active={layer.id === activeLayerId}
            onActivate={() => setActiveLayer(layer.id)}
            onToggleVisible={() => toggleLayerVisible(layer.id)}
            onToggleLocked={() => toggleLayerLocked(layer.id)}
          />
        ))}
      </div>
      <button
        type="button"
        className="mt-3 w-full rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-left text-[11px] text-stone-300 hover:bg-white/10 hover:text-white"
        onClick={() => {
          const n = useBoardStore.getState().refreshCrossings();
          toast.message(
            n
              ? `Gegnumtök: ${n} krossar vegg${n === 1 ? "" : "i"} — EI-30/EI-60 fá sterkari merkingu`
              : "Engin lagnir krossa vegg. Teiknaðu lagnir yfir veggi eða EI-veggi."
          );
        }}
      >
        Krossar vegg · Gegnumtök
        <span className="ml-1 text-stone-600">
          {objects.filter(isCrossingMark).length || ""}
        </span>
      </button>
    </details>
  );
}

function LayerRow({
  layer,
  count,
  active,
  onActivate,
  onToggleVisible,
  onToggleLocked,
}: {
  layer: BoardLayer;
  count: number;
  active: boolean;
  onActivate: () => void;
  onToggleVisible: () => void;
  onToggleLocked: () => void;
}) {
  return (
    <div
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs",
        active ? "bg-white/10 text-white" : "text-stone-400 hover:bg-white/5"
      )}
    >
      <button type="button" onClick={onActivate} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <span className="size-2.5 shrink-0 rounded-full ring-1 ring-white/20" style={{ background: layer.color }} />
        <span className="min-w-0 flex-1 truncate">{layer.name}</span>
        <span className="tabular-nums text-stone-600">{count}</span>
      </button>
      <button
        type="button"
        title={layer.visible ? "Fela lag" : "Sýna lag"}
        onClick={onToggleVisible}
        className="text-stone-400 hover:text-white"
      >
        {layer.visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
      </button>
      <button
        type="button"
        title={layer.locked ? "Aflæsa lagi" : "Læsa lagi"}
        onClick={onToggleLocked}
        className="text-stone-400 hover:text-white"
      >
        {layer.locked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
      </button>
    </div>
  );
}

function countByLayer(objects: BoardObject[]) {
  const counts = new Map<string, number>();
  for (const obj of objects) {
    const id = objectLayerId(obj);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}
