"use client";

import { Plus } from "lucide-react";
import {
  DEFAULT_ROOM_NAME,
  ROOM_COLORS,
  listRooms,
  roomOfSelection,
} from "../../lib/board/rooms";
import { useBoardStore } from "../../lib/board/store";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Slider } from "../ui/slider";

export function RoomList({ onFocusObject }: { onFocusObject?: (id: string) => void }) {
  const objects = useBoardStore((s) => s.objects);
  const selectedIds = useBoardStore((s) => s.selectedIds);
  const tool = useBoardStore((s) => s.tool);
  const draftId = useBoardStore((s) => s.roomDraftGroupId);
  const roomStyle = useBoardStore((s) => s.roomStyle);
  const rooms = listRooms(objects);
  const drafting = tool === "room" || Boolean(draftId);
  const draftBoxes = draftId ? (rooms.find((r) => r.key === draftId)?.ids.length ?? 0) : 0;
  const selectedRoom = roomOfSelection(objects, selectedIds);
  const editor = draftId ? rooms.find((r) => r.key === draftId) : selectedRoom;
  const editorKey = editor?.key ?? draftId ?? null;
  const color = editor?.color ?? roomStyle.color;
  const opacity = editor?.opacity ?? roomStyle.opacity;
  const counted = editor ? editor.counted : roomStyle.counted;

  return (
    <div className="mb-5 border-b border-white/8 pb-4">
      <div className="mb-2 text-[11px] font-medium tracking-[0.12em] text-[#FE653F]">RÝMI</div>
      <p className="mb-2 text-[11px] leading-relaxed text-stone-500">
        Óreglulegt rými: teiknaðu nokkra kassa, svo Búa til. Nafn, litur og teljari stillast hér.
      </p>
      {drafting ? (
        <div className="mb-2 space-y-2 rounded-md border border-[#FE653F]/40 bg-[#FE653F]/10 px-2 py-2">
          <p className="text-[11px] leading-relaxed text-stone-200">
            {draftBoxes === 0
              ? "Dragðu kassa á plönið. Þarf fleiri horn? Teiknaðu annan."
              : `${draftBoxes} kassi${draftBoxes === 1 ? "" : "ar"} — teiknaðu fleiri eða búðu til rýmið.`}
          </p>
          <div className="flex gap-1.5">
            <Button
              size="sm"
              className="flex-1 bg-[#FE653F] text-white hover:bg-[#e85a38]"
              disabled={draftBoxes === 0}
              onClick={() => useBoardStore.getState().commitRoomDraft()}
            >
              Búa til
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-stone-300"
              onClick={() => useBoardStore.getState().cancelRoomDraft()}
            >
              Hætta
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="mb-2 flex w-full items-center justify-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-[12px] font-medium text-stone-200 hover:bg-white/10 hover:text-white"
          onClick={() => useBoardStore.getState().startRoomDraft()}
        >
          <Plus className="size-3.5" />
          rými
        </button>
      )}
      {editor && !drafting ? (
        <label className="mb-2 block space-y-1">
          <div className="text-[11px] text-stone-500">Nafn</div>
          <Input
            autoFocus={editor.name === DEFAULT_ROOM_NAME}
            value={editor.name}
            onChange={(e) => useBoardStore.getState().renameRoom(editor.key, e.target.value)}
            placeholder="t.d. Eldhús"
            className="h-8 border-white/10 bg-white/5 text-stone-100"
          />
        </label>
      ) : null}
      {drafting || editor ? (
        <div className="mb-2 space-y-2">
          <div>
            <div className="mb-1.5 text-[11px] text-stone-500">Litur</div>
            <div className="flex flex-wrap gap-1.5">
              {ROOM_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  title={c}
                  onClick={() => useBoardStore.getState().applyRoomAppearance(editorKey, { color: c })}
                  className={`size-6 rounded-md border ${
                    color.toLowerCase() === c.toLowerCase() ? "ring-2 ring-white" : "border-white/15"
                  }`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
          <label className="block space-y-1.5">
            <div className="text-[11px] text-stone-500">
              Gegnsæi · {Math.round(opacity * 100)}%
            </div>
            <Slider
              min={0.08}
              max={0.7}
              step={0.02}
              value={[opacity]}
              onValueChange={(v) => {
                const n = Array.isArray(v) ? v[0] : v;
                useBoardStore.getState().applyRoomAppearance(editorKey, { opacity: n }, false);
              }}
            />
          </label>
          <label className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-1 text-[12px] text-stone-300 hover:bg-white/5">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={counted}
              onChange={(e) => {
                const on = e.target.checked;
                if (editorKey) useBoardStore.getState().setRoomCounted(editorKey, on);
                else useBoardStore.getState().applyRoomAppearance(null, { counted: on });
              }}
            />
            <span>
              <span className="block text-stone-200">Teljari · magntafla</span>
              <span className="block text-[11px] leading-snug text-stone-500">
                Númer á rýminu og línan í magntöflu Brunahólfs (m²).
              </span>
            </span>
          </label>
        </div>
      ) : null}
      <div className="space-y-0.5">
        {rooms.map((room) => {
          const active = selectedIds.some((id) => room.ids.includes(id));
          const n = rooms.filter((r) => r.counted).findIndex((r) => r.key === room.key);
          return (
            <button
              key={room.key}
              type="button"
              onClick={() => {
                useBoardStore.getState().applyRoomAppearance(null, {
                  color: room.color,
                  opacity: room.opacity,
                  counted: room.counted,
                });
                useBoardStore.getState().setTool("select");
                useBoardStore.getState().setSelected(room.ids);
                onFocusObject?.(room.ids[0]!);
              }}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs ${
                active ? "bg-white/10 text-white" : "text-stone-400 hover:bg-white/5"
              }`}
            >
              <span
                className="size-2.5 shrink-0 rounded-sm ring-1 ring-white/20"
                style={{ background: room.color }}
              />
              {room.counted ? (
                <span className="w-4 shrink-0 text-center text-[10px] font-semibold text-stone-300">
                  {n + 1}
                </span>
              ) : (
                <span className="w-4 shrink-0" />
              )}
              <span className="min-w-0 flex-1 truncate">{room.name}</span>
              {room.ids.length > 1 ? (
                <span className="text-[10px] text-stone-600">{room.ids.length} kassar</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
