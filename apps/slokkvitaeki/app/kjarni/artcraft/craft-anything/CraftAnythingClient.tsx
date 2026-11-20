"use client";

import { useEffect, useRef, useState } from "react";
import { StationChrome } from "../../StationChrome";
import { type ArtcraftApp, artcraftHubHref, artcraftStaticPath } from "../apps";
import "../artcraft.css";
import { craftHtml } from "./craft";
import { CRAFT_ANYTHING_NATIVE, craftAnythingNativeUrl, craftAnythingSumsUrl } from "./downloads";
import { STUDY_SITES, studyBytes, studyHtml, type Study } from "./study";

type Hamur = "forrit" | "saekja" | "vefur" | "smida";

const STORE = "kjarni_craft_anything";

export default function CraftAnythingClient({ app }: { app: ArtcraftApp }) {
  const src = artcraftStaticPath(app.id);
  const [missing, setMissing] = useState(false);
  const [hamur, setHamur] = useState<Hamur>("forrit");
  const [url, setUrl] = useState(STUDY_SITES[0]?.url ?? "");
  const [paste, setPaste] = useState("");
  const [want, setWant] = useState("Endurgerðu hausinn og valmyndina í hreinu HTML.");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [study, setStudy] = useState<Study | null>(null);
  const [crafted, setCrafted] = useState("");
  const [drag, setDrag] = useState(false);

  useEffect(() => {
    let gone = false;
    fetch(src, { method: "GET", cache: "no-store" })
      .then((res) => {
        if (!gone && !res.ok) setMissing(true);
      })
      .catch(() => {
        if (!gone) setMissing(true);
      });
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORE) || "null") as {
        url?: string;
        want?: string;
      } | null;
      if (saved?.url) setUrl(saved.url);
      if (saved?.want) setWant(saved.want);
    } catch {
      /* fyrsta opnun */
    }
    return () => {
      gone = true;
    };
  }, [src]);

  function remember(next: { url?: string; want?: string }) {
    try {
      const prev = JSON.parse(window.localStorage.getItem(STORE) || "{}") as Record<string, string>;
      window.localStorage.setItem(STORE, JSON.stringify({ ...prev, ...next }));
    } catch {
      /* private mode */
    }
  }

  function applyStudy(next: Study, go?: Hamur) {
    setStudy(next);
    setError("");
    if (go) setHamur(go);
    if (next.kind !== "binary") setCrafted(craftHtml(next, want));
  }

  async function studyUrl(target = url) {
    setBusy(true);
    setError("");
    remember({ url: target });
    try {
      const res = await fetch("/api/craft-anything/study", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: target }),
      });
      const data = (await res.json()) as { error?: string; html?: string; finalUrl?: string };
      if (!res.ok || !data.html) throw new Error(data.error || "Gat ekki skoðað síðuna");
      const name = (() => {
        try {
          return new URL(data.finalUrl || target).pathname.split("/").pop() || "index.html";
        } catch {
          return "index.html";
        }
      })();
      applyStudy(studyBytes(name, new TextEncoder().encode(data.html)), "vefur");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gat ekki skoðað síðuna");
    } finally {
      setBusy(false);
    }
  }

  function studyPaste() {
    if (!paste.trim()) {
      setError("Límdu HTML fyrst.");
      return;
    }
    applyStudy(studyHtml(paste, "limt.html"), "vefur");
  }

  async function onFile(file: File) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const next = studyBytes(file.name, bytes);
    applyStudy(next, next.kind === "binary" ? "forrit" : "vefur");
  }

  function makeCraft() {
    if (!study) {
      setError("Skoðaðu vef eða skrá fyrst.");
      return "";
    }
    remember({ want });
    const html = craftHtml(study, want);
    setCrafted(html);
    setError("");
    return html;
  }

  function downloadCraft() {
    const html = makeCraft();
    if (!html) return;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "endurgerd.html";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <StationChrome tool="artcraft">
      <div className="ac-ca">
        <div className="ac-stage-bar">
          <a className="ac-stage-back" href={artcraftHubHref()}>
            ← ArtCraft
          </a>
          <b>{app.name}</b>
          <span>{app.role}</span>
          <a href={src} target="_blank" rel="noreferrer">
            Opna stórt
          </a>
        </div>
        <div className="ac-modes ac-ca-modes" role="tablist" aria-label="Hamur">
          {(
            [
              ["forrit", "Forrit"],
              ["saekja", "Sækja fullt"],
              ["vefur", "Skoða vef"],
              ["smida", "Smíða"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              className={hamur === id ? "on" : undefined}
              aria-selected={hamur === id}
              onClick={() => setHamur(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {error && hamur !== "forrit" ? <p className="ac-error ac-ca-error">{error}</p> : null}

        {hamur === "forrit" ? (
          missing ? (
            <div className="ac-missing">
              <h2>Craft Anything er ekki uppsett hér</h2>
              <p>
                WASM-útgáfan vantar í <code>public/artcraft/{app.id}</code>. Á Vercel sækir{" "}
                <code>prebuild</code> hana. Staðbundið:{" "}
                <code>pnpm --filter slokkvitaeki-vefur artcraft:install</code>
              </p>
            </div>
          ) : (
            <iframe
              className="ac-ca-app"
              src={src}
              title={`${app.name} — ${app.role}`}
              allow="clipboard-read; clipboard-write; fullscreen"
              allowFullScreen
            />
          )
        ) : null}

        {hamur === "saekja" ? (
          <div className="ac-ca-pane ac-studio">
            <p className="ac-hint">
              Heila forritið (Study → Build → Check, 320 tól, MCP, Claude Code) er borðtölvu-app.
              Flipinn Forrit er skoðarinn sem ArtCraft birtir. Sæktu sama 0.6.1 og þeir gefa út —
              Kjarni hýsir ekki 67 MB tvíundarskrár.
            </p>
            <ul className="ac-ca-downloads">
              {CRAFT_ANYTHING_NATIVE.map((pack) => (
                <li key={pack.id}>
                  <a className="ac-btn" href={craftAnythingNativeUrl(pack.file)} rel="noreferrer">
                    {pack.label}
                  </a>
                  <span>
                    {pack.hint}
                    <code>{pack.file}</code>
                  </span>
                </li>
              ))}
            </ul>
            <p className="ac-hint">
              Prófaðu niðurhalið með{" "}
              <a href={craftAnythingSumsUrl()} rel="noreferrer">
                SHA256SUMS.txt
              </a>
              . Frumkóði:{" "}
              <a href={app.repo} target="_blank" rel="noreferrer">
                storytold/craft-anything
              </a>
              . Bygging:{" "}
              <code>cargo run --release -p craft-anything</code> (Rust 1.97+).
            </p>
          </div>
        ) : null}

        {hamur === "vefur" ? (
          <div className="ac-ca-pane ac-studio">
            <p className="ac-hint">
              Skoðar slóð á okkar vefjum (Kjarni sækir HTML) eða HTML sem þú límir. Ekkert
              JavaScript er keyrt. Skráin sem þú sleppir fer hvergi.
            </p>
            <div className="ac-row">
              {STUDY_SITES.map((site) => (
                <button
                  key={site.url}
                  type="button"
                  className="ac-btn ghost"
                  onClick={() => {
                    setUrl(site.url);
                    void studyUrl(site.url);
                  }}
                >
                  {site.label}
                </button>
              ))}
            </div>
            <label>
              Slóð
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://slokkvitaeki.netlify.app/"
                inputMode="url"
              />
            </label>
            <div className="ac-row">
              <button type="button" className="ac-btn" disabled={busy} onClick={() => void studyUrl()}>
                {busy ? "Skoða…" : "Skoða slóð"}
              </button>
            </div>
            <label>
              Eða límdu HTML
              <textarea
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                rows={6}
                placeholder="<!doctype html>…"
              />
            </label>
            <button type="button" className="ac-btn ghost" onClick={studyPaste}>
              Skoða limdan kóða
            </button>
            <Drop drag={drag} setDrag={setDrag} onFile={(file) => void onFile(file)} label="Eða slepptu HTML, JS eða CSS hér" />
            {study ? <Evidence study={study} /> : null}
          </div>
        ) : null}

        {hamur === "smida" ? (
          <div className="ac-ca-pane ac-studio">
            <p className="ac-hint">
              Hreinsmíði: litir, letur, valmynd og fyrirsagnir úr skoðuninni. Enginn upprunalegur
              kóði, engar skriftur, engin lógó.
            </p>
            {!study ? <p className="ac-hint">Skoðaðu vef eða skrá fyrst — svo er hægt að smíða.</p> : null}
            <label>
              Hvað viltu búa til
              <textarea
                value={want}
                onChange={(e) => setWant(e.target.value)}
                rows={4}
                placeholder="Endurgerðu hausinn, gerðu hann bláan…"
              />
            </label>
            <div className="ac-row">
              <button type="button" className="ac-btn" onClick={() => makeCraft()}>
                Smíða drög
              </button>
              <button type="button" className="ac-btn ghost" onClick={downloadCraft}>
                Sækja HTML
              </button>
            </div>
            {crafted ? (
              <iframe className="ac-ca-preview" title="Drög að endurgerð" srcDoc={crafted} sandbox="" />
            ) : null}
          </div>
        ) : null}
      </div>
    </StationChrome>
  );
}

function Drop({
  drag,
  setDrag,
  onFile,
  label,
}: {
  drag: boolean;
  setDrag: (v: boolean) => void;
  onFile: (file: File) => void;
  label: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div
      className={`ac-drop ac-ca-drop${drag ? " on" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onFile(file);
      }}
    >
      <p>{label}</p>
      <button type="button" className="ac-btn ghost" onClick={() => fileRef.current?.click()}>
        Opna skrá
      </button>
      <input
        ref={fileRef}
        type="file"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function Evidence({ study }: { study: Study }) {
  return (
    <section className="ac-ca-evidence" aria-label="Sönnun">
      <h2>Sönnun</h2>
      <p>{study.summary}</p>
      {study.tech.length ? (
        <p className="ac-ca-tech">
          {study.tech.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </p>
      ) : null}
      <dl>
        {study.facts.map((fact) => (
          <div key={fact.label}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>
      {study.headings.length ? (
        <p>
          <strong>Fyrirsagnir:</strong> {study.headings.join(" · ")}
        </p>
      ) : null}
      {study.nav.length ? (
        <p>
          <strong>Valmynd:</strong> {study.nav.join(" · ")}
        </p>
      ) : null}
    </section>
  );
}
