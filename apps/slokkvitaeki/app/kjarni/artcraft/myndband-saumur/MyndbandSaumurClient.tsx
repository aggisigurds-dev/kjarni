"use client";

import { useEffect, useRef, useState } from "react";
import { StationChrome } from "../../StationChrome";
import { artcraftHubHref, artcraftToolsHref } from "../apps";
import SendTo from "../SendTo";
import VerkhringirHint from "../VerkhringirHint";
import StagingPicker from "../StagingPicker";
import { useStagedSource } from "../useStagedSource";
import "../artcraft.css";

/** Myndbanda-saumur — in-browser video stitcher.
 *
 *  Nálgun: MediaRecorder á canvas. Fyrir hverja klippu-rað:
 *    1) búum til <video>, play(), drawImage í canvas á requestAnimationFrame
 *    2) canvas.captureStream() → MediaRecorder → chunks
 *    3) ljúkum þegar síðasta klippa endar → eitt mp4 blob
 *
 *  Víxlun (transitions): tveir frames af cross-fade á milli klippa með
 *  globalAlpha. Einfalt en nothæft.
 *
 *  Audio: skip í v1 — notandi getur bætt við í post. (MediaRecorder styður
 *  audio frá <video> en krefst Web Audio API blending sem er flóknara.)
 *
 *  Kostir: engin ffmpeg.wasm bundle (-30MB), engin COOP/COEP headers.
 *  Kostnaður: real-time (10s video = 10s processing), re-encodes (gæða-tap
 *  á h264 → webm → h264 chain), engin audio.
 */

const VIDEO_ACCEPT = "video/mp4,video/webm,video/quicktime";
const MAX_PER_CLIP = 20 * 1024 * 1024;
const MAX_CLIPS = 8;

const TRANSITIONS = [
  { id: "cut", label: "Harðar klippur (engin yfirgangur)", frames: 0 },
  { id: "fade-short", label: "Stutt cross-fade (~0.3s)", frames: 10 },
  { id: "fade-long", label: "Lang cross-fade (~0.7s)", frames: 20 },
] as const;
type TransitionId = (typeof TRANSITIONS)[number]["id"];

type Clip = {
  id: string;
  file: File;
  url: string;
  width: number;
  height: number;
  duration: number;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}kB`;
  return `${(n / (1024 * 1024)).toFixed(1)}MB`;
}

function loadClipMeta(file: File): Promise<Clip> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.preload = "metadata";
    video.playsInline = true;
    video.onloadedmetadata = () => {
      resolve({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        url,
        width: video.videoWidth,
        height: video.videoHeight,
        duration: video.duration,
      });
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Gat ekki opnað video (óstudd kóðun?)"));
    };
  });
}

function pickOutputMime(): string {
  const candidates = [
    "video/mp4;codecs=avc1.42E01E",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) return c;
  }
  return "video/webm";
}

async function stitchClips(
  clips: Clip[],
  transition: TransitionId,
  onProgress: (pct: number, note: string) => void,
): Promise<Blob> {
  if (clips.length === 0) throw new Error("Engar klippur til að sauma");

  // Útkomumálin: notum stærstu klippuna svo við skölum ekki niður.
  const outW = Math.max(...clips.map((c) => c.width));
  const outH = Math.max(...clips.map((c) => c.height));
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D ekki stuttur");

  // FPS: 30 til öryggis, flestar klippur eru 16-30fps.
  const fps = 30;
  const stream = canvas.captureStream(fps);
  const mimeType = pickOutputMime();
  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  recorder.start();

  // Teiknum í canvas eftir röð: fyrir hverja klippu, play video, draw ramma
  // á framesnið miðað við videoTime.
  const transitionFrames = TRANSITIONS.find((t) => t.id === transition)?.frames ?? 0;
  const transitionDuration = transitionFrames / fps; // sekúndur

  function drawCovered(video: HTMLVideoElement, alpha = 1) {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const canvasRatio = outW / outH;
    const videoRatio = vw / vh;
    let dw = outW;
    let dh = outH;
    let dx = 0;
    let dy = 0;
    if (videoRatio > canvasRatio) {
      dw = outH * videoRatio;
      dx = (outW - dw) / 2;
    } else {
      dh = outW / videoRatio;
      dy = (outH - dh) / 2;
    }
    ctx!.globalAlpha = alpha;
    ctx!.drawImage(video, dx, dy, dw, dh);
    ctx!.globalAlpha = 1;
  }

  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const next = clips[i + 1];
    const totalProgress = i / clips.length;

    const video = document.createElement("video");
    video.src = clip.url;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error(`Gat ekki opnað ${clip.file.name}`));
    });

    const clipDuration = Math.max(0.1, video.duration);
    const transitionStartTime = next && transitionDuration > 0 ? clipDuration - transitionDuration : clipDuration + 1;

    let nextVideo: HTMLVideoElement | null = null;
    if (next && transitionDuration > 0) {
      nextVideo = document.createElement("video");
      nextVideo.src = next.url;
      nextVideo.muted = true;
      nextVideo.playsInline = true;
      nextVideo.preload = "auto";
      await new Promise<void>((resolve, reject) => {
        nextVideo!.onloadeddata = () => resolve();
        nextVideo!.onerror = () => reject(new Error(`Gat ekki opnað ${next.file.name}`));
      });
    }

    await video.play();
    if (nextVideo) nextVideo.currentTime = 0;

    await new Promise<void>((resolve) => {
      const start = performance.now();
      const tick = () => {
        const now = (performance.now() - start) / 1000;
        const t = Math.min(clipDuration, now);

        if (t < transitionStartTime || !nextVideo) {
          // venjuleg teikning
          drawCovered(video, 1);
        } else {
          // cross-fade: blanda saman þessari og næstu
          const fadeT = (t - transitionStartTime) / transitionDuration;
          const alpha = Math.max(0, Math.min(1, fadeT));
          ctx!.clearRect(0, 0, outW, outH);
          drawCovered(video, 1 - alpha);
          // kveikjum á næsta video þegar fade byrjar og ýtum tímanum áfram
          if (nextVideo.paused) void nextVideo.play();
          drawCovered(nextVideo, alpha);
        }

        const localPct = Math.min(1, t / clipDuration);
        const overallPct = ((totalProgress + localPct / clips.length) * 100) | 0;
        onProgress(overallPct, `Klippa ${i + 1}/${clips.length}`);

        if (t >= clipDuration) {
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    video.pause();
    if (nextVideo && !next) nextVideo.pause();
  }

  // Smá lítill tími svo síðustu frames komist í recorder-inn
  await new Promise((r) => setTimeout(r, 200));
  recorder.stop();
  stream.getTracks().forEach((t) => t.stop());

  await new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  return new Blob(chunks, { type: mimeType });
}

export default function MyndbandSaumurClient() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [transition, setTransition] = useState<TransitionId>("fade-short");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressNote, setProgressNote] = useState("");
  const [error, setError] = useState("");
  const [resultUrl, setResultUrl] = useState("");
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultMime, setResultMime] = useState("");

  useEffect(() => {
    return () => {
      for (const c of clips) URL.revokeObjectURL(c.url);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addFile(file: File) {
    if (!file.type.startsWith("video/")) {
      setError("Þetta er ekki video-skrá.");
      return;
    }
    if (file.size > MAX_PER_CLIP) {
      setError(`Video of stórt (${formatBytes(file.size)}). Hámark per klippa: ${formatBytes(MAX_PER_CLIP)}.`);
      return;
    }
    if (clips.length >= MAX_CLIPS) {
      setError(`Hámark ${MAX_CLIPS} klippur í einu.`);
      return;
    }
    setError("");
    try {
      const clip = await loadClipMeta(file);
      setClips((prev) => [...prev, clip]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gat ekki hlaðið klippunni");
    }
  }

  useStagedSource(async (blob, item) => {
    const name = item.name || `from-${item.sourceTool}.mp4`;
    const file = new File([blob], name, { type: blob.type || "video/mp4" });
    await addFile(file);
  });

  function moveUp(index: number) {
    if (index === 0) return;
    setClips((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }

  function moveDown(index: number) {
    setClips((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  }

  function removeClip(index: number) {
    setClips((prev) => {
      const next = [...prev];
      const removed = next.splice(index, 1)[0];
      if (removed) URL.revokeObjectURL(removed.url);
      return next;
    });
  }

  async function run() {
    if (clips.length < 1) {
      setError("Bættu við a.m.k. einni klippu.");
      return;
    }
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setBusy(true);
    setError("");
    setResultUrl("");
    setResultBlob(null);
    setResultMime("");
    setProgress(0);
    setProgressNote("Byrja…");
    try {
      const blob = await stitchClips(clips, transition, (pct, note) => {
        setProgress(pct);
        setProgressNote(note);
      });
      setResultMime(blob.type);
      setResultBlob(blob);
      setResultUrl(URL.createObjectURL(blob));
      setProgress(100);
      setProgressNote("Klárað");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Óvænt villa í saumun");
    } finally {
      setBusy(false);
    }
  }

  function downloadResult() {
    if (!resultUrl) return;
    const a = document.createElement("a");
    a.href = resultUrl;
    const ext = resultMime.includes("mp4") ? "mp4" : "webm";
    a.download = `saumur-${Date.now()}.${ext}`;
    a.click();
  }

  const totalDuration = clips.reduce((sum, c) => sum + c.duration, 0);
  const transitionMeta = TRANSITIONS.find((t) => t.id === transition);
  const transitionSeconds = transitionMeta ? transitionMeta.frames / 30 : 0;
  const estimatedDuration = Math.max(0, totalDuration - transitionSeconds * Math.max(0, clips.length - 1));

  return (
    <StationChrome tool="artcraft">
      <div className="ac-hub">
        <div className="ac-hub-in ac-studio">
          <p className="ac-kicker">
            <a href={artcraftHubHref()}>ArtCraft</a>
            {" · "}
            <a href={artcraftToolsHref()}>Tól</a>
            {" · Myndbanda-saumur"}
          </p>
          <h1>Myndbanda-saumur</h1>
          <p className="ac-lead">
            Sauma margar video-klippur saman í eina röð í vafranum. Dragðu til að endurraða, veldu
            transition-stíl, flyttu út eina lengri klippu. Allt gerist í vafranum — engin uppload.
          </p>

          {error && <p className="ac-error">{error}</p>}

          <section className="ac-panel">
            <div className="ac-row" style={{ gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                className="ac-btn"
                onClick={() => inputRef.current?.click()}
                disabled={busy || clips.length >= MAX_CLIPS}
              >
                Bæta við klippu
              </button>
              <StagingPicker
                accepts="video"
                onPick={async (blob, item) => {
                  const name = item.name || `from-${item.sourceTool}.mp4`;
                  const file = new File([blob], name, { type: blob.type || "video/mp4" });
                  await addFile(file);
                }}
              />
              <input
                ref={inputRef}
                type="file"
                accept={VIDEO_ACCEPT}
                hidden
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  (async () => {
                    for (const f of files) await addFile(f);
                  })();
                  e.target.value = "";
                }}
              />
              <span className="ac-hint" style={{ opacity: 0.7, alignSelf: "center" }}>
                {clips.length}/{MAX_CLIPS} klippur · ~{estimatedDuration.toFixed(1)}s eftir saumun
              </span>
            </div>
          </section>

          {clips.length > 0 && (
            <section className="ac-panel">
              <h3 style={{ marginTop: 0 }}>Röðin</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {clips.map((clip, i) => (
                  <div
                    key={clip.id}
                    style={{
                      display: "flex",
                      gap: 12,
                      alignItems: "center",
                      padding: 10,
                      border: "1px solid var(--m-border, #333)",
                      borderRadius: 6,
                      background: "rgba(255,255,255,0.03)",
                    }}
                  >
                    <span style={{ minWidth: 20, fontWeight: 600, opacity: 0.6 }}>#{i + 1}</span>
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                    <video
                      src={clip.url}
                      style={{ width: 120, height: 68, objectFit: "cover", borderRadius: 4, background: "#000" }}
                      muted
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {clip.file.name}
                      </div>
                      <div style={{ fontSize: 11, opacity: 0.6 }}>
                        {clip.width}×{clip.height} · {clip.duration.toFixed(1)}s · {formatBytes(clip.file.size)}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button
                        type="button"
                        className="ac-btn ghost"
                        onClick={() => moveUp(i)}
                        disabled={busy || i === 0}
                        aria-label="Færa upp"
                        style={{ padding: "4px 8px" }}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="ac-btn ghost"
                        onClick={() => moveDown(i)}
                        disabled={busy || i === clips.length - 1}
                        aria-label="Færa niður"
                        style={{ padding: "4px 8px" }}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="ac-btn ghost"
                        onClick={() => removeClip(i)}
                        disabled={busy}
                        aria-label="Eyða"
                        style={{ padding: "4px 8px" }}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="ac-settings" style={{ marginTop: 16 }}>
                <label>
                  Transition
                  <select
                    value={transition}
                    onChange={(e) => setTransition(e.target.value as TransitionId)}
                    disabled={busy}
                  >
                    {TRANSITIONS.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <small className="ac-rec">mælt: Stutt cross-fade — mýkt skil án að verka of hægt</small>
                </label>
              </div>

              <button
                type="button"
                className="ac-btn"
                onClick={() => void run()}
                disabled={busy || clips.length === 0}
                style={{ marginTop: 12 }}
              >
                {busy ? `Sauma… ${progress}%` : "Sauma saman"}
              </button>
              {busy && (
                <div style={{ marginTop: 10 }}>
                  <div
                    style={{
                      height: 6,
                      background: "rgba(255,255,255,0.1)",
                      borderRadius: 3,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${progress}%`,
                        height: "100%",
                        background: "var(--m-ember, #c9982f)",
                        transition: "width 0.2s linear",
                      }}
                    />
                  </div>
                  <p className="ac-hint" style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
                    {progressNote} — saumun er real-time (10s video = 10s vinnsla). Ekki loka síðunni.
                  </p>
                </div>
              )}
              <p className="ac-hint" style={{ marginTop: 8, fontSize: 11, opacity: 0.55 }}>
                Þessi útgáfa saumar aðeins mynd (video án hljóðs). Hljóð kemur í síðari uppfærslu.
              </p>
            </section>
          )}

          {resultUrl && (
            <section className="ac-panel">
              <h3 style={{ marginTop: 0 }}>Útkoma</h3>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video
                src={resultUrl}
                controls
                style={{ width: "100%", maxHeight: 500, borderRadius: 6, background: "#000" }}
              />
              <div className="ac-row" style={{ gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                <button type="button" className="ac-btn" onClick={downloadResult}>
                  Sækja saum
                </button>
                {resultBlob && (
                  <SendTo
                    blob={resultBlob}
                    mediaType="video"
                    sourceTool="myndband-saumur"
                    sourceToolName="Myndbanda-saumur"
                    name={`saumur.${resultMime.includes("mp4") ? "mp4" : "webm"}`}
                  />
                )}
              </div>
              <VerkhringirHint tool="myndband-saumur" />
            </section>
          )}
        </div>
      </div>
    </StationChrome>
  );
}
