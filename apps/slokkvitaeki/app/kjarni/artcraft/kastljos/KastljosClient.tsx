"use client";

import { useRef, useState } from "react";
import { StationChrome } from "../../StationChrome";
import { artcraftHubHref, artcraftToolsHref } from "../apps";
import ImageZoom from "../ImageZoom";
import SendTo from "../SendTo";
import StagingPicker from "../StagingPicker";
import { useStagedSource } from "../useStagedSource";
import "../artcraft.css";
import {
  DEFAULT_SPOTLIGHT_SETTINGS,
  GRADIENT_DIRECTIONS,
  type EdgeAmounts,
  type GradientDirection,
  type SpotlightSettings,
} from "./gradient";
import { personMask, renderSpotlight } from "./mask";

const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";

const DIRECTION_LABEL: Record<GradientDirection, string> = {
  upp: "↑ Upp",
  nidur: "↓ Niður",
  vinstri: "← Vinstri",
  haegri: "→ Hægri",
};

function isPhotoFile(file: { type: string; name: string }): boolean {
  if (/^image\/(jpeg|png|webp)$/i.test(file.type)) return true;
  return /\.(jpe?g|png|webp)$/i.test(file.name);
}

function downloadBlob(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
}

/** Four sliders, one per edge, -100..100 — negative darkens that edge,
 * positive brightens it, and all four can be set at once so corners can
 * stack (e.g. "dark bottom" + "darker right" together). */
function EdgeSliders({ value, onChange }: { value: EdgeAmounts; onChange: (next: EdgeAmounts) => void }) {
  return (
    <div className="ac-edges">
      {GRADIENT_DIRECTIONS.map((d) => (
        <label key={d} className="ac-edge">
          {DIRECTION_LABEL[d]} ({value[d]}%{value[d] > 0 ? " — bjartara" : value[d] < 0 ? " — dekkra" : ""})
          <input
            type="range"
            min={-100}
            max={100}
            value={value[d]}
            onChange={(e) => onChange({ ...value, [d]: Number(e.target.value) })}
          />
        </label>
      ))}
    </div>
  );
}

export default function KastljosClient() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [sourceBlob, setSourceBlob] = useState<Blob | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [sourceSize, setSourceSize] = useState({ width: 0, height: 0 });

  const [settings, setSettings] = useState<SpotlightSettings>(DEFAULT_SPOTLIGHT_SETTINGS);
  const [resultUrl, setResultUrl] = useState("");
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const maskRef = useRef<Awaited<ReturnType<typeof personMask>> | null>(null);

  async function addFile(file: File) {
    if (!isPhotoFile(file)) return;
    const url = URL.createObjectURL(file);
    const bitmap = await createImageBitmap(file);
    setSourceBlob(file);
    setSourceUrl(url);
    setSourceName(file.name);
    setSourceSize({ width: bitmap.width, height: bitmap.height });
    maskRef.current = null;
    setResultUrl("");
    setResultBlob(null);
    setError("");
  }

  useStagedSource(async (blob, item) => {
    const file = new File([blob], item.name || `from-${item.sourceTool}.png`, {
      type: blob.type || "image/png",
    });
    await addFile(file);
  });

  async function run() {
    if (!sourceBlob) return;
    setBusy(true);
    setError("");
    try {
      if (!maskRef.current) {
        setProgress("Finn persónuna…");
        maskRef.current = await personMask(sourceBlob, sourceSize.width, sourceSize.height, (current, total) => {
          if (total > 0) setProgress(`Finn persónuna… ${Math.round((current / total) * 100)}%`);
        });
      }
      setProgress("Reikna birtu…");
      const fixed = await renderSpotlight(sourceBlob, maskRef.current, settings);
      setResultBlob(fixed);
      setResultUrl(URL.createObjectURL(fixed));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kastljós mistókst.");
    } finally {
      setProgress("");
      setBusy(false);
    }
  }

  return (
    <StationChrome tool="artcraft">
      <div className="ac-hub">
        <div className="ac-hub-in ac-studio">
          <p className="ac-kicker">
            <a href={artcraftHubHref()}>ArtCraft</a>
            {" · "}
            <a href={artcraftToolsHref()}>Tól</a>
            {" · Kastljós"}
          </p>
          <h1>Kastljós</h1>
          <p className="ac-lead">
            Finnur persónuna sjálfkrafa og stillir birtuna sitt í hvoru lagi á henni og
            bakgrunninum — stefna og styrkur fyrir hvort um sig. Allt gerist í vafranum, engin
            mynd fer neitt.
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
              if (file) void addFile(file);
            }}
          >
            <p>Slepptu mynd hér, eða</p>
            <button type="button" className="ac-btn" onClick={() => inputRef.current?.click()}>
              Velja mynd
            </button>
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

          {sourceUrl && (
            <section className="ac-panel">
              <h2>Bakgrunnur — stilltu hverja hlið sér</h2>
              <p className="ac-hint">
                Hægt að stilla allar fjórar hliðar í einu — t.d. dökkt að neðan og hægra megin, ljósara
                vinstra megin.
              </p>
              <EdgeSliders
                value={settings.background}
                onChange={(next) => setSettings((s) => ({ ...s, background: next }))}
              />

              <h2>Persóna — bjartari eða dekkri frá hverri hlið</h2>
              <EdgeSliders value={settings.person} onChange={(next) => setSettings((s) => ({ ...s, person: next }))} />

              {progress && <p className="ac-status">{progress}</p>}
              {error && <p className="ac-error">{error}</p>}
              <button type="button" className="ac-btn" onClick={() => void run()} disabled={busy}>
                {busy ? "Vinn…" : "Reikna kastljós"}
              </button>
              {maskRef.current && (
                <p className="ac-hint">
                  Persónugríma er þegar fundin — breyttu stillingum og ýttu aftur, það tekur
                  sekúndubrot (grímu þarf aðeins að finna einu sinni).
                </p>
              )}
            </section>
          )}

          {sourceUrl && (
            <section className="ac-panel">
              <h2>Útkoma</h2>
              <div className="ac-cuts">
                <article className="ac-cut">
                  <div className="ac-cut-pair">
                    <figure>
                      <ImageZoom src={sourceUrl} alt={`Fyrir: ${sourceName}`} />
                      <figcaption>Fyrir</figcaption>
                    </figure>
                    <figure className="ac-cut-out">
                      {resultUrl ? (
                        <ImageZoom src={resultUrl} alt={`Eftir: ${sourceName}`} />
                      ) : (
                        <p>{busy ? "Vinn…" : "Smelltu á „Reikna kastljós“"}</p>
                      )}
                      <figcaption>Eftir</figcaption>
                    </figure>
                  </div>
                  {resultUrl && (
                    <div className="ac-cut-actions ac-row">
                      <button
                        type="button"
                        className="ac-btn"
                        onClick={() => downloadBlob(resultUrl, `${sourceName.replace(/\.[^.]+$/, "")}-kastljos.jpg`)}
                      >
                        Sækja mynd
                      </button>
                      {resultBlob && (
                        <SendTo
                          blob={resultBlob}
                          mediaType="image"
                          sourceTool="kastljos"
                          sourceToolName="Kastljós"
                          name={`${sourceName.replace(/\.[^.]+$/, "") || "mynd"}-kastljos.jpg`}
                        />
                      )}
                    </div>
                  )}
                </article>
              </div>
            </section>
          )}
        </div>
      </div>
    </StationChrome>
  );
}
