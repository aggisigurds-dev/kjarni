"use client";

/** Þjálfarahluti appsins: forsíðan (dagurinn í hnotskurn), skipulagið
 *  (mánaðardagatal og verkefnalisti) og blaðið þar sem viðburður er skráður. */

import { useState } from "react";
import { CalendarPlus, Check, ChevronLeft, ChevronRight, ChevronRight as Go, Plus, Trash2, UserPlus, X } from "lucide-react";
import { formatTime } from "./arrange";
import { MONTHS, WEEKDAYS_SHORT, eventsOn, fromYmd, greeting, longDate, monthGrid, shortDate, timeRange, upcoming } from "./calendar";
import { sortedTodos, type CoachEvent, type EventKind, type LibraryDoc, type Skater, type Todo } from "./library";
import { Avatar } from "./Parts";
import type { ProjectRecord } from "./store";
import { newId } from "./tracks";

export const KIND_LABEL: Record<EventKind, string> = { aefing: "Æfing", keppni: "Keppni", annad: "Annað" };
const DURATIONS = [30, 45, 60, 90, 120];

function EventRow({ event, skaters, photos, onOpen, showDay }: { event: CoachEvent; skaters: Skater[]; photos: Record<string, string>; onOpen: (e: CoachEvent) => void; showDay?: string }) {
  const who = event.skaterIds.map((id) => skaters.find((k) => k.id === id)).filter((k): k is Skater => !!k);
  return (
    <button type="button" className={`tk-event ${event.kind}`} onClick={() => onOpen(event)}>
      <span className="tk-event-time">
        {showDay && <b>{showDay}</b>}
        {timeRange(event)}
      </span>
      <span className="tk-event-text">
        <strong>{event.title || KIND_LABEL[event.kind]}</strong>
        <small>
          {KIND_LABEL[event.kind]}
          {event.note ? ` · ${event.note}` : ""}
        </small>
      </span>
      {who.length > 0 && (
        <span className="tk-event-who">
          {who.slice(0, 3).map((k) => (
            <Avatar key={k.id} skater={k} url={photos[k.id]} size={28} />
          ))}
          {who.length > 3 && <i>+{who.length - 3}</i>}
        </span>
      )}
    </button>
  );
}

function TodoRow({ todo, onToggle, onDelete }: { todo: Todo; onToggle: (t: Todo) => void; onDelete: (t: Todo) => void }) {
  return (
    <li className={`tk-todo${todo.done ? " done" : ""}`}>
      <button type="button" className="tk-check" role="checkbox" aria-checked={todo.done} aria-label={todo.done ? `Afmerkja: ${todo.text}` : `Lokið: ${todo.text}`} onClick={() => onToggle(todo)}>
        {todo.done && <Check size={18} strokeWidth={3} />}
      </button>
      <span>{todo.text}</span>
      <button type="button" className="tk-iconbtn small quiet" onClick={() => onDelete(todo)} aria-label={`Eyða: ${todo.text}`}>
        <X size={17} />
      </button>
    </li>
  );
}

function TodoAdd({ onAdd }: { onAdd: (text: string) => void }) {
  const [text, setText] = useState("");
  const add = () => {
    if (!text.trim()) return;
    onAdd(text);
    setText("");
  };
  return (
    <form
      className="tk-todo-add"
      onSubmit={(e) => {
        e.preventDefault();
        add();
      }}
    >
      <input className="tk-word" value={text} onChange={(e) => setText(e.target.value)} placeholder="Nýtt verkefni…" aria-label="Nýtt verkefni" maxLength={140} enterKeyHint="done" />
      <button type="submit" className="tk-btn icon" aria-label="Bæta verkefni við" disabled={!text.trim()}>
        <Plus size={20} />
      </button>
    </form>
  );
}

type Shared = {
  doc: LibraryDoc;
  photos: Record<string, string>;
  today: string;
  onOpenEvent: (e: CoachEvent) => void;
  onAddEvent: (date: string) => void;
  onTodoAdd: (text: string) => void;
  onTodoToggle: (t: Todo) => void;
  onTodoDelete: (t: Todo) => void;
};

// ------------------------------------------------------------------ forsíða

type HomeProps = Shared & {
  projects: ProjectRecord[];
  onNewRoutine: () => void;
  onOpenProject: (rec: ProjectRecord) => void;
  onOpenSkater: (k: Skater) => void;
  onNewSkater: () => void;
  onGo: (tab: "skipulag" | "idkendur" | "rutinur") => void;
};

export function HomeTab({ doc, photos, today, projects, onOpenEvent, onAddEvent, onTodoAdd, onTodoToggle, onTodoDelete, onNewRoutine, onOpenProject, onOpenSkater, onNewSkater, onGo }: HomeProps) {
  const todays = eventsOn(doc.events, today);
  const next = upcoming(doc.events, today, 3);
  const open = sortedTodos(doc.todos).filter((t) => !t.done);
  return (
    <>
      <section className="tk-hero">
        <p>{longDate(today)}</p>
        <h2>{greeting(new Date().getHours())}!</h2>
        <div className="tk-hero-stats">
          <span>
            <b>{todays.length}</b> {todays.length === 1 ? "viðburður í dag" : "viðburðir í dag"}
          </span>
          <span>
            <b>{open.length}</b> {open.length === 1 ? "verkefni" : "verkefni"} eftir
          </span>
          <span>
            <b>{doc.skaters.length}</b> {doc.skaters.length === 1 ? "iðkandi" : "iðkendur"}
          </span>
        </div>
      </section>

      <div className="tk-section">
        <h2>Í dag</h2>
        <button type="button" className="tk-more" onClick={() => onAddEvent(today)}>
          <CalendarPlus size={16} /> Bæta við
        </button>
      </div>
      {todays.length === 0 ? (
        <p className="tk-blank card">Ekkert á dagskrá í dag.</p>
      ) : (
        <div className="tk-events">
          {todays.map((e) => (
            <EventRow key={e.id} event={e} skaters={doc.skaters} photos={photos} onOpen={onOpenEvent} />
          ))}
        </div>
      )}

      {next.length > 0 && (
        <>
          <div className="tk-section">
            <h2>Næst á dagskrá</h2>
            <button type="button" className="tk-more" onClick={() => onGo("skipulag")}>
              Dagatal <Go size={15} />
            </button>
          </div>
          <div className="tk-events">
            {next.map((e) => (
              <EventRow key={e.id} event={e} skaters={doc.skaters} photos={photos} onOpen={onOpenEvent} showDay={shortDate(e.date, today)} />
            ))}
          </div>
        </>
      )}

      <div className="tk-section">
        <h2>Verkefni</h2>
        {doc.todos.length > 4 && (
          <button type="button" className="tk-more" onClick={() => onGo("skipulag")}>
            Öll ({open.length}) <Go size={15} />
          </button>
        )}
      </div>
      <div className="tk-box">
        <TodoAdd onAdd={onTodoAdd} />
        {open.length > 0 && (
          <ul className="tk-todos">
            {open.slice(0, 4).map((t) => (
              <TodoRow key={t.id} todo={t} onToggle={onTodoToggle} onDelete={onTodoDelete} />
            ))}
          </ul>
        )}
      </div>

      <div className="tk-section">
        <h2>Iðkendur</h2>
        {doc.skaters.length > 0 && (
          <button type="button" className="tk-more" onClick={() => onGo("idkendur")}>
            Allir <Go size={15} />
          </button>
        )}
      </div>
      <div className="tk-people">
        {doc.skaters.map((k) => (
          <button type="button" key={k.id} onClick={() => onOpenSkater(k)}>
            <Avatar skater={k} url={photos[k.id]} size={60} />
            <span>{k.name.split(/\s+/)[0] || "Ónefndur"}</span>
          </button>
        ))}
        <button type="button" onClick={onNewSkater}>
          <span className="tk-people-add">
            <UserPlus size={24} />
          </span>
          <span>Nýr</span>
        </button>
      </div>

      <div className="tk-section">
        <h2>Tónlist</h2>
        {projects.length > 0 && (
          <button type="button" className="tk-more" onClick={() => onGo("rutinur")}>
            Allar rútínur <Go size={15} />
          </button>
        )}
      </div>
      <button type="button" className="tk-new compact" onClick={onNewRoutine}>
        <span className="tk-new-plus" aria-hidden="true">
          <Plus size={26} strokeWidth={2.6} />
        </span>
        <span className="tk-new-text">
          <strong>Ný rútína</strong>
          <small>Klipptu tónlist fyrir dansinn</small>
        </span>
      </button>
      {projects.slice(0, 2).map((rec) => {
        const who = doc.skaters.find((k) => k.id === rec.skaterId);
        return (
          <button type="button" className="tk-card alone" key={rec.id} onClick={() => onOpenProject(rec)}>
            {who ? <Avatar skater={who} url={photos[who.id]} size={44} /> : null}
            <span className="tk-card-text">
              <strong>{rec.name}</strong>
              <small>
                {formatTime(rec.length)} · {rec.tracks.length === 1 ? "1 lag" : `${rec.tracks.length} lög`}
              </small>
            </span>
            <Go size={18} className="tk-card-go" />
          </button>
        );
      })}
    </>
  );
}

// ------------------------------------------------------------------ skipulag

type PlanProps = Shared & { onClearDone: () => void };

export function PlanTab({ doc, photos, today, onOpenEvent, onAddEvent, onTodoAdd, onTodoToggle, onTodoDelete, onClearDone }: PlanProps) {
  const [day, setDay] = useState(today);
  const [view, setView] = useState(() => {
    const d = fromYmd(today);
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const weeks = monthGrid(view.year, view.month);
  const marks = new Map<string, Set<EventKind>>();
  for (const e of doc.events) {
    if (!marks.has(e.date)) marks.set(e.date, new Set());
    marks.get(e.date)!.add(e.kind);
  }
  const step = (delta: number) =>
    setView((v) => {
      const d = new Date(v.year, v.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  const pick = (date: string) => {
    setDay(date);
    const d = fromYmd(date);
    setView({ year: d.getFullYear(), month: d.getMonth() });
  };
  const chosen = eventsOn(doc.events, day);
  const todos = sortedTodos(doc.todos);
  const doneCount = todos.filter((t) => t.done).length;

  return (
    <>
      <div className="tk-box tk-cal">
        <div className="tk-cal-head">
          <button type="button" className="tk-iconbtn small" onClick={() => step(-1)} aria-label="Fyrri mánuður">
            <ChevronLeft size={20} />
          </button>
          <strong>
            {MONTHS[view.month]} {view.year}
          </strong>
          <button type="button" className="tk-chip" onClick={() => pick(today)} disabled={day === today && fromYmd(today).getMonth() === view.month && fromYmd(today).getFullYear() === view.year}>
            Í dag
          </button>
          <button type="button" className="tk-iconbtn small" onClick={() => step(1)} aria-label="Næsti mánuður">
            <ChevronRight size={20} />
          </button>
        </div>
        <div className="tk-cal-grid" role="grid" aria-label={`${MONTHS[view.month]} ${view.year}`}>
          {WEEKDAYS_SHORT.map((w) => (
            <span key={w} className="tk-cal-wd" role="columnheader">
              {w}
            </span>
          ))}
          {weeks.flat().map((d) => {
            const kinds = marks.get(d.date);
            return (
              <button
                key={d.date}
                type="button"
                role="gridcell"
                aria-selected={d.date === day}
                aria-label={`${longDate(d.date)}${kinds ? `, ${kinds.size === 1 ? "viðburður" : "viðburðir"} skráðir` : ""}`}
                className={`tk-cal-day${d.inMonth ? "" : " out"}${d.date === today ? " today" : ""}${d.date === day ? " on" : ""}`}
                onClick={() => pick(d.date)}
              >
                {d.day}
                {kinds && (
                  <span className="tk-cal-dots" aria-hidden="true">
                    {[...kinds].map((k) => (
                      <i key={k} className={k} />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="tk-section">
        <h2>{day === today ? "Í dag" : longDate(day)}</h2>
        <button type="button" className="tk-more" onClick={() => onAddEvent(day)}>
          <CalendarPlus size={16} /> Bæta við
        </button>
      </div>
      {chosen.length === 0 ? (
        <p className="tk-blank card">Ekkert skráð þennan dag.</p>
      ) : (
        <div className="tk-events">
          {chosen.map((e) => (
            <EventRow key={e.id} event={e} skaters={doc.skaters} photos={photos} onOpen={onOpenEvent} />
          ))}
        </div>
      )}

      <div className="tk-section">
        <h2>Verkefnalisti</h2>
        {doneCount > 0 && (
          <button type="button" className="tk-more" onClick={onClearDone}>
            <Trash2 size={15} /> Hreinsa lokið ({doneCount})
          </button>
        )}
      </div>
      <div className="tk-box">
        <TodoAdd onAdd={onTodoAdd} />
        {todos.length === 0 ? (
          <p className="tk-muted">Ekkert á listanum. Skrifaðu það sem þarf að muna — panta svellið, prenta lista, hringja í foreldra …</p>
        ) : (
          <ul className="tk-todos">
            {todos.map((t) => (
              <TodoRow key={t.id} todo={t} onToggle={onTodoToggle} onDelete={onTodoDelete} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ viðburður

export function blankEvent(date: string): CoachEvent {
  return { id: newId(), at: Date.now(), title: "", date, time: "16:00", minutes: 60, kind: "aefing", skaterIds: [] };
}

type EventProps = {
  event: CoachEvent;
  isNew: boolean;
  skaters: Skater[];
  photos: Record<string, string>;
  onSave: (e: CoachEvent) => void;
  onDelete: (e: CoachEvent) => void;
  onClose: () => void;
};

export function EventSheet({ event, isNew, skaters, photos, onSave, onDelete, onClose }: EventProps) {
  const [e, setE] = useState<CoachEvent>(event);
  const set = (change: Partial<CoachEvent>) => setE((cur) => ({ ...cur, ...change }));
  const toggle = (id: string) => set({ skaterIds: e.skaterIds.includes(id) ? e.skaterIds.filter((x) => x !== id) : [...e.skaterIds, id] });
  return (
    <div className="tk-sheet-back" onClick={onClose}>
      <div className="tk-sheet tall" role="dialog" aria-modal="true" aria-label={isNew ? "Nýr viðburður" : "Viðburður"} onClick={(ev) => ev.stopPropagation()}>
        <div className="tk-sheet-head">
          <strong>{isNew ? "Nýr viðburður" : "Viðburður"}</strong>
          <button type="button" className="tk-iconbtn small" onClick={onClose} aria-label="Loka">
            <X size={18} />
          </button>
        </div>
        <div className="tk-sheet-scroll tk-form">
          <div className="tk-row">
            {(Object.keys(KIND_LABEL) as EventKind[]).map((k) => (
              <button key={k} type="button" className={`tk-chip kind ${k}${e.kind === k ? " on" : ""}`} onClick={() => set({ kind: k })}>
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
          <input className="tk-word big" value={e.title} onChange={(ev) => set({ title: ev.target.value })} placeholder={`Heiti (t.d. ${e.kind === "keppni" ? "Haustmót" : "Æfing á svellinu"})`} aria-label="Heiti viðburðar" maxLength={80} />
          <div className="tk-form-row">
            <label>
              <span>Dagur</span>
              <input type="date" className="tk-word" value={e.date} onChange={(ev) => ev.target.value && set({ date: ev.target.value })} />
            </label>
            <label>
              <span>Klukkan</span>
              <input type="time" className="tk-word" value={e.time ?? ""} onChange={(ev) => set({ time: ev.target.value || undefined })} />
            </label>
          </div>
          <span className="tk-label wide">Lengd</span>
          <div className="tk-row">
            {DURATIONS.map((m) => (
              <button key={m} type="button" className={`tk-chip${e.minutes === m ? " on" : ""}`} onClick={() => set({ minutes: e.minutes === m ? undefined : m })}>
                {m < 60 ? `${m} mín` : m % 60 ? `${Math.floor(m / 60)} klst ${m % 60} mín` : `${m / 60} klst`}
              </button>
            ))}
          </div>
          {skaters.length > 0 && (
            <>
              <span className="tk-label wide">Hverjir?</span>
              <div className="tk-row">
                {skaters.map((k) => (
                  <button key={k.id} type="button" className={`tk-chip who${e.skaterIds.includes(k.id) ? " on" : ""}`} aria-pressed={e.skaterIds.includes(k.id)} onClick={() => toggle(k.id)}>
                    <Avatar skater={k} url={photos[k.id]} size={26} /> {k.name.split(/\s+/)[0] || "Ónefndur"}
                  </button>
                ))}
              </div>
            </>
          )}
          <input className="tk-word wide" value={e.note ?? ""} onChange={(ev) => set({ note: ev.target.value })} placeholder="Athugasemd (staður, hvað á að æfa …)" aria-label="Athugasemd" maxLength={400} />
          <button type="button" className="tk-cta" onClick={() => onSave({ ...e, at: Date.now() })}>
            Vista
          </button>
          {!isNew && (
            <button type="button" className="tk-btn danger wide" onClick={() => onDelete(e)}>
              <Trash2 size={15} /> Eyða viðburði
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
