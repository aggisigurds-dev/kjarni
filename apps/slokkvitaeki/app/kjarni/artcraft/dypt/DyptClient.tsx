"use client";

import { useEffect, useRef, useState } from "react";
import { StationChrome } from "../../StationChrome";
import { artcraftHubHref, artcraftToolsHref } from "../apps";
import "../artcraft.css";
import ImageZoom from "../ImageZoom";
import { shrinkImageForUpload } from "../replicateImage";
import { clearResult, formatSavedTime, loadResult, saveResult } from "../savedResults";
import SendTo from "../SendTo";
import StagingPicker from "../StagingPicker";
import { useStagedSource } from "../useStagedSource";
import {
  DEFAULT_DYPT_SETTINGS,
  DYPT_ENCODER_LABELS,
  DYPT_ENCODERS,
  DYPT_SETTINGS_KEY,
  generateDepthMap,
  normalizeDyptSettings,
  readStoredDyptSettings,
  type DyptEncoder,
  type DyptSettings,
} from "./model";

const SAVED_KEY = "dypt";
const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";

function downloadBlob(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
}

export default function DyptClient() {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<DyptSettings>(DEFAULT_DYPT_SETTINGS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [source, setSource] = useState<{ url: string; name: string; width: number; height: number } | null>(null);
  const [result, setResult] = useState<string>("");
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [savedMeta, setSavedMeta] = useState<{ timestamp: number; sourceName?: string } | null>(null);
  const sourceUrlRef = useRef<string>("");
  const sourceDataUrlRef = useRef<string>("");
  const resultUrlRef = useRef<string>("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  useEffect(() => {
    setSettings(readStoredDyptSettings());
    setReady(true);
    void (async () => {
      const saved = await loadResult(SAVED_KEY);
      if (saved && saved.blobs[0]) {
        if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
        const url = URL.createObjectURL(saved.blobs[0]);
        resultUrlRef.current = url;
        setResult(url);
        setResultBlob(saved.blobs[0]);
        setSavedMeta({ timestamp: saved.timestamp, sourceName: saved.sourceName });
      }
    })();
  }, []);

  useStagedSource(async (blob, item) => {
    const file = new File([blob], item.name || `from-${item.sourceTool}.png`, {
      type: blob.type || "image/png",
    });
    await handleFile(file);
  });

  useEffect(() => {
    return () => {
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    };
  }, []);

  function updateSettings(next: Partial<DyptSettings>) {
    setSettings((s) => {
      const merged = normalizeDyptSettings({ ...s, ...next });
      window.localStorage.setItem(DYPT_SETTINGS_KEY, JSON.stringify(merged));
      return merged;
    });
  }

  async function handleFile(file: File) {
    setError("");
    try {
      const shrunk = await shrinkImageForUpload(file, { maxDim: 1536, mime: "image/jpeg", quality: 0.92 });
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
      const blob = await (await fetch(shrunk.dataUrl)).blob();
      const url = URL.createObjectURL(blob);
      sourceUrlRef.current = url;
      sourceDataUrlRef.current = shrunk.dataUrl;
      setSource({ url, name: file.name, width: shrunk.width, height: shrunk.height });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gat ekki opnað myndina.");
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDrag(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  async function run() {
    if (!source || !sourceDataUrlRef.current) {
      setError("Veldu mynd fyrst.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const blobs = await generateDepthMap(settings, sourceDataUrlRef.current);
      if (!blobs[0]) throw new Error("Engin úttaksmynd barst.");
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
      const url = URL.createObjectURL(blobs[0]);
      resultUrlRef.current = url;
      setResult(url);
      setResultBlob(blobs[0]);
      const now = Date.now();
      setSavedMeta({ timestamp: now, sourceName: source.name });
      void saveResult({
        key: SAVED_KEY,
        timestamp: now,
        mediaType: "image",
        blobs: [blobs[0]],
        prompt: `Depth map úr ${source.name}`,
        mode: settings.encoder,
        sourceName: source.name,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dýpt mistókst.");
    } finally {
      setBusy(false);
    }
  }

  async function clearSavedResults() {
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    resultUrlRef.current = "";
    setResult("");
    setResultBlob(null);
    setSavedMeta(null);
    await clearResult(SAVED_KEY);
  }

  if (!ready) {
    return (
      <StationChrome tool="artcraft">
        <div className="ac-hub">
          <p className="ac-lead">Hleð Dýpt…</p>
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
            {" · Dýpt"}
          </p>
          <h1>Dýpt</h1>
          <p className="ac-lead">
            Depth Anything (DINOv2-DPT) á Replicate: tekur mynd og skilar grátóna
            dýptarkorti — hvítt er nálægt myndavélinni, svart er fjarlægt. Nothæft
            fyrir fókus-trikk (unsharp á bakgrunni, skarpt mótíf), parallax í
            hreyfimynd, depth-aware endurlýsingu, eða bara til að skilja hvað er
            á hvaða lagi í myndinni.
          </p>

          <section className="ac-panel">
            <h2>Mynd</h2>
            {!source ? (
              <div
                className={`ac-drop ${drag ? "on" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDrag(true);
                }}
                onDragLeave={() => setDrag(false)}
                onDrop={onDrop}
                onClick={() => inputRef.current?.click()}
              >
                <p>Dragðu mynd hingað eða smelltu til að velja.</p>
                <p className="ac-hint">JPEG, PNG eða WebP — allt að 1536px lengsta hliðin.</p>
                <input
                  ref={inputRef}
                  type="file"
                  accept={PHOTO_ACCEPT}
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleFile(f);
                  }}
                />
                <div style={{ marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
                  <StagingPicker
                    accepts="image"
                    onPick={async (blob, item) => {
                      const file = new File([blob], item.name || `from-${item.sourceTool}.png`, { type: blob.type || "image/png" });
                      await handleFile(file);
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className="ac-source-row">
                <img src={source.url} alt={source.name} className="ac-source-thumb" />
                <div className="ac-source-meta">
                  <b>{source.name}</b>
                  <span className="ac-hint">
                    {source.width}×{source.height}px
                  </span>
                  <button
                    type="button"
                    className="ac-btn ghost"
                    onClick={() => {
                      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
                      sourceUrlRef.current = "";
                      sourceDataUrlRef.current = "";
                      setSource(null);
                    }}
                  >
                    Önnur mynd
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="ac-panel">
            <h2>Stillingar</h2>
            <div className="ac-settings">
              <label title="Stærð DINOv2 encoder-sins. Small = hraðast en gróft dýptarkort, Large = nákvæmast en lengri tími. Base = milliveg.">
                Encoder-stærð
                <select
                  value={settings.encoder}
                  onChange={(e) => updateSettings({ encoder: e.target.value as DyptEncoder })}
                >
                  {DYPT_ENCODERS.map((e) => (
                    <option key={e} value={e}>
                      {DYPT_ENCODER_LABELS[e]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="ac-hint">
              Small er hraðast en grófara dýptarkort. Large er nákvæmast en tekur
              lengri tíma. Base er milliveg. Allir eru Apache-2.0, commercial-safe.
            </p>

            {error && <p className="ac-error">{error}</p>}
            <div className="ac-row">
              <button type="button" className="ac-btn" onClick={() => void run()} disabled={busy || !source}>
                {busy ? "Reiknar dýpt…" : "Reikna dýptarkort"}
              </button>
              <button
                type="button"
                className="ac-btn ghost"
                title="Núllstillir aftur í grunngildi (Large encoder)."
                onClick={() => {
                  setSettings(DEFAULT_DYPT_SETTINGS);
                  try {
                    window.localStorage.setItem(
                      DYPT_SETTINGS_KEY,
                      JSON.stringify(DEFAULT_DYPT_SETTINGS),
                    );
                  } catch {
                    /* ignore */
                  }
                }}
              >
                Grunngildi
              </button>
            </div>
          </section>

          {result && (
            <section className="ac-panel">
              <h2>Dýptarkort</h2>
              {savedMeta && (
                <p className="ac-hint">
                  Vistað {formatSavedTime(savedMeta.timestamp)}
                  {savedMeta.sourceName ? ` · úr „${savedMeta.sourceName}"` : ""}
                </p>
              )}
              <ImageZoom src={result} alt="Dýptarkort" />
              <div className="ac-row">
                <button
                  type="button"
                  className="ac-btn ghost"
                  onClick={() => downloadBlob(result, `dypt-${source?.name || "mynd"}.png`)}
                >
                  Sækja dýptarkort
                </button>
                {resultBlob && (
                  <SendTo
                    blob={resultBlob}
                    mediaType="image"
                    sourceTool="dypt"
                    sourceToolName="Dýpt"
                    name={`dypt-${source?.name || "mynd"}.png`}
                    prompt={savedMeta?.sourceName ? `Depth map úr ${savedMeta.sourceName}` : undefined}
                  />
                )}
                <button type="button" className="ac-btn ghost" onClick={() => void clearSavedResults()}>
                  Hreinsa vistað
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
    </StationChrome>
  );
}
