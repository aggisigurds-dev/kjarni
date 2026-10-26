"use client";

import { useEffect, useMemo, useState } from "react";
import { StationChrome } from "../kjarni/StationChrome";
import {
  AFSLATTUR, DESTS, FERDASKRIFSTOFUR, GAUTABORG_BEINT, GAUTABORG_GLUGGI, KAUPMANNAHOFN_LEID, TRAVELLERS, WINDOWS,
  addDays, bookingUrl, buildPackages, dagsetning, flugLeit, gbp, heimaleikirI, isk, stutt,
  type DestCode, type Settings,
} from "./trip";
import "./borgarferdir.css";

const KEY = "kjarni_borgarferdir_v1";
const DEFAULTS: Settings = { out: "2026-11-12", nights: 3, bags: 2, rooms: 1, gengi: 170 };
const STADA = { athuga: "Athuga", lokid: "Líklega búið", ekki: "Gildir ekki hér", rad: "Ráð" } as const;
const num = (v: string, min: number) => Math.max(min, Number(v) || 0);

type ReqState = "idle" | "sending" | "sent" | "error";

export default function BorgarferdirClient() {
  const [s, setS] = useState<Settings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const [dest, setDest] = useState<DestCode | "allt">("MAN");
  const [svaedi, setSvaedi] = useState<"allt" | "trafford" | "midborg">("trafford");
  const [allir, setAllir] = useState(false);
  const [req, setReq] = useState<ReqState>("idle");

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
  const pakkar = useMemo(
    () =>
      buildPackages(s)
        .filter((p) => dest === "allt" || p.dest.code === dest)
        .filter((p) => p.dest.code !== "MAN" || svaedi === "allt" || (p.hotel.svaedi ?? "midborg") === svaedi),
    [s, dest, svaedi],
  );
  const leikir = heimaleikirI(s.out, s.nights);
  const syna = allir ? pakkar : pakkar.slice(0, 6);
  const cheapest = pakkar.find((p) => p.fits);

  async function bidjaUmRannsokn() {
    setReq("sending");
    const hvada = dest === "allt" ? "Manchester og Glasgow" : DESTS[dest].borg;
    try {
      const res = await fetch("https://brunaholf.netlify.app/api/verkefnalisti", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add",
          title: "Borgarferðir: endurnýja rannsóknina (tilboð úrelt/upppseld)",
          description:
            `Tilboðin á /borgarferdir eru orðin úreld — mörg upppseld eða útrunnin. ` +
            `Vinsamlegast farið yfir flug og hótel aftur fyrir ${hvada} (${dagsetning(s.out)} – ${dagsetning(ret)}) ` +
            `og uppfærið gögnin í apps/slokkvitaeki/app/borgarferdir/trip.ts með nýjum verðum, dagsetningum og tenglum.`,
          status: "beidni",
        }),
      });
      const data: unknown = await res.json().catch(() => null);
      const ok = res.ok && !(data && typeof data === "object" && "error" in data);
      setReq(ok ? "sent" : "error");
    } catch {
      setReq("error");
    }
  }

  return (
    <StationChrome tool="borgarferdir">
      <main className="bf">
        <div className="bf-in">
          <header className="bf-hero">
            <div>
              <span className="bf-kicker">Borgarferðir · nóvember–desember 2026</span>
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

          <div className="bf-refresh">
            <p>Tilboðin hér eldast hratt — mörg eru núna upppseld eða útrunnin. Smelltu til að biðja um að rannsóknin verði gerð aftur.</p>
            <button
              type="button"
              className={`bf-refresh-btn${req === "sent" ? " ok" : ""}${req === "error" ? " err" : ""}`}
              onClick={bidjaUmRannsokn}
              disabled={req === "sending" || req === "sent"}
            >
              {req === "sent" ? "Beiðni send ✓" : req === "sending" ? "Sendi…" : req === "error" ? "Villa — prófa aftur" : "🔎 Biðja um nýja rannsókn"}
            </button>
          </div>

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
              <label>Út<input type="date" min="2026-11-01" max="2026-12-15" value={s.out} onChange={(e) => e.target.value && patch({ out: e.target.value })} /></label>
              <label>Nætur<input type="number" min={1} max={14} value={s.nights} onChange={(e) => patch({ nights: Math.min(14, Math.round(num(e.target.value, 1))) })} /></label>
              <label>Heim<input type="date" value={ret} readOnly /></label>
              <label>Töskur (alls)<input type="number" min={0} max={8} value={s.bags} onChange={(e) => patch({ bags: num(e.target.value, 0) })} /></label>
              <label>Herbergi<input type="number" min={1} max={3} value={s.rooms} onChange={(e) => patch({ rooms: Math.round(num(e.target.value, 1)) })} /></label>
              <label>Gengi (kr. á £)<input type="number" min={1} value={s.gengi} onChange={(e) => patch({ gengi: num(e.target.value, 1) })} /></label>
            </div>
            <p className="bf-note">
              {dagsetning(s.out)} → {dagsetning(ret)}. Google Flights sýndi easyJet aðeins á fimmtudögum og sunnudögum á Manchester-leiðinni (Kayak segir um 9 flug á viku, svo athugaðu); aðrar
              dagsetningar geta þýtt að það flug sé ekki til.
            </p>
            {leikir.length > 0 && (dest !== "GLA") && (
              <p className="bf-warn">
                Heimaleikur á Old Trafford (rétt við Trafford Centre) í þessari ferð: {leikir.map((m) => `${dagsetning(m.dags)} ${m.lysing}`).join("; ")}.
                Hótelverð þar í kring hækka líklega. Dagsetningar óstaðfestar.
              </p>
            )}
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
            {dest !== "GLA" && (
              <div className="bf-chips sm" role="group" aria-label="Hótelsvæði í Manchester">
                <span className="bf-note">Hótel í Manchester:</span>
                {([["trafford", "Við Trafford Centre"], ["midborg", "Miðborg"], ["allt", "Allt"]] as const).map(([k, l]) => (
                  <button key={k} type="button" className={svaedi === k ? "on" : ""} aria-pressed={svaedi === k} onClick={() => setSvaedi(k)}>
                    {l}
                  </button>
                ))}
              </div>
            )}
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
                  {!p.fits && <p className="bf-warn">{p.airline.nafn} sást ekki fljúga á þessa daga (heimildir ber ekki saman) — athugaðu flugdaga.</p>}
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
              Verð uppfærð 26. okt. 2026 úr leitarvélum. Nóvember er dýrasti mánuðurinn fyrir hótel í Manchester (um £111 að meðaltali). Verð á mann: easyJet £66 og Icelandair £161 til Manchester, Icelandair £213 til Glasgow (fram og til baka), töskugjald
              £15 / £47 hvor leið. Hótelverð eru „frá“-verð af öðrum dagsetningum. Barn greiðir fullt fargjald. Hótel án verðs eru ekki
              í röðuninni.
            </p>
          </section>

          <section className="bf-sec" aria-labelledby="bf-got">
            <h2 id="bf-got">Gautaborg (Svíþjóð) · {GAUTABORG_GLUGGI}</h2>
            <p className="bf-note">
              Ný fyrirspurn, aðeins flug — ekkert hótel reiknað. Ekkert núllstopp (beint) flug KEF–GOT fannst á þessar dagsetningar á
              Google Flights — líklega árstíðabundin leið sem flýgur ekki á veturna; öll flug hér eru með einu stoppi. Verðin eru
              fyrir 1 fullorðinn, ekki fjölskyldu eins og restin af síðunni, sótt 22. okt. 2026 — staðfestu með tenglunum. Ekki er
              ljóst hvort 27. jan. 2026 eða 2027 var átt við (sá dagur í 2026 er liðinn) — hér er miðað við 2027.
            </p>
            <div className="bf-links">
              {GAUTABORG_BEINT.map((f) => (
                <a key={f.nafn} href={f.href} target="_blank" rel="noreferrer">
                  <strong>{f.nafn} ↗</strong>
                  <small>{f.leid} · {f.timi}</small>
                  <small><b>{f.verd}</b></small>
                  <small>{f.lysing}</small>
                </a>
              ))}
            </div>
            <p className="bf-note">
              <b>Valkostur:</b> fljúga beint til Kaupmannahafnar og taka lest til Gautaborgar — oft hraðara og ódýrara en
              stoppflugin að ofan, og hægt að stoppa í Köben á leiðinni.
            </p>
            <div className="bf-links">
              <a href={KAUPMANNAHOFN_LEID.flug.href} target="_blank" rel="noreferrer">
                <strong>{KAUPMANNAHOFN_LEID.flug.nafn} ↗</strong>
                <small>{KAUPMANNAHOFN_LEID.flug.timi}</small>
                <small><b>{KAUPMANNAHOFN_LEID.flug.verd}</b></small>
              </a>
              <a href={KAUPMANNAHOFN_LEID.lest.href} target="_blank" rel="noreferrer">
                <strong>{KAUPMANNAHOFN_LEID.lest.nafn} ↗</strong>
                <small>{KAUPMANNAHOFN_LEID.lest.timi}</small>
                <small><b>{KAUPMANNAHOFN_LEID.lest.verd}</b></small>
              </a>
            </div>
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

          <section className="bf-sec" aria-labelledby="bf-afs">
            <h2 id="bf-afs">Afslættir, kóðar og ráð</h2>
            <p className="bf-note">
              Ég fann engan kóða sem er staðfestur fyrir Manchester eða Glasgow í nóvember. Merkin segja til um hvort þarf að skoða
              núna, hvort tilboðið er líklega búið eða gildir ekki fyrir þessar borgir, eða hvort þetta er almennt ráð.
            </p>
            <div className="bf-tips">
              {AFSLATTUR.map((g) => (
                <div key={g.titill} className="bf-tipgroup">
                  <h3>{g.titill}</h3>
                  {g.atridi.map((a) => (
                    <div key={a.titill} className="bf-tip">
                      <div className="bf-tip-h">
                        <strong>{a.titill}</strong>
                        <span className={`bf-pill ${a.stada}`}>{STADA[a.stada]}</span>
                      </div>
                      <p>{a.texti}</p>
                      {a.href && <a href={a.href} target="_blank" rel="noreferrer">Opna ↗</a>}
                    </div>
                  ))}
                </div>
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
