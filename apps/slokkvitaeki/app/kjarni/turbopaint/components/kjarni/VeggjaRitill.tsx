"use client";

// Veggjaritillinn (Agnar 06.10.2026: „venjulegi veggja-generatorinn er mjög lélegur, ég get varla eytt veggjum eða
// bætt nýjum við, ég þarf miklu meiri fídusa til að klára restina sjálfur").
//
// Sérstakur hamur í „Teikning og greining": yfirlag ofan á borðinu tekur við músinni svo smellur getur aldrei fært eða
// valið teikninguna (lagið „Teikning" er auk þess læst meðan ritillinn er opinn). Aðeins veggir eru valdir og breytt.
//   W teikna (smellt horn af horni, smellur á enda/línur, Shift = 0/45/90°) · R rétthyrningur → 4 veggir
//   V velja (smellur, Shift+smellur, kassi; Ctrl+A) · Delete eyðir · B eyða í kassa
//   dráttur: endapunktur (tengdir endar fylgja, Alt losar) eða heill veggur · S kljúfa · L lengja að · J sameina
// Hver aðgerð er ein ⌘Z-færsla í sögu borðsins; vistun í úttekt (veggjaLinur + tegund + leidrett) er óbreytt.

import {
  BoxSelect,
  Eye,
  EyeOff,
  HelpCircle,
  Lock,
  MousePointer2,
  PencilLine,
  PencilRuler,
  ScanSearch,
  Scissors,
  Square,
  Trash2,
  Unlock,
  X,
  MoveHorizontal,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useHamur, type HamurId } from "../../lib/board/hamir";
import { LAYER_TEIKNING, LAYER_VEGGIR } from "../../lib/board/layers";
import { useBoardStore } from "../../lib/board/store";
import type { VeggTegund } from "../../lib/board/teikning-veggir";
import type { LineObject } from "../../lib/board/types";
import { erVeggur, tengjaVeggi, tengjaVikmork, VEGG_LITIR } from "../../lib/board/veggja-leidretting";
import {
  faeraEnda,
  greiningarLotur,
  heimsPunktar,
  hlidra,
  metraTexti,
  rettHyrningur,
  smella,
  talningTexti,
  tengdirEndar,
  THYKKTIR_CM,
  veggirIKassa,
  veggjaTalning,
  veggurVid,
  type P,
  type Smellur,
} from "../../lib/board/veggja-ritill";
import {
  cmIDila,
  eydaVeggjum,
  foreldriFyrir,
  fyllaBil,
  kljufa,
  lengja,
  nyirVeggir,
  ritillDilarAMetra,
  ritillVeggir,
  sameina,
  setjaThykkt,
  setjaTegund,
  skiptaUt,
  valdirVeggir,
} from "../../lib/board/veggja-ritill-adgerdir";
import { TOL_HEITI, useVeggjaRitill, type RitilTol } from "../../lib/board/veggja-ritill-stada";
import { newId } from "../../lib/board/store";
import { VeggjaGreining } from "./VeggjaGreining";

/** Hamirnir þar sem ritillinn býr. */
export const RITIL_HAMIR: HamurId[] = ["teikning"];

function isTyping(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
}

const TEGUNDIR: { id: VeggTegund; texti: string; lykill: string }[] = [
  { id: "veggur", texti: "Veggur", lykill: "1" },
  { id: "gler", texti: "Gler", lykill: "2" },
  { id: "hurd", texti: "Hurð", lykill: "3" },
];

/** Aðgerðir á völdum veggjum — sameiginlegar lyklaborðinu, spjaldinu og veggjastikunni. */
export function tengjaValda() {
  const s = useBoardStore.getState();
  const valdir = valdirVeggir();
  if (!valdir.length) return toast.message("Veldu veggi fyrst");
  const st = tengjaVikmork(valdir.length, ritillDilarAMetra(s.objects, s.pixelsPerMeter), valdir.map((o) => o.strokeWidth));
  const r = tengjaVeggi(valdir, ritillVeggir(), st);
  if (!r.punktar.size) return toast.message("Ekkert að tengja — endarnir eru þegar tengdir eða of langt á milli");
  s.updateObjects([...r.punktar.keys()], (o) =>
    (o.type === "polyline" || o.type === "line") && r.punktar.has(o.id) ? { ...o, points: r.punktar.get(o.id)! } : o
  );
  toast.success(`Tengt: ${r.fjoldi} samskeyti · ⌘Z afturkallar`);
}

export function sameinaValda() {
  const ids = valdirVeggir().map((o) => o.id);
  const villa = sameina(ids);
  if (villa) toast.error(villa);
  else toast.success(`${ids.length} veggir sameinaðir í einn · ⌘Z afturkallar`);
}

export function lengjaValda() {
  const s = useBoardStore.getState();
  const v = new Set(valdirVeggir().map((o) => o.id));
  const rod = s.selectedIds.filter((id) => v.has(id));
  if (rod.length !== 2) return toast.message("Veldu tvo veggi: fyrst þann sem á að lengja, svo (Shift) þann sem hann á að mæta");
  if (lengja(rod[0], rod[1])) toast.success("Veggurinn lengdur/styttur að hinum · ⌘Z afturkallar");
  else toast.error("Veggirnir eru samsíða — ekkert skurðpunktur");
}

export function hurdIBilValda() {
  const v = valdirVeggir();
  if (v.length !== 2) return toast.message("Veldu tvo samlínu veggi með opi á milli");
  if (fyllaBil(v[0].id, v[1].id, "hurd")) toast.success("Hurð sett í bilið · ⌘Z afturkallar");
  else toast.error("Veggirnir eru ekki í beinni línu með bil á milli");
}

export function VeggjaRitill() {
  const virkur = useVeggjaRitill((s) => s.virkur);
  const forskodun = useVeggjaRitill((s) => s.forskodun);
  const greining = useVeggjaRitill((s) => s.greining);
  const hjalp = useVeggjaRitill((s) => s.hjalp);

  // W í Teikning-ham opnar ritilinn beint með teikni-tólinu (annars væri það gamla „Veggir"-línutólið)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (useVeggjaRitill.getState().virkur) return;
      if (e.key.toLowerCase() !== "w" || !RITIL_HAMIR.includes(useHamur.getState().hamur)) return;
      if (!useBoardStore.getState().objects.some((o) => o.type === "image")) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      useVeggjaRitill.getState().kveikja("teikna");
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // Ritillinn lokast ef farið er í annan ham eða annað tól valið úr verkfærasúlunni
  useEffect(() => {
    const u1 = useHamur.subscribe((s) => {
      if (!RITIL_HAMIR.includes(s.hamur)) useVeggjaRitill.getState().slokkva();
    });
    const u2 = useBoardStore.subscribe((s, p) => {
      if (s.tool !== p.tool && s.tool !== "select" && useVeggjaRitill.getState().virkur) useVeggjaRitill.getState().slokkva();
    });
    return () => {
      u1();
      u2();
    };
  }, []);

  return (
    <>
      {virkur || forskodun ? <RitilYfirlag virkur={virkur} /> : null}
      {virkur ? <RitilSpjald /> : <RitilOpnari />}
      {virkur && hjalp ? <RitilHjalp /> : null}
      {greining ? <VeggjaGreining key={greining.planId} planId={greining.planId} /> : null}
    </>
  );
}

type Drag =
  | { kind: "pan"; sx: number; sy: number; cx: number; cy: number }
  | { kind: "kassi"; A: P; B: P; eyda: boolean; baeta: boolean; sx: number; sy: number }
  | { kind: "rettur"; A: P; B: P }
  // Agnar 07.10.2026: „hún dregst þegar ég held inni vinstri músartakkanum og stoppar þegar ég sleppi" — einn veggur á drátt
  | { kind: "teikna-drag"; sx: number; sy: number }
  | { kind: "endi"; id: string; hlid: 0 | 1; fylgja: { id: string; hlid: 0 | 1 }[]; akkeri: P; byrjad: boolean; sx: number; sy: number }
  | { kind: "faera"; ids: string[]; X0: P; upphaf: Map<string, LineObject>; smellId: string; byrjad: boolean; sx: number; sy: number; varValinn: boolean }
  | { kind: "pinch"; dist: number; mid: P };

const APPELSINA = "#FE653F";

function RitilYfirlag({ virkur }: { virkur: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bendill = useRef<P | null>(null);
  const skjaBendill = useRef<{ x: number; y: number } | null>(null);
  const smellurRef = useRef<Smellur | null>(null);
  const sveima = useRef<string | null>(null);
  const kedja = useRef<P[]>([]);
  const drag = useRef<Drag | null>(null);
  const lengjaFyrsti = useRef<string | null>(null);
  const shift = useRef(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const raf = useRef(0);

  const cam = () => useBoardStore.getState().camera;
  const vik = () => 10 / cam().scale;
  const lasVirkur = () => useVeggjaRitill.getState().hornalas !== shift.current;

  const tilHeims = useCallback((cx: number, cy: number): P => {
    const r = wrapRef.current?.getBoundingClientRect();
    const c = useBoardStore.getState().camera;
    return [(cx - (r?.left ?? 0) - c.x) / c.scale, (cy - (r?.top ?? 0) - c.y) / c.scale];
  }, []);

  // ── teikning yfirlagsins ─────────────────────────────────────────────────────────────────────────────
  const teikna = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const W = c.width / dpr, H = c.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const b = useBoardStore.getState();
    const r = useVeggjaRitill.getState();
    const k = b.camera;
    const sx = (x: number) => x * k.scale + k.x, sy = (y: number) => y * k.scale + k.y;
    const slod = (pts: number[]) => {
      ctx.moveTo(sx(pts[0]), sy(pts[1]));
      for (let i = 2; i + 1 < pts.length; i += 2) ctx.lineTo(sx(pts[i]), sy(pts[i + 1]));
    };
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // forskoðun greiningar: veggirnir sem yrðu til (grænir / gler blátt) og línur valinna flokka (appelsínugular)
    if (r.forskodun) {
      for (const v of r.forskodun.veggir) {
        ctx.beginPath();
        slod(v.p);
        ctx.strokeStyle = v.tegund === "gler" ? "rgba(37,99,235,0.55)" : v.tegund === "hurd" ? "rgba(180,83,9,0.55)" : "rgba(22,163,74,0.5)";
        ctx.lineWidth = Math.max(5, v.t * k.scale + 4);
        ctx.stroke();
      }
      ctx.beginPath();
      for (const s of r.forskodun.linur) {
        ctx.moveTo(sx(s[0]), sy(s[1]));
        ctx.lineTo(sx(s[2]), sy(s[3]));
      }
      ctx.strokeStyle = "rgba(234,88,12,0.95)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    if (!virkur) return;

    const V = ritillVeggir();
    const sel = new Set(b.selectedIds);
    // sveimaður veggur
    const sv = sveima.current && !sel.has(sveima.current) ? V.find((o) => o.id === sveima.current) : null;
    if (sv) {
      ctx.beginPath();
      slod(heimsPunktar(sv));
      ctx.strokeStyle = "rgba(254,101,63,0.35)";
      ctx.lineWidth = sv.strokeWidth * k.scale + 8;
      ctx.stroke();
    }
    // fyrsti veggur „Lengja að"
    const lf = lengjaFyrsti.current ? V.find((o) => o.id === lengjaFyrsti.current) : null;
    if (lf) {
      ctx.beginPath();
      slod(heimsPunktar(lf));
      ctx.strokeStyle = "rgba(37,99,235,0.6)";
      ctx.lineWidth = lf.strokeWidth * k.scale + 8;
      ctx.stroke();
    }
    // valdir veggir
    const valdir = V.filter((o) => sel.has(o.id));
    for (const o of valdir) {
      ctx.beginPath();
      slod(heimsPunktar(o));
      ctx.strokeStyle = "rgba(254,101,63,0.45)";
      ctx.lineWidth = o.strokeWidth * k.scale + 6;
      ctx.stroke();
    }
    ctx.beginPath();
    for (const o of valdir) slod(heimsPunktar(o));
    ctx.strokeStyle = APPELSINA;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // endapunktar valinna veggja (handföng)
    if (valdir.length <= 80) {
      for (const o of valdir) {
        const p = heimsPunktar(o);
        for (const i of [0, p.length - 2]) {
          ctx.fillStyle = "#fff";
          ctx.strokeStyle = APPELSINA;
          ctx.lineWidth = 2;
          ctx.fillRect(sx(p[i]) - 5, sy(p[i + 1]) - 5, 10, 10);
          ctx.strokeRect(sx(p[i]) - 5, sy(p[i + 1]) - 5, 10, 10);
        }
      }
    }

    const merki = (texti: string, x: number, y: number) => {
      ctx.font = "600 12px system-ui, sans-serif";
      const w = ctx.measureText(texti).width + 12;
      ctx.fillStyle = "rgba(26,29,46,0.92)";
      ctx.beginPath();
      ctx.roundRect(x, y, w, 20, 10);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillText(texti, x + 6, y + 14);
    };
    const dpm = ritillDilarAMetra(b.objects, b.pixelsPerMeter);
    const thykkt = cmIDila(r.thykktCm, dpm);
    const litur = VEGG_LITIR[r.tegund];

    // vegg-keðjan í vinnslu
    const d = drag.current;
    const sm = smellurRef.current;
    if (r.tol === "teikna" && kedja.current.length && sm) {
      const A = kedja.current[kedja.current.length - 1];
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.moveTo(sx(A[0]), sy(A[1]));
      ctx.lineTo(sx(sm.P[0]), sy(sm.P[1]));
      ctx.strokeStyle = r.tegund === "veggur" ? "#1c1917" : litur;
      ctx.lineWidth = Math.max(2, thykkt * k.scale);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.moveTo(sx(A[0]), sy(A[1]));
      ctx.lineTo(sx(sm.P[0]), sy(sm.P[1]));
      ctx.strokeStyle = APPELSINA;
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      const L = Math.hypot(sm.P[0] - A[0], sm.P[1] - A[1]);
      const horn = Math.round((Math.atan2(-(sm.P[1] - A[1]), sm.P[0] - A[0]) * 180) / Math.PI);
      merki(`${metraTexti(L, dpm)} · ${(horn + 360) % 360}°`, sx(sm.P[0]) + 14, sy(sm.P[1]) + 10);
    }
    if (d?.kind === "rettur") {
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      const x0 = Math.min(d.A[0], d.B[0]), x1 = Math.max(d.A[0], d.B[0]), y0 = Math.min(d.A[1], d.B[1]), y1 = Math.max(d.A[1], d.B[1]);
      slod([x0, y0, x1, y0, x1, y1, x0, y1, x0, y0]);
      ctx.strokeStyle = r.tegund === "veggur" ? "#1c1917" : litur;
      ctx.lineWidth = Math.max(2, thykkt * k.scale);
      ctx.stroke();
      ctx.globalAlpha = 1;
      merki(`${metraTexti(x1 - x0, dpm)} × ${metraTexti(y1 - y0, dpm)}`, sx(x1) + 10, sy(y1) + 6);
    }
    if (d?.kind === "kassi") {
      const inni = d.B[0] >= d.A[0];
      const x = sx(Math.min(d.A[0], d.B[0])), y = sy(Math.min(d.A[1], d.B[1]));
      const w = Math.abs(d.B[0] - d.A[0]) * k.scale, h = Math.abs(d.B[1] - d.A[1]) * k.scale;
      const lit = d.eyda ? "220,38,38" : inni ? "37,99,235" : "22,163,74";
      ctx.fillStyle = `rgba(${lit},0.08)`;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = `rgba(${lit},0.9)`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash(inni ? [] : [6, 4]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
      merki((d.eyda ? "Eyða: " : "") + (inni ? "allur veggurinn inni" : "snertir"), x + w + 8, y + h + 4);
    }
    if (d?.kind === "endi" && d.byrjad) {
      const o = V.find((v) => v.id === d.id);
      if (o) {
        const p = heimsPunktar(o);
        merki(metraTexti(Math.hypot(p[p.length - 2] - p[0], p[p.length - 1] - p[1]), dpm), sx(p[d.hlid === 0 ? 0 : p.length - 2]) + 14, sy(p[d.hlid === 0 ? 1 : p.length - 1]) + 10);
      }
    }
    // smell-vísir
    if (sm && (r.tol === "teikna" || r.tol === "rettur" || d?.kind === "endi")) {
      const X = sx(sm.P[0]), Y = sy(sm.P[1]);
      ctx.strokeStyle = sm.tegund ? APPELSINA : "rgba(26,29,46,0.8)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (sm.tegund === "endi") ctx.rect(X - 7, Y - 7, 14, 14);
      else if (sm.tegund === "lina") {
        ctx.moveTo(X - 7, Y - 7);
        ctx.lineTo(X + 7, Y + 7);
        ctx.moveTo(X + 7, Y - 7);
        ctx.lineTo(X - 7, Y + 7);
      } else {
        ctx.moveTo(X - 9, Y);
        ctx.lineTo(X + 9, Y);
        ctx.moveTo(X, Y - 9);
        ctx.lineTo(X, Y + 9);
      }
      ctx.stroke();
    }
  }, [virkur]);

  const teiknaNu = useCallback(() => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(teikna);
  }, [teikna]);

  // stærð strigans fylgir borðinu
  useEffect(() => {
    const el = wrapRef.current, c = canvasRef.current;
    if (!el || !c) return;
    const stilla = () => {
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.max(1, Math.round(el.clientWidth * dpr));
      c.height = Math.max(1, Math.round(el.clientHeight * dpr));
      c.style.width = el.clientWidth + "px";
      c.style.height = el.clientHeight + "px";
      teiknaNu();
    };
    stilla();
    const ro = new ResizeObserver(stilla);
    ro.observe(el);
    return () => ro.disconnect();
  }, [teiknaNu]);

  useEffect(() => {
    const u1 = useBoardStore.subscribe(teiknaNu);
    const u2 = useVeggjaRitill.subscribe((s, p) => {
      if (s.tol !== p.tol) {
        kedja.current = [];
        lengjaFyrsti.current = null;
        smellurRef.current = null;
      }
      teiknaNu();
    });
    return () => {
      u1();
      u2();
      cancelAnimationFrame(raf.current);
    };
  }, [teiknaNu]);

  // hjól = zoom (ekki óvirkt: preventDefault)
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !virkur) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      const k = useBoardStore.getState().camera;
      const fx = (px - k.x) / k.scale, fy = (py - k.y) / k.scale;
      const factor = e.ctrlKey || e.metaKey ? 1.12 : 1.08;
      const scale = Math.min(16, Math.max(0.04, k.scale * (e.deltaY > 0 ? 1 / factor : factor)));
      useBoardStore.getState().setCamera({ scale, x: px - fx * scale, y: py - fy * scale });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [virkur]);

  // ── keðja ────────────────────────────────────────────────────────────────────────────────────────────
  const ljukaKedju = useCallback(() => {
    kedja.current = [];
    smellurRef.current = null;
    teiknaNu();
  }, [teiknaNu]);

  const smellaHer = (X: P): Smellur => {
    const k = kedja.current;
    return smella(X, ritillVeggir(), { vik: vik(), akkeri: k.length ? k[k.length - 1] : null, hornalas: lasVirkur() });
  };

  const baetaVidKedju = (Pt: P) => {
    const k = kedja.current;
    if (!k.length) {
      kedja.current = [Pt];
      return;
    }
    const A = k[k.length - 1];
    if (Math.hypot(Pt[0] - A[0], Pt[1] - A[1]) * cam().scale < 3) return; // tvísmellur / sami punktur
    const r = useVeggjaRitill.getState(), b = useBoardStore.getState();
    const [ny] = nyirVeggir([[A[0], A[1], Pt[0], Pt[1]]], r.tegund, cmIDila(r.thykktCm, ritillDilarAMetra(b.objects, b.pixelsPerMeter)));
    b.addObjects([ny], false);
    if (k.length >= 2 && Math.hypot(Pt[0] - k[0][0], Pt[1] - k[0][1]) < 1e-6) {
      kedja.current = [];
      toast.message("Lokuð keðja — veggirnir mætast", { duration: 1500 });
      return;
    }
    k.push(Pt);
  };

  // ── lyklaborð (aðeins meðan ritillinn er virkur) ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!virkur) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      // Lyklar í glugga (t.d. „Hætta við" í staðfestingu greiningar — Enter á að smella á hnappinn) stýra ekki ritlinum.
      if (e.target instanceof Element && e.target.closest('[role="dialog"],[role="alertdialog"]')) return;
      if (e.key === "Shift") {
        shift.current = true;
        if (bendill.current && useVeggjaRitill.getState().tol === "teikna") smellurRef.current = smellaHer(bendill.current);
        teiknaNu();
        return;
      }
      const meta = e.ctrlKey || e.metaKey;
      const r = useVeggjaRitill.getState();
      const b = useBoardStore.getState();
      const stoppa = () => {
        e.preventDefault();
        e.stopImmediatePropagation();
      };
      if (meta) {
        const k = e.key.toLowerCase();
        if (k === "a") {
          stoppa();
          b.setSelected(ritillVeggir().map((o) => o.id));
          return;
        }
        // ⌘Z meðan keðja er í vinnslu: akkerið færist aftur um einn punkt (veggurinn sjálfur fer með sögunni)
        if (k === "z" && !e.shiftKey && kedja.current.length) {
          kedja.current.pop();
          if (kedja.current.length < 1) ljukaKedju();
        }
        return; // ⌘Z/⌘Y/⌘C … fara áfram til borðsins
      }
      if (e.key === " " || e.altKey || e.key === "Alt" || e.key === "Control" || e.key === "Meta") return;
      const sel = valdirVeggir().map((o) => o.id);
      const lykill = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const tolLyklar: Record<string, RitilTol> = { v: "velja", w: "teikna", r: "rettur", s: "kljufa", l: "lengja", b: "eyda-kassi" };
      if (lykill in tolLyklar) {
        stoppa();
        if (lykill === "l" && sel.length === 2) return lengjaValda();
        ljukaKedju();
        r.setTol(tolLyklar[lykill]);
        return;
      }
      switch (lykill) {
        case "Escape": {
          stoppa();
          if (kedja.current.length) return ljukaKedju();
          if (drag.current) {
            drag.current = null;
            return teiknaNu();
          }
          if (lengjaFyrsti.current) {
            lengjaFyrsti.current = null;
            return teiknaNu();
          }
          if (r.tol !== "velja") return r.setTol("velja");
          // Esc lokar ALDREI ritlinum (of auðvelt óvart) — „Loka" eða „Breyta veggjum" gera það
          if (b.selectedIds.length) b.setSelected([]);
          return;
        }
        case "Enter":
          stoppa();
          return ljukaKedju();
        case "Delete":
        case "Backspace": {
          stoppa();
          const n = eydaVeggjum(sel);
          if (n) toast.message(`${n} ${n === 1 ? "veggur eyddur" : "veggjum eytt"} · ⌘Z afturkallar`, { duration: 1500 });
          return;
        }
        case "1":
        case "2":
        case "3": {
          stoppa();
          const t = TEGUNDIR[Number(lykill) - 1].id;
          if (sel.length) setjaTegund(sel, t);
          else r.setTegund(t);
          return;
        }
        case "[":
        case "]": {
          stoppa();
          const L: number[] = [...THYKKTIR_CM];
          const nu =
            lykill === "]"
              ? (L.find((x) => x > r.thykktCm) ?? L[L.length - 1])
              : ([...L].reverse().find((x) => x < r.thykktCm) ?? L[0]);
          r.setThykkt(nu);
          if (sel.length) setjaThykkt(sel, cmIDila(nu, ritillDilarAMetra(b.objects, b.pixelsPerMeter)));
          toast.message(`Þykkt ${nu} cm`, { duration: 1000 });
          return;
        }
        case "j":
          stoppa();
          return sameinaValda();
        case "t":
          stoppa();
          return tengjaValda();
        case "d":
          stoppa();
          return hurdIBilValda();
        case "?":
          stoppa();
          return r.setHjalp(!r.hjalp);
        case "ArrowLeft":
        case "ArrowRight":
        case "ArrowUp":
        case "ArrowDown": {
          stoppa();
          if (!sel.length) return;
          const s = (e.shiftKey ? 10 : 1) / cam().scale;
          const dx = lykill === "ArrowLeft" ? -s : lykill === "ArrowRight" ? s : 0;
          const dy = lykill === "ArrowUp" ? -s : lykill === "ArrowDown" ? s : 0;
          b.updateObjects(sel, (o) => (o.type === "polyline" || o.type === "line" ? hlidra(o, dx, dy) : o));
          return;
        }
        default:
          // aðrir stafir mega ekki skipta um tól borðsins (þá lokaðist ritillinn óvart)
          if (e.key.length === 1) stoppa();
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") {
        shift.current = false;
        if (bendill.current && useVeggjaRitill.getState().tol === "teikna") smellurRef.current = smellaHer(bendill.current);
        teiknaNu();
      }
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onUp, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onUp, true);
    };
    // smellaHer les aðeins refs og stöðu
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [virkur, ljukaKedju, teiknaNu]);

  // ── mús ──────────────────────────────────────────────────────────────────────────────────────────────
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!virkur) return;
    e.preventDefault();
    wrapRef.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b2] = [...pointers.current.values()];
      const mid = tilHeims((a.x + b2.x) / 2, (a.y + b2.y) / 2);
      drag.current = { kind: "pinch", dist: Math.hypot(a.x - b2.x, a.y - b2.y), mid };
      return;
    }
    const b = useBoardStore.getState();
    shift.current = e.shiftKey;
    if (e.button === 1 || e.button === 2 || b.spacePan) {
      drag.current = { kind: "pan", sx: e.clientX, sy: e.clientY, cx: b.camera.x, cy: b.camera.y };
      if (wrapRef.current) wrapRef.current.style.cursor = "grabbing";
      return;
    }
    if (e.button !== 0) return;
    const X = tilHeims(e.clientX, e.clientY);
    bendill.current = X;
    const V = ritillVeggir();
    const r = useVeggjaRitill.getState();
    switch (r.tol) {
      case "teikna": {
        const s = smellaHer(X);
        const iKedju = kedja.current.length > 0;
        baetaVidKedju(s.P);
        smellurRef.current = smellaHer(X);
        // Ný byrjun: haldið inni og dregið = EINN beinn veggur frá þessum punkti þangað sem músinni er sleppt.
        // (Smellur án dráttar heldur áfram í keðju-ham: smellur, smellur, … Enter.)
        if (!iKedju) drag.current = { kind: "teikna-drag", sx: e.clientX, sy: e.clientY };
        break;
      }
      case "rettur": {
        const s = smella(X, V, { vik: vik() });
        drag.current = { kind: "rettur", A: s.P, B: s.P };
        break;
      }
      case "eyda-kassi":
        drag.current = { kind: "kassi", A: X, B: X, eyda: true, baeta: false, sx: e.clientX, sy: e.clientY };
        break;
      case "kljufa": {
        const h = veggurVid(X, V, vik());
        if (!h) {
          toast.message("Smelltu á vegg þar sem á að kljúfa hann");
          break;
        }
        if (kljufa(h.o.id, h.Q)) toast.success("Veggurinn klofinn í tvennt · ⌘Z afturkallar", { duration: 1500 });
        else toast.message("Of nálægt enda — smelltu innar á vegginn");
        break;
      }
      case "lengja": {
        const h = veggurVid(X, V, vik());
        if (!h) {
          toast.message("Smelltu á vegg");
          break;
        }
        if (!lengjaFyrsti.current || lengjaFyrsti.current === h.o.id) {
          lengjaFyrsti.current = h.o.id;
          toast.message("Smelltu nú á vegginn sem hann á að mæta", { duration: 2000 });
        } else {
          if (lengja(lengjaFyrsti.current, h.o.id)) toast.success("Veggurinn lengdur/styttur að hinum · ⌘Z afturkallar", { duration: 1500 });
          else toast.error("Veggirnir eru samsíða — ekkert skurðpunktur");
          lengjaFyrsti.current = null;
        }
        break;
      }
      case "velja": {
        const sel = b.selectedIds;
        // handfang (endapunktur valins veggjar) gengur fyrir
        const hv = 8 / b.camera.scale;
        for (const o of V) {
          if (!sel.includes(o.id)) continue;
          const p = heimsPunktar(o);
          for (const hlid of [0, 1] as const) {
            const i = hlid === 0 ? 0 : p.length - 2;
            if (Math.hypot(p[i] - X[0], p[i + 1] - X[1]) <= hv) {
              const E: P = [p[i], p[i + 1]];
              const j = hlid === 0 ? 2 : p.length - 4;
              drag.current = {
                kind: "endi",
                id: o.id,
                hlid,
                fylgja: e.altKey ? [] : tengdirEndar(E, V, o.id, Math.max(0.5, 1 / b.camera.scale)),
                akkeri: [p[j], p[j + 1]],
                byrjad: false,
                sx: e.clientX,
                sy: e.clientY,
              };
              teiknaNu();
              return;
            }
          }
        }
        const h = veggurVid(X, V, vik());
        if (h) {
          if (e.shiftKey) {
            b.setSelected(sel.includes(h.o.id) ? sel.filter((id) => id !== h.o.id) : [...sel, h.o.id]);
            break;
          }
          const varValinn = sel.includes(h.o.id);
          if (!varValinn) b.setSelected([h.o.id]);
          const ids = useBoardStore.getState().selectedIds;
          drag.current = {
            kind: "faera",
            ids,
            X0: X,
            upphaf: new Map(V.filter((o) => ids.includes(o.id)).map((o) => [o.id, o])),
            smellId: h.o.id,
            byrjad: false,
            sx: e.clientX,
            sy: e.clientY,
            varValinn,
          };
          break;
        }
        drag.current = { kind: "kassi", A: X, B: X, eyda: false, baeta: e.shiftKey, sx: e.clientX, sy: e.clientY };
        break;
      }
    }
    teiknaNu();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!virkur) return;
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const d = drag.current;
    if (d?.kind === "pinch") {
      if (pointers.current.size < 2) return;
      const [a, b2] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b2.x, a.y - b2.y);
      const r = wrapRef.current!.getBoundingClientRect();
      const mx = (a.x + b2.x) / 2 - r.left, my = (a.y + b2.y) / 2 - r.top;
      const k = cam();
      const scale = Math.min(16, Math.max(0.04, k.scale * (dist / d.dist)));
      d.dist = dist;
      useBoardStore.getState().setCamera({ scale, x: mx - d.mid[0] * scale, y: my - d.mid[1] * scale });
      return;
    }
    if (d?.kind === "pan") {
      useBoardStore.getState().setCamera({ scale: cam().scale, x: d.cx + e.clientX - d.sx, y: d.cy + e.clientY - d.sy });
      return;
    }
    const X = tilHeims(e.clientX, e.clientY);
    bendill.current = X;
    skjaBendill.current = { x: e.clientX, y: e.clientY };
    shift.current = e.shiftKey;
    const r = useVeggjaRitill.getState();
    const V = ritillVeggir();
    if (!d) {
      if (r.tol === "teikna") smellurRef.current = smellaHer(X);
      else if (r.tol === "rettur") smellurRef.current = smella(X, V, { vik: vik() });
      else {
        const h = veggurVid(X, V, vik());
        sveima.current = h?.o.id ?? null;
        if (wrapRef.current) {
          const sel = useBoardStore.getState().selectedIds;
          wrapRef.current.style.cursor = r.tol === "velja" ? (h ? (sel.includes(h.o.id) ? "move" : "pointer") : "default") : "crosshair";
        }
      }
      teiknaNu();
      return;
    }
    const b = useBoardStore.getState();
    switch (d.kind) {
      case "teikna-drag":
        smellurRef.current = smellaHer(X);
        break;
      case "kassi":
        d.B = X;
        break;
      case "rettur":
        d.B = smella(X, V, { vik: vik() }).P;
        break;
      case "endi": {
        if (!d.byrjad) {
          if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 3) return;
          b.commitHistory();
          d.byrjad = true;
        }
        const undan = new Set([d.id, ...d.fylgja.map((f) => f.id)]);
        const s = smella(X, V, { vik: vik(), undan, akkeri: d.akkeri, hornalas: lasVirkur() });
        smellurRef.current = s;
        const fylgja = new Map(d.fylgja.map((f) => [f.id, f.hlid]));
        b.updateObjects(
          [d.id, ...fylgja.keys()],
          (o) => {
            if (o.type !== "polyline" && o.type !== "line") return o;
            if (o.id === d.id) return faeraEnda(o, d.hlid, s.P);
            return faeraEnda(o, fylgja.get(o.id)!, s.P);
          },
          false
        );
        break;
      }
      case "faera": {
        if (!d.byrjad) {
          if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) return;
          b.commitHistory();
          d.byrjad = true;
        }
        let dx = X[0] - d.X0[0], dy = X[1] - d.X0[1];
        // endi gripna veggjarins smellur á enda annars veggjar
        const g = d.upphaf.get(d.smellId);
        if (g) {
          const p = heimsPunktar(g);
          const undan = new Set(d.ids);
          let best: { dx: number; dy: number; fj: number } | null = null;
          for (const i of [0, p.length - 2]) {
            const E: P = [p[i] + dx, p[i + 1] + dy];
            const s = smella(E, V, { vik: vik(), undan });
            if (s.tegund !== "endi") continue;
            const fj = Math.hypot(s.P[0] - E[0], s.P[1] - E[1]);
            if (!best || fj < best.fj) best = { dx: dx + s.P[0] - E[0], dy: dy + s.P[1] - E[1], fj };
          }
          if (best) {
            dx = best.dx;
            dy = best.dy;
          }
        }
        b.updateObjects(d.ids, (o) => (d.upphaf.has(o.id) ? hlidra(d.upphaf.get(o.id)!, dx, dy) : o), false);
        break;
      }
    }
    teiknaNu();
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    const d = drag.current;
    if (!d) return;
    if (d.kind === "pinch") {
      if (pointers.current.size < 2) drag.current = null;
      return;
    }
    drag.current = null;
    if (wrapRef.current) wrapRef.current.style.cursor = "";
    const b = useBoardStore.getState();
    if (d.kind === "faera" && !d.byrjad && d.varValinn && d.ids.length > 1) {
      // smellur (enginn dráttur) á vegg í stærra vali: aðeins hann verður valinn
      b.setSelected([d.smellId]);
    } else if (d.kind === "kassi") {
      const kassi = {
        x: Math.min(d.A[0], d.B[0]),
        y: Math.min(d.A[1], d.B[1]),
        width: Math.abs(d.B[0] - d.A[0]),
        height: Math.abs(d.B[1] - d.A[1]),
      };
      const litill = Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4;
      if (litill) {
        if (!d.eyda && !d.baeta) b.setSelected([]);
      } else {
        const ids = veggirIKassa(ritillVeggir(), kassi, d.B[0] >= d.A[0] ? "inni" : "snerta");
        if (d.eyda) {
          const n = eydaVeggjum(ids);
          toast.message(n ? `${n} ${n === 1 ? "veggur eyddur" : "veggjum eytt"} · ⌘Z afturkallar` : "Enginn veggur í kassanum", { duration: 1500 });
        } else {
          b.setSelected(d.baeta ? [...new Set([...b.selectedIds, ...ids])] : ids);
        }
      }
    } else if (d.kind === "teikna-drag") {
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) >= 6) {
        const s = smellaHer(tilHeims(e.clientX, e.clientY));
        baetaVidKedju(s.P);
        ljukaKedju();
        toast.message("Veggur · haltu inni og dragðu næsta · ⌘Z afturkallar", { duration: 1500 });
        return;
      }
    } else if (d.kind === "rettur") {
      const k = cam().scale;
      if (Math.abs(d.B[0] - d.A[0]) * k >= 6 && Math.abs(d.B[1] - d.A[1]) * k >= 6) {
        const r = useVeggjaRitill.getState();
        const thykkt = cmIDila(r.thykktCm, ritillDilarAMetra(b.objects, b.pixelsPerMeter));
        const mid: P = [(d.A[0] + d.B[0]) / 2, (d.A[1] + d.B[1]) / 2];
        const R = rettHyrningur(d.A, d.B, { thykkt, tegund: r.tegund, parentId: foreldriFyrir(mid, b.objects) }, newId);
        skiptaUt([], R, R.map((o) => o.id));
        toast.message("Fjórir veggir · ⌘Z afturkallar", { duration: 1500 });
      }
    }
    smellurRef.current = null;
    teiknaNu();
  };

  return (
    <div
      ref={wrapRef}
      data-veggjaritill={virkur ? "virkur" : "forskodun"}
      className="absolute inset-0"
      style={{ pointerEvents: virkur ? "auto" : "none", touchAction: "none", cursor: virkur ? "default" : undefined }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => {
        sveima.current = null;
        if (!drag.current && useVeggjaRitill.getState().tol !== "teikna") smellurRef.current = null;
        teiknaNu();
      }}
      onDoubleClick={() => {
        if (useVeggjaRitill.getState().tol === "teikna") ljukaKedju();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0" />
    </div>
  );
}

/** „Breyta veggjum": opnar ritilinn — á borðinu sjálfu í Teikning-ham (við hlið verkfærasúlunnar), og W gerir það sama. */
function RitilOpnari() {
  const hamur = useHamur((s) => s.hamur);
  const erMynd = useBoardStore((s) => s.objects.some((o) => o.type === "image"));
  const fjoldi = useBoardStore((s) => veggjaTalning(s.objects).alls);
  if (!RITIL_HAMIR.includes(hamur) || !erMynd) return null;
  return (
    <button
      type="button"
      title="Veggjaritill (W): teikna, velja, eyða, kljúfa, sameina og lengja veggi — teikningin læst á meðan"
      onClick={() => useVeggjaRitill.getState().kveikja()}
      className="pointer-events-auto absolute top-3 left-16 z-20 flex items-center gap-1.5 rounded-full border border-white/10 bg-[#1a1d2e]/95 py-1.5 pr-3 pl-2.5 text-[12px] font-semibold text-stone-100 shadow-xl hover:bg-[#252a40] sm:left-20"
    >
      <PencilRuler className="size-3.5 text-[#FE653F]" />
      Breyta veggjum
      <span className="font-normal text-white/50">{fjoldi}</span>
      <kbd className="text-[10px] font-normal text-white/40">W</kbd>
    </button>
  );
}

// ── spjaldið ─────────────────────────────────────────────────────────────────────────────────────────────

const TOL_TAKN: Record<RitilTol, ReactNode> = {
  velja: <MousePointer2 className="size-3.5" />,
  teikna: <PencilLine className="size-3.5" />,
  rettur: <Square className="size-3.5" />,
  kljufa: <Scissors className="size-3.5" />,
  lengja: <MoveHorizontal className="size-3.5" />,
  "eyda-kassi": <BoxSelect className="size-3.5" />,
};

function RitilSpjald() {
  const tol = useVeggjaRitill((s) => s.tol);
  const thykktCm = useVeggjaRitill((s) => s.thykktCm);
  const tegund = useVeggjaRitill((s) => s.tegund);
  const hornalasStada = useVeggjaRitill((s) => s.hornalas);
  const adeinsVeggir = useVeggjaRitill((s) => s.adeinsVeggir);
  const objects = useBoardStore((s) => s.objects);
  const layers = useBoardStore((s) => s.layers);
  const [eigin, setEigin] = useState("");
  const talning = veggjaTalning(objects);
  // Lotur „Greina veggi" á borðinu (nýjasta fyrst) — „Eyða síðustu greiningu" tekur heila lotu í einu skrefi.
  const lotur = greiningarLotur(objects.filter((o): o is LineObject => erVeggur(o) && !o.hidden));
  const teikningLaest = layers.find((l) => l.id === LAYER_TEIKNING)?.locked ?? false;
  const veggirSjast = layers.find((l) => l.id === LAYER_VEGGIR)?.visible ?? true;
  const r = useVeggjaRitill.getState();

  const btn = "flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-stone-100 hover:bg-white/10";
  const valid = "bg-[#FE653F] text-white hover:bg-[#ff7a58]";
  const greina = () => {
    const st = useBoardStore.getState();
    const myndir = st.objects.filter((o) => o.type === "image" && !o.hidden);
    const plan = myndir.find((o) => o.type === "image" && o.uttekt) ?? (myndir.length === 1 ? myndir[0] : null);
    if (!plan) return toast.error("Engin teikning fannst — veldu teikninguna fyrst");
    if (plan.rotation) return toast.error("Teikningunni hefur verið snúið — veggjagreining styður aðeins óbreytta stefnu enn");
    r.opnaGreiningu(plan.id);
  };

  return (
    <div
      role="region"
      aria-label="Veggjaritill"
      className="pointer-events-auto absolute top-3 left-16 z-20 w-[272px] rounded-xl border border-white/10 bg-[#1a1d2e]/95 p-2 text-stone-100 shadow-2xl sm:left-20"
    >
      <div className="flex items-center gap-1">
        <span className="text-[12.5px] font-semibold">✏️ Veggjaritill</span>
        <span className="ml-auto" />
        <button type="button" title="Flýtilyklar (?)" aria-label="Flýtilyklar" onClick={() => r.setHjalp(!useVeggjaRitill.getState().hjalp)} className={btn}>
          <HelpCircle className="size-3.5" />
        </button>
        <button type="button" title="Loka veggjaritlinum — teikningin opnast aftur" onClick={() => r.slokkva()} className={btn}>
          <X className="size-3.5" />
          Loka
        </button>
      </div>
      <div data-veggjatalning className="mt-0.5 text-[11.5px] text-white/60">
        {talningTexti(talning)}
      </div>

      <div className="mt-2 text-[10px] font-semibold tracking-wide text-white/40 uppercase">Tól</div>
      <div className="mt-1 flex flex-wrap gap-1" role="group" aria-label="Tól veggjaritils">
        {(Object.keys(TOL_HEITI) as RitilTol[]).map((t) => (
          <button
            key={t}
            type="button"
            title={TOL_HEITI[t].titill}
            aria-pressed={tol === t}
            onClick={() => r.setTol(t)}
            className={`${btn} w-[calc(50%-2px)] justify-start ${tol === t ? valid : "bg-white/5"}`}
          >
            {TOL_TAKN[t]}
            <span className="truncate">{TOL_HEITI[t].texti}</span>
            <kbd className="ml-auto text-[9.5px] opacity-60">{TOL_HEITI[t].lykill}</kbd>
          </button>
        ))}
      </div>

      <div className="mt-2 text-[10px] font-semibold tracking-wide text-white/40 uppercase">Nýir veggir</div>
      <div className="mt-1 flex flex-wrap items-center gap-1" role="group" aria-label="Þykkt nýrra veggja">
        {THYKKTIR_CM.map((cm) => (
          <button
            key={cm}
            type="button"
            title={`Þykkt ${cm} cm`}
            aria-pressed={thykktCm === cm}
            onClick={() => r.setThykkt(cm)}
            className={`${btn} ${thykktCm === cm ? valid : "bg-white/5"}`}
          >
            {cm}
          </button>
        ))}
        <input
          aria-label="Eigin þykkt (cm)"
          inputMode="numeric"
          placeholder={THYKKTIR_CM.includes(thykktCm as (typeof THYKKTIR_CM)[number]) ? "cm" : String(thykktCm)}
          value={eigin}
          onChange={(e) => setEigin(e.target.value.replace(/[^0-9,.]/g, ""))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const n = Number(eigin.replace(",", "."));
              if (n > 0 && n <= 200) r.setThykkt(n);
              setEigin("");
              (e.target as HTMLInputElement).blur();
            }
          }}
          className={`w-12 rounded-md border px-1 py-0.5 text-[11px] text-stone-100 ${
            THYKKTIR_CM.includes(thykktCm as (typeof THYKKTIR_CM)[number]) ? "border-white/15 bg-white/5" : "border-[#FE653F] bg-[#FE653F]/15"
          }`}
        />
        <span className="text-[10.5px] text-white/45">cm</span>
      </div>
      <div className="mt-1 flex gap-1" role="group" aria-label="Tegund nýrra veggja">
        {TEGUNDIR.map((t) => (
          <button
            key={t.id}
            type="button"
            title={`${t.texti} (${t.lykill}) — valdir veggir fá tegundina, annars næsti veggur`}
            aria-pressed={tegund === t.id}
            onClick={() => r.setTegund(t.id)}
            className={`${btn} flex-1 justify-center ${tegund === t.id ? "bg-white/15 ring-1 ring-white/30" : "bg-white/5"}`}
          >
            <span className="inline-block size-2.5 rounded-full" style={{ background: t.id === "veggur" ? "#d6d3d1" : VEGG_LITIR[t.id] }} />
            {t.texti}
          </button>
        ))}
      </div>
      <label className="mt-1.5 flex items-center gap-1.5 text-[11px] text-white/75">
        <input type="checkbox" checked={hornalasStada} onChange={(e) => r.setHornalas(e.target.checked)} />
        Hornalás 0/45/90° <span className="text-white/40">(Shift víxlar)</span>
      </label>

      <div className="mt-2 text-[10px] font-semibold tracking-wide text-white/40 uppercase">Lög</div>
      <div className="mt-1 flex flex-wrap gap-1">
        <button
          type="button"
          title="Teikningin læst: smellur getur hvorki fært né valið myndina"
          aria-pressed={teikningLaest}
          onClick={() => r.laesaTeikningu(!teikningLaest)}
          className={`${btn} bg-white/5`}
        >
          {teikningLaest ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
          {teikningLaest ? "Teikning læst" : "Læsa teikningu"}
        </button>
        <button
          type="button"
          title="Sýna / fela veggjalagið"
          aria-pressed={veggirSjast}
          onClick={() => useBoardStore.getState().toggleLayerVisible(LAYER_VEGGIR)}
          className={`${btn} bg-white/5`}
        >
          {veggirSjast ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
          Veggir
        </button>
        <button
          type="button"
          title="Fela teikninguna og öll önnur lög — aðeins veggirnir sjást"
          aria-pressed={!!adeinsVeggir}
          onClick={() => r.setAdeinsVeggir(!adeinsVeggir)}
          className={`${btn} ${adeinsVeggir ? valid : "bg-white/5"}`}
        >
          Sýna aðeins veggi
        </button>
      </div>

      <div className="mt-2 flex gap-1">
        <button type="button" onClick={greina} className={`${btn} flex-1 justify-center bg-white/8 ring-1 ring-white/15`} title="Greina veggi úr PDF-línum eða myndinni — bætast við þá sem fyrir eru">
          <ScanSearch className="size-3.5" />
          Greina veggi…
        </button>
        <button
          type="button"
          title="Eyða völdum veggjum (Delete)"
          onClick={() => {
            const n = eydaVeggjum(valdirVeggir().map((o) => o.id));
            if (n) toast.message(`${n} ${n === 1 ? "veggur eyddur" : "veggjum eytt"} · ⌘Z afturkallar`);
          }}
          className={`${btn} bg-white/5`}
        >
          <Trash2 className="size-3.5 text-[#FE653F]" />
          Eyða
        </button>
      </div>
      {lotur.length ? (
        <div className="mt-1 flex flex-wrap gap-1" role="group" aria-label="Veggir úr greiningu">
          <button
            type="button"
            data-eyda-greiningu="sidasta"
            title="Eyðir öllum veggjum sem síðasta „Greina veggi“ bætti við (líka þeim sem voru lagaðir síðan) — ⌘Z afturkallar"
            onClick={() => eydaGreiningu(lotur[0].ids)}
            className={`${btn} flex-1 justify-center bg-white/5`}
          >
            <Trash2 className="size-3.5 text-[#FE653F]" />
            Eyða síðustu greiningu ({lotur[0].ids.length})
          </button>
          {lotur.length > 1 ? (
            <button
              type="button"
              data-eyda-greiningu="allri"
              title="Eyðir öllum veggjum sem komu úr „Greina veggi“ — handteiknaðir og innfluttir veggir haldast. ⌘Z afturkallar"
              onClick={() => eydaGreiningu(lotur.flatMap((l) => l.ids))}
              className={`${btn} flex-1 justify-center bg-white/5`}
            >
              Öllum úr greiningu ({lotur.reduce((s, l) => s + l.ids.length, 0)})
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Eyðir veggjum úr greiningu í einu skrefi (⌘Z skilar þeim öllum). */
function eydaGreiningu(ids: string[]) {
  const n = eydaVeggjum(ids);
  if (n) toast.message(`${n} ${n === 1 ? "veggur" : "veggir"} úr greiningu ${n === 1 ? "eyddur" : "eyddir"} · ⌘Z afturkallar`);
}

const FLYTILYKLAR: [string, string][] = [
  ["V", "Velja — smellur velur vegg, Shift+smellur bætir við / tekur af"],
  ["Kassi", "Dragðu til hægri = veggir allir inni · til vinstri = veggir sem kassinn snertir"],
  ["Ctrl+A", "Velja alla veggi"],
  ["Delete / ⌫", "Eyða völdum veggjum"],
  ["B", "Eyða í kassa — dragðu yfir veggina sem eiga að hverfa"],
  ["W", "Teikna veggi — smelltu horn af horni; smellur á enda (□) og línur (×) annarra veggja"],
  ["Shift", "Víxlar hornalás 0/45/90° (sjálfgefið á) meðan teiknað er eða endi dreginn"],
  ["Enter / tvísmellur / Esc", "Ljúka vegg-keðjunni"],
  ["R", "Rétthyrningur — dragðu kassa, fjórir veggir (herbergi)"],
  ["Dráttur á enda", "Færir endapunktinn (□); endar annarra veggja í sama horni fylgja — Alt losar"],
  ["Dráttur á vegg", "Færir valda veggi; endi smellur á enda annars veggjar"],
  ["Örvar", "Hliðra völdum veggjum um 1 skjádíl (Shift = 10)"],
  ["S", "Kljúfa — smelltu á vegginn þar sem hann á að fara í tvennt"],
  ["J", "Sameina valda samlínu veggi í einn"],
  ["L", "Lengja að — vegginn sem á að lengja/stytta, svo vegginn sem hann á að mæta (eða tveir valdir + L)"],
  ["T", "Tengja — lausir endar valinna veggja mætast (horn, T, samlína)"],
  ["D", "Hurð í bil — tveir samlínu veggir valdir, hurð í opið á milli"],
  ["1 / 2 / 3", "Veggur / Gler / Hurð — valdir veggir, annars næsti veggur"],
  ["[ / ]", "Þynnri / þykkari (10 · 15 · 20 · 30 cm) — valdir veggir og næsti"],
  ["Ctrl+Z / Ctrl+Y", "Afturkalla / endurgera — hver aðgerð er eitt skref"],
  ["Hjól · Bil+dráttur · hægri hnappur", "Zoom og færa borðið"],
  ["Esc", "Hætta í keðju / tóli → afvelja (ritillinn lokast með „Loka“)"],
  ["?", "Þessi listi"],
];

function RitilHjalp() {
  return (
    <div
      role="dialog"
      aria-label="Flýtilyklar veggjaritils"
      className="pointer-events-auto absolute top-3 left-[calc(4rem+284px)] z-20 max-h-[calc(100%-1.5rem)] w-[400px] overflow-auto rounded-xl border border-white/10 bg-[#1a1d2e]/97 p-3 text-stone-100 shadow-2xl sm:left-[calc(5rem+284px)]"
    >
      <div className="flex items-center">
        <span className="text-[12.5px] font-semibold">Flýtilyklar — veggjaritill</span>
        <button type="button" aria-label="Loka" onClick={() => useVeggjaRitill.getState().setHjalp(false)} className="ml-auto rounded p-1 hover:bg-white/10">
          <X className="size-3.5" />
        </button>
      </div>
      <table className="mt-2 w-full text-[11.5px]">
        <tbody>
          {FLYTILYKLAR.map(([k, t]) => (
            <tr key={k} className="align-top">
              <td className="w-[118px] py-0.5 pr-2">
                <kbd className="inline-block rounded bg-white/10 px-1.5 py-0.5 font-sans text-[10.5px] leading-snug font-semibold">{k}</kbd>
              </td>
              <td className="py-0.5 text-white/75">{t}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[10.5px] text-white/45">
        Teikningin er læst meðan ritillinn er opinn — smellur velur aðeins veggi. „💾 Vista í úttekt“ skrifar veggina (með tegund) í
        úttektarteikninguna eins og áður.
      </p>
    </div>
  );
}
