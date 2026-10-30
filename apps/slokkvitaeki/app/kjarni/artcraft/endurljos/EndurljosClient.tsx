"use client";

import { useEffect, useRef, useState } from "react";
import { StationChrome } from "../../StationChrome";
import { artcraftHubHref, artcraftToolsHref } from "../apps";
import "../artcraft.css";
import ImageZoom from "../ImageZoom";
import { PromptSlots, readStoredPromptSlots, type PromptSlotData } from "../PromptSlots";
import SendTo from "../SendTo";
import StagingPicker from "../StagingPicker";
import VerkhringirHint from "../VerkhringirHint";
import { shrinkImageForUpload } from "../replicateImage";
import { clearResult, formatSavedTime, loadResult, saveResult } from "../savedResults";
import { useStagedSource } from "../useStagedSource";
import {
  DEFAULT_ENDURLJOS_SETTINGS,
  ENDURLJOS_OUTPUT_FORMATS,
  ENDURLJOS_SETTINGS_KEY,
  LIGHT_SOURCES,
  LIGHT_SOURCE_LABELS,
  normalizeEndurljosSettings,
  readStoredEndurljosSettings,
  relightImage,
  type EndurljosOutputFormat,
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
  const [resultBlobs, setResultBlobs] = useState<Blob[]>([]);
  const [savedMeta, setSavedMeta] = useState<{ timestamp: number; prompt?: string } | null>(null);
  const sourceUrlRef = useRef<string>("");
  const sourceDataUrlRef = useRef<string>("");
  const resultUrlsRef = useRef<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  useStagedSource(async (blob, item) => {
    const file = new File([blob], item.name || `from-${item.sourceTool}.png`, {
      type: blob.type || "image/png",
    });
    await handleFile(file);
  });

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
        setResultBlobs(saved.blobs);
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
      setResultBlobs(blobs);
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
    setResultBlobs([]);
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
            <h2>Lýsing á ljósinu</h2>
            <PromptSlots
              label="Nýtt ljós"
              data={slots}
              onChange={updateSlots}
              rows={3}
              placeholder="t.d. soft studio key light, warm rim, deep shadows, cinematic"
            />
            <div className="ac-settings">
              <label title="Ur hvada att nyja ljosid kemur. Engin stefna letur modelid sjalft velja.">
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
                <small className="ac-rec">mælt: Vinstri (klassísk Rembrandt-lýsing á andlit)</small>
              </label>
              <label title="Hversu margar útgáfur af myndinni á að búa til í einni keyrslu. Hvert útkoma kostar peninga.">
                Fjöldi mynda ({settings.numResults})
                <input
                  type="range"
                  min={1}
                  max={4}
                  step={1}
                  value={settings.numResults}
                  onChange={(e) => updateSettings({ numResults: Number(e.target.value) })}
                />
                <small className="ac-rec">mælt: 1 (hækkaðu ef þú vilt bera saman afbrigði)</small>
              </label>
              <label title="Slembikjarni. Sama tala + sömu stillingar = sama útkoma. Settu -1 fyrir slembna útkomu í hvert sinn.">
                Seed (-1 = slembið)
                <input
                  type="number"
                  value={settings.seed}
                  onChange={(e) => updateSettings({ seed: Number(e.target.value) || -1 })}
                />
                <small className="ac-rec">mælt: -1 (slembið; nota fasta tölu til að endurtaka)</small>
              </label>
              <label title="Hversu mikið módelið má endurteikna upprunalegu myndina. 0.7 heldur andliti og lit. Undir 0.6 brotnar IC-Light og gefur svarthvíta mynd — slíderinn stöðvast því við 0.6.">
                Varanákvæmni ({settings.lowresDenoise.toFixed(2)}) — lágt = trú andliti
                <input
                  type="range"
                  min={0.6}
                  max={1}
                  step={0.05}
                  value={settings.lowresDenoise}
                  onChange={(e) => updateSettings({ lowresDenoise: Number(e.target.value) })}
                />
                <small className="ac-rec">mælt: 0.70 (heldur andliti; 0.80+ gefur meira drama en breytir meira)</small>
              </label>
              <label title="Hversu mikið má breyta myndinni í highres-pass. 0.3 heldur andliti nánar, 0.5+ gefur meira dramatíska lýsingu en meiri breytingu.">
                Highres-denoise ({settings.highresDenoise.toFixed(2)}) — hækka fyrir meira drama
                <input
                  type="range"
                  min={0.2}
                  max={0.8}
                  step={0.05}
                  value={settings.highresDenoise}
                  onChange={(e) => updateSettings({ highresDenoise: Number(e.target.value) })}
                />
                <small className="ac-rec">mælt: 0.30 (nálægt andliti; 0.50+ = cinematic en breytir meira)</small>
              </label>
              <label title="Hvað endanleg mynd verður margfalt stærri en innri reikningur. 1.5× = hámarks skerpa en lengri tími.">
                Highres-stækkun ({settings.highresScale.toFixed(2)}×)
                <input
                  type="range"
                  min={1}
                  max={1.5}
                  step={0.05}
                  value={settings.highresScale}
                  onChange={(e) => updateSettings({ highresScale: Number(e.target.value) })}
                />
                <small className="ac-rec">mælt: 1.50× (hámarks skerpa)</small>
              </label>
              <label title="Fjöldi diffusion skrefa. Meira = nákvæmari útkoma en lengri tími. 25 er góður meðalvegur.">
                Skref ({settings.steps})
                <input
                  type="range"
                  min={10}
                  max={50}
                  step={1}
                  value={settings.steps}
                  onChange={(e) => updateSettings({ steps: Number(e.target.value) })}
                />
                <small className="ac-rec">mælt: 25 (góður meðalvegur; 35+ fyrir hámarks nákvæmni)</small>
              </label>
              <label title="Classifier-Free Guidance. Hversu stíft módelið fylgir prompt-inu. Lágt (1-3) = frjálsari túlkun, hátt (7+) = fylgir prompt-inu bókstaflega en getur orðið plasticky.">
                CFG ({settings.cfg.toFixed(1)})
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={0.5}
                  value={settings.cfg}
                  onChange={(e) => updateSettings({ cfg: Number(e.target.value) })}
                />
                <small className="ac-rec">mælt: 2.0 (frjálst og náttúrulegt; 5+ fylgir prompt stíft en plasticky)</small>
              </label>
              <label title="PNG = lossless, stærst, fullgæði. WebP = minni skrá, góð gæði. JPG = minnst, góð fyrir vef.">
                Útkomusnið
                <select
                  value={settings.outputFormat}
                  onChange={(e) =>
                    updateSettings({ outputFormat: e.target.value as EndurljosOutputFormat })
                  }
                >
                  {ENDURLJOS_OUTPUT_FORMATS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
                <small className="ac-rec">mælt: PNG (lossless, hámarks gæði — WebP/JPG fyrir vef)</small>
              </label>
              <label title="JPEG/WebP compression quality (1-100). 95 er mjög góð gæði, 80 er minni skrá. PNG hunsar þetta.">
                Gæði ({settings.outputQuality})
                <input
                  type="range"
                  min={60}
                  max={100}
                  step={5}
                  value={settings.outputQuality}
                  onChange={(e) => updateSettings({ outputQuality: Number(e.target.value) })}
                />
                <small className="ac-rec">mælt: 95 (hámarks sýnileg gæði; PNG hunsar þetta)</small>
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
            <label
              style={{ display: "flex", alignItems: "center", gap: 8 }}
              title="A: Halda upprunalegum bakgrunni (notar ic-light-background module, endurlysir ad eins subject-id). AF: Byr til nyjan bakgrunn eftir prompt (venjulegt ic-light)."
            >
              <input
                type="checkbox"
                checked={settings.preserveBackground}
                onChange={(e) => updateSettings({ preserveBackground: e.target.checked })}
              />
              Halda upprunalegum bakgrunni
            </label>
            <label
              style={{ display: "flex", alignItems: "center", gap: 8 }}
              title="A: Keyrir face-swap eftir Endurljós — setur upprunalega andlitid aftur a relit myndina. Pixel-perfect andlit. Tvofaldar kostnad og tima. AF: ekkert face-swap."
            >
              <input
                type="checkbox"
                checked={settings.preserveFace}
                onChange={(e) => updateSettings({ preserveFace: e.target.checked })}
              />
              Varðveita andlit nákvæmlega (face-swap eftir Endurljós, 2x kostnaður)
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
              Slökkva á safety checker (ef módelið styður það)
            </label>

            {error && <p className="ac-error">{error}</p>}
            <div className="ac-row">
              <button type="button" className="ac-btn" onClick={() => void run()} disabled={busy || !source}>
                {busy ? "Endurlýsir…" : "Endurlýsa"}
              </button>
              <button
                type="button"
                className="ac-btn ghost"
                title="Nullstillir allar stillingar aftur i grunngildi: varanakvemni 0.7, highres-denoise 0.3, png q=95."
                onClick={() => {
                  setSettings(DEFAULT_ENDURLJOS_SETTINGS);
                  try {
                    window.localStorage.setItem(
                      ENDURLJOS_SETTINGS_KEY,
                      JSON.stringify(DEFAULT_ENDURLJOS_SETTINGS),
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
                    <ImageZoom src={url} alt={`Endurljós ${i + 1}`} />
                    <div className="ac-row" style={{ gap: 8, marginTop: 8 }}>
                      <button
                        type="button"
                        className="ac-btn ghost"
                        onClick={() => downloadBlob(url, `endurljos-${Date.now()}-${i + 1}.${settings.outputFormat}`)}
                      >
                        Sækja
                      </button>
                      {resultBlobs[i] && (
                        <SendTo
                          blob={resultBlobs[i]}
                          mediaType="image"
                          sourceTool="endurljos"
                          sourceToolName="Endurljós"
                          prompt={savedMeta?.prompt}
                          name={`endurljos-${Date.now()}-${i + 1}.${settings.outputFormat}`}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <VerkhringirHint tool="endurljos" />
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
