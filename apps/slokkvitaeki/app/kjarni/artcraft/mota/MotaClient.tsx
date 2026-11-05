"use client";

import { useRef, useState } from "react";
import { StationChrome } from "../../StationChrome";
import { artcraftHubHref, artcraftToolsHref } from "../apps";
import StagingPicker from "../StagingPicker";
import { useStagedSource } from "../useStagedSource";
import type { Raster } from "../studio/adjust";
import "../artcraft.css";
import { MAX_WORKING, loadRaster } from "./canvasUtil";
import MotaEditor from "./MotaEditor";
import MotaVideo from "./MotaVideo";

const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";
const VIDEO_ACCEPT = "video/mp4,video/webm,video/quicktime";
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

function isPhotoFile(file: { type: string; name: string }): boolean {
  if (/^image\/(jpeg|png|webp)$/i.test(file.type)) return true;
  return /\.(jpe?g|png|webp)$/i.test(file.name);
}

type Loaded = { raster: Raster; name: string; mime: string; key: number };
type VideoSession = { image: Blob | null; video: Blob | null; name: string; key: number };

/** Móta: upphafsskjár til að velja mynd; síðan opnast ritillinn á öllum
 *  skjánum (MotaEditor). Allt keyrir í vafranum — engin mynd er send neitt. */
export default function MotaClient() {
  const inputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  // Myndbandshamur: heldur bútunum sínum á meðan farið er í myndaham og til baka.
  const [video, setVideo] = useState<VideoSession | null>(null);
  const [mode, setMode] = useState<"image" | "video">("image");
  const [drag, setDrag] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function open(file: File) {
    if (!isPhotoFile(file)) {
      setError("Veldu JPEG-, PNG- eða WebP-mynd.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const raster = await loadRaster(file, MAX_WORKING);
      setLoaded({ raster, name: file.name || "mynd.jpg", mime: file.type || "image/jpeg", key: Date.now() });
      setMode("image");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gat ekki opnað myndina.");
    } finally {
      setLoading(false);
    }
  }

  function openVideo(file: File) {
    if (!file.type.startsWith("video/")) {
      setError("Veldu MP4-, WebM- eða MOV-myndband.");
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      setError("Myndbandið er of stórt (hámark 200 MB).");
      return;
    }
    setError("");
    setVideo({ image: null, video: file, name: file.name || "myndband.mp4", key: Date.now() });
    setMode("video");
  }

  useStagedSource(async (blob, item) => {
    if (item.mediaType === "video" || blob.type.startsWith("video/")) {
      openVideo(new File([blob], item.name || `from-${item.sourceTool}.mp4`, { type: blob.type || "video/mp4" }));
      return;
    }
    const file = new File([blob], item.name || `from-${item.sourceTool}.png`, { type: blob.type || "image/png" });
    await open(file);
  });

  return (
    <StationChrome tool="artcraft">
      <div className="ac-hub">
        <div className="ac-hub-in ac-studio">
          <p className="ac-kicker">
            <a href={artcraftHubHref()}>ArtCraft</a>
            {" · "}
            <a href={artcraftToolsHref()}>Tól</a>
            {" · Móta"}
          </p>
          <h1>Móta</h1>
          <p className="ac-lead">
            Mynd- og myndbandaritill eins og í símanum: líkamsmótun, burstar, ljós og litir, gervigreindartól
            (bakgrunnur, endurljós, fjarlægja hlut …) og myndbandshamur með framhaldi frá völdum ramma. Klíptu
            með tveimur fingrum til að zoom-a. Myndir eru vistaðar í allt að {MAX_WORKING} punkta upplausn.
          </p>

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
              if (file) void open(file);
            }}
          >
            <p>{loading ? "Opna mynd…" : "Slepptu mynd hér, eða"}</p>
            <button type="button" className="ac-btn" onClick={() => inputRef.current?.click()} disabled={loading}>
              Velja mynd
            </button>{" "}
            <button type="button" className="ac-btn ghost" onClick={() => videoInputRef.current?.click()} disabled={loading}>
              Velja myndband
            </button>
            <input
              ref={videoInputRef}
              type="file"
              accept={VIDEO_ACCEPT}
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) openVideo(file);
              }}
            />
            <input
              ref={inputRef}
              type="file"
              accept={PHOTO_ACCEPT}
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void open(file);
              }}
            />
            <div style={{ marginTop: 8 }}>
              <StagingPicker
                accepts="image"
                onPick={async (blob, item) => {
                  const file = new File([blob], item.name || `from-${item.sourceTool}.png`, { type: blob.type || "image/png" });
                  await open(file);
                }}
              />
            </div>
          </section>

          {error && <p className="ac-error">{error}</p>}
        </div>
      </div>

      {loaded && (
        <MotaEditor
          key={loaded.key}
          initial={loaded.raster}
          name={loaded.name}
          mime={loaded.mime}
          active={mode === "image"}
          onClose={() => {
            setLoaded(null);
            setVideo(null);
          }}
          onReplace={(file) => void open(file)}
          onVideoMode={(image) => {
            // Sama myndbandslota helst; myndin uppfærist fyrir „Hreyfa mynd“.
            setVideo((v) => (v ? { ...v, image } : { image, video: null, name: loaded.name, key: Date.now() }));
            setMode("video");
          }}
        />
      )}
      {video && (
        <MotaVideo
          key={video.key}
          active={mode === "video"}
          initialImage={video.image}
          initialVideo={video.video}
          name={video.name}
          onClose={() => {
            setVideo(null);
            setMode("image");
          }}
          onImageMode={(frame) => {
            if (frame && (!loaded || window.confirm("Opna rammann í myndaham? Myndin sem er opin þar lokast."))) {
              const f = new File([frame], `${video.name.replace(/\.[^.]+$/, "")}-rammi.png`, { type: "image/png" });
              void open(f);
              return;
            }
            if (loaded) setMode("image");
            else {
              setVideo(null);
              setMode("image");
            }
          }}
        />
      )}
    </StationChrome>
  );
}
