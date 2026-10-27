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

export default function VidgerdClient() {
  const [ready, setReady] = useState(false);
  const [serverUrl, setServerUrl] = useState(DEFAULT_VIDGERD_URL);
  const [status, setStatus] = useState<"idle" | "checking" | "up" | "down">("idle");
  const [statusText, setStatusText] = useState("Ekki prófað enn");

  const [face, setFace] = useState(true);
  const [redeye, setRedeye] = useState(true);
  const [texture, setTexture] = useState(false);

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
    if (!face && !redeye && !texture) {
      setError("Veldu að minnsta kosti eina lagfæringu.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const blob = await fetch(sourceUrl).then((r) => r.blob());
      const fixed = await enhancePhoto(serverUrl, blob, { face, redeye, texture });
      setResultUrl(URL.createObjectURL(fixed));
      setStatus("up");
      window.localStorage.setItem(VIDGERD_URL_KEY, serverUrl);
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      setError(
        /fetch|network|failed to load/i.test(raw)
          ? "Náði ekki í staðbundna netþjóninn. Er server.py í gangi?"
          : raw || "Viðgerð mistókst.",
      );
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
            Óskýr andlit, rauð augu og áferð á húð/efni — lagað á þinni eigin vél.
            Myndin fer aldrei í skýið.
          </p>

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
