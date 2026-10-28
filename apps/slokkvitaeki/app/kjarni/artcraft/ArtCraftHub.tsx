"use client";

import { StationChrome } from "../StationChrome";
import {
  artcraftAppHref,
  artcraftAppsByCategory,
  artcraftStudioHref,
  artcraftToolsHref,
  type ArtcraftApp,
} from "./apps";
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
  const artcraftApps = artcraftAppsByCategory("artcraft");
  const multicraftApps = artcraftAppsByCategory("multicraft");
  return (
    <StationChrome tool="artcraft">
      <div className="ac-hub">
        <div className="ac-hub-in">
          <p className="ac-kicker">ArtCraft · Crafting Apps</p>
          <h1>13 öpp. Eitt handverk.</h1>
          <p className="ac-lead">
            Opin uppspretta sköpunartól frá ArtCraft, hýst í Kjarnanum. Myndvinnsla,
            vektorar, myndbönd, RAW, hreyfimyndir, síðuhönnun og hljóðvinnsla undir
            ArtCraft; ritvinnsla, kynningar, PDF, töflureiknir, CAD og
            viðmótshönnun undir MultiCraft — allt í vafranum, á þínum skrám.
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
          <h2 className="ac-section-title">ArtCraft — myndrænt og listrænt</h2>
          <div className="ac-grid">
            {artcraftApps.map((app) => (
              <AppCard key={app.id} app={app} />
            ))}
          </div>
          <h2 className="ac-section-title">MultiCraft — ritvinnsla, kynningar, PDF, töflur, CAD, viðmót</h2>
          <div className="ac-grid">
            {multicraftApps.map((app) => (
              <AppCard key={app.id} app={app} />
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
