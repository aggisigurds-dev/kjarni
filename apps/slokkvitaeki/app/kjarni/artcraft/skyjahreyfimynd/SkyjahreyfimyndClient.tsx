"use client";

import { useEffect, useRef, useState } from "react";
import { StationChrome } from "../../StationChrome";
import { artcraftHubHref, artcraftToolsHref } from "../apps";
import "../artcraft.css";
import { shrinkImageForUpload } from "../replicateImage";
import { useStagedSource } from "../useStagedSource";
import { clearPending, loadPending, savePending } from "../pendingPredictions";
import {
  PromptSlots,
  readStoredPromptSlots,
  type PromptSlotData,
} from "../PromptSlots";
import { formatEta } from "../replicateProgress";
import { clearResult, formatSavedTime, loadResult, saveResult } from "../savedResults";
import {
  DEFAULT_KLING_SETTINGS,
  generateKlingVideo,
  KLING_ASPECT_RATIOS,
  KLING_DURATIONS,
  KLING_SETTINGS_KEY,
  normalizeKlingSettings,
  readStoredKlingSettings,
  resumeKling,
  type KlingSettings,
} from "./kling";
import {
  DEFAULT_WAN_SETTINGS,
  generateWanVideo,
  normalizeWanSettings,
  readStoredWanSettings,
  resumeWanVideo,
  WAN_ASPECT_RATIOS,
  WAN_RESOLUTIONS,
  WAN_SETTINGS_KEY,
  type WanSettings,
} from "./wan";

const WAN_PROMPT_SLOTS_KEY = "kjarni_private_skyjahreyfimynd_wan_prompt_slots";
const KLING_PROMPT_SLOTS_KEY = "kjarni_private_skyjahreyfimynd_kling_prompt_slots";

const SAVED_KEY = "skyjahreyfimynd";

type VideoModel = "wan" | "kling";

const VIDEO_MODELS: Array<{ id: VideoModel; label: string; hint: string }> = [
  { id: "wan", label: "Wan 2.2", hint: "Opin, ódýrt (~$0.05), hratt (~30s). Fín fyrir dagleg tilraunir." },
  {
    id: "kling",
    label: "Kling 2.1",
    hint: "Premium cinematic gæði (~$0.28, 1–3 mín). Fyrir lykilsenur í Facebook-auglýsingum. Enginn disable_safety_checker togglinn — Kuaishou-filter er server-side.",
  },
];

const MODEL_KEY = "kjarni_private_skyjahreyfimynd_model";

function readStoredModel(): VideoModel {
  if (typeof window === "undefined") return "wan";
  return window.localStorage.getItem(MODEL_KEY) === "kling" ? "kling" : "wan";
}

const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";

function downloadBlob(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
}

export default function SkyjahreyfimyndClient() {
  const [ready, setReady] = useState(false);
  const [model, setModel] = useState<VideoModel>("wan");
  const [settings, setSettings] = useState<WanSettings>(DEFAULT_WAN_SETTINGS);
  const [kling, setKling] = useState<KlingSettings>(DEFAULT_KLING_SETTINGS);
  const [wanSlots, setWanSlots] = useState<PromptSlotData>({
    slots: [DEFAULT_WAN_SETTINGS.prompt, "", ""],
    active: 0,
  });
  const [klingSlots, setKlingSlots] = useState<PromptSlotData>({
    slots: [DEFAULT_KLING_SETTINGS.prompt, "", ""],
    active: 0,
  });
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
  const [source, setSource] = useState<{ url: string; name: string } | null>(null);
  const [result, setResult] = useState<string>("");
  const [savedMeta, setSavedMeta] = useState<{ timestamp: number; prompt?: string } | null>(null);
  const resultUrlRef = useRef<string>("");
  const sourceUrlRef = useRef<string>("");
  const sourceDataUrlRef = useRef<string>("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  useEffect(() => {
    const storedWan = readStoredWanSettings();
    const storedKling = readStoredKlingSettings();
    setSettings(storedWan);
    setKling(storedKling);
    setWanSlots(readStoredPromptSlots(WAN_PROMPT_SLOTS_KEY, storedWan.prompt));
    setKlingSlots(readStoredPromptSlots(KLING_PROMPT_SLOTS_KEY, storedKling.prompt));
    setModel(readStoredModel());
    setReady(true);
    void (async () => {
      const saved = await loadResult(SAVED_KEY);
      if (saved) {
        if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
        const url = URL.createObjectURL(saved.blobs[0]);
        resultUrlRef.current = url;
        setResult(url);
        setSavedMeta({ timestamp: saved.timestamp, prompt: saved.prompt });
      }
      // Resuma pending prediction ef eitthvað var í vinnslu þegar user
      // skipti um tab eða endurræsti vafra. Resume-ar með sama líkani og
      // var sent inn (geymt í pending.mode).
      const pending = await loadPending(SAVED_KEY);
      if (pending) {
        setBusy(true);
        setError("");
        setProgress({ status: "ræsing úr vistun", elapsed: 0 });
        try {
          const resumeFn = pending.mode === "kling" ? resumeKling : resumeWanVideo;
          const blob = await resumeFn(pending.predictionId, pending.submittedAt, {
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
          const now = Date.now();
          setSavedMeta({ timestamp: now, prompt: pending.prompt });
          void saveResult({
            key: SAVED_KEY,
            timestamp: now,
            mediaType: "video",
            blobs: [blob],
            prompt: pending.prompt,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Resume mistókst";
          setError(msg.replace(/^LOCAL_TIMEOUT:\s*/, ""));
          // Hreinsa pending AÐEINS ef Replicate confirmaði failure/canceled
          // (meaning: ekki LOCAL_TIMEOUT og ekki transient network error).
          // Transient errors og page-reloads þurfa pending til að geta reynt
          // aftur næst þegar user hleður síðunni.
          const isRecoverable = msg.startsWith("LOCAL_TIMEOUT:") || /^(Failed to fetch|NetworkError|TypeError:)/i.test(msg);
          if (!isRecoverable) await clearPending(SAVED_KEY);
        } finally {
          setBusy(false);
          setProgress(null);
        }
      }
    })();
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

  function updateKling(next: Partial<KlingSettings>) {
    setKling((s) => {
      const merged = normalizeKlingSettings({ ...s, ...next });
      window.localStorage.setItem(KLING_SETTINGS_KEY, JSON.stringify(merged));
      return merged;
    });
  }

  function updateWanSlots(next: PromptSlotData) {
    setWanSlots(next);
    window.localStorage.setItem(WAN_PROMPT_SLOTS_KEY, JSON.stringify(next));
  }

  function updateKlingSlots(next: PromptSlotData) {
    setKlingSlots(next);
    window.localStorage.setItem(KLING_PROMPT_SLOTS_KEY, JSON.stringify(next));
  }

  function selectModel(next: VideoModel) {
    setModel(next);
    window.localStorage.setItem(MODEL_KEY, next);
    setError("");
  }

  useStagedSource(async (blob, item) => {
    const file = new File([blob], item.name || `from-${item.sourceTool}.png`, {
      type: blob.type || "image/png",
    });
    await addFile(file);
  });

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
    setProgress({ status: "starting", elapsed: 0 });
    const activePrompt =
      model === "kling" ? klingSlots.slots[klingSlots.active] : wanSlots.slots[wanSlots.active];
    if (!activePrompt.trim()) {
      setBusy(false);
      setProgress(null);
      setError("Virka prompt-ið er tómt — tappaðu á það og skrifaðu lýsingu fyrst.");
      return;
    }
    const wanWithPrompt: WanSettings = { ...settings, prompt: activePrompt };
    const klingWithPrompt: KlingSettings = { ...kling, prompt: activePrompt };
    const statusCallback = (p: {
      status: string;
      elapsedSeconds: number;
      percent?: number;
      current?: number;
      total?: number;
      etaSeconds?: number;
      logTail?: string;
    }) =>
      setProgress({
        status: p.status,
        elapsed: p.elapsedSeconds,
        percent: p.percent,
        current: p.current,
        total: p.total,
        etaSeconds: p.etaSeconds,
        logTail: p.logTail,
      });
    const onPredictionId = (id: string) => {
      void savePending({
        key: SAVED_KEY,
        predictionId: id,
        submittedAt: Date.now(),
        prompt: activePrompt,
        mode: model, // notum þetta í resume til að velja rétta pollara
        sourceName: source.name,
      });
    };
    try {
      const blob =
        model === "kling"
          ? await generateKlingVideo(klingWithPrompt, sourceDataUrlRef.current, {
              onStatus: statusCallback,
              onPredictionId,
            })
          : await generateWanVideo(wanWithPrompt, sourceDataUrlRef.current, {
              onStatus: statusCallback,
              onPredictionId,
            });
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
      const url = URL.createObjectURL(blob);
      resultUrlRef.current = url;
      setResult(url);
      const now = Date.now();
      setSavedMeta({ timestamp: now, prompt: activePrompt });
      void saveResult({
        key: SAVED_KEY,
        timestamp: now,
        mediaType: "video",
        blobs: [blob],
        prompt: activePrompt,
        mode: model,
        sourceName: source.name,
      });
      await clearPending(SAVED_KEY);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Skýjahreyfimynd mistókst.";
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
    setSavedMeta(null);
    await clearResult(SAVED_KEY);
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
            Mynd → myndband í skýinu (Replicate). Veldu Wan 2.2 fyrir hratt og ódýrt, eða Kling 2.1
            fyrir cinematic gæði. Vilt þú frekar ókeypis og staðbundið: sjá Hreyfimynd (Wan 2.1
            gegnum þitt eigið ComfyUI).
          </p>

          <section className="ac-panel">
            <h2>Líkan</h2>
            <div className="ac-modes" role="radiogroup">
              {VIDEO_MODELS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={model === m.id}
                  className={model === m.id ? "on" : undefined}
                  onClick={() => selectModel(m.id)}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p className="ac-hint">{VIDEO_MODELS.find((m) => m.id === model)?.hint}</p>
          </section>

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
            {model === "kling" ? (
              <>
                <PromptSlots
                  label="Hvað gerist í myndbandinu? (3 slots — tappaðu á textann til að breyta, + til að velja virkt)"
                  data={klingSlots}
                  onChange={updateKlingSlots}
                  rows={3}
                  placeholder="cinematic motion, subtle camera push-in…"
                />
                <label>
                  Neikvæð lýsing (má sleppa)
                  <textarea
                    value={kling.negativePrompt}
                    onChange={(e) => updateKling({ negativePrompt: e.target.value })}
                    rows={2}
                  />
                </label>
                <div className="ac-settings">
                  <label>
                    Lengd
                    <select
                      value={kling.duration}
                      onChange={(e) => updateKling({ duration: Number(e.target.value) as KlingSettings["duration"] })}
                    >
                      {KLING_DURATIONS.map((d) => (
                        <option key={d} value={d}>
                          {d}s
                        </option>
                      ))}
                    </select>
                    <small className="ac-rec">mælt: 5s (ódýrara, nóg fyrir flestar auglýsingar); 10s fyrir lykilsenur</small>
                  </label>
                  <label>
                    Hlutfall
                    <select
                      value={kling.aspectRatio}
                      onChange={(e) =>
                        updateKling({ aspectRatio: e.target.value as KlingSettings["aspectRatio"] })
                      }
                    >
                      {KLING_ASPECT_RATIOS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <small className="ac-rec">mælt: 16:9 (lárétt — video); 9:16 fyrir Reels/TikTok; 1:1 fyrir Instagram</small>
                  </label>
                  <label>
                    CFG scale ({kling.cfgScale.toFixed(2)})
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={kling.cfgScale}
                      onChange={(e) => updateKling({ cfgScale: Number(e.target.value) })}
                    />
                    <small className="ac-rec">mælt: 0.50 (jafnvægi); 0.7+ fylgir prompt stíft en meira plasticky</small>
                  </label>
                </div>
                <p className="ac-hint">
                  Kling exposar ekki disable_safety_checker í schema — Kuaishou-filter er server-side.
                  Ef þú vilt engan filter er Wan 2.2 eina leiðin hér.
                </p>
              </>
            ) : (
              <>
            <PromptSlots
              label="Hvað gerist í myndbandinu? (3 slots — tappaðu á textann til að breyta, + til að velja virkt)"
              data={wanSlots}
              onChange={updateWanSlots}
              rows={3}
              placeholder="cinematic motion, subtle camera push-in…"
            />
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
                <small className="ac-rec">mælt: 81 (~5s á 16fps — ódýrast); 129 fyrir lengri klip</small>
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
                <small className="ac-rec">mælt: 16 (Wan native); 24 fyrir mýkra playback (styttra klip þó)</small>
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
                <small className="ac-rec">mælt: 720p (nýr default; ~4× fleiri pixlar og 2× kostnaður en 480p — betri gæði en pastúni-stærðir)</small>
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
                <small className="ac-rec">mælt: 16:9 (lárétt — video); 9:16 fyrir Reels/TikTok; 1:1 fyrir Instagram</small>
              </label>
              <label>
                Seed ({settings.seed === -1 ? "slembið" : settings.seed})
                <input
                  type="number"
                  value={settings.seed}
                  onChange={(e) => updateSettings({ seed: Number(e.target.value) })}
                />
                <small className="ac-rec">mælt: -1 (slembið; nota fasta tölu til að endurtaka)</small>
              </label>
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={settings.disableSafetyChecker}
                onChange={(e) => updateSettings({ disableSafetyChecker: e.target.checked })}
              />
              Slökkva á öryggissíu (disable_safety_checker)
              <small className="ac-rec" style={{ marginLeft: 8 }}>mælt: ON (Kjarni-reglur: aðeins CSAM blokkað)</small>
            </label>
            <p className="ac-hint">
              Skjalfest Replicate-breyta hjá wan-video/wan-2.2-i2v-fast — sjálfgefið á. Þú berð ábyrgð á
              notkuninni þegar slökkt er á síunni.
            </p>
              </>
            )}

            {error && <p className="ac-error">{error}</p>}
            {busy && progress && (
              <>
                <p className="ac-hint">
                  {typeof progress.percent === "number"
                    ? `${progress.percent}%${progress.current != null && progress.total != null ? ` · rammi ${progress.current}/${progress.total}` : ""}${progress.etaSeconds ? ` · ~${formatEta(progress.etaSeconds)} eftir` : ""}`
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
              {busy ? "Teikna myndband…" : "Teikna myndband"}
            </button>
          </section>

          {result && (
            <section className="ac-panel">
              <h2>Útkoma</h2>
              {savedMeta && (
                <p className="ac-hint">
                  Vistað {formatSavedTime(savedMeta.timestamp)}
                  {savedMeta.prompt ? ` · „${savedMeta.prompt.slice(0, 80)}${savedMeta.prompt.length > 80 ? "…" : ""}"` : ""}
                </p>
              )}
              <video src={result} controls autoPlay loop muted style={{ maxWidth: "100%", borderRadius: 8 }} />
              <div className="ac-row">
                <button
                  type="button"
                  className="ac-btn ghost"
                  onClick={() => downloadBlob(result, `skyjahreyfimynd-${source?.name?.replace(/\.[^.]+$/, "") || "myndband"}.mp4`)}
                >
                  Sækja myndband
                </button>
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
