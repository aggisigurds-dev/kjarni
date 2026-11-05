"use client";

// Lagna-hamur (Agnar 30.10.2026): brunaveggir úr Brunayfirliti (rauðar línur) + lagnablöð (loftræsing, vatn, rafmagn) →
// hvar lögn sker brunavegg, með stærð. Tólin búa í hægra spjaldinu; blað er stillt á yfirlitið í glugga með tveimur
// punktapörum (sama dæmi á báðum blöðum: t.d. tvö skafthorn). Ekkert vistast — niðurstaðan fer í CSV / afritast.

import { Download, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { hladaLagnaBlad, type LagnaBlad } from "../../lib/board/lagnir-pdf";
import {
  andhverfLiking,
  beitaLikingu,
  BRUNAVEGGUR_LITUR,
  gegnumtokCsv,
  kvardiLikingar,
  likingUrPunktapari,
  litirFlata,
  litirStrika,
  taldarStaerdir,
  type Gegnumtak,
  type Punktur,
} from "../../lib/board/lagnir";
import { teljaBlad, useLagnir } from "../../lib/board/lagnir-store";

const tala = (n: number) => n.toLocaleString("is-IS");

// --- Teikniflötur með aðdrætti, færslu og punktavali ------------------------------------------------------------------

interface Slod {
  path: Path2D;
  stil: string;
  /** Línuþykkt í skjápunktum (helst sama við aðdrátt). */
  breidd: number;
  fylla?: boolean;
}

function PtaFlotur(props: {
  titill: ReactNode;
  bw: number;
  bh: number;
  slodir: Slod[];
  /** Yfirlag í pt-hnitum (ctx er þegar varpað). */
  teikna?: (ctx: CanvasRenderingContext2D, s: number) => void;
  punktar: Punktur[];
  virk: boolean;
  onPunktur: (p: Punktur) => void;
}) {
  const { bw, bh, slodir, teikna, punktar, virk, onPunktur } = props;
  const ref = useRef<HTMLCanvasElement>(null);
  const kassi = useRef<HTMLDivElement>(null);
  const [syn, setSyn] = useState({ s: 1, ox: 0, oy: 0, tilbuid: false });
  const [stord, setStord] = useState({ w: 600, h: 500 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number; fjarl: number } | null>(null);

  useEffect(() => {
    const el = kassi.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStord({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setStord({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Fyrsta teikning: blaðið passar í kassann.
  useEffect(() => {
    if (syn.tilbuid || !stord.w || !stord.h) return;
    const s = Math.min(stord.w / bw, stord.h / bh);
    setSyn({ s, ox: (stord.w - bw * s) / 2, oy: (stord.h - bh * s) / 2, tilbuid: true });
  }, [stord, bw, bh, syn.tilbuid]);

  useEffect(() => {
    const c = ref.current;
    if (!c || !syn.tilbuid) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(stord.w * dpr);
    c.height = Math.round(stord.h * dpr);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.setTransform(dpr * syn.s, 0, 0, dpr * syn.s, dpr * syn.ox, dpr * syn.oy);
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1 / syn.s;
    ctx.strokeRect(0, 0, bw, bh);
    for (const x of slodir) {
      if (x.fylla) {
        ctx.fillStyle = x.stil;
        ctx.fill(x.path);
      } else {
        ctx.strokeStyle = x.stil;
        ctx.lineWidth = x.breidd / syn.s;
        ctx.stroke(x.path);
      }
    }
    teikna?.(ctx, syn.s);
    punktar.forEach((p, i) => {
      ctx.beginPath();
      ctx.arc(p[0], p[1], 7 / syn.s, 0, Math.PI * 2);
      ctx.fillStyle = "#16a34a";
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${10 / syn.s}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(i + 1), p[0], p[1]);
    });
  }, [syn, stord, slodir, teikna, punktar, bw, bh]);

  // Aðdráttur um músina (wheel þarf non-passive hlustara).
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const f = (e: WheelEvent) => {
      e.preventDefault();
      const r = c.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      setSyn((v) => {
        const s2 = Math.max(0.02, Math.min(80, v.s * Math.exp(-e.deltaY * 0.0015)));
        const k = s2 / v.s;
        return { ...v, s: s2, ox: mx - (mx - v.ox) * k, oy: my - (my - v.oy) * k };
      });
    };
    c.addEventListener("wheel", f, { passive: false });
    return () => c.removeEventListener("wheel", f);
  }, []);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="px-2 py-1 text-[11.5px] font-semibold text-stone-200">{props.titill}</div>
      <div ref={kassi} className={`relative min-h-0 flex-1 overflow-hidden rounded border ${virk ? "border-[#FE653F]" : "border-white/10"}`}>
        <canvas
          ref={ref}
          style={{ width: stord.w, height: stord.h, cursor: virk ? "crosshair" : "grab", touchAction: "none" }}
          onPointerDown={(e) => {
            (e.target as Element).setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX, y: e.clientY, ox: syn.ox, oy: syn.oy, fjarl: 0 };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            const dx = e.clientX - d.x, dy = e.clientY - d.y;
            d.fjarl = Math.max(d.fjarl, Math.hypot(dx, dy));
            if (d.fjarl > 4) setSyn((v) => ({ ...v, ox: d.ox + dx, oy: d.oy + dy }));
          }}
          onPointerUp={(e) => {
            const d = drag.current;
            drag.current = null;
            if (!d || d.fjarl > 4 || !virk) return;
            const r = (e.target as HTMLCanvasElement).getBoundingClientRect();
            onPunktur([(e.clientX - r.left - syn.ox) / syn.s, (e.clientY - r.top - syn.oy) / syn.s]);
          }}
        />
      </div>
    </div>
  );
}

function slodirYfirlits(b: LagnaBlad, vegglitir: string[]): Slod[] {
  const set = new Set(vegglitir);
  const bak = new Path2D(), veggir = new Path2D();
  for (const x of b.log.strik) {
    const p = set.has(x.lit) ? veggir : bak;
    p.moveTo(x.s[0], x.s[1]);
    p.lineTo(x.s[2], x.s[3]);
  }
  return [
    { path: bak, stil: "rgba(70,70,70,.5)", breidd: 0.7 },
    { path: veggir, stil: "#e11d48", breidd: 1.6 },
  ];
}

function slodirBlads(b: LagnaBlad, rasalitir: string[]): Slod[] {
  const set = new Set(rasalitir);
  const bak = new Path2D(), ras = new Path2D();
  for (const x of b.log.strik) {
    bak.moveTo(x.s[0], x.s[1]);
    bak.lineTo(x.s[2], x.s[3]);
  }
  for (const f of b.log.flatir) {
    if (!set.has(f.lit)) continue;
    ras.moveTo(f.p[0][0], f.p[0][1]);
    for (let i = 1; i < f.p.length; i++) ras.lineTo(f.p[i][0], f.p[i][1]);
    ras.closePath();
  }
  return [
    { path: ras, stil: "rgba(37,99,235,.35)", breidd: 0, fylla: true },
    { path: bak, stil: "rgba(40,40,40,.55)", breidd: 0.6 },
  ];
}

// --- Stillingargluggi -------------------------------------------------------------------------------------------------

function Stilling({ id }: { id: string }) {
  const yfirlit = useLagnir((s) => s.yfirlit);
  const vegglitir = useLagnir((s) => s.vegglitir);
  const st = useLagnir((s) => s.blod.find((b) => b.id === id));
  const [m, setM] = useState<Punktur[]>([]);
  const [y, setY] = useState<Punktur[]>([]);

  const slodirY = useMemo(() => (yfirlit ? slodirYfirlits(yfirlit, vegglitir) : []), [yfirlit, vegglitir]);
  const slodirB = useMemo(() => (st ? slodirBlads(st.blad, st.rasalitir) : []), [st]);

  const naest: "blad" | "yfirlit" | null = m.length === y.length ? (m.length < 2 ? "blad" : null) : "yfirlit";
  const liking = useMemo(() => {
    if (m.length === 2 && y.length === 2) return likingUrPunktapari(m[0], m[1], y[0], y[1]);
    return !m.length && !y.length ? (st?.liking ?? null) : null;
  }, [m, y, st?.liking]);
  const talid = useMemo(() => (yfirlit && st && liking ? teljaBlad(yfirlit, vegglitir, st, liking) : null), [yfirlit, st, liking, vegglitir]);

  // Brunaveggir yfirlitsins yfir blaðinu (í blaðhnitum) — sjónstaðfesting á stillingunni.
  const yfirlag = useMemo(() => {
    if (!yfirlit || !st || !liking) return null;
    const inv = andhverfLiking(liking);
    const set = new Set(vegglitir);
    const p = new Path2D();
    for (const x of yfirlit.log.strik) {
      if (!set.has(x.lit)) continue;
      const a = beitaLikingu(inv, [x.s[0], x.s[1]]), c = beitaLikingu(inv, [x.s[2], x.s[3]]);
      if (a[0] < -50 && c[0] < -50) continue;
      if (a[0] > st.blad.w + 50 && c[0] > st.blad.w + 50) continue;
      if (a[1] < -50 && c[1] < -50) continue;
      if (a[1] > st.blad.h + 50 && c[1] > st.blad.h + 50) continue;
      p.moveTo(a[0], a[1]);
      p.lineTo(c[0], c[1]);
    }
    return p;
  }, [yfirlit, st, liking, vegglitir]);

  const teiknaBlad = useMemo(
    () => (ctx: CanvasRenderingContext2D, s: number) => {
      if (yfirlag) {
        ctx.strokeStyle = "rgba(225,29,72,.85)";
        ctx.lineWidth = 2 / s;
        ctx.stroke(yfirlag);
      }
      for (const g of talid ?? []) {
        ctx.beginPath();
        ctx.arc(g.x, g.y, 14 / s, 0, Math.PI * 2);
        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth = 2.5 / s;
        ctx.stroke();
      }
    },
    [yfirlag, talid],
  );

  if (!yfirlit || !st) return null;
  const kv = liking ? kvardiLikingar(liking) : null;
  const lokaGlugga = () => useLagnir.getState().setStillir(null);
  const vista = () => {
    if (!liking || !talid) return;
    useLagnir.getState().uppfaera(id, { liking, gegnumtok: talid });
    toast.message(`${st.heiti}: ${talid.length} gegnumtök`, { duration: 2200 });
    lokaGlugga();
  };
  const leidbeining =
    naest === "blad"
      ? `Smelltu á punkt ${m.length + 1} á LAGNABLAÐINU (vinstri) — t.d. skafthorn eða stigahús`
      : naest === "yfirlit"
        ? `Smelltu á SAMA punkt á YFIRLITINU (hægri)`
        : "Stillt — athugaðu að rauðu veggirnir liggi á veggjum blaðsins; annars Byrja aftur";

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black/80 p-3 text-stone-100" role="dialog" aria-label="Stilla blað á yfirlit">
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <div className="text-sm font-semibold">Stilla „{st.heiti}“ á brunayfirlitið</div>
        <div className="text-[12px] text-[#FE653F]">{leidbeining}</div>
        <div className="ml-auto flex items-center gap-2 text-[12px]">
          {talid ? (
            <b className="rounded bg-amber-500/20 px-2 py-0.5 text-amber-300" title="Ajour skráir stakar lokanir — tvær á hvert gegnumtak (sín hvorum megin við vegg)">
              {talid.length} gegnumtök · {talid.length * 2} lokanir
            </b>
          ) : null}
          {kv != null ? (
            <span className={Math.abs(kv - 0.2) > 0.03 ? "text-red-400" : "text-stone-400"} title="Kvarði yfirlits á blað — 0,200 þegar 1:250 er stillt á 1:50">
              kvarði {kv.toFixed(3)}
            </span>
          ) : null}
          <button type="button" className="rounded bg-white/10 px-2 py-1 hover:bg-white/20" onClick={() => { setM([]); setY([]); }}>
            Byrja aftur
          </button>
          <button type="button" disabled={!talid} className="rounded bg-[#FE653F] px-3 py-1 font-semibold text-white disabled:opacity-40" onClick={vista}>
            Nota stillinguna
          </button>
          <button type="button" aria-label="Loka" className="rounded p-1 hover:bg-white/10" onClick={lokaGlugga}>
            <X className="size-4" />
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 gap-2">
        <PtaFlotur
          titill={`Lagnablað · ${st.blad.nafn}`}
          bw={st.blad.w}
          bh={st.blad.h}
          slodir={slodirB}
          teikna={teiknaBlad}
          punktar={m}
          virk={naest === "blad"}
          onPunktur={(p) => setM((v) => [...v, p])}
        />
        <PtaFlotur
          titill={`Brunayfirlit · ${yfirlit.nafn}`}
          bw={yfirlit.w}
          bh={yfirlit.h}
          slodir={slodirY}
          punktar={y}
          virk={naest === "yfirlit"}
          onPunktur={(p) => setY((v) => [...v, p])}
        />
      </div>
      <div className="mt-1 text-[11px] text-stone-400">Hjól = aðdráttur · dragðu = færa · smelltu = velja punkt. Tveir punktar á sitthvoru blaði nægja (snúningur og kvarði reiknast).</div>
    </div>
  );
}

// --- Spjaldið í hægri hliðarstikunni ------------------------------------------------------------------------------------

function LitaVal({ yfirlit, val, onVal }: { yfirlit: { lit: string; fjoldi: number }[]; val: string[]; onVal: (l: string[]) => void }) {
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {yfirlit.slice(0, 8).map((x) => {
        const a = val.includes(x.lit);
        return (
          <button
            key={x.lit}
            type="button"
            title={`${x.lit} · ${tala(x.fjoldi)} stk`}
            onClick={() => onVal(a ? val.filter((v) => v !== x.lit) : [...val, x.lit])}
            className={`flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10.5px] ${a ? "border-[#FE653F] bg-[#FE653F]/15 text-white" : "border-white/10 bg-white/5 text-stone-400"}`}
          >
            <span className="inline-block size-2.5 rounded-sm border border-white/30" style={{ background: x.lit }} />
            {tala(x.fjoldi)}
          </button>
        );
      })}
    </div>
  );
}

function SkraVal({ texti, onSkrar, margar }: { texti: string; onSkrar: (f: File[]) => void; margar?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="application/pdf,.pdf"
        multiple={margar}
        hidden
        onChange={(e) => {
          const f = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (f.length) onSkrar(f);
        }}
      />
      <button type="button" onClick={() => ref.current?.click()} className="flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-medium text-stone-100 hover:bg-white/12">
        <Upload className="size-3.5" />
        {texti}
      </button>
    </>
  );
}

export function LagnaHamSpjald() {
  const yfirlit = useLagnir((s) => s.yfirlit);
  const vegglitir = useLagnir((s) => s.vegglitir);
  const blod = useLagnir((s) => s.blod);
  const stillir = useLagnir((s) => s.stillir);
  const [hledur, setHledur] = useState<string | null>(null);

  const yfirlitLitir = useMemo(() => (yfirlit ? litirStrika(yfirlit.log.strik).filter((x) => x.lit !== "#000000" || vegglitir.includes(x.lit)) : []), [yfirlit, vegglitir]);

  const hlada = async (files: File[], hvad: "yfirlit" | "blad") => {
    for (const f of files) {
      setHledur(`Les ${f.name}…`);
      try {
        const b = await hladaLagnaBlad(f);
        const r = useLagnir.getState();
        if (hvad === "yfirlit") {
          r.setYfirlit(b);
          const litir = litirStrika(b.log.strik).map((x) => x.lit);
          r.setVegglitir(litir.includes(BRUNAVEGGUR_LITUR) ? [BRUNAVEGGUR_LITUR] : []);
          if (!litir.includes(BRUNAVEGGUR_LITUR)) toast.message("Enginn rauður litur á yfirlitinu — veldu lit brunaveggja hér að neðan", { duration: 3500 });
        } else r.baetaBladi(b);
      } catch (e) {
        toast.error(`Gat ekki lesið ${f.name}: ${e instanceof Error ? e.message : "óþekkt villa"} (þarf vigur-PDF)`);
      }
    }
    setHledur(null);
  };

  const oll: Gegnumtak[] = blod.flatMap((b) => b.gegnumtok ?? []);
  const staerdir = taldarStaerdir(oll);
  const csv = () => {
    const url = URL.createObjectURL(new Blob(["﻿" + gegnumtokCsv(blod.map((b) => ({ nafn: b.heiti, gegnumtok: b.gegnumtok ?? [] })))], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "gegnumtok-lagnir.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const afrita = async () => {
    const t = blod.map((b) => `${b.heiti}: ${b.gegnumtok ? b.gegnumtok.length : "óstillt"}`).join("\n") + `\nSamtals: ${oll.length}\n` + staerdir.map((x) => `${x.staerd}: ${x.fjoldi}`).join("\n");
    try {
      await navigator.clipboard.writeText(t);
      toast.message("Afritað", { duration: 1200 });
    } catch {
      window.prompt("Afritaðu:", t);
    }
  };

  const kassi = "border-b border-white/8 px-4 py-3";
  const hausi = "text-[11px] font-medium tracking-[0.12em] text-[#FE653F]";
  return (
    <div data-lagnir-spjald>
      <div className={kassi}>
        <div className={hausi}>1 · BRUNAYFIRLIT</div>
        <div className="mt-1 text-[11px] leading-snug text-stone-400">Vigur-PDF af brunahólfun (t.d. „Brunayfirlit 5H“). Brunaveggir eru sá litur sem þú velur — sjálfgefið rautt.</div>
        <div className="mt-2 flex items-center gap-2">
          <SkraVal texti={yfirlit ? "Skipta um yfirlit" : "Velja yfirlitsblað"} onSkrar={(f) => hlada(f.slice(0, 1), "yfirlit")} />
          {yfirlit ? <span className="truncate text-[11px] text-stone-300" title={yfirlit.nafn}>{yfirlit.nafn}</span> : null}
        </div>
        {yfirlit ? (
          <>
            <div className="mt-1 text-[10.5px] text-stone-400">Litir línanna (smelltu til að velja brunavegg):</div>
            <LitaVal yfirlit={yfirlitLitir} val={vegglitir} onVal={(l) => useLagnir.getState().setVegglitir(l)} />
          </>
        ) : null}
      </div>

      <div className={kassi}>
        <div className={hausi}>2 · LAGNABLÖÐ</div>
        <div className="mt-1 text-[11px] leading-snug text-stone-400">Loftræsing, vatn eða rafmagn (vigur-PDF, 1:50). Hvert blað er stillt á yfirlitið með tveimur punktapörum.</div>
        <div className="mt-2">
          <SkraVal texti="Bæta við blöðum" margar onSkrar={(f) => hlada(f, "blad")} />
        </div>
        {hledur ? <div className="mt-1 text-[11px] text-amber-300">{hledur}</div> : null}
        <div className="mt-2 space-y-2">
          {blod.map((b) => (
            <div key={b.id} className="rounded-md border border-white/10 bg-white/4 p-2">
              <div className="flex items-center gap-1">
                <input
                  value={b.heiti}
                  aria-label="Heiti blaðs"
                  onChange={(e) => useLagnir.getState().uppfaera(b.id, { heiti: e.target.value })}
                  className="min-w-0 flex-1 rounded bg-transparent px-1 text-[12px] font-medium text-stone-100 outline-none focus:bg-white/8"
                />
                <button type="button" aria-label="Fjarlægja blað" className="rounded p-0.5 text-stone-500 hover:bg-white/10 hover:text-white" onClick={() => useLagnir.getState().fjarlaegja(b.id)}>
                  <X className="size-3.5" />
                </button>
              </div>
              <div className="mt-1 text-[10.5px] text-stone-400">Rásalitir (fletir):</div>
              <LitaVal
                yfirlit={litirFlata(b.blad.log.flatir)}
                val={b.rasalitir}
                onVal={(l) => useLagnir.getState().uppfaera(b.id, { rasalitir: l, gegnumtok: null })}
              />
              <div className="mt-1.5 flex items-center gap-2">
                <button
                  type="button"
                  disabled={!yfirlit}
                  title={yfirlit ? "Stilla blaðið á yfirlitið" : "Veldu yfirlitsblað fyrst"}
                  onClick={() => useLagnir.getState().setStillir(b.id)}
                  className="rounded-md bg-[#FE653F] px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
                >
                  {b.liking ? "Endurstilla…" : "Stilla…"}
                </button>
                <span className="text-[11px] text-stone-300">
                  {b.gegnumtok ? <b className="text-amber-300">{b.gegnumtok.length} gegnumtök</b> : b.liking ? "stillt — endurtelja" : "óstillt"}
                </span>
                {b.liking && !b.gegnumtok && yfirlit ? (
                  <button
                    type="button"
                    className="rounded bg-white/10 px-1.5 py-0.5 text-[10.5px] hover:bg-white/20"
                    onClick={() => b.liking && useLagnir.getState().uppfaera(b.id, { gegnumtok: teljaBlad(yfirlit, vegglitir, b, b.liking) })}
                  >
                    Telja
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={kassi}>
        <div className={hausi}>3 · NIÐURSTAÐA</div>
        {oll.length ? (
          <>
            <div className="mt-1 text-sm text-stone-100">
              <b>{tala(oll.length)}</b> gegnumtök á {blod.filter((b) => b.gegnumtok).length} blöðum
            </div>
            <div className="text-[11px] text-stone-300" title="Ajour skráir stakar lokanir: tvær á hvert gegnumtak, sín hvorum megin við vegg">
              = <b>{tala(oll.length * 2)}</b> lokanir í Ajour
            </div>
            <table className="mt-1.5 w-full text-[11.5px] text-stone-200">
              <tbody>
                {staerdir.map((x) => (
                  <tr key={x.staerd} className="border-b border-white/5">
                    <td className="py-0.5">{x.staerd}</td>
                    <td className="py-0.5 text-right tabular-nums">{x.fjoldi}</td>
                    <td className="py-0.5 pl-3 text-right text-stone-400 tabular-nums">{x.fjoldi * 2} lok.</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-1.5 text-[10.5px] leading-snug text-amber-200/80">Blöð skarast (t.d. hluti 1 og 2) — gegnumtök á skörun geta verið tvítalin. Veggir sem eru ekki á yfirlitinu (EI-merktir) teljast ekki.</div>
            <div className="mt-2 flex gap-1.5">
              <button type="button" onClick={csv} className="flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] hover:bg-white/12">
                <Download className="size-3.5" /> CSV
              </button>
              <button type="button" onClick={afrita} className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] hover:bg-white/12">
                Afrita
              </button>
            </div>
          </>
        ) : (
          <div className="mt-1 text-[11px] text-stone-500">Engin blöð talin enn.</div>
        )}
      </div>
      {stillir ? <Stilling id={stillir} /> : null}
    </div>
  );
}
