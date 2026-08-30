"use client";

import { useMemo, useState } from "react";
import { Plus, Settings2, Trash2 } from "lucide-react";
import { newId } from "../../lib/board/ids";
import {
  holeTotals,
  isAreaRoom,
  isHoleRoom,
  roomHoles,
  solidHex,
  withFillAlpha,
  type RoomColorRule,
  type RoomSettings,
} from "../../lib/board/room-rules";
import { useBoardStore } from "../../lib/board/store";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";

export function RoomTable() {
  const objects = useBoardStore((s) => s.objects);
  const selectedIds = useBoardStore((s) => s.selectedIds);
  const roomSettings = useBoardStore((s) => s.roomSettings);
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return (
      window.matchMedia("(min-width: 1024px)").matches &&
      !window.matchMedia("(pointer: coarse)").matches
    );
  });
  const [settingsOpen, setSettingsOpen] = useState(false);

  const rooms = useMemo(() => objects.filter(isAreaRoom).filter((o) => !o.hidden), [objects]);
  const totals = useMemo(() => holeTotals(rooms.filter(isHoleRoom)), [rooms]);

  if (!rooms.length && !open) return null;

  return (
    <div className="w-56 rounded-xl border border-white/10 bg-[#1a1d2e]/95 text-stone-100 shadow-2xl lg:w-[260px]">
      <div className="flex min-h-9 items-center gap-1 px-2 py-1.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center justify-between px-1 py-1"
          title={open ? "Fella saman" : "Opna rýmislista"}
        >
          <span className="text-[11px] font-semibold tracking-wide">RÝMI · GÖT</span>
          <span className="text-[11px] tabular-nums text-white/50">
            {open ? "−" : `${totals.left} eftir`}
          </span>
        </button>
        <button
          type="button"
          title="Reglur og litir"
          onClick={() => setSettingsOpen(true)}
          className="rounded-md p-1 text-white/55 hover:bg-white/10 hover:text-white"
        >
          <Settings2 className="size-3.5" />
        </button>
      </div>
      {open ? (
        <div className="px-3 pb-2.5">
          {rooms.length ? (
            <div className="max-h-[36vh] overflow-y-auto">
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr className="text-[10px] text-white/35">
                    <th className="pb-1 pr-1 text-left font-medium">Nafn</th>
                    <th className="w-10 pb-1 text-right font-medium">Eftir</th>
                    <th className="w-10 pb-1 text-right font-medium">Heild</th>
                    <th className="w-6 pb-1" />
                  </tr>
                </thead>
                <tbody>
                  {rooms.map((r) => {
                    const h = roomHoles(r);
                    const done = isHoleRoom(r) && h.left === 0;
                    return (
                      <tr
                        key={r.id}
                        className={`border-b border-white/5 last:border-0 ${
                          selectedIds.includes(r.id) ? "bg-white/8" : ""
                        }`}
                      >
                        <td className="py-0.5 pr-1">
                          <input
                            value={r.name}
                            onFocus={() => {
                              useBoardStore.getState().setTool("select");
                              useBoardStore.getState().setSelected([r.id]);
                            }}
                            onChange={(e) =>
                              useBoardStore.getState().setRoomHoles(r.id, { name: e.target.value })
                            }
                            className="w-full min-w-0 truncate rounded bg-transparent px-0.5 py-0.5 outline-none hover:bg-white/5 focus:bg-white/10"
                          />
                        </td>
                        <td className="py-0.5">
                          <input
                            type="number"
                            min={0}
                            value={isHoleRoom(r) ? h.left : ""}
                            placeholder="0"
                            onFocus={() => useBoardStore.getState().setSelected([r.id])}
                            onChange={(e) =>
                              useBoardStore.getState().setRoomHoles(r.id, {
                                holesLeft: Number(e.target.value),
                                holesTotal: r.holesTotal ?? roomSettings.defaultHolesTotal,
                              })
                            }
                            className={`w-full bg-transparent py-0.5 text-right tabular-nums outline-none ${
                              done ? "text-emerald-400" : ""
                            }`}
                          />
                        </td>
                        <td className="py-0.5">
                          <input
                            type="number"
                            min={0}
                            value={isHoleRoom(r) ? h.total : ""}
                            placeholder={`${roomSettings.defaultHolesTotal}`}
                            onFocus={() => useBoardStore.getState().setSelected([r.id])}
                            onChange={(e) =>
                              useBoardStore.getState().setRoomHoles(r.id, {
                                holesTotal: Number(e.target.value),
                                holesLeft: r.holesLeft ?? Number(e.target.value),
                              })
                            }
                            className="w-full bg-transparent py-0.5 text-right tabular-nums outline-none"
                          />
                        </td>
                        <td className="py-0.5 pl-0.5">
                          <button
                            type="button"
                            title={done ? "Lokið" : "Slá út eitt gat"}
                            disabled={done || !isHoleRoom(r)}
                            onClick={() => useBoardStore.getState().punchHole(r.id)}
                            className="flex size-5 items-center justify-center rounded-full text-[10px] font-bold disabled:opacity-40"
                            style={{
                              background: done ? "#166534" : solidHex(r.fill === "transparent" ? "#ef4444" : r.fill),
                              color: "#fff",
                            }}
                          >
                            {done ? "✓" : h.left}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-[11px] text-white/40">
              Dragðu kassa með Rými-tólinu (B) yfir herbergi.
            </div>
          )}
          <div className="mt-1.5 flex items-center justify-between border-t border-white/15 pt-1.5 text-[11px] font-semibold">
            <span>Samtals eftir</span>
            <span className="tabular-nums text-emerald-300">
              {totals.left} / {totals.total}
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-white/50">
            <span>Lokið rými</span>
            <span className="tabular-nums">
              {totals.done} / {totals.count}
            </span>
          </div>
        </div>
      ) : null}
      <RoomSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}

function RoomSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const roomSettings = useBoardStore((s) => s.roomSettings);
  const [draft, setDraft] = useState<RoomSettings>(roomSettings);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setDraft(useBoardStore.getState().roomSettings);
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto border-stone-200 bg-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reglur fyrir rými og göt</DialogTitle>
          <DialogDescription>
            Sjálfgefin göt á nýju rými, litir og þröskuldar. Fyrsta regla sem passar (göt eftir ≤ hámark)
            ræður fyllingunni. Núll eftir verður alltaf lokið-liturinn.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm text-stone-800">
          <label className="block space-y-1">
            <span className="text-[11px] text-stone-500">Sjálfgefin göt heild</span>
            <Input
              type="number"
              min={0}
              value={draft.defaultHolesTotal}
              onChange={(e) =>
                setDraft({ ...draft, defaultHolesTotal: Math.max(0, Math.round(Number(e.target.value) || 0)) })
              }
            />
          </label>
          <div className="grid grid-cols-3 gap-2">
            <ColorField
              label="Lokið"
              value={draft.doneColor}
              onChange={(doneColor) => setDraft({ ...draft, doneColor })}
            />
            <ColorField
              label="Í vinnslu"
              value={draft.inProgressColor}
              onChange={(inProgressColor) => setDraft({ ...draft, inProgressColor })}
            />
            <ColorField
              label="Útlína"
              value={draft.strokeColor}
              alpha={false}
              onChange={(strokeColor) => setDraft({ ...draft, strokeColor })}
            />
          </div>
          <div>
            <div className="mb-1.5 text-[11px] font-medium tracking-wide text-stone-500">REGLUR</div>
            <div className="space-y-2">
              {draft.rules.map((rule, index) => (
                <div key={rule.id} className="flex items-center gap-2 rounded-lg border border-stone-200 p-2">
                  <input
                    type="color"
                    value={solidHex(rule.color)}
                    onChange={(e) =>
                      patchRule(draft, setDraft, index, { color: withFillAlpha(e.target.value) })
                    }
                    className="size-7 cursor-pointer rounded border-0 bg-transparent p-0"
                    title="Litur"
                  />
                  <Input
                    value={rule.label}
                    onChange={(e) => patchRule(draft, setDraft, index, { label: e.target.value })}
                    className="h-7 flex-1"
                    placeholder="Heiti"
                  />
                  <label className="flex items-center gap-1 text-[11px] text-stone-500">
                    ≤
                    <Input
                      type="number"
                      min={0}
                      value={rule.maxLeft}
                      onChange={(e) =>
                        patchRule(draft, setDraft, index, {
                          maxLeft: Math.max(0, Math.round(Number(e.target.value) || 0)),
                        })
                      }
                      className="h-7 w-20"
                    />
                  </label>
                  <button
                    type="button"
                    title="Fjarlægja reglu"
                    onClick={() =>
                      setDraft({ ...draft, rules: draft.rules.filter((r) => r.id !== rule.id) })
                    }
                    className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() =>
                setDraft({
                  ...draft,
                  rules: [
                    ...draft.rules,
                    {
                      id: newId(),
                      maxLeft: 1,
                      color: "#f59e0baa",
                      label: "Ný regla",
                    } satisfies RoomColorRule,
                  ],
                })
              }
            >
              <Plus className="size-3.5" />
              Bæta við reglu
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Hætta við
          </Button>
          <Button
            type="button"
            onClick={() => {
              useBoardStore.getState().setRoomSettings(draft);
              onOpenChange(false);
            }}
          >
            Vista reglur
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function patchRule(
  draft: RoomSettings,
  setDraft: (next: RoomSettings) => void,
  index: number,
  patch: Partial<RoomColorRule>
) {
  setDraft({
    ...draft,
    rules: draft.rules.map((r, i) => (i === index ? { ...r, ...patch } : r)),
  });
}

function ColorField({
  label,
  value,
  onChange,
  alpha = true,
}: {
  label: string;
  value: string;
  onChange: (c: string) => void;
  alpha?: boolean;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] text-stone-500">{label}</span>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          value={solidHex(value)}
          onChange={(e) => onChange(alpha ? withFillAlpha(e.target.value) : e.target.value)}
          className="size-7 cursor-pointer rounded border-0 bg-transparent p-0"
        />
        <span className="truncate font-mono text-[10px] text-stone-400">{solidHex(value)}</span>
      </div>
    </label>
  );
}
