"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { StationChrome } from "../../StationChrome";
import { artcraftHubHref, artcraftToolsHref } from "../apps";
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

const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_DIMENSION = 1200;
const MAX_UNDO = 20;

const TOOLS: Array<{ id: LiquifyMode; label: string; hint: string }> = [
  { id: "shrink", label: "Minnka", hint: "Dregur inn — mjókkar" },
  { id: "expand", label: "Stækka", hint: "Þenur út — gerir fyllra" },
  { id: "drag", label: "Færa", hint: "Færir útlínu með bustanum" },
];

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
  const originalRef = useRef<Raster | null>(null);
  const workingRef = useRef<Raster | null>(null);
  const undoRef = useRef<Raster[]>([]);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const drawingRef = useRef(false);
  const toolRef = useRef<LiquifyMode>("shrink");
  const radiusRef = useRef(44);
  const strengthRef = useRef(0.55);

  const [drag, setDrag] = useState(false);
  const [sourceName, setSourceName] = useState("");
  const [ready, setReady] = useState(false);
  const [tool, setTool] = useState<LiquifyMode>("shrink");
  const [radius, setRadius] = useState(44);
  const [strength, setStrength] = useState(0.55);
  const [canUndo, setCanUndo] = useState(false);
  const [error, setError] = useState("");

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
    for (const p of pts) {
      const moveX = prev ? x - prev.x : 0;
      const moveY = prev ? y - prev.y : 0;
      liquifyInPlace(working, p.x, p.y, radiusRef.current, strengthRef.current, toolRef.current, moveX, moveY);
    }
    paint();
  }

  function onPointerDown(e: PointerEvent<HTMLCanvasElement>) {
    if (!workingRef.current) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    pushUndo();
    const p = canvasPoint(e);
    lastRef.current = p;
    dab(p.x, p.y, null);
  }

  function onPointerMove(e: PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const p = canvasPoint(e);
    dab(p.x, p.y, lastRef.current);
    lastRef.current = p;
  }

  function onPointerUp() {
    drawingRef.current = false;
    lastRef.current = null;
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
            Mjókka, þenja eða draga líkamslínur með bursta — stilltu stærð og styrk og strjúktu
            yfir myndina. Allt gerist í vafranum, engin mynd fer neitt.
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
              <div className="ac-row ac-tools">
                {TOOLS.map((item) => (
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
                Strjúktu yfir mynd með bustanum — {TOOLS.find((t) => t.id === tool)?.hint.toLowerCase()}.
              </p>

              <div className="ac-adjust-stage">
                <canvas
                  ref={viewRef}
                  className="ac-adjust-canvas"
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                />
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
              </div>
            </section>
          )}
        </div>
      </div>
    </StationChrome>
  );
}
