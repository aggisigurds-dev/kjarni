"use client";

import { useEffect, useRef, useState } from "react";
import { StationChrome } from "../../StationChrome";
import { artcraftHubHref } from "../apps";
import "../artcraft.css";
import { clearPending, listAllPending, type PendingPrediction } from "../pendingPredictions";
import { formatEta } from "../replicateProgress";
import { clearResult, formatSavedTime, listAllResults, type SavedResult } from "../savedResults";
import { canPollInBackground, pollJob, type PollState } from "./vinnsluPoller";

// Hvert vistað key samsvarar þessu tóli — notum það til að sýna nafn + href
// á listanum. Haldum lista í sync við app.ts registry-ið.
const TOOL_META: Record<string, { name: string; icon: string; href: string }> = {
  skyjastudio: { name: "Skýjastúdíó", icon: "☁️", href: "/kjarni/artcraft/skyjastudio" },
  skyjahreyfimynd: { name: "Skýjahreyfimynd", icon: "🌥️", href: "/kjarni/artcraft/skyjahreyfimynd" },
  upplyfting: { name: "Upplyfting", icon: "🔍", href: "/kjarni/artcraft/upplyfting" },
  breyta: { name: "Breyta mynd", icon: "🪄", href: "/kjarni/artcraft/breyta" },
  tonsmid: { name: "Tónsmíð", icon: "🎵", href: "/kjarni/artcraft/tonsmid" },
  endurljos: { name: "Endurljós", icon: "💡", href: "/kjarni/artcraft/endurljos" },
  innblastur: { name: "Innblástur", icon: "✨", href: "/kjarni/artcraft/innblastur" },
  andlit: { name: "Andlit", icon: "👤", href: "/kjarni/artcraft/andlit" },
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
  const [progressByKey, setProgressByKey] = useState<Record<string, PollState>>({});
  const pollersRef = useRef<Map<string, AbortController>>(new Map());

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
    const timer = setInterval(() => void refresh(), 10000);
    return () => clearInterval(timer);
  }, []);

  // Background polling: hvert pending fær sinn eigin pollara sem lýkur þegar
  // Replicate confirmar terminal status. Vinnur óháð því hvort notandi er í
  // samsvarandi tóli eða ekki — niðurstöður skila sér beint í Verkbók.
  useEffect(() => {
    const current = pollersRef.current;
    // Byrja poll fyrir hvert nýtt pending
    for (const job of pending) {
      if (current.has(job.key)) continue;
      if (!canPollInBackground(job)) continue;
      const ctrl = new AbortController();
      current.set(job.key, ctrl);
      void pollJob(
        job,
        (state) => {
          setProgressByKey((prev) => ({ ...prev, [job.key]: state }));
        },
        ctrl.signal,
      ).finally(() => {
        current.delete(job.key);
        setProgressByKey((prev) => {
          const next = { ...prev };
          delete next[job.key];
          return next;
        });
        void refresh();
      });
    }
    // Hreinsa poll fyrir keys sem er horfið úr pending (t.d. user hreinsaði)
    for (const [key, ctrl] of current.entries()) {
      if (!pending.some((p) => p.key === key)) {
        ctrl.abort();
        current.delete(key);
      }
    }
  }, [pending]);

  useEffect(() => {
    const current = pollersRef.current;
    return () => {
      for (const ctrl of current.values()) ctrl.abort();
      current.clear();
    };
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
            Allar vinnslur og tilbúnar útkomur á einum stað. Verkbók pollar sjálf status á
            Replicate á 5s fresti — þú þarft ekki að opna tólið til að sækja útkomuna. Þegar
            vinnsla klárast birtist hún beint hér.
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
                  const state = progressByKey[job.key];
                  let statusLine: string;
                  if (state && typeof state.percent === "number") {
                    statusLine = `⏳ ${state.percent}%`;
                    if (state.current != null && state.total != null) {
                      statusLine += ` · ${state.current}/${state.total}`;
                    }
                    if (state.etaSeconds) {
                      statusLine += ` · ~${formatEta(state.etaSeconds)} eftir`;
                    }
                  } else if (state) {
                    const label =
                      state.status === "starting"
                        ? "ræsing"
                        : state.status === "processing"
                          ? "vinnsla"
                          : state.status === "transient-error"
                            ? "⚠️ tengingarvandi, reyni aftur"
                            : state.status;
                    statusLine = `⏳ ${label}`;
                  } else {
                    statusLine = "⏳ í vinnslu";
                  }
                  return (
                    <li key={job.key} className="ac-job-row">
                      <span className="ac-job-ico" aria-hidden="true">{info.icon}</span>
                      <div className="ac-job-main">
                        <b>{info.name}</b>
                        <span className="ac-job-status">
                          {statusLine} · {minutesAgo(job.submittedAt)}
                        </span>
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
