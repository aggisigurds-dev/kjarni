"use client";

/** Val á heiti fyrir hápunkt (stökk, snúningur …) og einkunn með stjörnum. */

import { useState } from "react";
import { ChevronDown, Plus, Search, Star, X } from "lucide-react";
import {
  COMBO_MAX,
  GRADES,
  GRADE_LABEL,
  TURNS,
  TURN_WORDS,
  codeOf,
  infoOf,
  joinCombo,
  jumpParts,
  labelIn,
  nameIn,
  parseElement,
  plainText,
  searchElements,
  splitSpin,
  withSpin,
  withTurns,
  type ElementGroupId,
  type Lang,
  type Turns,
} from "./elements";
import { setElementLang, useElementLang } from "./lang";

/** Rofi milli enskra og íslenskra heita. */
export function LangToggle({ lang }: { lang: Lang }) {
  return (
    <div className="tk-seg tk-lang" role="radiogroup" aria-label="Mál á heitum">
      {(["en", "is"] as const).map((l) => (
        <button key={l} type="button" role="radio" aria-checked={lang === l} className={lang === l ? "on" : ""} onClick={() => setElementLang(l)}>
          {l === "en" ? "EN" : "ÍS"}
        </button>
      ))}
    </div>
  );
}

/** Hnappur sem sýnir heitið og opnar lista til að velja úr (eða skrifa eigið). */
export function ElementField({ value, onChange }: { value: string; onChange: (label: string) => void }) {
  const lang = useElementLang();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  /** Næsta stökk sem er valið bætist aftan við (samsetning) í stað þess að koma í stað þess síðasta. */
  const [adding, setAdding] = useState(false);
  const jumps = jumpParts(value);
  const spin = splitSpin(value);
  const code = codeOf(value);
  const info = infoOf(value);
  const typed = query.trim();
  const groups = searchElements(query);
  const parsed = typed ? parseElement(typed) : null;
  const plainTyped = plainText(typed);
  const same = (name: string) => plainText(name) === plainTyped;
  const hit = typed ? groups.flatMap((g) => g.items.map((i) => ({ group: g.id, item: i }))).find((x) => same(x.item.name) || (x.item.en ? same(x.item.en) : false)) : undefined;

  const close = () => {
    setOpen(false);
    setQuery("");
    setAdding(false);
  };
  const setJumps = (parts: Array<{ turns: Turns; name: string }>) => onChange(joinCombo(parts.map((p) => withTurns(p.name, p.turns))));
  const lastJump = jumps?.[jumps.length - 1];

  function pick(group: ElementGroupId, name: string) {
    if (group === "stokk") {
      // Stökk: nýtt stökk heldur snúningafjöldanum sem var valinn, eða bætist við samsetninguna.
      if (jumps && adding && jumps.length < COMBO_MAX) setJumps([...jumps, { turns: "", name }]);
      else if (jumps) setJumps([...jumps.slice(0, -1), { turns: lastJump!.turns, name }]);
      else setJumps([{ turns: "", name }]);
      setAdding(false);
      setQuery("");
      return;
    }
    if (group === "snuningar") {
      onChange(withSpin(name, spin?.fly ?? false, spin?.change ?? false));
      setQuery("");
      return;
    }
    onChange(name);
    close();
  }

  return (
    <>
      <button type="button" className={`tk-word tk-element${value ? "" : " empty"}`} onClick={() => setOpen(true)} aria-label={value ? `Tegund: ${labelIn(value, lang)}. Ýttu til að breyta` : "Velja tegund"}>
        <span className="tk-ellipsis">{value ? labelIn(value, lang) : "Hvað gerist? Veldu…"}</span>
        {code && <span className="tk-code">{code}</span>}
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="tk-sheet-back up" onClick={close}>
          <div className="tk-sheet tall" role="dialog" aria-modal="true" aria-label="Velja tegund" onClick={(e) => e.stopPropagation()}>
            <div className="tk-sheet-head">
              <strong>Hvað gerist hér?</strong>
              <LangToggle lang={lang} />
              <button type="button" className="tk-iconbtn small" onClick={close} aria-label="Loka">
                <X size={18} />
              </button>
            </div>
            <form
              className="tk-element-search"
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                if (!typed) return;
                // Enter: heiti af listanum ef það var slegið inn, annars skammstöfun eða orð („double axel“), annars eigið heiti.
                if (hit) pick(hit.group, hit.item.name);
                else if (parsed) {
                  onChange(parsed);
                  setQuery("");
                } else {
                  onChange(typed.slice(0, 60));
                  close();
                }
              }}
            >
              <Search size={17} aria-hidden="true" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Leita eða skrifa eigið (t.d. 2A+2T)" aria-label="Leita að heiti eða skrifa eigið" maxLength={60} enterKeyHint="done" autoCapitalize="none" autoCorrect="off" />
              {query && (
                <button type="button" className="tk-iconbtn small" onClick={() => setQuery("")} aria-label="Hreinsa leit">
                  <X size={16} />
                </button>
              )}
            </form>
            <div className="tk-sheet-scroll">
              {value && !typed && (
                <div className="tk-element-now">
                  <div>
                    <span>
                      <strong>{labelIn(value, lang)}</strong>
                      {code && <span className="tk-code">{code}</span>}
                    </span>
                    {info && (
                      <p>
                        {/* Í samsetningu á skýringin við síðasta stökkið — það sem hnapparnir breyta. */}
                        {jumps && jumps.length > 1 && lastJump ? `${lastJump.name}: ` : ""}
                        {info}
                      </p>
                    )}
                  </div>
                  <button type="button" className="tk-link" onClick={() => onChange("")}>
                    Hreinsa
                  </button>
                </div>
              )}
              {typed && (
                <div className="tk-row">
                  {parsed && !hit && (
                    <button
                      type="button"
                      className="tk-chip on"
                      onClick={() => {
                        onChange(parsed);
                        setQuery("");
                      }}
                    >
                      {labelIn(parsed, lang)}
                      <span className="tk-code">{codeOf(parsed)}</span>
                    </button>
                  )}
                  {!parsed && !hit && (
                    <button
                      type="button"
                      className="tk-chip"
                      onClick={() => {
                        onChange(typed.slice(0, 60));
                        close();
                      }}
                    >
                      Nota „{typed}“
                    </button>
                  )}
                </div>
              )}
              {groups.map((g) => (
                <div key={g.id}>
                  <h3>
                    {g.label}
                    {g.note && <small> · {g.note}</small>}
                  </h3>
                  <div className="tk-row">
                    {g.items.map((item) => {
                      const on = g.id === "stokk" ? lastJump?.name === item.name : g.id === "snuningar" ? spin?.base === item.name : value.trim().toLowerCase() === item.name.toLowerCase();
                      const shown = nameIn(item, lang);
                      // Þegar leitin fann atriðið eftir öðru heiti en því sem sést: sýna það heiti líka.
                      const other = [nameIn(item, lang === "en" ? "is" : "en"), ...(item.also ?? "").split(",")].map((x) => x.trim()).find((x) => x && plainText(x).includes(plainTyped));
                      const why = typed && !plainText(shown).includes(plainTyped) ? (other ?? "") : "";
                      return (
                        <button key={item.name} type="button" className={`tk-chip${on ? " on" : ""}`} onClick={() => pick(g.id, item.name)}>
                          {shown}
                          {item.code && <span className="tk-code">{item.code}</span>}
                          {why && <small>{why}</small>}
                        </button>
                      );
                    })}
                  </div>
                  {g.id === "stokk" && jumps && lastJump && (
                    <>
                      <div className="tk-row">
                        <span className="tk-muted">Snúningar:</span>
                        {TURNS.map((tn) => (
                          <button key={tn || "1"} type="button" className={`tk-chip${lastJump.turns === tn ? " on" : ""}`} onClick={() => setJumps([...jumps.slice(0, -1), { turns: tn, name: lastJump.name }])}>
                            {TURN_WORDS[lang][tn]}
                          </button>
                        ))}
                      </div>
                      <div className="tk-row">
                        <span className="tk-muted">Samsetning:</span>
                        <button type="button" className={`tk-chip${adding ? " on" : ""}`} aria-pressed={adding} disabled={jumps.length >= COMBO_MAX} onClick={() => setAdding((a) => !a)}>
                          <Plus size={15} /> {adding ? "Veldu næsta stökk" : "Bæta stökki við"}
                        </button>
                        {jumps.length > 1 && (
                          <button
                            type="button"
                            className="tk-chip"
                            onClick={() => {
                              setAdding(false);
                              setJumps(jumps.slice(0, -1));
                            }}
                          >
                            Taka síðasta af
                          </button>
                        )}
                      </div>
                    </>
                  )}
                  {g.id === "snuningar" && spin && (
                    <div className="tk-row">
                      <button type="button" className={`tk-chip${spin.fly ? " on" : ""}`} role="switch" aria-checked={spin.fly} onClick={() => onChange(withSpin(spin.base, !spin.fly, spin.change))}>
                        {lang === "en" ? "Flying" : "Með flugi"}
                      </button>
                      <button type="button" className={`tk-chip${spin.change ? " on" : ""}`} role="switch" aria-checked={spin.change} onClick={() => onChange(withSpin(spin.base, spin.fly, !spin.change))}>
                        {lang === "en" ? "Change foot" : "Með fótaskiptum"}
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {typed && !groups.length && !parsed && <p className="tk-muted">Ekkert á listanum passar — ýttu á „Nota“ til að nota þitt eigið heiti.</p>}
              <button type="button" className="tk-cta" onClick={close}>
                Lokið
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Einkunn 1–5 með stjörnum; ýtt aftur á sömu stjörnu tekur einkunnina af. */
export function Stars({ value, onChange, label }: { value?: number; onChange: (grade: number | undefined) => void; label: string }) {
  return (
    <div className="tk-stars" role="radiogroup" aria-label={`Einkunn: ${label}`}>
      {GRADES.map((g) => (
        <button key={g} type="button" role="radio" aria-checked={value === g} aria-label={`${g} af 5 — ${GRADE_LABEL[g]}`} className={value && g <= value ? "on" : ""} onClick={() => onChange(value === g ? undefined : g)}>
          <Star size={22} fill={value && g <= value ? "currentColor" : "none"} />
        </button>
      ))}
      <small>{value ? GRADE_LABEL[value] : "Engin einkunn"}</small>
    </div>
  );
}
