"use client";

import { useMemo, useState } from "react";
import { BrickWall, ChevronDown, ChevronRight } from "lucide-react";
import { useBoardStore } from "../../lib/board/store";
import { VEGG_HEITI, VEGG_LITIR } from "../../lib/board/veggja-leidretting";
import { VEGG_TEGUNDIR, veggjaSamantekt } from "../../lib/board/veggja-samantekt";

/* Samantekt veggjagreiningarinnar — ein stika undir efsta banner, samanfellanleg (Agnar 26.10.2026: „betri automatic
 * samantekt, auka stiku fyrir neðan efsta bannerinn, collapsable, með helstu hjálpargreiningartölunum fyrir veggina").
 * Samanfelld: ein lína með helstu tölunum. Opin: tegundir veggja (fjöldi + metrar), rými, tæki og athugasemdir um kvarða
 * og óflokkaða búta. Les aðeins borðið (lib/board/veggja-samantekt.ts) — skrifar ekkert, kemur því aldrei í veg fyrir vistun. */

const tala = (n: number) => n.toLocaleString("is-IS", { maximumFractionDigits: 1 });
const metrar = (m: number | null) => (m == null ? "—" : `${tala(m)} m`);

export function VeggjaYfirlit() {
  const objects = useBoardStore((s) => s.objects);
  const pixelsPerMeter = useBoardStore((s) => s.pixelsPerMeter);
  // Samanfelld sjálfgefið alls staðar — ein lína með helstu tölunum; teikningin fær plássið (sama hugsun og Magntaflan á síma).
  const [opin, setOpin] = useState(false);
  const s = useMemo(() => veggjaSamantekt(objects, pixelsPerMeter), [objects, pixelsPerMeter]);

  if (!s.veggir && !s.rymi) return null;

  const t = s.eftirTegund;
  const taekiAlls = s.taeki.slokkvitaeki + s.taeki.slanga + s.taeki.ut;
  const linur: { k: string; texti: string; litur?: string }[] = [
    { k: "veggir", texti: `Veggir ${s.veggir}${s.metrarVeggir != null ? ` · ${metrar(s.metrarVeggir)}` : ""}` },
  ];
  if (t.ei60.n) linur.push({ k: "ei60", texti: `EI-60 ${t.ei60.metrar != null ? metrar(t.ei60.metrar) : t.ei60.n}`, litur: VEGG_LITIR.ei60 });
  if (t.ei30.n) linur.push({ k: "ei30", texti: `EI-30 ${t.ei30.metrar != null ? metrar(t.ei30.metrar) : t.ei30.n}`, litur: VEGG_LITIR.ei30 });
  if (t.gler.n) linur.push({ k: "gler", texti: `Gler ${t.gler.n}`, litur: VEGG_LITIR.gler });
  if (t.hurd.n) linur.push({ k: "hurd", texti: `Hurðir ${t.hurd.n}`, litur: VEGG_LITIR.hurd });
  if (s.rymi) linur.push({ k: "rymi", texti: `Rými ${s.rymi}${s.rymiM2 != null ? ` · ${tala(s.rymiM2)} m²` : ""}` });
  if (taekiAlls) linur.push({ k: "taeki", texti: `SLT ${s.taeki.slokkvitaeki} · BRSL ${s.taeki.slanga} · ÚT ${s.taeki.ut}` });

  return (
    <section
      data-veggja-yfirlit
      aria-label="Samantekt veggjagreiningar"
      className="shrink-0 border-b border-white/8 bg-[#171a29] text-[11.5px] text-stone-200"
    >
      <button
        type="button"
        aria-expanded={opin}
        onClick={() => setOpin((v) => !v)}
        title={opin ? "Fella samantektina saman" : "Opna samantekt veggjagreiningar"}
        className="flex min-h-8 w-full items-center gap-2 px-2.5 py-1 text-left hover:bg-white/5 sm:px-3"
      >
        <BrickWall className="size-3.5 shrink-0 text-[#FE653F]" aria-hidden />
        <span className="shrink-0 font-semibold tracking-wide text-stone-100">SAMANTEKT</span>
        {!opin ? (
          <span className="flex min-w-0 flex-1 items-center gap-x-3 overflow-hidden whitespace-nowrap text-stone-300">
            {linur.map((l) => (
              <span key={l.k} className="inline-flex shrink-0 items-center gap-1">
                {l.litur ? <i className="inline-block size-2 rounded-full" style={{ background: l.litur }} aria-hidden /> : null}
                {l.texti}
              </span>
            ))}
          </span>
        ) : (
          <span className="flex-1" />
        )}
        {opin ? <ChevronDown className="size-3.5 shrink-0 text-white/50" /> : <ChevronRight className="size-3.5 shrink-0 text-white/50" />}
      </button>
      {opin ? (
        <div className="flex max-h-[45vh] flex-wrap items-start gap-x-4 gap-y-2 overflow-y-auto px-3 pt-0.5 pb-2.5">
          <div className="min-w-[min(100%,18rem)] flex-[2_1_20rem]">
            <div className="mb-1 text-[10px] font-semibold tracking-wide text-white/45">VEGGIR EFTIR TEGUND</div>
            <div className="flex flex-wrap gap-1.5">
              {VEGG_TEGUNDIR.map((k) => (
                <div
                  key={k}
                  className={`flex min-w-[11rem] flex-[1_1_11rem] items-center gap-2 rounded-md border border-white/8 px-2 py-1 ${t[k].n ? "" : "opacity-40"}`}
                >
                  <i className="inline-block size-2.5 shrink-0 rounded-full" style={{ background: VEGG_LITIR[k] }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{VEGG_HEITI[k]}</span>
                  <span className="font-semibold tabular-nums">{t[k].n}</span>
                  <span className="w-14 text-right tabular-nums text-white/55">{metrar(t[k].metrar)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="min-w-[min(100%,12rem)] flex-[1_1_12rem] space-y-1">
            <div className="text-[10px] font-semibold tracking-wide text-white/45">RÝMI OG TÆKI</div>
            <div className="flex justify-between"><span>Rými</span><span className="tabular-nums">{s.rymi ? `${s.rymi}${s.rymiM2 != null ? ` · ${tala(s.rymiM2)} m²` : ""}` : "—"}</span></div>
            <div className="flex justify-between"><span>Slökkvitæki</span><span className="tabular-nums">{s.taeki.slokkvitaeki}</span></div>
            <div className="flex justify-between"><span>Brunaslöngur</span><span className="tabular-nums">{s.taeki.slanga}</span></div>
            <div className="flex justify-between"><span>ÚT-merki</span><span className="tabular-nums">{s.taeki.ut}</span></div>
          </div>
          <div className="w-full space-y-0.5 text-[11px] text-white/55">
            {s.oflokkadir > 0 ? (
              <div>
                {s.oflokkadir} {s.oflokkadir === 1 ? "bútur er" : "bútar eru"} óflokkaðir — greiningin gaf þeim tegundina „veggur";
                yfirfarðu í Veggir-stikunni (gler, hurð, EI).
              </div>
            ) : null}
            {s.kvardi === null ? (
              <div>Enginn kvarði — metrar birtast þegar teikningin er kvörðuð (K) eða tengd úttektarhæð.</div>
            ) : s.kvardi === "agiskun" ? (
              <div>Metrar eru áætlaðir (1:100 út frá stærð blaðsins) — kvarðaðu með K til að fá réttar lengdir.</div>
            ) : (
              <div>Metrar samkvæmt kvarða borðsins.</div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
