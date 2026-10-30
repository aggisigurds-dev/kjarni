"use client";

import { useEffect, useRef, useState } from "react";
import { StationChrome } from "../../StationChrome";
import { artcraftHubHref, artcraftToolsHref } from "../apps";
import SendTo from "../SendTo";
import VerkhringirHint from "../VerkhringirHint";
import StagingPicker from "../StagingPicker";
import { useStagedSource } from "../useStagedSource";
import "../artcraft.css";

/** Myndband-andlit — arabyai-replicate/roop_face_swap á Replicate.
 *
 *  Tekur eitt myndband + eina andlitstilvísunarmynd og setur andlitið á
 *  hvert einasta andlits-frame í myndbandinu. Ólíkt image face-swap sem
 *  er sync, þá tekur video 2-10 mín, þess vegna async-poll mynstur eins
 *  og Skýjahreyfimynd.
 */

const VIDEO_ACCEPT = "video/mp4,video/webm,video/quicktime";
const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_VIDEO_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

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

export default function MyndbandAndlitClient() {
  const videoInputRef = useRef<HTMLInputElement>(null);
  const faceInputRef = useRef<HTMLInputElement>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState("");
  const [faceFile, setFaceFile] = useState<File | null>(null);
  const [facePreview, setFacePreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [resultUrl, setResultUrl] = useState("");
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const pollTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
      if (videoPreview) URL.revokeObjectURL(videoPreview);
      if (facePreview) URL.revokeObjectURL(facePreview);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function acceptVideoFile(file: File) {
    if (!file.type.startsWith("video/")) {
      setError("Þetta er ekki video-skrá.");
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      setError(`Video er of stórt (${formatBytes(file.size)}). Hámark í bili: ${formatBytes(MAX_VIDEO_BYTES)}.`);
      return;
    }
    if (videoPreview) URL.revokeObjectURL(videoPreview);
    setError("");
    setResultUrl("");
    setResultBlob(null);
    setVideoFile(file);
    setVideoPreview(URL.createObjectURL(file));
  }

  function acceptFaceFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("Þetta er ekki myndskrá.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError(`Mynd er of stór (${formatBytes(file.size)}).`);
      return;
    }
    if (facePreview) URL.revokeObjectURL(facePreview);
    setError("");
    setFaceFile(file);
    setFacePreview(URL.createObjectURL(file));
  }

  // Staged source: ef URL hefur ?use=<id>, þá athugum við hvort stageðið sé
  // video eða mynd og setjum í rétta slotið.
  useStagedSource(async (blob, item) => {
    const name = item.name || `from-${item.sourceTool}`;
    if (item.mediaType === "video") {
      acceptVideoFile(new File([blob], name.endsWith(".mp4") ? name : `${name}.mp4`, { type: blob.type || "video/mp4" }));
    } else {
      acceptFaceFile(new File([blob], name.endsWith(".png") || name.endsWith(".jpg") ? name : `${name}.png`, { type: blob.type || "image/png" }));
    }
  });

  async function pollStatus(predictionId: string, submittedAt: number) {
    const maxWait = 10 * 60 * 1000;
    const elapsed = Date.now() - submittedAt;
    if (elapsed > maxWait) {
      setBusy(false);
      setError("Tímamörk — Replicate skilaði ekki innan 10 mínútna.");
      return;
    }
    try {
      const res = await fetch(`/api/myndband-andlit/status?id=${encodeURIComponent(predictionId)}`);
      const data = (await res.json()) as StatusResponse;
      if ("error" in data && data.error) {
        setBusy(false);
        setError(data.error);
        return;
      }
      if ("status" in data) {
        if (data.status === "succeeded" && "videos" in data && data.videos.length > 0) {
          const url = data.videos[0];
          setStatus("Sæki video…");
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
        setStatus(`Vinnslur: ${data.status}…`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Villa í stöðuskoðun");
      setBusy(false);
      return;
    }
    pollTimerRef.current = window.setTimeout(() => pollStatus(predictionId, submittedAt), 5000);
  }

  async function run() {
    if (!videoFile) {
      setError("Veldu video fyrst.");
      return;
    }
    if (!faceFile) {
      setError("Veldu andlits-tilvísunarmynd.");
      return;
    }
    setBusy(true);
    setStatus("Hleð upp…");
    setError("");
    setResultUrl("");
    setResultBlob(null);
    try {
      const [videoData, faceData] = await Promise.all([
        blobToDataUrl(videoFile),
        blobToDataUrl(faceFile),
      ]);
      setStatus("Sendi á Replicate…");
      const res = await fetch("/api/myndband-andlit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video: videoData, faceImage: faceData }),
      });
      const data = (await res.json()) as SubmitResponse;
      if (!res.ok || "error" in data) {
        throw new Error(("error" in data && data.error) || `Villa (${res.status})`);
      }
      if ("videos" in data && data.videos.length > 0) {
        const url = data.videos[0];
        setStatus("Sæki video…");
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
    const base = (videoFile?.name || "video").replace(/\.[^.]+$/, "");
    a.download = `${base}-andlit.mp4`;
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
            {" · Myndband-andlit"}
          </p>
          <h1>Myndband-andlit</h1>
          <p className="ac-lead">
            Setja eitt andlit á allt myndband — frame-fyrir-frame. Fullkomið þegar Skýjahreyfimynd
            breytti andliti frumritsins, eða þegar þú vilt rammalæsa eina persónu í myndbandi.
            Keyrir arabyai-replicate/roop_face_swap á Replicate.
          </p>

          {error && <p className="ac-error">{error}</p>}

          <section className="ac-panel">
            <div className="ac-row" style={{ gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
              {/* Video slot */}
              <div style={{ flex: "1 1 320px", minWidth: 280 }}>
                <h3 style={{ marginTop: 0 }}>Myndbandið</h3>
                <p className="ac-hint" style={{ fontSize: 12, opacity: 0.65 }}>
                  Það video sem andlitið verður sett á.
                </p>
                {videoFile ? (
                  <>
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                    <video
                      src={videoPreview}
                      controls
                      style={{ width: "100%", maxHeight: 240, borderRadius: 6, background: "#000" }}
                    />
                    <p className="ac-hint" style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
                      {videoFile.name} · {formatBytes(videoFile.size)}
                    </p>
                    <button
                      type="button"
                      className="ac-btn ghost"
                      onClick={() => {
                        if (videoPreview) URL.revokeObjectURL(videoPreview);
                        setVideoFile(null);
                        setVideoPreview("");
                      }}
                      disabled={busy}
                    >
                      Nýtt video
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="ac-btn"
                      onClick={() => videoInputRef.current?.click()}
                    >
                      Velja video
                    </button>
                    <div style={{ marginTop: 8 }}>
                      <StagingPicker
                        accepts="video"
                        onPick={async (blob, item) => {
                          const name = item.name || `from-${item.sourceTool}.mp4`;
                          acceptVideoFile(new File([blob], name, { type: blob.type || "video/mp4" }));
                        }}
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Face slot */}
              <div style={{ flex: "1 1 320px", minWidth: 280 }}>
                <h3 style={{ marginTop: 0 }}>Andlits-tilvísun</h3>
                <p className="ac-hint" style={{ fontSize: 12, opacity: 0.65 }}>
                  Eitt skýrt framan-skot af persónunni sem þú vilt lokka á myndbandið.
                </p>
                {faceFile ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={facePreview}
                      alt="Andlits-tilvísun"
                      style={{ width: "100%", maxHeight: 240, objectFit: "contain", borderRadius: 6, background: "#000" }}
                    />
                    <p className="ac-hint" style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
                      {faceFile.name} · {formatBytes(faceFile.size)}
                    </p>
                    <button
                      type="button"
                      className="ac-btn ghost"
                      onClick={() => {
                        if (facePreview) URL.revokeObjectURL(facePreview);
                        setFaceFile(null);
                        setFacePreview("");
                      }}
                      disabled={busy}
                    >
                      Ný andlits-mynd
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="ac-btn"
                      onClick={() => faceInputRef.current?.click()}
                    >
                      Velja andlits-mynd
                    </button>
                    <div style={{ marginTop: 8 }}>
                      <StagingPicker
                        accepts="image"
                        onPick={async (blob, item) => {
                          const name = item.name || `from-${item.sourceTool}.png`;
                          acceptFaceFile(new File([blob], name, { type: blob.type || "image/png" }));
                        }}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            <input
              ref={videoInputRef}
              type="file"
              accept={VIDEO_ACCEPT}
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) acceptVideoFile(file);
                e.target.value = "";
              }}
            />
            <input
              ref={faceInputRef}
              type="file"
              accept={IMAGE_ACCEPT}
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) acceptFaceFile(file);
                e.target.value = "";
              }}
            />

            <button
              type="button"
              className="ac-btn"
              onClick={() => void run()}
              disabled={busy || !videoFile || !faceFile}
              style={{ marginTop: 16 }}
            >
              {busy ? status || "Vinn…" : "Setja andlit á video"}
            </button>
            {busy && (
              <p className="ac-hint" style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
                Vinnsla getur tekið 2-10 mín eftir videoe-lengd — ekki loka síðunni.
              </p>
            )}
          </section>

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
                  Sækja video
                </button>
                {resultBlob && (
                  <SendTo
                    blob={resultBlob}
                    mediaType="video"
                    sourceTool="myndband-andlit"
                    sourceToolName="Myndband-andlit"
                    name={`${(videoFile?.name || "video").replace(/\.[^.]+$/, "")}-andlit.mp4`}
                  />
                )}
              </div>
              <VerkhringirHint tool="myndband-andlit" />
            </section>
          )}
        </div>
      </div>
    </StationChrome>
  );
}
