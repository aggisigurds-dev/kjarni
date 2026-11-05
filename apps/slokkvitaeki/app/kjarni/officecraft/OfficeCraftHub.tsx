"use client";

import { StationChrome } from "../StationChrome";
import { artcraftAppHref, artcraftAppsByCategory, artcraftHubHref, OFFICECRAFT_APP_IDS, getArtcraftApp } from "../artcraft/apps";
import "../artcraft/artcraft.css";

/** OfficeCraft — skrifstofuforritin sem áður voru undir ArtCraft (MultiCraft-hlutinn).
 *  Sömu WASM-útgáfurnar (public/artcraft/<id>); aðeins leiðin og yfirlitið eru sér. */
export default function OfficeCraftHub() {
  // Röðin í OFFICECRAFT_APP_IDS (ritvinnsla fyrst), ekki röðin í ARTCRAFT_APPS.
  const apps = OFFICECRAFT_APP_IDS.map((id) => getArtcraftApp(id)!);
  const artCount = artcraftAppsByCategory("artcraft").length;
  return (
    <StationChrome tool="officecraft">
      <div className="ac-hub">
        <div className="ac-hub-in">
          <p className="ac-kicker">OfficeCraft · Skrifstofan</p>
          <h1>{apps.length} forrit. Ein skrifstofa.</h1>
          <p className="ac-lead">
            Ritvinnsla, töflureiknir, kynningar, PDF, CAD, viðmótshönnun, vektorar og hljóð —
            opin uppspretta, keyrir í vafranum á þínum skrám. Ekkert að setja upp, engin áskrift.
          </p>
          <div className="ac-grid">
            {apps.map((app) => (
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
            ))}
          </div>
          <p className="ac-legal">
            Mynd- og myndbandaforritin ({artCount}) og skýjatólin eru í{" "}
            <a href={artcraftHubHref()}>ArtCraft</a>. Opin uppspretta frá{" "}
            <a href="https://getartcraft.com/apps" target="_blank" rel="noreferrer">
              getartcraft.com/apps
            </a>
            . Leyfi: MIT eða Apache-2.0.
          </p>
        </div>
      </div>
    </StationChrome>
  );
}
