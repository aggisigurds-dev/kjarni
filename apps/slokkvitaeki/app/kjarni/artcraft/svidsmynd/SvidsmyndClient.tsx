"use client";

import { useRef, useState } from "react";
import { StationChrome } from "../../StationChrome";
import { artcraftHubHref, artcraftBakgrunnurHref, artcraftToolsHref } from "../apps";
import ImageZoom from "../ImageZoom";
import SendTo from "../SendTo";
import StagingPicker from "../StagingPicker";
import VerkhringirHint from "../VerkhringirHint";
import { useStagedSource } from "../useStagedSource";
import "../artcraft.css";
import { PRODUCTS } from "../../../verslun/products";
import {
  DEFAULT_SCENE_SETTINGS,
  SCENE_PRESETS,
  generateScene,
  readStoredSceneSettings,
  toResizedDataUrl,
  type SceneSettings,
} from "./scene";

const PRODUCT_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
const SAMPLES = PRODUCTS.filter((p) => p.img).slice(0, 4);

function isProductImageFile(file: { type: string; name: string }): boolean {
  if (/^image\/(jpeg|png|webp)$/i.test(file.type)) return true;
  return /\.(jpe?g|png|webp)$/i.test(file.name);
}

function downloadBlob(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
}

export default function SvidsmyndClient() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [resultUrl, setResultUrl] = useState("");
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState<SceneSettings>(() =>
    typeof window === "undefined" ? DEFAULT_SCENE_SETTINGS : readStoredSceneSettings(),
  );

  function updateSettings(patch: Partial<SceneSettings>) {
    setSettings((cur) => {
      const next = { ...cur, ...patch };
      try {
        window.localStorage.setItem("kjarni_private_svidsmynd_settings", JSON.stringify(next));
      } catch {
        // localStorage unavailable — ignore, setting just won't persist
      }
      return next;
    });
  }

  function acceptFile(file: File) {
    if (!isProductImageFile(file)) return;
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
    if (!settings.prompt.trim()) {
      setError("Lýstu umhverfinu fyrst, eða veldu forstillingu.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const imageDataUrl = await toResizedDataUrl(sourceUrl);
      const results = await generateScene(settings, imageDataUrl);
      const blob = results[0];
      setResultBlob(blob);
      setResultUrl(URL.createObjectURL(blob));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sviðsmynd mistókst.");
    } finally {
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
            {" · Sviðsmynd"}
          </p>
          <h1>Sviðsmynd</h1>
          <p className="ac-lead">
            Slepptu vörumynd, lýstu umhverfinu — AI býr til nýjan bakgrunn og heldur vörunni
            sjálfri óbreyttri. Enginn handvirkur bursti, engin gríma. Vantar bara hreina
            gegnsæja eða hvíta útskurð? Notaðu{" "}
            <a href={artcraftBakgrunnurHref()}>Bakgrunn</a> í staðinn.
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
            <p>Slepptu vörumynd hér, eða</p>
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
              accept={PRODUCT_IMAGE_ACCEPT}
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) acceptFile(file);
                e.target.value = "";
              }}
            />
          </section>

          <section className="ac-panel">
            <h2>Prufa á vörum úr versluninni</h2>
            <p className="ac-hint">Sömu slökkvitæki og á verslunarsíðunni — smelltu til að byrja.</p>
            <div className="ac-samples">
              {SAMPLES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="ac-sample"
                  disabled={busy}
                  onClick={() => {
                    setSourceUrl(item.img!);
                    setSourceName(`${item.name}.jpg`);
                    setResultUrl("");
                    setResultBlob(null);
                    setError("");
                  }}
                >
                  <img src={item.img} alt="" />
                  <span>{item.name}</span>
                </button>
              ))}
            </div>
          </section>

          {sourceUrl && (
            <section className="ac-panel">
              <h2>Umhverfi</h2>
              <p className="ac-hint">Veldu forstillingu til að byrja, eða skrifaðu þína eigin lýsingu.</p>
              <div className="ac-samples">
                {SCENE_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    className="ac-btn ghost"
                    disabled={busy}
                    onClick={() => updateSettings({ prompt: preset.prompt })}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <label style={{ display: "block", marginTop: 12 }}>
                Lýsing á umhverfinu
                <textarea
                  value={settings.prompt}
                  onChange={(e) => updateSettings({ prompt: e.target.value })}
                  rows={3}
                  placeholder="t.d. hvítt marmaraborð, mjúk stúdíólýsing"
                />
              </label>
              <label style={{ display: "block", marginTop: 8 }}>
                Hvað á EKKI að birtast (valfrjálst)
                <textarea
                  value={settings.negativePrompt}
                  onChange={(e) => updateSettings({ negativePrompt: e.target.value })}
                  rows={2}
                />
              </label>

              {error && <p className="ac-error">{error}</p>}
              <button type="button" className="ac-btn" onClick={() => void run()} disabled={busy}>
                {busy ? "Býr til senu…" : "Búa til senu"}
              </button>
              <p className="ac-hint">
                bria/generate-background á Replicate — ~$0.03–0.05/mynd, 10–20 sek. Þjálfað eingöngu
                á leyfisskyldum gögnum. Þarf <code>REPLICATE_API_TOKEN</code> stillt sem
                umhverfisbreytu á þjóninum.
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
                        <p>{busy ? "Býr til senu…" : "Smelltu á „Búa til senu“"}</p>
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
                          downloadBlob(resultUrl, `${sourceName.replace(/\.[^.]+$/, "")}-sena.png`)
                        }
                      >
                        Sækja mynd
                      </button>
                      {resultBlob && (
                        <SendTo
                          blob={resultBlob}
                          mediaType="image"
                          sourceTool="svidsmynd"
                          sourceToolName="Sviðsmynd"
                          name={`${sourceName.replace(/\.[^.]+$/, "")}-sena.png`}
                        />
                      )}
                    </div>
                  )}
                </article>
              </div>
              <VerkhringirHint tool="svidsmynd" />
            </section>
          )}
        </div>
      </div>
    </StationChrome>
  );
}
