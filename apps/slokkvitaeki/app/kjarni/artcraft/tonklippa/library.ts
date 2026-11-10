/** Safnið og iðkendurnir: lög sem má nota aftur og aftur, uppáhaldsbútar, og
 *  stelpurnar/krakkarnir sem verið er að þjálfa (nafn, mynd, lengd rútínu,
 *  hápunktar í dansinum, lög sem gætu passað). Eitt skjal sem er sameinað á
 *  milli tækja atriði fyrir atriði (nýjasta breytingin vinnur; eytt helst
 *  eytt). Hrein gögn — prófað í node. */

import type { Highlight } from "./analyze";

/** Umslag lags: tilbúið útlit (engin myndskrá). */
export type CoverStyle = "eldur" | "is" | "neon" | "gull";
export const COVERS: CoverStyle[] = ["eldur", "is", "neon", "gull"];
export const COVER_LABEL: Record<CoverStyle, string> = { eldur: "Eldur", is: "Ís", neon: "Neon", gull: "Gull" };

export type Song = {
  id: string;
  name: string;
  duration: number;
  cover?: CoverStyle;
  /** Slóð á mynd af umslagi lagsins (fundin sjálfkrafa eða valin); gengur fyrir `cover`. */
  art?: string;
  /** Síðast breytt (ms) — ræður við sameiningu. */
  at: number;
  fav?: boolean;
  bpm?: number;
  /** Smækkað bylgjuform (0–99) og hápunktar lagsins, til að sýna í listum án þess að afkóða. */
  wave?: number[];
  highlights?: Highlight[];
};

/** Uppáhaldsbútur: kafli úr lagi sem má setja beint í rútínu. */
export type Clip = { id: string; songId: string; name: string; start: number; end: number; at: number };

/** Hápunktur í dansi iðkanda: hvenær, hvað (t.d. "2× Salchow") og einkunn 1–5. */
export type SkaterMarker = { t: number; label: string; grade?: number };

export type Skater = {
  id: string;
  name: string;
  at: number;
  /** Hvenær myndin var sett (0 = engin mynd). */
  photoAt: number;
  targetMin: number;
  targetMax: number;
  /** Hápunktar í dansinum (sek frá byrjun). */
  markers: SkaterMarker[];
  /** Lög úr safninu sem gætu passað. */
  songIds: string[];
  note?: string;
  /** Upptaka af dansinum (auðkenni myndbands í safninu) og hvar í henni dansinn byrjar. */
  videoId?: string;
  videoStart?: number;
};

/** Viðburður í dagatali þjálfarans. */
export type EventKind = "aefing" | "keppni" | "annad";
export const EVENT_KINDS: EventKind[] = ["aefing", "keppni", "annad"];
export type CoachEvent = {
  id: string;
  at: number;
  title: string;
  /** Dagur: ÁÁÁÁ-MM-DD. */
  date: string;
  /** Klukkan: KK:MM (vantar = allan daginn). */
  time?: string;
  minutes?: number;
  kind: EventKind;
  skaterIds: string[];
  note?: string;
};

export type Todo = { id: string; at: number; text: string; done: boolean };

/** Mynd eða myndband: á iðkanda (gallerí) eða á rútínu (upptaka af dansinum). */
export type Media = {
  id: string;
  at: number;
  kind: "mynd" | "myndband";
  name: string;
  /** Stærð í bætum og skráartegund (til að opna rétt). */
  size: number;
  type: string;
  skaterId?: string;
  projectId?: string;
};

/** Geymslan tekur mest 50 MB á skrá. Skrár upp að þessari stærð fara upp í heilu lagi … */
export const CLOUD_WHOLE_BYTES = 48 * 1024 * 1024;
/** … en stærri skrár (myndbönd) eru sendar í hlutum af þessari stærð, sem eru
 *  settir saman aftur þegar skráin er sótt. Litlir hlutar þola betur slitrótt net. */
export const CLOUD_PART_BYTES = 16 * 1024 * 1024;
/** Stærri skrár en þetta fara ekki í skýið; þær eru bara í tækinu. */
export const MAX_CLOUD_BYTES = 1024 * 1024 * 1024;
export const MAX_CLOUD_LABEL = "1 GB";

/** Í hve mörgum hlutum skrá af þessari stærð liggur í skýinu (1 = í heilu lagi). */
export function cloudParts(size: number): number {
  return size > CLOUD_WHOLE_BYTES ? Math.ceil(size / CLOUD_PART_BYTES) : 1;
}

/** Bætabil hluta `index` í skrá af stærð `size`: [frá, til). */
export function cloudPartRange(size: number, index: number): [number, number] {
  if (cloudParts(size) === 1) return [0, size];
  return [index * CLOUD_PART_BYTES, Math.min(size, (index + 1) * CLOUD_PART_BYTES)];
}

export type Gone = { id: string; at: number };

export type LibraryDoc = {
  songs: Song[];
  clips: Clip[];
  skaters: Skater[];
  events: CoachEvent[];
  todos: Todo[];
  media: Media[];
  /** Það sem hefur verið eytt (svo það komi ekki aftur úr öðru tæki). */
  gone: Gone[];
};

export function emptyDoc(): LibraryDoc {
  return { songs: [], clips: [], skaters: [], events: [], todos: [], media: [], gone: [] };
}

type Stamped = { id: string; at: number };

function mergeList<T extends Stamped>(a: T[], b: T[], gone: Map<string, number>): T[] {
  const byId = new Map<string, T>();
  for (const item of [...a, ...b]) {
    const cur = byId.get(item.id);
    if (!cur || item.at > cur.at) byId.set(item.id, item);
  }
  return [...byId.values()].filter((item) => (gone.get(item.id) ?? -1) < item.at);
}

/** Sameinar tvær útgáfur safnsins: fyrir hvert atriði vinnur nýrri breytingin,
 *  og eyðing vinnur nema atriðinu hafi verið breytt eftir hana. */
export function mergeDocs(a: LibraryDoc, b: LibraryDoc): LibraryDoc {
  const gone = new Map<string, number>();
  for (const g of [...a.gone, ...b.gone]) gone.set(g.id, Math.max(gone.get(g.id) ?? 0, g.at));
  const songs = mergeList(a.songs, b.songs, gone).sort((x, y) => x.name.localeCompare(y.name, "is"));
  const have = new Set(songs.map((s) => s.id));
  return {
    songs,
    // Bútur án lags er gagnslaus.
    clips: mergeList(a.clips, b.clips, gone)
      .filter((c) => have.has(c.songId))
      .sort((x, y) => y.at - x.at),
    skaters: mergeList(a.skaters, b.skaters, gone).sort((x, y) => x.name.localeCompare(y.name, "is")),
    events: mergeList(a.events, b.events, gone).sort(byWhen),
    todos: mergeList(a.todos, b.todos, gone).sort((x, y) => (x.id < y.id ? -1 : 1)),
    media: mergeList(a.media, b.media, gone).sort((x, y) => y.at - x.at || (x.id < y.id ? -1 : 1)),
    gone: [...gone].map(([id, at]) => ({ id, at })).sort((x, y) => (x.id < y.id ? -1 : 1)),
  };
}

/** Tímaröð viðburða: dagur, svo klukka (heilsdagsviðburðir fyrst). */
export function byWhen(a: CoachEvent, b: CoachEvent): number {
  return a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? "") || (a.id < b.id ? -1 : 1);
}

export function sameDoc(a: LibraryDoc, b: LibraryDoc): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function put<T extends Stamped>(list: T[], item: T): T[] {
  return list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item];
}

export function putSong(doc: LibraryDoc, song: Song): LibraryDoc {
  return { ...doc, songs: put(doc.songs, song).sort((x, y) => x.name.localeCompare(y.name, "is")), gone: doc.gone.filter((g) => g.id !== song.id) };
}

export function patchSong(doc: LibraryDoc, id: string, change: Partial<Omit<Song, "id">>, now: number): LibraryDoc {
  const cur = doc.songs.find((s) => s.id === id);
  return cur ? putSong(doc, { ...cur, ...change, at: now }) : doc;
}

/** Eyðir lagi og því sem hangir á því: bútum úr því og vísunum iðkenda í það. */
export function removeSong(doc: LibraryDoc, id: string, now: number): LibraryDoc {
  const clips = doc.clips.filter((c) => c.songId === id);
  return {
    songs: doc.songs.filter((s) => s.id !== id),
    clips: doc.clips.filter((c) => c.songId !== id),
    skaters: doc.skaters.map((k) => (k.songIds.includes(id) ? { ...k, songIds: k.songIds.filter((x) => x !== id), at: now } : k)),
    events: doc.events,
    todos: doc.todos,
    media: doc.media,
    gone: [...doc.gone.filter((g) => g.id !== id && !clips.some((c) => c.id === g.id)), { id, at: now }, ...clips.map((c) => ({ id: c.id, at: now }))],
  };
}

export function putClip(doc: LibraryDoc, clip: Clip): LibraryDoc {
  return { ...doc, clips: put(doc.clips, clip).sort((x, y) => y.at - x.at), gone: doc.gone.filter((g) => g.id !== clip.id) };
}

export function removeClip(doc: LibraryDoc, id: string, now: number): LibraryDoc {
  return { ...doc, clips: doc.clips.filter((c) => c.id !== id), gone: [...doc.gone.filter((g) => g.id !== id), { id, at: now }] };
}

/** Gild einkunn (heil tala 1–5), annars undefined. */
function gradeOf(v: unknown): number | undefined {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5 ? v : undefined;
}

export function putSkater(doc: LibraryDoc, skater: Skater): LibraryDoc {
  const clean: Skater = {
    ...skater,
    name: skater.name.trim().slice(0, 60),
    markers: skater.markers
      .filter((m) => Number.isFinite(m.t) && m.t >= 0)
      .map((m) => ({ t: Math.round(m.t * 10) / 10, label: m.label.slice(0, 60), ...(gradeOf(m.grade) ? { grade: gradeOf(m.grade) } : {}) }))
      .sort((x, y) => x.t - y.t),
    songIds: [...new Set(skater.songIds)],
    targetMax: Math.max(skater.targetMin, skater.targetMax),
  };
  return { ...doc, skaters: put(doc.skaters, clean).sort((x, y) => x.name.localeCompare(y.name, "is")), gone: doc.gone.filter((g) => g.id !== skater.id) };
}

export function removeSkater(doc: LibraryDoc, id: string, now: number): LibraryDoc {
  return { ...doc, skaters: doc.skaters.filter((k) => k.id !== id), gone: [...doc.gone.filter((g) => g.id !== id), { id, at: now }] };
}

export function putEvent(doc: LibraryDoc, event: CoachEvent): LibraryDoc {
  const clean: CoachEvent = { ...event, title: event.title.trim().slice(0, 80), skaterIds: [...new Set(event.skaterIds)] };
  if (!clean.time) delete clean.time;
  if (!clean.note?.trim()) delete clean.note;
  if (!(clean.minutes && clean.minutes > 0)) delete clean.minutes;
  return { ...doc, events: put(doc.events, clean).sort(byWhen), gone: doc.gone.filter((g) => g.id !== event.id) };
}

export function removeEvent(doc: LibraryDoc, id: string, now: number): LibraryDoc {
  return { ...doc, events: doc.events.filter((e) => e.id !== id), gone: [...doc.gone.filter((g) => g.id !== id), { id, at: now }] };
}

export function putTodo(doc: LibraryDoc, todo: Todo): LibraryDoc {
  return { ...doc, todos: put(doc.todos, { ...todo, text: todo.text.trim().slice(0, 140) }), gone: doc.gone.filter((g) => g.id !== todo.id) };
}

export function removeTodo(doc: LibraryDoc, id: string, now: number): LibraryDoc {
  return { ...doc, todos: doc.todos.filter((t) => t.id !== id), gone: [...doc.gone.filter((g) => g.id !== id), { id, at: now }] };
}

export function putMedia(doc: LibraryDoc, item: Media): LibraryDoc {
  return { ...doc, media: put(doc.media, item).sort((x, y) => y.at - x.at || (x.id < y.id ? -1 : 1)), gone: doc.gone.filter((g) => g.id !== item.id) };
}

export function removeMedia(doc: LibraryDoc, id: string, now: number): LibraryDoc {
  return { ...doc, media: doc.media.filter((m) => m.id !== id), gone: [...doc.gone.filter((g) => g.id !== id), { id, at: now }] };
}

/** Eyðir öllum verkefnum sem er búið að haka við. */
export function clearDone(doc: LibraryDoc, now: number): LibraryDoc {
  const done = doc.todos.filter((t) => t.done);
  if (!done.length) return doc;
  return { ...doc, todos: doc.todos.filter((t) => !t.done), gone: [...doc.gone.filter((g) => !done.some((t) => t.id === g.id)), ...done.map((t) => ({ id: t.id, at: now }))] };
}

/** Óunnin verkefni fyrst (nýjust efst), svo þau sem er lokið. */
export function sortedTodos(todos: Todo[]): Todo[] {
  return todos.slice().sort((a, b) => Number(a.done) - Number(b.done) || b.at - a.at);
}

/** Hreinsar skjal sem var lesið úr geymslu eða skýi. */
export function normalizeDoc(raw: unknown): LibraryDoc {
  if (!raw || typeof raw !== "object") return emptyDoc();
  const r = raw as Partial<LibraryDoc>;
  const str = (v: unknown) => typeof v === "string" && v.length > 0;
  const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  const songs = (Array.isArray(r.songs) ? r.songs : []).filter((s) => s && str(s.id) && str(s.name) && num(s.duration) && num(s.at));
  const have = new Set(songs.map((s) => s.id));
  return {
    songs,
    clips: (Array.isArray(r.clips) ? r.clips : []).filter((c) => c && str(c.id) && have.has(c.songId) && num(c.start) && num(c.end) && c.end > c.start && num(c.at)),
    skaters: (Array.isArray(r.skaters) ? r.skaters : [])
      .filter((k) => k && str(k.id) && typeof k.name === "string" && num(k.at))
      .map((k) => ({
        id: k.id,
        name: k.name,
        at: k.at,
        photoAt: num(k.photoAt) ? k.photoAt : 0,
        targetMin: num(k.targetMin) ? k.targetMin : 72,
        targetMax: num(k.targetMax) ? k.targetMax : 84,
        markers: (Array.isArray(k.markers) ? k.markers : [])
          .filter((m) => m && num(m.t))
          .map((m) => ({ t: m.t, label: typeof m.label === "string" ? m.label : "", ...(gradeOf(m.grade) ? { grade: gradeOf(m.grade) } : {}) })),
        songIds: (Array.isArray(k.songIds) ? k.songIds : []).filter(str),
        ...(typeof k.note === "string" && k.note ? { note: k.note.slice(0, 400) } : {}),
        ...(str(k.videoId) ? { videoId: k.videoId, videoStart: num(k.videoStart) ? Math.max(0, k.videoStart as number) : 0 } : {}),
      })),
    events: (Array.isArray(r.events) ? r.events : [])
      .filter((e) => e && str(e.id) && num(e.at) && typeof e.title === "string" && typeof e.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.date))
      .map((e) => ({
        id: e.id,
        at: e.at,
        title: e.title,
        date: e.date,
        ...(typeof e.time === "string" && /^\d{2}:\d{2}$/.test(e.time) ? { time: e.time } : {}),
        ...(num(e.minutes) && (e.minutes as number) > 0 ? { minutes: e.minutes } : {}),
        kind: EVENT_KINDS.includes(e.kind) ? e.kind : "annad",
        skaterIds: (Array.isArray(e.skaterIds) ? e.skaterIds : []).filter(str),
        ...(typeof e.note === "string" && e.note ? { note: e.note.slice(0, 400) } : {}),
      }))
      .sort(byWhen),
    todos: (Array.isArray(r.todos) ? r.todos : [])
      .filter((t) => t && str(t.id) && num(t.at) && typeof t.text === "string")
      .map((t) => ({ id: t.id, at: t.at, text: t.text, done: t.done === true })),
    media: (Array.isArray(r.media) ? r.media : [])
      .filter((m) => m && str(m.id) && num(m.at) && (m.kind === "mynd" || m.kind === "myndband") && num(m.size))
      .map((m) => ({
        id: m.id,
        at: m.at,
        kind: m.kind,
        name: typeof m.name === "string" ? m.name.slice(0, 120) : "",
        size: m.size,
        type: typeof m.type === "string" ? m.type : "",
        ...(str(m.skaterId) ? { skaterId: m.skaterId } : {}),
        ...(str(m.projectId) ? { projectId: m.projectId } : {}),
      })),
    gone: (Array.isArray(r.gone) ? r.gone : []).filter((g) => g && str(g.id) && num(g.at)),
  };
}

/** Smækkar bylgjuform í `n` gildi 0–99 fyrir lista. */
export function waveSummary(peak: ArrayLike<number>, n = 120): number[] {
  const out: number[] = [];
  const len = peak.length;
  if (!len) return out;
  for (let i = 0; i < n; i++) {
    const a = Math.floor((i * len) / n);
    const b = Math.max(a + 1, Math.floor(((i + 1) * len) / n));
    let mx = 0;
    for (let j = a; j < b && j < len; j++) if (peak[j] > mx) mx = peak[j];
    out.push(Math.min(99, Math.round((mx / 255) * 99)));
  }
  return out;
}
