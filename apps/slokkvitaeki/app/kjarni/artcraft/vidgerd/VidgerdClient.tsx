"use client";

import { useEffect, useRef, useState } from "react";
import { StationChrome } from "../../StationChrome";
import { artcraftHubHref, artcraftToolsHref } from "../apps";
import "../artcraft.css";
import {
  DEFAULT_VIDGERD_URL,
  VIDGERD_URL_KEY,
  enhancePhoto,
  pingVidgerd,
  readStoredVidgerdUrl,
} from "./server";
import { enhancePhotoViaCloud } from "./cloud";
import { enhancePhotoInBrowser } from "./sharpenCanvas";
import { DEFAULT_SHARPEN_SETTINGS, type SharpenSettings } from "./sharpen";

const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";

type Method = "local" | "cloud" | "browser";

const METHODS: Array<{ id: Method; label: string; hint: string }> = [
  {
    id: "local",
    label: "Staðbundinn netþjónn",
    hint: "Besta gæðin (full GFPGAN-andlitsendurgerð) — þarf server.py í gangi á þinni vél.",
  },
  {
    id: "cloud",
    label: "Skýjaþjónusta",
    hint: "Sama GFPGAN-gæði og staðbundni serverinn, engin uppsetning — en kostar smá upphæð per mynd og myndin fer út af vélinni (Replicate).",
  },
  {
    id: "browser",
    label: "Í vafra",
    hint: "Ekkert að setja upp, ókeypis, myndin fer aldrei neitt — en þetta er aðeins skerpa/afsuð, ekki full andlits-endurgerð.",
  },
];

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

export default function VidgerdClient() {
  const [ready, setReady] = useState(false);
  const [serverUrl, setServerUrl] = useState(DEFAULT_VIDGERD_URL);
  const [status, setStatus] = useState<"idle" | "checking" | "up" | "down">("idle");
  const [statusText, setStatusText] = useState("Ekki prófað enn");

  const [method, setMethod] = useState<Method>("local");

  const [face, setFace] = useState(true);
  const [redeye, setRedeye] = useState(true);
  const [texture, setTexture] = useState(false);

  const [sharpen, setSharpen] = useState<SharpenSettings>(DEFAULT_SHARPEN_SETTINGS);

  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [resultUrl, setResultUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setServerUrl(readStoredVidgerdUrl());
    setReady(true);
  }, []);

  async function checkServer(url = serverUrl) {
    setStatus("checking");
    setStatusText("Athuga staðbundinn netþjón…");
    const result = await pingVidgerd(url);
    if (result.ok) {
      setStatus("up");
      setStatusText("Tengt");
      window.localStorage.setItem(VIDGERD_URL_KEY, url);
    } else {
      setStatus("down");
      setStatusText(result.error);
    }
  }

  function addFile(file: File) {
    if (!isPhotoFile(file)) return;
    setSourceUrl(URL.createObjectURL(file));
    setSourceName(file.name);
    setResultUrl("");
    setError("");
  }

  async function runFix() {
    if (!sourceUrl) return;
    if (method === "local" && !face && !redeye && !texture) {
      setError("Veldu að minnsta kosti eina lagfæringu.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const blob = await fetch(sourceUrl).then((r) => r.blob());
      if (method === "local") {
        const fixed = await enhancePhoto(serverUrl, blob, { face, redeye, texture });
        setResultUrl(URL.createObjectURL(fixed));
        setStatus("up");
        window.localStorage.setItem(VIDGERD_URL_KEY, serverUrl);
      } else if (method === "cloud") {
        const fixed = await enhancePhotoViaCloud(blob);
        setResultUrl(URL.createObjectURL(fixed));
      } else {
        const fixed = await enhancePhotoInBrowser(blob, sharpen);
        setResultUrl(URL.createObjectURL(fixed));
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      if (method === "local") {
        setError(
          /fetch|network|failed to load/i.test(raw)
            ? "Náði ekki í staðbundna netþjóninn. Er server.py í gangi?"
            : raw || "Viðgerð mistókst.",
        );
      } else {
        setError(raw || "Viðgerð mistókst.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <StationChrome tool="artcraft">
        <div className="ac-hub">
          <p className="ac-lead">Hleð ljósmyndaviðgerð…</p>
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
            {" · Ljósmyndaviðgerð"}
          </p>
          <h1>Ljósmyndaviðgerð</h1>
          <p className="ac-lead">
            Óskýr andlit, rauð augu og áferð á húð/efni — veldu leiðina sem hentar þér.
          </p>

          <section className="ac-panel">
            <h2>Aðferð</h2>
            <div className="ac-modes" role="radiogroup">
              {METHODS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={method === m.id}
                  className={method === m.id ? "on" : undefined}
                  onClick={() => {
                    setMethod(m.id);
                    setError("");
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p className="ac-hint">{METHODS.find((m) => m.id === method)?.hint}</p>
          </section>

          {method === "local" && (
            <section className="ac-panel">
              <h2>Staðbundinn netþjónn</h2>
              <p className="ac-hint">
                Keyrðu <code>server.py</code> úr <code>tools/vidgerd-server</code> (sjá README þar
                fyrir uppsetningu), svo prófaðu tengingu.
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
            </section>
          )}

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
                if (file) addFile(file);
                e.target.value = "";
              }}
            />
          </section>

          {sourceUrl && (
            <section className="ac-panel">
              <h2>Lagfæringar</h2>

              {method === "local" && (
                <>
                  <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input type="checkbox" checked={face} onChange={(e) => setFace(e.target.checked)} />
                    Laga andlit (GFPGAN) — óskýrt, lágupplausn, grautt
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input type="checkbox" checked={redeye} onChange={(e) => setRedeye(e.target.checked)} />
                    Laga rauð augu
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input type="checkbox" checked={texture} onChange={(e) => setTexture(e.target.checked)} />
                    Skerpa áferð á allri myndinni (húð, efni — ekki bara andlit)
                  </label>
                  {face && texture && (
                    <p className="ac-hint">
                      Andlit + áferð saman er mun hægara (~1–2 mín á vél án skjákorts) því öll
                      myndin er unnin, ekki bara andlitið.
                    </p>
                  )}
                </>
              )}

              {method === "cloud" && (
                <p className="ac-hint">
                  Sendir myndina (minnkaða, JPEG) til GFPGAN v1.4 á Replicate og sækir svo
                  niðurstöðuna — engar stillingar þarf, þetta er sama andlitsendurgerð og
                  staðbundni serverinn. Þarf <code>REPLICATE_API_TOKEN</code> stillt sem
                  umhverfisbreytu á þjóninum.
                </p>
              )}

              {method === "browser" && (
                <>
                  <p className="ac-hint">
                    Þetta er skerpa/afsuð, ekki full andlits-endurgerð — lagar ekki jafn djúpt
                    óskýra/lágupplausn andlit og hinar tvær leiðirnar.
                  </p>
                  <label className="ac-range">
                    Styrkur ({sharpen.amount.toFixed(2)})
                    <input
                      type="range"
                      min={0}
                      max={2}
                      step={0.05}
                      value={sharpen.amount}
                      onChange={(e) => setSharpen((s) => ({ ...s, amount: Number(e.target.value) }))}
                    />
                  </label>
                  <label className="ac-range">
                    Geisli ({sharpen.radius}px)
                    <input
                      type="range"
                      min={1}
                      max={6}
                      value={sharpen.radius}
                      onChange={(e) => setSharpen((s) => ({ ...s, radius: Number(e.target.value) }))}
                    />
                  </label>
                </>
              )}

              {error && <p className="ac-error">{error}</p>}
              <button type="button" className="ac-btn" onClick={() => void runFix()} disabled={busy}>
                {busy ? "Laga…" : "Laga mynd"}
              </button>
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
                        <p>{busy ? "Laga…" : "Smelltu á „Laga mynd“"}</p>
                      )}
                      <figcaption>Eftir</figcaption>
                    </figure>
                  </div>
                  {resultUrl && (
                    <div className="ac-cut-actions">
                      <button
                        type="button"
                        className="ac-btn"
                        onClick={() => downloadBlob(resultUrl, `${sourceName.replace(/\.[^.]+$/, "")}-lagad.jpg`)}
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
