"use client";

/** Val á heiti fyrir hápunkt (stökk, snúningur …) og einkunn með stjörnum. */

import { useState } from "react";
import { ChevronDown, Star, X } from "lucide-react";
import { ELEMENTS, GRADES, GRADE_LABEL, TURNS, groupOf, splitTurns, withTurns } from "./elements";

/** Hnappur sem sýnir heitið og opnar lista til að velja úr (eða skrifa eigið). */
export function ElementField({ value, onChange }: { value: string; onChange: (label: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value);
  const { turns, name } = splitTurns(value);
  const jump = groupOf(value) === "stokk";
  return (
    <>
      <button
        type="button"
        className={`tk-word tk-element${value ? "" : " empty"}`}
        onClick={() => {
          setText(value);
          setOpen(true);
        }}
        aria-label={value ? `Tegund: ${value}. Ýttu til að breyta` : "Velja tegund"}
      >
        <span className="tk-ellipsis">{value || "Hvað gerist? Veldu…"}</span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="tk-sheet-back up" onClick={() => setOpen(false)}>
          <div className="tk-sheet tall" role="dialog" aria-modal="true" aria-label="Velja tegund" onClick={(e) => e.stopPropagation()}>
            <div className="tk-sheet-head">
              <strong>Hvað gerist hér?</strong>
              <button type="button" className="tk-iconbtn small" onClick={() => setOpen(false)} aria-label="Loka">
                <X size={18} />
              </button>
            </div>
            <div className="tk-sheet-scroll">
              {ELEMENTS.map((g) => (
                <div key={g.id}>
                  <h3>{g.label}</h3>
                  <div className="tk-row">
                    {g.items.map((item) => (
                      <button
                        key={item}
                        type="button"
                        className={`tk-chip${name.toLowerCase() === item.toLowerCase() ? " on" : ""}`}
                        onClick={() => {
                          // Stökk halda snúningafjöldanum sem var valinn; annað fær engan.
                          onChange(g.id === "stokk" ? withTurns(item, jump ? turns : "") : item);
                          if (g.id !== "stokk") setOpen(false);
                        }}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                  {g.id === "stokk" && jump && (
                    <div className="tk-row">
                      <span className="tk-muted">Snúningar í stökkinu:</span>
                      {TURNS.map((tn) => (
                        <button key={tn || "1"} type="button" className={`tk-chip${turns === tn ? " on" : ""}`} onClick={() => onChange(withTurns(name, tn))}>
                          {tn || "1×"}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <h3>Eigið heiti</h3>
              <form
                className="tk-todo-add"
                onSubmit={(e) => {
                  e.preventDefault();
                  onChange(text.trim().slice(0, 60));
                  setOpen(false);
                }}
              >
                <input className="tk-word" value={text} onChange={(e) => setText(e.target.value)} placeholder="Skrifaðu heiti…" aria-label="Eigið heiti" maxLength={60} enterKeyHint="done" />
                <button type="submit" className="tk-btn">
                  Nota
                </button>
              </form>
              <button type="button" className="tk-cta" onClick={() => setOpen(false)}>
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
