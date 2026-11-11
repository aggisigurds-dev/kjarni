"use client";

/** Kennsluefni: uppflettilisti yfir stökk, snúninga, skref og stöður — heiti á
 *  ensku og íslensku, ISU-skammstöfun og stutt skýring á hverju atriði. */

import { useState } from "react";
import { ExternalLink, Search, X } from "lucide-react";
import { LangToggle } from "./ElementField";
import { ELEMENTS, TURN_WORDS, nameIn, searchElements, type ElementGroup } from "./elements";
import { useElementLang } from "./lang";

const SOURCES: Array<{ title: string; note: string; href: string }> = [
  { title: "ISU — Communications", note: "Opinberi listinn: Scale of Values (stig hvers atriðis) og þrep (levels) fyrir tímabilið.", href: "https://www.isu.org/isu-communications/" },
  { title: "Skautasamband Íslands — Grunnpróf", note: "Kröfur í hverjum keppnisflokki, grunnmynstrin og grunnprófshandbókin.", href: "https://www.iceskate.is/grunnprof/" },
  { title: "Wikipedia — Figure skating jumps", note: "Stökkin sex, uppstökk og lending, með skýringarmyndum.", href: "https://en.wikipedia.org/wiki/Figure_skating_jumps" },
  { title: "Wikipedia — Figure skating spins", note: "Grunnstöður í snúningum og afbrigði þeirra.", href: "https://en.wikipedia.org/wiki/Figure_skating_spins" },
  { title: "Wikipedia — Glossary of figure skating terms", note: "Orðalisti yfir beygjur, skref og stöður.", href: "https://en.wikipedia.org/wiki/Glossary_of_figure_skating_terms" },
];

/** „Í dansinum“ (byrjunarstaða, lokastaða …) er ekki kennsluefni. */
const SHOWN = (groups: ElementGroup[]) => groups.filter((g) => g.id !== "dans");

export function ReferenceSheet({ onClose }: { onClose: () => void }) {
  const lang = useElementLang();
  const other = lang === "en" ? "is" : "en";
  const [query, setQuery] = useState("");
  const groups = SHOWN(searchElements(query));
  const count = SHOWN(ELEMENTS).reduce((n, g) => n + g.items.length, 0);
  return (
    <div className="tk-root tk-full" role="dialog" aria-modal="true" aria-label="Kennsluefni">
      <header className="tk-top">
        <button type="button" className="tk-iconbtn" onClick={onClose} aria-label="Loka">
          <X size={22} />
        </button>
        <div className="tk-name-box">
          <strong className="tk-full-title">Kennsluefni</strong>
          <span className="tk-saved">Stökk, snúningar og skref</span>
        </div>
        <LangToggle lang={lang} />
      </header>

      <div className="tk-body">
        <div className="tk-pane">
          <form className="tk-element-search wide" role="search" onSubmit={(e) => e.preventDefault()}>
            <Search size={17} aria-hidden="true" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Leita (t.d. axel, camel, StSq)" aria-label="Leita í kennsluefni" maxLength={60} enterKeyHint="search" autoCapitalize="none" autoCorrect="off" />
            {query && (
              <button type="button" className="tk-iconbtn small" onClick={() => setQuery("")} aria-label="Hreinsa leit">
                <X size={16} />
              </button>
            )}
          </form>
          {!query.trim() && (
            <p className="tk-hint">
              {count} atriði með heiti á ensku og íslensku, ISU-skammstöfun og stuttri skýringu. Stökkin og snúningarnir fylgja lista
              Alþjóðaskautasambandsins (ISU). Skýringarnar eru til upprifjunar — reglurnar sjálfar eru í heimildunum neðst.
            </p>
          )}

          {groups.map((g) => (
            <section key={g.id} className="tk-ref-group">
              <h3>
                {g.label}
                {g.note && <small> · {g.note}</small>}
              </h3>
              {g.about && !query.trim() && <p className="tk-ref-about">{g.about}</p>}
              {g.id === "stokk" && !query.trim() && (
                <div className="tk-ref-turns" aria-label="Fjöldi snúninga">
                  {(["", "2×", "3×", "4×"] as const).map((tn, i) => (
                    <span key={tn || "1"}>
                      <b>{i + 1}</b> {TURN_WORDS[lang][tn]}
                      <small>{TURN_WORDS[other][tn]}</small>
                    </span>
                  ))}
                </div>
              )}
              <ul className="tk-ref">
                {g.items.map((item) => {
                  const main = nameIn(item, lang);
                  const second = nameIn(item, other);
                  return (
                    <li key={item.name}>
                      <div className="tk-ref-head">
                        <strong>{main}</strong>
                        {item.code && <span className="tk-code">{item.code}</span>}
                        {second !== main && <small>{second}</small>}
                      </div>
                      {item.info && <p>{item.info}</p>}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {query.trim() && !groups.length && <p className="tk-blank card">Ekkert fannst fyrir „{query.trim()}“.</p>}

          <section className="tk-ref-group">
            <h3>Heimildir og meira efni</h3>
            <ul className="tk-ref links">
              {SOURCES.map((s) => (
                <li key={s.href}>
                  <a href={s.href} target="_blank" rel="noreferrer">
                    <span>
                      <strong>{s.title}</strong>
                      <small>{s.note}</small>
                    </span>
                    <ExternalLink size={17} aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
