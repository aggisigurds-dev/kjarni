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

const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";

function isPhotoFile(file: { type: string; name: string }): boolean {
  if (/^image\/(jpeg|png|webp)$/i.test(file.type)) return true;
  return /\.(jpe?g|png|webp)$/i.test(file.name);
}

type Loaded = { raster: Raster; name: string; mime: string; key: number };

/** Móta: upphafsskjár til að velja mynd; síðan opnast ritillinn á öllum
 *  skjánum (MotaEditor). Allt keyrir í vafranum — engin mynd er send neitt. */
export default function MotaClient() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gat ekki opnað myndina.");
    } finally {
      setLoading(false);
    }
  }

  useStagedSource(async (blob, item) => {
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
            Myndritill eins og í símanum: líkamsmótun, mótunarbursti, húð og lagfæringar, ljós og litir. Klíptu
            með tveimur fingrum til að zoom-a. Allt gerist í vafranum, engin mynd er send neitt, og vistað er í
            allt að {MAX_WORKING} punkta upplausn.
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
            </button>
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
          onClose={() => setLoaded(null)}
          onReplace={(file) => void open(file)}
        />
      )}
    </StationChrome>
  );
}
