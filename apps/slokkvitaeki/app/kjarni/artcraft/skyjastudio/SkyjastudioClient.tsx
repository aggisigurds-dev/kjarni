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
import {
  DEFAULT_FLUX_FILL_SETTINGS,
  generateFluxFillImage,
  FLUX_FILL_SETTINGS_KEY,
  normalizeFluxFillSettings,
  readStoredFluxFillSettings,
  type FluxFillSettings,
} from "./fluxFill";
import {
  DEFAULT_JUGGERNAUT_SETTINGS,
  generateJuggernautImage,
  JUGGERNAUT_SCHEDULERS,
  JUGGERNAUT_SETTINGS_KEY,
  normalizeJuggernautSettings,
  readStoredJuggernautSettings,
  type JuggernautSettings,
} from "./juggernaut";
import { cloneRaster, createRaster, fitSize, strokePoints, type Raster } from "../studio/adjust";
import { compositeMaskOverlay, maskCoverage, paintCircle } from "./maskPaint";
import ImageZoom from "../ImageZoom";
import { clearResult, formatSavedTime, loadResult, saveResult } from "../savedResults";

const SAVED_RESULT_KEY = "skyjastudio";

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

type Txt2ImgModel = "sdxl" | "juggernaut";

const TXT2IMG_MODELS: Array<{ id: Txt2ImgModel; label: string; hint: string }> = [
  { id: "sdxl", label: "Stability SDXL", hint: "Opinber SDXL frá Stability AI — jafnvægt, hægt að slökkva á vatnsmerki." },
  {
    id: "juggernaut",
    label: "Juggernaut XL v7",
    hint: "RunDiffusion-fín-tjúnuð SDXL — sterk portrett og raunsæisleg áferð, minni „plastic“ áferð á fólki.",
  },
];
const TXT2IMG_MODEL_KEY = "kjarni_private_skyjastudio_txt2img_model";

function readStoredTxt2ImgModel(): Txt2ImgModel {
  if (typeof window === "undefined") return "sdxl";
  const raw = window.localStorage.getItem(TXT2IMG_MODEL_KEY);
  return raw === "juggernaut" ? "juggernaut" : "sdxl";
}

type InpaintModel = "sdxl" | "flux-fill" | "juggernaut";

const INPAINT_MODELS: Array<{ id: InpaintModel; label: string; hint: string }> = [
  { id: "sdxl", label: "Stability SDXL", hint: "Fleiri stillingar (scheduler, vatnsmerki o.fl.)." },
  {
    id: "flux-fill",
    label: "Flux Fill",
    hint: "Sérsmíðað fyrir nákvæmlega þetta — skilur prómt oft betur, t.d. að fjarlægja hlut sem hylur eitthvað.",
  },
  {
    id: "juggernaut",
    label: "Juggernaut XL v7",
    hint: "Fín-tjúnuð SDXL — gott í portrett-inpaint þar sem SDXL verður of „plastic“.",
  },
];
const INPAINT_MODEL_KEY = "kjarni_private_skyjastudio_inpaint_model";

function readStoredInpaintModel(): InpaintModel {
  if (typeof window === "undefined") return "sdxl";
  const raw = window.localStorage.getItem(INPAINT_MODEL_KEY);
  if (raw === "flux-fill") return "flux-fill";
  if (raw === "juggernaut") return "juggernaut";
  return "sdxl";
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
  const [fluxSettings, setFluxSettings] = useState<FluxFillSettings>(DEFAULT_FLUX_FILL_SETTINGS);
  const [juggernautSettings, setJuggernautSettings] = useState<JuggernautSettings>(DEFAULT_JUGGERNAUT_SETTINGS);
  const [mode, setMode] = useState<Mode>("txt2img");
  const [txt2imgModel, setTxt2ImgModel] = useState<Txt2ImgModel>("sdxl");
  const [inpaintModel, setInpaintModel] = useState<InpaintModel>("sdxl");
  const isFlux = mode === "inpaint" && inpaintModel === "flux-fill";
  const isJuggernaut = (mode === "txt2img" && txt2imgModel === "juggernaut") || (mode === "inpaint" && inpaintModel === "juggernaut");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<string[]>([]);
  const [savedMeta, setSavedMeta] = useState<{ timestamp: number; prompt?: string; mode?: string } | null>(null);
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
    setFluxSettings(readStoredFluxFillSettings());
    setJuggernautSettings(readStoredJuggernautSettings());
    setTxt2ImgModel(readStoredTxt2ImgModel());
    setInpaintModel(readStoredInpaintModel());
    setReady(true);
    void (async () => {
      const saved = await loadResult(SAVED_RESULT_KEY);
      if (saved) {
        for (const url of resultUrlsRef.current) URL.revokeObjectURL(url);
        const urls = saved.blobs.map((b) => URL.createObjectURL(b));
        resultUrlsRef.current = urls;
        setResults(urls);
        setSavedMeta({ timestamp: saved.timestamp, prompt: saved.prompt, mode: saved.mode });
      }
    })();
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

  function updateFluxSettings(next: Partial<FluxFillSettings>) {
    setFluxSettings((s) => {
      const merged = normalizeFluxFillSettings({ ...s, ...next });
      window.localStorage.setItem(FLUX_FILL_SETTINGS_KEY, JSON.stringify(merged));
      return merged;
    });
  }

  function updateJuggernautSettings(next: Partial<JuggernautSettings>) {
    setJuggernautSettings((s) => {
      const merged = normalizeJuggernautSettings({ ...s, ...next });
      window.localStorage.setItem(JUGGERNAUT_SETTINGS_KEY, JSON.stringify(merged));
      return merged;
    });
  }

  function selectTxt2ImgModel(next: Txt2ImgModel) {
    setTxt2ImgModel(next);
    window.localStorage.setItem(TXT2IMG_MODEL_KEY, next);
  }

  function selectInpaintModel(next: InpaintModel) {
    setInpaintModel(next);
    window.localStorage.setItem(INPAINT_MODEL_KEY, next);
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
    const prompt = isFlux ? fluxSettings.prompt : isJuggernaut ? juggernautSettings.prompt : settings.prompt;
    if (!prompt.trim()) {
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
        const inpaintExtra = {
          imageDataUrl: rasterToDataUrl(sourceRef.current, "image/jpeg", 0.92),
          maskDataUrl: rasterToDataUrl(maskRef.current, "image/png"),
        };
        if (isFlux) {
          blobs = await generateFluxFillImage(fluxSettings, inpaintExtra);
        } else if (isJuggernaut) {
          const sizedJugg = { ...juggernautSettings, width: sourceRef.current.width, height: sourceRef.current.height };
          blobs = await generateJuggernautImage(sizedJugg, inpaintExtra);
        } else {
          const sizedSettings = { ...settings, width: sourceRef.current.width, height: sourceRef.current.height };
          blobs = await generateSdxlImage(sizedSettings, inpaintExtra);
        }
      } else if (isJuggernaut) {
        blobs = await generateJuggernautImage(juggernautSettings);
      } else {
        blobs = await generateSdxlImage(settings);
      }
      for (const url of resultUrlsRef.current) URL.revokeObjectURL(url);
      const urls = blobs.map((b) => URL.createObjectURL(b));
      resultUrlsRef.current = urls;
      setResults(urls);
      const activePrompt = isFlux ? fluxSettings.prompt : isJuggernaut ? juggernautSettings.prompt : settings.prompt;
      const modeLabel = `${mode}/${isFlux ? "flux-fill" : isJuggernaut ? "juggernaut" : "sdxl"}`;
      const now = Date.now();
      setSavedMeta({ timestamp: now, prompt: activePrompt, mode: modeLabel });
      void saveResult({
        key: SAVED_RESULT_KEY,
        timestamp: now,
        mediaType: "image",
        blobs,
        prompt: activePrompt,
        mode: modeLabel,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Skýjastúdíó-myndgerð mistókst.");
    } finally {
      setBusy(false);
    }
  }

  async function clearSavedResults() {
    for (const url of resultUrlsRef.current) URL.revokeObjectURL(url);
    resultUrlsRef.current = [];
    setResults([]);
    setSavedMeta(null);
    await clearResult(SAVED_RESULT_KEY);
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

          {mode === "txt2img" && (
            <section className="ac-panel">
              <h2>Líkan</h2>
              <div className="ac-modes" role="radiogroup">
                {TXT2IMG_MODELS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={txt2imgModel === m.id}
                    className={txt2imgModel === m.id ? "on" : undefined}
                    onClick={() => selectTxt2ImgModel(m.id)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <p className="ac-hint">{TXT2IMG_MODELS.find((m) => m.id === txt2imgModel)?.hint}</p>
            </section>
          )}

          {mode === "inpaint" && (
            <section className="ac-panel">
              <h2>Líkan</h2>
              <div className="ac-modes" role="radiogroup">
                {INPAINT_MODELS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={inpaintModel === m.id}
                    className={inpaintModel === m.id ? "on" : undefined}
                    onClick={() => selectInpaintModel(m.id)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <p className="ac-hint">{INPAINT_MODELS.find((m) => m.id === inpaintModel)?.hint}</p>
            </section>
          )}

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
                  value={isFlux ? fluxSettings.prompt : isJuggernaut ? juggernautSettings.prompt : settings.prompt}
                  onChange={(e) =>
                    isFlux
                      ? updateFluxSettings({ prompt: e.target.value })
                      : isJuggernaut
                        ? updateJuggernautSettings({ prompt: e.target.value })
                        : updateSettings({ prompt: e.target.value })
                  }
                  rows={3}
                />
              </label>
              {!isFlux && (
                <label>
                  Neikvæð lýsing (má sleppa)
                  <textarea
                    value={isJuggernaut ? juggernautSettings.negativePrompt : settings.negativePrompt}
                    onChange={(e) =>
                      isJuggernaut
                        ? updateJuggernautSettings({ negativePrompt: e.target.value })
                        : updateSettings({ negativePrompt: e.target.value })
                    }
                    rows={3}
                  />
                </label>
              )}

              {isFlux ? (
                <div className="ac-settings">
                  <label>
                    Skref ({fluxSettings.steps})
                    <input
                      type="range"
                      min={1}
                      max={50}
                      value={fluxSettings.steps}
                      onChange={(e) => updateFluxSettings({ steps: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    Guidance ({fluxSettings.guidance})
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={fluxSettings.guidance}
                      onChange={(e) => updateFluxSettings({ guidance: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    Fjöldi mynda ({fluxSettings.numOutputs})
                    <input
                      type="range"
                      min={1}
                      max={4}
                      value={fluxSettings.numOutputs}
                      onChange={(e) => updateFluxSettings({ numOutputs: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    Seed ({fluxSettings.seed === -1 ? "slembið" : fluxSettings.seed})
                    <input
                      type="number"
                      value={fluxSettings.seed}
                      onChange={(e) => updateFluxSettings({ seed: Number(e.target.value) })}
                    />
                  </label>
                </div>
              ) : isJuggernaut ? (
                <div className="ac-settings">
                  {mode === "txt2img" && (
                    <>
                      <label>
                        Breidd ({juggernautSettings.width}px)
                        <input
                          type="range"
                          min={512}
                          max={1536}
                          step={8}
                          value={juggernautSettings.width}
                          onChange={(e) => updateJuggernautSettings({ width: Number(e.target.value) })}
                        />
                      </label>
                      <label>
                        Hæð ({juggernautSettings.height}px)
                        <input
                          type="range"
                          min={512}
                          max={1536}
                          step={8}
                          value={juggernautSettings.height}
                          onChange={(e) => updateJuggernautSettings({ height: Number(e.target.value) })}
                        />
                      </label>
                    </>
                  )}
                  {mode === "inpaint" && (
                    <label>
                      Styrkur breytinga ({juggernautSettings.strength.toFixed(2)})
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={juggernautSettings.strength}
                        onChange={(e) => updateJuggernautSettings({ strength: Number(e.target.value) })}
                      />
                    </label>
                  )}
                  <label>
                    Skref ({juggernautSettings.steps})
                    <input
                      type="range"
                      min={1}
                      max={100}
                      value={juggernautSettings.steps}
                      onChange={(e) => updateJuggernautSettings({ steps: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    Guidance ({juggernautSettings.guidanceScale.toFixed(1)})
                    <input
                      type="range"
                      min={1}
                      max={50}
                      step={0.5}
                      value={juggernautSettings.guidanceScale}
                      onChange={(e) => updateJuggernautSettings({ guidanceScale: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    Scheduler
                    <select
                      value={juggernautSettings.scheduler}
                      onChange={(e) =>
                        updateJuggernautSettings({ scheduler: e.target.value as JuggernautSettings["scheduler"] })
                      }
                    >
                      {JUGGERNAUT_SCHEDULERS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </label>
                  {mode === "txt2img" && (
                    <label>
                      Fjöldi mynda ({juggernautSettings.numOutputs})
                      <input
                        type="range"
                        min={1}
                        max={4}
                        value={juggernautSettings.numOutputs}
                        onChange={(e) => updateJuggernautSettings({ numOutputs: Number(e.target.value) })}
                      />
                    </label>
                  )}
                  <label>
                    Seed ({juggernautSettings.seed === -1 ? "slembið" : juggernautSettings.seed})
                    <input
                      type="number"
                      value={juggernautSettings.seed}
                      onChange={(e) => updateJuggernautSettings({ seed: Number(e.target.value) })}
                    />
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={juggernautSettings.useKarrasSigmas}
                      onChange={(e) => updateJuggernautSettings({ useKarrasSigmas: e.target.checked })}
                    />
                    Karras sigmas
                  </label>
                </div>
              ) : (
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
              )}

              {isFlux ? (
                <>
                  <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={fluxSettings.disableSafetyChecker}
                      onChange={(e) => updateFluxSettings({ disableSafetyChecker: e.target.checked })}
                    />
                    Slökkva á öryggissíu (disable_safety_checker)
                  </label>
                  <p className="ac-hint">
                    Skjalfest Replicate-breyta fyrir þetta líkan — sjálfgefið á. Þú berð ábyrgð á
                    notkuninni þegar slökkt er á síunni.
                  </p>
                </>
              ) : isJuggernaut ? (
                <>
                  <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={juggernautSettings.disableSafetyChecker}
                      onChange={(e) => updateJuggernautSettings({ disableSafetyChecker: e.target.checked })}
                    />
                    Slökkva á öryggissíu (disable_safety_checker)
                  </label>
                  <p className="ac-hint">
                    Replicate-breyta hjá asiryan/juggernaut-xl-v7 — sjálfgefið á. Þú berð ábyrgð á
                    notkuninni þegar slökkt er á síunni.
                  </p>
                </>
              ) : (
                <>
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
                    Bæði eru skjalfestar Replicate-breytur fyrir þetta líkan — öryggissían er
                    sjálfgefið á, vatnsmerkið sjálfgefið á. Þú berð ábyrgð á notkuninni þegar slökkt
                    er á síunni.
                  </p>
                </>
              )}

              {error && <p className="ac-error">{error}</p>}
              <button type="button" className="ac-btn" onClick={() => void run()} disabled={busy}>
                {busy ? "Teikna…" : "Teikna mynd"}
              </button>
            </section>
          )}

          {results.length > 0 && (
            <section className="ac-panel">
              <h2>Útkoma</h2>
              {savedMeta && (
                <p className="ac-hint">
                  Vistuð {formatSavedTime(savedMeta.timestamp)}
                  {savedMeta.mode ? ` · ${savedMeta.mode}` : ""}
                  {savedMeta.prompt ? ` · „${savedMeta.prompt.slice(0, 80)}${savedMeta.prompt.length > 80 ? "…" : ""}"` : ""}
                </p>
              )}
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
              <div className="ac-row">
                <button type="button" className="ac-btn ghost" onClick={() => void clearSavedResults()}>
                  Hreinsa vistaða útkomu
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
    </StationChrome>
  );
}
