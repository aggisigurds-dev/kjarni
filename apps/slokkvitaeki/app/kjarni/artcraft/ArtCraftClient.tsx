"use client";

import { useEffect, useState } from "react";
import { StationChrome } from "../StationChrome";
import {
  type ArtcraftApp,
  artcraftHubHref,
  artcraftStaticPath,
  isOfficecraftApp,
  officecraftHubHref,
} from "./apps";
import { ARTCRAFT_LAUNCHER, artcraftNativePacks, artcraftNativeUrl, artcraftSumsUrl } from "./natives";
import "./artcraft.css";

function NativeDownloads({ app }: { app: ArtcraftApp }) {
  const packs = artcraftNativePacks(app);
  return (
    <details className="ac-native">
      <summary>Sækja heila forritið · {app.version}</summary>
      <p>
        Vefútgáfan er skoðarinn. Heila forritið (stærra, með skrám á vélinni) sækirðu beint
        frá GitHub — Kjarni hýsir ekki 60–270 MB tvíundarskrár.
      </p>
      <ul className="ac-ca-downloads">
        {packs.map((pack) => (
          <li key={pack.id}>
            <a className="ac-btn" href={artcraftNativeUrl(app.repo, app.tag, pack.file)} rel="noreferrer">
              {pack.label}
            </a>
            <span>
              {pack.hint}
              <code>{pack.file}</code>
            </span>
          </li>
        ))}
      </ul>
      <p>
        Eða sækja{" "}
        <a href={ARTCRAFT_LAUNCHER.site} target="_blank" rel="noreferrer">
          ArtCraft Launcher {ARTCRAFT_LAUNCHER.version}
        </a>{" "}
        sem opnar og uppfærir öll forritin:{" "}
        {ARTCRAFT_LAUNCHER.packs.map((pack, i) => (
          <span key={pack.id}>
            {i ? " · " : null}
            <a href={artcraftNativeUrl(ARTCRAFT_LAUNCHER.repo, ARTCRAFT_LAUNCHER.tag, pack.file)} rel="noreferrer">
              {pack.label}
            </a>
          </span>
        ))}
        . Prófaðu með{" "}
        <a href={artcraftSumsUrl(app.repo, app.tag)} rel="noreferrer">
          SHA256SUMS.txt
        </a>
        .
      </p>
    </details>
  );
}

export default function ArtCraftClient({ app }: { app: ArtcraftApp }) {
  const [missing, setMissing] = useState(false);
  const src = artcraftStaticPath(app.id);
  const office = isOfficecraftApp(app.id);

  useEffect(() => {
    let gone = false;
    fetch(src, { method: "GET", cache: "no-store" })
      .then((res) => {
        if (!gone && !res.ok) setMissing(true);
      })
      .catch(() => {
        if (!gone) setMissing(true);
      });
    return () => {
      gone = true;
    };
  }, [src]);

  return (
    <StationChrome tool={office ? "officecraft" : "artcraft"}>
      <div className="ac-stage">
        {missing ? (
          <div className="ac-missing">
            <h2>{app.name} er ekki uppsett hér</h2>
            <p>
              WASM-útgáfan vantar í <code>public/artcraft/{app.id}</code>. Á
              Vercel sækir <code>prebuild</code> hana sjálfkrafa. Staðbundið:
            </p>
            <pre>pnpm --filter slokkvitaeki-vefur artcraft:install</pre>
            <p>
              <a href={office ? officecraftHubHref() : artcraftHubHref()}>Til baka í {office ? "OfficeCraft" : "ArtCraft"}</a>
              {" · "}
              <a href={app.site} target="_blank" rel="noreferrer">
                {app.name} hjá ArtCraft
              </a>
            </p>
            <NativeDownloads app={app} />
          </div>
        ) : (
          <>
            <div className="ac-stage-bar">
              {office && <a className="ac-stage-back" href={officecraftHubHref()}>← OfficeCraft</a>}
              <b>{app.name}</b>
              <span>{app.role} · {app.version}</span>
              <a href={src} target="_blank" rel="noreferrer">
                Opna stórt
              </a>
            </div>
            <iframe
              src={src}
              title={`${app.name} — ${app.role}`}
              allow="fullscreen; clipboard-read; clipboard-write"
              allowFullScreen
            />
            <NativeDownloads app={app} />
          </>
        )}
      </div>
    </StationChrome>
  );
}
