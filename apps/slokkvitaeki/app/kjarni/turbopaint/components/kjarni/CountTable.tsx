"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { formatM2, objectsOnDocument } from "../../lib/board/geometry";
import { newId } from "../../lib/board/ids";
import { LAYER_ALMENNT } from "../../lib/board/layers";
import { useBoardStore } from "../../lib/board/store";
import { NOTKUNARFLOKKAR, greinaTharfir, type Notkunarflokkur } from "../../lib/board/krofur";
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
  const pixelsPerMeter = useBoardStore((s) => s.pixelsPerMeter);
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
      if (o.name.startsWith("Gegnumtak")) continue;
      // 🏠 rými eiga sinn eigin RÝMI-kafla — ekki telja þau sem "Ferningar"
      if (o.type === "rect" && o.isRoom) continue;
      const label = GENERIC_LABELS[o.type];
      if (label) bump(`t:${o.type}`, label, 2);
    }
    return [...map.values()].sort(
      (a, b) => a.group - b.group || a.label.localeCompare(b.label, "is")
    );
  }, [plan, objects]);

  // Samtalan er BÚNAÐARTALA (tákn + eldveggir/-hurðir, hópar 0–1) — form,
  // textar og minnismiðar eru vinnugögn og standa sér undir „Annað".
  const equipmentRows = rows.filter((r) => r.group < 2);
  const otherRows = rows.filter((r) => r.group === 2);
  const total = equipmentRows.reduce((sum, r) => sum + r.count, 0);

  // Fermetrarnir: 🏠 rými fara í RÝMI-listann (hak = telst í nettó);
  // gegnsæir ferningar án rýmis-merkingar teljast beint (eldra lagið);
  // "Frádráttur…" dregst frá hvoru tveggja. Nettó = hakað; brúttó = öll rými.
  const { rooms, netM2, grossM2, uncalibratedRooms } = useMemo(() => {
    const empty = { rooms: [] as { id: string; name: string; m2: number; excluded: boolean }[], netM2: 0, grossM2: 0, uncalibratedRooms: false };
    if (!plan) return empty;
    const rects = objectsOnDocument(plan, objects).filter(
      (o): o is Extract<typeof o, { type: "rect" }> => o.type === "rect" && !o.hidden
    );
    if (!pixelsPerMeter || pixelsPerMeter <= 0) {
      return { ...empty, uncalibratedRooms: rects.some((r) => r.isRoom) };
    }
    const area = (r: { width: number; height: number }) =>
      (r.width / pixelsPerMeter) * (r.height / pixelsPerMeter);
    const roomRects = rects.filter((r) => r.isRoom);
    const seen = new Map<string, number>();
    const roomList = roomRects.map((r) => {
      const base = r.name && r.name !== "Ferningur" ? r.name : "Rými";
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      const dup = roomRects.filter((x) => (x.name && x.name !== "Ferningur" ? x.name : "Rými") === base).length > 1;
      return { id: r.id, name: dup ? `${base} ${n}` : base, m2: area(r), excluded: !!r.roomExcluded };
    });
    let net = roomList.reduce((s, r) => s + (r.excluded ? 0 : r.m2), 0);
    let gross = roomList.reduce((s, r) => s + r.m2, 0);
    for (const r of rects) {
      if (r.isRoom || r.fill !== "transparent") continue;
      const a = area(r);
      if (r.name.startsWith("Frádráttur")) {
        net -= a;
        gross -= a;
      } else {
        net += a;
        gross += a;
      }
    }
    return { rooms: roomList, netM2: net, grossM2: gross, uncalibratedRooms: false };
  }, [plan, objects, pixelsPerMeter]);
  const areaM2 = netM2;

  /* ÞARFAGREINING — hvað þarf húsnæðið (Agnar 28.08). Telur búnaðinn sem er á
   * borðinu og ber saman við reglukröfuna; sjá lib/board/krofur.ts. */
  const [flokkur, setFlokkur] = useState<Notkunarflokkur>(1);
  const tharfir = useMemo(() => {
    if (!plan) return null;
    const on = objectsOnDocument(plan, objects).filter((o) => !o.hidden);
    const telja = (...ids: string[]) =>
      on.filter((o) => o.type === "symbol" && ids.includes(o.symbolId)).length;
    const kefli = telja("hose");
    return greinaTharfir({
      m2: netM2 || grossM2,
      flokkur,
      // Kefli eða úðakerfi á hæðinni helmingar slökkviþörfina (165.BR1).
      keflaEdaUdakerfi: kefli > 0 || telja("sprinkler") > 0,
      komid: {
        slokkvitaeki: telja("extinguisher"),
        kefli,
        skiltiSlokkvitaekis: telja("sign-extinguisher"),
        skiltiKeflis: telja("sign-hose"),
        flottaskilti: telja("route", "e-light"),
        utgangar: telja("exit"),
        reykskynjarar: telja("detector"),
      },
    });
  }, [plan, objects, netM2, grossM2, flokkur]);


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
      ...equipmentRows.map((r) => `${r.count}× ${r.label}`),
      "".padEnd(24, "—"),
      `Samtals búnaður: ${total}`,
      ...(rooms.length
        ? [
            "",
            "RÝMI:",
            ...rooms.map((r) => `${r.excluded ? "✗" : "✓"} ${r.name}: ${formatM2(r.m2)}${r.excluded ? " (frátalið)" : ""}`),
          ]
        : []),
      ...(areaM2 !== 0 || rooms.length
        ? Math.abs(grossM2 - netM2) > 0.05
          ? [`Nýtanlegt (nettó): ${formatM2(netM2)}`, `Brúttó (öll rými): ${formatM2(grossM2)}`]
          : [`Nýtanlegt flatarmál: ${formatM2(netM2)}`]
        : []),
      ...(otherRows.length
        ? ["", "Annað:", ...otherRows.map((r) => `${r.count}× ${r.label}`)]
        : []),
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
          layerId: LAYER_ALMENNT,
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
                  {equipmentRows.map((r) => (
                    <tr key={r.key} className="border-b border-white/5 last:border-0">
                      <td className="py-0.5 pr-2">{r.label}</td>
                      <td className="py-0.5 text-right font-semibold tabular-nums">{r.count}</td>
                    </tr>
                  ))}
                  {otherRows.length ? (
                    <tr>
                      <td colSpan={2} className="pb-0.5 pt-1.5 text-[10px] font-medium tracking-wide text-white/35">
                        ANNAÐ Á TEIKNINGUNNI
                      </td>
                    </tr>
                  ) : null}
                  {otherRows.map((r) => (
                    <tr key={r.key} className="border-b border-white/5 text-white/55 last:border-0">
                      <td className="py-0.5 pr-2">{r.label}</td>
                      <td className="py-0.5 text-right tabular-nums">{r.count}</td>
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
                <span>Samtals búnaður</span>
                <span className="tabular-nums">{total}</span>
              </div>
              {rooms.length ? (
                <div className="mt-1.5 border-t border-white/15 pt-1">
                  <div className="pb-0.5 text-[10px] font-medium tracking-wide text-white/35">
                    RÝMI — hak = telst í nettó
                  </div>
                  {rooms.map((r) => (
                    <label
                      key={r.id}
                      className={`flex cursor-pointer items-center gap-1.5 py-0.5 text-[11px] ${r.excluded ? "text-white/40" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={!r.excluded}
                        onChange={() =>
                          useBoardStore.getState().patchObject(r.id, { roomExcluded: !r.excluded } as never)
                        }
                      />
                      <span className="min-w-0 flex-1 truncate">{r.name}</span>
                      <span className="tabular-nums">{formatM2(r.m2)}</span>
                    </label>
                  ))}
                </div>
              ) : null}
              {uncalibratedRooms ? (
                <div className="pt-1 text-[10px] text-amber-300">Rými á borðinu — kvarðaðu fyrst (K)</div>
              ) : null}
              {areaM2 !== 0 || rooms.length ? (
                <div className="flex items-center justify-between pt-1 text-[11px] font-semibold text-emerald-300">
                  <span>{Math.abs(grossM2 - netM2) > 0.05 ? "Nýtanlegt (nettó)" : "Nýtanlegt flatarmál"}</span>
                  <span className="tabular-nums">{formatM2(netM2)}</span>
                </div>
              ) : null}
              {Math.abs(grossM2 - netM2) > 0.05 ? (
                <div className="flex items-center justify-between text-[11px] text-white/55">
                  <span>Brúttó (öll rými)</span>
                  <span className="tabular-nums">{formatM2(grossM2)}</span>
                </div>
              ) : null}
              {tharfir && (netM2 || grossM2) > 0 ? (
                <div className="mt-2 border-t border-white/15 pt-1.5">
                  <div className="flex items-center justify-between pb-1">
                    <span className="text-[10px] font-medium tracking-wide text-white/35">
                      ÞARFAGREINING
                    </span>
                    <select
                      value={flokkur}
                      onChange={(e) => setFlokkur(Number(e.target.value) as Notkunarflokkur)}
                      className="rounded bg-white/10 px-1 py-0.5 text-[10px] text-stone-200 outline-none"
                      title="Notkunarflokkur ræður kröfunni — verslun/skrifstofa 1–2, íbúðir 3, gisting 4+"
                    >
                      {NOTKUNARFLOKKAR.map((f) => (
                        <option key={f.gildi} value={f.gildi} className="text-stone-900">
                          {f.heiti}
                        </option>
                      ))}
                    </select>
                  </div>
                  {tharfir.krofur.map((k) => (
                    <div
                      key={k.bunadur}
                      className="flex items-start justify-between gap-2 py-0.5 text-[11px]"
                      title={`${k.rokstudningur}

Heimild: ${k.heimild}`}
                    >
                      <span className="min-w-0 flex-1 truncate text-white/70">{k.bunadur}</span>
                      <span className="shrink-0 tabular-nums text-white/45">
                        {k.komid}/{k.þarf ?? "—"}
                      </span>
                      <span
                        className={`shrink-0 text-[10px] font-semibold ${
                          k.stada === "í lagi"
                            ? "text-emerald-400"
                            : k.stada === "vantar"
                              ? "text-red-400"
                              : "text-amber-400"
                        }`}
                      >
                        {k.stada === "í lagi" ? "✓" : k.stada === "vantar" ? "vantar" : "?"}
                      </span>
                    </div>
                  ))}
                  <div className="pt-1 text-[10px] leading-snug text-white/35">
                    Slökkvigildi ≥ {tharfir.slokkvigildi}A á {formatM2(tharfir.m2)}. Leiðbeinandi —
                    endanlegt samþykki er hjá hönnuði og slökkviliði.
                  </div>
                </div>
              ) : null}

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
