"use client";

import { StationChrome } from "../StationChrome";
import {
  artcraftAppHref,
  artcraftAppsByCategory,
  artcraftStudioHref,
  artcraftToolsHref,
  getArtcraftApp,
  officecraftHubHref,
  OFFICECRAFT_APP_IDS,
  type ArtcraftApp,
} from "./apps";
import { ARTCRAFT_LAUNCHER, artcraftNativeUrl } from "./natives";
import "./artcraft.css";

function AppCard({ app }: { app: ArtcraftApp }) {
  return (
    <a key={app.id} className="ac-card" href={artcraftAppHref(app.id)}>
      <span className="ac-ico" aria-hidden="true">
        {app.icon}
      </span>
      <b>{app.name}</b>
      <span className="ac-role">{app.role}</span>
      <p>{app.desc}</p>
      <span className="ac-meta">
        {app.version} · {app.status}
      </span>
    </a>
  );
}

export default function ArtCraftHub() {
  const craftAnything = getArtcraftApp("craft-anything");
  const artcraftApps = artcraftAppsByCategory("artcraft").filter((app) => app.id !== "craft-anything");
  return (
    <StationChrome tool="artcraft">
      <div className="ac-hub">
        <div className="ac-hub-in">
          <p className="ac-kicker">ArtCraft · Crafting Apps</p>
          <h1>Myndir og myndbönd. Eitt handverk.</h1>
          <p className="ac-lead">
            Opin uppspretta sköpunartól frá ArtCraft, hýst í Kjarnanum: myndvinnsla,
            myndbönd, RAW, hreyfimyndir, síðuhönnun og Craft Anything — WASM í
            vafranum, heila borðtölvu-útgáfan (stærri) á Sækja-stikunni í hverju forriti.
            Skrifstofuforritin (ritvinnsla, töflur, kynningar, PDF, CAD …) eru nú í{" "}
            <a href={officecraftHubHref()}>OfficeCraft</a>.
          </p>
          <div className="ac-featured">
            {craftAnything ? (
              <a className="ac-card ac-card-studio" href={artcraftAppHref(craftAnything.id)}>
                <span className="ac-ico" aria-hidden="true">{craftAnything.icon}</span>
                <b>{craftAnything.name}</b>
                <span className="ac-role">{craftAnything.role}</span>
                <p>{craftAnything.desc}</p>
                <span className="ac-meta">{craftAnything.version} · {craftAnything.status}</span>
              </a>
            ) : null}
            <a className="ac-card ac-card-studio" href={artcraftToolsHref()}>
              <span className="ac-ico" aria-hidden="true">⚡</span>
              <b>Autogenerator</b>
              <span className="ac-role">Sjálfvirk tól</span>
              <p>
                Fjarlægja bakgrunn, setja vöru á hvítt, eða opna einkastúdíóið.
                Smelltu — ekkert stillt.
              </p>
              <span className="ac-meta">Bakgrunnur · Á hvítu · Einkastúdíó</span>
            </a>
            <a className="ac-card ac-card-studio" href={artcraftStudioHref()}>
              <span className="ac-ico" aria-hidden="true">🔓</span>
              <b>Einkastúdíó</b>
              <span className="ac-role">Staðbundið líkan</span>
              <p>
                Texti → mynd á þinni vél. Fullorðinsmyndefni leyfilegt. Engin skýjasía.
                Ekkert sem snýr að börnum.
              </p>
              <span className="ac-meta">Automatic1111 · Forge · SD.Next</span>
            </a>
          </div>
          <h2 className="ac-section-title">ArtCraft — myndrænt og listrænt</h2>
          <div className="ac-grid">
            {artcraftApps.map((app) => (
              <AppCard key={app.id} app={app} />
            ))}
          </div>
          <h2 className="ac-section-title">OfficeCraft — skrifstofuforritin</h2>
          <div className="ac-featured">
            <a className="ac-card ac-card-studio" href={officecraftHubHref()}>
              <span className="ac-ico" aria-hidden="true">🗂️</span>
              <b>OfficeCraft</b>
              <span className="ac-role">{OFFICECRAFT_APP_IDS.length} forrit</span>
              <p>
                Ritvinnsla, töflureiknir, kynningar, PDF, CAD, viðmótshönnun, vektorar og
                hljóð — flutt úr ArtCraft í eigið tól.
              </p>
              <span className="ac-meta">WordCraft · GridCraft · DeckCraft · PdfCraft · …</span>
            </a>
          </div>
          <h2 className="ac-section-title">ArtCraft Launcher — öll forritin á vélinni</h2>
          <p className="ac-lead">
            {ARTCRAFT_LAUNCHER.desc} Útgáfa {ARTCRAFT_LAUNCHER.version}. Sæktu það, ekki WASM-zip-ið,
            þegar þú vilt heila forritið.
          </p>
          <div className="ac-featured">
            {ARTCRAFT_LAUNCHER.packs.map((pack) => (
              <a
                key={pack.id}
                className="ac-card"
                href={artcraftNativeUrl(ARTCRAFT_LAUNCHER.repo, ARTCRAFT_LAUNCHER.tag, pack.file)}
                rel="noreferrer"
              >
                <b>{pack.label}</b>
                <span className="ac-role">{pack.hint}</span>
                <p>{pack.file}</p>
                <span className="ac-meta">{ARTCRAFT_LAUNCHER.version}</span>
              </a>
            ))}
          </div>
          <p className="ac-legal">
            Opin uppspretta frá{" "}
            <a href="https://getartcraft.com/apps" target="_blank" rel="noreferrer">
              getartcraft.com/apps
            </a>
            . Leyfi: MIT eða Apache-2.0. WASM-útgáfur eru sóttar úr GitHub-útgáfum við
            build. Heilu borðtölvu-pakkarnir eru á GitHub, ekki hýstir hér.
          </p>
        </div>
      </div>
    </StationChrome>
  );
}
