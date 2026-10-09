"use client";

import { useEffect, useState, type FormEvent } from "react";
import { StationChrome } from "../../StationChrome";
import { artcraftAppHref, artcraftHubHref } from "../apps";
import "../artcraft.css";
import { assertAdultPrompt } from "./guard";
import {
  DEFAULT_WEBUI_URL,
  WEBUI_URL_KEY,
  canEmbedLocalWebui,
  pingWebui,
  readStoredWebuiUrl,
  txt2img,
  type LocalModel,
} from "./webui";

const GATE_KEY = "kjarni_private_studio_v1";

export default function StudioClient() {
  const [ready, setReady] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [webui, setWebui] = useState(DEFAULT_WEBUI_URL);
  const [status, setStatus] = useState<"idle" | "checking" | "up" | "down">("idle");
  const [statusText, setStatusText] = useState("Ekki prófað enn");
  const [models, setModels] = useState<LocalModel[]>([]);
  const [prompt, setPrompt] = useState("");
  const [negative, setNegative] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [images, setImages] = useState<string[]>([]);

  useEffect(() => {
    setAccepted(window.localStorage.getItem(GATE_KEY) === "1");
    setWebui(readStoredWebuiUrl());
    setReady(true);
  }, []);

  function acceptGate() {
    window.localStorage.setItem(GATE_KEY, "1");
    setAccepted(true);
  }

  async function checkServer(url = webui) {
    setStatus("checking");
    setStatusText("Athuga staðbundið líkan…");
    const result = await pingWebui(url);
    if (result.ok) {
      setStatus("up");
      setModels(result.models);
      setStatusText(
        result.models.length > 0
          ? `Tengt · ${result.models.length} líkön`
          : "Tengt · ekkert líkan hlaðið í WebUI",
      );
      window.localStorage.setItem(WEBUI_URL_KEY, url);
    } else {
      setStatus("down");
      setModels([]);
      setStatusText(result.error);
    }
  }

  async function generate(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      assertAdultPrompt(prompt, negative);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Óleyfileg beiðni");
      return;
    }
    if (!prompt.trim()) {
      setError("Skrifaðu prompt.");
      return;
    }
    setBusy(true);
    try {
      const out = await txt2img(webui, {
        prompt: prompt.trim(),
        negativePrompt: negative.trim(),
      });
      setImages(out);
      window.localStorage.setItem(WEBUI_URL_KEY, webui);
      setStatus("up");
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      setError(
        /fetch|network|failed to load/i.test(raw)
          ? "Gat ekki myndað. Er staðbundna WebUI-ið í gangi með --api og CORS?"
          : raw || "Gat ekki myndað. Er staðbundna WebUI-ið í gangi með --api og CORS?",
      );
    } finally {
      setBusy(false);
    }
  }

  function download(src: string, index: number) {
    const a = document.createElement("a");
    a.href = src;
    a.download = `kjarni-studio-${index + 1}.png`;
    a.click();
  }

  if (!ready) {
    return (
      <StationChrome tool="artcraft">
        <div className="ac-hub">
          <p className="ac-lead">Hleð einkastúdíó…</p>
        </div>
      </StationChrome>
    );
  }

  return (
    <StationChrome tool="artcraft">
      <div className="ac-hub">
        <div className="ac-hub-in ac-studio">
          <p className="ac-kicker">
            <a href={artcraftHubHref()}>ArtCraft</a> · Einkastúdíó
          </p>
          <h1>Staðbundið líkan</h1>
          <p className="ac-lead">
            Myndirnar verða til á tölvunni þinni gegnum Automatic1111, Forge eða
            SD.Next. Engin skýjasía, ekkert sent út. Fullorðinsmyndefni er leyfilegt.
            Ekkert sem snýr að börnum.
          </p>

          {!accepted ? (
            <div className="ac-gate">
              <p>
                Þetta er einkastúdíó fyrir fullorðna. Þú staðfestir að þú sért 18 ára
                eða eldri, að notkunin sé einka, og að þú biðjir ekki um kynferðislegt
                myndefni af börnum eða ólögráða.
              </p>
              <button type="button" className="ac-btn" onClick={acceptGate}>
                Ég staðfesti — opna stúdíó
              </button>
            </div>
          ) : (
            <>
              <section className="ac-panel">
                <h2>Staðbundið WebUI</h2>
                <p className="ac-hint">
                  Keyrðu Forge / A1111 / SD.Next með{" "}
                  <code>--api --cors-allow-origins=*</code> og hladdu því líkani sem þú
                  vilt. Kjarni bætir ekki við neikvæðu nsfw-prompti.
                </p>
                <div className="ac-row">
                  <label>
                    Slóð
                    <input
                      value={webui}
                      onChange={(e) => setWebui(e.target.value)}
                      spellCheck={false}
                      autoCapitalize="off"
                    />
                  </label>
                  <button
                    type="button"
                    className="ac-btn ghost"
                    onClick={() => checkServer()}
                    disabled={status === "checking"}
                  >
                    Prófa tengingu
                  </button>
                  <a className="ac-btn" href={webui} target="_blank" rel="noreferrer">
                    Opna WebUI-viðmót
                  </a>
                </div>
                <p className={`ac-status ${status}`}>{statusText}</p>
                {canEmbedLocalWebui() ? (
                  <iframe
                    className="ac-webui"
                    src={webui}
                    title="Staðbundið WebUI"
                    allow="fullscreen"
                  />
                ) : (
                  <p className="ac-hint">
                    WebUI-viðmótið opnast í nýjum flipa. HTTPS-Kjarni getur ekki fellt
                    HTTP-viðmótið inn, en formið hér talar samt við vélina þína.
                  </p>
                )}
                {models.length > 0 && (
                  <p className="ac-hint">
                    Í gangi: {models.slice(0, 4).map((m) => m.title || m.model_name).join(" · ")}
                    {models.length > 4 ? ` · +${models.length - 4}` : ""}
                  </p>
                )}
              </section>

              <form className="ac-panel" onSubmit={generate}>
                <h2>Prompt</h2>
                <label>
                  Lýsing
                  <textarea
                    rows={5}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="nude adult woman, natural light, film still…"
                  />
                </label>
                <label>
                  Negative (valfrjálst — ekki fyllt með nsfw-banni)
                  <textarea
                    rows={2}
                    value={negative}
                    onChange={(e) => setNegative(e.target.value)}
                    placeholder="low quality, blurry, deformed"
                  />
                </label>
                {error && <p className="ac-error">{error}</p>}
                <button type="submit" className="ac-btn" disabled={busy}>
                  {busy ? "Mynda…" : "Mynda staðbundið"}
                </button>
              </form>

              {images.length > 0 && (
                <section className="ac-panel">
                  <h2>Útkoma</h2>
                  <div className="ac-results">
                    {images.map((src, i) => (
                      <figure key={i}>
                        <img src={src} alt={`Útkoma ${i + 1}`} />
                        <figcaption>
                          <button type="button" className="ac-btn ghost" onClick={() => download(src, i)}>
                            Sækja PNG
                          </button>
                          <a className="ac-btn ghost" href={artcraftAppHref("photocraft")}>
                            Opna PhotoCraft
                          </a>
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </StationChrome>
  );
}
