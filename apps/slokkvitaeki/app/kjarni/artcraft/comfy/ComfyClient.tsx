"use client";

import { useEffect, useRef, useState } from "react";
import { StationChrome } from "../../StationChrome";
import { artcraftHubHref, artcraftToolsHref } from "../apps";
import "../artcraft.css";
import {
  COMFY_SAMPLERS,
  COMFY_SCHEDULERS,
  COMFY_URL_KEY,
  DEFAULT_COMFY_URL,
  DEFAULT_COMFY_SETTINGS,
  COMFY_SETTINGS_KEY,
  listCheckpoints,
  normalizeComfySettings,
  pingComfy,
  readStoredComfySettings,
  readStoredComfyUrl,
  txt2img,
  type ComfySettings,
} from "./comfy";

function downloadBlob(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
}

export default function ComfyClient() {
  const [ready, setReady] = useState(false);
  const [serverUrl, setServerUrl] = useState(DEFAULT_COMFY_URL);
  const [status, setStatus] = useState<"idle" | "checking" | "up" | "down">("idle");
  const [statusText, setStatusText] = useState("Ekki prófað enn");

  const [checkpoints, setCheckpoints] = useState<string[]>([]);
  const [checkpoint, setCheckpoint] = useState("");

  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [settings, setSettings] = useState<ComfySettings>(DEFAULT_COMFY_SETTINGS);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [results, setResults] = useState<string[]>([]);
  const resultUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    setServerUrl(readStoredComfyUrl());
    setSettings(readStoredComfySettings());
    setReady(true);
  }, []);

  useEffect(() => {
    return () => {
      for (const url of resultUrlsRef.current) URL.revokeObjectURL(url);
    };
  }, []);

  async function checkServer(url = serverUrl) {
    setStatus("checking");
    setStatusText("Athuga staðbundið ComfyUI…");
    setCheckpoints([]);
    const result = await pingComfy(url);
    if (result.ok) {
      setStatus("up");
      setStatusText(result.version ? `Tengt — ComfyUI ${result.version}` : "Tengt");
      window.localStorage.setItem(COMFY_URL_KEY, url);
      const names = await listCheckpoints(url);
      setCheckpoints(names);
      if (names.length && !checkpoint) setCheckpoint(names[0]);
    } else {
      setStatus("down");
      setStatusText(result.error);
    }
  }

  function updateSettings(next: Partial<ComfySettings>) {
    setSettings((s) => {
      const merged = normalizeComfySettings({ ...s, ...next });
      window.localStorage.setItem(COMFY_SETTINGS_KEY, JSON.stringify(merged));
      return merged;
    });
  }

  async function run() {
    if (!prompt.trim()) {
      setError("Skrifaðu prompt fyrst.");
      return;
    }
    if (!checkpoint) {
      setError("Veldu checkpoint-líkan — athugaðu tengingu ef listinn er tómur.");
      return;
    }
    setBusy(true);
    setError("");
    setProgress("");
    try {
      const blobs = await txt2img(
        serverUrl,
        {
          checkpoint,
          prompt,
          negativePrompt,
          steps: settings.steps,
          width: settings.width,
          height: settings.height,
          cfg: settings.cfg,
          seed: settings.seed,
          samplerName: settings.samplerName,
          scheduler: settings.scheduler,
          batchSize: settings.batchSize,
        },
        setProgress,
      );
      for (const url of resultUrlsRef.current) URL.revokeObjectURL(url);
      const urls = blobs.map((b) => URL.createObjectURL(b));
      resultUrlsRef.current = urls;
      setResults(urls);
      setStatus("up");
    } catch (err) {
      setError(err instanceof Error ? err.message : "ComfyUI-myndgerð mistókst.");
    } finally {
      setProgress("");
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <StationChrome tool="artcraft">
        <div className="ac-hub">
          <p className="ac-lead">Hleð ComfyUI…</p>
        </div>
      </StationChrome>
    );
  }

  return (
    <StationChrome tool="artcraft">
      <div className="ac-hub">
        <div className="ac-hub-in ac-studio">
          <p className="ac-kicker">
            <a href={artcraftHubHref()}>ArtCraft</a>
            {" · "}
            <a href={artcraftToolsHref()}>Tól</a>
            {" · ComfyUI"}
          </p>
          <h1>ComfyUI</h1>
          <p className="ac-lead">
            Texti → mynd gegnum þitt eigið ComfyUI á vélinni þinni — hnútaverkið sjálft er einfalt
            (checkpoint → CLIP → KSampler → mynd), svo hægt er að skipta síðar um flóknara workflow.
            Myndin fer aldrei í skýið.
          </p>

          <section className="ac-panel">
            <h2>Staðbundinn ComfyUI-netþjónn</h2>
            <p className="ac-hint">
              Ræstu ComfyUI með <code>--enable-cors-header</code> (annars hafnar vafrinn köllunum),
              svo prófaðu tengingu. Sjá <code>tools/comfy/README.md</code>.
            </p>
            <div className="ac-row">
              <label>
                Slóð
                <input
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  spellCheck={false}
                  autoCapitalize="off"
                />
              </label>
              <button
                type="button"
                className="ac-btn ghost"
                onClick={() => void checkServer()}
                disabled={status === "checking"}
              >
                Prófa tengingu
              </button>
            </div>
            <p className={`ac-status ${status}`}>{statusText}</p>
            {status === "up" && (
              <label>
                Checkpoint-líkan
                {checkpoints.length ? (
                  <select value={checkpoint} onChange={(e) => setCheckpoint(e.target.value)}>
                    {checkpoints.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="ac-hint">
                    Ekkert checkpoint fannst í <code>models/checkpoints</code> hjá ComfyUI.
                  </p>
                )}
              </label>
            )}
          </section>

          <section className="ac-panel">
            <h2>Prompt</h2>
            <label>
              Lýsing
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={3}
                placeholder="t.d. photorealistic portrait, studio lighting, sharp focus"
              />
            </label>
            <label>
              Neikvæð lýsing (má sleppa)
              <textarea
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                rows={2}
                placeholder="t.d. blurry, low quality, extra limbs"
              />
            </label>

            <div className="ac-settings">
              <label>
                Breidd ({settings.width}px)
                <input
                  type="range"
                  min={256}
                  max={1536}
                  step={64}
                  value={settings.width}
                  onChange={(e) => updateSettings({ width: Number(e.target.value) })}
                />
              </label>
              <label>
                Hæð ({settings.height}px)
                <input
                  type="range"
                  min={256}
                  max={1536}
                  step={64}
                  value={settings.height}
                  onChange={(e) => updateSettings({ height: Number(e.target.value) })}
                />
              </label>
              <label>
                Skref ({settings.steps})
                <input
                  type="range"
                  min={1}
                  max={80}
                  value={settings.steps}
                  onChange={(e) => updateSettings({ steps: Number(e.target.value) })}
                />
              </label>
              <label>
                CFG ({settings.cfg.toFixed(1)})
                <input
                  type="range"
                  min={0}
                  max={30}
                  step={0.5}
                  value={settings.cfg}
                  onChange={(e) => updateSettings({ cfg: Number(e.target.value) })}
                />
              </label>
              <label>
                Sampler
                <select value={settings.samplerName} onChange={(e) => updateSettings({ samplerName: e.target.value as ComfySettings["samplerName"] })}>
                  {COMFY_SAMPLERS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Scheduler
                <select value={settings.scheduler} onChange={(e) => updateSettings({ scheduler: e.target.value as ComfySettings["scheduler"] })}>
                  {COMFY_SCHEDULERS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Fjöldi ({settings.batchSize})
                <input
                  type="range"
                  min={1}
                  max={4}
                  value={settings.batchSize}
                  onChange={(e) => updateSettings({ batchSize: Number(e.target.value) })}
                />
              </label>
              <label>
                Seed ({settings.seed === -1 ? "slembið" : settings.seed})
                <input
                  type="number"
                  value={settings.seed}
                  onChange={(e) => updateSettings({ seed: Number(e.target.value) })}
                />
              </label>
            </div>

            {progress && <p className="ac-status up">{progress}</p>}
            {error && <p className="ac-error">{error}</p>}
            <button type="button" className="ac-btn" onClick={() => void run()} disabled={busy}>
              {busy ? "Teikna…" : "Teikna mynd"}
            </button>
          </section>

          {results.length > 0 && (
            <section className="ac-panel">
              <h2>Útkoma</h2>
              <div className="ac-results">
                {results.map((url, i) => (
                  <figure key={url}>
                    <img src={url} alt={`ComfyUI útkoma ${i + 1}`} />
                    <figcaption>
                      <button
                        type="button"
                        className="ac-btn ghost"
                        onClick={() => downloadBlob(url, `comfyui-${i + 1}.png`)}
                      >
                        Sækja mynd
                      </button>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </StationChrome>
  );
}
