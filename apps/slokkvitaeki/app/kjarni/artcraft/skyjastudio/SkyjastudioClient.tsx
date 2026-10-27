"use client";

import { useEffect, useRef, useState } from "react";
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
import ImageZoom from "../ImageZoom";

function downloadBlob(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
}

export default function SkyjastudioClient() {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<SdxlSettings>(DEFAULT_SDXL_SETTINGS);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<string[]>([]);
  const resultUrlsRef = useRef<string[]>([]);

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

  async function run() {
    if (!settings.prompt.trim()) {
      setError("Skrifaðu prompt fyrst.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const blobs = await generateSdxlImage(settings);
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
            Texti → mynd með Stability AI's eigin SDXL-líkani (Replicate) — engin uppsetning,
            byrjar strax, en kostar smá upphæð per mynd og myndin fer út af vélinni. Vilt þú
            frekar ókeypis og staðbundið: sjá Einkastúdíó eða ComfyUI.
          </p>

          <section className="ac-panel">
            <h2>Prompt</h2>
            <label>
              Lýsing
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
