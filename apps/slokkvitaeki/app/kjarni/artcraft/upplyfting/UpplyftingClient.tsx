"use client";

import { useEffect, useRef, useState } from "react";
import { StationChrome } from "../../StationChrome";
import { artcraftHubHref, artcraftToolsHref } from "../apps";
import "../artcraft.css";
import ImageZoom from "../ImageZoom";
import { shrinkImageForUpload } from "../replicateImage";
import {
  DEFAULT_TOPAZ_SETTINGS,
  normalizeTopazSettings,
  readStoredTopazSettings,
  TOPAZ_ENHANCE_MODELS,
  TOPAZ_OUTPUT_FORMATS,
  TOPAZ_SETTINGS_KEY,
  TOPAZ_SUBJECT_DETECTIONS,
  type TopazSettings,
  upscaleWithTopaz,
} from "./topaz";

const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";

function downloadBlob(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
}

export default function UpplyftingClient() {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<TopazSettings>(DEFAULT_TOPAZ_SETTINGS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [source, setSource] = useState<{ url: string; name: string; width: number; height: number } | null>(null);
  const [result, setResult] = useState<string>("");
  const resultUrlRef = useRef<string>("");
  const sourceUrlRef = useRef<string>("");
  const sourceDataUrlRef = useRef<string>("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  useEffect(() => {
    setSettings(readStoredTopazSettings());
    setReady(true);
  }, []);

  useEffect(() => {
    return () => {
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    };
  }, []);

  function updateSettings(next: Partial<TopazSettings>) {
    setSettings((s) => {
      const merged = normalizeTopazSettings({ ...s, ...next });
      window.localStorage.setItem(TOPAZ_SETTINGS_KEY, JSON.stringify(merged));
      return merged;
    });
  }

  async function addFile(file: File) {
    setError("");
    try {
      // Topaz skilar hámarksgæðum þegar uppflettingin er há; við þurfum samt
      // að halda okkur undir Vercel's 4.5MB — leyfum 2048px hámarks hlið og
      // JPEG q=0.95 til að forðast óþarfa tap á áferð áður en Topaz sér hana.
      const shrunk = await shrinkImageForUpload(file, { maxDim: 2048, mime: "image/jpeg", quality: 0.95 });
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
      const url = URL.createObjectURL(file);
      sourceUrlRef.current = url;
      sourceDataUrlRef.current = shrunk.dataUrl;
      setSource({ url, name: file.name, width: shrunk.width, height: shrunk.height });
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = "";
      setResult("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gat ekki opnað myndina.");
    }
  }

  async function run() {
    if (!source) {
      setError("Hladdu upp mynd fyrst.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const blob = await upscaleWithTopaz(settings, sourceDataUrlRef.current);
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
      const url = URL.createObjectURL(blob);
      resultUrlRef.current = url;
      setResult(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upplyfting mistókst.");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <StationChrome tool="artcraft">
        <div className="ac-hub">
          <p className="ac-lead">Hleð Upplyftingu…</p>
        </div>
      </StationChrome>
    );
  }

  const estimatedOutputMp =
    source != null
      ? ((source.width * settings.upscaleFactor * source.height * settings.upscaleFactor) / 1_000_000).toFixed(1)
      : null;

  return (
    <StationChrome tool="artcraft">
      <div className="ac-hub">
        <div className="ac-hub-in ac-studio">
          <p className="ac-kicker">
            <a href={artcraftHubHref()}>ArtCraft</a>
            {" · "}
            <a href={artcraftToolsHref()}>Tól</a>
            {" · Upplyfting"}
          </p>
          <h1>Upplyfting</h1>
          <p className="ac-lead">
            Faglegt myndupplyfting með Topaz Labs á Replicate — það sama og í Topaz Photo AI, en gegnum
            skýið. Hleðurðu inn mynd, veldu enhance-líkan og stækkunarstuðul; úttakið er stærri, skarpari
            mynd. Reiknað eftir útkomuflatarmáli ($0.05 per 12 MP), svo stór myndaukning kostar meira.
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

          {source && (
            <section className="ac-panel">
              <h2>Mynd</h2>
              <p className="ac-hint">
                {source.name} · {source.width}×{source.height}px
              </p>
              <div className="ac-row">
                <button
                  type="button"
                  className="ac-btn ghost"
                  onClick={() => {
                    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
                    sourceUrlRef.current = "";
                    sourceDataUrlRef.current = "";
                    setSource(null);
                    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
                    resultUrlRef.current = "";
                    setResult("");
                  }}
                >
                  Ný mynd
                </button>
              </div>
            </section>
          )}

          <section className="ac-panel">
            <h2>Stillingar</h2>
            <div className="ac-settings">
              <label>
                Enhance-líkan
                <select
                  value={settings.enhanceModel}
                  onChange={(e) => updateSettings({ enhanceModel: e.target.value as TopazSettings["enhanceModel"] })}
                >
                  {TOPAZ_ENHANCE_MODELS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Stækkun ({settings.upscaleFactor}×{estimatedOutputMp != null ? ` · ~${estimatedOutputMp} MP` : ""})
                <input
                  type="range"
                  min={1}
                  max={6}
                  step={0.5}
                  value={settings.upscaleFactor}
                  onChange={(e) => updateSettings({ upscaleFactor: Number(e.target.value) })}
                />
              </label>
              <label>
                Subject detection
                <select
                  value={settings.subjectDetection}
                  onChange={(e) =>
                    updateSettings({ subjectDetection: e.target.value as TopazSettings["subjectDetection"] })
                  }
                >
                  {TOPAZ_SUBJECT_DETECTIONS.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Output
                <select
                  value={settings.outputFormat}
                  onChange={(e) => updateSettings({ outputFormat: e.target.value as TopazSettings["outputFormat"] })}
                >
                  {TOPAZ_OUTPUT_FORMATS.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={settings.faceEnhancement}
                onChange={(e) => updateSettings({ faceEnhancement: e.target.checked })}
              />
              Lagfæra andlit (face_enhancement)
            </label>
            {settings.faceEnhancement && (
              <div className="ac-settings">
                <label>
                  Creativity ({settings.faceEnhancementCreativity.toFixed(2)})
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={settings.faceEnhancementCreativity}
                    onChange={(e) => updateSettings({ faceEnhancementCreativity: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Strength ({settings.faceEnhancementStrength.toFixed(2)})
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={settings.faceEnhancementStrength}
                    onChange={(e) => updateSettings({ faceEnhancementStrength: Number(e.target.value) })}
                  />
                </label>
              </div>
            )}

            {error && <p className="ac-error">{error}</p>}
            <button type="button" className="ac-btn" onClick={() => void run()} disabled={busy || !source}>
              {busy ? "Upplyfti…" : "Upplyfta mynd"}
            </button>
          </section>

          {source && !result && (
            <section className="ac-panel">
              <h2>Upprunalegt</h2>
              <ImageZoom src={source.url} alt={source.name} className="ac-upscale-preview" />
              <p className="ac-hint">Smelltu á myndina til að zoom-a inn og út.</p>
            </section>
          )}

          {result && (
            <section className="ac-panel">
              <h2>Útkoma</h2>
              <ImageZoom src={result} alt="Upplyft mynd" className="ac-upscale-preview" />
              <p className="ac-hint">Smelltu til að zoom-a. Topaz skilar oft mjög stórri mynd — forsýningin er skölun, en niðurhal nær fullri upplausn.</p>
              <div className="ac-row">
                <button
                  type="button"
                  className="ac-btn ghost"
                  onClick={() => downloadBlob(result, `upplyft-${source?.name || "mynd"}`)}
                >
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
