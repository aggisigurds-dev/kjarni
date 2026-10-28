"use client";

import { useEffect, useRef, useState } from "react";
import { StationChrome } from "../../StationChrome";
import { artcraftHubHref, artcraftToolsHref } from "../apps";
import "../artcraft.css";
import { clearPending, loadPending, savePending } from "../pendingPredictions";
import { formatEta } from "../replicateProgress";
import { clearResult, formatSavedTime, loadResult, saveResult } from "../savedResults";
import {
  composeMusic,
  DEFAULT_MUSIC_SETTINGS,
  MUSIC_SETTINGS_KEY,
  normalizeMusicSettings,
  readStoredMusicSettings,
  resumeMusic,
  type MusicSettings,
} from "./music";

const SAVED_KEY = "tonsmid";

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
  const [progress, setProgress] = useState<{
    status: string;
    elapsed: number;
    percent?: number;
    current?: number;
    total?: number;
    etaSeconds?: number;
  } | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<string>("");
  const [savedMeta, setSavedMeta] = useState<{ timestamp: number; prompt?: string } | null>(null);
  const resultUrlRef = useRef<string>("");

  useEffect(() => {
    setSettings(readStoredMusicSettings());
    setReady(true);
    void (async () => {
      const saved = await loadResult(SAVED_KEY);
      if (saved) {
        if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
        const url = URL.createObjectURL(saved.blobs[0]);
        resultUrlRef.current = url;
        setResult(url);
        setSavedMeta({ timestamp: saved.timestamp, prompt: saved.prompt });
      }
      const pending = await loadPending(SAVED_KEY);
      if (pending) {
        setBusy(true);
        setError("");
        setProgress({ status: "ræsing úr vistun", elapsed: 0 });
        try {
          const blob = await resumeMusic(pending.predictionId, pending.submittedAt, {
            onStatus: (p) =>
              setProgress({
                status: p.status,
                elapsed: p.elapsedSeconds,
                percent: p.percent,
                current: p.current,
                total: p.total,
                etaSeconds: p.etaSeconds,
              }),
          });
          if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
          const url = URL.createObjectURL(blob);
          resultUrlRef.current = url;
          setResult(url);
          const now = Date.now();
          setSavedMeta({ timestamp: now, prompt: pending.prompt });
          void saveResult({
            key: SAVED_KEY,
            timestamp: now,
            mediaType: "audio",
            blobs: [blob],
            prompt: pending.prompt,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Resume mistókst";
          setError(msg.replace(/^LOCAL_TIMEOUT:\s*/, ""));
          if (!msg.startsWith("LOCAL_TIMEOUT:")) await clearPending(SAVED_KEY);
        } finally {
          setBusy(false);
          setProgress(null);
        }
      }
    })();
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
        onStatus: (p) =>
          setProgress({
            status: p.status,
            elapsed: p.elapsedSeconds,
            percent: p.percent,
            current: p.current,
            total: p.total,
            etaSeconds: p.etaSeconds,
          }),
        onPredictionId: (id) => {
          void savePending({
            key: SAVED_KEY,
            predictionId: id,
            submittedAt: Date.now(),
            prompt: settings.prompt,
          });
        },
      });
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
      const url = URL.createObjectURL(blob);
      resultUrlRef.current = url;
      setResult(url);
      const now = Date.now();
      setSavedMeta({ timestamp: now, prompt: settings.prompt });
      void saveResult({
        key: SAVED_KEY,
        timestamp: now,
        mediaType: "audio",
        blobs: [blob],
        prompt: settings.prompt,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Tónsmíð mistókst.";
      setError(msg.replace(/^LOCAL_TIMEOUT:\s*/, ""));
      if (!msg.startsWith("LOCAL_TIMEOUT:")) await clearPending(SAVED_KEY);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function clearSavedResults() {
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    resultUrlRef.current = "";
    setResult("");
    setSavedMeta(null);
    await clearResult(SAVED_KEY);
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
                {typeof progress.percent === "number"
                  ? `${progress.percent}%${progress.current != null && progress.total != null ? ` · skref ${progress.current}/${progress.total}` : ""}${progress.etaSeconds ? ` · ~${formatEta(progress.etaSeconds)} eftir` : ""}`
                  : `Staða: ${progress.status === "starting" ? "ræsing" : progress.status === "processing" ? "vinnsla" : progress.status}`}
                {progress.elapsed > 0 ? ` · ${progress.elapsed}s liðnar` : ""}
                {". Þú getur skipt um tab — vinnslan heldur áfram og vistast þegar hún er tilbúin."}
              </p>
            )}
            <button type="button" className="ac-btn" onClick={() => void run()} disabled={busy}>
              {busy ? "Semur lag…" : "Semja lag"}
            </button>
          </section>

          {result && (
            <section className="ac-panel">
              <h2>Útkoma</h2>
              {savedMeta && (
                <p className="ac-hint">
                  Vistað {formatSavedTime(savedMeta.timestamp)}
                  {savedMeta.prompt ? ` · „${savedMeta.prompt.slice(0, 80)}${savedMeta.prompt.length > 80 ? "…" : ""}"` : ""}
                </p>
              )}
              <audio src={result} controls style={{ width: "100%" }} />
              <div className="ac-row">
                <button
                  type="button"
                  className="ac-btn ghost"
                  onClick={() => downloadBlob(result, `tonsmid-${Date.now()}.mp3`)}
                >
                  Sækja hljóðskrá
                </button>
                <button type="button" className="ac-btn ghost" onClick={() => void clearSavedResults()}>
                  Hreinsa vistað
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
    </StationChrome>
  );
}
