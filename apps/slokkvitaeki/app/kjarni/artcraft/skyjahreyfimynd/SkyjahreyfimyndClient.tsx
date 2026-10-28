"use client";

import { useEffect, useRef, useState } from "react";
import { StationChrome } from "../../StationChrome";
import { artcraftHubHref, artcraftToolsHref } from "../apps";
import "../artcraft.css";
import { shrinkImageForUpload } from "../replicateImage";
import {
  DEFAULT_WAN_SETTINGS,
  generateWanVideo,
  normalizeWanSettings,
  readStoredWanSettings,
  WAN_ASPECT_RATIOS,
  WAN_RESOLUTIONS,
  WAN_SETTINGS_KEY,
  type WanSettings,
} from "./wan";

const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";

function downloadBlob(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
}

export default function SkyjahreyfimyndClient() {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<WanSettings>(DEFAULT_WAN_SETTINGS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [source, setSource] = useState<{ url: string; name: string } | null>(null);
  const [result, setResult] = useState<string>("");
  const resultUrlRef = useRef<string>("");
  const sourceUrlRef = useRef<string>("");
  const sourceDataUrlRef = useRef<string>("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  useEffect(() => {
    setSettings(readStoredWanSettings());
    setReady(true);
  }, []);

  useEffect(() => {
    return () => {
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    };
  }, []);

  function updateSettings(next: Partial<WanSettings>) {
    setSettings((s) => {
      const merged = normalizeWanSettings({ ...s, ...next });
      window.localStorage.setItem(WAN_SETTINGS_KEY, JSON.stringify(merged));
      return merged;
    });
  }

  async function addFile(file: File) {
    setError("");
    try {
      // Wan 2.2 i2v notar lágupplausn uppfletti; 1024px passar fínt
      // og heldur okkur örugglega undir Vercel's 4.5MB body-mörkum.
      const shrunk = await shrinkImageForUpload(file, { maxDim: 1024 });
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
      const url = URL.createObjectURL(file);
      sourceUrlRef.current = url;
      sourceDataUrlRef.current = shrunk.dataUrl;
      setSource({ url, name: file.name });
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
      const blob = await generateWanVideo(settings, sourceDataUrlRef.current);
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
      const url = URL.createObjectURL(blob);
      resultUrlRef.current = url;
      setResult(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Skýjahreyfimynd mistókst.");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <StationChrome tool="artcraft">
        <div className="ac-hub">
          <p className="ac-lead">Hleð Skýjahreyfimynd…</p>
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
            {" · Skýjahreyfimynd"}
          </p>
          <h1>Skýjahreyfimynd</h1>
          <p className="ac-lead">
            Mynd → myndband með Wan 2.2 í skýinu (Replicate) — opin uppspretta úr Alibaba, ~$0.05 per
            myndband, ~30s í generation. Vilt þú frekar ókeypis og staðbundið: sjá Hreyfimynd (Wan 2.1
            gegnum þitt eigið ComfyUI).
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
              if (file) void addFile(file);
              e.target.value = "";
            }}
          />

          {source && (
            <section className="ac-panel">
              <h2>Upphafsmynd</h2>
              <p className="ac-hint">{source.name}</p>
              <img src={source.url} alt={source.name} style={{ maxWidth: "100%", borderRadius: 8 }} />
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
            <h2>Prompt</h2>
            <label>
              Hvað gerist í myndbandinu?
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
                rows={2}
              />
            </label>

            <div className="ac-settings">
              <label>
                Fjöldi ramma ({settings.numFrames} ≈ {(settings.numFrames / settings.framesPerSecond).toFixed(1)}s)
                <input
                  type="range"
                  min={81}
                  max={129}
                  step={4}
                  value={settings.numFrames}
                  onChange={(e) => updateSettings({ numFrames: Number(e.target.value) })}
                />
              </label>
              <label>
                FPS ({settings.framesPerSecond})
                <input
                  type="range"
                  min={8}
                  max={30}
                  value={settings.framesPerSecond}
                  onChange={(e) => updateSettings({ framesPerSecond: Number(e.target.value) })}
                />
              </label>
              <label>
                Upplausn
                <select
                  value={settings.resolution}
                  onChange={(e) => updateSettings({ resolution: e.target.value as WanSettings["resolution"] })}
                >
                  {WAN_RESOLUTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Hlutfall
                <select
                  value={settings.aspectRatio}
                  onChange={(e) => updateSettings({ aspectRatio: e.target.value as WanSettings["aspectRatio"] })}
                >
                  {WAN_ASPECT_RATIOS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
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
            <p className="ac-hint">
              Skjalfest Replicate-breyta hjá wan-video/wan-2.2-i2v-fast — sjálfgefið á. Þú berð ábyrgð á
              notkuninni þegar slökkt er á síunni.
            </p>

            {error && <p className="ac-error">{error}</p>}
            <button type="button" className="ac-btn" onClick={() => void run()} disabled={busy || !source}>
              {busy ? "Teikna myndband…" : "Teikna myndband"}
            </button>
          </section>

          {result && (
            <section className="ac-panel">
              <h2>Útkoma</h2>
              <video src={result} controls autoPlay loop muted style={{ maxWidth: "100%", borderRadius: 8 }} />
              <div className="ac-row">
                <button
                  type="button"
                  className="ac-btn ghost"
                  onClick={() => downloadBlob(result, `skyjahreyfimynd-${source?.name?.replace(/\.[^.]+$/, "") || "myndband"}.mp4`)}
                >
                  Sækja myndband
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
    </StationChrome>
  );
}
