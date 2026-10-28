"use client";

import { useEffect, useRef, useState } from "react";
import { StationChrome } from "../../StationChrome";
import { artcraftHubHref, artcraftToolsHref } from "../apps";
import "../artcraft.css";
import {
  composeMusic,
  DEFAULT_MUSIC_SETTINGS,
  MUSIC_SETTINGS_KEY,
  normalizeMusicSettings,
  readStoredMusicSettings,
  type MusicSettings,
} from "./music";

function downloadBlob(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
}

export default function TonsmidClient() {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<MusicSettings>(DEFAULT_MUSIC_SETTINGS);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ status: string; elapsed: number } | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<string>("");
  const resultUrlRef = useRef<string>("");

  useEffect(() => {
    setSettings(readStoredMusicSettings());
    setReady(true);
  }, []);

  useEffect(() => {
    return () => {
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    };
  }, []);

  function updateSettings(next: Partial<MusicSettings>) {
    setSettings((s) => {
      const merged = normalizeMusicSettings({ ...s, ...next });
      window.localStorage.setItem(MUSIC_SETTINGS_KEY, JSON.stringify(merged));
      return merged;
    });
  }

  async function run() {
    setBusy(true);
    setError("");
    setProgress({ status: "starting", elapsed: 0 });
    try {
      const blob = await composeMusic(settings, {
        onStatus: (status, elapsed) => setProgress({ status, elapsed }),
      });
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
      const url = URL.createObjectURL(blob);
      resultUrlRef.current = url;
      setResult(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tónsmíð mistókst.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  if (!ready) {
    return (
      <StationChrome tool="artcraft">
        <div className="ac-hub">
          <p className="ac-lead">Hleð Tónsmíð…</p>
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
            {" · Tónsmíð"}
          </p>
          <h1>Tónsmíð</h1>
          <p className="ac-lead">
            Semur heilt lag úr texta-prompt-i (ElevenLabs Music á Replicate). Hugsað fyrir
            útvarpsauglýsingar, jingla og bakgrunnstónlist fyrir myndbönd. Lengd 10 sek – 5 mín;
            kostnaður skalast með lengd. „Instrumental" kveikir á laginu án söngs — gott þegar þú
            vilt tala yfir.
          </p>

          <section className="ac-panel">
            <h2>Prompt</h2>
            <label>
              Lýsing á laginu
              <textarea
                value={settings.prompt}
                onChange={(e) => updateSettings({ prompt: e.target.value })}
                rows={4}
                placeholder="t.d. upbeat acoustic jingle, 30 seconds, cheerful, light percussion, warm major key"
              />
            </label>
            <div className="ac-settings">
              <label>
                Lengd ({settings.lengthSeconds}s)
                <input
                  type="range"
                  min={10}
                  max={300}
                  step={5}
                  value={settings.lengthSeconds}
                  onChange={(e) => updateSettings({ lengthSeconds: Number(e.target.value) })}
                />
              </label>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={settings.forceInstrumental}
                onChange={(e) => updateSettings({ forceInstrumental: e.target.checked })}
              />
              Aðeins hljóðfæri (engin söngur)
            </label>

            {error && <p className="ac-error">{error}</p>}
            {busy && progress && (
              <p className="ac-hint">
                Staða: {progress.status === "starting" ? "ræsing" : progress.status === "processing" ? "vinnsla" : progress.status}
                {progress.elapsed > 0 ? ` · ${progress.elapsed}s liðnar` : ""}
                {". ElevenLabs Music tekur venjulega 30–60s."}
              </p>
            )}
            <button type="button" className="ac-btn" onClick={() => void run()} disabled={busy}>
              {busy ? "Semur lag…" : "Semja lag"}
            </button>
          </section>

          {result && (
            <section className="ac-panel">
              <h2>Útkoma</h2>
              <audio src={result} controls style={{ width: "100%" }} />
              <div className="ac-row">
                <button
                  type="button"
                  className="ac-btn ghost"
                  onClick={() => downloadBlob(result, `tonsmid-${Date.now()}.mp3`)}
                >
                  Sækja hljóðskrá
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
    </StationChrome>
  );
}
