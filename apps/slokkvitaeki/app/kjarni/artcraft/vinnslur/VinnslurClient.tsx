"use client";

import { useEffect, useState } from "react";
import { StationChrome } from "../../StationChrome";
import { artcraftHubHref } from "../apps";
import "../artcraft.css";
import { clearPending, listAllPending, type PendingPrediction } from "../pendingPredictions";
import { clearResult, formatSavedTime, listAllResults, type SavedResult } from "../savedResults";

// Hvert vistað key samsvarar þessu tóli — notum það til að sýna nafn + href
// á listanum. Haldum lista í sync við app.ts registry-ið.
const TOOL_META: Record<string, { name: string; icon: string; href: string }> = {
  skyjastudio: { name: "Skýjastúdíó", icon: "☁️", href: "/kjarni/artcraft/skyjastudio" },
  skyjahreyfimynd: { name: "Skýjahreyfimynd", icon: "🌥️", href: "/kjarni/artcraft/skyjahreyfimynd" },
  upplyfting: { name: "Upplyfting", icon: "🔍", href: "/kjarni/artcraft/upplyfting" },
  breyta: { name: "Breyta mynd", icon: "🪄", href: "/kjarni/artcraft/breyta" },
  tonsmid: { name: "Tónsmíð", icon: "🎵", href: "/kjarni/artcraft/tonsmid" },
};

function toolInfo(key: string) {
  return TOOL_META[key] || { name: key, icon: "⚙️", href: `/kjarni/artcraft/${key}` };
}

function minutesAgo(timestamp: number): string {
  const sec = Math.round((Date.now() - timestamp) / 1000);
  if (sec < 60) return `${sec}s síðan`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} mín síðan`;
  const hr = Math.round(min / 60);
  return `${hr} klst síðan`;
}

export default function VinnslurClient() {
  const [pending, setPending] = useState<PendingPrediction[]>([]);
  const [results, setResults] = useState<SavedResult[]>([]);
  const [ready, setReady] = useState(false);

  async function refresh() {
    const [p, r] = await Promise.all([listAllPending(), listAllResults()]);
    setPending(p);
    setResults(r);
  }

  useEffect(() => {
    void (async () => {
      await refresh();
      setReady(true);
    })();
    // Refresh á 10s fresti ef notandi hangir á síðunni (til að ná pending →
    // ready switch án þess að endurhlaða).
    const timer = setInterval(() => void refresh(), 10000);
    return () => clearInterval(timer);
  }, []);

  async function removePending(key: string) {
    await clearPending(key);
    await refresh();
  }

  async function removeResult(key: string) {
    await clearResult(key);
    await refresh();
  }

  if (!ready) {
    return (
      <StationChrome tool="artcraft">
        <div className="ac-hub">
          <p className="ac-lead">Hleð Verkbók…</p>
        </div>
      </StationChrome>
    );
  }

  const hasAnything = pending.length > 0 || results.length > 0;

  return (
    <StationChrome tool="artcraft">
      <div className="ac-hub">
        <div className="ac-hub-in">
          <p className="ac-kicker">
            <a href={artcraftHubHref()}>ArtCraft</a>
            {" · Verkbók"}
          </p>
          <h1>Verkbók</h1>
          <p className="ac-lead">
            Allar vinnslur og tilbúnar útkomur á einum stað. Pending-vinnslur halda áfram á
            Replicate þótt þú skiptir um tab — opnaðu tólið til að ljúka upp niðurstöðuna. Þessi
            síða endurhleður sjálf á 10s fresti.
          </p>

          {!hasAnything && (
            <section className="ac-panel">
              <p className="ac-hint">
                Engin vinnsla og engin vistuð útkoma. Prófaðu eitthvað af tólunum (
                <a href="/kjarni/artcraft/skyjastudio">Skýjastúdíó</a>,
                {" "}
                <a href="/kjarni/artcraft/skyjahreyfimynd">Skýjahreyfimynd</a>,
                {" "}
                <a href="/kjarni/artcraft/upplyfting">Upplyfting</a>,
                {" "}
                <a href="/kjarni/artcraft/breyta">Breyta</a>,
                {" "}
                <a href="/kjarni/artcraft/tonsmid">Tónsmíð</a>
                ).
              </p>
            </section>
          )}

          {pending.length > 0 && (
            <section className="ac-panel">
              <h2>Í vinnslu ({pending.length})</h2>
              <ul className="ac-job-list">
                {pending.map((job) => {
                  const info = toolInfo(job.key);
                  return (
                    <li key={job.key} className="ac-job-row">
                      <span className="ac-job-ico" aria-hidden="true">{info.icon}</span>
                      <div className="ac-job-main">
                        <b>{info.name}</b>
                        <span className="ac-job-status">⏳ í vinnslu · {minutesAgo(job.submittedAt)}</span>
                        {job.prompt && (
                          <span className="ac-job-prompt">„{job.prompt.slice(0, 100)}{job.prompt.length > 100 ? "…" : ""}"</span>
                        )}
                      </div>
                      <div className="ac-job-actions">
                        <a href={info.href} className="ac-btn">Opna</a>
                        <button type="button" className="ac-btn ghost" onClick={() => void removePending(job.key)}>
                          Hreinsa
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {results.length > 0 && (
            <section className="ac-panel">
              <h2>Tilbúnar útkomur ({results.length})</h2>
              <ul className="ac-job-list">
                {results.map((job) => {
                  const info = toolInfo(job.key);
                  return (
                    <li key={job.key} className="ac-job-row">
                      <span className="ac-job-ico" aria-hidden="true">{info.icon}</span>
                      <div className="ac-job-main">
                        <b>{info.name}</b>
                        <span className="ac-job-status">
                          ✅ {job.mediaType === "video" ? "myndband" : job.mediaType === "audio" ? "hljóð" : "mynd"}
                          {job.mode ? ` · ${job.mode}` : ""} · vistað {formatSavedTime(job.timestamp)}
                        </span>
                        {job.prompt && (
                          <span className="ac-job-prompt">„{job.prompt.slice(0, 100)}{job.prompt.length > 100 ? "…" : ""}"</span>
                        )}
                      </div>
                      <div className="ac-job-actions">
                        <a href={info.href} className="ac-btn">Opna</a>
                        <button type="button" className="ac-btn ghost" onClick={() => void removeResult(job.key)}>
                          Hreinsa
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      </div>
    </StationChrome>
  );
}
