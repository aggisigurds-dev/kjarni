"use client";

import { TRAY_SYMBOLS, SYMBOL_DRAG_TYPE } from "../../lib/board/markup-kit";
import { getSymbol, symbolColors } from "../../lib/board/symbols";
import { useBoardStore } from "../../lib/board/store";
import { cn } from "../../lib/utils";

export function SymbolTray() {
  const style = useBoardStore((s) => s.style);
  const setStyle = useBoardStore((s) => s.setStyle);
  const setTool = useBoardStore((s) => s.setTool);

  return (
    <div className="pointer-events-auto flex max-w-[min(96vw,820px)] items-center gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-[#1a1d2e]/95 px-2 py-1.5 shadow-2xl">
      <span className="hidden shrink-0 px-1 text-[10px] font-medium tracking-wide text-white/45 sm:inline">
        DRAGÐU TÁKN
      </span>
      {TRAY_SYMBOLS.map((id) => {
        const s = getSymbol(id);
        const c = symbolColors(s.kind);
        const active = style.symbolId === id;
        return (
          <button
            key={id}
            type="button"
            draggable
            title={`${s.name} — dragðu inn á plönið`}
            onDragStart={(e) => {
              e.dataTransfer.setData(SYMBOL_DRAG_TYPE, id);
              e.dataTransfer.effectAllowed = "copy";
            }}
            onClick={() => {
              setStyle({ symbolId: id });
              setTool("symbol");
            }}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-lg px-1.5 py-1 text-[11px] text-stone-200",
              active ? "bg-white/15 ring-1 ring-white/30" : "hover:bg-white/8"
            )}
          >
            <span
              className="flex size-6 items-center justify-center rounded-sm text-[8px] font-bold shadow-sm"
              style={{ background: c.bg, color: c.fg }}
            >
              {s.short.slice(0, 2)}
            </span>
            <span className="hidden lg:inline">{s.name}</span>
          </button>
        );
      })}
    </div>
  );
}
