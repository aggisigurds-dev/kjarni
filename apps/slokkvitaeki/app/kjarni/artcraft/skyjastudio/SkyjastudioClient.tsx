"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { StationChrome } from "../../StationChrome";
import { artcraftHubHref, artcraftToolsHref } from "../apps";
import "../artcraft.css";
import {
  DEFAULT_SDXL_SETTINGS,
  generateSdxlImage,
  SDXL_SCHEDULERS,
  SDXL_SETTINGS_KEY,
  normalizeSdxlSettings,
  readStoredSdxlSettings,
  type SdxlSettings,
} from "./sdxl";
import { cloneRaster, createRaster, fitSize, strokePoints, type Raster } from "../studio/adjust";
import { compositeMaskOverlay, maskCoverage, paintCircle } from "./maskPaint";
import ImageZoom from "../ImageZoom";

const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_SOURCE_DIMENSION = 1024;

type Mode = "txt2img" | "inpaint";

const MODES: Array<{ id: Mode; label: string; hint: string }> = [
  { id: "txt2img", label: "Texti → mynd", hint: "Lýstu mynd frá grunni." },
  {
    id: "inpaint",
    label: "Mála yfir (inpaint)",
    hint: "Hladdu upp mynd, málaðu yfir svæðið sem á að breyta, lýstu því sem á að koma í staðinn.",
  },
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

export default function SkyjastudioClient() {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<SdxlSettings>(DEFAULT_SDXL_SETTINGS);
  const [mode, setMode] = useState<Mode>("txt2img");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<string[]>([]);
  const resultUrlsRef = useRef<string[]>([]);

  // Inpaint brush state.
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
  const [brushSize, setBrushSize] = useState(40);
  const [cursor, setCursor] = useState<{ x: number; y: number; size: number } | null>(null);
  const [maskPainted, setMaskPainted] = useState(false);

  brushSizeRef.current = brushSize;

  useEffect(() => {
    setSettings(readStoredSdxlSettings());
    setReady(true);
  }, []);

  useEffect(() => {
    return () => {
      for (const url of resultUrlsRef.current) URL.revokeObjectURL(url);
    };
  }, []);

  function updateSettings(next: Partial<SdxlSettings>) {
    setSettings((s) => {
      const merged = normalizeSdxlSettings({ ...s, ...next });
      window.localStorage.setItem(SDXL_SETTINGS_KEY, JSON.stringify(merged));
      return merged;
    });
  }

  function paintCanvas() {
    const source = sourceRef.current;
    const mask = maskRef.current;
    const canvas = viewRef.current;
    if (!source || !mask || !canvas) return;
    drawRaster(canvas, compositeMaskOverlay(source, mask));
  }

  async function addFile(file: File) {
    if (!isPhotoFile(file)) return;
    setError("");
    try {
      const img = await loadImage(URL.createObjectURL(file));
      const raster = rasterFromImage(img);
      sourceRef.current = raster;
      maskRef.current = createRaster(raster.width, raster.height, 0);
      setMaskPainted(false);
      setHasImage(true);
      setResults([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gat ekki opnað myndina.");
    }
  }

  // The <canvas> only mounts while hasImage && mode === "inpaint" — it
  // remounts blank when switching back from txt2img mode without hasImage
  // itself changing, so `mode` has to be a dependency too, not just
  // hasImage, or the remounted canvas never gets its first repaint.
  useEffect(() => {
    if (hasImage && mode === "inpaint") paintCanvas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasImage, mode]);

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

  function onPointerLeave() {
    setCursor(null);
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
  }

  async function run() {
    if (!settings.prompt.trim()) {
      setError("Skrifaðu prompt fyrst.");
      return;
    }
    if (mode === "inpaint") {
      const source = sourceRef.current;
      const mask = maskRef.current;
      if (!source || !mask) {
        setError("Hladdu upp mynd fyrst.");
        return;
      }
      if (maskCoverage(mask) === 0) {
        setError("Málaðu yfir svæðið sem á að breyta fyrst.");
        return;
      }
    }
    setBusy(true);
    setError("");
    try {
      let blobs: Blob[];
      if (mode === "inpaint" && sourceRef.current && maskRef.current) {
        const sizedSettings = { ...settings, width: sourceRef.current.width, height: sourceRef.current.height };
        blobs = await generateSdxlImage(sizedSettings, {
          imageDataUrl: rasterToDataUrl(sourceRef.current, "image/jpeg", 0.92),
          maskDataUrl: rasterToDataUrl(maskRef.current, "image/png"),
        });
      } else {
        blobs = await generateSdxlImage(settings);
      }
      for (const url of resultUrlsRef.current) URL.revokeObjectURL(url);
      const urls = blobs.map((b) => URL.createObjectURL(b));
      resultUrlsRef.current = urls;
      setResults(urls);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Skýjastúdíó-myndgerð mistókst.");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <StationChrome tool="artcraft">
        <div className="ac-hub">
          <p className="ac-lead">Hleð Skýjastúdíó…</p>
        </div>
      </StationChrome>
    );
  }

  return (
    <StationChrome tool="artcraft">
      <div className="ac-hub">
        <div className="ac-hub-in ac-studio">
          <p className="ac-kicker">
            <a href={artcraftHubHref()}>ArtCraft</a>
            {" · "}
            <a href={artcraftToolsHref()}>Tól</a>
            {" · Skýjastúdíó"}
          </p>
          <h1>Skýjastúdíó</h1>
          <p className="ac-lead">
            Texti → mynd (og mynd → mynd með bursta) með Stability AI's eigin SDXL-líkani
            (Replicate) — engin uppsetning, byrjar strax, en kostar smá upphæð per mynd og myndin
            fer út af vélinni. Vilt þú frekar ókeypis og staðbundið: sjá Einkastúdíó eða ComfyUI.
          </p>

          <section className="ac-panel">
            <h2>Aðferð</h2>
            <div className="ac-modes" role="radiogroup">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={mode === m.id}
                  className={mode === m.id ? "on" : undefined}
                  onClick={() => {
                    setMode(m.id);
                    setError("");
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p className="ac-hint">{MODES.find((m) => m.id === mode)?.hint}</p>
          </section>

          {mode === "inpaint" && !hasImage && (
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

          {mode === "inpaint" && (
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
          )}

          {mode === "inpaint" && hasImage && (
            <section className="ac-panel ac-adjust">
              <p className="ac-hint">
                Málaðu með bursta yfir svæðið sem á að breyta — rauð slikja sýnir hvað er valið.
              </p>
              <div className="ac-adjust-stage" ref={stageRef}>
                <canvas
                  ref={viewRef}
                  className="ac-adjust-canvas"
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
            </section>
          )}

          {(mode === "txt2img" || hasImage) && (
            <section className="ac-panel">
              <h2>Prompt</h2>
              <label>
                {mode === "inpaint" ? "Hvað á að koma í staðinn á máluðu svæði" : "Lýsing"}
                <textarea
                  value={settings.prompt}
                  onChange={(e) => updateSettings({ prompt: e.target.value })}
                  rows={3}
                />
              </label>
              <label>
                Neikvæð lýsing (má sleppa)
                <textarea
                  value={settings.negativePrompt}
                  onChange={(e) => updateSettings({ negativePrompt: e.target.value })}
                  rows={3}
                />
              </label>

              <div className="ac-settings">
                {mode === "txt2img" && (
                  <>
                    <label>
                      Breidd ({settings.width}px)
                      <input
                        type="range"
                        min={512}
                        max={1536}
                        step={8}
                        value={settings.width}
                        onChange={(e) => updateSettings({ width: Number(e.target.value) })}
                      />
                    </label>
                    <label>
                      Hæð ({settings.height}px)
                      <input
                        type="range"
                        min={512}
                        max={1536}
                        step={8}
                        value={settings.height}
                        onChange={(e) => updateSettings({ height: Number(e.target.value) })}
                      />
                    </label>
                  </>
                )}
                {mode === "inpaint" && (
                  <label>
                    Styrkur breytinga ({settings.promptStrength.toFixed(2)})
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={settings.promptStrength}
                      onChange={(e) => updateSettings({ promptStrength: Number(e.target.value) })}
                    />
                  </label>
                )}
                <label>
                  Skref ({settings.steps})
                  <input
                    type="range"
                    min={1}
                    max={100}
                    value={settings.steps}
                    onChange={(e) => updateSettings({ steps: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Guidance ({settings.guidanceScale.toFixed(1)})
                  <input
                    type="range"
                    min={1}
                    max={50}
                    step={0.5}
                    value={settings.guidanceScale}
                    onChange={(e) => updateSettings({ guidanceScale: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Scheduler
                  <select
                    value={settings.scheduler}
                    onChange={(e) => updateSettings({ scheduler: e.target.value as SdxlSettings["scheduler"] })}
                  >
                    {SDXL_SCHEDULERS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                {mode === "txt2img" && (
                  <label>
                    Fjöldi mynda ({settings.numOutputs})
                    <input
                      type="range"
                      min={1}
                      max={4}
                      value={settings.numOutputs}
                      onChange={(e) => updateSettings({ numOutputs: Number(e.target.value) })}
                    />
                  </label>
                )}
                <label>
                  Seed ({settings.seed === -1 ? "slembið" : settings.seed})
                  <input
                    type="number"
                    value={settings.seed}
                    onChange={(e) => updateSettings({ seed: Number(e.target.value) })}
                  />
                </label>
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={settings.disableSafetyChecker}
                  onChange={(e) => updateSettings({ disableSafetyChecker: e.target.checked })}
                />
                Slökkva á öryggissíu (disable_safety_checker)
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={settings.applyWatermark}
                  onChange={(e) => updateSettings({ applyWatermark: e.target.checked })}
                />
                Setja vatnsmerki á myndina (apply_watermark)
              </label>
              <p className="ac-hint">
                Bæði eru skjalfestar Replicate-breytur fyrir þetta líkan — öryggissían er sjálfgefið
                á, vatnsmerkið sjálfgefið á. Þú berð ábyrgð á notkuninni þegar slökkt er á síunni.
              </p>

              {error && <p className="ac-error">{error}</p>}
              <button type="button" className="ac-btn" onClick={() => void run()} disabled={busy}>
                {busy ? "Teikna…" : "Teikna mynd"}
              </button>
            </section>
          )}

          {results.length > 0 && (
            <section className="ac-panel">
              <h2>Útkoma</h2>
              <div className="ac-results">
                {results.map((url, i) => (
                  <figure key={url}>
                    <ImageZoom src={url} alt={`Skýjastúdíó útkoma ${i + 1}`} />
                    <figcaption>
                      <button
                        type="button"
                        className="ac-btn ghost"
                        onClick={() => downloadBlob(url, `skyjastudio-${i + 1}.png`)}
                      >
                        Sækja mynd
                      </button>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </StationChrome>
  );
}
