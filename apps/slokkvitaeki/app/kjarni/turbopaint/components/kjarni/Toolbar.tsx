"use client";

import { useEffect, useState, type ReactNode } from "react";

import {
  ArrowUpRight,
  Circle,
  Eraser,
  Hand,
  Minus,
  MousePointer2,
  Pencil,
  PencilRuler,
  Pentagon,
  Ruler,
  Square,
  StickyNote,
  Type,
} from "lucide-react";
import { getSymbol, symbolColors } from "../../lib/board/symbols";
import { SYMBOL_OPACITY_KEY, useBoardStore } from "../../lib/board/store";
import {
  getStampSize,
  setStampSize,
  subscribeSymbolSettings,
  STAMP_SIZE_MAX,
  STAMP_SIZE_MIN,
} from "../../lib/board/symbol-settings";
import type { Tool } from "../../lib/board/types";
import { cn } from "../../lib/utils";

const TOOLS: { id: Tool; label: string; shortcut: string; icon: ReactNode }[] = [
  { id: "select", label: "Velja", shortcut: "V", icon: <MousePointer2 className="size-4" /> },
  { id: "hand", label: "Hönd / færa borð", shortcut: "H", icon: <Hand className="size-4" /> },
  { id: "rect", label: "Ferningur", shortcut: "R", icon: <Square className="size-4" /> },
  { id: "ellipse", label: "Hringur", shortcut: "O", icon: <Circle className="size-4" /> },
  { id: "line", label: "Lína", shortcut: "L", icon: <Minus className="size-4" /> },
  { id: "arrow", label: "Ör", shortcut: "A", icon: <ArrowUpRight className="size-4" /> },
  { id: "polyline", label: "Veggir / brotalína", shortcut: "W", icon: <Pentagon className="size-4" /> },
  { id: "pen", label: "Penni", shortcut: "P", icon: <Pencil className="size-4" /> },
  { id: "text", label: "Texti", shortcut: "T", icon: <Type className="size-4" /> },
  { id: "sticky", label: "Minnispunktur", shortcut: "N", icon: <StickyNote className="size-4" /> },
  { id: "measure", label: "Mæla", shortcut: "M", icon: <Ruler className="size-4" /> },
  {
    id: "calibrate",
    label: "Kvarði — dragðu eftir þekktri lengd (t.d. milli veggja) og stimplaðu inn metrana",
    shortcut: "K",
    icon: <PencilRuler className="size-4" />,
  },
  {
    id: "eraser",
    label: "Strokleður — smelltu eða strjúktu yfir það sem á að hverfa",
    shortcut: "E",
    icon: <Eraser className="size-4" />,
  },
];

export function Toolbar() {
  const tool = useBoardStore((s) => s.tool);
  const setTool = useBoardStore((s) => s.setTool);
  const style = useBoardStore((s) => s.style);
  const symbol = getSymbol(style.symbolId);

  return (
    <div className="tp-toolbar pointer-events-auto flex flex-col gap-1 rounded-2xl border border-white/10 bg-[#1a1d2e]/95 p-1.5 shadow-2xl shadow-black/40 backdrop-blur-md">
      {TOOLS.map((item, index) => (
        <div key={item.id}>
          {index === 2 || index === 8 ? <div className="tp-tooldiv mx-auto my-1 h-px w-6 bg-white/10" /> : null}
          <ToolButton
            active={tool === item.id}
            label={`${item.label} (${item.shortcut})`}
            onClick={() => setTool(item.id)}
          >
            {item.icon}
          </ToolButton>
        </div>
      ))}
      <div className="tp-tooldiv mx-auto my-1 h-px w-6 bg-white/10" />
      <ToolButton
        active={tool === "symbol"}
        label={`Tákn — ${symbol.name}`}
        onClick={() => setTool("symbol")}
      >
        <span
          className="flex size-5 items-center justify-center rounded-sm text-[8px] font-bold"
          style={{ background: symbolColors(symbol.kind).bg, color: symbolColors(symbol.kind).fg }}
        >
          {symbol.short.slice(0, 2)}
        </span>
      </ToolButton>
    </div>
  );
}

function ToolButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={cn(
        "tp-toolbtn flex size-9 items-center justify-center rounded-xl text-stone-300 transition",
        active ? "bg-[#FE653F] text-white shadow-inner" : "hover:bg-white/8 hover:text-white"
      )}
    >
      {children}
    </button>
  );
}

/* Lag-veljarinn — birtist aðeins þegar lagnirnar eru opnar í hliðarstikunni. */
function LagPicker() {
  const layers = useBoardStore((s) => s.layers);
  const activeLayerId = useBoardStore((s) => s.activeLayerId);
  const setActiveLayer = useBoardStore((s) => s.setActiveLayer);
  return (
    <>
      <span className="hidden sm:inline text-stone-500">Lag</span>
      {layers
        .filter((l) => l.kind !== "background")
        .map((layer) => (
          <button
            key={layer.id}
            type="button"
            title={layer.name}
            onClick={() => setActiveLayer(layer.id)}
            className={cn(
              "size-5 rounded-full border",
              activeLayerId === layer.id ? "ring-2 ring-white" : "border-white/20",
              !layer.visible && "opacity-35"
            )}
            style={{ background: layer.color }}
          />
        ))}
    </>
  );
}

/* Merkinga-stikan: stærð nýrra tákna og sameiginleg dofnun þeirra allra.
 * Agnar 02.09.2026 — stærðin á heima í plássinu sem Lagnir losuðu, og dofnunin
 * er til að geta „kíkt á merkingar bak við merkin á teikningunni".            */
function MerkingarStrip({ withSize }: { withSize: boolean }) {
  const [px, setPx] = useState(getStampSize());
  const symbolOpacity = useBoardStore((s) => s.symbolOpacity);
  const setSymbolOpacity = useBoardStore((s) => s.setSymbolOpacity);
  // Stimpilstærðin er sameiginleg öllum borðum og berst milli tækja, svo sláin
  // verður að endurteikna þegar hún kemur að utan.
  useEffect(() => subscribeSymbolSettings(() => setPx(getStampSize())), []);
  // Dofnunin er sjónstilling þessa tækis — lesin eftir hleðslu, ekki í store-inu
  // sjálfu, svo fyrsta teikning vafrans stangist ekki á við þjóninn.
  useEffect(() => {
    try {
      const saved = Number(window.localStorage.getItem(SYMBOL_OPACITY_KEY));
      if (saved > 0 && saved < 1) setSymbolOpacity(saved);
    } catch {
      /* privat gluggi — full skerpa */
    }
  }, [setSymbolOpacity]);

  return (
    <>
      <span className="hidden shrink-0 sm:inline text-stone-500">Merkingar</span>
      {withSize ? (
        <label
          className="flex shrink-0 items-center gap-1.5"
          title="Stærð á NÝJUM táknum — breytir engu sem þegar er komið á borðið"
        >
          <input
            type="range"
            min={STAMP_SIZE_MIN}
            max={STAMP_SIZE_MAX}
            step={2}
            value={px}
            aria-label="Stærð nýrra tákna"
            // Rennur mjúkt í viðmótinu, vistast þegar sleppt er.
            onChange={(e) => setPx(Number(e.target.value))}
            onPointerUp={() => void setStampSize(px)}
            onKeyUp={() => void setStampSize(px)}
            onBlur={() => void setStampSize(px)}
            className="h-1 w-20 cursor-pointer accent-[#FE653F] sm:w-28"
          />
          <span className="w-9 shrink-0 tabular-nums text-stone-400">{px}px</span>
        </label>
      ) : null}
      <label
        className="flex shrink-0 items-center gap-1.5"
        title="Dofnar ÖLL tákn jafnt svo merkingar teikningarinnar sjáist undir þeim"
      >
        <span className="text-[13px] leading-none">◐</span>
        <input
          type="range"
          min={15}
          max={100}
          step={5}
          value={Math.round(symbolOpacity * 100)}
          aria-label="Skyggni tákna"
          onChange={(e) => setSymbolOpacity(Number(e.target.value) / 100)}
          className="h-1 w-20 cursor-pointer accent-[#FE653F] sm:w-24"
        />
        <span className="w-9 shrink-0 tabular-nums text-stone-400">
          {Math.round(symbolOpacity * 100)}%
        </span>
      </label>
    </>
  );
}

export function StyleStrip() {
  const style = useBoardStore((s) => s.style);
  const setStyle = useBoardStore((s) => s.setStyle);
  const tool = useBoardStore((s) => s.tool);
  const layers = useBoardStore((s) => s.layers);
  const activeLayerId = useBoardStore((s) => s.activeLayerId);
  const pipesOpen = useBoardStore((s) => s.pipesOpen);
  const activeLayer = layers.find((l) => l.id === activeLayerId);

  // Style choices also restyle whatever is selected (walls included), so an
  // existing eldveggur can be recoloured or thinned after the fact.
  const applyToSelection = (patch: {
    stroke?: string;
    strokeWidth?: number;
    dash?: "solid" | "dashed" | "dotted";
  }) => {
    const { selectedIds, objects, updateObjects } = useBoardStore.getState();
    if (!selectedIds.length) return;
    const keys = Object.keys(patch);
    const ids = objects
      .filter((o) => selectedIds.includes(o.id) && keys.every((k) => k in o))
      .map((o) => o.id);
    if (ids.length) {
      updateObjects(ids, (o) => ({ ...o, ...patch }) as typeof o);
    }
  };

  if (tool === "symbol") {
    return (
      <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-white/10 bg-[#1a1d2e]/95 px-3 py-1.5 text-xs text-stone-300 shadow-2xl">
        {pipesOpen ? <LagPicker /> : null}
        <MerkingarStrip withSize />
      </div>
    );
  }

  return (
    <div className="tp-stylestrip pointer-events-auto flex items-center gap-2 rounded-2xl border border-white/10 bg-[#1a1d2e]/95 px-3 py-1.5 text-xs text-stone-300 shadow-2xl">
      {pipesOpen ? (
        <>
          <LagPicker />
          <span className="hidden max-w-[7rem] truncate sm:inline text-stone-400">
            {activeLayer?.name ?? "Almennt"}
          </span>
          <div className="mx-1 h-4 w-px bg-white/10" />
        </>
      ) : null}
      <MerkingarStrip withSize={false} />
      <div className="mx-1 h-4 w-px bg-white/10" />
      <span className="hidden sm:inline text-stone-500">Litur</span>
      {["#1c1917", "#FE653F", "#16a34a", "#2563eb", "#ca8a04", "#ffffff"].map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => {
            setStyle({ stroke: color });
            applyToSelection({ stroke: color });
          }}
          className={cn("size-5 rounded-full border", style.stroke === color ? "ring-2 ring-white" : "border-white/20")}
          style={{ background: color }}
        />
      ))}
      <div className="mx-1 h-4 w-px bg-white/10" />
      {[2, 4, 8, 12].map((w) => (
        <button
          key={w}
          type="button"
          onClick={() => {
            setStyle({ strokeWidth: w });
            applyToSelection({ strokeWidth: w });
          }}
          className={cn("rounded-md px-1.5 py-0.5", style.strokeWidth === w ? "bg-white/15 text-white" : "hover:bg-white/8")}
        >
          {w}px
        </button>
      ))}
      <div className="mx-1 h-4 w-px bg-white/10" />
      {(["solid", "dashed", "dotted"] as const).map((dash) => (
        <button
          key={dash}
          type="button"
          onClick={() => {
            setStyle({ dash });
            applyToSelection({ dash });
          }}
          className={cn("rounded-md px-1.5 py-0.5 capitalize", style.dash === dash ? "bg-white/15 text-white" : "hover:bg-white/8")}
        >
          {dash === "solid" ? "heil" : dash === "dashed" ? "strik" : "punktar"}
        </button>
      ))}
    </div>
  );
}
