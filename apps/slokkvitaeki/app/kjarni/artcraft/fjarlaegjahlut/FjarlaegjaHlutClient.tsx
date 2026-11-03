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
import { cloneRaster, createRaster, fitSize, strokePoints, type Raster } from "../studio/adjust";
import { compositeMaskOverlay, maskCoverage, paintCircle } from "../skyjastudio/maskPaint";
import { eraseObject } from "./eraser";

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

function rasterToDataUrl(raster: Raster, mime: string, quality?: number): string {
  const canvas = document.createElement("canvas");
  drawRaster(canvas, raster);
  return canvas.toDataURL(mime, quality);
}

function downloadBlob(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
}

export default function FjarlaegjaHlutClient() {
  const inputRef = useRef<HTMLInputElement>(null);
  const viewRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<Raster | null>(null);
  const maskRef = useRef<Raster | null>(null);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const drawingRef = useRef(false);
  const brushSizeRef = useRef(40);

  const [drag, setDrag] = useState(false);
  const [hasImage, setHasImage] = useState(false);
  const [sourceName, setSourceName] = useState("");
  const [brushSize, setBrushSize] = useState(40);
  const [cursor, setCursor] = useState<{ x: number; y: number; size: number } | null>(null);
  const [maskPainted, setMaskPainted] = useState(false);
  const [resultUrl, setResultUrl] = useState("");
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  brushSizeRef.current = brushSize;

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

  // The <canvas> only mounts once hasImage is true — same remount gotcha as
  // Skýjastúdíó's inpaint brush, so this runs the first paint after mount.
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
    setHasImage(false);
    setMaskPainted(false);
    setResultUrl("");
    setResultBlob(null);
    setError("");
  }

  async function run() {
    const source = sourceRef.current;
    const mask = maskRef.current;
    if (!source || !mask) return;
    if (!maskPainted) {
      setError("Málaðu fyrst yfir hlutinn sem á að fjarlægja.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const imageDataUrl = rasterToDataUrl(cloneRaster(source), "image/jpeg", 0.92);
      const maskDataUrl = rasterToDataUrl(mask, "image/png");
      const blob = await eraseObject(imageDataUrl, maskDataUrl);
      setResultBlob(blob);
      setResultUrl(URL.createObjectURL(blob));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fjarlægja hlut mistókst.");
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
            {" · Fjarlægja hlut"}
          </p>
          <h1>Fjarlægja hlut</h1>
          <p className="ac-lead">
            Málaðu yfir það sem á að hverfa — fólk í bakgrunni, kapal, skilti, vatnsmerki. AI fyllir
            svæðið út frá því sem er í kring.
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
                Málaðu með bursta yfir svæðið sem á að hverfa — rauð slikja sýnir hvað er valið.
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
                  max={160}
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

              {error && <p className="ac-error">{error}</p>}
              <button type="button" className="ac-btn" onClick={() => void run()} disabled={busy || !maskPainted}>
                {busy ? "Fjarlægi…" : "Fjarlægja"}
              </button>
              <p className="ac-hint">
                bria/eraser á Replicate — ~$0.02–0.04/mynd, 5–15 sek. Þjálfað eingöngu á
                leyfisskyldum gögnum. Þarf <code>REPLICATE_API_TOKEN</code> stillt sem
                umhverfisbreytu á þjóninum.
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
                        downloadBlob(resultUrl, `${sourceName.replace(/\.[^.]+$/, "")}-hreinsad.png`)
                      }
                    >
                      Sækja mynd
                    </button>
                    {resultBlob && (
                      <SendTo
                        blob={resultBlob}
                        mediaType="image"
                        sourceTool="fjarlaegjahlut"
                        sourceToolName="Fjarlægja hlut"
                        name={`${sourceName.replace(/\.[^.]+$/, "")}-hreinsad.png`}
                      />
                    )}
                  </div>
                </article>
              </div>
              <VerkhringirHint tool="fjarlaegjahlut" />
            </section>
          )}
        </div>
      </div>
    </StationChrome>
  );
}
