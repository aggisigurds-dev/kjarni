"use client";

import { useEffect, useRef, useState } from "react";
import { StationChrome } from "../../StationChrome";
import { artcraftHubHref, artcraftToolsHref } from "../apps";
import "../artcraft.css";
import { shrinkImageForUpload } from "../replicateImage";
import {
  DEFAULT_VAKNA_SETTINGS,
  generateVaknaVideo,
  normalizeVaknaSettings,
  readStoredVaknaSettings,
  VAKNA_ASPECT_LABELS,
  VAKNA_ASPECT_RATIOS,
  VAKNA_SETTINGS_KEY,
  type VaknaProgress,
  type VaknaSettings,
} from "./model";

const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";

function downloadBlob(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function statusLabel(status: string): string {
  switch (status) {
    case "starting":
      return "Í biðröð";
    case "processing":
      return "Vinnur";
    case "succeeded":
      return "Tilbúið";
    case "failed":
      return "Mistókst";
    case "canceled":
      return "Hætt við";
    case "transient-error":
      return "Nettruflun — reyni aftur";
    default:
      return status;
  }
}

export default function VaknaClient() {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<VaknaSettings>(DEFAULT_VAKNA_SETTINGS);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<VaknaProgress | null>(null);
  const [error, setError] = useState("");
  const [source, setSource] = useState<{ url: string; name: string } | null>(null);
  const [result, setResult] = useState<string>("");
  const sourceUrlRef = useRef<string>("");
  const sourceDataUrlRef = useRef<string>("");
  const resultUrlRef = useRef<string>("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  useEffect(() => {
    setSettings(readStoredVaknaSettings());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(VAKNA_SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* quota eða disabled */
    }
  }, [ready, settings]);

  useEffect(() => {
    return () => {
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    };
  }, []);

  function updateSettings(patch: Partial<VaknaSettings>) {
    setSettings((prev) => normalizeVaknaSettings({ ...prev, ...patch }));
  }

  function resetSettings() {
    setSettings(DEFAULT_VAKNA_SETTINGS);
  }

  async function acceptFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("Vinsamlegast dropaðu ljósmynd (JPG, PNG eða WebP).");
      return;
    }
    setError("");
    try {
      const shrunk = await shrinkImageForUpload(file, { maxDim: 1280, mime: "image/jpeg", quality: 0.9 });
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
      const blob = await (await fetch(shrunk.dataUrl)).blob();
      const url = URL.createObjectURL(blob);
      sourceUrlRef.current = url;
      sourceDataUrlRef.current = shrunk.dataUrl;
      setSource({ url, name: file.name });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Villa við að lesa myndina");
    }
  }

  async function handleGenerate() {
    if (!source || !sourceDataUrlRef.current) {
      setError("Settu mynd inn fyrst.");
      return;
    }
    setBusy(true);
    setError("");
    setProgress({ status: "starting", elapsedSeconds: 0 });
    try {
      const blob = await generateVaknaVideo(settings, sourceDataUrlRef.current, {
        onStatus: (p) => setProgress(p),
      });
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
      const url = URL.createObjectURL(blob);
      resultUrlRef.current = url;
      setResult(url);
      setProgress((prev) => ({ status: "succeeded", elapsedSeconds: prev?.elapsedSeconds ?? 0 }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Vakna mistókst");
      setProgress(null);
    } finally {
      setBusy(false);
    }
  }

  const estSeconds = Math.round((settings.length / 16) * 10) / 10;

  if (!ready) {
    return (
      <StationChrome tool="artcraft">
        <div className="ac-hub">
          <p className="ac-lead">Hleð Vakna…</p>
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
            {" · Vakna"}
          </p>
          <h1>Vakna</h1>
          <p className="ac-lead">
            Vekur kyrrmynd til lífsins — Wan 2.2 TI2V á OKKAR EIGIN RunPod serverless. Fyrsti
            cold-start tekur 10-15 mín (sækir ~15GB af módelum), síðan er hver video 60-120s.
            Scales to zero þegar enginn notar, engin NSFW-takmörk.
          </p>

          {!source && (
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
              <p>Slepptu upphafsmynd hér, eða</p>
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
              if (file) void acceptFile(file);
            }}
          />

          {source && (
            <section className="ac-panel">
              <h2>Upphafsmynd</h2>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={source.url}
                alt={source.name}
                style={{ maxWidth: "100%", maxHeight: 320, display: "block", borderRadius: 8 }}
              />
              <div className="ac-row" style={{ marginTop: 12 }}>
                <button type="button" className="ac-btn" onClick={() => inputRef.current?.click()}>
                  Önnur mynd
                </button>
              </div>
            </section>
          )}

          <section className="ac-panel">
            <h2>Lýstu hreyfingunni</h2>
            <textarea
              className="ac-textarea"
              value={settings.prompt}
              onChange={(e) => updateSettings({ prompt: e.target.value })}
              rows={3}
              placeholder="t.d. cinematic motion, subtle camera push-in, natural lighting"
            />

            <div className="ac-row" style={{ marginTop: 12 }}>
              <label className="ac-field" title="Hlutfall ramma. 9:16 = simi (lodrett), 16:9 = sjonvarp (larett), 1:1 = Instagram">
                <span>Hlutfall</span>
                <select
                  className="ac-select"
                  value={settings.aspectRatio}
                  onChange={(e) => updateSettings({ aspectRatio: e.target.value as VaknaSettings["aspectRatio"] })}
                >
                  {VAKNA_ASPECT_RATIOS.map((r) => (
                    <option key={r} value={r}>
                      {VAKNA_ASPECT_LABELS[r]} ({r})
                    </option>
                  ))}
                </select>
              </label>
              <label className="ac-field" title={`Fjoldi ramma i video (16fps). ${settings.length} rammar = ~${estSeconds}s`}>
                <span>Lengd ({estSeconds}s)</span>
                <input
                  type="range"
                  min={25}
                  max={129}
                  step={8}
                  value={settings.length}
                  onChange={(e) => updateSettings({ length: Number(e.target.value) })}
                />
              </label>
            </div>

            <details className="ac-details" style={{ marginTop: 12 }}>
              <summary>Nánari stillingar</summary>
              <div className="ac-row" style={{ marginTop: 12 }}>
                <label className="ac-field" title="Faerri skref = hradara en groffara. Default 10 (med LightX2V LoRA)">
                  <span>Skref ({settings.steps})</span>
                  <input
                    type="range"
                    min={4}
                    max={50}
                    step={1}
                    value={settings.steps}
                    onChange={(e) => updateSettings({ steps: Number(e.target.value) })}
                  />
                </label>
                <label className="ac-field" title="Classifier-free guidance. Haerra = fylgir prompti nanar, laegra = meiri frelsi. Default 2.0">
                  <span>CFG ({settings.cfg.toFixed(1)})</span>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    step={0.5}
                    value={settings.cfg}
                    onChange={(e) => updateSettings({ cfg: Number(e.target.value) })}
                  />
                </label>
              </div>
              <label className="ac-field" style={{ marginTop: 12 }} title="Hvad a EKKI ad vera i videoinu">
                <span>Neikvætt prompt</span>
                <input
                  type="text"
                  className="ac-input"
                  value={settings.negativePrompt}
                  onChange={(e) => updateSettings({ negativePrompt: e.target.value })}
                />
              </label>
              <label className="ac-field" style={{ marginTop: 12 }} title="-1 = random. Settu fast tala til ad endurtaka sama utkomu">
                <span>Seed</span>
                <input
                  type="number"
                  className="ac-input"
                  value={settings.seed}
                  onChange={(e) => updateSettings({ seed: Number(e.target.value) })}
                />
              </label>
            </details>
          </section>

          <section className="ac-panel">
            <div className="ac-row" style={{ gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <button className="ac-btn primary" onClick={handleGenerate} disabled={busy || !source}>
                {busy ? "Vinn…" : "Vakna"}
              </button>
              <button className="ac-btn" onClick={resetSettings} disabled={busy} title="Nullstilla stillingar i default">
                Grunngildi
              </button>
              {progress && (
                <span className="ac-muted" style={{ fontSize: 13 }}>
                  {statusLabel(progress.status)} · {formatElapsed(progress.elapsedSeconds)}
                  {typeof progress.executionTime === "number" && progress.executionTime > 0 && (
                    <> · GPU: {Math.round(progress.executionTime / 1000)}s</>
                  )}
                </span>
              )}
            </div>

            {error && (
              <p className="ac-error" style={{ marginTop: 12 }}>
                {error}
              </p>
            )}

            {progress && progress.status !== "succeeded" && progress.status !== "failed" && (
              <p className="ac-muted" style={{ marginTop: 12, fontSize: 13 }}>
                {progress.elapsedSeconds > 60 && progress.elapsedSeconds < 900
                  ? "Fyrsti cold-start getur tekið 10-15 mín meðan ~15GB af módelum sækja sig. Síðar er hvert video 60-120s."
                  : "Vinn videoið á okkar eigin GPU-i…"}
              </p>
            )}
          </section>

          {result && (
            <section className="ac-panel">
              <h2>Útkoma</h2>
              <video src={result} controls autoPlay loop playsInline style={{ maxWidth: "100%", borderRadius: 8 }} />
              <div className="ac-row" style={{ marginTop: 12 }}>
                <button className="ac-btn" onClick={() => downloadBlob(result, `vakna-${Date.now()}.mp4`)}>
                  Vista mp4
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
    </StationChrome>
  );
}
