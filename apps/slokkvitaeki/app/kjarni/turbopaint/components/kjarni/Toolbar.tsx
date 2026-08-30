"use client";

import type { ReactNode } from "react";

import {
  ArrowUpRight,
  BoxSelect,
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
import { useBoardStore } from "../../lib/board/store";
import type { Tool } from "../../lib/board/types";
import { cn } from "../../lib/utils";

const TOOLS: { id: Tool; label: string; shortcut: string; icon: ReactNode }[] = [
  { id: "select", label: "Velja", shortcut: "V", icon: <MousePointer2 className="size-4" /> },
  { id: "hand", label: "Hönd / færa borð", shortcut: "H", icon: <Hand className="size-4" /> },
  { id: "rect", label: "Ferningur", shortcut: "R", icon: <Square className="size-4" /> },
  { id: "room", label: "Rými — dragðu kassa, smelltu á göt", shortcut: "B", icon: <BoxSelect className="size-4" /> },
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
          {index === 2 || index === 9 ? <div className="tp-tooldiv mx-auto my-1 h-px w-6 bg-white/10" /> : null}
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

export function StyleStrip() {
  const style = useBoardStore((s) => s.style);
  const setStyle = useBoardStore((s) => s.setStyle);
  const tool = useBoardStore((s) => s.tool);
  const layers = useBoardStore((s) => s.layers);
  const activeLayerId = useBoardStore((s) => s.activeLayerId);
  const setActiveLayer = useBoardStore((s) => s.setActiveLayer);
  const drawableLayers = layers.filter((l) => l.kind !== "background");
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

  if (tool === "room") {
    return (
      <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-white/10 bg-[#1a1d2e]/95 px-3 py-1.5 text-xs text-stone-300 shadow-2xl">
        <span className="text-stone-400">Dragðu kassa yfir rýmið · smelltu á gatið til að slá út</span>
      </div>
    );
  }

  if (tool === "symbol") {
    return (
      <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-white/10 bg-[#1a1d2e]/95 px-3 py-1.5 text-xs text-stone-300 shadow-2xl">
        <span className="hidden sm:inline text-stone-500">Lag</span>
        {drawableLayers.map((layer) => (
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
        <span className="text-stone-400">Stimplaðu tákn á {activeLayer?.name ?? "Almennt"}</span>
      </div>
    );
  }

  return (
    <div className="tp-stylestrip pointer-events-auto flex items-center gap-2 rounded-2xl border border-white/10 bg-[#1a1d2e]/95 px-3 py-1.5 text-xs text-stone-300 shadow-2xl">
      <span className="hidden sm:inline text-stone-500">Lag</span>
      {drawableLayers.map((layer) => (
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
      <span className="hidden max-w-[7rem] truncate sm:inline text-stone-400">
        {activeLayer?.name ?? "Almennt"}
      </span>
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
