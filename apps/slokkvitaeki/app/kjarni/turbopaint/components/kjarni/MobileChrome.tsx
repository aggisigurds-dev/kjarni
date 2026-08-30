"use client";

import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  LayoutGrid,
  Lock,
  Plus,
  Settings2,
  Trash2,
  Unlock,
} from "lucide-react";
import { TRAY_SYMBOLS } from "../../lib/board/markup-kit";
import { isHoleRoom, roomHoles } from "../../lib/board/room-rules";
import { getSymbol, symbolColors } from "../../lib/board/symbols";
import { useBoardStore } from "../../lib/board/store";
import type { Tool } from "../../lib/board/types";
import { cn } from "../../lib/utils";
import { TOOLS } from "./Toolbar";

const DRAW_TOOLS: Tool[] = [
  "select",
  "hand",
  "rect",
  "room",
  "ellipse",
  "line",
  "arrow",
  "polyline",
  "pen",
  "text",
  "sticky",
  "measure",
  "calibrate",
  "eraser",
];

export function ObjectActionBar({ onOpenProperties }: { onOpenProperties: () => void }) {
  const selectedIds = useBoardStore((s) => s.selectedIds);
  const objects = useBoardStore((s) => s.objects);
  const selected = objects.filter((o) => selectedIds.includes(o.id));
  const primary = selected[0];
  if (!primary) return null;
  const locked = selected.every((o) => o.locked);
  const hole = isHoleRoom(primary) ? roomHoles(primary) : null;
  const btn =
    "flex size-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl text-white active:bg-white/15";

  return (
    <div className="pointer-events-auto flex max-w-[min(96vw,420px)] items-center gap-0.5 overflow-x-auto rounded-[28px] border border-white/10 bg-[#1c1c1e]/95 px-2 py-1.5 shadow-2xl shadow-black/50 backdrop-blur-md">
      <button
        type="button"
        className={btn}
        title="Færa aftar"
        onClick={() => useBoardStore.getState().sendBackward()}
      >
        <ChevronDown className="size-4" />
      </button>
      <button
        type="button"
        className={btn}
        title="Færa fram"
        onClick={() => useBoardStore.getState().bringForward()}
      >
        <ChevronUp className="size-4" />
      </button>
      <button
        type="button"
        className={btn}
        title="Afrita"
        onClick={() => useBoardStore.getState().duplicateSelected()}
      >
        <Copy className="size-4" />
      </button>
      <button
        type="button"
        className={btn}
        title={locked ? "Aflæsa" : "Læsa"}
        onClick={() => useBoardStore.getState().lockSelected(!locked)}
      >
        {locked ? <Unlock className="size-4" /> : <Lock className="size-4" />}
      </button>
      {hole && hole.left > 0 ? (
        <button
          type="button"
          className={btn}
          title="Slá út gat"
          onClick={() => useBoardStore.getState().punchHole(primary.id)}
        >
          <span className="text-[11px] font-bold tabular-nums">{hole.left}</span>
        </button>
      ) : null}
      {selectedIds.length >= 2 ? (
        <button
          type="button"
          className={btn}
          title="Hópa"
          onClick={() => useBoardStore.getState().groupSelected()}
        >
          <span className="text-[10px] font-semibold">Hópa</span>
        </button>
      ) : null}
      <button type="button" className={btn} title="Eiginleikar" onClick={onOpenProperties}>
        <Settings2 className="size-4" />
      </button>
      <button
        type="button"
        className={cn(btn, "text-red-400")}
        title="Eyða"
        onClick={() => useBoardStore.getState().deleteIds(selectedIds)}
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}

export function MobileController({
  onOpenProperties,
}: {
  onOpenProperties: () => void;
}) {
  const tool = useBoardStore((s) => s.tool);
  const setTool = useBoardStore((s) => s.setTool);
  const selectedIds = useBoardStore((s) => s.selectedIds);
  const [sheet, setSheet] = useState<"tools" | "add" | null>(null);
  const current = TOOLS.find((t) => t.id === tool) ?? TOOLS[0];

  if (selectedIds.length) {
    return <ObjectActionBar onOpenProperties={onOpenProperties} />;
  }

  return (
    <>
      <div className="pointer-events-auto flex items-center gap-2">
        <Pill
          title={current.label}
          active={tool !== "hand" && tool !== "select"}
          onClick={() => setTool(tool === "hand" ? "select" : "hand")}
        >
          {current.icon}
        </Pill>
        <Pill title="Verkfæri" wide onClick={() => setSheet(sheet === "tools" ? null : "tools")}>
          <LayoutGrid className="size-5" />
        </Pill>
        <Pill title="Bæta við" onClick={() => setSheet(sheet === "add" ? null : "add")}>
          <Plus className="size-5" />
        </Pill>
      </div>
      {sheet ? (
        <Sheet onClose={() => setSheet(null)}>
          {sheet === "tools" ? (
            <div className="grid grid-cols-4 gap-3">
              {TOOLS.filter((t) => DRAW_TOOLS.includes(t.id)).map((item) => (
                <SheetBtn
                  key={item.id}
                  label={item.label.split("—")[0].trim()}
                  active={tool === item.id}
                  onClick={() => {
                    setTool(item.id);
                    setSheet(null);
                  }}
                >
                  {item.icon}
                </SheetBtn>
              ))}
            </div>
          ) : (
            <AddSheet onClose={() => setSheet(null)} />
          )}
        </Sheet>
      ) : null}
    </>
  );
}

function AddSheet({ onClose }: { onClose: () => void }) {
  const setTool = useBoardStore((s) => s.setTool);
  const setStyle = useBoardStore((s) => s.setStyle);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        {(
          [
            ["text", "Texti"],
            ["sticky", "Minnispunktur"],
            ["room", "Rými"],
            ["pen", "Penni"],
          ] as const
        ).map(([id, label]) => {
          const item = TOOLS.find((t) => t.id === id);
          return (
            <SheetBtn
              key={id}
              label={label}
              onClick={() => {
                setTool(id);
                onClose();
              }}
            >
              {item?.icon}
            </SheetBtn>
          );
        })}
        <SheetBtn
          label="PDF / TIF"
          onClick={() => {
            document.getElementById("tp-import-input")?.click();
            onClose();
          }}
        >
          <Plus className="size-5" />
        </SheetBtn>
      </div>
      <div className="text-[11px] font-medium tracking-wide text-white/40">TÁKN</div>
      <div className="grid grid-cols-4 gap-3">
        {TRAY_SYMBOLS.map((id) => {
          const s = getSymbol(id);
          const c = symbolColors(s.kind);
          return (
            <SheetBtn
              key={id}
              label={s.short}
              onClick={() => {
                setStyle({ symbolId: id });
                if (id === "firewall") useBoardStore.getState().startFirewall();
                else setTool("symbol");
                onClose();
              }}
            >
              <span
                className="flex size-7 items-center justify-center rounded text-[10px] font-bold"
                style={{ background: c.bg, color: c.fg }}
              >
                {s.short.slice(0, 2)}
              </span>
            </SheetBtn>
          );
        })}
      </div>
    </div>
  );
}

function Pill({
  children,
  onClick,
  title,
  wide,
  active,
}: {
  children: ReactNode;
  onClick: () => void;
  title: string;
  wide?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "flex h-14 items-center justify-center rounded-full bg-[#1c1c1e] text-white shadow-2xl shadow-black/40",
        wide ? "w-20" : "w-14",
        active && "ring-2 ring-[#FE653F]"
      )}
    >
      {children}
    </button>
  );
}

function Sheet({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="pointer-events-auto fixed inset-0 z-[80]">
      <button type="button" className="absolute inset-0 bg-black/45" aria-label="Loka" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 max-h-[70vh] overflow-y-auto rounded-t-3xl bg-[#1c1c1e] px-5 pb-8 pt-3 text-white shadow-2xl">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/25" />
        {children}
      </div>
    </div>,
    document.body
  );
}

function SheetBtn({
  label,
  onClick,
  children,
  active,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "flex flex-col items-center gap-1.5 rounded-xl py-2 text-[11px] text-white/80",
        active && "bg-white/10 text-white"
      )}
    >
      <span className="flex size-10 items-center justify-center rounded-xl bg-white/8">{children}</span>
      {label}
    </button>
  );
}
