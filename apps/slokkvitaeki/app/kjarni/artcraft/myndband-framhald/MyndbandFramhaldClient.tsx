"use client";

import { useEffect, useRef, useState } from "react";
import { StationChrome } from "../../StationChrome";
import { artcraftHubHref, artcraftToolsHref } from "../apps";
import SendTo from "../SendTo";
import StagingPicker from "../StagingPicker";
import { useStagedSource } from "../useStagedSource";
import "../artcraft.css";

/** Myndband-framhald — teygja myndband með því að sækja síðasta frame-ið og
 *  nota það sem image-input í Wan 2.2 i2v (gegnum /api/skyjahreyfimynd).
 *
 *  Flæði:
 *    1) notandi dropar video eða picker-ar úr staging
 *    2) við hlöðum video, seek-um alveg að endanum, drawImage á canvas,
 *       toDataURL -> last frame image
 *    3) notandi skrifar prompt um hvað eigi að gerast í framhaldinu
 *    4) call /api/skyjahreyfimynd með því frame-i + prompt -> 5-6s klippa
 *    5) notandi getur sent framhaldið í Myndbanda-saumur (síðar) eða halaði
 *       niður báðum klippunum.
 *
 *  Lykil-tækni: HTMLVideoElement.currentTime seek + canvas draw. Virkar bara
 *  á videos sem browser-inn getur spilað (mp4/webm/mov).
 */

const VIDEO_ACCEPT = "video/mp4,video/webm,video/quicktime";
const MAX_VIDEO_BYTES = 20 * 1024 * 1024;

const RESOLUTIONS = ["480p", "720p"] as const;
type Resolution = (typeof RESOLUTIONS)[number];

const ASPECT_RATIOS = ["16:9", "9:16", "1:1"] as const;
type AspectRatio = (typeof ASPECT_RATIOS)[number];

type SubmitResponse =
  | { videos: string[] }
  | { predictionId: string; status: string }
  | { error: string };

type StatusResponse =
  | { status: "succeeded"; videos: string[] }
  | { status: "failed" | "canceled"; error?: string }
  | { status: string }
  | { error: string };

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}kB`;
  return `${(n / (1024 * 1024)).toFixed(1)}MB`;
}

async function fetchVideoBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gat ekki sótt myndbandið (${res.status})`);
  return res.blob();
}

/** Sækir síðasta frame-ið úr video blob sem data URL. */
async function extractLastFrame(blob: Blob): Promise<{ dataUrl: string; width: number; height: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.crossOrigin = "anonymous";
    video.preload = "auto";
    video.playsInline = true;

    const cleanup = () => URL.revokeObjectURL(url);

    video.onerror = () => {
      cleanup();
      reject(new Error("Gat ekki opnað video (óstudd kóðun?)"));
    };

    video.onloadedmetadata = () => {
      // Seek lítinn tíma AÐEIN frá endanum. Nákvæmlega .duration er risky —
      // sum videos trigger-a ekki seeked event þar.
      const seekTo = Math.max(0, video.duration - 0.05);
      video.currentTime = seekTo;
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas 2D ekki stuttur");
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/png");
        cleanup();
        resolve({
          dataUrl,
          width: video.videoWidth,
          height: video.videoHeight,
          duration: video.duration,
        });
      } catch (err) {
        cleanup();
        reject(err instanceof Error ? err : new Error("Óvænt villa við frame-extract"));
      }
    };
  });
}

/** Vælir aspect ratio sem passar best við video dimensions. */
function matchAspectRatio(width: number, height: number): AspectRatio {
  const r = width / height;
  if (r > 1.5) return "16:9";
  if (r < 0.75) return "9:16";
  return "1:1";
}

export default function MyndbandFramhaldClient() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourcePreview, setSourcePreview] = useState("");
  const [lastFrame, setLastFrame] = useState<string>("");
  const [frameInfo, setFrameInfo] = useState<{ width: number; height: number; duration: number } | null>(null);
  const [prompt, setPrompt] = useState("The scene continues naturally with subtle motion");
  const [resolution, setResolution] = useState<Resolution>("720p");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("16:9");
  const [disableSafety, setDisableSafety] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [resultUrl, setResultUrl] = useState("");
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const pollTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
      if (sourcePreview) URL.revokeObjectURL(sourcePreview);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function acceptFile(file: File) {
    if (!file.type.startsWith("video/")) {
      setError("Þetta er ekki video-skrá.");
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      setError(`Video er of stórt (${formatBytes(file.size)}). Hámark: ${formatBytes(MAX_VIDEO_BYTES)}.`);
      return;
    }
    if (sourcePreview) URL.revokeObjectURL(sourcePreview);
    setError("");
    setResultUrl("");
    setResultBlob(null);
    setSourceFile(file);
    setSourcePreview(URL.createObjectURL(file));
    setLastFrame("");
    setFrameInfo(null);

    // Dragið út síðasta frame strax svo notandi sjái hvað framhaldið byrjar á.
    try {
      setStatus("Sæki síðasta frame…");
      const extracted = await extractLastFrame(file);
      setLastFrame(extracted.dataUrl);
      setFrameInfo({ width: extracted.width, height: extracted.height, duration: extracted.duration });
      setAspectRatio(matchAspectRatio(extracted.width, extracted.height));
      setStatus("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gat ekki sótt frame");
      setStatus("");
    }
  }

  useStagedSource(async (blob, item) => {
    const name = item.name || `from-${item.sourceTool}.mp4`;
    const file = new File([blob], name, { type: blob.type || "video/mp4" });
    await acceptFile(file);
  });

  async function pollStatus(predictionId: string, submittedAt: number) {
    const maxWait = 10 * 60 * 1000;
    if (Date.now() - submittedAt > maxWait) {
      setBusy(false);
      setError("Tímamörk — Replicate skilaði ekki innan 10 mínútna.");
      return;
    }
    try {
      const res = await fetch(`/api/skyjahreyfimynd/status?id=${encodeURIComponent(predictionId)}`);
      const data = (await res.json()) as StatusResponse;
      if ("error" in data && data.error) {
        setBusy(false);
        setError(data.error);
        return;
      }
      if ("status" in data) {
        if (data.status === "succeeded" && "videos" in data && data.videos.length > 0) {
          const url = data.videos[0];
          setStatus("Sæki framhaldið…");
          try {
            const blob = await fetchVideoBlob(url);
            setResultBlob(blob);
            setResultUrl(URL.createObjectURL(blob));
            setStatus("Klárað");
          } catch (err) {
            setError(err instanceof Error ? err.message : "Gat ekki sótt útkomuna");
          } finally {
            setBusy(false);
          }
          return;
        }
        if (data.status === "failed" || data.status === "canceled") {
          setBusy(false);
          setError(("error" in data && data.error) || `Keyrsla ${data.status}`);
          return;
        }
        setStatus(`Vinnsla: ${data.status}…`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Villa í stöðuskoðun");
      setBusy(false);
      return;
    }
    pollTimerRef.current = window.setTimeout(() => pollStatus(predictionId, submittedAt), 5000);
  }

  async function run() {
    if (!lastFrame) {
      setError("Síðasta frame vantar — hleyptu video inn fyrst.");
      return;
    }
    if (!prompt.trim()) {
      setError("Lýstu framhaldinu í prompt-reitnum.");
      return;
    }
    setBusy(true);
    setStatus("Sendi á Wan 2.2…");
    setError("");
    setResultUrl("");
    setResultBlob(null);
    try {
      const res = await fetch("/api/skyjahreyfimynd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: lastFrame,
          prompt: prompt.trim(),
          resolution,
          aspectRatio,
          numFrames: 81,
          framesPerSecond: 16,
          disableSafetyChecker: disableSafety,
        }),
      });
      const data = (await res.json()) as SubmitResponse;
      if (!res.ok || "error" in data) {
        throw new Error(("error" in data && data.error) || `Villa (${res.status})`);
      }
      if ("videos" in data && data.videos.length > 0) {
        const url = data.videos[0];
        setStatus("Sæki framhaldið…");
        const blob = await fetchVideoBlob(url);
        setResultBlob(blob);
        setResultUrl(URL.createObjectURL(blob));
        setStatus("Klárað");
        setBusy(false);
        return;
      }
      if ("predictionId" in data) {
        setStatus("Keyrir á Replicate…");
        pollStatus(data.predictionId, Date.now());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Óvænt villa");
      setBusy(false);
    }
  }

  function downloadResult() {
    if (!resultUrl) return;
    const a = document.createElement("a");
    a.href = resultUrl;
    const base = (sourceFile?.name || "video").replace(/\.[^.]+$/, "");
    a.download = `${base}-framhald.mp4`;
    a.click();
  }

  return (
    <StationChrome tool="artcraft">
      <div className="ac-hub">
        <div className="ac-hub-in ac-studio">
          <p className="ac-kicker">
            <a href={artcraftHubHref()}>ArtCraft</a>
            {" · "}
            <a href={artcraftToolsHref()}>Tól</a>
            {" · Myndband-framhald"}
          </p>
          <h1>Myndband-framhald</h1>
          <p className="ac-lead">
            Teygja myndband með því að sækja síðasta frame-ið og nota það sem byrjunarmynd á nýjan
            Wan 2.2 i2v klippu. Lýstu bara hvað eigi að gerast næst. Þú getur svo saumað
            upprunalega klippu + framhald saman í einni röð, eða ítrað aftur (framhald af framhaldi).
          </p>

          {error && <p className="ac-error">{error}</p>}

          {!sourceFile && (
            <section className="ac-drop">
              <p>Veldu myndband sem þú vilt teygja</p>
              <button type="button" className="ac-btn" onClick={() => inputRef.current?.click()}>
                Velja video
              </button>
              <div style={{ marginTop: 8 }}>
                <StagingPicker
                  accepts="video"
                  onPick={async (blob, item) => {
                    const name = item.name || `from-${item.sourceTool}.mp4`;
                    const file = new File([blob], name, { type: blob.type || "video/mp4" });
                    await acceptFile(file);
                  }}
                />
              </div>
            </section>
          )}

          <input
            ref={inputRef}
            type="file"
            accept={VIDEO_ACCEPT}
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void acceptFile(file);
              e.target.value = "";
            }}
          />

          {sourceFile && (
            <section className="ac-panel">
              <div className="ac-row" style={{ gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
                <div style={{ flex: "1 1 320px", minWidth: 280 }}>
                  <h3 style={{ marginTop: 0 }}>Uppspretta</h3>
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <video
                    src={sourcePreview}
                    controls
                    style={{ width: "100%", maxHeight: 220, borderRadius: 6, background: "#000" }}
                  />
                  <p className="ac-hint" style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
                    {sourceFile.name} · {formatBytes(sourceFile.size)}
                    {frameInfo && ` · ${frameInfo.width}×${frameInfo.height} · ${frameInfo.duration.toFixed(1)}s`}
                  </p>
                  <button
                    type="button"
                    className="ac-btn ghost"
                    onClick={() => {
                      if (sourcePreview) URL.revokeObjectURL(sourcePreview);
                      setSourceFile(null);
                      setSourcePreview("");
                      setLastFrame("");
                      setFrameInfo(null);
                    }}
                    disabled={busy}
                  >
                    Nýtt video
                  </button>
                </div>

                <div style={{ flex: "1 1 320px", minWidth: 280 }}>
                  <h3 style={{ marginTop: 0 }}>Síðasta frame (byrjun framhalds)</h3>
                  {lastFrame ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={lastFrame}
                      alt="Síðasta frame"
                      style={{ width: "100%", maxHeight: 220, objectFit: "contain", borderRadius: 6, background: "#000" }}
                    />
                  ) : (
                    <p className="ac-hint" style={{ opacity: 0.6 }}>Sæki frame…</p>
                  )}
                  <p className="ac-hint" style={{ fontSize: 12, opacity: 0.65, marginTop: 6 }}>
                    Framhaldið byrjar á þessu frame-i, svo samfella ætti að vera þétt.
                  </p>
                </div>
              </div>

              <div className="ac-settings" style={{ marginTop: 16 }}>
                <label>
                  Hvað gerist næst?
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    rows={3}
                    placeholder="Lýstu hvað eigi að gerast í framhaldinu — hreyfing, breyting á stellingu, breytt umhverfi…"
                  />
                  <small className="ac-rec">mælt: lýstu bara hreyfingu, EKKI nýjum hlutum/senum (annars missist samfella). Dæmi: „subject turns head slowly to the left while camera stays still"</small>
                </label>
                <label>
                  Upplausn
                  <select value={resolution} onChange={(e) => setResolution(e.target.value as Resolution)}>
                    {RESOLUTIONS.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                  <small className="ac-rec">mælt: sama og upprunalegt video — passar best við samtenginguna seinna</small>
                </label>
                <label>
                  Aspect ratio
                  <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}>
                    {ASPECT_RATIOS.map((a) => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={disableSafety}
                    onChange={(e) => setDisableSafety(e.target.checked)}
                  />
                  Slökkva á safety checker
                  <small className="ac-rec" style={{ marginLeft: 8 }}>mælt: Á — Wan 2.2 filter er oft of varkár á framhöld sem fylgja upprunamyndinni</small>
                </label>
              </div>

              <button
                type="button"
                className="ac-btn"
                onClick={() => void run()}
                disabled={busy || !lastFrame || !prompt.trim()}
                style={{ marginTop: 12 }}
              >
                {busy ? status || "Vinn…" : "Búa til framhald"}
              </button>
              {busy && (
                <p className="ac-hint" style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
                  Framhaldið tekur venjulega 30s–2 mín.
                </p>
              )}
            </section>
          )}

          {resultUrl && (
            <section className="ac-panel">
              <h3 style={{ marginTop: 0 }}>Framhald</h3>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video
                src={resultUrl}
                controls
                style={{ width: "100%", maxHeight: 500, borderRadius: 6, background: "#000" }}
              />
              <div className="ac-row" style={{ gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                <button type="button" className="ac-btn" onClick={downloadResult}>
                  Sækja framhaldið
                </button>
                {resultBlob && (
                  <SendTo
                    blob={resultBlob}
                    mediaType="video"
                    sourceTool="myndband-framhald"
                    sourceToolName="Myndband-framhald"
                    name={`${(sourceFile?.name || "video").replace(/\.[^.]+$/, "")}-framhald.mp4`}
                  />
                )}
              </div>
              <p className="ac-hint" style={{ fontSize: 12, opacity: 0.65, marginTop: 10 }}>
                Næsta skref: senddu bæði upprunalega videoið og framhaldið í Myndbanda-saumur til að
                sauma þau saman í eina lengri klippu.
              </p>
            </section>
          )}
        </div>
      </div>
    </StationChrome>
  );
}
