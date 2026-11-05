"use client";

/** Móta-ritillinn: mynd á öllum skjánum eins og í símaforritum.
 *
 *  - Myndin er í fullri vinnuupplausn (MAX_WORKING) á strigum sem eru færðir
 *    og stækkaðir með CSS-umbreytingu: tveir fingur klípa og færa, tvípikk
 *    zoom-ar, skrunhjól zoom-ar að músinni. Ekkert af því endurteiknar myndina.
 *  - Neðst: flipar (Líkami, Móta, Lagfæra, Ljós og litir) → tól → einn sleði,
 *    og ✕ / ✓ meðan tól er opið.
 *  - Líkami og Ljós og litir sýna forsýn á smækkaðri mynd meðan sleðinn er
 *    dreginn; ✓ keyrir sömu aðgerð á fullri upplausn.
 *  - Burstar mála beint á myndina; afturkalla geymir aðeins það sem strikið
 *    snerti. */

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { createPortal } from "react-dom";
import SendTo from "../SendTo";
import { cloneRaster, liquifyLocal, type Raster } from "../studio/adjust";
import { tuneIsIdentity, warpBody, type BodyFrame } from "../likami/bodyWarp";
import { detectBody } from "../likami/pose";
import {
  MAX_WORKING,
  canvasToBlob,
  chooseLevel,
  imageDataFor,
  loadRaster,
  paintLevels,
  previewFromLevels,
  rasterCanvas,
  sizeLevels,
} from "./canvasUtil";
import { EditHistory, clipRect, cutRect, unionRect, type Rect } from "./history";
import { Icon } from "./icons";
import { applyLooks, looksIsNeutral } from "./looks";
import { applyRetouch, restoreRegion } from "./retouch";
import {
  BODY_TOOLS,
  BRUSH_TABS,
  LOOK_TOOLS,
  TABS,
  ZERO_BODY,
  ZERO_LOOKS,
  bodyTuneFromValues,
  isLiquify,
  looksFromValues,
  type BodyToolId,
  type BodyValues,
  type BrushMode,
  type LookToolId,
  type LookValues,
  type SliderSpec,
  type TabId,
} from "./tools";
import { clampView, fitView, pinchView, toImage, toScreen, toggleZoom, zoomAt, zoomLimits, type Point, type View } from "./viewport";
import "./editor.css";

const PREVIEW_MAX = 1024;
const BRUSH_MIN = 6;
const BRUSH_MAX = 110;
const HISTORY_BUDGET = 128 * 1024 * 1024;
const FRAME_BUDGET_MS = 14;

type Session =
  | { kind: "body"; mark: number; status: "detecting" | "ready" | "nobody" | "failed"; frame: BodyFrame | null }
  | { kind: "looks"; mark: number }
  | { kind: "brush"; tab: "mota" | "lagfaera"; mark: number };

type Gesture =
  | { kind: "pan"; start: View; p0: Point }
  | { kind: "pinch"; start: View; mid0: Point; dist0: number }
  | { kind: "paint" }
  | { kind: "blocked" };

type Stroke = {
  last: Point;
  carry: number;
  rect: Rect | null;
  start: Point;
  cloneOffset: Point | null;
  pending: Point[];
};

export type MotaEditorProps = {
  initial: Raster;
  name: string;
  mime: string;
  onClose: () => void;
  onReplace: (file: File) => void;
};

function nextPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

function signed(v: number): string {
  return v > 0 ? `+${v}` : String(v);
}

/** Sleði með lituðum hluta frá núlli (tvíátta) eða frá vinstri. */
function trackStyle(value: number, spec: SliderSpec): React.CSSProperties {
  const pct = ((value - spec.min) / (spec.max - spec.min)) * 100;
  const zero = spec.min < 0 ? ((0 - spec.min) / (spec.max - spec.min)) * 100 : 0;
  const a = Math.min(pct, zero);
  const b = Math.max(pct, zero);
  return {
    ["--mx-track" as string]: `linear-gradient(to right, var(--mx-rail) 0 ${a}%, var(--mx-accent) ${a}% ${b}%, var(--mx-rail) ${b}% 100%)`,
  };
}

export default function MotaEditor({ initial, name, mime, onClose, onReplace }: MotaEditorProps) {
  // ---- DOM
  const stageRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const main0 = useRef<HTMLCanvasElement>(null);
  const main1 = useRef<HTMLCanvasElement>(null);
  const main2 = useRef<HTMLCanvasElement>(null);
  const orig0 = useRef<HTMLCanvasElement>(null);
  const orig1 = useRef<HTMLCanvasElement>(null);
  const orig2 = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const refCanvasRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const srcMarkRef = useRef<HTMLDivElement>(null);
  const zoomPillRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const refFileRef = useRef<HTMLInputElement>(null);

  // ---- Gögn (utan React-ástands — of stór/of tíð)
  const workingRef = useRef<Raster>(initial);
  const originalRef = useRef<Raster | null>(null);
  if (!originalRef.current) originalRef.current = cloneRaster(initial);
  const historyRef = useRef<EditHistory | null>(null);
  if (!historyRef.current) historyRef.current = new EditHistory(HISTORY_BUDGET);
  const imageDataRef = useRef<ImageData | null>(null);
  const viewRef = useRef<View>({ scale: 1, tx: 0, ty: 0 });
  const stageSizeRef = useRef({ width: 0, height: 0 });
  const levelRef = useRef(-1);
  const snapshotRef = useRef<Uint8ClampedArray | null>(null);
  const strokeRef = useRef<Stroke | null>(null);
  const strokeRafRef = useRef(0);
  const dabCostRef = useRef(3);
  const pointersRef = useRef(new Map<number, Point>());
  const gestureRef = useRef<Gesture | null>(null);
  const downRef = useRef<{ t: number; p: Point; moved: boolean } | null>(null);
  const lastTapRef = useRef<{ t: number; p: Point } | null>(null);
  const spaceRef = useRef(false);
  const previewBaseRef = useRef<Raster | null>(null);
  const previewQueuedRef = useRef(false);
  const refRasterRef = useRef<Raster | null>(null);
  const dirtyRef = useRef(false);
  const closingRef = useRef(false);
  const zoomTimerRef = useRef(0);
  const toastTimerRef = useRef(0);

  // ---- Viðmótsástand
  const [, setTick] = useState(0);
  const rerender = () => setTick((t) => t + 1);
  const [tab, setTab] = useState<TabId>("likami");
  const [session, setSession] = useState<Session | null>(null);
  const [bodyTool, setBodyTool] = useState<BodyToolId>("auto");
  const [bodyValues, setBodyValues] = useState<BodyValues>(ZERO_BODY);
  const [lookTool, setLookTool] = useState<LookToolId>("brightness");
  const [lookValues, setLookValues] = useState<LookValues>(ZERO_LOOKS);
  const [brushMode, setBrushMode] = useState<BrushMode>("shrink");
  const [brushSize, setBrushSize] = useState(30);
  const [brushStrength, setBrushStrength] = useState(55);
  const [handMode, setHandMode] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [previewShown, setPreviewShown] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [sizePreview, setSizePreview] = useState(false);
  const [cloneAnchor, setCloneAnchor] = useState<Point | null>(null);
  const [cloneSource, setCloneSource] = useState<"self" | "reference">("self");
  const [picking, setPicking] = useState(false);
  const [refVersion, setRefVersion] = useState(0);
  const [sendBlob, setSendBlob] = useState<Blob | null>(null);

  // Nýjustu gildi fyrir rAF/native hlustara.
  const live = useRef({ session, brushMode, brushSize, strength: brushStrength / 100, cloneAnchor, cloneSource, handMode, picking, bodyValues, lookValues, busy });
  live.current = { session, brushMode, brushSize, strength: brushStrength / 100, cloneAnchor, cloneSource, handMode, picking, bodyValues, lookValues, busy };

  const history = historyRef.current;
  const working = workingRef.current;
  const previewSession = session?.kind === "body" || session?.kind === "looks";
  const brushSession = session?.kind === "brush";

  // ------------------------------------------------------------------ teikning

  function mainLevels(): HTMLCanvasElement[] | null {
    const a = main0.current;
    const b = main1.current;
    const c = main2.current;
    return a && b && c ? [a, b, c] : null;
  }

  function origLevels(): HTMLCanvasElement[] | null {
    const a = orig0.current;
    const b = orig1.current;
    const c = orig2.current;
    return a && b && c ? [a, b, c] : null;
  }

  function imageData(): ImageData {
    const w = workingRef.current;
    if (!imageDataRef.current || imageDataRef.current.data !== w.data) imageDataRef.current = imageDataFor(w);
    return imageDataRef.current;
  }

  function sizeLayer() {
    const layer = layerRef.current;
    const w = workingRef.current;
    if (!layer) return;
    layer.style.width = `${w.width}px`;
    layer.style.height = `${w.height}px`;
  }

  function paintAll() {
    const levels = mainLevels();
    if (!levels) return;
    const w = workingRef.current;
    sizeLevels(levels, w.width, w.height);
    sizeLayer();
    paintLevels(levels, imageData(), null);
  }

  function paintRect(rect: Rect) {
    const levels = mainLevels();
    if (levels) paintLevels(levels, imageData(), rect);
  }

  function paintOriginal() {
    const levels = origLevels();
    const o = originalRef.current;
    if (!levels || !o) return;
    sizeLevels(levels, o.width, o.height);
    paintLevels(levels, imageDataFor(o), null);
    sizeOriginalBox();
  }

  /** Upprunalega myndin getur verið lægri/hærri en vinnumyndin (fótleggir):
   *  sama breidd á skjá, hæðin í hlutfalli. */
  function sizeOriginalBox() {
    const box = orig0.current?.parentElement;
    const o = originalRef.current;
    if (box && o) box.style.height = `${(o.height / o.width) * workingRef.current.width}px`;
  }

  function setWorking(next: Raster) {
    const prev = workingRef.current;
    workingRef.current = next;
    imageDataRef.current = null;
    paintAll();
    if (prev.width !== next.width || prev.height !== next.height) {
      const s = stageSizeRef.current;
      applyView(clampView(viewRef.current, s, next));
      sizeOriginalBox();
    }
    dirtyRef.current = true;
    rerender();
  }

  // ------------------------------------------------------------------ útsýni

  function imageSize() {
    const w = workingRef.current;
    return { width: w.width, height: w.height };
  }

  function limits() {
    return zoomLimits(stageSizeRef.current, imageSize());
  }

  function positionMarkers() {
    const v = viewRef.current;
    const anchor = live.current.cloneAnchor;
    const el = anchorRef.current;
    if (el) {
      const show = anchor && live.current.session?.kind === "brush" && live.current.brushMode === "clone" && live.current.cloneSource === "self";
      el.style.display = show ? "block" : "none";
      if (show && anchor) {
        const p = toScreen(v, anchor);
        el.style.transform = `translate(${p.x}px, ${p.y}px)`;
      }
    }
  }

  function applyView(v: View, flash = false) {
    viewRef.current = v;
    const layer = layerRef.current;
    if (layer) layer.style.transform = `translate3d(${v.tx}px, ${v.ty}px, 0) scale(${v.scale})`;
    const level = chooseLevel(v.scale, window.devicePixelRatio || 1);
    if (level !== levelRef.current) {
      levelRef.current = level;
      for (const set of [mainLevels(), origLevels()]) set?.forEach((c, k) => (c.style.visibility = k === level ? "inherit" : "hidden"));
    }
    positionMarkers();
    if (flash) flashZoom();
  }

  function flashZoom() {
    const pill = zoomPillRef.current;
    if (!pill) return;
    const fit = fitView(stageSizeRef.current, imageSize()).scale;
    pill.textContent = `${Math.round((viewRef.current.scale / fit) * 100)}%`;
    pill.classList.add("on");
    window.clearTimeout(zoomTimerRef.current);
    zoomTimerRef.current = window.setTimeout(() => pill.classList.remove("on"), 700);
  }

  function fitNow() {
    const s = stageSizeRef.current;
    if (s.width > 0 && s.height > 0) applyView(fitView(s, imageSize()));
  }

  function zoomBy(factor: number, at?: Point) {
    const s = stageSizeRef.current;
    const p = at ?? { x: s.width / 2, y: s.height / 2 };
    applyView(clampView(zoomAt(viewRef.current, factor, p.x, p.y, limits()), s, imageSize()), true);
  }

  // Fyrsta teikning + stærð sviðsins.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    paintAll();
    paintOriginal();
    let first = true;
    const measure = () => {
      const r = stage.getBoundingClientRect();
      const prev = stageSizeRef.current;
      stageSizeRef.current = { width: r.width, height: r.height };
      if (r.width === 0 || r.height === 0) return;
      const wasFit = !first && prev.width > 0 && Math.abs(viewRef.current.scale - fitView(prev, imageSize()).scale) < 1e-6;
      if (first || wasFit) applyView(fitView(stageSizeRef.current, imageSize()));
      else applyView(clampView(viewRef.current, stageSizeRef.current, imageSize()));
      first = false;
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Skrunhjól (non-passive), lyklaborð, bakk-takki, skrunlás á síðunni.
  const handlers = useRef({ onWheel: (_e: WheelEvent) => {}, onKey: (_e: KeyboardEvent) => {}, onKeyUp: (_e: KeyboardEvent) => {}, onPop: () => {} });
  handlers.current.onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const r = stage.getBoundingClientRect();
    // Snertiplata: ctrl+wheel = klíp (litlar tölur); músarhjól: stærri skref.
    const k = e.ctrlKey ? 0.01 : 0.0018;
    zoomBy(Math.exp(-e.deltaY * k), { x: e.clientX - r.left, y: e.clientY - r.top });
  };
  handlers.current.onKey = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA") && (target as HTMLInputElement).type !== "range") return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    } else if (mod && e.key.toLowerCase() === "y") {
      e.preventDefault();
      redo();
    } else if (e.key === " ") {
      spaceRef.current = true;
      if (target?.tagName !== "INPUT") e.preventDefault();
    } else if (e.key === "Escape") {
      if (menuOpen) setMenuOpen(false);
      else if (live.current.session) cancelSession();
    } else if (e.key === "0" && !mod) {
      fitNow();
    }
  };
  handlers.current.onKeyUp = (e: KeyboardEvent) => {
    if (e.key === " ") spaceRef.current = false;
  };
  handlers.current.onPop = () => {
    if (closingRef.current) {
      onClose();
      return;
    }
    if (dirtyRef.current && !window.confirm("Loka ritlinum? Breytingar sem ekki eru vistaðar tapast.")) {
      window.history.pushState({ motaEditor: true }, "");
      return;
    }
    onClose();
  };

  useEffect(() => {
    const stage = stageRef.current;
    const wheel = (e: WheelEvent) => handlers.current.onWheel(e);
    const key = (e: KeyboardEvent) => handlers.current.onKey(e);
    const keyUp = (e: KeyboardEvent) => handlers.current.onKeyUp(e);
    const pop = () => handlers.current.onPop();
    stage?.addEventListener("wheel", wheel, { passive: false });
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("popstate", pop);
    window.history.pushState({ motaEditor: true }, "");
    const html = document.documentElement;
    const prevOverflow = html.style.overflow;
    const prevBody = document.body.style.overflow;
    html.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      stage?.removeEventListener("wheel", wheel);
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("popstate", pop);
      html.style.overflow = prevOverflow;
      document.body.style.overflow = prevBody;
      window.clearTimeout(zoomTimerRef.current);
      window.clearTimeout(toastTimerRef.current);
      cancelAnimationFrame(strokeRafRef.current);
    };
  }, []);

  function requestClose() {
    if (dirtyRef.current && !window.confirm("Loka ritlinum? Breytingar sem ekki eru vistaðar tapast.")) return;
    dirtyRef.current = false;
    closingRef.current = true;
    if (window.history.state?.motaEditor) window.history.back();
    else onClose();
  }

  function showToast(text: string) {
    setToast(text);
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 2800);
  }

  // ------------------------------------------------------------------ burstar

  function brushRadius(): number {
    return Math.max(1.5, live.current.brushSize / viewRef.current.scale);
  }

  function dab(x: number, y: number, mx: number, my: number, s: Stroke): Rect {
    const w = workingRef.current;
    const r = brushRadius();
    const st = live.current.strength;
    const mode = live.current.brushMode;
    if (isLiquify(mode)) {
      liquifyLocal(w, x, y, r, st, mode, mx, my);
    } else if (mode === "restore") {
      if (originalRef.current) restoreRegion(w, originalRef.current, x, y, r, st);
    } else if (mode === "clone") {
      const anchor = live.current.cloneAnchor;
      if (anchor) {
        if (!s.cloneOffset) s.cloneOffset = { x: s.start.x - anchor.x, y: s.start.y - anchor.y };
        const external = live.current.cloneSource === "reference" ? refRasterRef.current ?? undefined : undefined;
        applyRetouch(w, x, y, r, st, "clone", { srcX: x - s.cloneOffset.x, srcY: y - s.cloneOffset.y, srcRaster: external });
        const mark = srcMarkRef.current;
        if (mark && !external) {
          const p = toScreen(viewRef.current, { x: x - s.cloneOffset.x, y: y - s.cloneOffset.y });
          mark.style.display = "block";
          mark.style.transform = `translate(${p.x}px, ${p.y}px)`;
        }
      }
    } else {
      applyRetouch(w, x, y, r, st, mode);
    }
    const m = Math.max(4, r) + 2;
    return { x: x - m, y: y - m, w: m * 2, h: m * 2 };
  }

  function startStroke(p: Point): boolean {
    const w = workingRef.current;
    const mode = live.current.brushMode;
    if (mode === "clone" && !live.current.cloneAnchor) {
      showToast("Veldu fyrst upptökustað: ýttu á „Upptök“ og pikkaðu á myndina");
      return false;
    }
    if (mode === "clone" && live.current.cloneSource === "reference" && !refRasterRef.current) {
      showToast("Opnaðu fyrst hina myndina");
      return false;
    }
    const o = originalRef.current;
    if (mode === "restore" && o && (o.width !== w.width || o.height !== w.height)) {
      showToast("Endurheimta virkar ekki eftir að hæð myndarinnar breyttist");
      return false;
    }
    let snap = snapshotRef.current;
    if (!snap || snap.length !== w.data.length) {
      snap = new Uint8ClampedArray(w.data.length);
      snapshotRef.current = snap;
    }
    snap.set(w.data);
    const ip = toImage(viewRef.current, p);
    const s: Stroke = { last: ip, carry: 0, rect: null, start: ip, cloneOffset: null, pending: [] };
    strokeRef.current = s;
    const rect = clipRect(dab(ip.x, ip.y, 0, 0, s), w.width, w.height);
    if (rect) {
      s.rect = rect;
      paintRect(rect);
    }
    return true;
  }

  function queueStroke(p: Point) {
    const s = strokeRef.current;
    if (!s) return;
    s.pending.push(toImage(viewRef.current, p));
    if (!strokeRafRef.current) strokeRafRef.current = requestAnimationFrame(processStroke);
  }

  /** Dabbar meðfram slóðinni frá síðasta ramma. Ef tölvan nær ekki öllum
   *  döbbum innan rammans eru bilin lengd svo burstinn fylgi fingrinum. */
  function processStroke() {
    strokeRafRef.current = 0;
    const s = strokeRef.current;
    if (!s || s.pending.length === 0) return;
    const pts = s.pending.splice(0);
    const w = workingRef.current;
    let total = 0;
    let prev = s.last;
    for (const p of pts) {
      total += Math.hypot(p.x - prev.x, p.y - prev.y);
      prev = p;
    }
    let spacing = Math.max(1, brushRadius() * 0.3);
    const budget = Math.max(2, Math.min(48, Math.floor(FRAME_BUDGET_MS / Math.max(0.2, dabCostRef.current))));
    if (total / spacing > budget) spacing = total / budget;
    const t0 = performance.now();
    let dabs = 0;
    let dirty: Rect | null = null;
    let lastDab = s.last;
    let a = s.last;
    let carry = s.carry;
    for (const b of pts) {
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      let t = spacing - carry;
      while (t <= len) {
        const x = a.x + ((b.x - a.x) * t) / len;
        const y = a.y + ((b.y - a.y) * t) / len;
        dirty = unionRect(dirty, dab(x, y, x - lastDab.x, y - lastDab.y, s));
        lastDab = { x, y };
        dabs++;
        t += spacing;
      }
      carry = len - (t - spacing);
      a = b;
    }
    s.carry = carry;
    s.last = a;
    if (dabs > 0) {
      const cost = (performance.now() - t0) / dabs;
      dabCostRef.current = dabCostRef.current * 0.7 + cost * 0.3;
    }
    const rect = dirty ? clipRect(dirty, w.width, w.height) : null;
    if (rect) {
      s.rect = unionRect(s.rect, rect);
      paintRect(rect);
    }
  }

  function endStroke() {
    if (strokeRafRef.current) {
      cancelAnimationFrame(strokeRafRef.current);
      processStroke();
    }
    const s = strokeRef.current;
    strokeRef.current = null;
    if (srcMarkRef.current) srcMarkRef.current.style.display = "none";
    const w = workingRef.current;
    const snap = snapshotRef.current;
    if (!s?.rect || !snap) return;
    const rect = clipRect(s.rect, w.width, w.height);
    if (!rect) return;
    history.pushPatch(rect, cutRect(snap, w.width, rect));
    dirtyRef.current = true;
    rerender();
  }

  /** Annar fingur kom = klíp, ekki málning: strikið er tekið til baka. */
  function cancelStroke() {
    cancelAnimationFrame(strokeRafRef.current);
    strokeRafRef.current = 0;
    const s = strokeRef.current;
    strokeRef.current = null;
    if (srcMarkRef.current) srcMarkRef.current.style.display = "none";
    const w = workingRef.current;
    const snap = snapshotRef.current;
    if (!s?.rect || !snap) return;
    const rect = clipRect(s.rect, w.width, w.height);
    if (!rect) return;
    for (let y = rect.y; y < rect.y + rect.h; y++) {
      const at = (y * w.width + rect.x) * 4;
      w.data.set(snap.subarray(at, at + rect.w * 4), at);
    }
    paintRect(rect);
  }

  // ------------------------------------------------------------------ bendlar

  function stagePoint(e: { clientX: number; clientY: number }): Point {
    const r = stageRef.current?.getBoundingClientRect();
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
  }

  function showCursor(p: Point | null) {
    const el = cursorRef.current;
    if (!el) return;
    if (!p) {
      el.style.display = "none";
      return;
    }
    const d = live.current.brushSize * 2;
    el.style.display = "block";
    el.style.width = `${d}px`;
    el.style.height = `${d}px`;
    el.style.transform = `translate(${p.x - d / 2}px, ${p.y - d / 2}px)`;
  }

  function beginPinch() {
    const [a, b] = [...pointersRef.current.values()];
    gestureRef.current = {
      kind: "pinch",
      start: viewRef.current,
      mid0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      dist0: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
    };
  }

  function onPointerDown(e: RPointerEvent<HTMLDivElement>) {
    if (live.current.busy) return;
    if (e.pointerType === "mouse" && e.button !== 0 && e.button !== 1) return;
    const p = stagePoint(e);
    if (e.isPrimary) {
      // Nýr snertiatburður: gleymdir fingur frá síðast mega ekki trufla.
      pointersRef.current.clear();
      gestureRef.current = null;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, p);
    setMenuOpen(false);

    if (pointersRef.current.size === 2) {
      if (gestureRef.current?.kind === "paint") cancelStroke();
      showCursor(null);
      beginPinch();
      downRef.current = null;
      return;
    }
    if (pointersRef.current.size > 2) return;

    downRef.current = { t: performance.now(), p, moved: false };
    const L = live.current;
    const brushing = L.session?.kind === "brush" && !L.handMode && !spaceRef.current && e.button === 0;

    if (L.picking && L.session?.kind === "brush") {
      const ip = toImage(viewRef.current, p);
      let anchor = ip;
      if (L.cloneSource === "reference" && refRasterRef.current) {
        const k = refRasterRef.current.width / workingRef.current.width;
        anchor = { x: ip.x * k, y: ip.y * k };
      }
      setCloneAnchor(anchor);
      setPicking(false);
      gestureRef.current = { kind: "blocked" };
      showToast(L.cloneSource === "reference" ? "Upptök valin í hinni myndinni — strjúktu nú yfir þessa" : "Upptök valin — strjúktu nú þar sem á að afrita yfir");
      return;
    }

    if (brushing) {
      gestureRef.current = startStroke(p) ? { kind: "paint" } : { kind: "blocked" };
      if (gestureRef.current.kind === "paint") showCursor(p);
      return;
    }
    gestureRef.current = { kind: "pan", start: viewRef.current, p0: p };
  }

  function onPointerMove(e: RPointerEvent<HTMLDivElement>) {
    const p = stagePoint(e);
    const g = gestureRef.current;
    if (!pointersRef.current.has(e.pointerId)) {
      // Mús á sveimi yfir myndinni: sýna burstann.
      if (e.pointerType === "mouse" && live.current.session?.kind === "brush" && !live.current.handMode) showCursor(p);
      return;
    }
    pointersRef.current.set(e.pointerId, p);
    const d = downRef.current;
    if (d && Math.hypot(p.x - d.p.x, p.y - d.p.y) > 8) d.moved = true;
    if (!g) return;
    const s = stageSizeRef.current;
    if (g.kind === "pinch" && pointersRef.current.size >= 2) {
      const [a, b] = [...pointersRef.current.values()];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      applyView(clampView(pinchView(g.start, g.mid0, g.dist0, mid, dist, limits()), s, imageSize(), 0.45), true);
    } else if (g.kind === "pan") {
      applyView(clampView({ scale: g.start.scale, tx: g.start.tx + p.x - g.p0.x, ty: g.start.ty + p.y - g.p0.y }, s, imageSize()));
    } else if (g.kind === "paint") {
      showCursor(p);
      queueStroke(p);
    }
  }

  function onPointerUp(e: RPointerEvent<HTMLDivElement>) {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.delete(e.pointerId);
    const g = gestureRef.current;
    if (g?.kind === "paint") {
      endStroke();
      if (e.pointerType !== "mouse") showCursor(null);
    }
    if (g?.kind === "pinch") {
      // Ekkert málað fyrr en allir fingur eru farnir eftir klíp.
      gestureRef.current = pointersRef.current.size > 0 ? { kind: "blocked" } : null;
      applyView(clampView(viewRef.current, stageSizeRef.current, imageSize()));
      return;
    }
    if (pointersRef.current.size === 0) {
      // Tvípikk zoom-ar (ekki meðan málað er með bursta).
      const d = downRef.current;
      if (g?.kind === "pan" && d && !d.moved && performance.now() - d.t < 300) {
        const last = lastTapRef.current;
        if (last && performance.now() - last.t < 320 && Math.hypot(last.p.x - d.p.x, last.p.y - d.p.y) < 30) {
          const s = stageSizeRef.current;
          applyView(clampView(toggleZoom(viewRef.current, fitView(s, imageSize()), d.p, limits()), s, imageSize()), true);
          lastTapRef.current = null;
        } else {
          lastTapRef.current = { t: performance.now(), p: d.p };
        }
      }
      gestureRef.current = null;
      downRef.current = null;
    }
  }

  // ------------------------------------------------------------------ tól

  function enterTool(tabId: TabId, toolId: string) {
    if (busy) return;
    if (tabId === "likami") {
      setBodyTool(toolId as BodyToolId);
      if (session?.kind !== "body") void enterBody();
    } else if (tabId === "stilla") {
      setLookTool(toolId as LookToolId);
      if (session?.kind !== "looks") enterLooks();
    } else {
      setBrushMode(toolId as BrushMode);
      if (toolId === "clone" && !cloneAnchor) setPicking(true);
      else if (toolId !== "clone") setPicking(false);
      if (session?.kind !== "brush" || session.tab !== tabId) {
        setSession({ kind: "brush", tab: tabId, mark: history.mark() });
        setHandMode(false);
        showToast("Einn fingur málar · tveir fingur zoom-a og færa");
      }
    }
  }

  async function enterBody() {
    const levels = mainLevels();
    if (!levels) return;
    setSession({ kind: "body", mark: history.mark(), status: "detecting", frame: null });
    setBodyValues(ZERO_BODY);
    setPreviewShown(false);
    setBusy("Finn líkamann…");
    try {
      const base = previewFromLevels(levels, PREVIEW_MAX);
      previewBaseRef.current = base;
      const frame = await detectBody(rasterCanvas(base));
      setSession((s) => (s?.kind === "body" ? { ...s, status: frame ? "ready" : "nobody", frame } : s));
    } catch (err) {
      setSession((s) => (s?.kind === "body" ? { ...s, status: "failed" } : s));
      showToast(`Líkamsgreining mistókst: ${err instanceof Error ? err.message : "óþekkt villa"}`);
    } finally {
      setBusy(null);
    }
  }

  function enterLooks() {
    const levels = mainLevels();
    if (!levels) return;
    previewBaseRef.current = previewFromLevels(levels, PREVIEW_MAX);
    setSession({ kind: "looks", mark: history.mark() });
    setLookValues(ZERO_LOOKS);
    setPreviewShown(false);
  }

  function endSession() {
    setSession(null);
    setPreviewShown(false);
    previewBaseRef.current = null;
    setBodyValues(ZERO_BODY);
    setLookValues(ZERO_LOOKS);
    setPicking(false);
    setHandMode(false);
    showCursor(null);
  }

  function cancelSession() {
    const s = live.current.session;
    if (s?.kind === "brush") {
      const before = history.topSerial;
      const next = history.revertTo(s.mark, workingRef.current);
      if (before > s.mark) {
        if (next === workingRef.current) {
          paintAll();
          rerender();
        } else setWorking(next);
      }
    }
    endSession();
  }

  async function commitSession() {
    const s = session;
    if (!s || busy) return;
    if (s.kind === "brush") {
      endSession();
      return;
    }
    if (s.kind === "body") {
      const tune = bodyTuneFromValues(bodyValues);
      if (!s.frame || tuneIsIdentity(tune)) {
        endSession();
        return;
      }
      setBusy("Vinn í fullri upplausn…");
      await nextPaint();
      try {
        const before = workingRef.current;
        const out = warpBody(before, s.frame, tune);
        history.pushFull(before);
        setWorking(out);
      } finally {
        setBusy(null);
      }
      endSession();
      return;
    }
    const looks = looksFromValues(lookValues);
    if (looksIsNeutral(looks)) {
      endSession();
      return;
    }
    setBusy("Vinn í fullri upplausn…");
    await nextPaint();
    try {
      const w = workingRef.current;
      history.pushFull(cloneRaster(w));
      applyLooks(w, looks);
      paintAll();
      dirtyRef.current = true;
    } finally {
      setBusy(null);
    }
    endSession();
  }

  // Forsýn sleða (Líkami / Ljós og litir) — einn útreikningur á ramma.
  function renderPreview() {
    previewQueuedRef.current = false;
    const s = live.current.session;
    const base = previewBaseRef.current;
    const canvas = previewRef.current;
    if (!s || !base || !canvas) return;
    let out: Raster | null = null;
    if (s.kind === "body" && s.frame) {
      const tune = bodyTuneFromValues(live.current.bodyValues);
      if (!tuneIsIdentity(tune)) out = warpBody(base, s.frame, tune);
    } else if (s.kind === "looks") {
      const looks = looksFromValues(live.current.lookValues);
      if (!looksIsNeutral(looks)) {
        out = cloneRaster(base);
        applyLooks(out, looks);
      }
    }
    if (!out) {
      setPreviewShown(false);
      return;
    }
    canvas.width = out.width;
    canvas.height = out.height;
    canvas.getContext("2d")?.putImageData(imageDataFor(out), 0, 0);
    canvas.style.height = `${(out.height / out.width) * workingRef.current.width}px`;
    setPreviewShown(true);
  }

  useEffect(() => {
    if (!previewSession) return;
    if (!previewQueuedRef.current) {
      previewQueuedRef.current = true;
      requestAnimationFrame(renderPreview);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bodyValues, lookValues, session]);

  useEffect(() => {
    positionMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloneAnchor, session, brushMode, cloneSource]);

  // Tilvísunarmynd (afrita úr annarri mynd): sýnd í sviðinu meðan valið er.
  useEffect(() => {
    const c = refCanvasRef.current;
    const r = refRasterRef.current;
    if (!c || !r || refVersion === 0) return;
    c.width = r.width;
    c.height = r.height;
    c.getContext("2d")?.putImageData(imageDataFor(r), 0, 0);
  }, [refVersion]);

  async function openReference(file: File) {
    try {
      setBusy("Opna mynd…");
      refRasterRef.current = await loadRaster(file, MAX_WORKING);
      setRefVersion((v) => v + 1);
      setCloneSource("reference");
      setCloneAnchor(null);
      setPicking(true);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gat ekki opnað myndina");
    } finally {
      setBusy(null);
    }
  }

  // ------------------------------------------------------------------ afturkalla

  function afterHistory(next: Raster) {
    if (next !== workingRef.current) setWorking(next);
    else {
      paintAll();
      dirtyRef.current = true;
      rerender();
    }
  }

  function canUndoNow(): boolean {
    if (busy || previewSession) return false;
    if (session?.kind === "brush") return history.topSerial > session.mark;
    return history.canUndo;
  }

  function undo() {
    if (!canUndoNow() || strokeRef.current) return;
    afterHistory(history.undo(workingRef.current));
  }

  function redo() {
    if (busy || previewSession || strokeRef.current || !history.canRedo) return;
    afterHistory(history.redo(workingRef.current));
  }

  function startOver() {
    const o = originalRef.current;
    if (!o) return;
    history.pushFull(workingRef.current);
    setWorking(cloneRaster(o));
    setMenuOpen(false);
    fitNow();
  }

  // ------------------------------------------------------------------ vista

  const outType = mime === "image/png" ? "image/png" : "image/jpeg";
  const outName = `${name.replace(/\.[^.]+$/, "") || "mynd"}-mota.${outType === "image/png" ? "png" : "jpg"}`;

  async function exportBlob(): Promise<Blob> {
    const c = main0.current;
    if (!c) throw new Error("Engin mynd");
    return canvasToBlob(c, outType, 0.95);
  }

  async function save() {
    try {
      const blob = await exportBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = outName;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      dirtyRef.current = false;
      showToast(`Vistað · ${working.width}×${working.height}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Vistun mistókst");
    }
  }

  const canShare = typeof navigator !== "undefined" && typeof navigator.canShare === "function";

  async function share() {
    setMenuOpen(false);
    try {
      const blob = await exportBlob();
      const file = new File([blob], outName, { type: outType });
      if (!navigator.canShare?.({ files: [file] })) {
        showToast("Þessi vafri getur ekki deilt myndum — notaðu Vista");
        return;
      }
      await navigator.share({ files: [file], title: outName });
      dirtyRef.current = false;
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") showToast(err.message);
    }
  }

  async function prepareSend() {
    try {
      setSendBlob(await exportBlob());
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gat ekki útbúið myndina");
    }
  }

  // ------------------------------------------------------------------ útlit

  const tabTools =
    tab === "likami" ? BODY_TOOLS : tab === "stilla" ? LOOK_TOOLS : BRUSH_TABS[tab];
  const activeTab: TabId = session ? (session.kind === "body" ? "likami" : session.kind === "looks" ? "stilla" : session.tab) : tab;
  const shownTools = session ? (activeTab === "likami" ? BODY_TOOLS : activeTab === "stilla" ? LOOK_TOOLS : BRUSH_TABS[activeTab as "mota" | "lagfaera"]) : tabTools;
  const activeToolId = !session ? null : session.kind === "body" ? bodyTool : session.kind === "looks" ? lookTool : brushMode;
  const sessionTitle = TABS.find((t) => t.id === activeTab)?.label ?? "";

  const showOriginal = comparing && !previewSession;
  const showPreview = previewSession && previewShown && !comparing;
  const showRef = picking && cloneSource === "reference" && refVersion > 0 && brushSession;
  const showMain = !showOriginal && !showPreview && !showRef;
  const undoable = canUndoNow();
  const redoable = !busy && !previewSession && history.canRedo;
  const bodySpec = BODY_TOOLS.find((t) => t.id === bodyTool)!;
  const lookSpec = LOOK_TOOLS.find((t) => t.id === lookTool)!;
  const brushHint = (BRUSH_TABS.mota.find((t) => t.id === brushMode) ?? BRUSH_TABS.lagfaera.find((t) => t.id === brushMode))?.hint;

  function toolHasValue(id: string): boolean {
    if (session?.kind === "body") return (bodyValues as Record<string, number>)[id] !== 0;
    if (session?.kind === "looks") return (lookValues as Record<string, number>)[id] !== 0;
    return false;
  }

  const editor = (
    <div className="mx-root" role="application" aria-label="Móta — myndritill">
      <header className="mx-top">
        <button type="button" className="mx-icon-btn" onClick={requestClose} aria-label="Loka ritlinum">
          <Icon name="back" />
        </button>
        <div className="mx-title-block">
          <strong>Móta</strong>
          <span>
            {working.width}×{working.height}
          </span>
        </div>
        <div className="mx-spacer" />
        <button type="button" className="mx-save" onClick={() => void save()} disabled={!!busy || previewSession}>
          Vista
        </button>
        <button type="button" className="mx-icon-btn" onClick={() => setMenuOpen((o) => !o)} aria-label="Fleira" aria-expanded={menuOpen}>
          <Icon name="more" />
        </button>
        {menuOpen && (
          <div className="mx-menu" role="menu">
            {canShare && (
              <button type="button" role="menuitem" onClick={() => void share()}>
                Deila / vista í síma…
              </button>
            )}
            <div className="mx-menu-send">
              {sendBlob ? (
                <SendTo blob={sendBlob} mediaType="image" sourceTool="mota" sourceToolName="Móta" name={outName} />
              ) : (
                <button type="button" role="menuitem" onClick={() => void prepareSend()}>
                  Senda í annað tól…
                </button>
              )}
            </div>
            <button type="button" role="menuitem" onClick={() => fileRef.current?.click()}>
              Opna aðra mynd
            </button>
            <button type="button" role="menuitem" onClick={startOver} disabled={!!session}>
              Byrja upp á nýtt
            </button>
            <button type="button" role="menuitem" onClick={requestClose}>
              Loka ritlinum
            </button>
          </div>
        )}
      </header>

      <div
        ref={stageRef}
        className={`mx-stage${brushSession && !handMode ? " brush" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse" && !pointersRef.current.size) showCursor(null);
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div ref={layerRef} className="mx-layer">
          <div className="mx-pyr" style={{ visibility: showMain ? "visible" : "hidden" }}>
            <canvas ref={main0} />
            <canvas ref={main1} />
            <canvas ref={main2} />
          </div>
          <div className="mx-pyr mx-orig" style={{ visibility: showOriginal ? "visible" : "hidden" }}>
            <canvas ref={orig0} />
            <canvas ref={orig1} />
            <canvas ref={orig2} />
          </div>
          <canvas ref={previewRef} className="mx-preview" style={{ visibility: showPreview ? "visible" : "hidden" }} />
          <canvas ref={refCanvasRef} className="mx-preview" style={{ visibility: showRef ? "visible" : "hidden", height: refRasterRef.current ? `${(refRasterRef.current.height / refRasterRef.current.width) * working.width}px` : undefined }} />
        </div>

        <div ref={cursorRef} className="mx-cursor" />
        <div ref={anchorRef} className="mx-anchor" />
        <div ref={srcMarkRef} className="mx-src" />
        <div ref={zoomPillRef} className="mx-zoom-pill" />
        {sizePreview && (
          <div className="mx-size-preview" style={{ width: brushSize * 2, height: brushSize * 2 }} />
        )}
        {showRef && <div className="mx-banner">Pikkaðu á staðinn í hinni myndinni sem á að afrita FRÁ</div>}
        {picking && cloneSource === "self" && brushSession && (
          <div className="mx-banner">Pikkaðu á staðinn sem á að afrita FRÁ</div>
        )}
        {comparing && <div className="mx-banner subtle">{previewSession ? "Fyrir" : "Upprunalega myndin"}</div>}
        {toast && <div className="mx-toast">{toast}</div>}

        {!previewSession && (
          <div className="mx-float left" onPointerDown={(e) => e.stopPropagation()} onPointerMove={(e) => e.stopPropagation()} onPointerEnter={() => showCursor(null)}>
            <button type="button" onClick={undo} disabled={!undoable} aria-label="Afturkalla">
              <Icon name="undo" size={22} />
            </button>
            <button type="button" onClick={redo} disabled={!redoable} aria-label="Endurgera">
              <Icon name="redo" size={22} />
            </button>
            {brushSession && (
              <button
                type="button"
                className={handMode ? "on" : ""}
                onClick={() => setHandMode((h) => !h)}
                aria-label="Færa myndina með einum fingri"
                aria-pressed={handMode}
              >
                <Icon name="hand" size={22} />
              </button>
            )}
          </div>
        )}
        <div className="mx-float right" onPointerDown={(e) => e.stopPropagation()} onPointerMove={(e) => e.stopPropagation()} onPointerEnter={() => showCursor(null)}>
          <button
            type="button"
            aria-label="Halda inni til að sjá fyrir"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              setComparing(true);
            }}
            onPointerUp={() => setComparing(false)}
            onPointerCancel={() => setComparing(false)}
            onLostPointerCapture={() => setComparing(false)}
          >
            <Icon name="compare" size={22} />
          </button>
        </div>

        {busy && (
          <div className="mx-busy">
            <span className="mx-spinner" />
            {busy}
          </div>
        )}
      </div>

      <footer className="mx-panel">
        {session?.kind === "body" && (
          <div className="mx-controls">
            {session.status === "ready" ? (
              <SliderRow
                spec={bodySpec.slider}
                value={bodyValues[bodyTool]}
                onChange={(v) => setBodyValues((b) => ({ ...b, [bodyTool]: v }))}
                onReset={() => setBodyValues((b) => ({ ...b, [bodyTool]: 0 }))}
                label={bodySpec.label}
              />
            ) : session.status === "detecting" ? (
              <p className="mx-note">Finn líkamann á myndinni…</p>
            ) : (
              <div className="mx-note">
                {session.status === "nobody"
                  ? "Fann ekki líkama — axlir og mjaðmir þurfa að sjást. Notaðu Móta-burstann í staðinn."
                  : "Líkamsgreiningin náði ekki að hlaðast. Prófaðu aftur eða notaðu Móta-burstann."}
                <button
                  type="button"
                  className="mx-chip"
                  onClick={() => {
                    endSession();
                    setTab("mota");
                    enterTool("mota", "shrink");
                  }}
                >
                  Opna Móta-burstann
                </button>
              </div>
            )}
          </div>
        )}
        {session?.kind === "looks" && (
          <div className="mx-controls">
            <SliderRow
              spec={lookSpec.slider}
              value={lookValues[lookTool]}
              onChange={(v) => setLookValues((l) => ({ ...l, [lookTool]: v }))}
              onReset={() => setLookValues((l) => ({ ...l, [lookTool]: 0 }))}
              label={lookSpec.label}
            />
          </div>
        )}
        {session?.kind === "brush" && (
          <div className="mx-controls">
            <div className="mx-slider-row">
              <span className="mx-lab">Stærð</span>
              <input
                type="range"
                className="mx-range"
                min={BRUSH_MIN}
                max={BRUSH_MAX}
                value={brushSize}
                style={trackStyle(brushSize, { min: BRUSH_MIN, max: BRUSH_MAX, left: "", right: "" })}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                onPointerDown={() => setSizePreview(true)}
                onPointerUp={() => setSizePreview(false)}
                onPointerCancel={() => setSizePreview(false)}
                onBlur={() => setSizePreview(false)}
                aria-label="Burstastærð"
              />
              <span className="mx-val">{brushSize}</span>
            </div>
            <div className="mx-slider-row">
              <span className="mx-lab">Styrkur</span>
              <input
                type="range"
                className="mx-range"
                min={10}
                max={100}
                value={brushStrength}
                style={trackStyle(brushStrength, { min: 10, max: 100, left: "", right: "" })}
                onChange={(e) => setBrushStrength(Number(e.target.value))}
                aria-label="Styrkur bursta"
              />
              <span className="mx-val">{brushStrength}%</span>
            </div>
            {brushMode === "clone" ? (
              <div className="mx-chips">
                <button type="button" className={`mx-chip${picking ? " on" : ""}`} onClick={() => setPicking((p) => !p)}>
                  <Icon name="target" size={16} /> Upptök
                </button>
                <button
                  type="button"
                  className={`mx-chip${cloneSource === "self" ? " on" : ""}`}
                  onClick={() => {
                    setCloneSource("self");
                    setCloneAnchor(null);
                    setPicking(true);
                  }}
                >
                  Sama mynd
                </button>
                <button
                  type="button"
                  className={`mx-chip${cloneSource === "reference" ? " on" : ""}`}
                  onClick={() => refFileRef.current?.click()}
                >
                  <Icon name="image" size={16} /> Úr annarri mynd
                </button>
              </div>
            ) : (
              <p className="mx-hint">{brushHint}</p>
            )}
          </div>
        )}

        <div className="mx-tools" role="toolbar" aria-label="Tól">
          {shownTools.map((t) => (
            <button
              key={`${activeTab}-${t.id}`}
              type="button"
              className={`mx-tool${activeToolId === t.id ? " on" : ""}`}
              onClick={() => enterTool(activeTab, t.id)}
              title={t.hint}
              disabled={!!busy}
            >
              <Icon name={t.id} size={26} />
              <span>{t.label}</span>
              {toolHasValue(t.id) && <i className="mx-dot" />}
            </button>
          ))}
        </div>

        <nav className="mx-bottom">
          {session ? (
            <>
              <button type="button" className="mx-icon-btn" onClick={cancelSession} aria-label="Hætta við" disabled={!!busy}>
                <Icon name="close" />
              </button>
              <span className="mx-session-title">{sessionTitle}</span>
              <button type="button" className="mx-icon-btn accent" onClick={() => void commitSession()} aria-label="Nota" disabled={!!busy}>
                <Icon name="check" />
              </button>
            </>
          ) : (
            <div className="mx-tabs" role="tablist">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  className={`mx-tab${tab === t.id ? " on" : ""}`}
                  onClick={() => setTab(t.id)}
                  title={t.hint}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </nav>
      </footer>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          if (dirtyRef.current && !window.confirm("Opna aðra mynd? Breytingar sem ekki eru vistaðar tapast.")) return;
          setMenuOpen(false);
          onReplace(f);
        }}
      />
      <input
        ref={refFileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void openReference(f);
        }}
      />
    </div>
  );

  return typeof document === "undefined" ? null : createPortal(editor, document.body);
}

function SliderRow({
  spec,
  value,
  onChange,
  onReset,
  label,
}: {
  spec: SliderSpec;
  value: number;
  onChange: (v: number) => void;
  onReset: () => void;
  label: string;
}) {
  return (
    <>
      <div className="mx-slider-row">
        <button type="button" className="mx-reset" onClick={onReset} disabled={value === 0} aria-label={`Núllstilla ${label}`}>
          <Icon name="reset" size={20} />
        </button>
        <input
          type="range"
          className="mx-range"
          min={spec.min}
          max={spec.max}
          value={value}
          style={trackStyle(value, spec)}
          onChange={(e) => onChange(Number(e.target.value))}
          onDoubleClick={onReset}
          aria-label={label}
        />
        <span className="mx-val">{signed(value)}</span>
      </div>
      <div className="mx-ends">
        <span>{spec.left}</span>
        <span>{spec.right}</span>
      </div>
    </>
  );
}
