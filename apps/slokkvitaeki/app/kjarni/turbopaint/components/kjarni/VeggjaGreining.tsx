"use client";

// „Greina veggi" (Agnar 06.10.2026). Áður henti „Veggir" innfluttu veggjunum (62 á Fiskislóð 41, með gleri og
// leiðréttingum) og setti 98 hráa PDF-búta í staðinn (ekkert gler, 18 m styttri). Nú:
//   • vigur-PDF: notandinn velur LÍNUFLOKKA (þykkt í pt, einn eða fleiri) og sér á borðinu hvaða línur verða veggir
//     (appelsínugular) og veggina sem verða til (grænir, gler blátt) — sama heildarferli og innflutningur hæðar;
//   • mynd (skönnun/TIF): myndgreiningin eins og áður;
//   • séu veggir fyrir er spurt: Bæta við (sjálfgefið — tvítekningar felldar, leiðréttingar haldast) / Skipta út / Hætta við.

import { ScanSearch, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { flokkaYfirlit, ptIBord, skurdurIPt, strikValinna, veggirUrStrikumPt, type PdfFlokkur } from "../../lib/board/pdf-veggjaflokkar";
import { greinaVeggiTeikningar, lesaPdfSidu, type PdfSida } from "../../lib/board/strip";
import { newId, useBoardStore } from "../../lib/board/store";
import type { BoardObject, ImageObject, LineObject } from "../../lib/board/types";
import { erVeggur } from "../../lib/board/veggja-leidretting";
import { nyrVeggur, sameinaVidVeggi, semButur, talningTexti, veggjaTalning, type Butur } from "../../lib/board/veggja-ritill";
import { ritillDilarAMetra, skiptaUt } from "../../lib/board/veggja-ritill-adgerdir";
import { useVeggjaRitill } from "../../lib/board/veggja-ritill-stada";
import { maelaThekju } from "../../lib/board/veggja-thekja";

/** Þúsundapunktar: 23.363 */
const fjoldi = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

type Nidurstada = { veggir: Butur[]; linur: number; thekja: number | null; aths?: string };

/** Veggir borðsins sem tilheyra teikningunni: festir við hana, eða lausir með miðju á henni. */
function veggirTeikningar(objects: BoardObject[], plan: ImageObject): LineObject[] {
  return objects.filter((o): o is LineObject => {
    if (!erVeggur(o) || o.hidden) return false;
    if (o.parentId) return o.parentId === plan.id;
    const n = o.points.length;
    const cx = o.x + (o.points[0] + o.points[n - 2]) / 2, cy = o.y + (o.points[1] + o.points[n - 1]) / 2;
    return cx >= plan.x && cy >= plan.y && cx <= plan.x + plan.width && cy <= plan.y + plan.height;
  });
}

export function VeggjaGreining({ planId }: { planId: string }) {
  const objects = useBoardStore((s) => s.objects);
  const pixelsPerMeter = useBoardStore((s) => s.pixelsPerMeter);
  const plan = objects.find((o): o is ImageObject => o.id === planId && o.type === "image") ?? null;
  const [hamur, setHamur] = useState<"les" | "pdf" | "mynd" | "villa">("les");
  const [villa, setVilla] = useState("");
  const [sida, setSida] = useState<PdfSida | null>(null);
  const [flokkar, setFlokkar] = useState<PdfFlokkur[]>([]);
  const [valdir, setValdir] = useState<string[]>([]);
  const [innanHuss, setInnanHuss] = useState(true);
  const [gler, setGler] = useState(true);
  const [stakar, setStakar] = useState(true);
  const [fleiri, setFleiri] = useState(false);
  const [nid, setNid] = useState<Nidurstada | null>(null);
  const [reiknar, setReiknar] = useState(false);
  const loka = () => useVeggjaRitill.getState().lokaGreiningu();

  // 1) lesa: vigur-PDF ef til, annars myndgreining
  useEffect(() => {
    const p = useBoardStore.getState().objects.find((o): o is ImageObject => o.id === planId && o.type === "image");
    if (!p) {
      loka();
      return;
    }
    let haett = false;
    void (async () => {
      const framvinda = (message: string) => (percent: number) =>
        useBoardStore.getState().setImportProgress({ fileName: p.name, percent, message });
      let s: PdfSida | null = null;
      try {
        s = await lesaPdfSidu(p, framvinda("Les línur úr PDF-vigrum…"));
      } catch (err) {
        console.warn("[veggir] PDF-lestur mistókst — myndgreining í staðinn", err);
      }
      if (haett) return;
      if (s) {
        useBoardStore.getState().setImportProgress(null);
        const y = flokkaYfirlit(s.flokkar, s.breidd, s.haed);
        setSida(s);
        setFlokkar(y);
        const t = y.find((f) => f.tillaga);
        setValdir(t ? [t.breidd] : []);
        setHamur("pdf");
        return;
      }
      try {
        const m = await greinaVeggiTeikningar(p, 1, framvinda("Greini veggi úr myndinni…"));
        useBoardStore.getState().setImportProgress(null);
        if (haett) return;
        const sx = p.width / m.breidd, sy = p.height / m.haed;
        setNid({
          veggir: m.midlinur.map((l) => ({ p: l.punktar.map((v, i) => (i % 2 === 0 ? p.x + v * sx : p.y + v * sy)), t: Math.max(1, l.thykkt * sx) })),
          linur: 0,
          thekja: null,
          aths: m.holir ? `${m.holir} holir veggir` : undefined,
        });
        setHamur("mynd");
      } catch (err) {
        useBoardStore.getState().setImportProgress(null);
        if (haett) return;
        setVilla(err instanceof Error ? err.message : "Veggjagreining mistókst");
        setHamur("villa");
      }
    })();
    return () => {
      haett = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId]);

  // 2) PDF: valdir flokkar → veggir (forskoðun á borðinu)
  useEffect(() => {
    if (hamur !== "pdf" || !sida || !plan) return;
    if (!valdir.length) {
      setNid({ veggir: [], linur: 0, thekja: null });
      useVeggjaRitill.getState().setForskodun(null);
      return;
    }
    setReiknar(true);
    const t = window.setTimeout(() => {
      try {
        const t0 = performance.now();
        const sv = innanHuss && plan.uttekt ? skurdurIPt(plan.uttekt.skurdur, { b: plan.uttekt.frumB, h: plan.uttekt.frumH }, sida.breidd, sida.haed) : null;
        const strik = strikValinna(sida.flokkar, valdir, { svaedi: sv, burt: plan.hvittad, bladB: sida.breidd, bladH: sida.haed });
        if (strik.length > 60000) {
          setNid({ veggir: [], linur: strik.length, thekja: null, aths: "Of margar línur (> 60 000) — veldu færri flokka" });
          useVeggjaRitill.getState().setForskodun(null);
          return;
        }
        const pt = veggirUrStrikumPt(strik, sida.breidd, sida.haed, { gler, stakar });
        // þekja: hlutfall valinna lína sem veggirnir ná yfir (mælt í ≤ 2,5× pt, ristin ≤ 5 MP)
        let thekja: number | null = null;
        if (strik.length <= 40000) {
          let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
          for (const s of strik) {
            x0 = Math.min(x0, s[0], s[2]);
            y0 = Math.min(y0, s[1], s[3]);
            x1 = Math.max(x1, s[0], s[2]);
            y1 = Math.max(y1, s[1], s[3]);
          }
          const q = Math.min(2.5, Math.sqrt(5e6 / Math.max(1, (x1 - x0 + 80) * (y1 - y0 + 80))));
          thekja = maelaThekju(
            strik.map((s) => s.map((n) => n * q)),
            pt.map((v) => ({ ...v, p: v.p.map((n) => n * q), t: v.t * q }))
          ).thekja;
        }
        const bord = ptIBord(pt, plan, sida.breidd, sida.haed);
        setNid({ veggir: bord, linur: strik.length, thekja });
        const kx = plan.width / sida.breidd, ky = plan.height / sida.haed;
        useVeggjaRitill.getState().setForskodun({
          linur: strik.map((s) => [plan.x + s[0] * kx, plan.y + s[1] * ky, plan.x + s[2] * kx, plan.y + s[3] * ky]),
          veggir: bord,
        });
        console.info(`[veggir] ${valdir.join("+")} pt: ${strik.length} línur → ${bord.length} veggir á ${Math.round(performance.now() - t0)} ms`);
      } finally {
        setReiknar(false);
      }
    }, 30);
    return () => window.clearTimeout(t);
    // plan breytist við hverja breytingu á borðinu — aðeins id/staða skipta máli hér
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hamur, sida, valdir, innanHuss, gler, stakar, plan?.id, plan?.x, plan?.y, plan?.width, plan?.height]);

  // myndgreining: forskoðun veggjanna
  useEffect(() => {
    if (hamur === "mynd" && nid) useVeggjaRitill.getState().setForskodun({ linur: [], veggir: nid.veggir });
  }, [hamur, nid]);

  const fyrir = useMemo(() => (plan ? veggirTeikningar(objects, plan) : []), [objects, plan]);
  const dpm = ritillDilarAMetra(objects, pixelsPerMeter);
  const samruni = useMemo(() => {
    if (!nid) return null;
    const m = dpm && dpm > 0 ? dpm : null;
    const tMed = nid.veggir.length ? nid.veggir.map((v) => v.t).sort((a, b) => a - b)[nid.veggir.length >> 1] : 4;
    return sameinaVidVeggi(fyrir.map(semButur), nid.veggir, {
      vik: m ? 0.1 * m : tMed,
      lagmark: m ? 0.25 * m : tMed * 2,
    });
  }, [fyrir, nid, dpm]);

  const beita = (ham: "baeta" | "skipta") => {
    if (!plan || !nid || !samruni) return;
    const listi = ham === "baeta" ? samruni.baeta : nid.veggir;
    const nyir = listi.map((v) => nyrVeggur(v.p, { id: newId(), thykkt: v.t, tegund: v.tegund ?? "veggur", parentId: plan.id }));
    const eyda = ham === "skipta" ? fyrir.map((o) => o.id) : [];
    if (!nyir.length && !eyda.length) {
      toast.message("Ekkert nýtt — allir greindu veggirnir eru þegar á teikningunni");
      loka();
      return;
    }
    skiptaUt(eyda, nyir, []);
    const t = veggjaTalning(useBoardStore.getState().objects);
    toast.success(
      (ham === "baeta"
        ? `${nyir.length} veggir bættust við` + (samruni.tviteknir ? ` (${samruni.tviteknir} tvíteknir slepptir)` : "")
        : `${eyda.length} veggjum skipt út fyrir ${nyir.length}`) +
        ` · alls ${talningTexti(t)} · ⌘Z afturkallar`
    );
    loka();
  };

  const fjoldiTegunda = (v: Butur[]) => {
    const g = v.filter((x) => x.tegund === "gler").length;
    return `${v.length - g} ${v.length - g === 1 ? "veggur" : "veggir"}` + (g ? ` · ${g} gler` : "");
  };
  const synd = fleiri ? flokkar : flokkar.slice(0, 8);
  const btn = "rounded-md px-2.5 py-1.5 text-[12px] font-semibold";

  return (
    <div
      role="dialog"
      aria-label="Greina veggi"
      className="pointer-events-auto absolute top-16 right-3 z-30 flex max-h-[calc(100%-5rem)] w-[344px] flex-col rounded-xl border border-white/10 bg-[#1a1d2e]/97 p-3 text-stone-100 shadow-2xl"
    >
      <div className="flex items-center gap-1.5">
        <ScanSearch className="size-4 text-[#FE653F]" />
        <span className="text-[13px] font-semibold">Greina veggi</span>
        <button type="button" aria-label="Loka" onClick={loka} className="ml-auto rounded p-1 hover:bg-white/10">
          <X className="size-3.5" />
        </button>
      </div>
      <div className="mt-0.5 truncate text-[11px] text-white/50">{plan?.name}</div>

      <div className="mt-2 min-h-0 flex-1 overflow-auto">
        {hamur === "les" ? <div className="py-3 text-[12px] text-white/70">Les teikninguna…</div> : null}
        {hamur === "villa" ? <div className="py-3 text-[12px] text-red-300">{villa}</div> : null}
        {hamur === "mynd" ? (
          <div className="text-[12px] text-white/75">
            Teikningin er mynd (skönnun / TIF) — ekkert vigur-PDF að lesa. Veggirnir eru greindir úr myndinni.
          </div>
        ) : null}
        {hamur === "pdf" ? (
          <>
            <div className="text-[11.5px] text-white/70">
              Línuflokkar í PDF-inu eftir þykkt. Veldu þá sem eru veggir — einn eða fleiri. Appelsínugular línur á teikningunni = valdar,
              grænt = veggirnir sem verða til (gler blátt).
            </div>
            <div className="mt-2 flex flex-col gap-1" role="group" aria-label="Línuflokkar">
              {synd.map((f) => {
                const a = valdir.includes(f.breidd);
                return (
                  <button
                    key={f.breidd}
                    type="button"
                    aria-pressed={a}
                    data-flokkur={f.breidd}
                    onClick={() => setValdir((v) => (v.includes(f.breidd) ? v.filter((x) => x !== f.breidd) : [...v, f.breidd]))}
                    className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-[11.5px] ${
                      a ? "border-[#FE653F] bg-[#FE653F]/15" : "border-white/10 bg-white/5 hover:bg-white/10"
                    }`}
                  >
                    <span className={`inline-flex size-3.5 items-center justify-center rounded-sm border ${a ? "border-[#FE653F] bg-[#FE653F] text-white" : "border-white/30"}`}>
                      {a ? "✓" : ""}
                    </span>
                    <span className="w-14 font-semibold tabular-nums">{f.breidd.replace(".", ",")} pt</span>
                    <span className="text-white/60 tabular-nums">
                      {fjoldi(f.strik)} strik · {fjoldi(f.lengdM)} m
                    </span>
                    <span className="ml-auto text-[10px] text-white/45">{f.tillaga ? "tillaga" : f.harlina ? "hárlína" : ""}</span>
                  </button>
                );
              })}
              {flokkar.length > 8 ? (
                <button type="button" onClick={() => setFleiri(!fleiri)} className="text-left text-[11px] text-white/50 hover:text-white/80">
                  {fleiri ? "Færri flokkar" : `Sýna alla ${flokkar.length} flokka`}
                </button>
              ) : null}
              {!flokkar.length ? <div className="text-[12px] text-white/60">Engar strokaðar línur í PDF-inu.</div> : null}
            </div>
            <div className="mt-2 flex flex-col gap-1 text-[11.5px] text-white/75">
              {plan?.uttekt?.skurdur ? (
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={innanHuss} onChange={(e) => setInnanHuss(e.target.checked)} />
                  Aðeins innan hússins (skurður hæðarinnar)
                </label>
              ) : null}
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={gler} onChange={(e) => setGler(e.target.checked)} />
                Gler úr þunnum pörum í línu veggja
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={stakar} onChange={(e) => setStakar(e.target.checked)} />
                Stakar línur (≥ 1,2 m) verða veggir
              </label>
            </div>
          </>
        ) : null}

        {nid && hamur !== "les" ? (
          <div data-greining-nidurstada className="mt-2 rounded-lg bg-white/5 px-2 py-1.5 text-[12px]">
            {reiknar ? (
              <span className="text-white/60">Reikna…</span>
            ) : (
              <>
                <div>
                  <b>{fjoldiTegunda(nid.veggir)}</b>
                  {nid.linur ? <span className="text-white/60"> úr {fjoldi(nid.linur)} línum</span> : null}
                </div>
                {nid.thekja != null ? (
                  <div className="text-white/60">Þekja: {(nid.thekja * 100).toFixed(1).replace(".", ",")} % valinna lína liggja í veggjum</div>
                ) : null}
                {nid.aths ? <div className="text-amber-300">{nid.aths}</div> : null}
              </>
            )}
          </div>
        ) : null}
      </div>

      {nid && samruni && hamur !== "les" ? (
        <div className="mt-2 border-t border-white/10 pt-2">
          {fyrir.length ? (
            <>
              <div className="text-[11.5px] text-white/70">
                Á teikningunni eru þegar <b>{fyrir.length}</b> veggir. Bæta við sleppir tvíteknum — veggirnir sem fyrir eru (og leiðréttingar á þeim)
                haldast.
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  autoFocus
                  disabled={reiknar}
                  onClick={() => beita("baeta")}
                  className={`${btn} bg-[#FE653F] text-white hover:bg-[#ff7a58] disabled:opacity-50`}
                  title={`${samruni.baeta.length} nýir bútar · ${samruni.tviteknir} tvíteknir slepptir · ${samruni.styttir} styttir`}
                >
                  Bæta við (+{samruni.baeta.length})
                </button>
                <button
                  type="button"
                  disabled={reiknar}
                  onClick={() => beita("skipta")}
                  className={`${btn} bg-white/10 hover:bg-white/15 disabled:opacity-50`}
                  title={`Eyðir ${fyrir.length} veggjum teikningarinnar og setur ${nid.veggir.length} í staðinn`}
                >
                  Skipta út ({fyrir.length} → {nid.veggir.length})
                </button>
                <button type="button" onClick={loka} className={`${btn} bg-white/5 hover:bg-white/10`}>
                  Hætta við
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                autoFocus
                disabled={reiknar || !nid.veggir.length}
                onClick={() => beita("baeta")}
                className={`${btn} bg-[#FE653F] text-white hover:bg-[#ff7a58] disabled:opacity-50`}
              >
                Setja inn {nid.veggir.length} veggi
              </button>
              <button type="button" onClick={loka} className={`${btn} bg-white/5 hover:bg-white/10`}>
                Hætta við
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
