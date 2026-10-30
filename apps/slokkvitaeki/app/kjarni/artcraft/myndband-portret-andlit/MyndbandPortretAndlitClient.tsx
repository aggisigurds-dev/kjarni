"use client";

import { useEffect, useRef, useState } from "react";
import { StationChrome } from "../../StationChrome";
import { artcraftHubHref, artcraftToolsHref } from "../apps";
import SendTo from "../SendTo";
import VerkhringirHint from "../VerkhringirHint";
import { useStagedSource } from "../useStagedSource";
import "../artcraft.css";

/** Myndband-portret-andlit — portrait-crop + face-swap + composite back.
 *
 *  Hugmyndin: oft þarf aðeins að laga andlitið í myndbandi, ekki búkinn.
 *  Með því að cropa myndbandið niður í portret-ferhyrning (axlir og upp),
 *  keyra roop face-swap á crop-inu einu, og setja útkomuna aftur ofan á
 *  upprunalegu myndbandið á sama stað, þá:
 *    - minnkar vinnutími (roop vinnur á smærra svæði)
 *    - minnkar þörf á disable_safety_checker (buk/klæði eru ekki send)
 *    - heldur upprunalega myndbandinu óbreyttu nema andlits-svæðinu
 *
 *  Flæði:
 *    1) notandi hleður upp video + andlits-tilvísunarmynd
 *    2) notandi stillir crop-ferhyrning á fyrsta frame (preset: axlir og upp)
 *    3) client cropar video → cropped video blob (canvas + MediaRecorder)
 *    4) /api/myndband-andlit (roop) tekur cropað video + andlit → swapped crop
 *    5) client composite-ar: upprunalegt video + swapped crop ofan á → endanlegt
 *
 *  Takmarkanir v1:
 *    - 1 andlits-tilvísun (fjölrefs koma í v2 — composite grid eða chaining)
 *    - static crop-ferhyrningur (engin face-tracking)
 *    - real-time MediaRecorder (10s video = 10s crop + 10s composite)
 */

const VIDEO_ACCEPT = "video/mp4,video/webm,video/quicktime";
const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_VIDEO_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const CROP_PRESETS = [
  { id: "shoulders-up", label: "Axlir og upp (3:4)", top: 0.0, left: 0.2, width: 0.6, height: 0.65 },
  { id: "head-only", label: "Bara höfuð (1:1)", top: 0.0, left: 0.3, width: 0.4, height: 0.4 },
  { id: "chest-up", label: "Bringa og upp (4:5)", top: 0.0, left: 0.15, width: 0.7, height: 0.85 },
  { id: "custom", label: "Sérsniðið", top: 0.0, left: 0.2, width: 0.6, height: 0.65 },
] as const;
type PresetId = (typeof CROP_PRESETS)[number]["id"];

type Rect = { x: number; y: number; w: number; h: number };

type SubmitResponse =
  | { videos: string[] }
  | { predictionId: string; status: string }
  | { error: string };

type StatusResponse =
  | { status: "succeeded"; videos: string[] }
  | { status: "failed" | "canceled"; error?: string }
  | { status: string }
  | { error: string };

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(typeof r.result === "string" ? r.result : "");
    r.onerror = () => reject(r.error || new Error("Gat ekki lesið skrá"));
    r.readAsDataURL(blob);
  });
}

async function fetchVideoBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gat ekki sótt myndbandið (${res.status})`);
  return res.blob();
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}kB`;
  return `${(n / (1024 * 1024)).toFixed(1)}MB`;
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

function loadVideoMeta(file: File | Blob): Promise<{ url: string; width: number; height: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.preload = "metadata";
    video.playsInline = true;
    video.onloadedmetadata = () => {
      resolve({ url, width: video.videoWidth, height: video.videoHeight, duration: video.duration });
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Gat ekki opnað video"));
    };
  });
}

/** Cropa video í portret-ferhyrning með því að play-a það, draw-a bara crop-svæðið
 *  í canvas á requestAnimationFrame og MediaRecorder tekur upp. Útkoman er video
 *  af sömu lengd en einungis crop-svæðinu. */
async function cropVideo(
  blob: Blob,
  rectPx: Rect,
  onProgress: (pct: number) => void,
): Promise<Blob> {
  const url = URL.createObjectURL(blob);
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error("Gat ekki opnað video fyrir crop"));
  });

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(rectPx.w);
  canvas.height = Math.round(rectPx.h);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D ekki stuttur");

  const fps = 30;
  const stream = canvas.captureStream(fps);
  const mimeType = pickOutputMime();
  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  recorder.start();

  const duration = Math.max(0.1, video.duration);
  await video.play();

  await new Promise<void>((resolve) => {
    const start = performance.now();
    const tick = () => {
      const now = (performance.now() - start) / 1000;
      const t = Math.min(duration, now);
      ctx.drawImage(video, rectPx.x, rectPx.y, rectPx.w, rectPx.h, 0, 0, canvas.width, canvas.height);
      onProgress(Math.min(1, t / duration));
      if (t >= duration) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  video.pause();
  await new Promise((r) => setTimeout(r, 150));
  recorder.stop();
  stream.getTracks().forEach((t) => t.stop());
  await new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });
  URL.revokeObjectURL(url);
  return new Blob(chunks, { type: mimeType });
}

/** Composite swapped crop aftur ofan á upprunalegt video. Spilum bæði videoin
 *  samhliða (sama tími), teiknum original fullt, teiknum swapped crop á sama
 *  rectPx. Smá soft-edge til að dylja mörkin. */
async function compositeBack(
  originalBlob: Blob,
  swappedCropBlob: Blob,
  rectPx: Rect,
  outW: number,
  outH: number,
  featherPx: number,
  onProgress: (pct: number) => void,
): Promise<Blob> {
  const origUrl = URL.createObjectURL(originalBlob);
  const cropUrl = URL.createObjectURL(swappedCropBlob);

  const origVideo = document.createElement("video");
  origVideo.src = origUrl;
  origVideo.muted = true;
  origVideo.playsInline = true;
  origVideo.preload = "auto";
  await new Promise<void>((resolve, reject) => {
    origVideo.onloadeddata = () => resolve();
    origVideo.onerror = () => reject(new Error("Gat ekki opnað upprunalegt video"));
  });

  const cropVideoEl = document.createElement("video");
  cropVideoEl.src = cropUrl;
  cropVideoEl.muted = true;
  cropVideoEl.playsInline = true;
  cropVideoEl.preload = "auto";
  await new Promise<void>((resolve, reject) => {
    cropVideoEl.onloadeddata = () => resolve();
    cropVideoEl.onerror = () => reject(new Error("Gat ekki opnað swapped crop"));
  });

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D ekki stuttur");

  const fps = 30;
  const stream = canvas.captureStream(fps);
  const mimeType = pickOutputMime();
  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  recorder.start();

  const duration = Math.max(0.1, Math.min(origVideo.duration, cropVideoEl.duration));
  await origVideo.play();
  await cropVideoEl.play();

  // Gradient mask fyrir soft-edge composite: notum offscreen canvas til að
  // teikna crop með radial fade-út á brúnum. Einfaldari leið: teikna crop
  // með globalCompositeOperation = "source-over" og eftir inset-ramma með
  // alpha-gradient til að dylja mörkin.
  const feather = Math.max(0, Math.min(featherPx, rectPx.w / 2, rectPx.h / 2));

  await new Promise<void>((resolve) => {
    const start = performance.now();
    const tick = () => {
      const now = (performance.now() - start) / 1000;
      const t = Math.min(duration, now);

      // 1) teikna original fullt
      ctx.drawImage(origVideo, 0, 0, outW, outH);

      // 2) teikna swapped crop á sama rectPx
      ctx.drawImage(cropVideoEl, 0, 0, cropVideoEl.videoWidth, cropVideoEl.videoHeight, rectPx.x, rectPx.y, rectPx.w, rectPx.h);

      // 3) feather-edge: teikna aðeins brúnir original ofan á crop með gradient
      if (feather > 0) {
        // Top
        const gTop = ctx.createLinearGradient(0, rectPx.y, 0, rectPx.y + feather);
        gTop.addColorStop(0, "rgba(0,0,0,1)");
        gTop.addColorStop(1, "rgba(0,0,0,0)");
        ctx.save();
        ctx.globalCompositeOperation = "destination-out";
        ctx.fillStyle = gTop;
        ctx.fillRect(rectPx.x, rectPx.y, rectPx.w, feather);
        ctx.restore();
        // Bottom
        const gBot = ctx.createLinearGradient(0, rectPx.y + rectPx.h - feather, 0, rectPx.y + rectPx.h);
        gBot.addColorStop(0, "rgba(0,0,0,0)");
        gBot.addColorStop(1, "rgba(0,0,0,1)");
        ctx.save();
        ctx.globalCompositeOperation = "destination-out";
        ctx.fillStyle = gBot;
        ctx.fillRect(rectPx.x, rectPx.y + rectPx.h - feather, rectPx.w, feather);
        ctx.restore();
        // Left
        const gLeft = ctx.createLinearGradient(rectPx.x, 0, rectPx.x + feather, 0);
        gLeft.addColorStop(0, "rgba(0,0,0,1)");
        gLeft.addColorStop(1, "rgba(0,0,0,0)");
        ctx.save();
        ctx.globalCompositeOperation = "destination-out";
        ctx.fillStyle = gLeft;
        ctx.fillRect(rectPx.x, rectPx.y, feather, rectPx.h);
        ctx.restore();
        // Right
        const gRight = ctx.createLinearGradient(rectPx.x + rectPx.w - feather, 0, rectPx.x + rectPx.w, 0);
        gRight.addColorStop(0, "rgba(0,0,0,0)");
        gRight.addColorStop(1, "rgba(0,0,0,1)");
        ctx.save();
        ctx.globalCompositeOperation = "destination-out";
        ctx.fillStyle = gRight;
        ctx.fillRect(rectPx.x + rectPx.w - feather, rectPx.y, feather, rectPx.h);
        ctx.restore();
        // Hér eyddum við hluta af crop-brúninni, þurfum að endurteikna
        // original ofan á þær brúnir. Þetta nálgun er léleg með
        // destination-out — notum heldur eina compositingu með mask.
        // Lagfæring: fillum aftur original ofan á fjarlægðar brúnir.
        ctx.save();
        ctx.globalCompositeOperation = "destination-over";
        ctx.drawImage(origVideo, 0, 0, outW, outH);
        ctx.restore();
      }

      onProgress(Math.min(1, t / duration));
      if (t >= duration) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  origVideo.pause();
  cropVideoEl.pause();
  await new Promise((r) => setTimeout(r, 150));
  recorder.stop();
  stream.getTracks().forEach((t) => t.stop());
  await new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });
  URL.revokeObjectURL(origUrl);
  URL.revokeObjectURL(cropUrl);
  return new Blob(chunks, { type: mimeType });
}

export default function MyndbandPortretAndlitClient() {
  const videoInputRef = useRef<HTMLInputElement>(null);
  const faceInputRef = useRef<HTMLInputElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState("");
  const [videoMeta, setVideoMeta] = useState<{ width: number; height: number; duration: number } | null>(null);

  const [faceFile, setFaceFile] = useState<File | null>(null);
  const [facePreview, setFacePreview] = useState("");

  const [preset, setPreset] = useState<PresetId>("shoulders-up");
  const [cropRelative, setCropRelative] = useState({ top: 0.0, left: 0.2, width: 0.6, height: 0.65 });
  const [featherPct, setFeatherPct] = useState(4); // % af crop-h fyrir soft-edge

  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<"idle" | "cropping" | "uploading" | "swapping" | "compositing" | "done" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [progressNote, setProgressNote] = useState("");
  const [error, setError] = useState("");
  const [resultUrl, setResultUrl] = useState("");
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultMime, setResultMime] = useState("");

  const pollTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
      if (videoPreview) URL.revokeObjectURL(videoPreview);
      if (facePreview) URL.revokeObjectURL(facePreview);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Teikna crop-overlay á fyrsta frame þegar video eða crop breytist.
  useEffect(() => {
    const video = previewVideoRef.current;
    const canvas = previewCanvasRef.current;
    if (!video || !canvas || !videoMeta) return;
    const draw = () => {
      canvas.width = videoMeta.width;
      canvas.height = videoMeta.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      } catch {
        /* ignore if seek pending */
      }
      // Yfirgöngur yfir allt sem er UTAN crop-svæðisins
      const rect = {
        x: Math.round(cropRelative.left * canvas.width),
        y: Math.round(cropRelative.top * canvas.height),
        w: Math.round(cropRelative.width * canvas.width),
        h: Math.round(cropRelative.height * canvas.height),
      };
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, canvas.width, rect.y);
      ctx.fillRect(0, rect.y + rect.h, canvas.width, canvas.height - rect.y - rect.h);
      ctx.fillRect(0, rect.y, rect.x, rect.h);
      ctx.fillRect(rect.x + rect.w, rect.y, canvas.width - rect.x - rect.w, rect.h);
      ctx.strokeStyle = "#4ade80";
      ctx.lineWidth = Math.max(2, canvas.width / 400);
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    };
    if (video.readyState >= 2) {
      draw();
    } else {
      video.onloadeddata = () => draw();
    }
    video.currentTime = 0.1;
    video.onseeked = () => draw();
  }, [videoMeta, cropRelative]);

  function acceptVideoFile(file: File) {
    if (!file.type.startsWith("video/")) {
      setError("Þetta er ekki video-skrá.");
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      setError(`Video of stórt (${formatBytes(file.size)}). Hámark ${formatBytes(MAX_VIDEO_BYTES)}.`);
      return;
    }
    setError("");
    if (videoPreview) URL.revokeObjectURL(videoPreview);
    setVideoFile(file);
    void (async () => {
      try {
        const meta = await loadVideoMeta(file);
        setVideoPreview(meta.url);
        setVideoMeta({ width: meta.width, height: meta.height, duration: meta.duration });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Gat ekki lesið video");
      }
    })();
  }

  function acceptFaceFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("Þetta er ekki mynd.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError(`Mynd of stór (${formatBytes(file.size)}). Hámark ${formatBytes(MAX_IMAGE_BYTES)}.`);
      return;
    }
    setError("");
    if (facePreview) URL.revokeObjectURL(facePreview);
    setFaceFile(file);
    setFacePreview(URL.createObjectURL(file));
  }

  useStagedSource(async (blob, item) => {
    const name = item.name || `from-${item.sourceTool}`;
    if (item.mediaType === "video") {
      const file = new File([blob], name.includes(".") ? name : `${name}.mp4`, { type: blob.type || "video/mp4" });
      acceptVideoFile(file);
    } else if (item.mediaType === "image") {
      const file = new File([blob], name.includes(".") ? name : `${name}.png`, { type: blob.type || "image/png" });
      acceptFaceFile(file);
    }
  });

  function selectPreset(id: PresetId) {
    setPreset(id);
    const p = CROP_PRESETS.find((x) => x.id === id);
    if (p && id !== "custom") {
      setCropRelative({ top: p.top, left: p.left, width: p.width, height: p.height });
    }
  }

  async function startProcessing() {
    if (!videoFile || !videoMeta || !faceFile) {
      setError("Vantar video eða andlits-tilvísun.");
      return;
    }
    setError("");
    setBusy(true);
    setProgress(0);
    setStage("cropping");
    setProgressNote("Cropa video í portret-ferhyrning…");

    try {
      // 1) crop
      const rectPx: Rect = {
        x: Math.round(cropRelative.left * videoMeta.width),
        y: Math.round(cropRelative.top * videoMeta.height),
        w: Math.round(cropRelative.width * videoMeta.width),
        h: Math.round(cropRelative.height * videoMeta.height),
      };
      const croppedBlob = await cropVideo(videoFile, rectPx, (p) => {
        setProgress(Math.round(p * 25));
      });
      setProgressNote(`Cropað: ${formatBytes(croppedBlob.size)}`);

      // 2) upload + swap
      setStage("uploading");
      setProgressNote("Set í roop face-swap…");
      setProgress(26);
      const croppedDataUrl = await blobToDataUrl(croppedBlob);
      const faceDataUrl = await blobToDataUrl(faceFile);

      const submitRes = await fetch("/api/myndband-andlit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ video: croppedDataUrl, faceImage: faceDataUrl }),
      });
      const submitJson = (await submitRes.json()) as SubmitResponse;
      if (!submitRes.ok || "error" in submitJson) {
        throw new Error("error" in submitJson ? submitJson.error : `Submit mistókst (${submitRes.status})`);
      }

      let swappedUrl: string;
      if ("videos" in submitJson && submitJson.videos.length > 0) {
        swappedUrl = submitJson.videos[0];
      } else if ("predictionId" in submitJson) {
        setStage("swapping");
        swappedUrl = await pollForResult(submitJson.predictionId, (note, pct) => {
          setProgressNote(note);
          setProgress(26 + Math.round(pct * 45));
        });
      } else {
        throw new Error("Óvænt svar frá /api/myndband-andlit");
      }

      // 3) composite
      setStage("compositing");
      setProgressNote("Set swapped crop aftur í upprunalegt video…");
      setProgress(72);
      const swappedBlob = await fetchVideoBlob(swappedUrl);
      const featherPx = Math.round((featherPct / 100) * rectPx.h);
      const finalBlob = await compositeBack(
        videoFile,
        swappedBlob,
        rectPx,
        videoMeta.width,
        videoMeta.height,
        featherPx,
        (p) => {
          setProgress(72 + Math.round(p * 28));
        },
      );

      // 4) done
      setStage("done");
      setProgress(100);
      setProgressNote("Tilbúið");
      setResultBlob(finalBlob);
      setResultMime(finalBlob.type);
      setResultUrl(URL.createObjectURL(finalBlob));
    } catch (err) {
      setStage("error");
      setError(err instanceof Error ? err.message : "Vinnsla mistókst");
    } finally {
      setBusy(false);
    }
  }

  async function pollForResult(
    predictionId: string,
    onNote: (note: string, pct: number) => void,
  ): Promise<string> {
    const startedAt = Date.now();
    const timeoutMs = 10 * 60 * 1000; // 10 mín max
    let lastStatus = "";
    while (true) {
      await new Promise((r) => setTimeout(r, 3000));
      const elapsed = Date.now() - startedAt;
      if (elapsed > timeoutMs) throw new Error("Tímaveldi — náðist ekki á 10 mín");

      const res = await fetch(`/api/myndband-andlit/status?id=${encodeURIComponent(predictionId)}`);
      const json = (await res.json()) as StatusResponse;
      if (!res.ok || "error" in json) {
        throw new Error("error" in json ? json.error : `Status mistókst (${res.status})`);
      }
      if (json.status === "succeeded" && "videos" in json && json.videos.length > 0) {
        return json.videos[0];
      }
      if (json.status === "failed" || json.status === "canceled") {
        throw new Error(("error" in json && json.error) || "Face-swap mistókst");
      }
      if (json.status !== lastStatus) {
        lastStatus = json.status;
      }
      const pct = Math.min(0.95, elapsed / (6 * 60 * 1000)); // áætlað max 6 mín
      onNote(`roop face-swap: ${json.status}… (${Math.round(elapsed / 1000)}s)`, pct);
    }
  }

  function reset() {
    if (videoPreview) URL.revokeObjectURL(videoPreview);
    if (facePreview) URL.revokeObjectURL(facePreview);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setVideoFile(null);
    setVideoPreview("");
    setVideoMeta(null);
    setFaceFile(null);
    setFacePreview("");
    setResultBlob(null);
    setResultUrl("");
    setResultMime("");
    setStage("idle");
    setProgress(0);
    setProgressNote("");
    setError("");
  }

  function download() {
    if (!resultBlob) return;
    const ext = resultMime.includes("mp4") ? "mp4" : "webm";
    const a = document.createElement("a");
    a.href = resultUrl;
    a.download = `portret-andlit-${Date.now()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <StationChrome tool="artcraft">
      <div className="ac-hub">
        <div className="ac-hub-in ac-studio">
          <p className="ac-kicker">
            <a href={artcraftHubHref()}>ArtCraft</a>
            {" · "}
            <a href={artcraftToolsHref()}>Tól</a>
            {" · Myndband-portret-andlit"}
          </p>
          <h1>Myndband-portret-andlit</h1>
          <p className="ac-lead">
            Cropar video í portret-ferhyrning (axlir og upp), keyrir roop face-swap á crop-svæðinu einu,
            og setur útkomuna aftur ofan á upprunalegt video. Minnkar vinnutíma og þörf á filter-off —
            búkur og klæði eru ekki send upp.
          </p>

          {error && <p className="ac-error">{error}</p>}

          <section className="ac-panel">
            <h2>1. Veldu video + andlits-tilvísun</h2>
            <div className="ac-row" style={{ gap: 14, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 260 }}>
                <label className="ac-row-label">Video (≤ {formatBytes(MAX_VIDEO_BYTES)})</label>
                <input
                  ref={videoInputRef}
                  type="file"
                  accept={VIDEO_ACCEPT}
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) acceptVideoFile(f);
                  }}
                />
                {videoPreview && (
                  <video
                    ref={previewVideoRef}
                    src={videoPreview}
                    muted
                    playsInline
                    style={{ display: "none" }}
                  />
                )}
                {videoFile && videoMeta && (
                  <p className="ac-note" style={{ fontSize: 12 }}>
                    {videoFile.name} · {videoMeta.width}×{videoMeta.height} · {videoMeta.duration.toFixed(1)}s · {formatBytes(videoFile.size)}
                  </p>
                )}
              </div>

              <div style={{ flex: 1, minWidth: 260 }}>
                <label className="ac-row-label">Andlits-tilvísun (≤ {formatBytes(MAX_IMAGE_BYTES)})</label>
                <input
                  ref={faceInputRef}
                  type="file"
                  accept={IMAGE_ACCEPT}
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) acceptFaceFile(f);
                  }}
                />
                {facePreview && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={facePreview}
                    alt="face"
                    style={{ maxWidth: 160, marginTop: 8, borderRadius: 6, border: "1px solid var(--m-border, #333)" }}
                  />
                )}
                {faceFile && (
                  <p className="ac-note" style={{ fontSize: 12 }}>{faceFile.name} · {formatBytes(faceFile.size)}</p>
                )}
              </div>
            </div>
            <p className="ac-note" style={{ fontSize: 12, opacity: 0.7 }}>
              Fjölrefs (3 andlit í einu) kemur í síðari uppfærslu. Núna er notuð ein tilvísun.
            </p>
          </section>

          {videoMeta && (
            <section className="ac-panel">
              <h2>2. Crop-ferhyrningur</h2>
              <div className="ac-row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                {CROP_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="ac-btn"
                    aria-pressed={preset === p.id}
                    onClick={() => selectPreset(p.id)}
                    disabled={busy}
                    style={preset === p.id ? { outline: "2px solid #4ade80" } : undefined}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <canvas
                ref={previewCanvasRef}
                style={{ maxWidth: "100%", maxHeight: 400, border: "1px solid var(--m-border, #333)", borderRadius: 6, background: "#000" }}
              />

              {preset === "custom" && (
                <div className="ac-row" style={{ gap: 10, flexWrap: "wrap", marginTop: 10, fontSize: 12 }}>
                  <label>
                    Top: {(cropRelative.top * 100).toFixed(0)}%
                    <input
                      type="range"
                      min={0}
                      max={70}
                      value={cropRelative.top * 100}
                      onChange={(e) => setCropRelative((c) => ({ ...c, top: Number(e.target.value) / 100 }))}
                      disabled={busy}
                    />
                  </label>
                  <label>
                    Left: {(cropRelative.left * 100).toFixed(0)}%
                    <input
                      type="range"
                      min={0}
                      max={70}
                      value={cropRelative.left * 100}
                      onChange={(e) => setCropRelative((c) => ({ ...c, left: Number(e.target.value) / 100 }))}
                      disabled={busy}
                    />
                  </label>
                  <label>
                    Width: {(cropRelative.width * 100).toFixed(0)}%
                    <input
                      type="range"
                      min={20}
                      max={100}
                      value={cropRelative.width * 100}
                      onChange={(e) => setCropRelative((c) => ({ ...c, width: Number(e.target.value) / 100 }))}
                      disabled={busy}
                    />
                  </label>
                  <label>
                    Height: {(cropRelative.height * 100).toFixed(0)}%
                    <input
                      type="range"
                      min={20}
                      max={100}
                      value={cropRelative.height * 100}
                      onChange={(e) => setCropRelative((c) => ({ ...c, height: Number(e.target.value) / 100 }))}
                      disabled={busy}
                    />
                  </label>
                </div>
              )}

              <div className="ac-row" style={{ gap: 10, marginTop: 10, fontSize: 12 }}>
                <label>
                  Soft-edge (feather): {featherPct}%
                  <input
                    type="range"
                    min={0}
                    max={15}
                    value={featherPct}
                    onChange={(e) => setFeatherPct(Number(e.target.value))}
                    disabled={busy}
                  />
                </label>
                <span className="ac-note" style={{ opacity: 0.6 }}>
                  Mýkir mörk crop-svæðisins við composite-back.
                </span>
              </div>
            </section>
          )}

          <section className="ac-panel">
            <h2>3. Keyra</h2>
            <div className="ac-row" style={{ gap: 10 }}>
              <button
                type="button"
                className="ac-btn ac-btn-primary"
                onClick={() => void startProcessing()}
                disabled={busy || !videoFile || !faceFile}
              >
                {busy ? "Vinn…" : "Byrja"}
              </button>
              <button type="button" className="ac-btn" onClick={reset} disabled={busy}>
                Byrja upp á nýtt
              </button>
            </div>

            {stage !== "idle" && (
              <div style={{ marginTop: 14 }}>
                <div
                  style={{
                    height: 10,
                    background: "rgba(255,255,255,0.08)",
                    borderRadius: 5,
                    overflow: "hidden",
                    marginBottom: 6,
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${progress}%`,
                      background: stage === "error" ? "#ef4444" : "#4ade80",
                      transition: "width 300ms",
                    }}
                  />
                </div>
                <p className="ac-note" style={{ fontSize: 12 }}>
                  {progress}% — {progressNote || stage}
                </p>
              </div>
            )}
          </section>

          {resultUrl && resultBlob && (
            <section className="ac-panel">
              <h2>Útkoma</h2>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video
                src={resultUrl}
                controls
                playsInline
                style={{ maxWidth: "100%", borderRadius: 6, border: "1px solid var(--m-border, #333)" }}
              />
              <div className="ac-row" style={{ gap: 10, marginTop: 10 }}>
                <button type="button" className="ac-btn" onClick={download}>
                  Niðurhala
                </button>
                <SendTo
                  blob={resultBlob}
                  mediaType="video"
                  sourceTool="myndband-portret-andlit"
                  sourceToolName="Portret-andlit"
                  name={`portret-andlit-${Date.now()}.${resultMime.includes("mp4") ? "mp4" : "webm"}`}
                />
              </div>
              <VerkhringirHint tool="myndband-portret-andlit" />
            </section>
          )}
        </div>
      </div>
    </StationChrome>
  );
}
