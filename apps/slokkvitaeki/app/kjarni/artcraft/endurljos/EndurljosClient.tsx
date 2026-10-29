"use client";

import { useEffect, useRef, useState } from "react";
import { StationChrome } from "../../StationChrome";
import { artcraftHubHref, artcraftToolsHref } from "../apps";
import "../artcraft.css";
import { PromptSlots, readStoredPromptSlots, type PromptSlotData } from "../PromptSlots";
import { shrinkImageForUpload } from "../replicateImage";
import { clearResult, formatSavedTime, loadResult, saveResult } from "../savedResults";
import {
  DEFAULT_ENDURLJOS_SETTINGS,
  ENDURLJOS_SETTINGS_KEY,
  LIGHT_SOURCES,
  LIGHT_SOURCE_LABELS,
  normalizeEndurljosSettings,
  readStoredEndurljosSettings,
  relightImage,
  type EndurljosSettings,
  type LightSource,
} from "./model";

const SAVED_KEY = "endurljos";
const PROMPT_SLOTS_KEY = "kjarni_private_endurljos_prompt_slots";
const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";

function downloadBlob(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
}

export default function EndurljosClient() {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<EndurljosSettings>(DEFAULT_ENDURLJOS_SETTINGS);
  const [slots, setSlots] = useState<PromptSlotData>({ slots: ["", "", ""], active: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [source, setSource] = useState<{ url: string; name: string; width: number; height: number } | null>(null);
  const [results, setResults] = useState<string[]>([]);
  const [savedMeta, setSavedMeta] = useState<{ timestamp: number; prompt?: string } | null>(null);
  const sourceUrlRef = useRef<string>("");
  const sourceDataUrlRef = useRef<string>("");
  const resultUrlsRef = useRef<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  useEffect(() => {
    const next = readStoredEndurljosSettings();
    setSettings(next);
    setSlots(readStoredPromptSlots(PROMPT_SLOTS_KEY, next.prompt));
    setReady(true);
    void (async () => {
      const saved = await loadResult(SAVED_KEY);
      if (saved) {
        const urls = saved.blobs.map((b) => URL.createObjectURL(b));
        resultUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
        resultUrlsRef.current = urls;
        setResults(urls);
        setSavedMeta({ timestamp: saved.timestamp, prompt: saved.prompt });
      }
    })();
  }, []);

  useEffect(() => {
    return () => {
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
      resultUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  function updateSettings(next: Partial<EndurljosSettings>) {
    setSettings((s) => {
      const merged = normalizeEndurljosSettings({ ...s, ...next });
      window.localStorage.setItem(ENDURLJOS_SETTINGS_KEY, JSON.stringify(merged));
      return merged;
    });
  }

  function updateSlots(next: PromptSlotData) {
    setSlots(next);
    try {
      window.localStorage.setItem(PROMPT_SLOTS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
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
    const activePrompt = slots.slots[slots.active];
    if (!activePrompt.trim()) {
      setError("Virka prompt-ið er tómt — tappaðu á það og skrifaðu lýsingu fyrst.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const blobs = await relightImage(settings, sourceDataUrlRef.current, activePrompt);
      const urls = blobs.map((b) => URL.createObjectURL(b));
      resultUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      resultUrlsRef.current = urls;
      setResults(urls);
      const now = Date.now();
      setSavedMeta({ timestamp: now, prompt: activePrompt });
      void saveResult({
        key: SAVED_KEY,
        timestamp: now,
        mediaType: "image",
        blobs,
        prompt: activePrompt,
        mode: settings.lightSource,
        sourceName: source.name,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Endurljós mistókst.");
    } finally {
      setBusy(false);
    }
  }

  async function clearSavedResults() {
    resultUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    resultUrlsRef.current = [];
    setResults([]);
    setSavedMeta(null);
    await clearResult(SAVED_KEY);
  }

  if (!ready) {
    return (
      <StationChrome tool="artcraft">
        <div className="ac-hub">
          <p className="ac-lead">Hleð Endurljós…</p>
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
            {" · Endurljós"}
          </p>
          <h1>Endurljós</h1>
          <p className="ac-lead">
            Endurlýsir persónu eða vöru á núverandi mynd (IC-Light á Replicate). Depth-aware
            að innan — sér formið og dreifir ljósinu rétt í kringum það. Lýstu nýju ljósinu
            í texta („soft studio key, warm rim, moody") og veldu úr hvaða átt það kemur.
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
            <h2>Lýsing á ljósinu</h2>
            <PromptSlots
              label="Nýtt ljós"
              data={slots}
              onChange={updateSlots}
              rows={3}
              placeholder="t.d. soft studio key light, warm rim, deep shadows, cinematic"
            />
            <div className="ac-settings">
              <label>
                Stefna
                <select
                  value={settings.lightSource}
                  onChange={(e) => updateSettings({ lightSource: e.target.value as LightSource })}
                >
                  {LIGHT_SOURCES.map((ls) => (
                    <option key={ls} value={ls}>
                      {LIGHT_SOURCE_LABELS[ls]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Fjöldi mynda ({settings.numResults})
                <input
                  type="range"
                  min={1}
                  max={4}
                  step={1}
                  value={settings.numResults}
                  onChange={(e) => updateSettings({ numResults: Number(e.target.value) })}
                />
              </label>
              <label>
                Seed (-1 = slembið)
                <input
                  type="number"
                  value={settings.seed}
                  onChange={(e) => updateSettings({ seed: Number(e.target.value) || -1 })}
                />
              </label>
            </div>
            <label>
              Neikvætt prompt
              <textarea
                rows={2}
                value={settings.negativePrompt}
                onChange={(e) => updateSettings({ negativePrompt: e.target.value })}
                placeholder="lowres, bad anatomy, blurry, …"
              />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={settings.disableSafetyChecker}
                onChange={(e) => updateSettings({ disableSafetyChecker: e.target.checked })}
              />
              Slökkva á safety checker (ef módelið styður það)
            </label>

            {error && <p className="ac-error">{error}</p>}
            <button type="button" className="ac-btn" onClick={() => void run()} disabled={busy || !source}>
              {busy ? "Endurlýsir…" : "Endurlýsa"}
            </button>
          </section>

          {results.length > 0 && (
            <section className="ac-panel">
              <h2>Útkoma</h2>
              {savedMeta && (
                <p className="ac-hint">
                  Vistað {formatSavedTime(savedMeta.timestamp)}
                  {savedMeta.prompt
                    ? ` · „${savedMeta.prompt.slice(0, 80)}${savedMeta.prompt.length > 80 ? "…" : ""}“`
                    : ""}
                </p>
              )}
              <div className="ac-grid">
                {results.map((url, i) => (
                  <div key={url} className="ac-card">
                    <img src={url} alt={`Endurljós ${i + 1}`} style={{ width: "100%", borderRadius: 8 }} />
                    <button
                      type="button"
                      className="ac-btn ghost"
                      onClick={() => downloadBlob(url, `endurljos-${Date.now()}-${i + 1}.webp`)}
                    >
                      Sækja
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" className="ac-btn ghost" onClick={() => void clearSavedResults()}>
                Hreinsa vistað
              </button>
            </section>
          )}
        </div>
      </div>
    </StationChrome>
  );
}
