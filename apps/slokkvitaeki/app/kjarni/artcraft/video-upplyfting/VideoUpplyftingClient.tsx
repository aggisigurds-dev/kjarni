"use client";

import { useEffect, useRef, useState } from "react";
import { StationChrome } from "../../StationChrome";
import { artcraftHubHref, artcraftToolsHref } from "../apps";
import SendTo from "../SendTo";
import StagingPicker from "../StagingPicker";
import { useStagedSource } from "../useStagedSource";
import "../artcraft.css";

/** Myndbanda-upplyfting — lucataco/real-esrgan-video á Replicate. Frame-for-
 *  frame upscale upp í FHD / 2K / 4K. Þrjú líkön:
 *    - RealESRGAN_x4plus (mannsmyndir, vörur, raunverulegar atriði)
 *    - RealESRGAN_x4plus_anime_6B (anime / cartoon)
 *    - realesr-animevideov3 (snöggt anime video)
 *
 *  Keyrsla getur tekið 2-10 mín eftir upprunaupplausn og framefjölda, svo
 *  við notum submit → predictionId → poll /status mynstrið (sama og
 *  Skýjahreyfimynd).
 */

const VIDEO_ACCEPT = "video/mp4,video/webm,video/quicktime";
const MAX_VIDEO_BYTES = 10 * 1024 * 1024; // 10MB — fjölgun kallar á beina upload á Replicate files API

const MODELS = [
  {
    id: "RealESRGAN_x4plus",
    label: "Standard — fólk/vörur",
    hint: "RealESRGAN x4plus — besta val fyrir raunverulegar atriði, mannsmyndir, vörur, auglýsingar.",
  },
  {
    id: "RealESRGAN_x4plus_anime_6B",
    label: "Anime 6B",
    hint: "Anime / cartoon stílað video — mýkri línur, hreinni litir.",
  },
  {
    id: "realesr-animevideov3",
    label: "Anime v3 (hraðara)",
    hint: "Hraðari útgáfa fyrir anime video — létt-gæða.",
  },
] as const;
type ModelId = (typeof MODELS)[number]["id"];

const RESOLUTIONS = [
  { id: "FHD", label: "FHD (1080p)", hint: "mælt fyrir dagleg video — rýnt, lítill tími" },
  { id: "2k", label: "2K", hint: "stærra, meiri tími" },
  { id: "4k", label: "4K", hint: "fullgæða; þrisvar sinnum tími miðað við FHD" },
] as const;
type ResolutionId = (typeof RESOLUTIONS)[number]["id"];

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
    r.onerror = () => reject(r.error || new Error("Gat ekki lesið video"));
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

export default function VideoUpplyftingClient() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourcePreview, setSourcePreview] = useState<string>("");
  const [model, setModel] = useState<ModelId>("RealESRGAN_x4plus");
  const [resolution, setResolution] = useState<ResolutionId>("FHD");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>("");
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

  function acceptFile(file: File) {
    if (!file.type.startsWith("video/")) {
      setError("Þetta er ekki video-skrá.");
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      setError(`Video er of stórt (${formatBytes(file.size)}). Hámark í bili: ${formatBytes(MAX_VIDEO_BYTES)}.`);
      return;
    }
    if (sourcePreview) URL.revokeObjectURL(sourcePreview);
    setError("");
    setResultUrl("");
    setResultBlob(null);
    setSourceFile(file);
    setSourcePreview(URL.createObjectURL(file));
  }

  useStagedSource(async (blob, item) => {
    const name = item.name || `from-${item.sourceTool}.mp4`;
    const file = new File([blob], name, { type: blob.type || "video/mp4" });
    acceptFile(file);
  });

  async function pollStatus(predictionId: string, submittedAt: number) {
    const maxWait = 10 * 60 * 1000; // 10 mín
    const elapsed = Date.now() - submittedAt;
    if (elapsed > maxWait) {
      setBusy(false);
      setError("Tímamörk — Replicate skilaði ekki innan 10 mínútna.");
      return;
    }
    try {
      const res = await fetch(`/api/video-upplyfting/status?id=${encodeURIComponent(predictionId)}`);
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
            const localUrl = URL.createObjectURL(blob);
            setResultBlob(blob);
            setResultUrl(localUrl);
            setStatus("Klárað");
          } catch (err) {
            setError(err instanceof Error ? err.message : "Gat ekki sótt upplyfta videoið");
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
    if (!sourceFile) {
      setError("Veldu video fyrst.");
      return;
    }
    setBusy(true);
    setStatus("Hleð upp…");
    setError("");
    setResultUrl("");
    setResultBlob(null);
    try {
      const dataUrl = await blobToDataUrl(sourceFile);
      setStatus("Sendi á Replicate…");
      const res = await fetch("/api/video-upplyfting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video: dataUrl, model, resolution }),
      });
      const data = (await res.json()) as SubmitResponse;
      if (!res.ok || "error" in data) {
        throw new Error(("error" in data && data.error) || `Villa (${res.status})`);
      }
      if ("videos" in data && data.videos.length > 0) {
        // Replicate warm, klárað strax
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
        setStatus(`Keyrir á Replicate…`);
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
    a.download = `${base}-upplyft-${resolution}.mp4`;
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
            {" · Myndbanda-upplyfting"}
          </p>
          <h1>Myndbanda-upplyfting</h1>
          <p className="ac-lead">
            Stækka og skerpa myndbönd upp í FHD, 2K eða 4K með Real-ESRGAN frame-for-frame á Replicate.
            Fullkomið fyrir Skýjahreyfimynd-útkomur sem koma í 480p eða 720p og þurfa að vera skarpar
            á stóra skjáinn.
          </p>

          {!sourceFile && (
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
                if (file) acceptFile(file);
              }}
            >
              <p>Slepptu video hér, eða</p>
              <button type="button" className="ac-btn" onClick={() => inputRef.current?.click()}>
                Velja video
              </button>
              <div style={{ marginTop: 8 }}>
                <StagingPicker
                  accepts="video"
                  onPick={async (blob, item) => {
                    const name = item.name || `from-${item.sourceTool}.mp4`;
                    const file = new File([blob], name, { type: blob.type || "video/mp4" });
                    acceptFile(file);
                  }}
                />
              </div>
              <p className="ac-hint" style={{ marginTop: 12, opacity: 0.65, fontSize: 12 }}>
                Hámark í bili: {formatBytes(MAX_VIDEO_BYTES)} per video. Stærri skrár má styðja síðar með beinni upload á Replicate.
              </p>
            </section>
          )}

          <input
            ref={inputRef}
            type="file"
            accept={VIDEO_ACCEPT}
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) acceptFile(file);
              e.target.value = "";
            }}
          />

          {error && <p className="ac-error">{error}</p>}

          {sourceFile && (
            <section className="ac-panel">
              <div className="ac-row" style={{ gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
                <div style={{ flex: "1 1 320px", minWidth: 280 }}>
                  <h3 style={{ marginTop: 0 }}>Uppspretta</h3>
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <video
                    src={sourcePreview}
                    controls
                    style={{ width: "100%", maxHeight: 300, borderRadius: 6, background: "#000" }}
                  />
                  <p className="ac-hint" style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
                    {sourceFile.name} · {formatBytes(sourceFile.size)}
                  </p>
                  <button
                    type="button"
                    className="ac-btn ghost"
                    onClick={() => {
                      if (sourcePreview) URL.revokeObjectURL(sourcePreview);
                      setSourceFile(null);
                      setSourcePreview("");
                      setResultUrl("");
                      setResultBlob(null);
                      setError("");
                    }}
                    disabled={busy}
                  >
                    Nýtt video
                  </button>
                </div>

                <div style={{ flex: "1 1 320px", minWidth: 280 }}>
                  <h3 style={{ marginTop: 0 }}>Stillingar</h3>
                  <label className="ac-field">
                    Líkan
                    <select
                      value={model}
                      onChange={(e) => setModel(e.target.value as ModelId)}
                      disabled={busy}
                    >
                      {MODELS.map((m) => (
                        <option key={m.id} value={m.id} title={m.hint}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                    <small className="ac-rec">mælt: Standard fyrir dagleg video; Anime bara ef source er anime</small>
                  </label>
                  <label className="ac-field">
                    Útgangs-upplausn
                    <select
                      value={resolution}
                      onChange={(e) => setResolution(e.target.value as ResolutionId)}
                      disabled={busy}
                    >
                      {RESOLUTIONS.map((r) => (
                        <option key={r.id} value={r.id} title={r.hint}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                    <small className="ac-rec">mælt: FHD fyrir dagleg video; 2K-4K bara þegar þú veist þú þarft fullgæða fyrir prent/stóra skjáinn</small>
                  </label>
                  <button
                    type="button"
                    className="ac-btn"
                    onClick={() => void run()}
                    disabled={busy}
                    style={{ marginTop: 12, width: "100%" }}
                  >
                    {busy ? status || "Vinn…" : "Upplyfta"}
                  </button>
                  {busy && (
                    <p className="ac-hint" style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
                      Vinnsla getur tekið 2-10 mín eftir upprunaupplausn og framefjölda — ekki loka síðunni.
                    </p>
                  )}
                </div>
              </div>
            </section>
          )}

          {resultUrl && (
            <section className="ac-panel">
              <h3 style={{ marginTop: 0 }}>Upplyft video</h3>
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
                    sourceTool="video-upplyfting"
                    sourceToolName="Myndbanda-upplyfting"
                    name={`${(sourceFile?.name || "video").replace(/\.[^.]+$/, "")}-upplyft-${resolution}.mp4`}
                  />
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </StationChrome>
  );
}
