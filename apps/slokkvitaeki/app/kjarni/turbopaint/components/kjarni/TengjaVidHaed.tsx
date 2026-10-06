"use client";

// „Tengja við hæð" (Agnar 06.10.2026): hluti úr „Croppa oft" fær sína hæð — hæðir staðarins úr úttektinni (1. hæð,
// 2. hæð …) eða „+ Ný hæð". Ein hæð á hverjum hluta; sé hæðin þegar á öðrum hluta er spurt hvort skipta eigi. Ekkert
// skrifast fyrr en „Vista í úttekt".

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { afleidingTengingar, haedirTilTengingar, merkiMyndar, tengjaVidHaed } from "../../lib/board/margar-haedir";
import { useBoardStore } from "../../lib/board/store";
import { getStampSize } from "../../lib/board/symbol-settings";
import type { ImageObject } from "../../lib/board/types";
import { bladIBordi, nyttHaedId, stimpilStaerdABladi, tillagaHaedarNafns } from "../../lib/board/uttekt";
import { useUttektGogn } from "../../lib/board/uttekt-gogn";

export function TengjaVidHaed({ mynd }: { mynd: ImageObject }) {
  const objects = useBoardStore((s) => s.objects);
  const gogn = useUttektGogn((s) => s.gogn);
  const hledur = useUttektGogn((s) => s.hledur);
  const villa = useUttektGogn((s) => s.villa);
  const [opid, setOpid] = useState(false);
  const [nyttNafn, setNyttNafn] = useState<string | null>(null);
  const bh = mynd.bladhluti;
  const cid = mynd.uttekt?.companyId ?? bh?.companyId ?? null;
  const rett = gogn && cid && gogn.companyId === cid ? gogn : null;
  useEffect(() => {
    if (cid && !rett && hledur !== cid && !villa) void useUttektGogn.getState().hlada(cid);
  }, [cid, rett, hledur, villa]);
  const kostir = useMemo(() => (rett && cid ? haedirTilTengingar(objects, rett.haedir, cid) : []), [rett, objects, cid]);
  if (!bh) return null;
  const merki = merkiMyndar(mynd, rett?.haedir);
  const nrMyndar = (id: string | null) => {
    const m = objects.find((o) => o.id === id);
    return m && m.type === "image" ? m.bladhluti?.nr ?? null : null;
  };

  const tengja = (haedId: string, nafnNyrrar?: string) => {
    const st = useBoardStore.getState();
    const haedir = rett?.haedir ?? [];
    const nafn = nafnNyrrar ?? kostir.find((k) => k.id === haedId)?.nafn ?? "hæðin";
    const af = afleidingTengingar(st.objects, mynd, haedId, haedir);
    if (af.onnurMynd) {
      const nr = af.onnurMynd.bladhluti?.nr;
      if (!window.confirm(`„${nafn}“ er þegar tengd ${nr ? `hluta ${nr}` : "annarri mynd"} — tengja hana þessum hluta í staðinn?`)) return;
    }
    if (af.annadBlad) {
      const texti =
        `„${nafn}“ er á annarri teikningu. Við vistun færist hæðin á þetta blað: skurður og veggir gömlu teikningarinnar ` +
        `falla út (eins og í Teikning-glugganum)` +
        (af.merkiAnnarsBlads ? ` og ${af.merkiAnnarsBlads} merki hennar haldast í hnitum gömlu teikningarinnar` : "") +
        ". Tengja samt?";
      if (!window.confirm(texti)) return;
    }
    try {
      const frum = { b: bh.frumB, h: bh.frumH };
      const staerd = stimpilStaerdABladi(bladIBordi(mynd, frum, bh.svaedi), getStampSize(), bh.svaedi, frum);
      const r = tengjaVidHaed(st.objects, mynd.id, { haedId, nyttNafn: nafnNyrrar }, haedir, { taeki: rett?.taeki, staerd });
      if (r.objects === st.objects) {
        setOpid(false);
        return;
      }
      st.commitHistory();
      useBoardStore.setState({ objects: r.objects });
      setOpid(false);
      setNyttNafn(null);
      toast.success(
        `Hluti ${bh.nr} tengdur „${nafn}“` +
          (r.vikid ? ` (hluti ${nrMyndar(r.vikid) ?? "?"} er nú ótengdur)` : "") +
          (r.sett ? ` · ${r.sett} merki hæðarinnar sett á hlutann` : "") +
          (r.veggir ? ` · ${r.veggir} veggir` : "") +
          ". Vistast með „Vista í úttekt“."
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Tenging mistókst");
    }
  };

  return (
    <section aria-label="Tengja við hæð" className="space-y-1.5 rounded-md border border-[#FE653F]/30 bg-[#FE653F]/6 p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium tracking-[0.12em] text-[#FE653F]">HLUTI {bh.nr}</span>
        <span data-haed-merki className={`truncate rounded px-1.5 py-0.5 text-[11px] font-semibold ${mynd.uttekt ? "bg-[#FE653F] text-white" : "bg-white/10 text-stone-300"}`}>
          {merki}
        </span>
      </div>
      <button
        type="button"
        aria-expanded={opid}
        onClick={() => setOpid(!opid)}
        className="w-full rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-left text-[12px] font-semibold text-stone-100 hover:bg-white/10"
      >
        🏢 Tengja við hæð {opid ? "▴" : "▾"}
      </button>
      {opid ? (
        <div role="menu" className="space-y-1">
          {!cid ? (
            <div className="text-[11px] text-stone-400">Staðurinn er óþekktur — opnaðu teikninguna úr úttekt staðarins fyrst.</div>
          ) : !rett ? (
            <div className="text-[11px] text-stone-400">{villa || "Sæki hæðir staðarins…"}</div>
          ) : (
            <>
              {kostir.map((k) => {
                const her = k.myndId === mynd.id;
                const annars = k.myndId && !her ? nrMyndar(k.myndId) : null;
                return (
                  <button
                    key={k.id}
                    type="button"
                    role="menuitem"
                    data-haed={k.id}
                    onClick={() => tengja(k.id)}
                    className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-[12px] ${her ? "bg-[#FE653F] text-white" : "bg-white/5 text-stone-100 hover:bg-white/12"}`}
                  >
                    <span className="truncate">
                      {k.nafn}
                      {k.ny ? " (ný)" : ""}
                    </span>
                    <span className="shrink-0 text-[10.5px] opacity-80">
                      {her ? "✓ þessi hluti" : annars ? `á hluta ${annars}` : k.myndId ? "á borðinu" : k.markers ? `${k.markers} merki` : ""}
                    </span>
                  </button>
                );
              })}
              {nyttNafn == null ? (
                <button
                  type="button"
                  role="menuitem"
                  data-haed="ny"
                  onClick={() => setNyttNafn(tillagaHaedarNafns(kostir.map((k) => k.nafn)))}
                  className="w-full rounded px-2 py-1 text-left text-[12px] text-emerald-300 hover:bg-white/10"
                >
                  + Ný hæð
                </button>
              ) : (
                <form
                  className="flex gap-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const n = nyttNafn.trim();
                    if (!n) return;
                    if (kostir.some((k) => k.nafn.toLowerCase() === n.toLowerCase())) {
                      toast.error(`„${n}“ er þegar til — veldu hana í listanum eða annað nafn`);
                      return;
                    }
                    tengja(nyttHaedId(), n);
                  }}
                >
                  <input
                    aria-label="Nafn nýrrar hæðar"
                    autoFocus
                    value={nyttNafn}
                    onChange={(e) => setNyttNafn(e.target.value)}
                    className="h-7 min-w-0 flex-1 rounded border border-white/15 bg-white/5 px-1.5 text-[12px] text-stone-100"
                  />
                  <button type="submit" className="rounded bg-emerald-600 px-2 text-[12px] font-semibold text-white hover:bg-emerald-500">
                    Stofna
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
