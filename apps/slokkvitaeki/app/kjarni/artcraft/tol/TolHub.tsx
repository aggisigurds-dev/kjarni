"use client";

import { StationChrome } from "../../StationChrome";
import { artcraftHubHref } from "../apps";
import { AUTO_TOOLS } from "../tol";
import "../artcraft.css";

export default function TolHub() {
  return (
    <StationChrome tool="artcraft">
      <div className="ac-hub">
        <div className="ac-hub-in">
          <p className="ac-kicker">
            <a href={artcraftHubHref()}>ArtCraft</a> · Sjálfvirk tól
          </p>
          <h1>Autogenerator</h1>
          <p className="ac-lead">
            Tól sem vinna myndina fyrir þig. Byrjaðu á bakgrunni á vörumyndum —
            smelltu, ekkert stillt.
          </p>
          <div className="ac-grid">
            {AUTO_TOOLS.map((tool) => (
              <a key={tool.id} className="ac-card" href={tool.href}>
                <span className="ac-ico" aria-hidden="true">{tool.icon}</span>
                <b>{tool.name}</b>
                <span className="ac-role">{tool.role}</span>
                <p>{tool.desc}</p>
                <span className="ac-meta">{tool.ready ? "Tilbúið" : "Í vinnslu"}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </StationChrome>
  );
}
