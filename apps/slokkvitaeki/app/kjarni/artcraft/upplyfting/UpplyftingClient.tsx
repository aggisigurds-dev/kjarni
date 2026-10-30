"use client";

import { useEffect, useRef, useState } from "react";
import { StationChrome } from "../../StationChrome";
import { artcraftHubHref, artcraftToolsHref } from "../apps";
import "../artcraft.css";
import ImageZoom from "../ImageZoom";
import SendTo from "../SendTo";
import StagingPicker from "../StagingPicker";
import VerkhringirHint from "../VerkhringirHint";
import { clearPending, loadPending, savePending } from "../pendingPredictions";
import { shrinkImageForUpload } from "../replicateImage";
import { formatEta } from "../replicateProgress";
import { clearResult, formatSavedTime, loadResult, saveResult } from "../savedResults";
import { useStagedSource } from "../useStagedSource";
import {
  CLARITY_OUTPUT_FORMATS,
  CLARITY_SCALES,
  CLARITY_SETTINGS_KEY,
  DEFAULT_CLARITY_SETTINGS,
  normalizeClaritySettings,
  readStoredClaritySettings,
  resumeClarity,
  type ClarityOutputFormat,
  type ClarityScale,
  type ClaritySettings,
  upscaleWithClarity,
} from "./clarity";

const SAVED_KEY = "upplyfting";
import {
  DEFAULT_TOPAZ_SETTINGS,
  normalizeTopazSettings,
  readStoredTopazSettings,
  TOPAZ_ENHANCE_MODELS,
  TOPAZ_OUTPUT_FORMATS,
  TOPAZ_SETTINGS_KEY,
  TOPAZ_SUBJECT_DETECTIONS,
  TOPAZ_UPSCALE_FACTORS,
  type TopazSettings,
  upscaleFactorNumber,
  upscaleWithTopaz,
} from "./topaz";

type UpscaleMode = "topaz" | "clarity";

const UPSCALE_MODE_KEY = "kjarni_private_upplyfting_mode";

function readStoredMode(): UpscaleMode {
  if (typeof window === "undefined") return "topaz";
  return window.localStorage.getItem(UPSCALE_MODE_KEY) === "clarity" ? "clarity" : "topaz";
}

const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";

function downloadBlob(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
}

export default function UpplyftingClient() {
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<UpscaleMode>("topaz");
  const [settings, setSettings] = useState<TopazSettings>(DEFAULT_TOPAZ_SETTINGS);
  const [clarity, setClarity] = useState<ClaritySettings>(DEFAULT_CLARITY_SETTINGS);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{
    status: string;
    elapsed: number;
    percent?: number;
    current?: number;
    total?: number;
    etaSeconds?: number;
    logTail?: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [source, setSource] = useState<{ url: string; name: string; width: number; height: number } | null>(null);
  const [result, setResult] = useState<string>("");
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [savedMeta, setSavedMeta] = useState<{ timestamp: number; mode?: string } | null>(null);
  const resultUrlRef = useRef<string>("");
  const sourceUrlRef = useRef<string>("");
  const sourceDataUrlRef = useRef<string>("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  useEffect(() => {
    setSettings(readStoredTopazSettings());
    const storedClarity = readStoredClaritySettings();
    setClarity(storedClarity);
    setMode(readStoredMode());
    setReady(true);
    void (async () => {
      const saved = await loadResult(SAVED_KEY);
      if (saved) {
        if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
        const url = URL.createObjectURL(saved.blobs[0]);
        resultUrlRef.current = url;
        setResult(url);
        setResultBlob(saved.blobs[0]);
        setSavedMeta({ timestamp: saved.timestamp, mode: saved.mode });
      }
      const pending = await loadPending(SAVED_KEY);
      if (pending) {
        setBusy(true);
        setError("");
        setProgress({ status: "ræsing úr vistun", elapsed: 0 });
        try {
          const blob = await resumeClarity(pending.predictionId, pending.submittedAt, {
            onStatus: (p) =>
              setProgress({
                status: p.status,
                elapsed: p.elapsedSeconds,
                percent: p.percent,
                current: p.current,
                total: p.total,
                etaSeconds: p.etaSeconds,
                logTail: p.logTail,
              }),
          });
          if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
          const url = URL.createObjectURL(blob);
          resultUrlRef.current = url;
          setResult(url);
          setResultBlob(blob);
          const now = Date.now();
          setSavedMeta({ timestamp: now, mode: pending.mode });
          void saveResult({
            key: SAVED_KEY,
            timestamp: now,
            mediaType: "image",
            blobs: [blob],
            mode: pending.mode,
            sourceName: pending.sourceName,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Resume mistókst";
          setError(msg.replace(/^LOCAL_TIMEOUT:\s*/, ""));
          const isRecoverable = msg.startsWith("LOCAL_TIMEOUT:") || /^(Failed to fetch|NetworkError|TypeError:)/i.test(msg);
          if (!isRecoverable) await clearPending(SAVED_KEY);
        } finally {
          setBusy(false);
          setProgress(null);
        }
      }
    })();
  }, []);

  function selectMode(next: UpscaleMode) {
    setMode(next);
    window.localStorage.setItem(UPSCALE_MODE_KEY, next);
    setError("");
  }

  useEffect(() => {
    return () => {
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    };
  }, []);

  // ?use=<id> — hleður mynd úr staging þegar notandi smellti "Senda í
  // Upplyftingu" á öðru tóli. Keyrir aðeins einu sinni per mount.
  useStagedSource(async (blob, item) => {
    const file = new File([blob], item.name || `from-${item.sourceTool}.png`, {
      type: blob.type || "image/png",
    });
    await addFile(file);
  });

  function updateSettings(next: Partial<TopazSettings>) {
    setSettings((s) => {
      const merged = normalizeTopazSettings({ ...s, ...next });
      window.localStorage.setItem(TOPAZ_SETTINGS_KEY, JSON.stringify(merged));
      return merged;
    });
  }

  function updateClarity(next: Partial<ClaritySettings>) {
    setClarity((s) => {
      const merged = normalizeClaritySettings({ ...s, ...next });
      window.localStorage.setItem(CLARITY_SETTINGS_KEY, JSON.stringify(merged));
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
      setResultBlob(null);
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
    setProgress(mode === "clarity" ? { status: "starting", elapsed: 0 } : null);
    try {
      const blob =
        mode === "clarity"
          ? await upscaleWithClarity(clarity, sourceDataUrlRef.current, {
              onStatus: (p) =>
                setProgress({
                  status: p.status,
                  elapsed: p.elapsedSeconds,
                  percent: p.percent,
                  current: p.current,
                  total: p.total,
                  etaSeconds: p.etaSeconds,
                  logTail: p.logTail,
                }),
              onPredictionId: (id) => {
                void savePending({
                  key: SAVED_KEY,
                  predictionId: id,
                  submittedAt: Date.now(),
                  mode: "clarity",
                  sourceName: source.name,
                });
              },
            })
          : await upscaleWithTopaz(settings, sourceDataUrlRef.current);
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
      const url = URL.createObjectURL(blob);
      resultUrlRef.current = url;
      setResult(url);
      setResultBlob(blob);
      const now = Date.now();
      const modeLabel = mode === "clarity" ? "clarity" : `topaz/${settings.enhanceModel}`;
      setSavedMeta({ timestamp: now, mode: modeLabel });
      void saveResult({
        key: SAVED_KEY,
        timestamp: now,
        mediaType: "image",
        blobs: [blob],
        mode: modeLabel,
        sourceName: source.name,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upplyfting mistókst.";
      setError(msg.replace(/^LOCAL_TIMEOUT:\s*/, ""));
      const isRecoverable = msg.startsWith("LOCAL_TIMEOUT:") || /^(Failed to fetch|NetworkError|TypeError:)/i.test(msg);
      if (!isRecoverable) await clearPending(SAVED_KEY);
    } finally {
      setBusy(false);
      setProgress(null);
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
          <p className="ac-lead">Hleð Upplyftingu…</p>
        </div>
      </StationChrome>
    );
  }

  const factorNum = mode === "clarity" ? clarity.scaleFactor : upscaleFactorNumber(settings.upscaleFactor);
  const estimatedOutputMp =
    source != null ? ((source.width * factorNum * source.height * factorNum) / 1_000_000).toFixed(1) : null;

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
              <div style={{ marginTop: 8 }}>
                <StagingPicker
                  accepts="image"
                  onPick={async (blob, item) => {
                    const file = new File([blob], item.name || `from-${item.sourceTool}.png`, { type: blob.type || "image/png" });
                    await addFile(file);
                  }}
                />
              </div>
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
                    setResultBlob(null);
                  }}
                >
                  Ný mynd
                </button>
              </div>
            </section>
          )}

          <section className="ac-panel">
            <h2>Líkan</h2>
            <div className="ac-modes" role="radiogroup">
              <button
                type="button"
                role="radio"
                aria-checked={mode === "topaz"}
                className={mode === "topaz" ? "on" : undefined}
                onClick={() => selectMode("topaz")}
              >
                Topaz
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={mode === "clarity"}
                className={mode === "clarity" ? "on" : undefined}
                onClick={() => selectMode("clarity")}
              >
                Clarity Pro
              </button>
            </div>
            <p className="ac-hint">
              {mode === "topaz"
                ? "Topaz Labs — klassískur pixel-upscaler, trú upprunalegri mynd. Enhance-líkön og face enhancement passa sig við hvað er á myndinni."
                : "philz1337x Clarity Pro — creative upscaler sem heldur sjálfsmynd. Creativity: neikvætt = tryggara, jákvætt = meira endursköpuð áferð. Default 3 gefur sýnilega betri áferð án of mikillar túlkunar."}
            </p>
          </section>

          <section className="ac-panel">
            <h2>Stillingar</h2>
            {mode === "clarity" ? (
              <>
                <div className="ac-settings">
                  <label title="Hversu mikið módelið má bæta við nýjum smáatriðum. 0 = tryggt, 5+ = meira dramatískt. -10 til 10.">
                    Creativity ({clarity.creativity.toFixed(1)})
                    <input
                      type="range"
                      min={-10}
                      max={10}
                      step={0.5}
                      value={clarity.creativity}
                      onChange={(e) => updateClarity({ creativity: Number(e.target.value) })}
                    />
                    <small className="ac-rec">mælt: 3 (sýnileg áferð, trú upprunalegu)</small>
                  </label>
                  <label title="Hversu mikið myndin stækkar. Fast enum: 2x, 4x, 8x, 16x. Hámark 64 MP útkoma.">
                    Scale ({clarity.scaleFactor}×
                    {estimatedOutputMp != null ? ` · ~${estimatedOutputMp} MP` : ""})
                    <select
                      value={clarity.scaleFactor}
                      onChange={(e) => updateClarity({ scaleFactor: Number(e.target.value) as ClarityScale })}
                    >
                      {CLARITY_SCALES.map((s) => (
                        <option key={s} value={s}>
                          {s}×
                        </option>
                      ))}
                    </select>
                    <small className="ac-rec">mælt: 2× (4× getur farið yfir 64 MP mörk á stórum myndum)</small>
                  </label>
                  <label title="PNG = lossless (stærri skrá), JPG = 95% quality (minni skrá).">
                    Snið
                    <select
                      value={clarity.outputFormat}
                      onChange={(e) => updateClarity({ outputFormat: e.target.value as ClarityOutputFormat })}
                    >
                      {CLARITY_OUTPUT_FORMATS.map((f) => (
                        <option key={f} value={f}>
                          {f.toUpperCase()}
                        </option>
                      ))}
                    </select>
                    <small className="ac-rec">mælt: PNG (lossless, trúari upprunalegu)</small>
                  </label>
                  <label title="-1 = slembið (nýtt í hvert sinn). Settu fasta tölu til að endurtaka sama útkomu.">
                    Seed ({clarity.seed === -1 ? "slembið" : clarity.seed})
                    <input
                      type="number"
                      value={clarity.seed}
                      onChange={(e) => updateClarity({ seed: Number(e.target.value) })}
                    />
                    <small className="ac-rec">mælt: -1 (slembið; nota fasta tölu bara ef þú vilt endurtaka)</small>
                  </label>
                </div>

                {error && <p className="ac-error">{error}</p>}
                {busy && progress && (
                  <>
                    <p className="ac-hint">
                      {typeof progress.percent === "number"
                        ? `${progress.percent}%${progress.current != null && progress.total != null ? ` · skref ${progress.current}/${progress.total}` : ""}${progress.etaSeconds ? ` · ~${formatEta(progress.etaSeconds)} eftir` : ""}`
                        : `Staða: ${progress.status === "starting" ? "ræsing" : progress.status === "processing" ? "vinnsla" : progress.status}`}
                      {progress.elapsed > 0 ? ` · ${progress.elapsed}s liðnar` : ""}
                      {". Þú getur skipt um tab — vinnslan heldur áfram og vistast þegar hún er tilbúin."}
                    </p>
                    {progress.logTail && typeof progress.percent !== "number" && (
                      <p className="ac-hint" style={{ fontFamily: "monospace", fontSize: 12, opacity: 0.7 }}>
                        {progress.logTail.slice(0, 120)}
                      </p>
                    )}
                  </>
                )}
                <button type="button" className="ac-btn" onClick={() => void run()} disabled={busy || !source}>
                  {busy ? "Upplyfti…" : "Upplyfta mynd"}
                </button>
              </>
            ) : (
              <>
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
                <small className="ac-rec">mælt: Standard V2 (hefðbundnar myndir); Low Resolution V2 fyrir gamalt eða pixelað</small>
              </label>
              <label>
                Stækkun ({settings.upscaleFactor}
                {estimatedOutputMp != null ? ` · ~${estimatedOutputMp} MP` : ""})
                <select
                  value={settings.upscaleFactor}
                  onChange={(e) => updateSettings({ upscaleFactor: e.target.value as TopazSettings["upscaleFactor"] })}
                >
                  {TOPAZ_UPSCALE_FACTORS.map((f) => (
                    <option key={f} value={f}>
                      {f === "None" ? "Enginn (bara enhance)" : f}
                    </option>
                  ))}
                </select>
                <small className="ac-rec">mælt: 2× (örugg stærð); 4× á litlar myndir, None ef þú vilt bara hreinsa áferð</small>
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
                <small className="ac-rec">mælt: None (hraðast); Foreground ef þú vilt verja persónu/vöru fyrir hávaða</small>
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
                <small className="ac-rec">mælt: PNG (lossless) fyrir hámarks gæði; JPG fyrir vefbirtingu</small>
              </label>
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={settings.faceEnhancement}
                onChange={(e) => updateSettings({ faceEnhancement: e.target.checked })}
              />
              Lagfæra andlit (face_enhancement)
              <small className="ac-rec" style={{ marginLeft: 8 }}>mælt: AF nema andlit sé mikilvægt (hættir á plasticky áferð)</small>
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
                  <small className="ac-rec">mælt: 0.00 (hreinsa án að bæta við); 0.3+ gefur plasticky „beauty filter"</small>
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
                  <small className="ac-rec">mælt: 0.80 (sterk lagfæring án of mikillar túlkunar)</small>
                </label>
              </div>
            )}

            {error && <p className="ac-error">{error}</p>}
            <button type="button" className="ac-btn" onClick={() => void run()} disabled={busy || !source}>
              {busy ? "Upplyfti…" : "Upplyfta mynd"}
            </button>
            </>
            )}
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
              {savedMeta && (
                <p className="ac-hint">
                  Vistuð {formatSavedTime(savedMeta.timestamp)}
                  {savedMeta.mode ? ` · ${savedMeta.mode}` : ""}
                </p>
              )}
              <ImageZoom src={result} alt="Upplyft mynd" className="ac-upscale-preview" />
              <p className="ac-hint">Smelltu til að zoom-a. Topaz/Clarity skila oft mjög stórri mynd — forsýningin er skölun, en niðurhal nær fullri upplausn.</p>
              <div className="ac-row">
                <button
                  type="button"
                  className="ac-btn ghost"
                  onClick={() => downloadBlob(result, `upplyft-${source?.name || "mynd"}`)}
                >
                  Sækja mynd
                </button>
                {resultBlob && (
                  <SendTo
                    blob={resultBlob}
                    mediaType="image"
                    sourceTool="upplyfting"
                    sourceToolName="Upplyfting"
                    name={source?.name ? `upplyft-${source.name}` : undefined}
                  />
                )}
                <button type="button" className="ac-btn ghost" onClick={() => void clearSavedResults()}>
                  Hreinsa vistað
                </button>
              </div>
              <VerkhringirHint tool="upplyfting" />
            </section>
          )}
        </div>
      </div>
    </StationChrome>
  );
}
