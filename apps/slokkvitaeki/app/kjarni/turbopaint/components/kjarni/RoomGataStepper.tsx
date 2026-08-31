"use client";

import type { PointerEvent, SyntheticEvent } from "react";
import { screenFromWorld } from "../../lib/board/geometry";
import { isDrawnVisible } from "../../lib/board/layers";
import {
  clampRoomGataCount,
  listRooms,
  primaryRoomBoxId,
} from "../../lib/board/rooms";
import { useBoardStore } from "../../lib/board/store";

function stop(e: SyntheticEvent) {
  e.stopPropagation();
}

export function RoomGataStepper({
  value,
  onChange,
  variant = "sidebar",
  muted = false,
}: {
  value: number;
  onChange: (n: number) => void;
  variant?: "sidebar" | "canvas";
  muted?: boolean;
}) {
  const n = clampRoomGataCount(value);
  const bump = (delta: number) => (e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    onChange(clampRoomGataCount(n + delta));
  };
  const canvas = variant === "canvas";
  const btn = canvas
    ? "flex size-7 shrink-0 items-center justify-center rounded-full text-[16px] font-semibold leading-none text-white hover:bg-white/15 active:bg-white/25 disabled:opacity-35"
    : "flex size-8 shrink-0 items-center justify-center rounded-md text-[16px] font-semibold leading-none text-stone-100 hover:bg-white/10 active:bg-white/20 disabled:opacity-35";
  const wrap = canvas
    ? `pointer-events-auto flex items-center rounded-full border border-white/20 px-0.5 shadow-lg backdrop-blur-sm ${
        muted ? "bg-[#1a1d2e]/65 opacity-80" : "bg-[#1a1d2e]/95"
      }`
    : "inline-flex items-center rounded-md border border-white/10 bg-white/5";

  return (
    <div
      role="group"
      aria-label="Gata eftir"
      data-room-gata-stepper=""
      className={wrap}
      onPointerDown={stop}
      onPointerUp={stop}
      onPointerMove={stop}
      onClick={stop}
      onDoubleClick={stop}
    >
      <button
        type="button"
        className={btn}
        aria-label="Fækka götum eftir"
        disabled={n <= 0}
        onPointerDown={bump(-1)}
      >
        −
      </button>
      <span
        className={`min-w-6 px-0.5 text-center font-semibold tabular-nums ${
          canvas ? "text-[13px] text-white" : "text-[13px] text-stone-100"
        }`}
      >
        {n}
      </span>
      <button
        type="button"
        className={btn}
        aria-label="Fjölga götum eftir"
        onPointerDown={bump(1)}
      >
        +
      </button>
    </div>
  );
}

/** HTML overlay so ± clicks work on the first try (Konva hit-testing is fiddly). */
export function RoomGataOverlays({ width, height }: { width: number; height: number }) {
  const objects = useBoardStore((s) => s.objects);
  const selectedIds = useBoardStore((s) => s.selectedIds);
  const camera = useBoardStore((s) => s.camera);
  const layers = useBoardStore((s) => s.layers);
  const rooms = listRooms(objects);

  return (
    <div className="pointer-events-none absolute inset-0 z-[15] overflow-hidden">
      {rooms.map((room) => {
        const primaryId = primaryRoomBoxId(objects, room.ids);
        const box = objects.find((o) => o.id === primaryId);
        if (!box || box.type !== "rect" || !isDrawnVisible(box, layers)) return null;
        const origin = screenFromWorld({ x: box.x, y: box.y }, camera);
        const w = Math.abs(box.width) * camera.scale;
        const h = Math.abs(box.height) * camera.scale;
        const left = origin.x + w / 2;
        const top = origin.y + h / 2;
        if (left < -60 || top < -30 || left > width + 60 || top > height + 30) return null;
        const selected = selectedIds.some((id) => room.ids.includes(id));
        return (
          <div
            key={room.key}
            className="absolute"
            style={{ left, top, transform: "translate(-50%, -50%)" }}
          >
            <RoomGataStepper
              variant="canvas"
              muted={!selected}
              value={room.gataCount}
              onChange={(n) => useBoardStore.getState().setRoomGataCount(room.key, n)}
            />
          </div>
        );
      })}
    </div>
  );
}
