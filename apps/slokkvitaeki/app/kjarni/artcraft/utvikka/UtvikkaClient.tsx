"use client";

import { useEffect, useRef, useState } from "react";
import { StationChrome } from "../../StationChrome";
import { artcraftHubHref, artcraftToolsHref } from "../apps";
import "../artcraft.css";
import ImageZoom from "../ImageZoom";
import { shrinkImageForUpload } from "../replicateImage";
import { clearResult, formatSavedTime, loadResult, saveResult } from "../savedResults";
import SendTo from "../SendTo";
import { useStagedSource } from "../useStagedSource";
import {
  computeExtension,
  DEFAULT_UTVIKKA_SETTINGS,
  normalizeUtvikkaSettings,
  outpaintImage,
  readStoredUtvikkaSettings,
  UTVIKKA_AMOUNTS,
  UTVIKKA_DIRECTION_LABELS,
  UTVIKKA_DIRECTIONS,
  UTVIKKA_SETTINGS_KEY,
  type UtvikkaAmount,
  type UtvikkaDirection,
  type UtvikkaSettings,
} from "./model";

const SAVED_KEY = "utvikka";
const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";

function downloadBlob(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
}

export default function UtvikkaClient() {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<UtvikkaSettings>(DEFAULT_UTVIKKA_SETTINGS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [source, setSource] = useState<{ url: string; dataUrl: string; name: string; width: number; height: number } | null>(null);
  const [results, setResults] = useState<string[]>([]);
  const [resultDims, setResultDims] = useState<{ width: number; height: number } | null>(null);
  const [savedMeta, setSavedMeta] = useState<{ timestamp: number; sourceName?: string } | null>(null);
  const sourceUrlRef = useRef<string>("");
  const resultUrlsRef = useRef<string[]>([]);
  const resultBlobsRef = useRef<Blob[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  useEffect(() => {
    setSettings(readStoredUtvikkaSettings());
    setReady(true);
    void (async () => {
      const saved = await loadResult(SAVED_KEY);
      if (saved) {
        const urls = saved.blobs.map((b) => URL.createObjectURL(b));
        resultUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
        resultUrlsRef.current = urls;
        resultBlobsRef.current = saved.blobs;
        setResults(urls);
        setSavedMeta({ timestamp: saved.timestamp, sourceName: saved.sourceName });
      }
    })();
  }, []);

  useStagedSource(async (blob, item) => {
    const type = blob.type || "image/png";
    const ext = type === "image/jpeg" ? "jpg" : type === "image/webp" ? "webp" : "png";
    const file = new File([blob], item.name || `from-${item.sourceTool}.${ext}`, { type });
    await handleFile(file);
  });

  useEffect(() => {
    return () => {
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
      resultUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  function updateSettings(next: Partial<UtvikkaSettings>) {
    setSettings((s) => {
      const merged = normalizeUtvikkaSettings({ ...s, ...next });
      window.localStorage.setItem(UTVIKKA_SETTINGS_KEY, JSON.stringify(merged));
      return merged;
    });
  }

  async function handleFile(file: File) {
    setError("");
    try {
      const shrunk = await shrinkImageForUpload(file, { maxDim: 1024, mime: "image/png", quality: 0.95 });
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
      const blob = await (await fetch(shrunk.dataUrl)).blob();
      const url = URL.createObjectURL(blob);
      sourceUrlRef.current = url;
      setSource({
        url,
        dataUrl: shrunk.dataUrl,
        name: file.name,
        width: shrunk.width,
        height: shrunk.height,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gat ekki opnað myndina.");
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDrag(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  async function run() {
    if (!source) {
      setError("Veldu mynd fyrst.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { blobs, width, height } = await outpaintImage(settings, source.dataUrl);
      const urls = blobs.map((b) => URL.createObjectURL(b));
      resultUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      resultUrlsRef.current = urls;
      resultBlobsRef.current = blobs;
      setResults(urls);
      setResultDims({ width, height });
      const now = Date.now();
      setSavedMeta({ timestamp: now, sourceName: source.name });
      void saveResult({
        key: SAVED_KEY,
        timestamp: now,
        mediaType: "image",
        blobs,
        prompt: settings.prompt || `Útvíkka ${settings.direction} ${settings.amount}%`,
        mode: `${settings.direction}/${settings.amount}%`,
        sourceName: source.name,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Útvíkka mistókst.");
    } finally {
      setBusy(false);
    }
  }

  async function clearSavedResults() {
    resultUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    resultUrlsRef.current = [];
    resultBlobsRef.current = [];
    setResults([]);
    setResultDims(null);
    setSavedMeta(null);
    await clearResult(SAVED_KEY);
  }

  if (!ready) {
    return (
      <StationChrome tool="artcraft">
        <div className="ac-hub">
          <p className="ac-lead">Hleð Útvíkka…</p>
        </div>
      </StationChrome>
    );
  }

  const preview = source
    ? computeExtension(source.width, source.height, settings.direction, settings.amount)
    : null;

  return (
    <StationChrome tool="artcraft">
      <div className="ac-hub">
        <div className="ac-hub-in ac-studio">
          <p className="ac-kicker">
            <a href={artcraftHubHref()}>ArtCraft</a>
            {" · "}
            <a href={artcraftToolsHref()}>Tól</a>
            {" · Útvíkka"}
          </p>
          <h1>Útvíkka</h1>
          <p className="ac-lead">
            Flux Fill á Replicate: stækkar mynd út fyrir upprunalega rammann.
            Portrait → landscape fyrir auglýsingar, þéttur rammi → þú sérð loft og
            gólf, eða bara meira pláss í kringum vöruna. Vafrinn útvíkkar canvasið
            sjálfur og sendir mask til Flux Fill sem fyllir brúnirnar.
          </p>

          <section className="ac-panel">
            <h2>Mynd</h2>
            {!source ? (
              <div
                className={`ac-drop ${drag ? "on" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDrag(true);
                }}
                onDragLeave={() => setDrag(false)}
                onDrop={onDrop}
                onClick={() => inputRef.current?.click()}
              >
                <p>Dragðu mynd hingað eða smelltu til að velja.</p>
                <p className="ac-hint">JPEG, PNG eða WebP — allt að 1024px lengsta hliðin.</p>
                <input
                  ref={inputRef}
                  type="file"
                  accept={PHOTO_ACCEPT}
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleFile(f);
                  }}
                />
              </div>
            ) : (
              <div className="ac-source-row">
                <img src={source.url} alt={source.name} className="ac-source-thumb" />
                <div className="ac-source-meta">
                  <b>{source.name}</b>
                  <span className="ac-hint">
                    {source.width}×{source.height}px
                    {preview ? ` → ${preview.newWidth}×${preview.newHeight}px` : ""}
                  </span>
                  <button
                    type="button"
                    className="ac-btn ghost"
                    onClick={() => {
                      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
                      sourceUrlRef.current = "";
                      setSource(null);
                    }}
                  >
                    Önnur mynd
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="ac-panel">
            <h2>Útvíkkun</h2>
            <div className="ac-settings">
              <label title="Hvada hlidar a ad utvikka. Allar hlidar byr til ramma utan um myndina. Vinstri + haegri breytir portrait i landscape.">
                Hliðar
                <select
                  value={settings.direction}
                  onChange={(e) => updateSettings({ direction: e.target.value as UtvikkaDirection })}
                >
                  {UTVIKKA_DIRECTIONS.map((d) => (
                    <option key={d} value={d}>
                      {UTVIKKA_DIRECTION_LABELS[d]}
                    </option>
                  ))}
                </select>
                <small className="ac-rec">mælt: Allar hliðar (sléttur rammi); Vinstri + hægri til að breyta portrait í landscape</small>
              </label>
              <label title="Hversu mikið er bætt við á hvorri hlið sem er valin. +50% bætir hálfum myndabreidd við á hvorri hlið.">
                Magn
                <select
                  value={settings.amount}
                  onChange={(e) => updateSettings({ amount: Number(e.target.value) as UtvikkaAmount })}
                >
                  {UTVIKKA_AMOUNTS.map((a) => (
                    <option key={a} value={a}>
                      +{a}%
                    </option>
                  ))}
                </select>
                <small className="ac-rec">mælt: +50% (jafnvægi); +25% fyrir fíngerðari viðbætur, +100% fyrir dramatíska útvíkkun</small>
              </label>
              <label title="Hversu margar útgáfur af útvíkkuninni á að búa til. Hver kostar peninga.">
                Fjöldi mynda ({settings.numOutputs})
                <input
                  type="range"
                  min={1}
                  max={4}
                  step={1}
                  value={settings.numOutputs}
                  onChange={(e) => updateSettings({ numOutputs: Number(e.target.value) })}
                />
                <small className="ac-rec">mælt: 1 (hækkaðu í 2–4 til að bera saman afbrigði)</small>
              </label>
              <label title="Fjöldi diffusion skrefa. Meira = nákvæmari útkoma en lengri tími. 30 er góður meðalvegur.">
                Skref ({settings.steps})
                <input
                  type="range"
                  min={1}
                  max={50}
                  step={1}
                  value={settings.steps}
                  onChange={(e) => updateSettings({ steps: Number(e.target.value) })}
                />
                <small className="ac-rec">mælt: 30 (góður meðalvegur); 40+ fyrir hámarks nákvæmni, 20 fyrir hraða</small>
              </label>
              <label title="Hversu stíft Flux Fill fylgir prompt-inu og brúnum myndarinnar. 30 er default. Hækkaðu ef þú vilt það halda meira af upprunalegu samhengi.">
                Guidance ({settings.guidance.toFixed(0)})
                <input
                  type="range"
                  min={1}
                  max={100}
                  step={1}
                  value={settings.guidance}
                  onChange={(e) => updateSettings({ guidance: Number(e.target.value) })}
                />
                <small className="ac-rec">mælt: 30 (náttúrulegt framhald); 50+ heldur stíft við prompt en getur gefið plasticky áferð</small>
              </label>
              <label title="Slembikjarni. Sama tala + sömu stillingar = sama útkoma. Settu -1 fyrir slembna útkomu.">
                Seed (-1 = slembið)
                <input
                  type="number"
                  value={settings.seed}
                  onChange={(e) => updateSettings({ seed: Number(e.target.value) || -1 })}
                />
                <small className="ac-rec">mælt: -1 (slembið; nota fasta tölu til að endurtaka sama útkomu)</small>
              </label>
            </div>
            <label>
              Lýsing á viðbót (valkvætt — hvað á að birtast á nýju svæðunum)
              <textarea
                rows={2}
                value={settings.prompt}
                onChange={(e) => updateSettings({ prompt: e.target.value })}
                placeholder="t.d. sama bakgrunnslíking, náttúrulegt framhald, eða úthverft loft, grey wall"
              />
              <small className="ac-rec">mælt: tómt (Flux Fill les sjálft brúnir myndarinnar); skrifaðu bara ef þú vilt stýra efnisframhaldi</small>
            </label>
            <label
              style={{ display: "flex", alignItems: "center", gap: 8 }}
              title="Sleppir NSFW-filter módelsins. Kjarni leyfir nekt — aðeins kynferðislegt myndefni af börnum er bannað."
            >
              <input
                type="checkbox"
                checked={settings.disableSafetyChecker}
                onChange={(e) => updateSettings({ disableSafetyChecker: e.target.checked })}
              />
              Slökkva á safety checker
              <small className="ac-rec" style={{ marginLeft: 8 }}>mælt: AF (OFF) nema prompt-ið krefjist þess</small>
            </label>

            {error && <p className="ac-error">{error}</p>}
            <div className="ac-row">
              <button type="button" className="ac-btn" onClick={() => void run()} disabled={busy || !source}>
                {busy ? "Útvíkkar…" : "Útvíkka"}
              </button>
              <button
                type="button"
                className="ac-btn ghost"
                title="Núllstillir allar stillingar aftur í grunngildi."
                onClick={() => {
                  setSettings(DEFAULT_UTVIKKA_SETTINGS);
                  try {
                    window.localStorage.setItem(
                      UTVIKKA_SETTINGS_KEY,
                      JSON.stringify(DEFAULT_UTVIKKA_SETTINGS),
                    );
                  } catch {
                    /* ignore */
                  }
                }}
              >
                Grunngildi
              </button>
            </div>
          </section>

          {results.length > 0 && (
            <section className="ac-panel">
              <h2>Útkoma {resultDims ? `(${resultDims.width}×${resultDims.height}px)` : ""}</h2>
              {savedMeta && (
                <p className="ac-hint">
                  Vistað {formatSavedTime(savedMeta.timestamp)}
                  {savedMeta.sourceName ? ` · úr „${savedMeta.sourceName}"` : ""}
                </p>
              )}
              <div className="ac-grid">
                {results.map((url, i) => {
                  const blob = resultBlobsRef.current[i];
                  return (
                    <div key={url} className="ac-card">
                      <ImageZoom src={url} alt={`Útvíkkuð ${i + 1}`} />
                      <div className="ac-row">
                        <button
                          type="button"
                          className="ac-btn ghost"
                          onClick={() => downloadBlob(url, `utvikka-${Date.now()}-${i + 1}.webp`)}
                        >
                          Sækja
                        </button>
                        {blob && (
                          <SendTo
                            blob={blob}
                            mediaType="image"
                            sourceTool="utvikka"
                            sourceToolName="Útvíkka"
                            name={`utvikka-${i + 1}.webp`}
                            prompt={settings.prompt || `Útvíkka ${settings.direction} ${settings.amount}%`}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <button type="button" className="ac-btn ghost" onClick={() => void clearSavedResults()}>
                Hreinsa vistað
              </button>
            </section>
          )}
        </div>
      </div>
    </StationChrome>
  );
}
