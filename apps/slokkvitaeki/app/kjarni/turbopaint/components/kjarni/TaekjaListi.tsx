"use client";

// Tæki staðarins (2. áfangi, Agnar 06.10.2026): tækjalisti úttektarinnar í hliðarspjaldinu. Smelltu á tæki og svo á
// teikninguna (eða dragðu röðina á teikninguna) — tækið fær tengt tákn; sé það þegar á hæðinni færist það. „Merki"
// setur stimpla Teikning-gluggans (NÚ, ÚT, SL, RAF, skilti …) sem vistast þangað. Ekkert skrifast fyrr en „Vista í úttekt".

import { useEffect, useMemo, useState } from "react";
import { useHamur } from "../../lib/board/hamir";
import { TAEKI_DRAG_TYPE } from "../../lib/board/markup-kit";
import { useBoardStore } from "../../lib/board/store";
import {
  flokkaTaekjalista,
  merkiTexti,
  siaTaekjalista,
  stadaTaekisTexti,
  taekjaListi,
  type TaekiILista,
} from "../../lib/board/taekjalisti";
import { byggjaStodurMargar, finnaTengduMynd, myndirTengdar, myndUndir, TEIKNING_STIMPLAR, vorpunMyndar } from "../../lib/board/uttekt";
import { afvopna, useTaekjaVal, useUttektGogn, vopna, type TaekjaVal } from "../../lib/board/uttekt-gogn";
import { MerkiTakn } from "./MerkiTakn";
import { StaerdAllraMerkja } from "./StaerdAllra";

const MERKI_LITUR: Record<TaekiILista["stada"], string> = {
  her: "bg-emerald-500/15 text-emerald-300",
  onnur: "bg-amber-500/15 text-amber-300",
  ekki: "bg-white/6 text-stone-400",
};

export function TaekjaListi({ onFocusObject }: { onFocusObject?: (id: string) => void }) {
  const objects = useBoardStore((s) => s.objects);
  const selectedIds = useBoardStore((s) => s.selectedIds);
  const hamur = useHamur((s) => s.hamur);
  // Margar hæðir á borðinu („Croppa oft"): listinn miðast við hæð valinnar myndar (eða myndarinnar sem valið tákn
  // stendur á), annars fyrstu tengdu myndina.
  const mynd = useMemo(() => {
    const valid = objects.find((o) => selectedIds.includes(o.id));
    if (valid?.type === "image" && valid.uttekt) return valid;
    if (valid?.type === "symbol") {
      const m = myndUndir(objects, { x: valid.x + valid.size / 2, y: valid.y + valid.size / 2 });
      if (m) return m;
    }
    return finnaTengduMynd(objects);
  }, [objects, selectedIds]);
  const hlutiCid = useMemo(() => {
    const h = objects.find((o) => o.type === "image" && o.bladhluti?.companyId);
    return h && h.type === "image" ? h.bladhluti?.companyId ?? null : null;
  }, [objects]);
  const t = mynd?.uttekt ?? (hlutiCid ? { companyId: hlutiCid, haedId: "" } : null);
  const gogn = useUttektGogn((s) => s.gogn);
  const hledur = useUttektGogn((s) => s.hledur);
  const villa = useUttektGogn((s) => s.villa);
  const val = useTaekjaVal((s) => s.val);
  const [leit, setLeit] = useState("");
  const [adeinsOstadsett, setAdeinsOstadsett] = useState(false);
  // Opið í Slökkvitækjaham, samanbrotið í Teikning-ham (þar er unnið í veggjunum) — notandinn ræður eftir það.
  const [opidVal, setOpidVal] = useState<boolean | null>(null);
  const opid = opidVal ?? hamur === "slokkvitaeki";

  const cid = t?.companyId;
  const rettGogn = gogn && cid && gogn.companyId === cid ? gogn : null;
  useEffect(() => {
    if (cid && (!gogn || gogn.companyId !== cid) && hledur !== cid && !villa) void useUttektGogn.getState().hlada(cid);
  }, [cid, gogn, hledur, villa]);

  const listi = useMemo(
    () => (rettGogn && t ? taekjaListi(rettGogn.taeki, objects, rettGogn.haedir, t.haedId) : []),
    [rettGogn, objects, t]
  );
  const hopar = useMemo(() => flokkaTaekjalista(siaTaekjalista(listi, leit, adeinsOstadsett)), [listi, leit, adeinsOstadsett]);
  const otengd = useMemo(() => {
    const lidir = myndirTengdar(objects).flatMap((m) => {
      const v = vorpunMyndar(m);
      return v ? [{ mynd: m, frum: v.frum, svaedi: v.svaedi }] : [];
    });
    return byggjaStodurMargar(objects, lidir, () => "s:x:0").hlutar.reduce((s, h) => s + h.otengd, 0);
  }, [objects]);

  if (!t) return null;
  const her = listi.filter((x) => x.stada === "her").length;
  const onnur = listi.filter((x) => x.stada === "onnur").length;
  const ekki = listi.length - her - onnur;

  const veljaVal = (v: TaekjaVal, erValid: boolean) => {
    if (erValid) {
      afvopna();
      useBoardStore.getState().setTool("select");
      return;
    }
    vopna(v);
  };
  const erTaekiValid = (x: TaekiILista) => val?.teg === "taeki" && String(val.unitId) === x.key;

  return (
    <section className="mb-4 rounded-md bg-white/4" aria-label="Tæki staðarins">
      <button
        type="button"
        onClick={() => setOpidVal(!opid)}
        className="flex w-full items-center justify-between px-2 py-1.5 text-left"
        aria-expanded={opid}
      >
        <span className="text-[11px] font-medium tracking-[0.12em] text-[#FE653F]">
          TÆKI STAÐARINS{rettGogn ? ` · ${listi.length}` : ""}
        </span>
        <span className="text-[11px] text-stone-500">{opid ? "−" : "+"}</span>
      </button>
      {opid ? (
        <div className="space-y-2 px-2 pb-2">
          {mynd?.uttekt ? <StaerdAllraMerkja myndId={mynd.id} /> : null}
          {rettGogn ? (
            <div className="text-[10.5px] leading-snug text-stone-400">
              {her} á teikningu · {onnur} á öðrum hæðum · {ekki} óstaðsett
            </div>
          ) : null}
          {val ? (
            <div role="status" className="rounded border border-amber-400/40 bg-amber-400/10 px-2 py-1 text-[11px] leading-snug text-amber-200">
              Smelltu á teikninguna þar sem {val.teg === "taeki" ? "tækið" : "merkið"} á að vera — Esc hættir.
            </div>
          ) : null}
          {villa && !rettGogn ? (
            <div className="space-y-1 text-[11px] text-red-300">
              <div>{villa}</div>
              <button
                type="button"
                className="rounded bg-white/10 px-2 py-0.5 text-stone-200 hover:bg-white/15"
                onClick={() => {
                  useUttektGogn.setState({ villa: null });
                  if (cid) void useUttektGogn.getState().hlada(cid);
                }}
              >
                Reyna aftur
              </button>
            </div>
          ) : !rettGogn ? (
            <div className="text-[11px] text-stone-500">Sæki tækjalistann…</div>
          ) : (
            <>
              <input
                type="search"
                value={leit}
                onChange={(e) => setLeit(e.target.value)}
                placeholder="Sía: raðnúmer, tegund …"
                aria-label="Sía tækjalistann"
                className="h-7 w-full rounded border border-white/10 bg-white/5 px-2 text-[11.5px] text-stone-100 outline-none placeholder:text-stone-500 focus:border-white/25"
              />
              <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-stone-400">
                <input type="checkbox" checked={adeinsOstadsett} onChange={(e) => setAdeinsOstadsett(e.target.checked)} />
                Sýna aðeins óstaðsett
              </label>
              {!listi.length ? <div className="text-[11px] text-stone-500">Engin tæki skráð á staðinn.</div> : null}
              {listi.length && !hopar.length ? <div className="text-[11px] text-stone-500">Ekkert passar við síuna.</div> : null}
              <div className="space-y-1.5">
                {hopar.map((h) => (
                  <div key={h.heiti}>
                    <div className="px-0.5 pb-0.5 text-[10.5px] font-semibold tracking-wide text-stone-400">
                      {h.heiti} <span className="font-normal text-stone-600">{h.taeki.length}</span>
                    </div>
                    <ul className="space-y-px">
                      {h.taeki.map((x) => {
                        const valid = erTaekiValid(x);
                        const aBordiValid = !!x.taknId && selectedIds.includes(x.taknId);
                        return (
                          <li key={x.key}>
                            <button
                              type="button"
                              draggable
                              data-taeki={x.key}
                              aria-pressed={valid}
                              title={`${x.taeki.type || "Tæki"} · ${x.taeki.serial || "#" + x.taeki.id} — smelltu og svo á teikninguna, eða dragðu`}
                              onDragStart={(e) => {
                                e.dataTransfer.setData(
                                  TAEKI_DRAG_TYPE,
                                  JSON.stringify({ teg: "taeki", unitId: x.taeki.id, symbolId: x.symbolId } satisfies TaekjaVal)
                                );
                                e.dataTransfer.effectAllowed = "copy";
                              }}
                              onClick={() => {
                                veljaVal({ teg: "taeki", unitId: x.taeki.id, symbolId: x.symbolId }, valid);
                                if (!valid && x.taknId) onFocusObject?.(x.taknId);
                              }}
                              className={`flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[11.5px] ${
                                valid
                                  ? "bg-amber-400/15 ring-1 ring-amber-400/60"
                                  : aBordiValid
                                    ? "bg-white/10"
                                    : "hover:bg-white/6"
                              } ${x.urelt ? "opacity-55" : ""}`}
                            >
                              <MerkiTakn symbolId={x.symbolId} size={20} />
                              <span className="min-w-0 flex-1 truncate">
                                <span className="font-mono text-[11px] text-stone-100">{x.stuttNr}</span>
                                <span className="pl-1.5 text-[10px] text-stone-500">{stadaTaekisTexti(x.taeki.status)}</span>
                              </span>
                              <span className={`shrink-0 rounded px-1 py-px text-[9.5px] ${MERKI_LITUR[x.stada]}`}>{merkiTexti(x)}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="border-t border-white/8 pt-2">
            <div className="pb-1 text-[10.5px] font-semibold tracking-wide text-stone-400">Merki (Teikning)</div>
            <div className="space-y-px">
              {TEIKNING_STIMPLAR.map((s) => {
                const valid = val?.teg === "stimpill" && val.sign === s.id;
                const v: TaekjaVal = { teg: "stimpill", sign: s.id, symbolId: s.symbolId };
                return (
                  <button
                    key={s.id}
                    type="button"
                    draggable
                    data-stimpill={s.id}
                    aria-pressed={valid}
                    title={`${s.nafn} — smelltu og svo á teikninguna, eða dragðu`}
                    onDragStart={(e) => {
                      e.dataTransfer.setData(TAEKI_DRAG_TYPE, JSON.stringify(v));
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    onClick={() => veljaVal(v, valid)}
                    className={`flex w-full items-center gap-1.5 rounded px-1.5 py-0.5 text-left text-[11px] text-stone-300 ${
                      valid ? "bg-amber-400/15 ring-1 ring-amber-400/60" : "hover:bg-white/6"
                    }`}
                  >
                    <MerkiTakn symbolId={s.symbolId} size={20} />
                    <span className="min-w-0 truncate">{s.nafn}</span>
                  </button>
                );
              })}
            </div>
          </div>
          {otengd ? (
            <div className="text-[10.5px] leading-snug text-amber-300/90">
              {otengd} tákn án tengingar vistast ekki í úttekt
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
