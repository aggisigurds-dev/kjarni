"use client";

/* Táknastjóri — Agnar 2026-08-29:
 * „Mætti hafa þarna hjá merkjunum að maður geti opnað glugga og séð merkin í
 *  lista, breytt myndunum, fit to frame, hakað við hvort þau eiga að sjást eða
 *  ekki."
 *
 * Táknaslána var lárétt skrunsvæði með 25 táknum — ekkert yfirlit og engin leið
 * til að velja hvað sæist. Hér er listinn í heild, með sýnileika-haki, eigin
 * mynd og fit-vali per tákn.
 *
 * Stillingarnar eru SAMEIGINLEGAR öllum borðum (svar Agnars, spurt beint) og
 * berast milli tækja — sjá lib/board/symbol-settings.ts.
 */

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import {
  getSymbolSettings,
  resetAllSymbolOverrides,
  resetSymbolOverride,
  setSymbolOverride,
  subscribeSymbolSettings,
  uploadSymbolImage,
  type SymbolFit,
} from "../../lib/board/symbol-settings";
import { SAFETY_SYMBOLS, SYMBOL_CATEGORIES, symbolColors } from "../../lib/board/symbols";

/** Endurteiknar þegar stillingarnar breytast, hvaðan sem breytingin kom. */
function useSymbolSettings() {
  const [, bump] = useState(0);
  useEffect(() => subscribeSymbolSettings(() => bump((n) => n + 1)), []);
  return getSymbolSettings();
}

export function SymbolManager({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const settings = useSymbolSettings();
  const [busy, setBusy] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const shown = SAFETY_SYMBOLS.filter((s) => !settings.overrides[s.id]?.hidden).length;

  async function pickImage(id: string, file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Þetta er ekki mynd");
      return;
    }
    // 4 MB er ríflegt fyrir tákn og heldur skjalinu léttu á síma.
    if (file.size > 4 * 1024 * 1024) {
      toast.error("Myndin er stærri en 4 MB — veldu minni");
      return;
    }
    setBusy(id);
    try {
      const url = await uploadSymbolImage(id, file);
      await setSymbolOverride(id, { imageUrl: url, fit: settings.overrides[id]?.fit ?? "contain" });
      toast.success("Myndin vistuð — hún gildir á öllum borðum");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Tókst ekki að vista myndina");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-hidden border-stone-200 bg-white p-0 text-stone-900">
        <DialogHeader className="border-b border-stone-200 px-5 py-4">
          <DialogTitle className="text-base font-semibold text-stone-900">
            Táknin — {shown} af {SAFETY_SYMBOLS.length} sýnileg í slánni
          </DialogTitle>
          <p className="mt-1 text-[12.5px] text-stone-500">
            Stillingarnar gilda á öllum borðum og fylgja þér milli tækja. Að fela tákn tekur það
            aðeins úr slánni — tákn sem þegar eru komin á borð hverfa ekki.
          </p>
        </DialogHeader>

        <div className="max-h-[62vh] overflow-y-auto px-5 py-3">
          {SYMBOL_CATEGORIES.map((cat) => {
            const rows = SAFETY_SYMBOLS.filter((s) => s.category === cat.id);
            if (!rows.length) return null;
            return (
              <section key={cat.id} className="mb-4">
                <h3 className="mb-1.5 text-[11px] font-bold tracking-wide text-stone-400 uppercase">
                  {cat.label}
                </h3>
                <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200">
                  {rows.map((s) => {
                    const ov = settings.overrides[s.id] ?? {};
                    const c = symbolColors(s.kind);
                    const custom = !!ov.imageUrl;
                    return (
                      <li key={s.id} className="flex items-center gap-3 px-3 py-2">
                        <input
                          type="checkbox"
                          className="size-4 shrink-0 accent-stone-900"
                          checked={!ov.hidden}
                          title={ov.hidden ? "Sýna í slánni" : "Fela úr slánni"}
                          aria-label={`Sýna ${s.name} í slánni`}
                          onChange={(e) =>
                            void setSymbolOverride(s.id, { hidden: !e.target.checked })
                          }
                        />
                        <span
                          className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md text-[9px] font-bold"
                          style={custom ? undefined : { background: c.bg, color: c.fg }}
                        >
                          {custom ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={ov.imageUrl}
                              alt=""
                              className="size-full"
                              style={{ objectFit: ov.fit === "cover" ? "cover" : "contain" }}
                            />
                          ) : (
                            s.short.slice(0, 3)
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] font-medium">{s.name}</span>
                          <span className="block truncate text-[11px] text-stone-400">
                            {s.short}
                            {custom ? " · eigin mynd" : ""}
                            {ov.hidden ? " · falið" : ""}
                          </span>
                        </span>

                        {custom ? (
                          <select
                            value={ov.fit ?? "contain"}
                            onChange={(e) =>
                              void setSymbolOverride(s.id, { fit: e.target.value as SymbolFit })
                            }
                            className="rounded-md border border-stone-200 bg-white px-1.5 py-1 text-[11px]"
                            title="Hvernig myndin fyllir reitinn"
                          >
                            <option value="contain">Öll myndin</option>
                            <option value="cover">Fylla reitinn</option>
                          </select>
                        ) : null}

                        <input
                          ref={(el) => {
                            fileRefs.current[s.id] = el;
                          }}
                          type="file"
                          accept="image/*"
                          hidden
                          onChange={(e) => {
                            void pickImage(s.id, e.target.files?.[0]);
                            e.target.value = "";
                          }}
                        />
                        <button
                          type="button"
                          disabled={busy === s.id}
                          onClick={() => fileRefs.current[s.id]?.click()}
                          className="rounded-md border border-stone-200 px-2 py-1 text-[11px] font-medium hover:bg-stone-50 disabled:opacity-50"
                        >
                          {busy === s.id ? "Vista…" : custom ? "Skipta" : "Mynd"}
                        </button>
                        {custom ? (
                          <button
                            type="button"
                            onClick={() => void resetSymbolOverride(s.id)}
                            title="Aftur í innbyggðu teikninguna"
                            className="rounded-md px-1.5 py-1 text-[11px] text-stone-400 hover:text-stone-900"
                          >
                            ↺
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t border-stone-200 px-5 py-3">
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Setja ÖLL tákn í upprunalegt horf? Eigin myndir og felun hverfa.")) {
                void resetAllSymbolOverrides();
              }
            }}
            className="text-[12px] text-stone-500 hover:text-stone-900"
          >
            Endurstilla allt
          </button>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg bg-stone-900 px-4 py-1.5 text-[12.5px] font-semibold text-white"
          >
            Loka
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
