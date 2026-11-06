"use client";

// HÚSIÐ — útlínan sem Agnar teiknar sjálfur (06.11.2026: „ég vil að 2. hæð virki … lagaðu bara svo ég geti lagað … þoli ekki að
// hafa læst"). Vélin finnur útlínu hússins úr veggjunum og getur mistekist (op án hurðar — á 2. hæð Breiðhöfða lokaðist hún ekki
// og aðeins kassinn var notaður), og þá fer allt hitt með: hvað er hent sem utanhúss, hvar gólfið liggur í 3D, hvar hurðirnar
// finnast. Hér setur Agnar útlínuna sjálfur og hún GENGUR ALLTAF FYRIR (uttekt.husUtlina → husUtlina(…, handvirk)).
//
// Þetta er SÉR yfirlag, ekki tól inni í bendilvélinni í VeggjaRitill (1900 línur): annars hefði hvert smell-tilfelli þar þurft að
// vita af útlínunni. Yfirlagið er aðeins virkt meðan Agnar teiknar; annars sýnir það bara útlínuna (strikuð lína) og — meðan
// spjaldið er opið — handföng sem má draga.

import { useEffect, useRef, useState } from "react";
import { BoxSelect as HusTakn } from "lucide-react";
import { toast } from "sonner";
import { create } from "zustand";
import { hjolaThysjun } from "../../lib/board/hjol";
import { useErSimi } from "../../lib/board/simi";
import { useBoardStore } from "../../lib/board/store";
import type { BoardObject, ImageObject } from "../../lib/board/types";
import { heimsPunktar } from "../../lib/board/veggja-ritill";
import { ritillDilarAMetra, ritillVeggir } from "../../lib/board/veggja-ritill-adgerdir";
import { husKassi, lesaHandUtlinu, type HLina } from "../../lib/board/veggja-hreinsun";

type P = [number, number];

interface HusTeikning {
  teiknar: boolean;
  drog: P[];
  /** Spjaldið er opið: handföng útlínunnar sjást og má draga. */
  opin: boolean;
  byrja: () => void;
  haetta: () => void;
  setDrog: (d: P[]) => void;
}

export const useHusTeikning = create<HusTeikning>((set) => ({
  teiknar: false,
  drog: [],
  opin: false,
  byrja: () => set({ teiknar: true, drog: [] }),
  haetta: () => set({ teiknar: false, drog: [] }),
  setDrog: (drog) => set({ drog }),
}));

const finnaPlan = (s: { objects: BoardObject[] }): ImageObject | null =>
  s.objects.find((o): o is ImageObject => o.type === "image" && !!o.uttekt) ?? null;

/** Skrifar útlínuna á blaðið (borðhnit) — `null` = „Sjálfvirkt", ÁSETT hreinsun sem fjarlægir hana úr hæðinni við vistun
 * (undefined þýðir „ósnert", sjá skrifaStillingarIHaed). Skilar false ef borðið er ekki tengt hæð. */
function vistaUtlinu(flat: number[] | null): boolean {
  const b = useBoardStore.getState();
  const plan = finnaPlan(b);
  if (!plan?.uttekt) {
    toast.message("Opnaðu hæð úr úttekt — útlínan geymist á blaðinu");
    return false;
  }
  b.commitHistory();
  b.patchObject(plan.id, { uttekt: { ...plan.uttekt, husUtlina: flat } } as Partial<BoardObject>, false);
  return true;
}

const rond = (n: number) => Math.round(n * 10) / 10;

function ljukaUtlinu() {
  const h = useHusTeikning.getState();
  if (h.drog.length < 3) {
    toast.message("Útlínan þarf að minnsta kosti þrjú horn");
    return;
  }
  const flat = h.drog.flatMap((p) => [rond(p[0]), rond(p[1])]);
  if (vistaUtlinu(flat)) {
    h.haetta();
    toast.message(`Húsið stillt — ${h.drog.length} horn · vistast með „Vista í úttekt"`, { duration: 2600 });
  }
}

// ── yfirlagið ────────────────────────────────────────────────────────────────────────────────────────────

export function HusUtlinaYfirlag() {
  const plan = useBoardStore(finnaPlan);
  const cam = useBoardStore((s) => s.camera);
  const teiknar = useHusTeikning((s) => s.teiknar);
  const drog = useHusTeikning((s) => s.drog);
  const opin = useHusTeikning((s) => s.opin);
  const wrapRef = useRef<HTMLDivElement>(null);
  const nidur = useRef<{ x: number; y: number } | null>(null);
  const pan = useRef<{ sx: number; sy: number; cx: number; cy: number } | null>(null);
  const [bendill, setBendill] = useState<P | null>(null);
  /** Horn á færslu (i) — `ny`: nýtt horn sem var dregið út úr miðju hliðar. */
  const [fl, setFl] = useState<{ i: number; p: P; ny?: boolean } | null>(null);

  const hand = lesaHandUtlinu(plan?.uttekt?.husUtlina);
  const grunn: P[] = hand ? Array.from({ length: hand.length / 2 }, (_, i) => [hand[2 * i], hand[2 * i + 1]] as P) : [];
  const punktar: P[] = fl ? (fl.ny ? [...grunn.slice(0, fl.i), fl.p, ...grunn.slice(fl.i)] : grunn.map((p, i) => (i === fl.i ? fl.p : p))) : grunn;

  const tilHeims = (cx: number, cy: number): P => {
    const r = wrapRef.current?.getBoundingClientRect();
    const c = useBoardStore.getState().camera;
    return [(cx - (r?.left ?? 0) - c.x) / c.scale, (cy - (r?.top ?? 0) - c.y) / c.scale];
  };
  const tilSkjas = (p: P): P => [p[0] * cam.scale + cam.x, p[1] * cam.scale + cam.y];

  // Lyklar: skráð við uppsetningu (ekki þegar teikning hefst) og því á UNDAN lyklaborðsvél ritilsins — hún eyðir völdum
  // veggjum á Backspace/Delete og myndi gera það meðan útlínan er teiknuð. Þetta yfirlag er því teiknað á undan RitilYfirlag.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const h = useHusTeikning.getState();
      if (!h.teiknar) return;
      if (e.target instanceof Element && e.target.closest('input,textarea,[contenteditable="true"],[role="dialog"],[role="alertdialog"]')) return;
      const stoppa = () => {
        e.preventDefault();
        e.stopImmediatePropagation();
      };
      const meta = e.ctrlKey || e.metaKey;
      if (e.key === "Escape") {
        stoppa();
        h.haetta();
      } else if (e.key === "Enter") {
        stoppa();
        ljukaUtlinu();
      } else if (e.key === "Backspace" || e.key === "Delete" || (meta && e.key.toLowerCase() === "z")) {
        stoppa();
        h.setDrog(h.drog.slice(0, -1));
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // hjól = zoom meðan teiknað er (yfirlagið tekur við bendlinum af ritlinum)
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !teiknar) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      const k = useBoardStore.getState().camera;
      const fx = (px - k.x) / k.scale, fy = (py - k.y) / k.scale;
      const scale = Math.min(16, Math.max(0.04, k.scale * hjolaThysjun(e)));
      useBoardStore.getState().setCamera({ scale, x: px - fx * scale, y: py - fy * scale });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [teiknar]);

  const laesa = (X: P, shift: boolean): P => {
    const s = useHusTeikning.getState().drog;
    const sidasta = s[s.length - 1];
    if (!shift || !sidasta) return X;
    return Math.abs(X[0] - sidasta[0]) >= Math.abs(X[1] - sidasta[1]) ? [X[0], sidasta[1]] : [sidasta[0], X[1]];
  };

  const baeta = (X: P) => {
    const h = useHusTeikning.getState();
    const k = useBoardStore.getState().camera;
    if (h.drog.length >= 3 && Math.hypot(X[0] - h.drog[0][0], X[1] - h.drog[0][1]) <= 14 / k.scale) return ljukaUtlinu();
    const sidasta = h.drog[h.drog.length - 1];
    // tvísmellur bætir ekki við tvíteknu horni (fyrri smellurinn bætti því við)
    if (sidasta && Math.hypot(X[0] - sidasta[0], X[1] - sidasta[1]) <= 6 / k.scale) return;
    h.setDrog([...h.drog, X]);
  };

  const vistaHorn = (flat: number[]) => {
    if (vistaUtlinu(flat)) setFl(null);
  };
  const flat = (p: P[]) => p.flatMap((q) => [rond(q[0]), rond(q[1])]);

  const r = 7;
  const forskodun: P[] = teiknar ? (bendill && drog.length ? [...drog, laesa(bendill, false)] : drog) : punktar;

  return (
    <div
      ref={wrapRef}
      data-hus-yfirlag={teiknar ? "teiknar" : "hvilir"}
      className="absolute inset-0"
      style={{ zIndex: 5, pointerEvents: teiknar ? "auto" : "none", touchAction: "none", cursor: teiknar ? "crosshair" : undefined }}
      onPointerDown={(e) => {
        if (!teiknar) return;
        e.preventDefault();
        wrapRef.current?.setPointerCapture(e.pointerId);
        const b = useBoardStore.getState();
        if (e.button === 1 || e.button === 2 || b.spacePan) {
          pan.current = { sx: e.clientX, sy: e.clientY, cx: b.camera.x, cy: b.camera.y };
          return;
        }
        if (e.button === 0) nidur.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerMove={(e) => {
        if (!teiknar) return;
        if (pan.current) {
          const c = useBoardStore.getState().camera;
          useBoardStore.getState().setCamera({ scale: c.scale, x: pan.current.cx + e.clientX - pan.current.sx, y: pan.current.cy + e.clientY - pan.current.sy });
          return;
        }
        setBendill(laesa(tilHeims(e.clientX, e.clientY), e.shiftKey));
      }}
      onPointerUp={(e) => {
        if (!teiknar) return;
        if (pan.current) {
          pan.current = null;
          return;
        }
        const n = nidur.current;
        nidur.current = null;
        // dráttur (færsla) er ekki smellur — annars bættist horn við í hvert sinn sem borðið er fært
        if (!n || Math.hypot(e.clientX - n.x, e.clientY - n.y) > 6) return;
        baeta(laesa(tilHeims(e.clientX, e.clientY), e.shiftKey));
      }}
      onPointerCancel={() => {
        pan.current = null;
        nidur.current = null;
      }}
      onDoubleClick={() => teiknar && ljukaUtlinu()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
        {forskodun.length >= 2 ? (
          <polyline
            points={forskodun.map((p) => tilSkjas(p).join(",")).join(" ") + (!teiknar || drog.length >= 3 ? " " + tilSkjas(forskodun[0]).join(",") : "")}
            fill={!teiknar ? "rgba(254,101,63,0.07)" : "none"}
            stroke={APPELSINA}
            strokeWidth={2}
            strokeDasharray={teiknar ? "0" : "7 5"}
            strokeLinejoin="round"
            opacity={teiknar ? 1 : 0.9}
          />
        ) : null}
        {teiknar
          ? drog.map((p, i) => {
              const [x, y] = tilSkjas(p);
              const fyrsti = i === 0 && drog.length >= 3;
              return <circle key={i} cx={x} cy={y} r={fyrsti ? r + 3 : r - 2} fill={fyrsti ? "rgba(254,101,63,0.25)" : APPELSINA} stroke={APPELSINA} strokeWidth={2} />;
            })
          : null}
        {/* handföng (spjaldið opið): dragðu horn; miðja hliðar býr til nýtt horn; tvísmellur á horn eyðir því */}
        {!teiknar && opin && punktar.length >= 3
          ? punktar.map((p, i) => {
              const [x, y] = tilSkjas(p);
              const naest = punktar[(i + 1) % punktar.length];
              const [mx, my] = tilSkjas([(p[0] + naest[0]) / 2, (p[1] + naest[1]) / 2]);
              return (
                <g key={i}>
                  <circle
                    cx={mx}
                    cy={my}
                    r={r - 2}
                    fill="rgba(20,20,24,0.85)"
                    stroke={APPELSINA}
                    strokeWidth={1.5}
                    style={{ pointerEvents: "auto", cursor: "copy" }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      e.currentTarget.setPointerCapture(e.pointerId);
                      setFl({ i: i + 1, p: tilHeims(e.clientX, e.clientY), ny: true });
                    }}
                    onPointerMove={(e) => fl?.ny && fl.i === i + 1 && setFl({ i: i + 1, p: tilHeims(e.clientX, e.clientY), ny: true })}
                    onPointerUp={() => fl?.ny && fl.i === i + 1 && vistaHorn(flat(punktar))}
                  />
                  <circle
                    cx={x}
                    cy={y}
                    r={r}
                    fill={APPELSINA}
                    stroke="#fff"
                    strokeWidth={2}
                    style={{ pointerEvents: "auto", cursor: "grab" }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      e.currentTarget.setPointerCapture(e.pointerId);
                      setFl({ i, p: p });
                    }}
                    onPointerMove={(e) => fl && !fl.ny && fl.i === i && setFl({ i, p: tilHeims(e.clientX, e.clientY) })}
                    onPointerUp={() => fl && !fl.ny && fl.i === i && vistaHorn(flat(punktar))}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      if (punktar.length <= 3) return toast.message("Útlínan þarf að minnsta kosti þrjú horn");
                      vistaHorn(flat(grunn.filter((_, j) => j !== i)));
                    }}
                  />
                </g>
              );
            })
          : null}
      </svg>
    </div>
  );
}

const APPELSINA = "#FE653F";

// ── spjaldið ─────────────────────────────────────────────────────────────────────────────────────────────

/** „Húsið" — í Veggir-spjaldinu rétt undir „Halli blaðsins". */
export function HusUtlinaStilling() {
  const simi = useErSimi();
  const [opid, setOpid] = useState(false);
  const teiknar = useHusTeikning((s) => s.teiknar);
  const drog = useHusTeikning((s) => s.drog);
  const plan = useBoardStore(finnaPlan);
  const hand = lesaHandUtlinu(plan?.uttekt?.husUtlina);
  // ENGIN flatarmálstala: ritillDilarAMetra ÁGISKAR kvarðann (A1 í 1:100) þegar enginn kvarði er settur, og mælt 06.11.2026 á
  // 2. hæð Breiðhöfða gaf það 1735 m² fyrir hús sem er um þrefalt stærra. Rangt tal í viðmóti er verra en ekkert.

  useEffect(() => {
    useHusTeikning.setState({ opin: opid });
    return () => {
      useHusTeikning.setState({ opin: false });
      if (opid) useHusTeikning.getState().haetta();
    };
  }, [opid]);
  // Spjaldið fer burt (ritill lokaður) meðan teiknað er: teikningin hættir, annars lifir hún í minni án yfirlags
  useEffect(() => () => useHusTeikning.getState().haetta(), []);

  const reitur = simi ? "py-2 text-[13px]" : "py-0.5 text-[10.5px]";

  const kassiVelarinnar = () => {
    const b = useBoardStore.getState();
    const d = ritillDilarAMetra(b.objects, b.pixelsPerMeter);
    const linur: HLina[] = ritillVeggir().map((o) => ({ p: heimsPunktar(o), t: o.strokeWidth }));
    const k = d && linur.length >= 4 ? husKassi(linur, d, { spassia: 0.02 }) : null;
    if (!k) {
      toast.message("Vélin finnur ekkert hús á borðinu — teiknaðu útlínuna");
      return;
    }
    if (vistaUtlinu([k.x0, k.y0, k.x1, k.y0, k.x1, k.y1, k.x0, k.y1].map(rond)))
      toast.message("Byrjað á kassa vélarinnar — dragðu hornin, eða miðjur hliðanna til að bæta við horni", { duration: 3200 });
  };

  return (
    <div className="mt-1.5" data-veggir-hus>
      <button
        type="button"
        onClick={() => setOpid(!opid)}
        title="Útlína hússins ræður hverju er hent sem „utan húss“, hvar gólfið liggur í 3D og hvar hurðirnar finnast. Teiknaðu hana sjálfur ef vélin finnur hana ekki."
        className={`flex w-full items-center justify-between gap-1 rounded-md px-1 text-white/80 hover:bg-white/8 ${simi ? "py-2 text-[13px]" : "py-0.5 text-[11px]"}`}
      >
        <span className="flex items-center gap-1.5">
          <HusTakn className="size-3.5 text-amber-300" />
          Húsið
        </span>
        <span className="tabular-nums text-white/60">{teiknar ? `teikna · ${drog.length} horn` : hand ? `handteiknað · ${hand.length / 2} horn` : "vélin ræður"}</span>
      </button>
      {opid ? (
        <div className="mt-1 rounded-md bg-white/5 p-1.5">
          <div className="text-[10.5px] leading-snug text-white/55" data-veggir-hus-texti>
            {teiknar
              ? "Smelltu á hornin á húsinu. Smelltu á fyrsta punkt, ýttu á Enter eða tvísmelltu til að loka. Shift = beint, Backspace tekur síðasta horn, Esc hættir. Hjól og hægri músartakki færa borðið."
              : hand
                ? `Útlínan er handteiknuð og gengur ALLTAF fyrir útreikningi vélarinnar. Dragðu horn til að laga, miðju hliðar til að bæta við horni, tvísmelltu á horn til að eyða því. Vistast með „Vista í úttekt".`
                : "Vélin finnur útlínu hússins úr veggjunum og getur mistekist (op án hurðar) — þá fer hún aðeins eftir kassa. Teiknaðu húsið sjálfur og það gengur alltaf fyrir."}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {teiknar ? (
              <>
                <button type="button" data-veggir-hus-loka onClick={ljukaUtlinu} disabled={drog.length < 3} className={`rounded bg-white/10 px-2 hover:bg-white/15 disabled:opacity-40 ${reitur}`}>
                  Loka útlínu
                </button>
                <button type="button" onClick={() => useHusTeikning.getState().setDrog(drog.slice(0, -1))} disabled={!drog.length} className={`rounded bg-white/10 px-2 hover:bg-white/15 disabled:opacity-40 ${reitur}`}>
                  Taka horn
                </button>
                <button type="button" onClick={() => useHusTeikning.getState().haetta()} className={`rounded bg-white/10 px-2 hover:bg-white/15 ${reitur}`}>
                  Hætta
                </button>
              </>
            ) : (
              <>
                <button type="button" data-veggir-hus-teikna onClick={() => useHusTeikning.getState().byrja()} className={`rounded bg-white/10 px-2 hover:bg-white/15 ${reitur}`}>
                  {hand ? "Teikna aftur" : "Teikna húsið"}
                </button>
                <button type="button" data-veggir-hus-kassi onClick={kassiVelarinnar} className={`rounded bg-white/10 px-2 hover:bg-white/15 ${reitur}`} title="Byrjar á kassa sem vélin finnur utan um veggina — þú lagar hornin">
                  Kassi vélarinnar
                </button>
                <button type="button" data-veggir-hus-sjalf onClick={() => vistaUtlinu(null) && toast.message("Vélin reiknar útlínuna aftur", { duration: 1800 })} disabled={!hand} className={`rounded bg-white/10 px-2 hover:bg-white/15 disabled:opacity-40 ${reitur}`}>
                  Sjálfvirkt
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
