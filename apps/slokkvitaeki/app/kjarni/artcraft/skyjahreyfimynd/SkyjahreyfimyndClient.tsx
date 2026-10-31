"use client";

import { useEffect, useRef, useState } from "react";
import { StationChrome } from "../../StationChrome";
import { artcraftHubHref, artcraftToolsHref } from "../apps";
import "../artcraft.css";
import { shrinkImageForUpload } from "../replicateImage";
import StagingPicker from "../StagingPicker";
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

type Clip = {
  url: string;
  blob: Blob;
  prompt: string;
  timestamp: number;
};

/** Soðja fleiri myndbands-blobs saman í eitt með því að spila þá í röð
 * inn á canvas og taka upp í gegnum MediaRecorder. Takmarkanir: tekur
 * raun-tíma (10s af clips = 10s af upptöku), kóðar á nýtt (örlítill
 * gæðatap vs. bitstream-copy sem er flóknara). Reynir MP4/H.264 fyrst,
 * fellur í WebM þegar vafrinn styður ekki MP4 (t.d. Firefox).
 *
 * `onProgress` lætur vita hvaða bút við erum að taka upp. */
async function stitchClips(
  clips: Array<{ url: string; blob: Blob }>,
  onProgress?: (current: number, total: number) => void,
): Promise<{ blob: Blob; mimeType: string }> {
  if (clips.length === 0) throw new Error("Engir bútar til að soðja.");

  // Lesum stærð úr fyrsta bút — allir bútar í keðjunni ættu að hafa
  // sömu stærð (sama líkan, sama hlutfall).
  const probe = document.createElement("video");
  probe.src = clips[0].url;
  probe.muted = true;
  probe.playsInline = true;
  await new Promise<void>((resolve, reject) => {
    probe.onloadedmetadata = () => resolve();
    probe.onerror = () => reject(new Error("Gat ekki lesið fyrsta bút."));
  });
  const width = probe.videoWidth || 1024;
  const height = probe.videoHeight || 1024;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context óaðgengilegur.");
  const stream = canvas.captureStream(30);

  const candidateTypes = [
    "video/mp4;codecs=avc1.42E01E",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  const mimeType =
    candidateTypes.find((t) => (window as unknown as { MediaRecorder: typeof MediaRecorder }).MediaRecorder.isTypeSupported(t)) ||
    "video/webm";

  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  recorder.start(500);

  for (let i = 0; i < clips.length; i++) {
    onProgress?.(i + 1, clips.length);
    const clip = clips[i];
    const video = document.createElement("video");
    video.src = clip.url;
    video.muted = true;
    video.playsInline = true;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error(`Bútur ${i + 1} hleðst ekki.`));
    });
    try {
      await video.play();
    } catch (err) {
      // Sumir vafrar henda á autoplay — reyna aftur eftir user gesture
      // ætti ekki að gerast því þessi fall er alltaf triggered af click.
      throw err;
    }
    let rafId = 0;
    await new Promise<void>((resolve) => {
      const draw = () => {
        ctx.drawImage(video, 0, 0, width, height);
        if (video.ended || video.paused || video.currentTime >= video.duration - 0.02) {
          cancelAnimationFrame(rafId);
          resolve();
          return;
        }
        rafId = requestAnimationFrame(draw);
      };
      video.onended = () => {
        cancelAnimationFrame(rafId);
        resolve();
      };
      draw();
    });
    video.pause();
    video.src = "";
  }

  recorder.stop();
  await new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  const blob = new Blob(chunks, { type: mimeType });
  return { blob, mimeType };
}

/** Tekur síðasta ramma úr myndbands-blob og skilar sem data-URL (jpeg).
 * Notar off-DOM video + canvas; vafrinn þarf að hafa afkóðað myndbandið
 * (sem er alltaf tilfellið þegar við köllum þetta — blobinn er nýbúinn
 * að spila í result-panel-inu). Við seek-um aðeins fyrir enda til að
 * sleppa við svartan "end of stream" ramma í sumum codec-um. */
async function extractLastFrameDataUrl(blob: Blob): Promise<string> {
  const url = URL.createObjectURL(blob);
  try {
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Gat ekki hlaðið myndband fyrir rammatöku."));
    });
    const seekTo = Math.max(0, (isFinite(video.duration) ? video.duration : 0) - 0.08);
    await new Promise<void>((resolve, reject) => {
      video.onseeked = () => resolve();
      video.onerror = () => reject(new Error("Rammataka mistókst."));
      video.currentTime = seekTo;
    });
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1024;
    canvas.height = video.videoHeight || 1024;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context óaðgengilegur.");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.92);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function SkyjahreyfimyndClient() {
  const [ready, setReady] = useState(false);
  const [model, setModel] = useState<VideoModel>("wan");
  const [settings, setSettings] = useState<WanSettings>(DEFAULT_WAN_SETTINGS);
  const [kling, setKling] = useState<KlingSettings>(DEFAULT_KLING_SETTINGS);
  const [wanSlots, setWanSlots] = useState<PromptSlotData>({
    slots: [DEFAULT_WAN_SETTINGS.prompt, "", "", "", ""],
    active: 0,
  });
  const [klingSlots, setKlingSlots] = useState<PromptSlotData>({
    slots: [DEFAULT_KLING_SETTINGS.prompt, "", "", "", ""],
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
  const [clips, setClips] = useState<Clip[]>([]);
  const [pendingClip, setPendingClip] = useState<Clip | null>(null);
  const [savedMeta, setSavedMeta] = useState<{ timestamp: number; prompt?: string } | null>(null);
  const [mergedClip, setMergedClip] = useState<{ url: string; blob: Blob; mimeType: string; sourceCount: number } | null>(null);
  const [stitching, setStitching] = useState(false);
  const [stitchStatus, setStitchStatus] = useState<{ current: number; total: number } | null>(null);
  const clipsRef = useRef<Clip[]>([]);
  const pendingRef = useRef<Clip | null>(null);
  const mergedRef = useRef<{ url: string } | null>(null);
  const sourceUrlRef = useRef<string>("");
  const sourceDataUrlRef = useRef<string>("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  useEffect(() => {
    clipsRef.current = clips;
  }, [clips]);
  useEffect(() => {
    pendingRef.current = pendingClip;
  }, [pendingClip]);
  useEffect(() => {
    mergedRef.current = mergedClip ? { url: mergedClip.url } : null;
  }, [mergedClip]);

  useEffect(() => {
    const storedWan = readStoredWanSettings();
    const storedKling = readStoredKlingSettings();
    setSettings(storedWan);
    setKling(storedKling);
    setWanSlots(readStoredPromptSlots(WAN_PROMPT_SLOTS_KEY, storedWan.prompt, 5));
    setKlingSlots(readStoredPromptSlots(KLING_PROMPT_SLOTS_KEY, storedKling.prompt, 5));
    setModel(readStoredModel());
    setReady(true);
    void (async () => {
      const saved = await loadResult(SAVED_KEY);
      let loadedClips: Clip[] = [];
      if (saved) {
        loadedClips = saved.blobs.map((blob, i) => ({
          url: URL.createObjectURL(blob),
          blob,
          prompt: saved.prompt ?? "",
          timestamp: saved.timestamp - (saved.blobs.length - 1 - i) * 1000,
        }));
        setClips(loadedClips);
        setSavedMeta({ timestamp: saved.timestamp, prompt: saved.prompt });
      }
      // Resuma pending prediction ef eitthvað var í vinnslu þegar user
      // skipti um tab eða endurræsti vafra. isExtension-fáninn segir okkur
      // hvort útkoman eigi að fara í pendingClip (framlenging) eða verða
      // nýr fyrsti clip.
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
          const url = URL.createObjectURL(blob);
          const now = Date.now();
          const newClip: Clip = {
            url,
            blob,
            prompt: pending.prompt ?? "",
            timestamp: now,
          };
          if (pending.isExtension && loadedClips.length > 0) {
            setPendingClip(newClip);
          } else {
            // Fyrsti clip (eða resume án pre-existing chain) → leysir af
            // chain-inn og vistar.
            loadedClips.forEach((c) => URL.revokeObjectURL(c.url));
            setClips([newClip]);
            setSavedMeta({ timestamp: now, prompt: pending.prompt });
            void saveResult({
              key: SAVED_KEY,
              timestamp: now,
              mediaType: "video",
              blobs: [blob],
              prompt: pending.prompt,
              mode: pending.mode,
              sourceName: pending.sourceName,
            });
          }
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

  useEffect(() => {
    return () => {
      clipsRef.current.forEach((c) => URL.revokeObjectURL(c.url));
      if (pendingRef.current) URL.revokeObjectURL(pendingRef.current.url);
      if (mergedRef.current) URL.revokeObjectURL(mergedRef.current.url);
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
      const shrunk = await shrinkImageForUpload(file, { maxDim: 1024 });
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
      const url = URL.createObjectURL(file);
      sourceUrlRef.current = url;
      sourceDataUrlRef.current = shrunk.dataUrl;
      setSource({ url, name: file.name });
      // Nýr upphafur → hreinsum fyrri keðju svo það sé enginn vafi um
      // hvaðan framhald á að koma.
      clipsRef.current.forEach((c) => URL.revokeObjectURL(c.url));
      if (pendingRef.current) URL.revokeObjectURL(pendingRef.current.url);
      if (mergedRef.current) URL.revokeObjectURL(mergedRef.current.url);
      setClips([]);
      setPendingClip(null);
      setMergedClip(null);
      setSavedMeta(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gat ekki opnað myndina.");
    }
  }

  async function handleStitch() {
    const current = clipsRef.current;
    if (current.length < 2) return;
    setStitching(true);
    setError("");
    setStitchStatus({ current: 0, total: current.length });
    try {
      if (mergedRef.current) URL.revokeObjectURL(mergedRef.current.url);
      setMergedClip(null);
      const { blob, mimeType } = await stitchClips(current, (c, t) =>
        setStitchStatus({ current: c, total: t }),
      );
      const url = URL.createObjectURL(blob);
      setMergedClip({ url, blob, mimeType, sourceCount: current.length });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Soðja saman mistókst.");
    } finally {
      setStitching(false);
      setStitchStatus(null);
    }
  }

  async function run(options?: { extendFrom?: Clip }) {
    const extendFrom = options?.extendFrom;
    const isExtension = !!extendFrom;

    let sourceDataUrl: string;
    let sourceName: string;
    if (isExtension) {
      try {
        setProgress({ status: "sæki síðasta ramma…", elapsed: 0 });
        sourceDataUrl = await extractLastFrameDataUrl(extendFrom.blob);
        sourceName = `framhald-${clipsRef.current.length}`;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Gat ekki tekið síðasta ramma.");
        setProgress(null);
        return;
      }
    } else {
      if (!source) {
        setError("Hladdu upp mynd fyrst.");
        return;
      }
      sourceDataUrl = sourceDataUrlRef.current;
      sourceName = source.name;
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
        mode: model,
        sourceName,
        isExtension,
      });
    };
    try {
      const blob =
        model === "kling"
          ? await generateKlingVideo(klingWithPrompt, sourceDataUrl, {
              onStatus: statusCallback,
              onPredictionId,
            })
          : await generateWanVideo(wanWithPrompt, sourceDataUrl, {
              onStatus: statusCallback,
              onPredictionId,
            });
      const url = URL.createObjectURL(blob);
      const now = Date.now();
      const newClip: Clip = { url, blob, prompt: activePrompt, timestamp: now };
      if (isExtension) {
        // Framhald → bíður eftir samþykki notanda
        if (pendingRef.current) URL.revokeObjectURL(pendingRef.current.url);
        setPendingClip(newClip);
      } else {
        // Fyrsti clip → hreinsa fyrri keðju og vista
        clipsRef.current.forEach((c) => URL.revokeObjectURL(c.url));
        if (pendingRef.current) URL.revokeObjectURL(pendingRef.current.url);
        if (mergedRef.current) URL.revokeObjectURL(mergedRef.current.url);
        setClips([newClip]);
        setPendingClip(null);
        setMergedClip(null);
        setSavedMeta({ timestamp: now, prompt: activePrompt });
        void saveResult({
          key: SAVED_KEY,
          timestamp: now,
          mediaType: "video",
          blobs: [blob],
          prompt: activePrompt,
          mode: model,
          sourceName,
        });
      }
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

  function acceptPending() {
    const pending = pendingClip;
    if (!pending) return;
    const nextClips = [...clips, pending];
    setClips(nextClips);
    setPendingClip(null);
    // Nýr bútur í keðju → gamla soðningin á ekki við lengur.
    if (mergedRef.current) URL.revokeObjectURL(mergedRef.current.url);
    setMergedClip(null);
    setSavedMeta({ timestamp: pending.timestamp, prompt: pending.prompt });
    void saveResult({
      key: SAVED_KEY,
      timestamp: pending.timestamp,
      mediaType: "video",
      blobs: nextClips.map((c) => c.blob),
      prompt: pending.prompt,
      mode: model,
      sourceName: source?.name,
    });
  }

  function discardPending() {
    const pending = pendingClip;
    if (!pending) return;
    URL.revokeObjectURL(pending.url);
    setPendingClip(null);
  }

  async function clearSavedResults() {
    clipsRef.current.forEach((c) => URL.revokeObjectURL(c.url));
    if (pendingRef.current) URL.revokeObjectURL(pendingRef.current.url);
    if (mergedRef.current) URL.revokeObjectURL(mergedRef.current.url);
    setClips([]);
    setPendingClip(null);
    setMergedClip(null);
    setSavedMeta(null);
    await clearResult(SAVED_KEY);
  }

  const lastClip = clips.length > 0 ? clips[clips.length - 1] : null;
  const baseName = source?.name?.replace(/\.[^.]+$/, "") || "myndband";

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
            fyrir cinematic gæði. Þegar fyrsti bútur er tilbúinn geturðu framlengt hann — vélin tekur
            síðasta ramma og býr til næsta bút í beinu framhaldi. Eftir hverja framlengingu velurðu
            hvort hún sé nothæf eða hvort reyna aftur.
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
                    clipsRef.current.forEach((c) => URL.revokeObjectURL(c.url));
                    if (pendingRef.current) URL.revokeObjectURL(pendingRef.current.url);
                    if (mergedRef.current) URL.revokeObjectURL(mergedRef.current.url);
                    setClips([]);
                    setPendingClip(null);
                    setMergedClip(null);
                    setSavedMeta(null);
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
                  label="Hvað gerist í myndbandinu? (5 slots — tappaðu á textann til að breyta, + til að velja virkt)"
                  data={klingSlots}
                  onChange={updateKlingSlots}
                  rows={3}
                  placeholder="cinematic motion, subtle camera push-in…"
                  count={5}
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
              label="Hvað gerist í myndbandinu? (5 slots — tappaðu á textann til að breyta, + til að velja virkt)"
              data={wanSlots}
              onChange={updateWanSlots}
              rows={3}
              placeholder="cinematic motion, subtle camera push-in…"
              count={5}
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
              {busy ? "Teikna myndband…" : clips.length > 0 ? "Byrja upp á nýtt" : "Teikna myndband"}
            </button>
          </section>

          {clips.length > 0 && (
            <section className="ac-panel">
              <h2>Útkoma{clips.length > 1 ? ` (${clips.length} bútar)` : ""}</h2>
              {savedMeta && (
                <p className="ac-hint">
                  Vistað {formatSavedTime(savedMeta.timestamp)}
                  {savedMeta.prompt ? ` · „${savedMeta.prompt.slice(0, 80)}${savedMeta.prompt.length > 80 ? "…" : ""}"` : ""}
                </p>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {clips.map((clip, i) => (
                  <div
                    key={clip.url}
                    style={{
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 10,
                      padding: 12,
                      background: "rgba(255,255,255,0.02)",
                    }}
                  >
                    <p className="ac-hint" style={{ marginTop: 0 }}>
                      <strong>Bútur {i + 1}</strong>
                      {clip.prompt ? ` · „${clip.prompt.slice(0, 100)}${clip.prompt.length > 100 ? "…" : ""}"` : ""}
                    </p>
                    <video
                      src={clip.url}
                      controls
                      loop
                      muted
                      style={{ maxWidth: "100%", borderRadius: 8, display: "block" }}
                    />
                    <div className="ac-row" style={{ marginTop: 8 }}>
                      <button
                        type="button"
                        className="ac-btn ghost"
                        onClick={() =>
                          downloadBlob(clip.url, `skyjahreyfimynd-${baseName}-${String(i + 1).padStart(2, "0")}.mp4`)
                        }
                      >
                        Sækja bút {i + 1}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {!pendingClip && lastClip && !busy && (
                <div
                  className="ac-row"
                  style={{
                    marginTop: 14,
                    padding: 14,
                    background: "rgba(34, 197, 94, 0.10)",
                    border: "2px solid rgba(34, 197, 94, 0.6)",
                    borderRadius: 10,
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <strong style={{ fontSize: 15, color: "#ffffff", display: "block", marginBottom: 4 }}>
                      Framlengja?
                    </strong>
                    <p className="ac-hint" style={{ margin: 0, color: "#e5e7eb" }}>
                      Vélin tekur síðasta ramma úr bút {clips.length} og býr til næsta bút með virka
                      prompt-inu. Þú getur breytt prompt-inu áður en þú ýtir.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="ac-btn"
                    onClick={() => void run({ extendFrom: lastClip })}
                  >
                    Framlengja bút {clips.length}
                  </button>
                </div>
              )}

              {pendingClip && (
                <div
                  style={{
                    marginTop: 14,
                    padding: 14,
                    background: "rgba(99, 102, 241, 0.12)",
                    border: "2px solid rgba(99, 102, 241, 0.7)",
                    borderRadius: 10,
                  }}
                >
                  <p style={{ marginTop: 0, color: "#e5e7eb", fontSize: 13 }}>
                    <strong style={{ color: "#ffffff", fontSize: 15 }}>
                      Nýr bútur tilbúinn ({clips.length + 1}. í röð)
                    </strong>
                    {pendingClip.prompt
                      ? ` · „${pendingClip.prompt.slice(0, 100)}${pendingClip.prompt.length > 100 ? "…" : ""}"`
                      : ""}
                  </p>
                  <video
                    src={pendingClip.url}
                    controls
                    autoPlay
                    loop
                    muted
                    style={{ maxWidth: "100%", borderRadius: 8, display: "block" }}
                  />
                  <div className="ac-row" style={{ marginTop: 10, gap: 10, flexWrap: "wrap" }}>
                    <button type="button" className="ac-btn" onClick={acceptPending}>
                      Nota þennan bút
                    </button>
                    <button
                      type="button"
                      className="ac-btn ghost"
                      onClick={() => {
                        discardPending();
                        if (lastClip) void run({ extendFrom: lastClip });
                      }}
                      disabled={busy || !lastClip}
                    >
                      Reyna aftur
                    </button>
                    <button type="button" className="ac-btn ghost" onClick={discardPending}>
                      Henda
                    </button>
                  </div>
                </div>
              )}

              {clips.length >= 2 && !pendingClip && (
                <div
                  style={{
                    marginTop: 14,
                    padding: 14,
                    background: "rgba(234, 179, 8, 0.10)",
                    border: "2px solid rgba(234, 179, 8, 0.6)",
                    borderRadius: 10,
                  }}
                >
                  <div
                    className="ac-row"
                    style={{ gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}
                  >
                    <div style={{ flex: 1, minWidth: 220 }}>
                      <strong style={{ fontSize: 15, color: "#ffffff", display: "block", marginBottom: 4 }}>
                        Soðja bútana saman í eitt
                      </strong>
                      <p style={{ margin: 0, color: "#e5e7eb", fontSize: 13 }}>
                        Spilar alla {clips.length} bútana í röð inn á canvas og tekur upp í eitt
                        myndband. Tekur raun-tíma (um það bil samanlagðan lengd bútanna). Útkoman er
                        MP4 í Chrome/Safari, annars WebM.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="ac-btn"
                      onClick={() => void handleStitch()}
                      disabled={stitching || busy}
                    >
                      {stitching
                        ? stitchStatus
                          ? `Tek upp bút ${stitchStatus.current}/${stitchStatus.total}…`
                          : "Soðja saman…"
                        : mergedClip
                          ? "Soðja aftur"
                          : "Soðja saman"}
                    </button>
                  </div>
                  {mergedClip && !stitching && (
                    <div style={{ marginTop: 12 }}>
                      <p style={{ margin: "0 0 8px", color: "#e5e7eb", fontSize: 13 }}>
                        Soðið úr {mergedClip.sourceCount} bútum · {mergedClip.mimeType}
                      </p>
                      <video
                        src={mergedClip.url}
                        controls
                        loop
                        muted
                        style={{ maxWidth: "100%", borderRadius: 8, display: "block" }}
                      />
                      <div className="ac-row" style={{ marginTop: 8 }}>
                        <button
                          type="button"
                          className="ac-btn"
                          onClick={() => {
                            const ext = mergedClip.mimeType.includes("mp4") ? "mp4" : "webm";
                            downloadBlob(mergedClip.url, `skyjahreyfimynd-${baseName}-sodid.${ext}`);
                          }}
                        >
                          Sækja soðið myndband
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="ac-row" style={{ marginTop: 14 }}>
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
