"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { StationChrome } from "../../StationChrome";
import { artcraftHubHref, artcraftToolsHref } from "../apps";
import ImageZoom from "../ImageZoom";
import SendTo from "../SendTo";
import StagingPicker from "../StagingPicker";
import VerkhringirHint from "../VerkhringirHint";
import { useStagedSource } from "../useStagedSource";
import "../artcraft.css";
import { createRaster, fitSize, strokePoints, type Raster } from "../studio/adjust";
import { compositeMaskOverlay, maskCoverage, paintCircle } from "../skyjastudio/maskPaint";
import { upscaleMaskToBlob } from "../maskUpscale";
import {
  DEFAULT_SKY_SETTINGS,
  SKY_PRESETS,
  generateSky,
  readStoredSkySettings,
  type SkySettings,
} from "./sky";

const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_SOURCE_DIMENSION = 1600;

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
  const size = fitSize(img.naturalWidth || img.width, img.naturalHeight || img.height, MAX_SOURCE_DIMENSION);
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

function downloadBlob(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
}

export default function HiminnClient() {
  const inputRef = useRef<HTMLInputElement>(null);
  const viewRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<Raster | null>(null);
  const maskRef = useRef<Raster | null>(null);
  const originalFileRef = useRef<File | null>(null);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const drawingRef = useRef(false);
  const brushSizeRef = useRef(60);

  const [drag, setDrag] = useState(false);
  const [hasImage, setHasImage] = useState(false);
  const [sourceName, setSourceName] = useState("");
  const [brushSize, setBrushSize] = useState(60);
  const [cursor, setCursor] = useState<{ x: number; y: number; size: number } | null>(null);
  const [maskPainted, setMaskPainted] = useState(false);
  const [resultUrl, setResultUrl] = useState("");
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState<SkySettings>(() =>
    typeof window === "undefined" ? DEFAULT_SKY_SETTINGS : readStoredSkySettings(),
  );

  brushSizeRef.current = brushSize;

  function updateSettings(patch: Partial<SkySettings>) {
    setSettings((cur) => {
      const next = { ...cur, ...patch };
      try {
        window.localStorage.setItem("kjarni_private_himinn_settings", JSON.stringify(next));
      } catch {
        // localStorage unavailable — ignore, setting just won't persist
      }
      return next;
    });
  }

  function paintCanvas() {
    const source = sourceRef.current;
    const mask = maskRef.current;
    const canvas = viewRef.current;
    if (!source || !mask || !canvas) return;
    drawRaster(canvas, compositeMaskOverlay(source, mask));
  }

  async function acceptFile(file: File) {
    if (!isPhotoFile(file)) return;
    setError("");
    try {
      const img = await loadImage(URL.createObjectURL(file));
      const raster = rasterFromImage(img);
      sourceRef.current = raster;
      maskRef.current = createRaster(raster.width, raster.height, 0);
      originalFileRef.current = file;
      setSourceName(file.name);
      setMaskPainted(false);
      setHasImage(true);
      setResultUrl("");
      setResultBlob(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gat ekki opnað myndina.");
    }
  }

  useStagedSource(async (blob, item) => {
    const file = new File([blob], item.name || `from-${item.sourceTool}.png`, {
      type: blob.type || "image/png",
    });
    await acceptFile(file);
  });

  useEffect(() => {
    if (hasImage) paintCanvas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasImage]);

  function canvasPoint(e: PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const canvas = viewRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  }

  function dab(x: number, y: number, prev: { x: number; y: number } | null) {
    const mask = maskRef.current;
    if (!mask) return;
    const pts = prev ? strokePoints(prev.x, prev.y, x, y, Math.max(2, brushSizeRef.current * 0.32)) : [{ x, y }];
    for (const p of pts) paintCircle(mask, p.x, p.y, brushSizeRef.current);
    paintCanvas();
    setMaskPainted(maskCoverage(mask) > 0);
  }

  function onPointerDown(e: PointerEvent<HTMLCanvasElement>) {
    if (!maskRef.current) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const p = canvasPoint(e);
    lastPointRef.current = p;
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
      size: brushSizeRef.current * 2 * scale,
    });
  }

  function onPointerMove(e: PointerEvent<HTMLCanvasElement>) {
    updateCursor(e);
    if (!drawingRef.current) return;
    const p = canvasPoint(e);
    dab(p.x, p.y, lastPointRef.current);
    lastPointRef.current = p;
  }

  function onPointerUp() {
    drawingRef.current = false;
    lastPointRef.current = null;
  }

  function clearMask() {
    const source = sourceRef.current;
    if (!source) return;
    maskRef.current = createRaster(source.width, source.height, 0);
    setMaskPainted(false);
    paintCanvas();
  }

  function newImage() {
    sourceRef.current = null;
    maskRef.current = null;
    originalFileRef.current = null;
    setHasImage(false);
    setMaskPainted(false);
    setResultUrl("");
    setResultBlob(null);
    setError("");
  }

  async function run() {
    const mask = maskRef.current;
    const originalFile = originalFileRef.current;
    if (!mask || !originalFile) return;
    if (!maskPainted) {
      setError("Málaðu fyrst yfir himininn.");
      return;
    }
    if (!settings.prompt.trim()) {
      setError("Lýstu himninum, eða veldu forstillingu.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      // The brush canvas is capped at MAX_SOURCE_DIMENSION for painting
      // performance, but the original file now uploads at full resolution
      // (see ../uploadToStorage.ts) — the mask has to be scaled back up to
      // match it before both go to Replicate.
      const img = await loadImage(URL.createObjectURL(originalFile));
      const maskBlob = await upscaleMaskToBlob(mask, img.naturalWidth || img.width, img.naturalHeight || img.height);
      const results = await generateSky(settings, { image: originalFile, mask: maskBlob });
      const blob = results[0];
      setResultBlob(blob);
      setResultUrl(URL.createObjectURL(blob));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Himinn mistókst.");
    } finally {
      setBusy(false);
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
            {" · Himinn"}
          </p>
          <h1>Himinn</h1>
          <p className="ac-lead">
            Málaðu yfir himininn, lýstu nýjum himni — AI setur hann inn og heldur restinni af
            myndinni óbreyttri.
          </p>

          {!hasImage && (
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
                if (file) void acceptFile(file);
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
                    const file = new File([blob], item.name || `from-${item.sourceTool}.png`, {
                      type: blob.type || "image/png",
                    });
                    await acceptFile(file);
                  }}
                />
              </div>
              <input
                ref={inputRef}
                type="file"
                accept={PHOTO_ACCEPT}
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void acceptFile(file);
                  e.target.value = "";
                }}
              />
            </section>
          )}

          {hasImage && (
            <section className="ac-panel ac-adjust">
              <p className="ac-hint">
                Málaðu með bursta yfir himininn — rauð slikja sýnir hvað er valið.
              </p>
              <div className="ac-adjust-stage" ref={stageRef}>
                <canvas
                  ref={viewRef}
                  className="ac-adjust-canvas"
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                  onPointerLeave={() => setCursor(null)}
                />
                {cursor && (
                  <div
                    className="ac-brush-cursor"
                    style={{ left: cursor.x, top: cursor.y, width: cursor.size, height: cursor.size }}
                  />
                )}
              </div>
              <label className="ac-range">
                Burstastærð {brushSize}px
                <input
                  type="range"
                  min={8}
                  max={220}
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                />
              </label>
              <div className="ac-row">
                <button type="button" className="ac-btn ghost" onClick={clearMask} disabled={!maskPainted}>
                  Hreinsa mál
                </button>
                <button type="button" className="ac-btn ghost" onClick={newImage}>
                  Ný mynd
                </button>
              </div>

              <h2 style={{ marginTop: 16 }}>Nýr himinn</h2>
              <div className="ac-samples">
                {SKY_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    className="ac-btn ghost"
                    disabled={busy}
                    onClick={() => updateSettings({ prompt: preset.prompt })}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <label style={{ display: "block", marginTop: 12 }}>
                Lýsing á himninum
                <textarea
                  value={settings.prompt}
                  onChange={(e) => updateSettings({ prompt: e.target.value })}
                  rows={2}
                  placeholder="t.d. dramatísk sólarlagsský"
                />
              </label>

              {error && <p className="ac-error">{error}</p>}
              <button type="button" className="ac-btn" onClick={() => void run()} disabled={busy || !maskPainted}>
                {busy ? "Breyti himni…" : "Breyta himni"}
              </button>
              <p className="ac-hint">
                bria/genfill á Replicate — ~$0.02–0.04/mynd, 10–20 sek. Þarf{" "}
                <code>REPLICATE_API_TOKEN</code> stillt sem umhverfisbreytu á þjóninum.
              </p>
            </section>
          )}

          {resultUrl && (
            <section className="ac-panel">
              <h2>Útkoma</h2>
              <div className="ac-cuts">
                <article className="ac-cut">
                  <div className="ac-cut-pair">
                    <figure className="ac-cut-out">
                      <ImageZoom src={resultUrl} alt={`Eftir: ${sourceName}`} />
                      <figcaption>Eftir</figcaption>
                    </figure>
                  </div>
                  <div className="ac-cut-actions">
                    <button
                      type="button"
                      className="ac-btn"
                      onClick={() =>
                        downloadBlob(resultUrl, `${sourceName.replace(/\.[^.]+$/, "")}-himinn.png`)
                      }
                    >
                      Sækja mynd
                    </button>
                    {resultBlob && (
                      <SendTo
                        blob={resultBlob}
                        mediaType="image"
                        sourceTool="himinn"
                        sourceToolName="Himinn"
                        name={`${sourceName.replace(/\.[^.]+$/, "")}-himinn.png`}
                      />
                    )}
                  </div>
                </article>
              </div>
              <VerkhringirHint tool="himinn" />
            </section>
          )}
        </div>
      </div>
    </StationChrome>
  );
}
