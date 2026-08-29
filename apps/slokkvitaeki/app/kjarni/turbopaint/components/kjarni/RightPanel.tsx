"use client";

import type { ReactNode } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Lock, Trash2, Unlock } from "lucide-react";
import { isFirewallMark } from "../../lib/board/detect-firewalls";
import { isMvsMark } from "../../lib/board/mvs165";
import { FILL_PRESETS, STICKY_COLORS, STROKE_PRESETS, type BoardObject } from "../../lib/board/types";
import { useBoardStore } from "../../lib/board/store";
import { getSymbol } from "../../lib/board/symbols";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Slider } from "../ui/slider";
import { Textarea } from "../ui/textarea";

type LayerGroupId = "teikning" | "eldveggur" | "mvs" | "takn" | "annad";

const LAYER_GROUPS: { id: LayerGroupId; label: string }[] = [
  { id: "teikning", label: "Teikningar" },
  { id: "eldveggur", label: "Eldveggir" },
  { id: "mvs", label: "165.BR1" },
  { id: "takn", label: "Tákn" },
  { id: "annad", label: "Annað" },
];

function layerGroupOf(obj: BoardObject): LayerGroupId {
  if (obj.type === "image") return "teikning";
  if (isFirewallMark(obj)) return "eldveggur";
  if (isMvsMark(obj)) return "mvs";
  if (obj.type === "symbol") return "takn";
  return "annad";
}

export function RightPanel({ onFocusObject }: { onFocusObject?: (id: string) => void } = {}) {
  const objects = useBoardStore((s) => s.objects);
  const selectedIds = useBoardStore((s) => s.selectedIds);
  const selected = objects.filter((o) => selectedIds.includes(o.id));
  const primary = selected[0];

  // Lög heita „tegund + númer" í sköpunarröð (Slökkvitæki 1, 2 …) í stað þess
  // að allt heiti „Tákn". Númer bætist aðeins við þegar fleiri en eitt deila nafni.
  const layerNames = (() => {
    const base = new Map<string, string>();
    const totals = new Map<string, number>();
    for (const obj of objects) {
      const b =
        obj.type === "symbol" && (!obj.name || obj.name === "Tákn")
          ? getSymbol(obj.symbolId).name
          : obj.name || obj.type;
      base.set(obj.id, b);
      totals.set(b, (totals.get(b) ?? 0) + 1);
    }
    const seen = new Map<string, number>();
    const out = new Map<string, string>();
    for (const obj of objects) {
      const b = base.get(obj.id)!;
      const n = (seen.get(b) ?? 0) + 1;
      seen.set(b, n);
      out.set(obj.id, (totals.get(b) ?? 0) > 1 ? `${b} ${n}` : b);
    }
    return out;
  })();

  return (
    <aside className="flex h-full w-[280px] shrink-0 flex-col border-l border-white/8 bg-[#12141c] text-stone-200">
      <div className="border-b border-white/8 px-4 py-3">
        <div className="text-[11px] font-medium tracking-[0.12em] text-[#FE653F]">EIGINLEIKAR</div>
        <div className="mt-1 text-sm text-stone-300">
          {selected.length === 0
            ? "Ekkert valið"
            : selected.length === 1
              ? primary?.name || primary?.type
              : `${selected.length} atriði`}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {primary ? (
          <div className="space-y-4">
            {primary.type === "symbol" ? (
              <Field label="Merki / númer">
                <Input
                  value={primary.label}
                  onChange={(e) =>
                    useBoardStore.getState().patchObject(primary.id, { label: e.target.value })
                  }
                  placeholder={getSymbol(primary.symbolId).name}
                  className="h-8 border-white/10 bg-white/5 text-stone-100"
                />
              </Field>
            ) : null}
            {primary.type === "text" || primary.type === "sticky" ? (
              <Field label="Texti">
                <Textarea
                  value={primary.text}
                  onChange={(e) =>
                    useBoardStore.getState().patchObject(primary.id, { text: e.target.value })
                  }
                  className="min-h-24 border-white/10 bg-white/5 text-stone-100"
                />
              </Field>
            ) : null}
            {primary.type === "image" ? (
              <>
                <p className="text-xs leading-relaxed text-stone-400">
                  Dragðu gólfplönið til að færa skjalið. Merkingar, tákn og minnismiðar ofan á síðunni
                  fylgja með. Læstu síðunni ef þú vilt ekki hreyfa hana óvart.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full border-white/10 bg-white/5 text-stone-200"
                  onClick={() => {
                    useBoardStore.getState().setTool("crop");
                    toast.message("Dragðu ramma yfir svæðið sem á að HALDA — restin sníðst af");
                  }}
                >
                  ✂ Croppa teikningu
                </Button>
              </>
            ) : null}
            {"stroke" in primary ? (
              <Field label="Strokulitur">
                <Swatches
                  colors={STROKE_PRESETS}
                  value={primary.stroke}
                  onChange={(stroke) =>
                    useBoardStore.getState().patchObject(primary.id, { stroke } as never)
                  }
                />
              </Field>
            ) : null}
            {"fill" in primary ? (
              <Field label="Fylling">
                <Swatches
                  colors={primary.type === "sticky" ? STICKY_COLORS : FILL_PRESETS}
                  value={primary.fill}
                  onChange={(fill) =>
                    useBoardStore.getState().patchObject(primary.id, { fill } as never)
                  }
                />
              </Field>
            ) : null}
            <Field label={`Gegnsæi · ${Math.round(primary.opacity * 100)}%`}>
              <Slider
                min={0.15}
                max={1}
                step={0.05}
                value={[primary.opacity]}
                onValueChange={(v) => {
                  const n = Array.isArray(v) ? v[0] : v;
                  useBoardStore.getState().patchObject(primary.id, { opacity: n }, false);
                }}
              />
            </Field>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1 border-white/10 bg-white/5 text-stone-200"
                onClick={() => useBoardStore.getState().lockSelected(!primary.locked)}
              >
                {primary.locked ? <Unlock className="size-3.5" /> : <Lock className="size-3.5" />}
                {primary.locked ? "Aflæsa" : "Læsa"}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => useBoardStore.getState().deleteIds(selectedIds)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="flex-1 text-stone-300"
                onClick={() => useBoardStore.getState().sendBackward()}
              >
                Aftur
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="flex-1 text-stone-300"
                onClick={() => useBoardStore.getState().bringForward()}
              >
                Fram
              </Button>
            </div>
          </div>
        ) : objects.length === 0 ? (
          <p className="text-xs leading-relaxed text-stone-500">
            Dragðu inn PDF eða TIF af gólfplani. Síðan seturðu inn slökkvitæki, flóttaleiðir, línur og
            minnispunkta — eins og á hvítu borði.
          </p>
        ) : (
          <p className="text-xs leading-relaxed text-stone-500">
            Smelltu á lag til að velja það á borðinu.
          </p>
        )}
        <div className="mt-6">
          <div className="mb-2 text-[11px] font-medium tracking-[0.12em] text-stone-500">
            LÖG · {objects.length}
          </div>
          <div className="space-y-2">
            {LAYER_GROUPS.map((group) => {
              const items = [...objects].reverse().filter((obj) => layerGroupOf(obj) === group.id);
              if (!items.length) return null;
              return (
                <details key={group.id} open className="rounded-md bg-white/4">
                  <summary className="cursor-pointer select-none px-2 py-1.5 text-[11px] font-semibold tracking-wide text-stone-400">
                    {group.label}
                    <span className="pl-1.5 font-normal text-stone-600">{items.length}</span>
                  </summary>
                  <div className="space-y-0.5 pb-1">
                    {items.map((obj) => (
                      <button
                        key={obj.id}
                        type="button"
                        onClick={() => {
                          useBoardStore.getState().setTool("select");
                          useBoardStore.getState().setSelected([obj.id]);
                          onFocusObject?.(obj.id);
                        }}
                        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs ${
                          selectedIds.includes(obj.id)
                            ? "bg-white/10 text-white"
                            : "text-stone-400 hover:bg-white/5"
                        }`}
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {layerNames.get(obj.id) ?? obj.name ?? obj.type}
                        </span>
                        <span
                          role="presentation"
                          onClick={(e) => {
                            e.stopPropagation();
                            useBoardStore.getState().patchObject(obj.id, { hidden: !obj.hidden });
                          }}
                        >
                          {obj.hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                        </span>
                        {obj.locked ? <Lock className="size-3.5" /> : null}
                      </button>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
        </div>
      </div>
    </aside>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <div className="text-[11px] text-stone-500">{label}</div>
      {children}
    </label>
  );
}

function Swatches({
  colors,
  value,
  onChange,
}: {
  colors: readonly string[];
  value: string;
  onChange: (c: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`size-6 rounded-md border ${value === c ? "ring-2 ring-white" : "border-white/15"}`}
          style={{
            background:
              c === "transparent"
                ? "repeating-conic-gradient(#444 0% 25%, #222 0% 50%) 50% / 8px 8px"
                : c,
          }}
        />
      ))}
    </div>
  );
}
