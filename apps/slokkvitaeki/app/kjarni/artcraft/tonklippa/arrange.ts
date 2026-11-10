/** Tónklippa — rútínan sem hrein gögn: bútar úr lögum í röð, hápunktar í
 *  dansinum og lengdarmörk. Allt í sekúndum; engin vafra-API hér (prófað í node). */

export type Part = {
  id: string;
  trackId: string;
  /** Hvar búturinn byrjar og endar í laginu sjálfu (sek). */
  start: number;
  end: number;
  /** Hraði: 1 = óbreytt, 1.05 = 5% hraðar (styttri bútur, tónhæð helst). */
  tempo: number;
  /** Hljóðstyrkur í dB (0 = óbreytt). */
  gainDb: number;
  /** Lengd samskeyta við bútinn á undan (sek), miðjuð á skilunum. 0 = hreinn skurður. */
  xfade: number;
  /** Áhrifshljóð á samskeytunum við bútinn á undan (felur skiptin milli laga). */
  fx?: SeamFx;
};

/** riser = „svúss“ sem rís að skilunum; impact = högg á skilunum. */
export type SeamFx = "riser" | "impact" | "both";
export const SEAM_FX: SeamFx[] = ["riser", "impact", "both"];

export type Marker = { id: string; t: number; label: string };

export type Arrangement = {
  parts: Part[];
  /** Hápunktar í dansinum, á tímalínu rútínunnar. */
  markers: Marker[];
  /** Mjúk byrjun og endir (sek). */
  fadeIn: number;
  fadeOut: number;
  /** Leyfileg lengd rútínunnar (sek). */
  targetMin: number;
  targetMax: number;
};

export const MIN_PART = 0.5;
export const TEMPO_MIN = 0.88;
export const TEMPO_MAX = 1.12;
export const XFADE_MAX = 6;
export const GAIN_MIN = -18;
export const GAIN_MAX = 6;
/** Minnstu samskeyti — „hreinn skurður“ fær samt örstutta blöndun svo ekki smelli. */
export const MIN_SEAM = 0.006;

export const DEFAULT_TARGET_MIN = 72;
export const DEFAULT_TARGET_MAX = 84;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function emptyArrangement(): Arrangement {
  return { parts: [], markers: [], fadeIn: 0, fadeOut: 3, targetMin: DEFAULT_TARGET_MIN, targetMax: DEFAULT_TARGET_MAX };
}

/** Lengd bútsins á tímalínunni (eftir hraðabreytingu). */
export function partLength(p: Part): number {
  return Math.max(0, p.end - p.start) / (p.tempo || 1);
}

export type Layout = {
  /** Hvar hver bútur byrjar á tímalínunni. */
  pos: number[];
  len: number[];
  /** Hálf samskeytalengd FYRIR hvern bút (0 fyrir þann fyrsta). */
  half: number[];
  total: number;
};

/** Bútarnir liggja hver á eftir öðrum; samskeytin eru miðjuð á skilunum og
 *  breyta því ekki heildarlengdinni. */
export function layout(arr: Arrangement): Layout {
  const pos: number[] = [];
  const len: number[] = [];
  const half: number[] = [];
  let t = 0;
  arr.parts.forEach((p, i) => {
    const l = partLength(p);
    pos.push(t);
    len.push(l);
    if (i === 0) half.push(0);
    else half.push(Math.max(0, Math.min(Math.max(p.xfade, MIN_SEAM) / 2, len[i - 1] / 2, l / 2)));
    t += l;
  });
  return { pos, len, half, total: t };
}

export function totalLength(arr: Arrangement): number {
  return layout(arr).total;
}

export type Located = { index: number; local: number; source: number };

/** Hvaða bútur er á tímanum `t` og hvar í laginu erum við þá. */
export function locate(arr: Arrangement, t: number): Located | null {
  if (!arr.parts.length) return null;
  const lay = layout(arr);
  const tt = clamp(t, 0, lay.total);
  let index = arr.parts.length - 1;
  for (let i = 0; i < arr.parts.length; i++) {
    if (tt < lay.pos[i] + lay.len[i]) {
      index = i;
      break;
    }
  }
  const p = arr.parts[index];
  const local = clamp(tt - lay.pos[index], 0, lay.len[index]);
  return { index, local, source: p.start + local * p.tempo };
}

/** Tímalínutími fyrir stað `source` (sek í laginu) innan búts `index`. */
export function timelineOf(arr: Arrangement, index: number, source: number): number {
  const lay = layout(arr);
  const p = arr.parts[index];
  if (!p) return 0;
  return lay.pos[index] + clamp((source - p.start) / p.tempo, 0, lay.len[index]);
}

export type LengthStatus = { state: "short" | "ok" | "long"; diff: number };

export function lengthStatus(total: number, min: number, max: number): LengthStatus {
  if (total < min - 0.05) return { state: "short", diff: min - total };
  if (total > max + 0.05) return { state: "long", diff: total - max };
  return { state: "ok", diff: 0 };
}

// ------------------------------------------------------------------ breytingar

function withPart(arr: Arrangement, index: number, change: (p: Part) => Part): Arrangement {
  if (!arr.parts[index]) return arr;
  return { ...arr, parts: arr.parts.map((p, i) => (i === index ? change(p) : p)) };
}

export function setStart(arr: Arrangement, index: number, start: number): Arrangement {
  return withPart(arr, index, (p) => ({ ...p, start: clamp(start, 0, p.end - MIN_PART * p.tempo) }));
}

export function setEnd(arr: Arrangement, index: number, end: number, trackDuration: number): Arrangement {
  return withPart(arr, index, (p) => ({ ...p, end: clamp(end, p.start + MIN_PART * p.tempo, Math.max(trackDuration, p.start + MIN_PART * p.tempo)) }));
}

/** Setur bæði mörkin í einu (t.d. þegar kaflinn er færður á nýjan stað í laginu). */
export function setRegion(arr: Arrangement, index: number, start: number, end: number, trackDuration: number): Arrangement {
  return withPart(arr, index, (p) => {
    const min = MIN_PART * p.tempo;
    const s = clamp(start, 0, Math.max(0, trackDuration - min));
    const e = clamp(end, s + min, Math.max(trackDuration, s + min));
    return { ...p, start: s, end: e };
  });
}

/** Renna: sama lengd og sami staður á tímalínunni, en tónlistin færist
 *  um `delta` sek innan lagsins. Skilar því sem komst (klemmt við lagið). */
export function slip(arr: Arrangement, index: number, delta: number, trackDuration: number): Arrangement {
  return withPart(arr, index, (p) => {
    const d = clamp(delta, -p.start, Math.max(0, trackDuration - p.end));
    return { ...p, start: p.start + d, end: p.end + d };
  });
}

export function setTempo(arr: Arrangement, index: number, tempo: number): Arrangement {
  return withPart(arr, index, (p) => ({ ...p, tempo: clamp(Math.round(tempo * 1000) / 1000, TEMPO_MIN, TEMPO_MAX) }));
}

export function setGain(arr: Arrangement, index: number, gainDb: number): Arrangement {
  return withPart(arr, index, (p) => ({ ...p, gainDb: clamp(gainDb, GAIN_MIN, GAIN_MAX) }));
}

export function setXfade(arr: Arrangement, index: number, xfade: number): Arrangement {
  return withPart(arr, index, (p) => ({ ...p, xfade: clamp(xfade, 0, XFADE_MAX) }));
}

export function setFx(arr: Arrangement, index: number, fx: SeamFx | undefined): Arrangement {
  return withPart(arr, index, (p) => {
    const { fx: _old, ...rest } = p;
    void _old;
    return fx ? { ...rest, fx } : rest;
  });
}

export function addPart(arr: Arrangement, part: Part, index = arr.parts.length): Arrangement {
  const parts = arr.parts.slice();
  parts.splice(clamp(index, 0, parts.length), 0, part);
  return { ...arr, parts };
}

export function removePart(arr: Arrangement, index: number): Arrangement {
  if (!arr.parts[index]) return arr;
  return { ...arr, parts: arr.parts.filter((_, i) => i !== index) };
}

export function movePart(arr: Arrangement, from: number, to: number): Arrangement {
  if (!arr.parts[from]) return arr;
  const target = clamp(to, 0, arr.parts.length - 1);
  if (target === from) return arr;
  const parts = arr.parts.slice();
  const [p] = parts.splice(from, 1);
  parts.splice(target, 0, p);
  return { ...arr, parts };
}

export function duplicatePart(arr: Arrangement, index: number, newId: string): Arrangement {
  const p = arr.parts[index];
  if (!p) return arr;
  return addPart(arr, { ...p, id: newId }, index + 1);
}

/** Klýfur bútinn sem er á tímanum `t` í tvennt þar (hreinn skurður á milli,
 *  svo ekkert heyrist fyrr en öðrum helmingnum er breytt). */
export function splitAt(arr: Arrangement, t: number, newId: string): { arr: Arrangement; index: number } | null {
  const at = locate(arr, t);
  if (!at) return null;
  const p = arr.parts[at.index];
  const cut = at.source;
  if (cut - p.start < MIN_PART * p.tempo || p.end - cut < MIN_PART * p.tempo) return null;
  const first: Part = { ...p, end: cut };
  const second: Part = { ...p, id: newId, start: cut, xfade: 0 };
  delete second.fx;
  const parts = arr.parts.slice();
  parts.splice(at.index, 1, first, second);
  return { arr: { ...arr, parts }, index: at.index + 1 };
}

/** Fjarlægir lag: allir bútar úr því hverfa. */
export function removeTrack(arr: Arrangement, trackId: string): Arrangement {
  return { ...arr, parts: arr.parts.filter((p) => p.trackId !== trackId) };
}

// ------------------------------------------------------------------ lengd

/** Styttir (eða lengir, ef lagið leyfir) síðasta bútinn svo heildin verði `target`. */
export function trimToLength(arr: Arrangement, target: number, lastTrackDuration: number): Arrangement {
  const last = arr.parts.length - 1;
  if (last < 0) return arr;
  const lay = layout(arr);
  const p = arr.parts[last];
  const want = target - lay.pos[last];
  if (want < MIN_PART) return arr;
  return setEnd(arr, last, p.start + want * p.tempo, lastTrackDuration);
}

/** Breytir hraða allra búta jafnt svo heildin verði `target`. `ok` er false
 *  ef hraðamörkin stöðvuðu það (þá er farið eins langt og má). */
export function fitTempo(arr: Arrangement, target: number): { arr: Arrangement; ok: boolean; factor: number } {
  const total = totalLength(arr);
  if (total <= 0 || target <= 0) return { arr, ok: false, factor: 1 };
  const factor = total / target;
  let ok = true;
  const parts = arr.parts.map((p) => {
    const want = p.tempo * factor;
    const tempo = clamp(Math.round(want * 1000) / 1000, TEMPO_MIN, TEMPO_MAX);
    if (Math.abs(tempo - want) > 0.0006) ok = false;
    return { ...p, tempo };
  });
  return { arr: { ...arr, parts }, ok, factor };
}

// ------------------------------------------------------------------ hápunktar

export function addMarker(arr: Arrangement, t: number, label: string, id: string): Arrangement {
  const markers = [...arr.markers, { id, t: Math.max(0, t), label }].sort((a, b) => a.t - b.t);
  return { ...arr, markers };
}

export function updateMarker(arr: Arrangement, id: string, change: Partial<Pick<Marker, "t" | "label">>): Arrangement {
  const markers = arr.markers
    .map((m) => (m.id === id ? { ...m, ...change, t: Math.max(0, change.t ?? m.t) } : m))
    .sort((a, b) => a.t - b.t);
  return { ...arr, markers };
}

export function removeMarker(arr: Arrangement, id: string): Arrangement {
  return { ...arr, markers: arr.markers.filter((m) => m.id !== id) };
}

export type Accent = { t: number; strength: number };

/** Lætur tónlistina hitta á hápunkt: finnur sterkasta slagið nálægt staðnum
 *  í laginu sem lendir á `markerT` og rennir bútnum svo slagið lendi þar.
 *  Lengd rútínunnar og aðrir bútar breytast ekki. */
export function alignToMarker(
  arr: Arrangement,
  markerT: number,
  accents: Accent[],
  trackDuration: number,
  maxShift = 1.5,
): { arr: Arrangement; index: number; delta: number } | null {
  const at = locate(arr, markerT);
  if (!at) return null;
  const p = arr.parts[at.index];
  const lo = Math.max(-maxShift, -p.start);
  const hi = Math.min(maxShift, trackDuration - p.end);
  let best: Accent | null = null;
  let bestScore = 0;
  for (const a of accents) {
    const d = a.t - at.source;
    if (d < lo - 1e-9 || d > hi + 1e-9) continue;
    // Sterkt slag vegur þyngst, en nálægð telur líka.
    const score = a.strength * Math.exp(-Math.abs(d) / 0.8);
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  if (!best) return null;
  const delta = best.t - at.source;
  return { arr: slip(arr, at.index, delta, trackDuration), index: at.index, delta };
}

// ------------------------------------------------------------------ hjálp

/** Næsti punktur í (röðuðum) `points` innan `tolerance`, annars gildið sjálft. */
export function snapTo(value: number, points: ArrayLike<number>, tolerance: number): number {
  const n = points.length;
  if (!n || tolerance <= 0) return value;
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  let best = value;
  let bestD = tolerance;
  for (const i of [lo - 1, lo]) {
    if (i < 0 || i >= n) continue;
    const d = Math.abs(points[i] - value);
    if (d <= bestD) {
      bestD = d;
      best = points[i];
    }
  }
  return best;
}

/** 83.4 → "1:23" (eða "1:23,4" með tíundu). */
export function formatTime(sec: number, tenths = false): string {
  const s = Math.max(0, sec);
  if (tenths) {
    const total = Math.round(s * 10);
    const m = Math.floor(total / 600);
    const rest = total - m * 600;
    return `${m}:${String(Math.floor(rest / 10)).padStart(2, "0")},${rest % 10}`;
  }
  const total = Math.round(s);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** "1:20", "1:20,5", "80" eða "1.2m" → sekúndur; null ef ólæsilegt. */
export function parseTime(text: string): number | null {
  const s = text.trim().replace(",", ".");
  if (!s) return null;
  const m = s.match(/^(\d+):(\d{1,2}(?:\.\d+)?)$/);
  if (m) {
    const v = Number(m[1]) * 60 + Number(m[2]);
    return Number.isFinite(v) ? v : null;
  }
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  return null;
}

/** Hreinsar rútínu sem var lesin úr geymslu (gömul eða skemmd gögn). */
export function normalizeArrangement(raw: unknown, trackDurations: Record<string, number>): Arrangement {
  const base = emptyArrangement();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<Arrangement>;
  const num = (v: unknown, def: number, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? clamp(v, lo, hi) : def);
  const parts: Part[] = [];
  for (const p of Array.isArray(r.parts) ? r.parts : []) {
    if (!p || typeof p !== "object" || typeof p.trackId !== "string") continue;
    const dur = trackDurations[p.trackId];
    if (!(dur > 0)) continue;
    const tempo = num(p.tempo, 1, TEMPO_MIN, TEMPO_MAX);
    const start = num(p.start, 0, 0, Math.max(0, dur - MIN_PART * tempo));
    const end = num(p.end, dur, start + Math.min(MIN_PART * tempo, dur - start), dur);
    parts.push({
      id: typeof p.id === "string" && p.id ? p.id : `p${parts.length}-${Math.round(start * 1000)}`,
      trackId: p.trackId,
      start,
      end,
      tempo,
      gainDb: num(p.gainDb, 0, GAIN_MIN, GAIN_MAX),
      xfade: num(p.xfade, 0, 0, XFADE_MAX),
      ...(SEAM_FX.includes(p.fx as SeamFx) ? { fx: p.fx as SeamFx } : {}),
    });
  }
  const markers: Marker[] = [];
  for (const m of Array.isArray(r.markers) ? r.markers : []) {
    if (!m || typeof m !== "object" || typeof m.t !== "number" || !Number.isFinite(m.t)) continue;
    markers.push({ id: typeof m.id === "string" && m.id ? m.id : `m${markers.length}`, t: Math.max(0, m.t), label: typeof m.label === "string" ? m.label.slice(0, 60) : "" });
  }
  markers.sort((a, b) => a.t - b.t);
  const targetMin = num(r.targetMin, base.targetMin, 5, 1200);
  return {
    parts,
    markers,
    fadeIn: num(r.fadeIn, base.fadeIn, 0, 10),
    fadeOut: num(r.fadeOut, base.fadeOut, 0, 15),
    targetMin,
    targetMax: Math.max(targetMin, num(r.targetMax, base.targetMax, 5, 1200)),
  };
}

/** "Anna 8 ára — frjálst" → "Anna-8-ara-frjalst" (öruggt skráarheiti). */
export function safeFileName(name: string): string {
  const base = name
    .trim()
    .replace(/[ðÐþÞæÆ]/g, (c) => ({ ð: "d", Ð: "D", þ: "th", Þ: "Th", æ: "ae", Æ: "Ae" })[c] ?? c)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "rutina";
}
