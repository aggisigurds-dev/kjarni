"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { objectsOnDocument } from "../../lib/board/geometry";
import { newId } from "../../lib/board/ids";
import { useBoardStore } from "../../lib/board/store";
import { getSymbol } from "../../lib/board/symbols";
import type { ImageObject } from "../../lib/board/types";

type Row = { key: string; label: string; count: number; group: number };

const GENERIC_LABELS: Record<string, string> = {
  rect: "Ferningar",
  ellipse: "Hringir",
  line: "Línur",
  arrow: "Örvar",
  polyline: "Fjöllínur",
  pen: "Fríhendisteikning",
  text: "Textar",
  sticky: "Minnismiðar",
  measure: "Mælingar",
};

export function CountTable() {
  const objects = useBoardStore((s) => s.objects);
  const selectedIds = useBoardStore((s) => s.selectedIds);
  // Á síma/spjaldtölvu (< 1024px eða snertiskjár) byrjar spjaldið samanfellt svo
  // það þeki ekki teikninguna. matchMedia má ekki keyra í SSR-prerender — guarded.
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return (
      window.matchMedia("(min-width: 1024px)").matches &&
      !window.matchMedia("(pointer: coarse)").matches
    );
  });

  const images = useMemo(
    () => objects.filter((o): o is ImageObject => o.type === "image" && !o.hidden),
    [objects]
  );

  const plan = useMemo(() => {
    const selected = images.find((img) => selectedIds.includes(img.id));
    if (selected) return selected;
    if (selectedIds.length) {
      const chosen = objects.filter((o) => selectedIds.includes(o.id));
      const host = images.find((img) => objectsOnDocument(img, chosen).length > 0);
      if (host) return host;
    }
    return images.length === 1 ? images[0] : null;
  }, [images, objects, selectedIds]);

  const rows = useMemo(() => {
    if (!plan) return [] as Row[];
    const on = objectsOnDocument(plan, objects).filter(
      (o) => !o.hidden && o.name !== "Magntafla"
    );
    const map = new Map<string, Row>();
    const bump = (key: string, label: string, group: number) => {
      const row = map.get(key);
      if (row) row.count += 1;
      else map.set(key, { key, label, count: 1, group });
    };
    for (const o of on) {
      if (o.type === "symbol") {
        bump(`sym:${o.symbolId}`, getSymbol(o.symbolId).name, 0);
        continue;
      }
      const fireName =
        o.name.startsWith("Eldveggur") ||
        o.name.startsWith("EI-veggur") ||
        o.name.startsWith("Eldhurð");
      if (fireName) {
        // Only the drawn stroke counts as the wall/door — the rect+text label
        // badges and the auto-summary sticky share the same name prefixes.
        if (o.type === "polyline") bump(`fw:${o.name}`, o.name, 1);
        continue;
      }
      if (o.name.startsWith("Eldveggir")) continue;
      const label = GENERIC_LABELS[o.type];
      if (label) bump(`t:${o.type}`, label, 2);
    }
    return [...map.values()].sort(
      (a, b) => a.group - b.group || a.label.localeCompare(b.label, "is")
    );
  }, [plan, objects]);

  const total = rows.reduce((sum, r) => sum + r.count, 0);

  if (!plan) {
    if (images.length < 2) return null;
    return (
      <div className="rounded-xl border border-white/10 bg-[#1a1d2e]/95 px-3 py-2 text-[11px] text-stone-300 shadow-2xl">
        Magntafla: veldu teikningu
      </div>
    );
  }

  const stamp = () => {
    if (!rows.length) return;
    const lines = [
      `MAGNTAFLA — ${plan.name}`,
      "".padEnd(24, "—"),
      ...rows.map((r) => `${r.count}× ${r.label}`),
      "".padEnd(24, "—"),
      `Samtals: ${total}`,
    ];
    useBoardStore.getState().addObjects(
      [
        {
          id: newId(),
          type: "text",
          x: plan.x + plan.width + 48,
          y: plan.y + 190,
          text: lines.join("\n"),
          fontSize: 15,
          fill: "#1c1917",
          width: 320,
          fontStyle: "normal",
          align: "left",
          rotation: 0,
          opacity: 1,
          locked: false,
          hidden: false,
          name: "Magntafla",
          parentId: plan.id,
        },
      ],
      true
    );
    toast.success("Magntafla sett á borðið — fylgir teikningunni og fer með í útflutning");
  };

  return (
    <div className="w-44 rounded-xl border border-white/10 bg-[#1a1d2e]/95 text-stone-100 shadow-2xl lg:w-[224px]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-9 w-full items-center justify-between px-3 py-2"
        title={open ? "Fella saman" : "Opna magntöflu"}
      >
        <span className="text-[11px] font-semibold tracking-wide">MAGNTAFLA</span>
        <span className="text-[11px] text-white/50">{open ? "−" : `· ${total}`}</span>
      </button>
      {open ? (
        <div className="px-3 pb-2.5">
          <div className="mb-1.5 truncate text-[10px] text-white/45" title={plan.name}>
            {plan.name}
          </div>
          {rows.length ? (
            <div className="max-h-[38vh] overflow-y-auto lg:max-h-[50vh]">
              <table className="w-full border-collapse text-[11px]">
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key} className="border-b border-white/5 last:border-0">
                      <td className="py-0.5 pr-2">{r.label}</td>
                      <td className="py-0.5 text-right font-semibold tabular-nums">{r.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-[11px] text-white/40">Ekkert á teikningunni enn</div>
          )}
          {rows.length ? (
            <>
              <div className="mt-1.5 flex items-center justify-between border-t border-white/15 pt-1.5 text-[11px] font-semibold">
                <span>Samtals</span>
                <span className="tabular-nums">{total}</span>
              </div>
              <button
                type="button"
                onClick={stamp}
                className="mt-2 w-full rounded-lg bg-white/10 px-2 py-1.5 text-[11px] text-stone-200 hover:bg-white/15"
                title="Setur töfluna sem texta við hlið teikningarinnar — fylgir henni og fer með í PDF/PNG útflutning"
              >
                ＋ Setja á borðið
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
