"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { StationChrome } from "../../StationChrome";
import { artcraftHubHref, artcraftToolsHref } from "../apps";
import SendTo from "../SendTo";
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
import {
  adjustBrightnessGlobal,
  adjustContrastGlobal,
  applyRetouch,
  sharpenGlobal,
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
  const cloneAnchorRef = useRef<{ x: number; y: number } | null>(null);
  const cloneOffsetRef = useRef<{ dx: number; dy: number } | null>(null);
  const strokeStartDstRef = useRef<{ x: number; y: number } | null>(null);
  const [pickingSource, setPickingSource] = useState(false);
  const [cloneAnchor, setCloneAnchor] = useState<{ x: number; y: number } | null>(null);

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
  // Zoom: default 1 = fit. 0.25-4 range. Notandi getur zoomad með +/- tokkum,
  // ctrl+wheel, eða fit-takkanum. Canvas style width/height skala m.v. zoom —
  // browser gerir resten.
  const [zoom, setZoom] = useState(1);

  toolRef.current = tool;
  radiusRef.current = radius;
  strengthRef.current = strength;

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
      paint();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gat ekki opnað myndina.");
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
      for (const p of pts) {
        applyRetouch(working, p.x, p.y, radiusRef.current, strengthRef.current, currentTool, {
          srcX: p.x - offset.dx,
          srcY: p.y - offset.dy,
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

  function onPointerDown(e: PointerEvent<HTMLCanvasElement>) {
    if (!workingRef.current) return;
    e.preventDefault();
    const p = canvasPoint(e);
    // Ef user valdi að taka clone-source, þá fer fyrsta smell í að setja
    // anchor-inn — ekki strik.
    if (pickingSource) {
      cloneAnchorRef.current = { x: p.x, y: p.y };
      setCloneAnchor({ x: p.x, y: p.y });
      setPickingSource(false);
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
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
    setCursor({
      x: e.clientX - stageRect.left,
      y: e.clientY - stageRect.top,
      size: radiusRef.current * 2 * scale,
    });
  }

  function onPointerMove(e: PointerEvent<HTMLCanvasElement>) {
    updateCursor(e);
    if (!drawingRef.current) return;
    const p = canvasPoint(e);
    dab(p.x, p.y, lastRef.current);
    lastRef.current = p;
  }

  function onPointerUp() {
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
    paint();
  }

  function resetToOriginal() {
    const original = originalRef.current;
    if (!original) return;
    workingRef.current = cloneRaster(original);
    undoRef.current = [];
    setCanUndo(false);
    paint();
  }

  async function download() {
    const working = workingRef.current;
    if (!working) return;
    const blob = await rasterToBlob(working);
    downloadBlob(URL.createObjectURL(blob), `${sourceName.replace(/\.[^.]+$/, "") || "mynd"}-mota.jpg`);
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
                <div className="ac-row">
                  <button
                    type="button"
                    className={`ac-btn ${pickingSource ? "" : "ghost"}`}
                    onClick={() => setPickingSource(true)}
                  >
                    {cloneAnchor ? "Velja annan upptökustað" : "Velja upptökustað"}
                  </button>
                  {cloneAnchor && (
                    <span className="ac-hint" style={{ marginLeft: 8 }}>
                      Upptökustaður: ({Math.round(cloneAnchor.x)}, {Math.round(cloneAnchor.y)})
                    </span>
                  )}
                  {pickingSource && (
                    <span className="ac-hint" style={{ marginLeft: 8, color: "var(--m-ember, #c9982f)" }}>
                      Smelltu þar sem þú vilt afrita FRÁ.
                    </span>
                  )}
                </div>
              )}

              <div className="ac-row" style={{ alignItems: "center", gap: 8, marginTop: 4 }}>
                <button
                  type="button"
                  className="ac-btn ghost"
                  onClick={() => setZoom((z) => Math.max(0.25, Math.round((z - 0.25) * 100) / 100))}
                  disabled={zoom <= 0.25}
                  title="Minnka zoom"
                >
                  −
                </button>
                <input
                  type="range"
                  min={0.25}
                  max={4}
                  step={0.05}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  style={{ width: 180 }}
                  aria-label="Zoom slider"
                />
                <button
                  type="button"
                  className="ac-btn ghost"
                  onClick={() => setZoom((z) => Math.min(4, Math.round((z + 0.25) * 100) / 100))}
                  disabled={zoom >= 4}
                  title="Stækka zoom"
                >
                  +
                </button>
                <span className="ac-hint" style={{ minWidth: 48, textAlign: "center" }}>
                  {Math.round(zoom * 100)}%
                </span>
                <button type="button" className="ac-btn ghost" onClick={() => setZoom(1)} title="Zoom á 100%">
                  1:1
                </button>
                <span className="ac-hint" style={{ opacity: 0.6, fontSize: 11 }}>
                  Tip: ctrl+scroll til að zoom-a, venjulegt scroll til að panna
                </span>
              </div>

              <div
                className="ac-adjust-stage"
                ref={stageRef}
                style={{ overflow: "auto", maxHeight: "70vh", position: "relative" }}
                onWheel={(e) => {
                  if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    const delta = e.deltaY < 0 ? 0.1 : -0.1;
                    setZoom((z) => Math.max(0.25, Math.min(4, Math.round((z + delta) * 100) / 100)));
                  }
                }}
              >
                <canvas
                  ref={viewRef}
                  className="ac-adjust-canvas"
                  style={{
                    width: workingRef.current ? `${workingRef.current.width * zoom}px` : undefined,
                    height: workingRef.current ? `${workingRef.current.height * zoom}px` : undefined,
                    display: "block",
                    maxWidth: "none",
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
                {tool === "clone" && cloneAnchor && viewRef.current && stageRef.current && (() => {
                  const canvasRect = viewRef.current.getBoundingClientRect();
                  const stageRect = stageRef.current.getBoundingClientRect();
                  const scale = canvasRect.width / viewRef.current.width;
                  return (
                    <div
                      className="ac-clone-anchor"
                      style={{
                        left: canvasRect.left - stageRect.left + cloneAnchor.x * scale,
                        top: canvasRect.top - stageRect.top + cloneAnchor.y * scale,
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
                  onClick={() => {
                    const w = workingRef.current;
                    if (!w) return;
                    pushUndo();
                    adjustBrightnessGlobal(w, 10);
                    paint();
                  }}
                  title="Hækka birtu allrar myndarinnar um 10"
                >
                  Birta +
                </button>
                <button
                  type="button"
                  className="ac-btn ghost"
                  onClick={() => {
                    const w = workingRef.current;
                    if (!w) return;
                    pushUndo();
                    adjustBrightnessGlobal(w, -10);
                    paint();
                  }}
                  title="Lækka birtu allrar myndarinnar um 10"
                >
                  Birta −
                </button>
                <button
                  type="button"
                  className="ac-btn ghost"
                  onClick={() => {
                    const w = workingRef.current;
                    if (!w) return;
                    pushUndo();
                    adjustContrastGlobal(w, 0.15);
                    paint();
                  }}
                  title="Auka kontrast allrar myndarinnar um 15%"
                >
                  Kontrast +
                </button>
                <button
                  type="button"
                  className="ac-btn ghost"
                  onClick={() => {
                    const w = workingRef.current;
                    if (!w) return;
                    pushUndo();
                    adjustContrastGlobal(w, -0.15);
                    paint();
                  }}
                  title="Minnka kontrast allrar myndarinnar um 15%"
                >
                  Kontrast −
                </button>
                <button
                  type="button"
                  className="ac-btn ghost"
                  onClick={() => {
                    const w = workingRef.current;
                    if (!w) return;
                    pushUndo();
                    sharpenGlobal(w, 0.5);
                    paint();
                  }}
                  title="Skerpa allrar myndarinnar (unsharp mask)"
                >
                  Skerpa +
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
