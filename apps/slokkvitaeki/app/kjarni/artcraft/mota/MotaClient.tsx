"use client";

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { StationChrome } from "../../StationChrome";
import { artcraftHubHref, artcraftToolsHref } from "../apps";
import SendTo from "../SendTo";
import StagingPicker from "../StagingPicker";
import { useStagedSource } from "../useStagedSource";
import "../artcraft.css";
import {
  cloneRaster,
  createRaster,
  fitSize,
  liquifyInPlace,
  strokePoints,
  type LiquifyMode,
  type Raster,
} from "../studio/adjust";
import { DEFAULT_TUNE, warpBody, type BodyTune } from "../likami/bodyWarp";
import { detectBody } from "../likami/pose";
import {
  adjustBrightnessGlobal,
  adjustContrastGlobal,
  applyRetouch,
  equalizeSkinTone,
  sharpenGlobal,
  shiftSkinTone,
  stretchHeight,
  type RetouchMode,
} from "./retouch";

/** Lazy wrapper around SendTo for Móta — the output is a canvas raster, not
 *  a persistent blob. User clicks "Útbúa til að senda", we rasterToBlob on
 *  demand, then the SendTo dropdown appears for destination selection. */
function MotaSendTo({ getBlob, name }: { getBlob: () => Promise<Blob | null>; name?: string }) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function prepare() {
    setBusy(true);
    setErr("");
    try {
      const b = await getBlob();
      if (!b) throw new Error("Engin mynd");
      setBlob(b);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Útbúa mistókst");
    } finally {
      setBusy(false);
    }
  }
  if (blob) {
    return (
      <SendTo
        blob={blob}
        mediaType="image"
        sourceTool="mota"
        sourceToolName="Móta"
        name={name}
      />
    );
  }
  return (
    <>
      <button type="button" className="ac-btn" onClick={() => void prepare()} disabled={busy}>
        {busy ? "Útbý…" : "Senda í… ▾"}
      </button>
      {err && <span className="ac-error" style={{ marginLeft: 8, fontSize: 12 }}>{err}</span>}
    </>
  );
}

const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_DIMENSION = 1200;
const MAX_UNDO = 20;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 10;

function clampZoom(z: number): number {
  return Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z)) * 100) / 100;
}

/** Punktur á striganum (hlutfall fx, fy) sem á að lenda undir skjápunkti (cx, cy). */
type ZoomAnchor = { fx: number; fy: number; cx: number; cy: number };

type ToolCategory = "lögun" | "áferð";
type AnyMode = LiquifyMode | RetouchMode;

const CATEGORIES: Array<{ id: ToolCategory; label: string; hint: string }> = [
  { id: "lögun", label: "Lögun", hint: "Breyta lögun líkamslína — mjókka, þenja eða draga útlínu." },
  { id: "áferð", label: "Áferð", hint: "Jafna húð, lýsa upp, skyggja eða fjarlægja bletti/ör." },
];

const LIQUIFY_TOOLS: Array<{ id: LiquifyMode; label: string; hint: string }> = [
  { id: "shrink", label: "Minnka", hint: "Dregur inn — mjókkar" },
  { id: "expand", label: "Stækka", hint: "Þenur út — gerir fyllra" },
  { id: "drag", label: "Færa", hint: "Færir útlínu með bustanum" },
];

const RETOUCH_TOOLS: Array<{ id: RetouchMode; label: string; hint: string }> = [
  { id: "smooth", label: "Slétta", hint: "Mjúkt blur — jafnar út húð og dregur úr hrukkum" },
  { id: "heal", label: "Fjarlægja", hint: "Blandar úr hringnum í kring — tekur burt bletti, ör, hárspotti" },
  { id: "clone", label: "Afrita", hint: "Clone Stamp — veldu upptökustað, sléttu yfir annað" },
  { id: "lighten", label: "Lýsa", hint: "Hækkar birtu smám saman (dodge)" },
  { id: "darken", label: "Skyggja", hint: "Lækkar birtu smám saman (burn)" },
  { id: "sharpen", label: "Skerpa", hint: "Unsharp mask — bætir skýrleika og fókus í burstanum (clarity/focus)" },
  { id: "contrast", label: "Kontrast", hint: "Dregur skugga niður og highlights upp — eykur kontrastinn í burstanum" },
];

function isLiquifyMode(id: AnyMode): id is LiquifyMode {
  return id === "shrink" || id === "expand" || id === "drag";
}

function isPhotoFile(file: { type: string; name: string }): boolean {
  if (/^image\/(jpeg|png|webp)$/i.test(file.type)) return true;
  return /\.(jpe?g|png|webp)$/i.test(file.name);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Gat ekki opnað myndina"));
    img.src = src;
  });
}

function rasterFromImage(img: HTMLImageElement): Raster {
  const size = fitSize(img.naturalWidth || img.width, img.naturalHeight || img.height, MAX_DIMENSION);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return createRaster(size.width, size.height, 0);
  ctx.drawImage(img, 0, 0, size.width, size.height);
  const data = ctx.getImageData(0, 0, size.width, size.height);
  return { data: new Uint8ClampedArray(data.data), width: size.width, height: size.height };
}

function drawRaster(canvas: HTMLCanvasElement, raster: Raster) {
  canvas.width = raster.width;
  canvas.height = raster.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(raster.data), raster.width, raster.height), 0, 0);
}

function rasterToBlob(raster: Raster): Promise<Blob> {
  const canvas = document.createElement("canvas");
  drawRaster(canvas, raster);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Gat ekki vistað mynd"))), "image/jpeg", 0.95);
  });
}

function downloadBlob(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
}

export default function MotaClient() {
  const inputRef = useRef<HTMLInputElement>(null);
  const viewRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const originalRef = useRef<Raster | null>(null);
  const workingRef = useRef<Raster | null>(null);
  const undoRef = useRef<Raster[]>([]);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const drawingRef = useRef(false);
  const toolRef = useRef<AnyMode>("shrink");
  const radiusRef = useRef(44);
  const strengthRef = useRef(0.55);
  // Clone stamp state: anchor er upptökustaður, offset reiknast við fyrsta
  // dab-ið í stroke-i svo src færist með dst á meðan user strjúkur.
  // refRaster: valfrjáls aukamynd (screenshot/reference) sem er clone-source
  // í stað target-myndarinnar sjálfrar — nothæft fyrir detail-fix þar sem
  // notandi vill grof-stimpla pixla úr annarri mynd og láta vélina blanda.
  const cloneAnchorRef = useRef<{ x: number; y: number } | null>(null);
  const cloneOffsetRef = useRef<{ dx: number; dy: number } | null>(null);
  const strokeStartDstRef = useRef<{ x: number; y: number } | null>(null);
  const refRasterRef = useRef<Raster | null>(null);
  const refViewRef = useRef<HTMLCanvasElement>(null);
  const refInputRef = useRef<HTMLInputElement>(null);
  const [pickingSource, setPickingSource] = useState(false);
  const [cloneAnchor, setCloneAnchor] = useState<{ x: number; y: number } | null>(null);
  const [cloneSourceKind, setCloneSourceKind] = useState<"self" | "reference">("self");
  const [refName, setRefName] = useState("");
  const [refReady, setRefReady] = useState(false);
  const [pickingRefSource, setPickingRefSource] = useState(false);

  const [drag, setDrag] = useState(false);
  const [sourceName, setSourceName] = useState("");
  const [ready, setReady] = useState(false);
  const [category, setCategory] = useState<ToolCategory>("lögun");
  const [tool, setTool] = useState<AnyMode>("shrink");
  const [radius, setRadius] = useState(44);
  const [strength, setStrength] = useState(0.55);
  const [canUndo, setCanUndo] = useState(false);
  const [error, setError] = useState("");
  const [cursor, setCursor] = useState<{ x: number; y: number; size: number } | null>(null);
  // Zoom: 1 = myndin passar í sviðið. Striginn fær nákvæma birtingarstærð
  // (fit × zoom) svo að músar-/fingrahnit varpist beint á pixla; sviðið skrunar.
  // Tveir fingur klípa/færa, einn fingur málar; ctrl+skrun á tölvu.
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const [stageWidth, setStageWidth] = useState(0);
  // Hækkað þegar stærð myndarinnar getur breyst (ný mynd, líkamsmótun,
  // afturkalla) svo birtingarstærð strigans sé reiknuð upp á nýtt.
  const [, setRasterVersion] = useState(0);
  const pendingAnchorRef = useRef<ZoomAnchor | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const gestureRef = useRef<{ dist: number; zoom: number; fx: number; fy: number } | null>(null);
  const [bodyBusy, setBodyBusy] = useState(false);

  toolRef.current = tool;
  radiusRef.current = radius;
  strengthRef.current = strength;
  zoomRef.current = zoom;

  useEffect(() => {
    const stage = stageRef.current;
    if (!ready || !stage) return;
    const measure = () => setStageWidth(stage.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    // React skráir wheel sem passive, svo preventDefault í onWheel er hunsað
    // og vafrinn zoom-ar allri síðunni — því native, non-passive hlustari hér.
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomTo(zoomRef.current * Math.exp(-e.deltaY * 0.0015), anchorAt(e.clientX, e.clientY));
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      observer.disconnect();
      stage.removeEventListener("wheel", onWheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useLayoutEffect(() => {
    const anchor = pendingAnchorRef.current;
    pendingAnchorRef.current = null;
    if (anchor) scrollToAnchor(anchor);
  }, [zoom]);

  /** Hlutfallsstaða skjápunkts á striganum — það sem á að haldast kyrrt. */
  function anchorAt(clientX: number, clientY: number): ZoomAnchor | null {
    const canvas = viewRef.current;
    if (!canvas) return null;
    const r = canvas.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    return { fx: (clientX - r.left) / r.width, fy: (clientY - r.top) / r.height, cx: clientX, cy: clientY };
  }

  function centerAnchor(): ZoomAnchor | null {
    const stage = stageRef.current;
    if (!stage) return null;
    const s = stage.getBoundingClientRect();
    return anchorAt(s.left + s.width / 2, s.top + s.height / 2);
  }

  function scrollToAnchor(a: ZoomAnchor) {
    const stage = stageRef.current;
    const canvas = viewRef.current;
    if (!stage || !canvas) return;
    const r = canvas.getBoundingClientRect();
    stage.scrollLeft += r.left + a.fx * r.width - a.cx;
    stage.scrollTop += r.top + a.fy * r.height - a.cy;
  }

  function zoomTo(next: number, anchor: ZoomAnchor | null = centerAnchor()) {
    const z = clampZoom(next);
    if (z === zoomRef.current) {
      if (anchor) scrollToAnchor(anchor);
      return;
    }
    pendingAnchorRef.current = anchor;
    zoomRef.current = z;
    setZoom(z);
  }

  const fitHeight = typeof window === "undefined" ? 520 : Math.min(520, window.innerHeight * 0.7);
  const shown = workingRef.current;
  const fit = shown && stageWidth > 0 ? Math.min(stageWidth / shown.width, fitHeight / shown.height) : 1;
  const displayWidth = shown ? Math.max(1, Math.round(shown.width * fit * zoom)) : 0;
  const displayHeight = shown ? Math.max(1, Math.round(shown.height * fit * zoom)) : 0;

  function paint() {
    const working = workingRef.current;
    const canvas = viewRef.current;
    if (!working || !canvas) return;
    drawRaster(canvas, working);
  }

  // The <canvas> only mounts once `ready` flips true and React commits —
  // paint() called synchronously right after setReady() would still find
  // viewRef.current null, so the first draw has to happen from an effect.
  useEffect(() => {
    if (ready) paint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  async function addFile(file: File) {
    if (!isPhotoFile(file)) return;
    setError("");
    try {
      const img = await loadImage(URL.createObjectURL(file));
      const raster = rasterFromImage(img);
      originalRef.current = cloneRaster(raster);
      workingRef.current = raster;
      undoRef.current = [];
      setCanUndo(false);
      setSourceName(file.name);
      setReady(true);
      zoomRef.current = 1;
      setZoom(1);
      setRasterVersion((v) => v + 1);
      paint();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gat ekki opnað myndina.");
    }
  }

  async function addRefFile(file: File) {
    if (!isPhotoFile(file)) return;
    setError("");
    try {
      const img = await loadImage(URL.createObjectURL(file));
      const raster = rasterFromImage(img);
      refRasterRef.current = raster;
      setRefName(file.name);
      setRefReady(true);
      // Teikna strax á reference-canvas-inn þegar hann er mounted.
      requestAnimationFrame(() => {
        const c = refViewRef.current;
        if (c) drawRaster(c, raster);
      });
      // Nýtt reference ógildir eldra anchor — notandi þarf að velja á ný.
      cloneAnchorRef.current = null;
      setCloneAnchor(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gat ekki opnað reference-myndina.");
    }
  }

  useStagedSource(async (blob, item) => {
    const file = new File([blob], item.name || `from-${item.sourceTool}.png`, {
      type: blob.type || "image/png",
    });
    await addFile(file);
  });

  async function getExportBlob(): Promise<Blob | null> {
    const working = workingRef.current;
    if (!working) return null;
    return rasterToBlob(working);
  }

  function canvasPoint(e: PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const canvas = viewRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  }

  function pushUndo() {
    const working = workingRef.current;
    if (!working) return;
    undoRef.current.push(cloneRaster(working));
    if (undoRef.current.length > MAX_UNDO) undoRef.current.shift();
    setCanUndo(true);
  }

  function dab(x: number, y: number, prev: { x: number; y: number } | null) {
    const working = workingRef.current;
    if (!working) return;
    const pts = prev ? strokePoints(prev.x, prev.y, x, y, Math.max(2, radiusRef.current * 0.32)) : [{ x, y }];
    const currentTool = toolRef.current;
    if (isLiquifyMode(currentTool)) {
      for (const p of pts) {
        const moveX = prev ? x - prev.x : 0;
        const moveY = prev ? y - prev.y : 0;
        liquifyInPlace(working, p.x, p.y, radiusRef.current, strengthRef.current, currentTool, moveX, moveY);
      }
    } else if (currentTool === "clone") {
      const anchor = cloneAnchorRef.current;
      if (!anchor) return;
      // Reiknum offset frá upphafsdabs í þessu stroke-i — src færist með dst.
      if (!cloneOffsetRef.current && strokeStartDstRef.current) {
        cloneOffsetRef.current = {
          dx: strokeStartDstRef.current.x - anchor.x,
          dy: strokeStartDstRef.current.y - anchor.y,
        };
      }
      const offset = cloneOffsetRef.current ?? { dx: 0, dy: 0 };
      // Þegar notandi hefur hlaðið upp reference-mynd og valið anchor þar,
      // notum við hana sem src í stað target-myndar. Vélin hefur „grof"
      // stamp þá — og mýkt-faðaði-blöndun kemur sjálfkrafa af brush-weight
      // (soft falloff) og strength-slider.
      const extRaster = cloneSourceKind === "reference" ? refRasterRef.current ?? undefined : undefined;
      for (const p of pts) {
        applyRetouch(working, p.x, p.y, radiusRef.current, strengthRef.current, currentTool, {
          srcX: p.x - offset.dx,
          srcY: p.y - offset.dy,
          srcRaster: extRaster,
        });
      }
    } else {
      for (const p of pts) {
        applyRetouch(working, p.x, p.y, radiusRef.current, strengthRef.current, currentTool);
      }
    }
    paint();
  }

  function selectCategory(next: ToolCategory) {
    setCategory(next);
    // Veljum sjálfkrafa fyrsta tólið í nýja flokknum svo user þurfi ekki
    // að smella tvisvar.
    const first = next === "lögun" ? LIQUIFY_TOOLS[0].id : RETOUCH_TOOLS[0].id;
    setTool(first);
  }

  function pinch(): { dist: number; mx: number; my: number } {
    const [a, b] = [...pointersRef.current.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  }

  /** Fyrsti fingurinn byrjaði strik; annar fingur kom = þetta er klíp, ekki
   *  málning, svo strikið er tekið til baka. */
  function cancelStroke() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastRef.current = null;
    strokeStartDstRef.current = null;
    cloneOffsetRef.current = null;
    const prev = undoRef.current.pop();
    if (prev) workingRef.current = prev;
    setCanUndo(undoRef.current.length > 0);
    paint();
  }

  function onPointerDown(e: PointerEvent<HTMLCanvasElement>) {
    if (!workingRef.current) return;
    e.preventDefault();
    // Fyrsti fingur nýrrar snertingar: hreinsa fingur sem vafrinn gleymdi
    // að senda pointerup fyrir, svo þeir trufli ekki næsta klíp.
    if (e.isPrimary) {
      pointersRef.current.clear();
      gestureRef.current = null;
    }
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);
    if (pointersRef.current.size === 2) {
      cancelStroke();
      setCursor(null);
      const { dist, mx, my } = pinch();
      const anchor = anchorAt(mx, my);
      gestureRef.current = { dist: Math.max(1, dist), zoom: zoomRef.current, fx: anchor?.fx ?? 0.5, fy: anchor?.fy ?? 0.5 };
      return;
    }
    if (pointersRef.current.size > 2 || gestureRef.current) return;
    const p = canvasPoint(e);
    // Ef user valdi að taka clone-source, þá fer fyrsta smell í að setja
    // anchor-inn — ekki strik.
    if (pickingSource) {
      cloneAnchorRef.current = { x: p.x, y: p.y };
      setCloneAnchor({ x: p.x, y: p.y });
      setPickingSource(false);
      return;
    }
    drawingRef.current = true;
    pushUndo();
    strokeStartDstRef.current = { x: p.x, y: p.y };
    cloneOffsetRef.current = null; // reiknast á næsta dab
    lastRef.current = p;
    dab(p.x, p.y, null);
  }

  function updateCursor(e: PointerEvent<HTMLCanvasElement>) {
    const canvas = viewRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    const canvasRect = canvas.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const scale = canvasRect.width / canvas.width;
    // Hringurinn er absolute inni í skrunandi sviðinu → innihaldshnit (+ skrun).
    setCursor({
      x: e.clientX - stageRect.left - stage.clientLeft + stage.scrollLeft,
      y: e.clientY - stageRect.top - stage.clientTop + stage.scrollTop,
      size: radiusRef.current * 2 * scale,
    });
  }

  function onPointerMove(e: PointerEvent<HTMLCanvasElement>) {
    if (pointersRef.current.has(e.pointerId)) pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const gesture = gestureRef.current;
    if (gesture) {
      if (pointersRef.current.size >= 2) {
        const { dist, mx, my } = pinch();
        zoomTo((gesture.zoom * dist) / gesture.dist, { fx: gesture.fx, fy: gesture.fy, cx: mx, cy: my });
      }
      return;
    }
    updateCursor(e);
    if (!drawingRef.current) return;
    const p = canvasPoint(e);
    dab(p.x, p.y, lastRef.current);
    lastRef.current = p;
  }

  function onPointerUp(e: PointerEvent<HTMLCanvasElement>) {
    pointersRef.current.delete(e.pointerId);
    if (gestureRef.current) {
      // Ekkert málað fyrr en allir fingur eru farnir af eftir klíp.
      if (pointersRef.current.size === 0) gestureRef.current = null;
      return;
    }
    drawingRef.current = false;
    lastRef.current = null;
    strokeStartDstRef.current = null;
    cloneOffsetRef.current = null;
  }

  function onPointerLeave() {
    setCursor(null);
  }

  function undo() {
    const prev = undoRef.current.pop();
    if (!prev) return;
    workingRef.current = prev;
    setCanUndo(undoRef.current.length > 0);
    setRasterVersion((v) => v + 1);
    paint();
  }

  function resetToOriginal() {
    const original = originalRef.current;
    if (!original) return;
    workingRef.current = cloneRaster(original);
    undoRef.current = [];
    setCanUndo(false);
    setRasterVersion((v) => v + 1);
    paint();
  }

  async function download() {
    const working = workingRef.current;
    if (!working) return;
    const blob = await rasterToBlob(working);
    downloadBlob(URL.createObjectURL(blob), `${sourceName.replace(/\.[^.]+$/, "") || "mynd"}-mota.jpg`);
  }

  function applyGlobal(fn: (r: Raster) => void) {
    const w = workingRef.current;
    if (!w) return;
    pushUndo();
    fn(w);
    paint();
  }

  /** Líkamsforstillingar finna líkamann fyrst (sama greining og Líkamsmótun)
   *  svo breytingin lendi á mitti/mjöðmum manneskjunnar, ekki á fastri rönd
   *  um miðju myndarinnar. Greint upp á nýtt í hvert sinn — fyrri breyting
   *  hefur fært líkamann. */
  async function applyBodyTune(tune: Partial<BodyTune>, fallback?: (r: Raster) => void) {
    const w = workingRef.current;
    if (!w || bodyBusy) return;
    setBodyBusy(true);
    setError("");
    try {
      const probe = document.createElement("canvas");
      drawRaster(probe, w);
      const frame = await detectBody(probe);
      if (!frame || (tune.legs && !frame.legs)) {
        if (fallback) {
          applyGlobal(fallback);
          return;
        }
        setError("Fann ekki líkama — axlir og mjaðmir þurfa að sjást. Notaðu burstann í staðinn.");
        return;
      }
      // Myndin eins og hún er núna — notandinn gæti hafa afturkallað á meðan.
      const current = workingRef.current;
      if (!current) return;
      pushUndo();
      workingRef.current = warpBody(current, frame, { ...DEFAULT_TUNE, ...tune });
      setRasterVersion((v) => v + 1);
      paint();
    } catch (err) {
      setError(`Líkamsgreining mistókst: ${err instanceof Error ? err.message : "óþekkt villa"}`);
    } finally {
      setBodyBusy(false);
    }
  }

  return (
    <StationChrome tool="artcraft">
      <div className="ac-hub">
        <div className="ac-hub-in ac-studio">
          <p className="ac-kicker">
            <a href={artcraftHubHref()}>ArtCraft</a>
            {" · "}
            <a href={artcraftToolsHref()}>Tól</a>
            {" · Móta"}
          </p>
          <h1>Móta</h1>
          <p className="ac-lead">
            Mjókka, þenja og draga líkamslínur í „Lögun"-ham; jafna húð, lýsa, skyggja og fjarlægja
            bletti/ör í „Áferð"-ham. Stilltu stærð og styrk og strjúktu yfir myndina — allt gerist í
            vafranum, engin mynd fer neitt.
          </p>

          {!ready && (
            <section
              className={`ac-drop ${drag ? "on" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                const file = e.dataTransfer.files?.[0];
                if (file) void addFile(file);
              }}
            >
              <p>Slepptu mynd hér, eða</p>
              <button type="button" className="ac-btn" onClick={() => inputRef.current?.click()}>
                Velja mynd
              </button>
              <div style={{ marginTop: 8 }}>
                <StagingPicker
                  accepts="image"
                  onPick={async (blob, item) => {
                    const file = new File([blob], item.name || `from-${item.sourceTool}.png`, { type: blob.type || "image/png" });
                    await addFile(file);
                  }}
                />
              </div>
            </section>
          )}

          <input
            ref={inputRef}
            type="file"
            accept={PHOTO_ACCEPT}
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void addFile(file);
              e.target.value = "";
            }}
          />

          {error && <p className="ac-error">{error}</p>}

          {ready && (
            <section className="ac-panel ac-adjust">
              <div className="ac-row ac-tools" role="radiogroup" aria-label="Flokkur">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={category === c.id}
                    className={`ac-btn ghost ${category === c.id ? "on" : ""}`}
                    title={c.hint}
                    onClick={() => selectCategory(c.id)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <div className="ac-row ac-tools">
                {(category === "lögun" ? LIQUIFY_TOOLS : RETOUCH_TOOLS).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`ac-btn ghost ${tool === item.id ? "on" : ""}`}
                    title={item.hint}
                    onClick={() => setTool(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <p className="ac-hint">
                Strjúktu yfir mynd með bustanum —{" "}
                {(category === "lögun" ? LIQUIFY_TOOLS : RETOUCH_TOOLS).find((t) => t.id === tool)?.hint.toLowerCase()}
                .
              </p>

              {tool === "clone" && (
                <>
                  <div className="ac-row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontSize: 12, opacity: 0.8 }}>Upptökustaður úr:</span>
                    <button
                      type="button"
                      className={`ac-btn ghost ${cloneSourceKind === "self" ? "on" : ""}`}
                      onClick={() => {
                        setCloneSourceKind("self");
                        setPickingRefSource(false);
                      }}
                      title="Afrita úr sömu mynd"
                    >
                      Sama mynd
                    </button>
                    <button
                      type="button"
                      className={`ac-btn ghost ${cloneSourceKind === "reference" ? "on" : ""}`}
                      onClick={() => {
                        setCloneSourceKind("reference");
                        setPickingSource(false);
                      }}
                      title="Afrita úr reference-mynd (screenshot)"
                    >
                      Reference-mynd {refReady ? "✓" : "(upphala fyrst)"}
                    </button>
                  </div>
                  <div className="ac-row" style={{ marginTop: 6 }}>
                    {cloneSourceKind === "self" ? (
                      <button
                        type="button"
                        className={`ac-btn ${pickingSource ? "" : "ghost"}`}
                        onClick={() => {
                          setPickingSource(true);
                          setPickingRefSource(false);
                        }}
                      >
                        {cloneAnchor ? "Velja annan upptökustað" : "Velja upptökustað"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={`ac-btn ${pickingRefSource ? "" : "ghost"}`}
                        onClick={() => {
                          setPickingRefSource(true);
                          setPickingSource(false);
                        }}
                        disabled={!refReady}
                      >
                        {cloneAnchor ? "Velja annan punkt í reference" : "Velja upptökustað í reference"}
                      </button>
                    )}
                    {cloneAnchor && (
                      <span className="ac-hint" style={{ marginLeft: 8 }}>
                        ({Math.round(cloneAnchor.x)}, {Math.round(cloneAnchor.y)}) {cloneSourceKind === "reference" ? "úr reference" : "úr sömu mynd"}
                      </span>
                    )}
                    {(pickingSource || pickingRefSource) && (
                      <span className="ac-hint" style={{ marginLeft: 8, color: "var(--m-ember, #c9982f)" }}>
                        Smelltu þar sem þú vilt afrita FRÁ{pickingRefSource ? " (í reference-mynd)" : ""}.
                      </span>
                    )}
                  </div>
                  {cloneSourceKind === "reference" && (
                    <div className="ac-panel" style={{ marginTop: 8, padding: 10, background: "rgba(255,255,255,0.03)", borderRadius: 6 }}>
                      <div className="ac-row" style={{ gap: 8, alignItems: "center", marginBottom: 6 }}>
                        <strong style={{ fontSize: 13 }}>Reference-mynd</strong>
                        <button
                          type="button"
                          className="ac-btn ghost"
                          onClick={() => refInputRef.current?.click()}
                          style={{ padding: "4px 10px", fontSize: 12 }}
                        >
                          {refReady ? "Önnur reference" : "Hlaða upp"}
                        </button>
                        {refName && (
                          <span className="ac-hint" style={{ fontSize: 11, opacity: 0.7 }}>{refName}</span>
                        )}
                        <input
                          ref={refInputRef}
                          type="file"
                          accept={PHOTO_ACCEPT}
                          hidden
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void addRefFile(file);
                            e.target.value = "";
                          }}
                        />
                      </div>
                      {refReady && (
                        <>
                          <p className="ac-hint" style={{ fontSize: 12, margin: "4px 0" }}>
                            Smelltu í reference-mynd fyrir neðan til að velja upptökustað, dragðu svo yfir aðalmynd til að stimpla.
                          </p>
                          <div style={{ overflow: "auto", maxHeight: 360, border: "1px solid var(--m-border, #333)", borderRadius: 4, position: "relative", display: "inline-block" }}>
                            <canvas
                              ref={refViewRef}
                              style={{
                                display: "block",
                                cursor: pickingRefSource ? "crosshair" : "default",
                                maxWidth: "100%",
                              }}
                              onPointerDown={(e) => {
                                if (!pickingRefSource) return;
                                const canvas = refViewRef.current;
                                if (!canvas) return;
                                const rect = canvas.getBoundingClientRect();
                                const sx = canvas.width / rect.width;
                                const sy = canvas.height / rect.height;
                                const x = (e.clientX - rect.left) * sx;
                                const y = (e.clientY - rect.top) * sy;
                                cloneAnchorRef.current = { x, y };
                                setCloneAnchor({ x, y });
                                setPickingRefSource(false);
                              }}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </>
              )}

              <div className="ac-row" style={{ alignItems: "center", gap: 8, marginTop: 4 }}>
                <button
                  type="button"
                  className="ac-btn ghost"
                  onClick={() => zoomTo(zoom / 1.25)}
                  disabled={zoom <= MIN_ZOOM}
                  title="Minnka"
                  aria-label="Minnka zoom"
                >
                  −
                </button>
                <input
                  type="range"
                  min={MIN_ZOOM}
                  max={MAX_ZOOM}
                  step={0.05}
                  value={zoom}
                  onChange={(e) => zoomTo(Number(e.target.value))}
                  style={{ width: 160 }}
                  aria-label="Zoom"
                />
                <button
                  type="button"
                  className="ac-btn ghost"
                  onClick={() => zoomTo(zoom * 1.25)}
                  disabled={zoom >= MAX_ZOOM}
                  title="Stækka"
                  aria-label="Stækka zoom"
                >
                  +
                </button>
                <span className="ac-hint" style={{ minWidth: 48, textAlign: "center" }}>
                  {Math.round(zoom * 100)}%
                </span>
                <button type="button" className="ac-btn ghost" onClick={() => zoomTo(1)} title="Öll myndin sést">
                  Passa
                </button>
                <button type="button" className="ac-btn ghost" onClick={() => zoomTo(3)} title="3× fyrir fíngerða vinnu">
                  3×
                </button>
                <button type="button" className="ac-btn ghost" onClick={() => zoomTo(6)} title="6× fyrir tennur/augu">
                  6×
                </button>
                <span className="ac-hint" style={{ opacity: 0.7, fontSize: 12 }}>
                  Sími: klíptu með tveimur fingrum og dragðu með tveimur til að færa. Tölva: ctrl+skrun.
                </span>
              </div>

              <div
                className="ac-adjust-stage"
                ref={stageRef}
                // Ekki flex-miðjun: stækkuð mynd flæðir þá út til vinstri þar sem
                // ekki er hægt að skruna. Blokk + margin:auto miðjar þegar hún er minni.
                style={{ overflow: "auto", maxHeight: "70vh", position: "relative", display: "block" }}
              >
                <canvas
                  ref={viewRef}
                  className="ac-adjust-canvas"
                  style={{
                    width: displayWidth || undefined,
                    height: displayHeight || undefined,
                    maxWidth: "none",
                    maxHeight: "none",
                    objectFit: "fill",
                    display: "block",
                    margin: "0 auto",
                  }}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                  onPointerLeave={onPointerLeave}
                />
                {cursor && (
                  <div
                    className="ac-brush-cursor"
                    style={{ left: cursor.x, top: cursor.y, width: cursor.size, height: cursor.size }}
                  />
                )}
                {tool === "clone" && cloneAnchor && viewRef.current && shown && (() => {
                  // Innihaldshnit í skrunandi sviðinu — óháð því hvert er skrunað.
                  const canvas = viewRef.current;
                  const scale = displayWidth / shown.width;
                  return (
                    <div
                      className="ac-clone-anchor"
                      style={{
                        left: canvas.offsetLeft + cloneAnchor.x * scale,
                        top: canvas.offsetTop + cloneAnchor.y * scale,
                      }}
                      aria-hidden="true"
                    />
                  );
                })()}
              </div>

              <div className="ac-settings">
                <label className="ac-range">
                  Burstastærð {radius}px
                  <input
                    type="range"
                    min={10}
                    max={160}
                    value={radius}
                    onChange={(e) => setRadius(Number(e.target.value))}
                  />
                </label>
                <label className="ac-range">
                  Styrkur {strength.toFixed(2)}
                  <input
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.01}
                    value={strength}
                    onChange={(e) => setStrength(Number(e.target.value))}
                  />
                </label>
              </div>

              <div className="ac-row" style={{ gap: 6, flexWrap: "wrap" }}>
                <span className="ac-hint" style={{ opacity: 0.7, marginRight: 4 }}>Allri myndinni:</span>
                <button
                  type="button"
                  className="ac-btn ghost"
                  onClick={() => applyGlobal((w) => adjustBrightnessGlobal(w, 10))}
                  title="Hækka birtu allrar myndarinnar um 10"
                >
                  Birta +
                </button>
                <button
                  type="button"
                  className="ac-btn ghost"
                  onClick={() => applyGlobal((w) => adjustBrightnessGlobal(w, -10))}
                  title="Lækka birtu allrar myndarinnar um 10"
                >
                  Birta −
                </button>
                <button
                  type="button"
                  className="ac-btn ghost"
                  onClick={() => applyGlobal((w) => adjustContrastGlobal(w, 0.15))}
                  title="Auka kontrast allrar myndarinnar um 15%"
                >
                  Kontrast +
                </button>
                <button
                  type="button"
                  className="ac-btn ghost"
                  onClick={() => applyGlobal((w) => adjustContrastGlobal(w, -0.15))}
                  title="Minnka kontrast allrar myndarinnar um 15%"
                >
                  Kontrast −
                </button>
                <button
                  type="button"
                  className="ac-btn ghost"
                  onClick={() => applyGlobal((w) => sharpenGlobal(w, 0.5))}
                  title="Skerpa allrar myndarinnar (unsharp mask)"
                >
                  Skerpa +
                </button>
              </div>

              <div className="ac-row" style={{ gap: 6, flexWrap: "wrap" }}>
                <span className="ac-hint" style={{ opacity: 0.7, marginRight: 4 }}>
                  Líkami{bodyBusy ? " — finn líkamann…" : ":"}
                </span>
                <button
                  type="button"
                  className="ac-btn ghost"
                  disabled={bodyBusy}
                  onClick={() => void applyBodyTune({ legs: 0.5 }, (w) => stretchHeight(w, 1.05))}
                  title="Lengir fótleggina — persónan virðist hærri (teygir alla myndina ef hnén sjást ekki)"
                >
                  Hærri
                </button>
                <button
                  type="button"
                  className="ac-btn ghost"
                  onClick={() => applyGlobal((w) => stretchHeight(w, 0.95))}
                  title="Þjappar myndinni ~5% lóðrétt — persónan virðist lægri"
                >
                  Lægri
                </button>
                <button
                  type="button"
                  className="ac-btn ghost"
                  disabled={bodyBusy}
                  onClick={() => void applyBodyTune({ waist: -0.55 })}
                  title="Mjókkar mitti og maga þar sem þau eru á myndinni"
                >
                  Magi/mitti −
                </button>
                <button
                  type="button"
                  className="ac-btn ghost"
                  disabled={bodyBusy}
                  onClick={() => void applyBodyTune({ waist: 0.45 })}
                  title="Breikkar mitti og maga"
                >
                  Magi/mitti +
                </button>
                <button
                  type="button"
                  className="ac-btn ghost"
                  disabled={bodyBusy}
                  onClick={() => void applyBodyTune({ hips: -0.55 })}
                  title="Mjókkar mjaðmir"
                >
                  Mjaðmir −
                </button>
                <button
                  type="button"
                  className="ac-btn ghost"
                  disabled={bodyBusy}
                  onClick={() => void applyBodyTune({ hips: 0.45 })}
                  title="Breikkar mjaðmir"
                >
                  Mjaðmir +
                </button>
                <button
                  type="button"
                  className="ac-btn ghost"
                  disabled={bodyBusy}
                  onClick={() => void applyBodyTune({ bust: 0.5 })}
                  title="Fyllir bringu"
                >
                  Bringa +
                </button>
                <button
                  type="button"
                  className="ac-btn ghost"
                  disabled={bodyBusy}
                  onClick={() => void applyBodyTune({ slim: -0.7 })}
                  title="Grennir allan búkinn, frá öxlum niður á læri"
                >
                  Allur grennri
                </button>
                <button
                  type="button"
                  className="ac-btn ghost"
                  disabled={bodyBusy}
                  onClick={() => void applyBodyTune({ slim: 0.6 })}
                  title="Fyllir allan búkinn"
                >
                  Allur fyllri
                </button>
                <a className="ac-hint" href="/kjarni/artcraft/likami" style={{ marginLeft: 4 }}>
                  Fleiri stillingar með sleðum: Líkamsmótun →
                </a>
              </div>

              <div className="ac-row" style={{ gap: 6, flexWrap: "wrap" }}>
                <span className="ac-hint" style={{ opacity: 0.7, marginRight: 4 }}>Húðlitur:</span>
                <button
                  type="button"
                  className="ac-btn ghost"
                  onClick={() => applyGlobal((w) => shiftSkinTone(w, -8, 0.03, 0))}
                  title="Hlýrri húðlit — færist í átt að appelsínugulum"
                >
                  Hlýrra
                </button>
                <button
                  type="button"
                  className="ac-btn ghost"
                  onClick={() => applyGlobal((w) => shiftSkinTone(w, 8, 0, 0))}
                  title="Kaldari húðlit — færist í átt að bleikum"
                >
                  Kaldara
                </button>
                <button
                  type="button"
                  className="ac-btn ghost"
                  onClick={() => applyGlobal((w) => shiftSkinTone(w, 0, 0.1, 0))}
                  title="Mettaðri húðlit (meira líf)"
                >
                  Mettaðra
                </button>
                <button
                  type="button"
                  className="ac-btn ghost"
                  onClick={() => applyGlobal((w) => shiftSkinTone(w, 0, -0.1, 0))}
                  title="Fölari húðlit (minna rautt)"
                >
                  Fölari
                </button>
                <button
                  type="button"
                  className="ac-btn ghost"
                  onClick={() => applyGlobal((w) => shiftSkinTone(w, 0, 0, 0.04))}
                  title="Bjartari húð"
                >
                  Bjartari
                </button>
                <button
                  type="button"
                  className="ac-btn ghost"
                  onClick={() => applyGlobal((w) => shiftSkinTone(w, 0, 0, -0.04))}
                  title="Dekkri húð"
                >
                  Dekkri
                </button>
                <button
                  type="button"
                  className="ac-btn ghost"
                  onClick={() => applyGlobal((w) => equalizeSkinTone(w, 0.5))}
                  title="Jafna húðlit — minnkar roða, mislýst svæði, misliti í andliti og á líkama"
                >
                  Jafna húð
                </button>
              </div>

              <div className="ac-row">
                <button type="button" className="ac-btn ghost" onClick={undo} disabled={!canUndo}>
                  Afturkalla
                </button>
                <button type="button" className="ac-btn ghost" onClick={resetToOriginal}>
                  Núllstilla
                </button>
                <button type="button" className="ac-btn ghost" onClick={() => inputRef.current?.click()}>
                  Ný mynd
                </button>
                <button type="button" className="ac-btn" onClick={() => void download()}>
                  Sækja mynd
                </button>
                <MotaSendTo
                  getBlob={getExportBlob}
                  name={`${sourceName.replace(/\.[^.]+$/, "") || "mynd"}-mota.jpg`}
                />
              </div>
            </section>
          )}
        </div>
      </div>
    </StationChrome>
  );
}
