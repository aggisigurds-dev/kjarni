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
  DEFAULT_IMG2VID_SETTINGS,
  DEFAULT_WAN_CLIP,
  DEFAULT_WAN_CLIP_VISION,
  DEFAULT_WAN_UNET,
  DEFAULT_WAN_VAE,
  IMG2VID_SETTINGS_KEY,
  img2vid,
  listClipModels,
  listClipVisionModels,
  listUnetModels,
  listVaeModels,
  normalizeImg2VidSettings,
  pingComfy,
  readStoredComfyUrl,
  readStoredImg2VidSettings,
  type Img2VidSettings,
} from "../comfy/comfy";

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

export default function HreyfimyndClient() {
  const [ready, setReady] = useState(false);
  const [serverUrl, setServerUrl] = useState(DEFAULT_COMFY_URL);
  const [status, setStatus] = useState<"idle" | "checking" | "up" | "down">("idle");
  const [statusText, setStatusText] = useState("Ekki prófað enn");

  const [unetModels, setUnetModels] = useState<string[]>([]);
  const [clipModels, setClipModels] = useState<string[]>([]);
  const [vaeModels, setVaeModels] = useState<string[]>([]);
  const [clipVisionModels, setClipVisionModels] = useState<string[]>([]);
  const [unetName, setUnetName] = useState(DEFAULT_WAN_UNET);
  const [clipName, setClipName] = useState(DEFAULT_WAN_CLIP);
  const [vaeName, setVaeName] = useState(DEFAULT_WAN_VAE);
  const [clipVisionName, setClipVisionName] = useState(DEFAULT_WAN_CLIP_VISION);

  const [settings, setSettings] = useState<Img2VidSettings>(DEFAULT_IMG2VID_SETTINGS);

  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [resultUrl, setResultUrl] = useState("");
  const resultUrlRef = useRef("");

  useEffect(() => {
    setServerUrl(readStoredComfyUrl());
    setSettings(readStoredImg2VidSettings());
    setReady(true);
  }, []);

  useEffect(() => {
    return () => {
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    };
  }, []);

  async function checkServer(url = serverUrl) {
    setStatus("checking");
    setStatusText("Athuga staðbundið ComfyUI…");
    const result = await pingComfy(url);
    if (result.ok) {
      setStatus("up");
      setStatusText(result.version ? `Tengt — ComfyUI ${result.version}` : "Tengt");
      window.localStorage.setItem(COMFY_URL_KEY, url);
      const [unets, clips, vaes, visions] = await Promise.all([
        listUnetModels(url),
        listClipModels(url),
        listVaeModels(url),
        listClipVisionModels(url),
      ]);
      setUnetModels(unets);
      setClipModels(clips);
      setVaeModels(vaes);
      setClipVisionModels(visions);
      if (unets.length && !unets.includes(unetName)) setUnetName(unets[0]);
      if (clips.length && !clips.includes(clipName)) setClipName(clips[0]);
      if (vaes.length && !vaes.includes(vaeName)) setVaeName(vaes[0]);
      if (visions.length && !visions.includes(clipVisionName)) setClipVisionName(visions[0]);
    } else {
      setStatus("down");
      setStatusText(result.error);
    }
  }

  function updateSettings(next: Partial<Img2VidSettings>) {
    setSettings((s) => {
      const merged = normalizeImg2VidSettings({ ...s, ...next });
      window.localStorage.setItem(IMG2VID_SETTINGS_KEY, JSON.stringify(merged));
      return merged;
    });
  }

  function addFile(file: File) {
    if (!isPhotoFile(file)) return;
    setSourceFile(file);
    setSourceUrl(URL.createObjectURL(file));
    setError("");
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    resultUrlRef.current = "";
    setResultUrl("");
  }

  async function run() {
    if (!sourceFile) {
      setError("Veldu mynd fyrst.");
      return;
    }
    if (!settings.prompt.trim()) {
      setError("Lýstu hreyfingunni sem þú vilt sjá.");
      return;
    }
    setBusy(true);
    setError("");
    setProgress("");
    try {
      const blob = await img2vid(
        serverUrl,
        sourceFile,
        {
          unetName,
          clipName,
          vaeName,
          clipVisionName,
          prompt: settings.prompt,
          negativePrompt: settings.negativePrompt,
          width: settings.width,
          height: settings.height,
          length: settings.length,
          fps: settings.fps,
          steps: settings.steps,
          cfg: settings.cfg,
          shift: settings.shift,
          samplerName: settings.samplerName,
          scheduler: settings.scheduler,
          seed: settings.seed,
        },
        setProgress,
      );
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
      const url = URL.createObjectURL(blob);
      resultUrlRef.current = url;
      setResultUrl(url);
      setStatus("up");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Myndbandsgerð mistókst.");
    } finally {
      setProgress("");
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <StationChrome tool="artcraft">
        <div className="ac-hub">
          <p className="ac-lead">Hleð hreyfimynd…</p>
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
            {" · Hreyfimynd"}
          </p>
          <h1>Hreyfimynd</h1>
          <p className="ac-lead">
            Mynd → stutt myndband (Wan 2.1) gegnum þitt eigið ComfyUI — lýstu hreyfingunni (t.d.
            „konan dansar glöð") og módelið hreyfir myndina eftir því. Stórt líkan — þarf gott
            skjákort á þinni vél. Myndin fer aldrei í skýið.
          </p>

          <section className="ac-panel">
            <h2>Staðbundinn ComfyUI-netþjónn</h2>
            <p className="ac-hint">
              Sama ComfyUI og í Texti → mynd tólinu, en með Wan 2.1 Image-to-Video líkönin sett upp
              (sjá <code>tools/comfy/README.md</code>): díffusion-líkan í{" "}
              <code>models/diffusion_models</code>, texta-encoder í <code>models/text_encoders</code>,
              VAE í <code>models/vae</code> og CLIP Vision í <code>models/clip_vision</code>.
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
              <div className="ac-settings">
                <label>
                  Díffusion-líkan (UNETLoader)
                  {unetModels.length ? (
                    <select value={unetName} onChange={(e) => setUnetName(e.target.value)}>
                      {unetModels.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input value={unetName} onChange={(e) => setUnetName(e.target.value)} spellCheck={false} />
                  )}
                </label>
                <label>
                  CLIP (texta-encoder)
                  {clipModels.length ? (
                    <select value={clipName} onChange={(e) => setClipName(e.target.value)}>
                      {clipModels.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input value={clipName} onChange={(e) => setClipName(e.target.value)} spellCheck={false} />
                  )}
                </label>
                <label>
                  VAE
                  {vaeModels.length ? (
                    <select value={vaeName} onChange={(e) => setVaeName(e.target.value)}>
                      {vaeModels.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input value={vaeName} onChange={(e) => setVaeName(e.target.value)} spellCheck={false} />
                  )}
                </label>
                <label>
                  CLIP Vision
                  {clipVisionModels.length ? (
                    <select value={clipVisionName} onChange={(e) => setClipVisionName(e.target.value)}>
                      {clipVisionModels.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={clipVisionName}
                      onChange={(e) => setClipVisionName(e.target.value)}
                      spellCheck={false}
                    />
                  )}
                </label>
              </div>
            )}
          </section>

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
              if (file) addFile(file);
            }}
          >
            <p>Slepptu upphafsmynd hér, eða</p>
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
                if (file) addFile(file);
                e.target.value = "";
              }}
            />
          </section>

          {sourceUrl && (
            <section className="ac-panel">
              <h2>Hreyfing</h2>
              <label>
                Lýsing á hreyfingunni
                <textarea
                  value={settings.prompt}
                  onChange={(e) => updateSettings({ prompt: e.target.value })}
                  rows={3}
                  placeholder="t.d. konan dansar glöð, hreyfir hendur og mjaðmir í takt"
                />
              </label>
              <label>
                Neikvæð lýsing (má sleppa)
                <textarea
                  value={settings.negativePrompt}
                  onChange={(e) => updateSettings({ negativePrompt: e.target.value })}
                  rows={2}
                  placeholder="t.d. static, blurry, distorted"
                />
              </label>

              <div className="ac-settings">
                <label>
                  Breidd ({settings.width}px)
                  <input
                    type="range"
                    min={256}
                    max={1280}
                    step={16}
                    value={settings.width}
                    onChange={(e) => updateSettings({ width: Number(e.target.value) })}
                  />
                  <small className="ac-rec">mælt: 832 (Wan 2.1 native landscape); 480 fyrir portrait með hæð 832</small>
                </label>
                <label>
                  Hæð ({settings.height}px)
                  <input
                    type="range"
                    min={256}
                    max={1280}
                    step={16}
                    value={settings.height}
                    onChange={(e) => updateSettings({ height: Number(e.target.value) })}
                  />
                  <small className="ac-rec">mælt: 480 (með breidd 832 = landscape); 832 fyrir portrait</small>
                </label>
                <label>
                  Lengd ({settings.length} römmum, ~{(settings.length / settings.fps).toFixed(1)}s)
                  <input
                    type="range"
                    min={17}
                    max={81}
                    step={4}
                    value={settings.length}
                    onChange={(e) => updateSettings({ length: Number(e.target.value) })}
                  />
                  <small className="ac-rec">mælt: 81 (~5s á 16fps, hámark fyrir Wan 2.1 I2V); styttra sparar VRAM/tíma</small>
                </label>
                <label>
                  Rammar á sekúndu ({settings.fps})
                  <input
                    type="range"
                    min={4}
                    max={30}
                    value={settings.fps}
                    onChange={(e) => updateSettings({ fps: Number(e.target.value) })}
                  />
                  <small className="ac-rec">mælt: 16 (Wan native); 24 fyrir mýkra playback (styttri video)</small>
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
                  <small className="ac-rec">mælt: 20 (meðalvegur); 30 fyrir nákvæmari; 10 fyrir prufu</small>
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
                  <small className="ac-rec">mælt: 6 (jafnvægi fyrir Wan 2.1); hátt (10+) = plasticky</small>
                </label>
                <label>
                  Shift ({settings.shift.toFixed(1)})
                  <input
                    type="range"
                    min={0}
                    max={20}
                    step={0.5}
                    value={settings.shift}
                    onChange={(e) => updateSettings({ shift: Number(e.target.value) })}
                  />
                  <small className="ac-rec">mælt: 8 (Wan 2.1 default fyrir temporal); lækka í 3-5 fyrir hægari hreyfingu</small>
                </label>
                <label>
                  Sampler
                  <select
                    value={settings.samplerName}
                    onChange={(e) => updateSettings({ samplerName: e.target.value as Img2VidSettings["samplerName"] })}
                  >
                    {COMFY_SAMPLERS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <small className="ac-rec">mælt: uni_pc (Wan 2.1 default; mest stöðugt)</small>
                </label>
                <label>
                  Scheduler
                  <select
                    value={settings.scheduler}
                    onChange={(e) => updateSettings({ scheduler: e.target.value as Img2VidSettings["scheduler"] })}
                  >
                    {COMFY_SCHEDULERS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <small className="ac-rec">mælt: simple (Wan 2.1 default)</small>
                </label>
                <label>
                  Seed ({settings.seed === -1 ? "slembið" : settings.seed})
                  <input
                    type="number"
                    value={settings.seed}
                    onChange={(e) => updateSettings({ seed: Number(e.target.value) })}
                  />
                  <small className="ac-rec">mælt: -1 (slembið); fasta tölu til að endurtaka</small>
                </label>
              </div>

              <p className="ac-hint">
                Myndbandsgerð er miklu þyngri en mynd — reiknaðu með nokkrum mínútum á öflugu
                skjákorti, lengur á veikara.
              </p>
              {progress && <p className="ac-status up">{progress}</p>}
              {error && <p className="ac-error">{error}</p>}
              <button type="button" className="ac-btn" onClick={() => void run()} disabled={busy}>
                {busy ? "Bý til myndband…" : "Búa til myndband"}
              </button>
            </section>
          )}

          {resultUrl && (
            <section className="ac-panel">
              <h2>Útkoma</h2>
              <div className="ac-results">
                <figure>
                  <video src={resultUrl} controls loop playsInline />
                  <figcaption>
                    <button
                      type="button"
                      className="ac-btn ghost"
                      onClick={() => downloadBlob(resultUrl, "hreyfimynd.mp4")}
                    >
                      Sækja myndband
                    </button>
                  </figcaption>
                </figure>
              </div>
            </section>
          )}
        </div>
      </div>
    </StationChrome>
  );
}
