"use client";

import { useEffect, useMemo, useState } from "react";
import { StationChrome } from "../kjarni/StationChrome";
import {
  DESTS, FERDASKRIFSTOFUR, TRAVELLERS, WINDOWS, addDays, bookingUrl, buildPackages, dagsetning, flugLeit, gbp, isk, stutt,
  type DestCode, type Settings,
} from "./trip";
import "./borgarferdir.css";

const KEY = "kjarni_borgarferdir_v1";
const DEFAULTS: Settings = { out: "2026-11-12", nights: 3, bags: 2, rooms: 1, gengi: 170 };
const num = (v: string, min: number) => Math.max(min, Number(v) || 0);

export default function BorgarferdirClient() {
  const [s, setS] = useState<Settings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const [dest, setDest] = useState<DestCode | "allt">("allt");
  const [allir, setAllir] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) setS({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch {}
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(s));
    } catch {}
  }, [s, loaded]);

  const patch = (p: Partial<Settings>) => setS((cur) => ({ ...cur, ...p }));
  const ret = addDays(s.out, s.nights);
  const pakkar = useMemo(() => buildPackages(s).filter((p) => dest === "allt" || p.dest.code === dest), [s, dest]);
  const syna = allir ? pakkar : pakkar.slice(0, 6);
  const cheapest = pakkar.find((p) => p.fits);

  return (
    <StationChrome tool="borgarferdir">
      <main className="bf">
        <div className="bf-in">
          <header className="bf-hero">
            <div>
              <span className="bf-kicker">Borgarferðir · nóvember 2026</span>
              <h1>Manchester <i aria-hidden="true">·</i> Glasgow</h1>
              <p>
                Flugleit og bestu pakkarnir fyrir {TRAVELLERS} (3 fullorðnir + barn 10 ára). Flug, töskur og hótel reiknað
                saman út frá verðum úr leitarvélum — ekki tilboð. Staðfestu verð með tenglunum.
              </p>
            </div>
            {cheapest && (
              <div className="bf-best" aria-label="Ódýrasti pakkinn">
                <span className="bf-kicker">Ódýrasti pakkinn</span>
                <strong>{isk(cheapest.total, s.gengi)}</strong>
                <small>
                  {cheapest.dest.borg} · {cheapest.airline.nafn} · {cheapest.hotel.nafn}
                </small>
              </div>
            )}
          </header>

          <section className="bf-sec" aria-labelledby="bf-dags">
            <h2 id="bf-dags">Dagsetning</h2>
            <div className="bf-chips">
              {WINDOWS.map((d) => (
                <button key={d} type="button" className={s.out === d && s.nights === 3 ? "on" : ""} onClick={() => patch({ out: d, nights: 3 })}>
                  {stutt(d)} – {stutt(addDays(d, 3))}
                </button>
              ))}
            </div>
            <div className="bf-fields">
              <label>Út<input type="date" min="2026-11-01" max="2026-11-30" value={s.out} onChange={(e) => e.target.value && patch({ out: e.target.value })} /></label>
              <label>Nætur<input type="number" min={1} max={14} value={s.nights} onChange={(e) => patch({ nights: Math.min(14, Math.round(num(e.target.value, 1))) })} /></label>
              <label>Heim<input type="date" value={ret} readOnly /></label>
              <label>Töskur (alls)<input type="number" min={0} max={8} value={s.bags} onChange={(e) => patch({ bags: num(e.target.value, 0) })} /></label>
              <label>Herbergi<input type="number" min={1} max={3} value={s.rooms} onChange={(e) => patch({ rooms: Math.round(num(e.target.value, 1)) })} /></label>
              <label>Gengi (kr. á £)<input type="number" min={1} value={s.gengi} onChange={(e) => patch({ gengi: num(e.target.value, 1) })} /></label>
            </div>
            <p className="bf-note">
              {dagsetning(s.out)} → {dagsetning(ret)}. easyJet flaug aðeins fimmtudaga og sunnudaga á Manchester-leiðinni; aðrar
              dagsetningar geta þýtt að það flug sé ekki til.
            </p>
          </section>

          <section className="bf-sec" aria-labelledby="bf-pakkar">
            <div className="bf-sec-h">
              <h2 id="bf-pakkar">Bestu pakkarnir</h2>
              <div className="bf-chips sm" role="group" aria-label="Áfangastaður">
                {(["allt", "MAN", "GLA"] as const).map((d) => (
                  <button key={d} type="button" className={dest === d ? "on" : ""} aria-pressed={dest === d} onClick={() => setDest(d)}>
                    {d === "allt" ? "Allt" : DESTS[d].borg}
                  </button>
                ))}
              </div>
            </div>
            <div className="bf-grid">
              {syna.map((p, i) => (
                <article key={p.id} className={`bf-card${i === 0 && p.fits ? " top" : ""}${p.fits ? "" : " dim"}`}>
                  <div className="bf-card-h">
                    <span className="bf-rank">{i + 1}</span>
                    <div>
                      <strong>{p.dest.borg}</strong>
                      <small>{p.airline.nafn} · {p.hotel.nafn} {p.hotel.stjornur}</small>
                    </div>
                  </div>
                  <div className="bf-total">
                    {isk(p.total, s.gengi)}
                    <small>{gbp(p.total)} alls</small>
                  </div>
                  <dl className="bf-rows">
                    <div><dt>Flug, {TRAVELLERS} manns</dt><dd>{isk(p.flights, s.gengi)}</dd></div>
                    <div><dt>Töskur ({s.bags} × 2 leiðir)</dt><dd>{isk(p.bags, s.gengi)}</dd></div>
                    <div><dt>Hótel, {s.nights} nætur</dt><dd>{isk(p.hotelCost, s.gengi)}</dd></div>
                  </dl>
                  {!p.fits && <p className="bf-warn">{p.airline.nafn} flaug ekki á þessa daga — veldu fimmtudag til sunnudags.</p>}
                  <div className="bf-actions">
                    <a href={flugLeit(p.dest, s)[1].href} target="_blank" rel="noreferrer">Flug ↗</a>
                    <a href={bookingUrl(`${p.hotel.nafn} ${p.dest.borg}`, s)} target="_blank" rel="noreferrer">Hótel ↗</a>
                  </div>
                </article>
              ))}
            </div>
            {pakkar.length > 6 && (
              <button type="button" className="bf-more" onClick={() => setAllir((v) => !v)}>
                {allir ? "Sýna færri" : `Sýna alla ${pakkar.length} pakka`}
              </button>
            )}
            <p className="bf-note">
              Verð á mann: easyJet £66 og Icelandair £161 til Manchester, Icelandair £222 til Glasgow (fram og til baka), töskugjald
              £15 / £47 hvor leið. Hótelverð eru „frá“-verð af öðrum dagsetningum. Barn greiðir fullt fargjald. Hótel án verðs eru ekki
              í röðuninni.
            </p>
          </section>

          <section className="bf-sec" aria-labelledby="bf-fs">
            <h2 id="bf-fs">Tilbúnir pakkar ferðaskrifstofa</h2>
            <p className="bf-note">Ég náði ekki í lifandi verð á þessum síðum — opnaðu þær og skoðaðu nóvember fyrir 3 fullorðna + 1 barn.</p>
            <div className="bf-links">
              {FERDASKRIFSTOFUR.map((f) => (
                <a key={f.nafn} href={f.href} target="_blank" rel="noreferrer">
                  <strong>{f.nafn} ↗</strong>
                  <small>{f.lysing}</small>
                </a>
              ))}
            </div>
          </section>

          {Object.values(DESTS).map((d) => (
            <section key={d.code} className="bf-sec" aria-labelledby={`bf-h-${d.code}`}>
              <h2 id={`bf-h-${d.code}`}>Hótel í {d.borg}</h2>
              <div className="bf-hotels">
                {d.hotels.map((h) => (
                  <article key={h.nafn} className="bf-hotel">
                    <div className="bf-hotel-h">
                      <strong>{h.nafn}</strong>
                      <span>{h.stjornur}</span>
                    </div>
                    <small>{h.hverfi}</small>
                    <b>{h.rate !== null ? `frá um ${gbp(h.rate)} nóttin · ${isk(h.rate, s.gengi)}` : "Verð fannst ekki — athugaðu lifandi"}</b>
                    <p>{h.hvers}</p>
                    <a href={bookingUrl(`${h.nafn} ${d.borg}`, s)} target="_blank" rel="noreferrer">Athuga {stutt(s.out)} – {stutt(ret)} ↗</a>
                  </article>
                ))}
              </div>
              <div className="bf-chips sm">
                {flugLeit(d, s).map((l) => (
                  <a key={l.nafn} className="bf-chip" href={l.href} target="_blank" rel="noreferrer">{l.nafn} ↗</a>
                ))}
              </div>
            </section>
          ))}

          <p className="bf-note">
            Biddu um herbergi sem sefur fjóra eða bókaðu tvö — mörg hótel leyfa aðeins tvo fullorðna í herbergi. Á Manchester-leiðinni hækkar
            verð um leikjahelgar á Old Trafford og Etihad.
          </p>
        </div>
      </main>
    </StationChrome>
  );
}
