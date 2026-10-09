"use client";

import { useEffect, useState } from "react";
import { StationChrome } from "../StationChrome";
import {
  type ArtcraftApp,
  artcraftHubHref,
  artcraftStaticPath,
} from "./apps";
import "./artcraft.css";

export default function ArtCraftClient({ app }: { app: ArtcraftApp }) {
  const [missing, setMissing] = useState(false);
  const src = artcraftStaticPath(app.id);

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
    <StationChrome tool="artcraft">
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
              <a href={artcraftHubHref()}>Til baka í ArtCraft</a>
              {" · "}
              <a href={app.site} target="_blank" rel="noreferrer">
                {app.name} hjá ArtCraft
              </a>
            </p>
          </div>
        ) : (
          <iframe
            src={src}
            title={`${app.name} — ${app.role}`}
            allow="fullscreen; clipboard-read; clipboard-write"
            allowFullScreen
          />
        )}
      </div>
    </StationChrome>
  );
}
