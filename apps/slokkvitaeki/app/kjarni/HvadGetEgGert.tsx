"use client";

import { ADGERDIR, HVAD_HREF, THRIR } from "./hvad-data";
import "./hvad.css";

const uti = { target: "_blank", rel: "noreferrer" } as const;

export function HvadBanner() {
  return (
    <a className="hvad-ban" href={HVAD_HREF}>
      <span>
        <strong>Hvað get ég gert?</strong>
        <span>Þessi vefur, spjallið, kóðinn — og smellanleg tól.</span>
      </span>
      <em>Opna →</em>
    </a>
  );
}

export function HvadGetEgGert() {
  return (
    <div className="hvad">
      <header>
        <h1>Hvað get ég gert?</h1>
        <p className="hvad-lead">
          Þrjú dót. Ekki rugla þeim. Fyrir neðan eru hlutirnir sem þú getur smellt á á þessum vef.
        </p>
      </header>

      <div className="hvad-thririr">
        {THRIR.map((t) => (
          <div className="hvad-thrir" key={t.id}>
            <b>{t.nafn}</b>
            <p>{t.lysing}</p>
          </div>
        ))}
      </div>

      <section>
        <h2>Smelltu á eitthvað</h2>
        <div className="hvad-grid">
          {ADGERDIR.map((a) => (
            <a
              key={a.href}
              className="hvad-kort"
              href={a.href}
              {...(a.uti ? uti : {})}
            >
              <strong>{a.nafn}</strong>
              <span>{a.lysing}</span>
              <em>{a.uti ? "Opna ↗" : "Opna →"}</em>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
