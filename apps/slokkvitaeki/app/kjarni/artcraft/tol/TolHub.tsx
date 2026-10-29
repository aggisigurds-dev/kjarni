"use client";

import { StationChrome } from "../../StationChrome";
import { artcraftHubHref } from "../apps";
import { AUTO_TOOLS, TOOL_CATEGORIES, type ToolCategory } from "../tol";
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
            Tól sem vinna myndina fyrir þig. Flokkað eftir aðgerð — búa til, breyta,
            betrumbæta, mynd­band, hljóð.
          </p>
          {TOOL_CATEGORIES.map((cat) => {
            const tools = AUTO_TOOLS.filter((t) => t.category === (cat.id as ToolCategory));
            if (tools.length === 0) return null;
            return (
              <section key={cat.id} className="ac-cat">
                <header className="ac-cat-head">
                  <span className="ac-cat-ico" aria-hidden="true">{cat.icon}</span>
                  <div className="ac-cat-txt">
                    <h2>{cat.label}</h2>
                    <p>{cat.blurb}</p>
                  </div>
                </header>
                <div className="ac-grid">
                  {tools.map((tool) => (
                    <a key={tool.id} className="ac-card" href={tool.href}>
                      <span className="ac-ico" aria-hidden="true">{tool.icon}</span>
                      <b>{tool.name}</b>
                      <span className="ac-role">{tool.role}</span>
                      <p>{tool.desc}</p>
                      <span className="ac-meta">{tool.ready ? "Tilbúið" : "Í vinnslu"}</span>
                    </a>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </StationChrome>
  );
}
