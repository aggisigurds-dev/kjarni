"use client";

import { useRef, useState } from "react";
import { StationChrome } from "../../StationChrome";
import { artcraftHubHref, artcraftToolsHref } from "../apps";
import "../artcraft.css";
import {
  DEFAULT_SPOTLIGHT_SETTINGS,
  GRADIENT_DIRECTIONS,
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

function DirectionPicker({
  value,
  onChange,
}: {
  value: GradientDirection;
  onChange: (d: GradientDirection) => void;
}) {
  return (
    <div className="ac-modes" role="radiogroup">
      {GRADIENT_DIRECTIONS.map((d) => (
        <button
          key={d}
          type="button"
          role="radio"
          aria-checked={value === d}
          className={value === d ? "on" : undefined}
          onClick={() => onChange(d)}
        >
          {DIRECTION_LABEL[d]}
        </button>
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
    setError("");
  }

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
          </section>

          {sourceUrl && (
            <section className="ac-panel">
              <h2>Bakgrunnur — dimmir frá einni hlið</h2>
              <DirectionPicker
                value={settings.backgroundDirection}
                onChange={(d) => setSettings((s) => ({ ...s, backgroundDirection: d }))}
              />
              <label>
                Styrkur ({Math.round(settings.backgroundStrength * 100)}%)
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(settings.backgroundStrength * 100)}
                  onChange={(e) => setSettings((s) => ({ ...s, backgroundStrength: Number(e.target.value) / 100 }))}
                />
              </label>

              <h2>Persóna — bjartari eða dekkri frá einni hlið</h2>
              <DirectionPicker
                value={settings.personDirection}
                onChange={(d) => setSettings((s) => ({ ...s, personDirection: d }))}
              />
              <label>
                Styrkur ({Math.round(settings.personStrength * 100)}% —{" "}
                {settings.personStrength > 0 ? "bjartara" : settings.personStrength < 0 ? "dekkra" : "óbreytt"})
                <input
                  type="range"
                  min={-100}
                  max={100}
                  value={Math.round(settings.personStrength * 100)}
                  onChange={(e) => setSettings((s) => ({ ...s, personStrength: Number(e.target.value) / 100 }))}
                />
              </label>

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
                      <img src={sourceUrl} alt={`Fyrir: ${sourceName}`} />
                      <figcaption>Fyrir</figcaption>
                    </figure>
                    <figure className="ac-cut-out">
                      {resultUrl ? (
                        <img src={resultUrl} alt={`Eftir: ${sourceName}`} />
                      ) : (
                        <p>{busy ? "Vinn…" : "Smelltu á „Reikna kastljós“"}</p>
                      )}
                      <figcaption>Eftir</figcaption>
                    </figure>
                  </div>
                  {resultUrl && (
                    <div className="ac-cut-actions">
                      <button
                        type="button"
                        className="ac-btn"
                        onClick={() => downloadBlob(resultUrl, `${sourceName.replace(/\.[^.]+$/, "")}-kastljos.jpg`)}
                      >
                        Sækja mynd
                      </button>
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
