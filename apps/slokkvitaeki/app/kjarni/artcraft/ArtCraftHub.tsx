"use client";

import { StationChrome } from "../StationChrome";
import { ARTCRAFT_APPS, artcraftAppHref, artcraftStudioHref, artcraftToolsHref } from "./apps";
import "./artcraft.css";

export default function ArtCraftHub() {
  return (
    <StationChrome tool="artcraft">
      <div className="ac-hub">
        <div className="ac-hub-in">
          <p className="ac-kicker">ArtCraft · Crafting Apps</p>
          <h1>Sjö öpp. Eitt handverk.</h1>
          <p className="ac-lead">
            Opin uppspretta sköpunartól frá ArtCraft, hýst í Kjarnanum. Myndvinnsla,
            vektorar, myndbönd, RAW, PDF, hreyfimyndir og síðuhönnun — allt í vafranum,
            á þínum skrám.
          </p>
          <div className="ac-featured">
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
          <div className="ac-grid">
            {ARTCRAFT_APPS.map((app) => (
              <a key={app.id} className="ac-card" href={artcraftAppHref(app.id)}>
                <span className="ac-ico" aria-hidden="true">{app.icon}</span>
                <b>{app.name}</b>
                <span className="ac-role">{app.role}</span>
                <p>{app.desc}</p>
                <span className="ac-meta">
                  {app.version} · {app.status}
                </span>
              </a>
            ))}
          </div>
          <p className="ac-legal">
            Opin uppspretta frá{" "}
            <a href="https://getartcraft.com/apps" target="_blank" rel="noreferrer">
              getartcraft.com/apps
            </a>
            . Leyfi: MIT eða Apache-2.0. WASM-útgáfur eru sóttar úr GitHub-útgáfum við
            build.
          </p>
        </div>
      </div>
    </StationChrome>
  );
}
