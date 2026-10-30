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
import VerkhringirHint from "../VerkhringirHint";
import { useStagedSource } from "../useStagedSource";
import {
  colorizeImage,
  DEFAULT_LITUN_SETTINGS,
  LITUN_MODEL_SIZE_LABELS,
  LITUN_MODEL_SIZES,
  LITUN_SETTINGS_KEY,
  normalizeLitunSettings,
  readStoredLitunSettings,
  type LitunModelSize,
  type LitunSettings,
} from "./model";

const SAVED_KEY = "litun";
const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";

function downloadBlob(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
}

export default function LitunClient() {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<LitunSettings>(DEFAULT_LITUN_SETTINGS);
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
    setSettings(readStoredLitunSettings());
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

  function updateSettings(next: Partial<LitunSettings>) {
    setSettings((s) => {
      const merged = normalizeLitunSettings({ ...s, ...next });
      window.localStorage.setItem(LITUN_SETTINGS_KEY, JSON.stringify(merged));
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
      const blobs = await colorizeImage(settings, sourceDataUrlRef.current);
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
        prompt: `Litun á ${source.name}`,
        mode: settings.modelSize,
        sourceName: source.name,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Litun mistókst.");
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
          <p className="ac-lead">Hleð Litun…</p>
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
            {" · Litun"}
          </p>
          <h1>Litun</h1>
          <p className="ac-lead">
            DDColor (dual-decoder colorization) á Replicate: tekur svart/hvítt mynd
            og setur raunsæja liti á hana. Nothæft fyrir gamlar skoðunarmyndir,
            archive-ljósmyndir eða svarthvítar vörumyndir sem þarf að endurlita fyrir
            vefinn. Classical ML, enginn safety filter.
          </p>

          <section className="ac-panel">
            <h2>Svarthvít mynd</h2>
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
                <p>Dragðu svarthvíta mynd hingað eða smelltu til að velja.</p>
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
              <label title="Stærð DDColor-líkansins. Large = nákvæmari litir en lengri tími, Tiny = hraðari en gróari litir.">
                Líkanstærð
                <select
                  value={settings.modelSize}
                  onChange={(e) => updateSettings({ modelSize: e.target.value as LitunModelSize })}
                >
                  {LITUN_MODEL_SIZES.map((m) => (
                    <option key={m} value={m}>
                      {LITUN_MODEL_SIZE_LABELS[m]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {error && <p className="ac-error">{error}</p>}
            <div className="ac-row">
              <button type="button" className="ac-btn" onClick={() => void run()} disabled={busy || !source}>
                {busy ? "Litar…" : "Lita myndina"}
              </button>
              <button
                type="button"
                className="ac-btn ghost"
                title="Núllstillir aftur í grunngildi (Large líkan)."
                onClick={() => {
                  setSettings(DEFAULT_LITUN_SETTINGS);
                  try {
                    window.localStorage.setItem(
                      LITUN_SETTINGS_KEY,
                      JSON.stringify(DEFAULT_LITUN_SETTINGS),
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
              <h2>Lituð mynd</h2>
              {savedMeta && (
                <p className="ac-hint">
                  Vistað {formatSavedTime(savedMeta.timestamp)}
                  {savedMeta.sourceName ? ` · úr „${savedMeta.sourceName}"` : ""}
                </p>
              )}
              <ImageZoom src={result} alt="Lituð mynd" />
              <div className="ac-row">
                <button
                  type="button"
                  className="ac-btn ghost"
                  onClick={() => downloadBlob(result, `litun-${source?.name || "mynd"}.png`)}
                >
                  Sækja litaða mynd
                </button>
                {resultBlob && (
                  <SendTo
                    blob={resultBlob}
                    mediaType="image"
                    sourceTool="litun"
                    sourceToolName="Litun"
                    name={`litun-${source?.name || "mynd"}.png`}
                    prompt={savedMeta?.sourceName ? `Litun á ${savedMeta.sourceName}` : undefined}
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
