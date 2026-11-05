"use client";

import { useEffect, useRef, useState } from "react";
import { StationChrome } from "../../StationChrome";
import { artcraftHubHref, artcraftToolsHref } from "../apps";
import ImageZoom from "../ImageZoom";
import SendTo from "../SendTo";
import StagingPicker from "../StagingPicker";
import { useStagedSource } from "../useStagedSource";
import "../artcraft.css";
import {
  centerAt,
  DEFAULT_TUNE,
  normalizeTune,
  tuneIsIdentity,
  warpBody,
  type BodyFrame,
  type BodyTune,
  type Pixels,
} from "./bodyWarp";
import { detectBody, readPixels, renderFullResolution } from "./pose";

const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";
/** Lifandi forsýn er minnkuð svo sleðarnir svari strax, líka á síma; vistun
 *  keyrir sömu breytingu á upprunalegu upplausninni. */
const PREVIEW_MAX = 1024;

type Phase = "empty" | "detecting" | "ready" | "nobody" | "failed";

const SLIDERS: Array<{ key: keyof BodyTune; label: string; min: number; less: string; more: string }> = [
  { key: "waist", label: "Mitti", min: -100, less: "mjórra", more: "breiðara" },
  { key: "hips", label: "Mjaðmir", min: -100, less: "mjórri", more: "breiðari" },
  { key: "bust", label: "Brjóstkassi", min: -100, less: "minni", more: "stærri" },
  { key: "shoulders", label: "Axlir", min: -100, less: "mjórri", more: "breiðari" },
  { key: "slim", label: "Búkur í heild", min: -100, less: "grennri", more: "þrýstnari" },
  { key: "legs", label: "Fótleggir", min: 0, less: "", more: "lengri" },
  { key: "head", label: "Höfuð", min: -100, less: "minna", more: "stærra" },
];

function isPhotoFile(file: { type: string; name: string }): boolean {
  if (/^image\/(jpeg|png|webp)$/i.test(file.type)) return true;
  return /\.(jpe?g|png|webp)$/i.test(file.name);
}

function drawPixels(canvas: HTMLCanvasElement, img: Pixels) {
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const image = ctx.createImageData(img.width, img.height);
  image.data.set(img.data);
  ctx.putImageData(image, 0, 0);
}

/** Þunnar línur þar sem böndin lentu — svo sést strax hvort greiningin
 *  fann réttan stað áður en sleðarnir eru hreyfðir. */
function drawGuides(canvas: HTMLCanvasElement, frame: BodyFrame) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.save();
  ctx.lineWidth = Math.max(1, w / 500);
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = "rgba(201, 152, 47, 0.9)";
  ctx.beginPath();
  frame.center.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x * w, p.y * h) : ctx.lineTo(p.x * w, p.y * h)));
  ctx.stroke();
  for (const band of Object.values(frame.bands)) {
    const cx = centerAt(frame.center, band.y) * w;
    ctx.beginPath();
    ctx.moveTo(cx - band.half * w, band.y * h);
    ctx.lineTo(cx + band.half * w, band.y * h);
    ctx.stroke();
  }
  if (frame.head) {
    ctx.beginPath();
    ctx.arc(frame.head.x * w, frame.head.y * h, frame.head.r * w, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function downloadBlob(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
}

function sliderLabel(value: number, less: string, more: string): string {
  if (value === 0) return "0";
  return `${value > 0 ? "+" : "−"}${Math.abs(value)} · ${value > 0 ? more : less}`;
}

export default function LikamiClient() {
  const inputRef = useRef<HTMLInputElement>(null);
  const viewRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<Pixels | null>(null);
  const resultUrlRef = useRef("");
  const [drag, setDrag] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fullSize, setFullSize] = useState({ width: 0, height: 0 });
  const [previewVersion, setPreviewVersion] = useState(0);
  const [phase, setPhase] = useState<Phase>("empty");
  const [frame, setFrame] = useState<BodyFrame | null>(null);
  const [tune, setTune] = useState<BodyTune>(DEFAULT_TUNE);
  const [compare, setCompare] = useState(false);
  const [guides, setGuides] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ url: string; blob: Blob; width: number; height: number } | null>(null);
  const [error, setError] = useState("");

  function clearResult() {
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    resultUrlRef.current = "";
    setResult(null);
  }

  useEffect(() => () => {
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
  }, []);

  async function addFile(next: File) {
    if (!isPhotoFile(next)) return;
    setError("");
    clearResult();
    setTune(DEFAULT_TUNE);
    setFrame(null);
    previewRef.current = null;
    setPhase("detecting");
    try {
      const preview = await readPixels(next, PREVIEW_MAX);
      const bitmap = await createImageBitmap(next);
      setFullSize({ width: bitmap.width, height: bitmap.height });
      bitmap.close();
      previewRef.current = preview;
      setFile(next);
      setPreviewVersion((v) => v + 1);

      const detectCanvas = document.createElement("canvas");
      drawPixels(detectCanvas, preview);
      const found = await detectBody(detectCanvas);
      setFrame(found);
      setPhase(found ? "ready" : "nobody");
    } catch (err) {
      setPhase(previewRef.current ? "failed" : "empty");
      setError(
        `Greining mistókst: ${err instanceof Error ? err.message : "óþekkt villa"}. Athugaðu nettenginguna — líkanið er sótt einu sinni af CDN.`,
      );
    }
  }

  useStagedSource(async (blob, item) => {
    await addFile(new File([blob], item.name || `from-${item.sourceTool}.png`, { type: blob.type || "image/png" }));
  });

  // Teiknar forsýnina aftur þegar sleði hreyfist — einu sinni per skjáramma,
  // sama hve hratt sleðinn er dreginn.
  useEffect(() => {
    const src = previewRef.current;
    const canvas = viewRef.current;
    if (!src || !canvas) return;
    const id = requestAnimationFrame(() => {
      const img = compare || !frame ? src : warpBody(src, frame, tune);
      drawPixels(canvas, img);
      if (guides && frame && (compare || tuneIsIdentity(tune))) drawGuides(canvas, frame);
    });
    return () => cancelAnimationFrame(id);
  }, [tune, compare, frame, guides, previewVersion]);

  function updateTune(key: keyof BodyTune, value: number) {
    clearResult();
    setTune((t) => normalizeTune({ ...t, [key]: value / 100 }));
  }

  async function save() {
    if (!file || !frame) return;
    setSaving(true);
    setError("");
    clearResult();
    try {
      const out = await renderFullResolution(file, frame, tune);
      const url = URL.createObjectURL(out.blob);
      resultUrlRef.current = url;
      setResult({ url, ...out });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Vistun mistókst.");
    } finally {
      setSaving(false);
    }
  }

  const baseName = file?.name.replace(/\.[^.]+$/, "") || "mynd";

  return (
    <StationChrome tool="artcraft">
      <div className="ac-hub">
        <div className="ac-hub-in ac-studio">
          <p className="ac-kicker">
            <a href={artcraftHubHref()}>ArtCraft</a>
            {" · "}
            <a href={artcraftToolsHref()}>Tól</a>
            {" · Líkamsmótun"}
          </p>
          <h1>Líkamsmótun</h1>
          <p className="ac-lead">
            Eins og „Body Tuner“ í Picsart, YouCam og PhotoDirector: finnur líkamann sjálfkrafa og þú
            stillir mitti, mjaðmir, axlir, fótleggi og höfuð með sleðum. Allt keyrir í vafranum —
            engin mynd er send neitt og ekkert kostar. Vistað í fullri upplausn.
          </p>

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
              const dropped = e.dataTransfer.files?.[0];
              if (dropped) void addFile(dropped);
            }}
          >
            <p>Slepptu mynd af manneskju hér, eða</p>
            <button type="button" className="ac-btn" onClick={() => inputRef.current?.click()}>
              Velja mynd
            </button>
            <input
              ref={inputRef}
              type="file"
              accept={PHOTO_ACCEPT}
              hidden
              onChange={(e) => {
                const picked = e.target.files?.[0];
                if (picked) void addFile(picked);
                e.target.value = "";
              }}
            />
            <div style={{ marginTop: 8 }}>
              <StagingPicker
                accepts="image"
                onPick={async (blob, item) => {
                  await addFile(new File([blob], item.name || `from-${item.sourceTool}.png`, { type: blob.type || "image/png" }));
                }}
              />
            </div>
          </section>

          {phase !== "empty" && (
            <section className="ac-panel ac-adjust">
              {phase === "detecting" && (
                <p className="ac-status">
                  Finn líkamann… (í fyrsta skipti sækir vafrinn greiningarlíkanið, um 24MB — síðan er það
                  geymt)
                </p>
              )}
              {phase === "nobody" && (
                <p className="ac-error">
                  Fann ekki líkama á myndinni. Axlir og mjaðmir þurfa að sjást — best er að manneskjan
                  standi og snúi að myndavélinni.
                </p>
              )}
              {error && <p className="ac-error">{error}</p>}
              <div className="ac-adjust-stage">
                <canvas ref={viewRef} className="ac-adjust-canvas" style={{ cursor: "default" }} />
              </div>
              {phase === "ready" && frame && (
                <>
                  <div className="ac-row">
                    <button
                      type="button"
                      className="ac-btn ghost"
                      onPointerDown={() => setCompare(true)}
                      onPointerUp={() => setCompare(false)}
                      onPointerLeave={() => setCompare(false)}
                      onPointerCancel={() => setCompare(false)}
                    >
                      Halda inni: sjá fyrir
                    </button>
                    <button type="button" className="ac-btn ghost" onClick={() => setGuides((g) => !g)}>
                      {guides ? "Fela greiningu" : "Sýna greiningu"}
                    </button>
                    <button
                      type="button"
                      className="ac-btn ghost"
                      disabled={tuneIsIdentity(tune)}
                      onClick={() => {
                        clearResult();
                        setTune(DEFAULT_TUNE);
                      }}
                    >
                      Núllstilla
                    </button>
                  </div>
                  {guides && !tuneIsIdentity(tune) && (
                    <p className="ac-hint">Greiningarlínur sjást á upprunalegu myndinni — haltu inni „sjá fyrir“.</p>
                  )}

                  <div className="ac-settings">
                    {SLIDERS.map((s) => {
                      const disabled = (s.key === "legs" && !frame.legs) || (s.key === "head" && !frame.head);
                      const value = Math.round(tune[s.key] * 100);
                      return (
                        <label key={s.key} className={disabled ? "ac-range dim" : undefined}>
                          {s.label} ({disabled ? "sést ekki" : sliderLabel(value, s.less, s.more)})
                          <input
                            type="range"
                            min={s.min}
                            max={100}
                            step={1}
                            value={value}
                            disabled={disabled}
                            onChange={(e) => updateTune(s.key, Number(e.target.value))}
                          />
                        </label>
                      );
                    })}
                  </div>
                  {!frame.legs && (
                    <p className="ac-hint">Hnén sjást ekki á myndinni, svo ekki er hægt að lengja fótleggina.</p>
                  )}
                  <p className="ac-hint">
                    Þarftu að laga einn stað nákvæmar? Vistaðu og sendu myndina í Móta til að fínstilla
                    með bursta.
                  </p>

                  <div className="ac-row">
                    <button type="button" className="ac-btn" onClick={() => void save()} disabled={saving || tuneIsIdentity(tune)}>
                      {saving ? "Vista…" : `Vista í fullri upplausn (${fullSize.width}×${fullSize.height})`}
                    </button>
                  </div>
                </>
              )}
            </section>
          )}

          {result && (
            <section className="ac-panel">
              <h2>
                Útkoma ({result.width}×{result.height}px)
              </h2>
              <ImageZoom src={result.url} alt={`Líkamsmótun: ${baseName}`} />
              <div className="ac-row">
                <button type="button" className="ac-btn" onClick={() => downloadBlob(result.url, `${baseName}-likamsmotun.jpg`)}>
                  Sækja mynd
                </button>
                <SendTo
                  blob={result.blob}
                  mediaType="image"
                  sourceTool="likami"
                  sourceToolName="Líkamsmótun"
                  name={`${baseName}-likamsmotun.jpg`}
                />
              </div>
            </section>
          )}
        </div>
      </div>
    </StationChrome>
  );
}
