"use client";

// „Staður og hæð" (Agnar 17.11.2026): „Geturðu bara bætt við override, að ég geti þá bara flett upp fyrirtækjum eða
// heimilisföngum sem eru í kerfinu, og valið hæð til að setja inn eða setja inn sem nýja hæð … hefur svo oft verið að
// ergja mann að festast þarna." Opnast úr „Vista í úttekt"-borðanum, úr myndaspjaldinu, og sjálfkrafa þegar „Vista í
// úttekt" finnur enga tengda mynd. Hvaða mynd sem er (skorinn hluti eða heil ótengd teikning úr skjalasafni) fær stað úr
// fyrirtaeki + hæð (til eða ný). Staður án úttektarteikningar fær hana við fyrstu vistun. Ekkert skrifast hér — aðeins
// „Vista í úttekt" skrifar.

import { Building2, Check, Loader2, MapPin, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { create } from "zustand";
import {
  afleidingStadar,
  afleidingTengingar,
  haedirTilTengingar,
  hlutiUrHeilliMynd,
  merkiMyndar,
  myndirTilTengingar,
  tengjaVidStad,
} from "../../lib/board/margar-haedir";
import { grunnStaerdHaedar, STAERD_SJALF } from "../../lib/board/merkjasafn";
import { useBoardStore } from "../../lib/board/store";
import type { ImageObject } from "../../lib/board/types";
import {
  bladIBordi,
  leitaStodum,
  myndirTengdar,
  nyttHaedId,
  saekjaUttekt,
  stimpilStaerdTengingar,
  taknEiningABladi,
  tillagaHaedarNafns,
  type StadurILeit,
  type UttektHaed,
  type UttektTaeki,
} from "../../lib/board/uttekt";
import { useUttektGogn } from "../../lib/board/uttekt-gogn";

export const useStadurOgHaed = create<{
  opid: boolean;
  myndId: string | null;
  opna: (myndId?: string | null) => void;
  loka: () => void;
}>((set) => ({
  opid: false,
  myndId: null,
  opna: (myndId = null) => set({ opid: true, myndId }),
  loka: () => set({ opid: false, myndId: null }),
}));

type UttektStadar = { companyId: number; nafn: string; haedir: UttektHaed[]; taeki: UttektTaeki[]; anRadar: boolean };

/** Staður myndarinnar (tenging, blaðhluti) eða borðsins (opnuð úttekt). */
function stadurMyndar(m: ImageObject | null, gognCid: number | null): number | null {
  return m?.uttekt?.companyId ?? m?.bladhluti?.companyId ?? gognCid ?? null;
}

const FLYTILEIDIR = ["Kjallari", "1. hæð", "2. hæð", "Ris"];

export function StadurOgHaed() {
  const opid = useStadurOgHaed((s) => s.opid);
  if (!opid) return null;
  return <StadurOgHaedSpjald />;
}

function StadurOgHaedSpjald() {
  const beidd = useStadurOgHaed((s) => s.myndId);
  const loka = useStadurOgHaed((s) => s.loka);
  const objects = useBoardStore((s) => s.objects);
  const selectedIds = useBoardStore((s) => s.selectedIds);
  const gogn = useUttektGogn((s) => s.gogn);

  const myndir = useMemo(() => myndirTilTengingar(objects), [objects]);
  const [myndId, setMyndId] = useState<string | null>(() => {
    if (beidd && myndir.some((m) => m.id === beidd)) return beidd;
    const valin = myndir.find((m) => selectedIds.includes(m.id));
    return (valin ?? myndir.find((m) => !m.uttekt) ?? myndir[0])?.id ?? null;
  });
  const mynd = myndir.find((m) => m.id === myndId) ?? null;

  const [cid, setCid] = useState<number | null>(() => stadurMyndar(mynd, gogn?.companyId ?? null));
  const [uttekt, setUttekt] = useState<UttektStadar | null>(null);
  const [hledur, setHledur] = useState(false);
  const [villa, setVilla] = useState<string | null>(null);
  const [leitOpin, setLeitOpin] = useState(cid == null);
  const [q, setQ] = useState("");
  const [nidurstodur, setNidurstodur] = useState<StadurILeit[]>([]);
  const [leitar, setLeitar] = useState(false);
  const [nyttNafn, setNyttNafn] = useState<string | null>(null);

  // Hæðir og tæki valins staðar — í eigin stöðu (ekki useUttektGogn) svo tækjalistinn skipti ekki um stað fyrr en tengt er.
  useEffect(() => {
    if (cid == null) {
      setUttekt(null);
      return;
    }
    let haett = false;
    setHledur(true);
    setVilla(null);
    setNyttNafn(null);
    saekjaUttekt(cid, { leyfaTomt: true })
      .then((u) => {
        if (!haett) setUttekt({ companyId: cid, ...u });
      })
      .catch((err) => {
        if (!haett) setVilla(err instanceof Error ? err.message : "Gat ekki sótt úttekt staðarins");
      })
      .finally(() => {
        if (!haett) setHledur(false);
      });
    return () => {
      haett = true;
    };
  }, [cid]);

  // Leit (biðtími svo hver stafur sendi ekki fyrirspurn).
  useEffect(() => {
    if (!leitOpin) return;
    const s = q.trim();
    if (s.length < 2) {
      setNidurstodur([]);
      return;
    }
    let haett = false;
    const t = setTimeout(() => {
      setLeitar(true);
      leitaStodum(s)
        .then((r) => {
          if (!haett) setNidurstodur(r);
        })
        .catch((err) => {
          if (!haett) toast.error(err instanceof Error ? err.message : "Leit mistókst");
        })
        .finally(() => {
          if (!haett) setLeitar(false);
        });
    }, 250);
    return () => {
      haett = true;
      clearTimeout(t);
    };
  }, [q, leitOpin]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        loka();
      }
    };
    window.addEventListener("keydown", esc, true);
    return () => window.removeEventListener("keydown", esc, true);
  }, [loka]);

  const leitRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (leitOpin) leitRef.current?.focus();
  }, [leitOpin]);

  const rett = uttekt && uttekt.companyId === cid ? uttekt : null;
  const kostir = useMemo(() => (rett && cid != null ? haedirTilTengingar(objects, rett.haedir, cid) : []), [rett, objects, cid]);

  const tengja = (haedId: string, nafnNyrrar?: string) => {
    if (!mynd || !rett || cid == null) return;
    const st = useBoardStore.getState();
    const nu = st.objects.find((o): o is ImageObject => o.type === "image" && o.id === mynd.id);
    if (!nu) return;
    const bh = hlutiUrHeilliMynd(nu, cid);
    if (!bh) {
      toast.error("Slóð teikningarinnar er óþekkt (ekki úr skjalasafninu) — sæktu hana með heimilisfangaleitinni eða „Af slóð“.");
      return;
    }
    const nafnHaedar = nafnNyrrar ?? kostir.find((k) => k.id === haedId)?.nafn ?? "hæðin";
    const af = afleidingStadar(st.objects, nu.id, cid);
    const at = afleidingTengingar(st.objects, { ...nu, bladhluti: bh }, haedId, rett.haedir, cid);
    const spurn: string[] = [];
    if (af.losud) {
      spurn.push(`${af.losud} tæki/merki á teikningunni tilheyra öðrum stað — þau verða ótengd og tengjast tækjum „${rett.nafn}“ við vistun.`);
    }
    if (af.adrar.length) {
      spurn.push(
        `${af.adrar.length === 1 ? "Önnur mynd á borðinu er tengd" : `${af.adrar.length} aðrar myndir á borðinu eru tengdar`} öðrum stað og ` +
          `${af.adrar.length === 1 ? "verður ótengd" : "verða ótengdar"} — vistun skrifar einn stað í einu.`
      );
    }
    if (at.onnurMynd) spurn.push(`„${nafnHaedar}“ er þegar tengd annarri mynd á borðinu — sú mynd verður ótengd.`);
    if (at.annadBlad) {
      spurn.push(
        `„${nafnHaedar}“ er á annarri teikningu. Við vistun færist hæðin á þetta blað: skurður og veggir gömlu teikningarinnar falla út` +
          (at.merkiAnnarsBlads ? ` og ${at.merkiAnnarsBlads} merki hennar haldast í hnitum gömlu teikningarinnar` : "") +
          "."
      );
    }
    if (spurn.length && !window.confirm(spurn.join("\n\n") + "\n\nTengja samt?")) return;
    try {
      const frum = { b: bh.frumB, h: bh.frumH };
      const til = rett.haedir.find((h) => h.id === haedId);
      // „Stærð allra merkja": stærð hæðarinnar; ný hæð fær stærð annarrar tengdrar hæðar sama staðar, annars sjálfgefna.
      const grunnT = til
        ? grunnStaerdHaedar(til)
        : myndirTengdar(st.objects)
            .filter((m) => m.uttekt!.companyId === cid)
            .map((m) => stimpilStaerdTengingar(m.uttekt))
            .find((n): n is number => !!n) ?? STAERD_SJALF;
      const taknEining = taknEiningABladi(bladIBordi(nu, frum, bh.svaedi), bh.svaedi, frum);
      const r = tengjaVidStad(st.objects, nu.id, cid, { haedId, nyttNafn: nafnNyrrar }, rett.haedir, {
        taeki: rett.taeki,
        staerd: grunnT * taknEining,
        grunnT,
        taknEining,
      });
      if (r.objects !== st.objects) {
        st.commitHistory();
        useBoardStore.setState({ objects: r.objects });
      }
      useUttektGogn.getState().setGogn({ companyId: cid, nafn: rett.nafn, haedir: rett.haedir, taeki: rett.taeki });
      toast.success(
        `Tengt: ${rett.nafn} · „${nafnHaedar}“${nafnNyrrar ? " (ný)" : ""}` +
          (r.sett ? ` · ${r.sett} merki hæðarinnar sett á teikninguna` : "") +
          (r.veggir ? ` · ${r.veggir} veggir` : "") +
          (r.losud ? ` · ${r.losud} tákn losuð frá fyrri stað` : "") +
          (r.aftengdar ? ` · ${r.aftengdar} mynd(ir) annars staðar aftengdar` : "") +
          (rett.anRadar ? " · úttektarteikning staðarins verður til við vistun" : "") +
          ". Ýttu á „Vista í úttekt“.",
        { duration: 7000 }
      );
      loka();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Tenging mistókst");
    }
  };

  const veljaStad = (s: StadurILeit) => {
    setCid(s.id);
    setLeitOpin(false);
    setQ("");
    setNidurstodur([]);
  };

  const nafnStadar = rett?.nafn ?? (cid != null && gogn?.companyId === cid ? gogn.nafn : cid != null ? `Staður ${cid}` : null);
  const tillogur = useMemo(() => {
    const til = new Set(kostir.map((k) => k.nafn.toLowerCase()));
    const t = [...FLYTILEIDIR, tillagaHaedarNafns(kostir.map((k) => k.nafn))];
    return [...new Set(t)].filter((n) => !til.has(n.toLowerCase()));
  }, [kostir]);

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-stone-900/25 px-3 pt-24 backdrop-blur-[1px]" onPointerDown={(e) => e.target === e.currentTarget && loka()}>
      <section
        role="dialog"
        aria-label="Staður og hæð"
        data-stadur-og-haed
        className="flex max-h-[calc(100dvh-7rem)] w-full max-w-[30rem] flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white text-stone-800 shadow-2xl"
      >
        <header className="flex items-start gap-3 border-b border-stone-100 px-4 py-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-[#FE653F]/12 text-[#e2532f]">
            <Building2 className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold text-stone-900">Staður og hæð</h2>
            <p className="text-[12px] leading-snug text-stone-500">Flettu upp stað eða heimilisfangi í kerfinu og veldu hæð — eða stofnaðu nýja. Ekkert vistast fyrr en „Vista í úttekt“.</p>
          </div>
          <button type="button" onClick={loka} aria-label="Loka" className="rounded-full p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700">
            <X className="size-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
          {!myndir.length ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
              Engin teikning á borðinu sem hægt er að tengja. Sæktu teikningu með heimilisfangaleitinni eða „Af slóð“ — eða croppaðu teikningu sem var opnuð úr úttekt.
            </p>
          ) : null}

          {myndir.length > 1 ? (
            <div>
              <div className="mb-1.5 text-[11px] font-semibold tracking-wide text-stone-500 uppercase">Teikning</div>
              <div className="flex flex-wrap gap-1.5">
                {myndir.map((m) => {
                  const merki = merkiMyndar(m, gogn?.haedir) ?? m.name ?? "Teikning";
                  const valin = m.id === myndId;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setMyndId(m.id);
                        const c = stadurMyndar(m, gogn?.companyId ?? null);
                        if (c != null) setCid(c);
                      }}
                      className={`max-w-full truncate rounded-full border px-2.5 py-1 text-[12px] ${valin ? "border-[#FE653F] bg-[#FE653F] text-white" : "border-stone-200 bg-stone-50 text-stone-700 hover:border-stone-300"}`}
                    >
                      {m.uttekt ? "● " : "○ "}
                      {merki}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {mynd ? (
            <>
              <div>
                <div className="mb-1.5 text-[11px] font-semibold tracking-wide text-stone-500 uppercase">Staður</div>
                {!leitOpin && cid != null ? (
                  <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2">
                    <MapPin className="size-4 shrink-0 text-[#e2532f]" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-medium text-stone-900">{nafnStadar}</div>
                      <div className="text-[11.5px] text-stone-500">
                        {hledur ? "Sæki hæðir…" : rett ? (rett.anRadar ? "Engin úttektarteikning enn" : `${rett.haedir.length} ${rett.haedir.length === 1 ? "hæð" : "hæðir"} í úttekt`) : villa ?? ""}
                      </div>
                    </div>
                    <button type="button" onClick={() => setLeitOpin(true)} className="shrink-0 rounded-full border border-stone-300 bg-white px-2.5 py-1 text-[12px] font-medium text-stone-700 hover:bg-stone-100">
                      Annar staður
                    </button>
                  </div>
                ) : (
                  <div>
                    <label className="flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-3 py-2 focus-within:border-[#FE653F] focus-within:ring-2 focus-within:ring-[#FE653F]/20">
                      <Search className="size-4 shrink-0 text-stone-400" />
                      <input
                        ref={leitRef}
                        data-stadur-leit
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Nafn, heimilisfang eða númer — t.d. Barónsstígur 18"
                        className="min-w-0 flex-1 bg-transparent text-[13.5px] text-stone-900 outline-none placeholder:text-stone-400"
                      />
                      {leitar ? <Loader2 className="size-4 shrink-0 animate-spin text-stone-400" /> : null}
                      {cid != null ? (
                        <button type="button" onClick={() => setLeitOpin(false)} className="shrink-0 text-[12px] text-stone-500 hover:text-stone-800">
                          Hætta við
                        </button>
                      ) : null}
                    </label>
                    {nidurstodur.length ? (
                      <ul className="mt-1.5 divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200">
                        {nidurstodur.map((s) => (
                          <li key={s.id}>
                            <button type="button" data-stadur={s.id} onClick={() => veljaStad(s)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[#FE653F]/6">
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-[13px] font-medium text-stone-900">
                                  {s.nafn}
                                  {s.ovirkur ? <span className="ml-1.5 rounded bg-stone-100 px-1 text-[10.5px] font-normal text-stone-500">óvirkur</span> : null}
                                </div>
                                <div className="truncate text-[11.5px] text-stone-500">{s.heimilisfang || "—"}</div>
                              </div>
                              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-medium ${s.haedir ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500"}`}>
                                {s.haedir ? `${s.haedir} ${s.haedir === 1 ? "hæð" : "hæðir"}` : "engin teikning"}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : q.trim().length >= 2 && !leitar ? (
                      <p className="mt-1.5 px-1 text-[12px] text-stone-500">Ekkert fannst í kerfinu fyrir „{q.trim()}“.</p>
                    ) : null}
                  </div>
                )}
              </div>

              {!leitOpin && cid != null ? (
                <div>
                  <div className="mb-1.5 text-[11px] font-semibold tracking-wide text-stone-500 uppercase">Hæð</div>
                  {hledur ? (
                    <div className="flex items-center gap-2 px-1 py-2 text-[12.5px] text-stone-500">
                      <Loader2 className="size-4 animate-spin" /> Sæki hæðir staðarins…
                    </div>
                  ) : villa ? (
                    <p className="rounded-lg bg-red-50 px-3 py-2 text-[12.5px] text-red-800">{villa}</p>
                  ) : rett ? (
                    <div className="space-y-1.5">
                      {rett.anRadar ? (
                        <p className="rounded-lg bg-sky-50 px-3 py-2 text-[12.5px] text-sky-900">
                          „{rett.nafn}“ á enga úttektarteikningu enn — ný hæð stofnar hana við „Vista í úttekt“.
                        </p>
                      ) : null}
                      {kostir.map((k) => {
                        const her = k.myndId === mynd.id;
                        const annarsStadar = k.myndId && !her;
                        return (
                          <button
                            key={k.id}
                            type="button"
                            data-haed={k.id}
                            onClick={() => tengja(k.id)}
                            className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-[13px] ${her ? "border-[#FE653F] bg-[#FE653F]/8 text-stone-900" : "border-stone-200 bg-white text-stone-800 hover:border-[#FE653F]/60 hover:bg-[#FE653F]/5"}`}
                          >
                            <span className="truncate font-medium">
                              {k.nafn}
                              {k.ny ? <span className="ml-1 font-normal text-stone-500">(ný)</span> : null}
                            </span>
                            <span className="flex shrink-0 items-center gap-1 text-[11.5px] text-stone-500">
                              {her ? (
                                <>
                                  <Check className="size-3.5 text-[#e2532f]" /> þessi teikning
                                </>
                              ) : annarsStadar ? (
                                "á annarri mynd"
                              ) : k.markers ? (
                                `${k.markers} merki`
                              ) : (
                                "engin merki"
                              )}
                            </span>
                          </button>
                        );
                      })}
                      {nyttNafn == null ? (
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <span className="mr-0.5 inline-flex items-center gap-1 text-[12px] font-medium text-emerald-700">
                            <Plus className="size-3.5" /> Ný hæð:
                          </span>
                          {tillogur.map((n) => (
                            <button
                              key={n}
                              type="button"
                              data-ny-haed={n}
                              onClick={() => tengja(nyttHaedId(), n)}
                              className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[12px] text-emerald-800 hover:bg-emerald-100"
                            >
                              {n}
                            </button>
                          ))}
                          <button type="button" onClick={() => setNyttNafn("")} className="rounded-full border border-dashed border-stone-300 px-2.5 py-1 text-[12px] text-stone-600 hover:bg-stone-50">
                            Annað nafn…
                          </button>
                        </div>
                      ) : (
                        <form
                          className="flex gap-1.5 pt-1"
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
                            placeholder="t.d. 3. hæð, Jarðhæð"
                            className="h-9 min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-3 text-[13px] text-stone-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                          />
                          <button type="submit" className="rounded-xl bg-emerald-600 px-3 text-[13px] font-semibold text-white hover:bg-emerald-500">
                            Stofna
                          </button>
                          <button type="button" onClick={() => setNyttNafn(null)} className="rounded-xl px-2 text-[12.5px] text-stone-500 hover:bg-stone-100">
                            Hætta við
                          </button>
                        </form>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}
