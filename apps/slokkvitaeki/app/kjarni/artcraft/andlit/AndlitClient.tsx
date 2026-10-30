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
  ANDLIT_SETTINGS_KEY,
  ASPECT_LABELS,
  ASPECT_PRESETS,
  DEFAULT_ANDLIT_SETTINGS,
  generateAndlit,
  normalizeAndlitSettings,
  readStoredAndlitSettings,
  SDXL_WEIGHTS,
  SDXL_WEIGHTS_LABELS,
  type AndlitSettings,
  type AspectPreset,
  type SdxlWeights,
} from "./model";

const SAVED_KEY = "andlit";
const PROMPT_SLOTS_KEY = "kjarni_private_andlit_prompt_slots";
const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";

type Uploaded = {
  url: string;
  dataUrl: string;
  name: string;
  width: number;
  height: number;
};

function downloadBlob(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
}

export default function AndlitClient() {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<AndlitSettings>(DEFAULT_ANDLIT_SETTINGS);
  const [slots, setSlots] = useState<PromptSlotData>({ slots: ["", "", ""], active: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [face, setFace] = useState<Uploaded | null>(null);
  const [pose, setPose] = useState<Uploaded | null>(null);
  const [results, setResults] = useState<string[]>([]);
  const [resultBlobs, setResultBlobs] = useState<Blob[]>([]);
  const [savedMeta, setSavedMeta] = useState<{ timestamp: number; prompt?: string } | null>(null);
  const faceUrlRef = useRef<string>("");
  const poseUrlRef = useRef<string>("");
  const resultUrlsRef = useRef<string[]>([]);
  const faceInputRef = useRef<HTMLInputElement>(null);
  const poseInputRef = useRef<HTMLInputElement>(null);
  const [faceDrag, setFaceDrag] = useState(false);

  useEffect(() => {
    const next = readStoredAndlitSettings();
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

  useStagedSource(async (blob, item) => {
    const file = new File([blob], item.name || `from-${item.sourceTool}.png`, {
      type: blob.type || "image/png",
    });
    await handleUpload(file, "face");
  });

  useEffect(() => {
    return () => {
      if (faceUrlRef.current) URL.revokeObjectURL(faceUrlRef.current);
      if (poseUrlRef.current) URL.revokeObjectURL(poseUrlRef.current);
      resultUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  function updateSettings(next: Partial<AndlitSettings>) {
    setSettings((s) => {
      const merged = normalizeAndlitSettings({ ...s, ...next });
      window.localStorage.setItem(ANDLIT_SETTINGS_KEY, JSON.stringify(merged));
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

  async function handleUpload(
    file: File,
    kind: "face" | "pose",
  ): Promise<void> {
    setError("");
    try {
      const shrunk = await shrinkImageForUpload(file, {
        maxDim: 1024,
        mime: "image/jpeg",
        quality: 0.92,
      });
      const blob = await (await fetch(shrunk.dataUrl)).blob();
      const url = URL.createObjectURL(blob);
      const uploaded: Uploaded = {
        url,
        dataUrl: shrunk.dataUrl,
        name: file.name,
        width: shrunk.width,
        height: shrunk.height,
      };
      if (kind === "face") {
        if (faceUrlRef.current) URL.revokeObjectURL(faceUrlRef.current);
        faceUrlRef.current = url;
        setFace(uploaded);
      } else {
        if (poseUrlRef.current) URL.revokeObjectURL(poseUrlRef.current);
        poseUrlRef.current = url;
        setPose(uploaded);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gat ekki opnað myndina.");
    }
  }

  function removeUpload(kind: "face" | "pose") {
    if (kind === "face") {
      if (faceUrlRef.current) URL.revokeObjectURL(faceUrlRef.current);
      faceUrlRef.current = "";
      setFace(null);
    } else {
      if (poseUrlRef.current) URL.revokeObjectURL(poseUrlRef.current);
      poseUrlRef.current = "";
      setPose(null);
    }
  }

  async function run() {
    if (!face) {
      setError("Veldu andlitsmynd fyrst.");
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
      const blobs = await generateAndlit(
        settings,
        face.dataUrl,
        activePrompt,
        pose?.dataUrl,
      );
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
        mode: settings.sdxlWeights,
        sourceName: face.name,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Andlit mistókst.");
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
          <p className="ac-lead">Hleð Andliti…</p>
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
            {" · Andlit"}
          </p>
          <h1>Andlit</h1>
          <p className="ac-lead">
            InstantID á Replicate: ein andlitsmynd + lýsing → nýjar myndir þar sem SAMA
            andlitið birtist í nýju umhverfi, stellingu, föt eða stíl. Byggt á SDXL +
            ControlNet með InsightFace embedding, svo auðkennið helst mjög vel. Styður
            disable_safety_checker.
          </p>

          <section className="ac-panel">
            <h2>Andlitsmynd</h2>
            {!face ? (
              <div
                className={`ac-drop ${faceDrag ? "on" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setFaceDrag(true);
                }}
                onDragLeave={() => setFaceDrag(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setFaceDrag(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) void handleUpload(file, "face");
                }}
                onClick={() => faceInputRef.current?.click()}
              >
                <p>Dragðu nærmynd af andliti hingað eða smelltu til að velja.</p>
                <p className="ac-hint">
                  Besta útkoman: skýrt, bein-á andlit, góð lýsing. JPEG/PNG/WebP, allt að 1024px.
                </p>
                <input
                  ref={faceInputRef}
                  type="file"
                  accept={PHOTO_ACCEPT}
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleUpload(f, "face");
                  }}
                />
                <div style={{ marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
                  <StagingPicker
                    accepts="image"
                    onPick={async (blob, item) => {
                      const file = new File([blob], item.name || `from-${item.sourceTool}.png`, { type: blob.type || "image/png" });
                      await handleUpload(file, "face");
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className="ac-source-row">
                <img src={face.url} alt={face.name} className="ac-source-thumb" />
                <div className="ac-source-meta">
                  <b>{face.name}</b>
                  <span className="ac-hint">
                    {face.width}×{face.height}px
                  </span>
                  <button
                    type="button"
                    className="ac-btn ghost"
                    onClick={() => removeUpload("face")}
                  >
                    Önnur mynd
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="ac-panel">
            <h2>Stellingarmynd (valkvætt)</h2>
            <p className="ac-hint">
              Ef þú vilt stýra stellingunni: hlaðið inn mynd af stellingunni (líkamsstaða,
              horn, bakgrunnur). Andlitið frá fyrstu myndinni verður sett á þessa stellingu.
            </p>
            {!pose ? (
              <>
                <button
                  type="button"
                  className="ac-btn ghost"
                  onClick={() => poseInputRef.current?.click()}
                >
                  Hlaða upp stellingarmynd
                </button>
                <input
                  ref={poseInputRef}
                  type="file"
                  accept={PHOTO_ACCEPT}
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleUpload(f, "pose");
                  }}
                />
              </>
            ) : (
              <div className="ac-source-row">
                <img src={pose.url} alt={pose.name} className="ac-source-thumb" />
                <div className="ac-source-meta">
                  <b>{pose.name}</b>
                  <span className="ac-hint">
                    {pose.width}×{pose.height}px
                  </span>
                  <button
                    type="button"
                    className="ac-btn ghost"
                    onClick={() => removeUpload("pose")}
                  >
                    Fjarlægja
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="ac-panel">
            <h2>Lýsing</h2>
            <PromptSlots
              label="Hvað á að gerast í myndinni"
              data={slots}
              onChange={updateSlots}
              rows={3}
              placeholder="t.d. cinematic studio portrait, warm lighting, professional"
            />
            <div className="ac-settings">
              <label title="Hvaða hlutföll endanleg mynd á að hafa. Portrait fyrir fólk, Landscape fyrir vörur eða umhverfi, Square fyrir Instagram.">
                Hlutföll
                <select
                  value={settings.aspect}
                  onChange={(e) => updateSettings({ aspect: e.target.value as AspectPreset })}
                >
                  {ASPECT_PRESETS.map((a) => (
                    <option key={a} value={a}>
                      {ASPECT_LABELS[a]}
                    </option>
                  ))}
                </select>
                <small className="ac-rec">mælt: Portrait (768×1024) fyrir fólk; Landscape fyrir vörur/umhverfi</small>
              </label>
              <label title="SDXL grunnvægi sem módelið teiknar með. RealVis = ljósraunsætt portrait, DreamShaper = listrænt, Juggernaut = fjölhæf. Hver gefur ólíkan stíl á sama prompti.">
                Stíll (SDXL weights)
                <select
                  value={settings.sdxlWeights}
                  onChange={(e) => updateSettings({ sdxlWeights: e.target.value as SdxlWeights })}
                >
                  {SDXL_WEIGHTS.map((w) => (
                    <option key={w} value={w}>
                      {SDXL_WEIGHTS_LABELS[w]}
                    </option>
                  ))}
                </select>
                <small className="ac-rec">mælt: RealVis XL v3 (ljósraunsætt portrett); Juggernaut fyrir fjölhæf, DreamShaper fyrir listrænt</small>
              </label>
              <label title="Hversu stíft andlitið úr innsettu myndinni á að birtast. 0.8 er góður meðalvegur. 1.0+ = nákvæmara andlit en frjálsara útlit á öllu öðru.">
                Andlits-auðkenni ({settings.ipAdapterScale.toFixed(2)})
                <input
                  type="range"
                  min={0}
                  max={1.5}
                  step={0.05}
                  value={settings.ipAdapterScale}
                  onChange={(e) => updateSettings({ ipAdapterScale: Number(e.target.value) })}
                />
                <small className="ac-rec">mælt: 0.80 (sterkt andlit en umhverfi fylgir prompti); 1.0+ gefur nákvæmara andlit</small>
              </label>
              <label title="Hversu stíft valkvæða stellingarmyndin stýrir endanlegri stellingu. Hækkaðu ef þú vilt nákvæmari eftirlíkingu á pose-inu.">
                Stellingarstyrkur ({settings.controlnetConditioningScale.toFixed(2)})
                <input
                  type="range"
                  min={0}
                  max={1.5}
                  step={0.05}
                  value={settings.controlnetConditioningScale}
                  onChange={(e) =>
                    updateSettings({ controlnetConditioningScale: Number(e.target.value) })
                  }
                />
                <small className="ac-rec">mælt: 0.80 (ef stellingarmynd er sett); 0 ef engin stelling</small>
              </label>
              <label title="Hversu margar útgáfur af myndinni á að búa til í einni keyrslu. Hvert útkoma kostar peninga.">
                Fjöldi mynda ({settings.numOutputs})
                <input
                  type="range"
                  min={1}
                  max={4}
                  step={1}
                  value={settings.numOutputs}
                  onChange={(e) => updateSettings({ numOutputs: Number(e.target.value) })}
                />
                <small className="ac-rec">mælt: 1 (hækkaðu ef þú vilt bera saman afbrigði)</small>
              </label>
              <label title="Fjöldi diffusion skrefa. Meira = nákvæmari útkoma en lengri tími. 30 er góður meðalvegur.">
                Skref ({settings.numInferenceSteps})
                <input
                  type="range"
                  min={10}
                  max={60}
                  step={1}
                  value={settings.numInferenceSteps}
                  onChange={(e) => updateSettings({ numInferenceSteps: Number(e.target.value) })}
                />
                <small className="ac-rec">mælt: 30 (góður meðalvegur); 45+ fyrir hámarks nákvæmni</small>
              </label>
              <label title="Classifier-Free Guidance. Hversu stíft módelið fylgir prompt-inu. 5 er góður meðalvegur. Hækkaðu ef útkoman er ekki að fylgja því sem þú skrifaðir.">
                Guidance ({settings.guidanceScale.toFixed(1)})
                <input
                  type="range"
                  min={1}
                  max={15}
                  step={0.5}
                  value={settings.guidanceScale}
                  onChange={(e) => updateSettings({ guidanceScale: Number(e.target.value) })}
                />
                <small className="ac-rec">mælt: 5.0 (góður meðalvegur); 7+ ef útkoman fylgir ekki prompti; 10+ verður plasticky</small>
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
              title="Sleppir NSFW-filter módelsins. Kjarni leyfir nekt — aðeins kynferðislegt myndefni af börnum er bannað."
            >
              <input
                type="checkbox"
                checked={settings.disableSafetyChecker}
                onChange={(e) => updateSettings({ disableSafetyChecker: e.target.checked })}
              />
              Slökkva á safety checker
              <small className="ac-rec" style={{ marginLeft: 8 }}>mælt: AF nema þú lendir á false-positive block (Kjarni leyfir nekt annars)</small>
            </label>

            {error && <p className="ac-error">{error}</p>}
            <div className="ac-row">
              <button type="button" className="ac-btn" onClick={() => void run()} disabled={busy || !face}>
                {busy ? "Býr til…" : "Búa til"}
              </button>
              <button
                type="button"
                className="ac-btn ghost"
                title="Núllstillir allar stillingar aftur í grunngildi."
                onClick={() => {
                  setSettings(DEFAULT_ANDLIT_SETTINGS);
                  try {
                    window.localStorage.setItem(
                      ANDLIT_SETTINGS_KEY,
                      JSON.stringify(DEFAULT_ANDLIT_SETTINGS),
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
                    ? ` · „${savedMeta.prompt.slice(0, 80)}${savedMeta.prompt.length > 80 ? "…" : ""}"`
                    : ""}
                </p>
              )}
              <div className="ac-grid">
                {results.map((url, i) => (
                  <div key={url} className="ac-card">
                    <ImageZoom src={url} alt={`Andlit ${i + 1}`} />
                    <div className="ac-row" style={{ gap: 8, marginTop: 8 }}>
                      <button
                        type="button"
                        className="ac-btn ghost"
                        onClick={() => downloadBlob(url, `andlit-${Date.now()}-${i + 1}.webp`)}
                      >
                        Sækja
                      </button>
                      {resultBlobs[i] && (
                        <SendTo
                          blob={resultBlobs[i]}
                          mediaType="image"
                          sourceTool="andlit"
                          sourceToolName="Andlit"
                          prompt={savedMeta?.prompt}
                          name={`andlit-${i + 1}.png`}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <VerkhringirHint tool="andlit" />
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
