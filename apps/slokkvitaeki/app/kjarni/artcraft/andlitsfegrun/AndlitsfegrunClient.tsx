"use client";

import { useRef, useState } from "react";
import { StationChrome } from "../../StationChrome";
import { artcraftHubHref, artcraftToolsHref } from "../apps";
import ImageZoom from "../ImageZoom";
import SendTo from "../SendTo";
import StagingPicker from "../StagingPicker";
import VerkhringirHint from "../VerkhringirHint";
import { useStagedSource } from "../useStagedSource";
import "../artcraft.css";
import {
  DEFAULT_RETOUCH_SETTINGS,
  RETOUCH_OPTIONS,
  generateRetouch,
  readStoredRetouchSettings,
  toResizedDataUrl,
  type RetouchSettings,
} from "./retouch";

const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";

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

export default function AndlitsfegrunClient() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [resultUrl, setResultUrl] = useState("");
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState<RetouchSettings>(() =>
    typeof window === "undefined" ? DEFAULT_RETOUCH_SETTINGS : readStoredRetouchSettings(),
  );

  function updateSettings(patch: Partial<RetouchSettings>) {
    setSettings((cur) => {
      const next = { ...cur, ...patch };
      try {
        window.localStorage.setItem("kjarni_private_andlitsfegrun_settings", JSON.stringify(next));
      } catch {
        // localStorage unavailable — ignore, setting just won't persist
      }
      return next;
    });
  }

  function acceptFile(file: File) {
    if (!isPhotoFile(file)) return;
    setSourceUrl(URL.createObjectURL(file));
    setSourceName(file.name);
    setResultUrl("");
    setResultBlob(null);
    setError("");
  }

  useStagedSource(async (blob, item) => {
    const file = new File([blob], item.name || `from-${item.sourceTool}.png`, {
      type: blob.type || "image/png",
    });
    acceptFile(file);
  });

  async function run() {
    if (!sourceUrl) return;
    setBusy(true);
    setError("");
    try {
      const imageDataUrl = await toResizedDataUrl(sourceUrl);
      const blob = await generateRetouch(settings, imageDataUrl);
      setResultBlob(blob);
      setResultUrl(URL.createObjectURL(blob));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Andlitsfegrun mistókst.");
    } finally {
      setBusy(false);
    }
  }

  const anySelected = RETOUCH_OPTIONS.some((opt) => settings[opt.id]);

  return (
    <StationChrome tool="artcraft">
      <div className="ac-hub">
        <div className="ac-hub-in ac-studio">
          <p className="ac-kicker">
            <a href={artcraftHubHref()}>ArtCraft</a>
            {" · "}
            <a href={artcraftToolsHref()}>Tól</a>
            {" · Andlitsfegrun"}
          </p>
          <h1>Andlitsfegrun</h1>
          <p className="ac-lead">
            Veldu hvaða lagfæringar eiga að gerast — náttúrulegt portrett-retouch, ekki
            plastic-skin yfirkeyrsla. Húðáferð helst sýnileg, andlitslögun/hár/augu/bakgrunnur
            óbreytt.
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
              if (file) acceptFile(file);
            }}
          >
            <p>Slepptu portrett-mynd hér, eða</p>
            <button type="button" className="ac-btn" onClick={() => inputRef.current?.click()}>
              Velja mynd
            </button>
            <div style={{ marginTop: 8 }}>
              <StagingPicker
                accepts="image"
                onPick={async (blob, item) => {
                  const file = new File([blob], item.name || `from-${item.sourceTool}.png`, {
                    type: blob.type || "image/png",
                  });
                  acceptFile(file);
                }}
              />
            </div>
            <input
              ref={inputRef}
              type="file"
              accept={PHOTO_ACCEPT}
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) acceptFile(file);
                e.target.value = "";
              }}
            />
          </section>

          {sourceUrl && (
            <section className="ac-panel">
              <h2>Lagfæringar</h2>
              {RETOUCH_OPTIONS.map((opt) => (
                <label key={opt.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={settings[opt.id]}
                    onChange={(e) => updateSettings({ [opt.id]: e.target.checked } as Partial<RetouchSettings>)}
                  />
                  {opt.label}
                </label>
              ))}
              <label style={{ display: "block", marginTop: 8 }}>
                Annað (valfrjálst)
                <textarea
                  value={settings.extra}
                  onChange={(e) => updateSettings({ extra: e.target.value })}
                  rows={2}
                  placeholder="t.d. mýkja skuggann undir nefinu"
                />
              </label>

              {error && <p className="ac-error">{error}</p>}
              <button
                type="button"
                className="ac-btn"
                onClick={() => void run()}
                disabled={busy || !anySelected}
              >
                {busy ? "Fegrar…" : "Fegra mynd"}
              </button>
              {!anySelected && <p className="ac-hint">Veldu að minnsta kosti eina lagfæringu.</p>}
              <p className="ac-hint">
                prunaai/p-image-edit á Replicate — ~$0.01/mynd, &lt;5 sek. Þarf{" "}
                <code>REPLICATE_API_TOKEN</code> stillt sem umhverfisbreytu á þjóninum.
              </p>
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
                        <p>{busy ? "Fegrar…" : "Smelltu á „Fegra mynd“"}</p>
                      )}
                      <figcaption>Eftir</figcaption>
                    </figure>
                  </div>
                  {resultUrl && (
                    <div className="ac-cut-actions">
                      <button
                        type="button"
                        className="ac-btn"
                        onClick={() =>
                          downloadBlob(resultUrl, `${sourceName.replace(/\.[^.]+$/, "")}-fegrad.jpg`)
                        }
                      >
                        Sækja mynd
                      </button>
                      {resultBlob && (
                        <SendTo
                          blob={resultBlob}
                          mediaType="image"
                          sourceTool="andlitsfegrun"
                          sourceToolName="Andlitsfegrun"
                          name={`${sourceName.replace(/\.[^.]+$/, "")}-fegrad.jpg`}
                        />
                      )}
                    </div>
                  )}
                </article>
              </div>
              <VerkhringirHint tool="andlitsfegrun" />
            </section>
          )}
        </div>
      </div>
    </StationChrome>
  );
}
