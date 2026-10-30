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
  ASPECT_RATIO_LABELS,
  ASPECT_RATIOS,
  DEFAULT_INNBLASTUR_SETTINGS,
  generateInnblastur,
  INNBLASTUR_SETTINGS_KEY,
  MEGAPIXEL_LABELS,
  MEGAPIXELS,
  normalizeInnblasturSettings,
  OUTPUT_FORMATS,
  readStoredInnblasturSettings,
  type AspectRatio,
  type InnblasturSettings,
  type Megapixels,
  type OutputFormat,
} from "./model";

const SAVED_KEY = "innblastur";
const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";

function downloadBlob(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
}

export default function InnblasturClient() {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<InnblasturSettings>(DEFAULT_INNBLASTUR_SETTINGS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [source, setSource] = useState<{ url: string; name: string; width: number; height: number } | null>(null);
  const [results, setResults] = useState<string[]>([]);
  const [savedMeta, setSavedMeta] = useState<{ timestamp: number; sourceName?: string } | null>(null);
  const sourceUrlRef = useRef<string>("");
  const sourceDataUrlRef = useRef<string>("");
  const resultUrlsRef = useRef<string[]>([]);
  const resultBlobsRef = useRef<Blob[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  useStagedSource(async (blob, item) => {
    const file = new File([blob], item.name || `from-${item.sourceTool}.png`, {
      type: blob.type || "image/png",
    });
    await handleFile(file);
  });

  useEffect(() => {
    setSettings(readStoredInnblasturSettings());
    setReady(true);
    void (async () => {
      const saved = await loadResult(SAVED_KEY);
      if (saved) {
        const urls = saved.blobs.map((b) => URL.createObjectURL(b));
        resultUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
        resultUrlsRef.current = urls;
        resultBlobsRef.current = saved.blobs;
        setResults(urls);
        setSavedMeta({ timestamp: saved.timestamp, sourceName: saved.sourceName });
      }
    })();
  }, []);

  useEffect(() => {
    return () => {
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
      resultUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  function updateSettings(next: Partial<InnblasturSettings>) {
    setSettings((s) => {
      const merged = normalizeInnblasturSettings({ ...s, ...next });
      window.localStorage.setItem(INNBLASTUR_SETTINGS_KEY, JSON.stringify(merged));
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
      setError("Veldu innblástursmynd fyrst.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const blobs = await generateInnblastur(settings, sourceDataUrlRef.current);
      const urls = blobs.map((b) => URL.createObjectURL(b));
      resultUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      resultUrlsRef.current = urls;
      resultBlobsRef.current = blobs;
      setResults(urls);
      const now = Date.now();
      setSavedMeta({ timestamp: now, sourceName: source.name });
      void saveResult({
        key: SAVED_KEY,
        timestamp: now,
        mediaType: "image",
        blobs,
        prompt: `Flux Redux variations af ${source.name}`,
        mode: settings.aspectRatio,
        sourceName: source.name,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Innblástur mistókst.");
    } finally {
      setBusy(false);
    }
  }

  async function clearSavedResults() {
    resultUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    resultUrlsRef.current = [];
    resultBlobsRef.current = [];
    setResults([]);
    setSavedMeta(null);
    await clearResult(SAVED_KEY);
  }

  if (!ready) {
    return (
      <StationChrome tool="artcraft">
        <div className="ac-hub">
          <p className="ac-lead">Hleð Innblástri…</p>
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
            {" · Innblástur"}
          </p>
          <h1>Innblástur</h1>
          <p className="ac-lead">
            Flux Redux á Replicate: gefðu módelinu eina innblástursmynd (eitt vel heppnað
            skot úr myndatöku, mood-board, listaverk) og það býr til 1–4 nýjar afbrigði með
            svipaðan stíl, lit og samsetningu — ekki afrit, heldur nýjar myndir í sömu
            stemmningu. Opin uppspretta, styður safety-checker toggle.
          </p>

          <section className="ac-panel">
            <h2>Innblástursmynd</h2>
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
              <label title="Hlutfoll endanlegra afbrigda. Match input notar somu hlutfoll og innblastursmyndin.">
                Hlutföll
                <select
                  value={settings.aspectRatio}
                  onChange={(e) => updateSettings({ aspectRatio: e.target.value as AspectRatio })}
                >
                  {ASPECT_RATIOS.map((ar) => (
                    <option key={ar} value={ar}>
                      {ASPECT_RATIO_LABELS[ar]}
                    </option>
                  ))}
                </select>
                <small className="ac-rec">mælt: Sama og innblástur (heldur samsetningunni; veldu annað ef þú vilt reframa)</small>
              </label>
              <label title="Hversu mörg afbrigði á að búa til í einni keyrslu. Hvert kostar peninga.">
                Fjöldi afbrigða ({settings.numOutputs})
                <input
                  type="range"
                  min={1}
                  max={4}
                  step={1}
                  value={settings.numOutputs}
                  onChange={(e) => updateSettings({ numOutputs: Number(e.target.value) })}
                />
                <small className="ac-rec">mælt: 1 (hækkaðu í 2–4 ef þú vilt bera saman afbrigði í einni keyrslu)</small>
              </label>
              <label title="Fjöldi diffusion skrefa. Meira = nákvæmara en lengri tími. 28 er sweet spot fyrir Flux.">
                Skref ({settings.numInferenceSteps})
                <input
                  type="range"
                  min={1}
                  max={50}
                  step={1}
                  value={settings.numInferenceSteps}
                  onChange={(e) => updateSettings({ numInferenceSteps: Number(e.target.value) })}
                />
                <small className="ac-rec">mælt: 28 (sweet spot fyrir Flux; undir 20 lækkar gæði, yfir 40 bætir litlu við)</small>
              </label>
              <label title="Endanleg upplausn. 1 MP = ~1024×1024, 0.25 MP = ~512×512. Hærra = stærri skrá en lengri tími.">
                Upplausn
                <select
                  value={settings.megapixels}
                  onChange={(e) => updateSettings({ megapixels: e.target.value as Megapixels })}
                >
                  {MEGAPIXELS.map((mp) => (
                    <option key={mp} value={mp}>
                      {MEGAPIXEL_LABELS[mp]}
                    </option>
                  ))}
                </select>
                <small className="ac-rec">mælt: 1 MP (full upplausn ~1024×1024); 0.25 MP bara fyrir hraðar prófanir</small>
              </label>
              <label title="PNG = lossless. WebP = minni skrá, góð gæði. JPG = minnst, góð fyrir vef.">
                Output-snið
                <select
                  value={settings.outputFormat}
                  onChange={(e) => updateSettings({ outputFormat: e.target.value as OutputFormat })}
                >
                  {OUTPUT_FORMATS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
                <small className="ac-rec">mælt: PNG (lossless, hámarks gæði — WebP/JPG fyrir vefbirtingu)</small>
              </label>
              <label title="Slembikjarni. Sama tala + sömu stillingar = sama útkoma. Settu -1 fyrir slembna útkomu.">
                Seed (-1 = slembið)
                <input
                  type="number"
                  value={settings.seed}
                  onChange={(e) => updateSettings({ seed: Number(e.target.value) || -1 })}
                />
                <small className="ac-rec">mælt: -1 (slembið; nota fasta tölu til að endurtaka útkomu)</small>
              </label>
            </div>
            <label
              style={{ display: "flex", alignItems: "center", gap: 8 }}
              title="Hraðari keyrsla á kostnað gæða. Fyrir fyrstu prófanir — slökktu fyrir fulla upplausn."
            >
              <input
                type="checkbox"
                checked={settings.goFast}
                onChange={(e) => updateSettings({ goFast: e.target.checked })}
              />
              Go fast (lækkar gæði, hraðari keyrsla)
              <small className="ac-rec" style={{ marginLeft: 8 }}>mælt: AF (gæði mikilvægari en hraði nema fyrir skyndiprófanir)</small>
            </label>
            <label
              style={{ display: "flex", alignItems: "center", gap: 8 }}
              title="Sleppir NSFW-filter módelsins. Kjarni leyfir nekt — aðeins kynferðislegt myndefni af börnum er bannað."
            >
              <input
                type="checkbox"
                checked={settings.disableSafetyChecker}
                onChange={(e) => updateSettings({ disableSafetyChecker: e.target.checked })}
              />
              Slökkva á safety checker
              <small className="ac-rec" style={{ marginLeft: 8 }}>mælt: Á (filter er oft of varkár); AF ef þú veist að þú vilt enga síu</small>
            </label>

            {error && <p className="ac-error">{error}</p>}
            <div className="ac-row">
              <button type="button" className="ac-btn" onClick={() => void run()} disabled={busy || !source}>
                {busy ? "Býr til afbrigði…" : "Búa til afbrigði"}
              </button>
              <button
                type="button"
                className="ac-btn ghost"
                title="Núllstillir allar stillingar aftur í grunngildi."
                onClick={() => {
                  setSettings(DEFAULT_INNBLASTUR_SETTINGS);
                  try {
                    window.localStorage.setItem(
                      INNBLASTUR_SETTINGS_KEY,
                      JSON.stringify(DEFAULT_INNBLASTUR_SETTINGS),
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

          {results.length > 0 && (
            <section className="ac-panel">
              <h2>Afbrigði</h2>
              {savedMeta && (
                <p className="ac-hint">
                  Vistað {formatSavedTime(savedMeta.timestamp)}
                  {savedMeta.sourceName ? ` · úr „${savedMeta.sourceName}“` : ""}
                </p>
              )}
              <div className="ac-grid">
                {results.map((url, i) => {
                  const blob = resultBlobsRef.current[i];
                  return (
                    <div key={url} className="ac-card">
                      <ImageZoom src={url} alt={`Afbrigði ${i + 1}`} />
                      <div className="ac-row" style={{ gap: 8, marginTop: 8 }}>
                        <button
                          type="button"
                          className="ac-btn ghost"
                          onClick={() => downloadBlob(url, `innblastur-${Date.now()}-${i + 1}.${settings.outputFormat}`)}
                        >
                          Sækja
                        </button>
                        {blob && (
                          <SendTo
                            blob={blob}
                            mediaType="image"
                            sourceTool="innblastur"
                            sourceToolName="Innblástur"
                            name={`innblastur-${i + 1}.${settings.outputFormat}`}
                            prompt={source?.name ? `Flux Redux variation af ${source.name}` : undefined}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <VerkhringirHint tool="innblastur" />
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
