import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addMarker,
  addPart,
  alignToMarker,
  duplicatePart,
  emptyArrangement,
  fitTempo,
  formatTime,
  layout,
  lengthStatus,
  locate,
  movePart,
  normalizeArrangement,
  parseTime,
  removeTrack,
  setEnd,
  setFx,
  setStart,
  setTempo,
  slip,
  snapTo,
  splitAt,
  timelineOf,
  totalLength,
  trimToLength,
  updateMarker,
  type Arrangement,
  type Part,
} from "./arrange.ts";
import { analyzeTrack, buildPeaks, columnPeaks, liveliestWindow } from "./analyze.ts";
import { addDays, eventsOn, greeting, longDate, monthGrid, shortDate, timeRange, upcoming, weekdayIndex, ymd } from "./calendar.ts";
import {
  CLOUD_PART_BYTES,
  CLOUD_WHOLE_BYTES,
  MAX_CLOUD_BYTES,
  clearDone,
  cloudPartRange,
  cloudParts,
  emptyDoc,
  mergeDocs,
  normalizeDoc,
  putClip,
  putEvent,
  putMedia,
  putSkater,
  putSong,
  putTodo,
  removeEvent,
  removeMedia,
  removeSkater,
  removeSong,
  sortedTodos,
  waveSummary,
  type CoachEvent,
  type Skater,
  type Song,
} from "./library.ts";
import { bestMatches, songFit } from "./match.ts";
import { artAt, confidentCover, coverQuery, parseItunes, plain } from "./covers.ts";
import { ALL_ELEMENTS, ELEMENTS, codeOf, focusList, fromCode, fromWords, groupOf, infoOf, joinCombo, jumpParts, labelIn, nameIn, needsWork, parseElement, searchElements, splitSpin, splitTurns, withSpin, withTurns } from "./elements.ts";
import { encodeMp3 } from "./mp3.ts";
import { extract, renderMix, type TrackAudio } from "./render.ts";
import { timeStretch } from "./stretch.ts";
import { trackNameFromFile } from "./tracks.ts";
import { encodeWav } from "./wav.ts";

const SR = 44100;
const near = (a: number, b: number, eps = 1e-6, msg = "") => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} ≉ ${b}`);
const part = (id: string, trackId: string, start: number, end: number, extra: Partial<Part> = {}): Part => ({
  id,
  trackId,
  start,
  end,
  tempo: 1,
  gainDb: 0,
  xfade: 0,
  ...extra,
});
const routine = (...parts: Part[]): Arrangement => ({ ...emptyArrangement(), parts, fadeOut: 0 });

function sine(freq: number, seconds: number, amp = 0.5): Float32Array {
  const out = new Float32Array(Math.round(seconds * SR));
  for (let i = 0; i < out.length; i++) out[i] = amp * Math.sin((2 * Math.PI * freq * i) / SR);
  return out;
}
function frequency(x: Float32Array, from: number, to: number): number {
  let crossings = 0;
  for (let i = from + 1; i < to; i++) if (x[i - 1] <= 0 && x[i] > 0) crossings++;
  return (crossings * SR) / (to - from);
}
const rms = (x: Float32Array, from = 0, to = x.length) => {
  let s = 0;
  for (let i = from; i < to; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, to - from));
};

// ------------------------------------------------------------------ tímalína

test("parts lie end to end; crossfades are centred and never change the length", () => {
  const arr = routine(part("a", "A", 10, 40), part("b", "B", 5, 25, { xfade: 2 }), part("c", "A", 100, 130, { tempo: 1.1 }));
  const lay = layout(arr);
  assert.deepEqual(lay.pos.map((v) => Math.round(v * 1000) / 1000), [0, 30, 50]);
  near(lay.len[2], 30 / 1.1);
  near(lay.total, 50 + 30 / 1.1);
  near(lay.half[1], 1);
  near(lay.half[2], 0.003, 1e-9, "hard cut still gets a de-click seam");
  near(totalLength({ ...arr, parts: arr.parts.map((p) => ({ ...p, xfade: 4 })) }), lay.total);
});

test("locate maps routine time to the place in the song, and back", () => {
  const arr = routine(part("a", "A", 10, 40), part("b", "B", 5, 25, { tempo: 1.1 }));
  assert.deepEqual(locate(arr, 12), { index: 0, local: 12, source: 22 });
  const at = locate(arr, 35)!;
  assert.equal(at.index, 1);
  near(at.source, 5 + 5 * 1.1);
  near(timelineOf(arr, 1, at.source), 35);
  assert.equal(locate(arr, 9999)!.index, 1);
  assert.equal(locate(routine(), 3), null);
});

test("trimming, slipping and splitting stay inside the song", () => {
  let arr = routine(part("a", "A", 10, 40));
  arr = setStart(arr, 0, 39.9);
  near(arr.parts[0].start, 39.5, 1e-9, "at least half a second stays");
  arr = setEnd(arr, 0, 500, 60);
  near(arr.parts[0].end, 60);
  arr = routine(part("a", "A", 10, 40));
  assert.deepEqual(slip(arr, 0, -30, 60).parts[0], part("a", "A", 0, 30), "slip clamps at the song start, length kept");
  assert.deepEqual(slip(arr, 0, 99, 60).parts[0], part("a", "A", 30, 60));
  const cut = splitAt(arr, 12, "b")!;
  assert.equal(cut.index, 1);
  assert.deepEqual(cut.arr.parts.map((p) => [p.id, p.start, p.end]), [["a", 10, 22], ["b", 22, 40]]);
  near(totalLength(cut.arr), 30, 1e-9, "splitting changes nothing audible");
  assert.equal(splitAt(arr, 0.1, "x"), null, "too close to the edge");
  const moved = movePart(cut.arr, 1, 0);
  assert.deepEqual(moved.parts.map((p) => p.id), ["b", "a"]);
  assert.deepEqual(duplicatePart(arr, 0, "z").parts.map((p) => p.id), ["a", "z"]);
  assert.equal(removeTrack(addPart(arr, part("q", "B", 0, 5)), "A").parts.length, 1);
});

test("fitting the length: trim the last part, or change the tempo within limits", () => {
  const arr = routine(part("a", "A", 0, 50), part("b", "B", 0, 45));
  assert.deepEqual(lengthStatus(95, 72, 84), { state: "long", diff: 11 });
  assert.equal(lengthStatus(80, 72, 84).state, "ok");
  assert.equal(lengthStatus(60, 72, 84).state, "short");
  near(totalLength(trimToLength(arr, 84, 200)), 84);
  const fit = fitTempo(arr, 90);
  assert.ok(fit.ok);
  near(totalLength(fit.arr), 90, 0.05);
  near(fit.arr.parts[0].tempo, 95 / 90, 0.001);
  const tooFar = fitTempo(arr, 60);
  assert.equal(tooFar.ok, false, "more than 12% is refused");
  near(tooFar.arr.parts[0].tempo, 1.12);
  near(setTempo(arr, 0, 3).parts[0].tempo, 1.12);
});

test("markers stay sorted; aligning slips the part so a strong accent lands on the marker", () => {
  let arr = routine(part("a", "A", 10, 40), part("b", "B", 0, 30));
  arr = addMarker(arr, 35, "Stökk", "m1");
  arr = addMarker(arr, 12, "Snúningur", "m2");
  assert.deepEqual(arr.markers.map((m) => m.id), ["m2", "m1"]);
  arr = updateMarker(arr, "m2", { t: 50 });
  assert.deepEqual(arr.markers.map((m) => m.id), ["m1", "m2"]);
  // Merkið á 35 s er 5 s inn í bút b (lag B @ 5,0). Sterkt slag í laginu á 5,4.
  const accents = [{ t: 4.9, strength: 0.2 }, { t: 5.4, strength: 1 }, { t: 9, strength: 1 }];
  const res = alignToMarker(arr, 35, accents, 100)!;
  assert.equal(res.index, 1);
  near(res.delta, 0.4);
  near(locate(res.arr, 35)!.source, 5.4, 1e-9, "the accent is now under the marker");
  near(totalLength(res.arr), 60, 1e-9, "routine length unchanged");
  assert.equal(alignToMarker(arr, 35, [{ t: 20, strength: 1 }], 100), null, "nothing close enough");
});

test("snapping, time text and cleaning stored data", () => {
  const beats = Float32Array.from([0.5, 1, 1.5, 2]);
  near(snapTo(1.04, beats, 0.1), 1);
  near(snapTo(1.2, beats, 0.1), 1.2);
  near(snapTo(-3, beats, 5), 0.5);
  assert.equal(formatTime(83.4), "1:23");
  assert.equal(formatTime(83.44, true), "1:23,4");
  assert.equal(formatTime(59.96, true), "1:00,0");
  assert.equal(parseTime("1:20"), 80);
  assert.equal(parseTime("1:20,5"), 80.5);
  assert.equal(parseTime("72"), 72);
  assert.equal(parseTime("abc"), null);
  const clean = normalizeArrangement(
    { parts: [{ id: "a", trackId: "A", start: -5, end: 999, tempo: 9 }, { trackId: "gone", start: 0, end: 5 }], markers: [{ t: 3, label: "x" }, { t: "nei" }], targetMin: 80, targetMax: 20 },
    { A: 60 },
  );
  assert.equal(clean.parts.length, 1);
  assert.deepEqual([clean.parts[0].start, clean.parts[0].end, clean.parts[0].tempo], [0, 60, 1.12]);
  assert.equal(clean.markers.length, 1);
  assert.ok(clean.targetMax >= clean.targetMin);
});

// ------------------------------------------------------------------ hraði

test("time-stretch changes the length but not the pitch or the level", () => {
  const src = sine(440, 3);
  for (const tempo of [1.1, 0.9, 1.03]) {
    const [out] = timeStretch([src], tempo, SR);
    assert.equal(out.length, Math.round(src.length / tempo));
    const mid = out.length >> 1;
    near(frequency(out, mid - SR / 2, mid + SR / 2), 440, 3, `pitch at tempo ${tempo}`);
    near(rms(out, SR / 4, out.length - SR / 4), 0.5 / Math.SQRT2, 0.03, `level at tempo ${tempo}`);
  }
  const [same] = timeStretch([src], 1, SR);
  assert.deepEqual(same, src);
});

test("time-stretch keeps the stereo channels locked together", () => {
  const left = sine(330, 2);
  const right = sine(330, 2, 0.25);
  const [l, r] = timeStretch([left, right], 1.08, SR);
  let worst = 0;
  for (let i = 0; i < l.length; i++) worst = Math.max(worst, Math.abs(l[i] * 0.5 - r[i]));
  assert.ok(worst < 1e-5, `channels drifted apart: ${worst}`);
});

// ------------------------------------------------------------------ greining

function clickTrack(bpm: number, seconds: number, offset = 0.25): Float32Array {
  const out = new Float32Array(Math.round(seconds * SR));
  // Mjúkur undirtónn svo þetta sé ekki bara þögn á milli.
  for (let i = 0; i < out.length; i++) out[i] = 0.02 * Math.sin((2 * Math.PI * 220 * i) / SR);
  for (let t = offset; t < seconds - 0.1; t += 60 / bpm) {
    const at = Math.round(t * SR);
    for (let i = 0; i < 2200; i++) out[at + i] += 0.8 * Math.exp(-i / 350) * Math.sin((2 * Math.PI * 90 * i) / SR + i * 0.9);
  }
  return out;
}

test("beat tracking finds the tempo and puts beats on the hits", () => {
  for (const bpm of [96, 128]) {
    const x = clickTrack(bpm, 24);
    const a = analyzeTrack([x], 1, SR);
    near(a.bpm, bpm, 1.5, `bpm ${bpm}`);
    assert.ok(a.steady > 0.12, `steady ${a.steady}`);
    const period = 60 / bpm;
    let onGrid = 0;
    for (const b of a.beats) {
      const phase = (((b - 0.25) % period) + period) % period;
      if (Math.min(phase, period - phase) < 0.035) onGrid++;
    }
    assert.ok(onGrid / a.beats.length > 0.9, `${onGrid}/${a.beats.length} beats on the grid at ${bpm}`);
    assert.ok(a.accents.length >= a.beats.length * 0.8, "every hit is an accent");
  }
});

test("time-stretch keeps every hit exactly once (no doubled or dropped beats)", () => {
  const x = clickTrack(120, 12);
  const before = analyzeTrack([x], 1, SR);
  for (const tempo of [1.08, 0.92]) {
    const [y] = timeStretch([x], tempo, SR);
    const after = analyzeTrack([y], 1, SR);
    near(after.bpm, 120 * tempo, 2, `tempo ${tempo}`);
    assert.equal(after.accents.length, before.accents.length, `hits at tempo ${tempo}`);
  }
});

test("16-bit samples analyse the same as floats", () => {
  const x = clickTrack(120, 12);
  const i16 = Int16Array.from(x, (v) => Math.round(Math.max(-1, Math.min(1, v)) * 32767));
  near(analyzeTrack([i16], 1 / 32768, SR).bpm, 120, 1.5);
});

test("waveform peaks and the liveliest stretch", () => {
  const quiet = sine(200, 4, 0.05);
  const loud = sine(200, 2, 0.8);
  const x = new Float32Array(quiet.length * 2 + loud.length);
  x.set(quiet, 0);
  x.set(loud, quiet.length);
  x.set(quiet, quiet.length + loud.length);
  const p = buildPeaks([x], 1, SR);
  const cols = columnPeaks(p, 0, 10, 10);
  near(cols[1], 0.05, 0.01);
  near(cols[4], 0.8, 0.01);
  near(columnPeaks(p, 0, 10, 10, "rms")[5], 0.8 / Math.SQRT2, 0.04);
  near(liveliestWindow(p, 2), 4, 0.05);
});

// ------------------------------------------------------------------ blöndun

const track = (channels: Float32Array[]): TrackAudio => ({ sampleRate: SR, channels, scale: 1 });

test("extract pads with silence outside the song and resamples other rates", () => {
  const t = track([sine(100, 1)]);
  const [l, r] = extract(t, -0.5, 1.5, SR);
  assert.equal(l.length, 2 * SR);
  assert.equal(rms(l, 0, SR / 2 - 10), 0);
  assert.ok(rms(l, SR / 2 + 10, SR + SR / 2 - 10) > 0.3);
  assert.equal(rms(l, SR + SR / 2 + 10), 0);
  assert.deepEqual(l, r, "mono becomes both channels");
  const [half] = extract({ sampleRate: 22050, channels: [sine(100, 1).filter((_, i) => i % 2 === 0)], scale: 1 }, 0, 1, SR);
  near(frequency(half, 1000, SR - 1000), 100, 1.5);
});

test("a single part renders sample-exact, with gain, and never clips", () => {
  const song = sine(300, 10, 0.5);
  const tracks = new Map([["A", track([song])]]);
  const arr = routine(part("a", "A", 2, 6));
  const mix = renderMix(arr, tracks, SR);
  assert.equal(mix.channels[0].length, 4 * SR);
  for (const i of [5000, 50000, 150000]) near(mix.channels[0][i], song[2 * SR + i], 1e-6);
  assert.equal(mix.gain, 1);
  const hot = renderMix(routine(part("a", "A", 2, 6, { gainDb: 6 })), tracks, SR);
  assert.ok(hot.peak > 0.98 && hot.gain < 1);
  let peak = 0;
  for (const v of hot.channels[0]) peak = Math.max(peak, Math.abs(v));
  assert.ok(peak <= 0.9801);
});

test("a crossfade blends two parts around the seam at equal power", () => {
  const a = sine(300, 10, 0.5);
  const b = sine(470, 10, 0.5);
  const tracks = new Map([["A", track([a])], ["B", track([b])]]);
  const arr = routine(part("a", "A", 0, 4), part("b", "B", 3, 7, { xfade: 2 }));
  const { channels } = renderMix(arr, tracks, SR);
  const x = channels[0];
  assert.equal(x.length, 8 * SR);
  // Fyrir samskeytin: bara A. Eftir: bara B. Í miðjunni: bæði, jafnt afl.
  near(x[2 * SR], a[2 * SR], 1e-6);
  near(x[6 * SR], b[5 * SR], 1e-6, "part b plays from 3 s in its song, placed at 4 s");
  const level = 0.5 / Math.SQRT2;
  near(rms(x, Math.round(3.9 * SR), Math.round(4.1 * SR)), level, 0.03, "equal power at the middle of the seam");
  near(rms(x, Math.round(1 * SR), Math.round(2 * SR)), level, 0.01);
  // Hreinn skurður: aðeins örstutt blöndun.
  const hard = renderMix(routine(part("a", "A", 0, 4), part("b", "B", 3, 7)), tracks, SR).channels[0];
  near(hard[4 * SR - 400], a[4 * SR - 400], 1e-6);
  near(hard[4 * SR + 400], b[3 * SR + 400], 1e-6);
});

test("fades at the start and the end, and a faster part is shorter at the same pitch", () => {
  const song = sine(300, 20, 0.5);
  const tracks = new Map([["A", track([song])]]);
  const faded = renderMix({ ...routine(part("a", "A", 0, 10)), fadeIn: 2, fadeOut: 3 }, tracks, SR).channels[0];
  assert.ok(rms(faded, 0, SR / 10) < 0.01);
  near(rms(faded, 4 * SR, 5 * SR), 0.5 / Math.SQRT2, 0.01);
  assert.ok(rms(faded, 10 * SR - SR / 10) < 0.01);
  near(rms(faded, Math.round(8.4 * SR), Math.round(8.6 * SR)), (0.5 / Math.SQRT2) * 0.5, 0.03, "half way down mid-fade");
  const cache = new Map();
  const fast = renderMix(routine(part("a", "A", 0, 11, { tempo: 1.1 })), tracks, SR, cache);
  assert.equal(fast.channels[0].length, 10 * SR);
  near(frequency(fast.channels[0], 3 * SR, 6 * SR), 300, 2);
  assert.equal(cache.size, 1);
  const again = renderMix(routine(part("a", "A", 0, 11, { tempo: 1.1 })), tracks, SR, cache);
  assert.deepEqual(again.channels[0].subarray(0, 1000), fast.channels[0].subarray(0, 1000));
});

// ------------------------------------------------------------------ skrár

test("WAV has a correct header and samples", () => {
  const wav = encodeWav([Float32Array.from([0, 1, -1, 0.5]), Float32Array.from([0, -1, 1, -0.5])], SR);
  const v = new DataView(wav.buffer);
  assert.equal(wav.length, 44 + 16);
  assert.equal(String.fromCharCode(...wav.subarray(0, 4)), "RIFF");
  assert.equal(v.getUint16(22, true), 2);
  assert.equal(v.getUint32(24, true), SR);
  assert.equal(v.getUint32(40, true), 16);
  assert.deepEqual([v.getInt16(44, true), v.getInt16(48, true), v.getInt16(50, true), v.getInt16(52, true)], [0, 32767, -32768, -32768]);
});

test("MP3 export produces a real MPEG stream of the right length", async () => {
  const left = sine(440, 3);
  const right = sine(660, 3);
  let last = 0;
  const mp3 = await encodeMp3([left, right], SR, 192, (f) => (last = f));
  assert.equal(last, 1);
  // 192 kb/s → um 24 000 bæti á sekúndu.
  near(mp3.length, 3 * 24000, 3000);
  let at = 0;
  while (at < mp3.length - 1 && !(mp3[at] === 0xff && (mp3[at + 1] & 0xe0) === 0xe0)) at++;
  assert.ok(at < 2000, "found an MPEG frame sync near the start");
});

// ------------------------------------------------------------------ hápunktar lags og besti kaflinn

test("song highlights: the big hits and the place where the song lifts stand out", () => {
  // 0–12 s: lágvært með mjúkum slögum; á 12,0 s byrjar hávær kafli; stór högg á 20 og 27 s.
  const seconds = 34;
  const x = new Float32Array(seconds * SR);
  let seed = 3;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x3fffffff) - 1;
  for (let i = 0; i < x.length; i++) x[i] = (i / SR < 12 ? 0.03 : 0.16) * Math.sin((2 * Math.PI * 220 * i) / SR);
  for (let t = 0.5; t < seconds - 0.2; t += 0.5) {
    const at = Math.round(t * SR);
    const amp = t < 12 ? 0.12 : 0.4;
    for (let i = 0; i < 2000; i++) x[at + i] += amp * Math.exp(-i / 320) * Math.sin((2 * Math.PI * 80 * i) / SR);
  }
  for (const t of [20, 27]) {
    const at = Math.round(t * SR);
    for (let i = 0; i < 26000; i++) x[at + i] += 0.5 * Math.exp(-i / 5000) * rnd();
  }
  const { highlights } = analyzeTrack([x], 1, SR);
  assert.ok(highlights.length >= 3 && highlights.length <= 40);
  const top = highlights.slice().sort((a, b) => b.score - a.score).slice(0, 3).map((h) => h.t).sort((a, b) => a - b);
  near(top[0], 12, 0.06, "lift");
  near(top[1], 20, 0.06, "hit 1");
  near(top[2], 27, 0.06, "hit 2");
  for (let i = 1; i < highlights.length; i++) assert.ok(highlights[i].t - highlights[i - 1].t >= 1.49, "spaced out");
  assert.equal(Math.max(...highlights.map((h) => h.score)), 1);
});

test("best match: the stretch of the song whose highlights land on the dance's highlights", () => {
  const highlights = [8, 10, 25, 40.5, 62, 71].map((t) => ({ t, score: t === 8 || t === 71 ? 0.3 : 1 }));
  const dance = [5, 20, 35.5];
  const [best, second] = bestMatches(highlights, dance, 50, 90);
  near(best.start, 5);
  assert.deepEqual([best.hits, best.total], [3, 3]);
  assert.ok(best.score > 0.95);
  assert.ok(second.hits < 3 && Math.abs(second.start - best.start) >= 2);
  // Hraðari bútur: sami staður í dansinum er lengra inni í laginu.
  near(bestMatches([{ t: 11, score: 1 }, { t: 27.5, score: 1 }], [5, 20], 40, 90, 1.1)[0].start, 5.5);
  assert.deepEqual(bestMatches(highlights, [], 50, 90), [], "no dance highlights → nothing to match");
  assert.deepEqual(bestMatches(highlights, dance, 50, 30), [], "song shorter than the routine");
  near(bestMatches(highlights, [1], 50, 90)[0].start + 50 <= 90 ? 1 : 0, 1, 0, "stays inside the song");
  assert.equal(songFit(undefined, dance, 50, 90), null);
  assert.ok(songFit(highlights, dance, 50, 90)!.score > songFit([{ t: 3, score: 1 }], dance, 50, 90)!.score);
});

test("seam effects: a riser before the seam and an impact on it, the same every time", () => {
  const a = sine(300, 20, 0.2);
  const tracks = new Map([["A", track([a])]]);
  const plain = routine(part("a", "A", 0, 5), part("b", "A", 10, 15));
  const dry = renderMix(plain, tracks, SR).channels[0];
  const riser = renderMix(setFx(plain, 1, "riser"), tracks, SR).channels[0];
  const impact = renderMix(setFx(plain, 1, "impact"), tracks, SR).channels;
  const diff = (x: Float32Array, from: number, to: number) => {
    let s = 0;
    for (let i = Math.round(from * SR); i < Math.round(to * SR); i++) s += (x[i] - dry[i]) ** 2;
    return Math.sqrt(s / ((to - from) * SR));
  };
  assert.ok(diff(riser, 4.5, 5) > 0.02, "riser is loud just before the seam");
  assert.ok(diff(riser, 4.5, 5) > 3 * diff(riser, 3.4, 3.9), "and builds up");
  assert.equal(diff(riser, 5.05, 6), 0, "nothing after the seam");
  assert.equal(diff(impact[0], 3, 4.99), 0, "impact starts on the seam");
  assert.ok(diff(impact[0], 5, 5.3) > 0.1);
  assert.ok(diff(impact[0], 6.2, 6.5) < diff(impact[0], 5, 5.3) / 4, "and dies away");
  assert.deepEqual(renderMix(setFx(plain, 1, "both"), tracks, SR).channels[1], renderMix(setFx(plain, 1, "both"), tracks, SR).channels[1]);
  assert.equal(setFx(setFx(plain, 1, "both"), 1, undefined).parts[1].fx, undefined);
  assert.equal(splitAt(setFx(plain, 1, "riser"), 7, "c")!.arr.parts[2].fx, undefined, "only the first half keeps the effect");
  assert.equal(normalizeArrangement({ parts: [{ id: "a", trackId: "A", start: 0, end: 5, fx: "bull" }] }, { A: 20 }).parts[0].fx, undefined);
});

// ------------------------------------------------------------------ safn og iðkendur

const song = (id: string, at: number, extra: Partial<Song> = {}): Song => ({ id, name: `Lag ${id}`, duration: 180, at, ...extra });
const skater = (id: string, at: number, extra: Partial<Skater> = {}): Skater => ({ id, name: `Iðkandi ${id}`, at, photoAt: 0, targetMin: 80, targetMax: 100, markers: [], songIds: [], ...extra });

test("library merge: the newest change to each item wins, and deletions stick", () => {
  let phone = putSong(putSong(emptyDoc(), song("a", 1)), song("b", 1));
  let tablet = phone;
  phone = putSong(phone, song("a", 5, { fav: true }));
  tablet = putSong(tablet, song("a", 3, { name: "Gamalt heiti" }));
  tablet = putSong(tablet, song("c", 4));
  tablet = removeSong(tablet, "b", 6);
  const merged = mergeDocs(phone, tablet);
  assert.deepEqual(merged.songs.map((s) => s.id), ["a", "c"]);
  assert.equal(merged.songs[0].fav, true, "newer edit of a wins");
  assert.ok(sameDocIds(mergeDocs(tablet, phone), merged), "order of merging does not matter");
  // Eytt en svo bætt við aftur seinna: kemur til baka.
  assert.deepEqual(mergeDocs(merged, putSong(emptyDoc(), song("b", 9))).songs.map((s) => s.id), ["a", "b", "c"]);
});
function sameDocIds(a: ReturnType<typeof emptyDoc>, b: ReturnType<typeof emptyDoc>) {
  return JSON.stringify(a) === JSON.stringify(b);
}

test("removing a song takes its clips and skater links with it; skaters are cleaned on save", () => {
  let doc = putSong(putSong(emptyDoc(), song("a", 1)), song("b", 1));
  doc = putClip(doc, { id: "k1", songId: "a", name: "Viðlagið", start: 40, end: 70, at: 2 });
  doc = putClip(doc, { id: "k2", songId: "b", name: "Byrjun", start: 0, end: 20, at: 2 });
  doc = putSkater(doc, skater("s1", 2, { name: "  Anna  ", songIds: ["a", "b", "a"], markers: [{ t: 30.04, label: "Stökk" }, { t: 5, label: "" }, { t: -1, label: "x" }], targetMin: 90, targetMax: 80 }));
  const anna = doc.skaters[0];
  assert.equal(anna.name, "Anna");
  assert.deepEqual(anna.songIds, ["a", "b"]);
  assert.deepEqual(anna.markers, [{ t: 5, label: "" }, { t: 30, label: "Stökk" }]);
  assert.equal(anna.targetMax, 90);
  doc = removeSong(doc, "a", 5);
  assert.deepEqual(doc.clips.map((c) => c.id), ["k2"]);
  assert.deepEqual(doc.skaters[0].songIds, ["b"]);
  assert.ok(doc.gone.some((g) => g.id === "k1") && doc.gone.some((g) => g.id === "a"));
  // Annað tæki á enn búta úr eydda laginu: þeir koma ekki aftur.
  const stale = putClip(putSong(emptyDoc(), song("a", 1)), { id: "k1", songId: "a", name: "Viðlagið", start: 40, end: 70, at: 2 });
  assert.deepEqual(mergeDocs(doc, stale).clips.map((c) => c.id), ["k2"]);
  assert.equal(removeSkater(doc, "s1", 9).skaters.length, 0);
});

test("stored library data is cleaned, and waveforms shrink for lists", () => {
  const doc = normalizeDoc({
    songs: [song("a", 1), { id: "bad" }, null],
    clips: [{ id: "k", songId: "a", name: "x", start: 5, end: 9, at: 1 }, { id: "k2", songId: "gone", start: 0, end: 1, at: 1 }, { id: "k3", songId: "a", start: 9, end: 5, at: 1 }],
    skaters: [{ id: "s", name: "Eva", at: 3, markers: [{ t: 4 }, { t: "x" }], songIds: ["a", 7] }],
    gone: [{ id: "z", at: 2 }, { id: 5 }],
  });
  assert.deepEqual([doc.songs.length, doc.clips.length, doc.skaters.length, doc.gone.length], [1, 1, 1, 1]);
  assert.deepEqual([doc.events, doc.todos], [[], []], "older data without a calendar still loads");
  assert.deepEqual(doc.skaters[0], { id: "s", name: "Eva", at: 3, photoAt: 0, targetMin: 72, targetMax: 84, markers: [{ t: 4, label: "" }], songIds: ["a"] });
  assert.deepEqual(normalizeDoc("rusl"), emptyDoc());
  const wave = waveSummary(Uint8Array.from([0, 255, 128, 0, 0, 64, 0, 0]), 4);
  assert.deepEqual(wave, [99, 50, 25, 0]);
});

// ------------------------------------------------------------------ dagatal og verkefni

const event = (id: string, date: string, extra: Partial<CoachEvent> = {}): CoachEvent => ({ id, at: 1, title: `Æfing ${id}`, date, kind: "aefing", skaterIds: [], ...extra });

test("calendar: month grid starts on Monday and dates never slip", () => {
  // Nóvember 2026 byrjar á sunnudegi → fyrsta vikan er 26. okt.–1. nóv.
  const nov = monthGrid(2026, 10);
  assert.equal(nov.length, 6);
  assert.deepEqual(nov[0].map((d) => d.day), [26, 27, 28, 29, 30, 31, 1]);
  assert.deepEqual(nov[0].map((d) => d.inMonth), [false, false, false, false, false, false, true]);
  assert.equal(nov[5][0].date, "2026-11-30");
  assert.equal(nov[5][6].date, "2026-12-06");
  // Febrúar 2027 byrjar á mánudegi og er nákvæmlega fjórar vikur.
  const feb = monthGrid(2027, 1);
  assert.equal(feb.length, 4);
  assert.ok(feb.flat().every((d) => d.inMonth));
  assert.equal(monthGrid(2028, 1).flat().filter((d) => d.inMonth).length, 29, "leap year");
  assert.equal(weekdayIndex("2026-11-10"), 1, "a Tuesday");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(ymd(new Date(2026, 10, 9, 23, 59)), "2026-11-09");
});

test("calendar: Icelandic dates, time ranges and what is coming up", () => {
  assert.equal(longDate("2026-11-10"), "þriðjudagur 10. nóvember");
  assert.equal(shortDate("2026-11-10", "2026-11-10"), "í dag");
  assert.equal(shortDate("2026-11-11", "2026-11-10"), "á morgun");
  assert.equal(shortDate("2026-11-14", "2026-11-10"), "lau 14. nóv.");
  assert.equal(timeRange({ time: "16:30", minutes: 45 }), "16:30–17:15");
  assert.equal(timeRange({ time: "23:30", minutes: 60 }), "23:30–00:30");
  assert.equal(timeRange({ time: "09:00" }), "09:00");
  assert.equal(timeRange({}), "allan daginn");
  assert.deepEqual([greeting(7), greeting(14), greeting(21)], ["Góðan daginn", "Góðan dag", "Gott kvöld"]);
  let doc = emptyDoc();
  doc = putEvent(doc, event("c", "2026-11-12", { time: "17:00" }));
  doc = putEvent(doc, event("a", "2026-11-10", { time: "16:00", title: "  Svellið  ", skaterIds: ["s1", "s1"], minutes: 0, note: " " }));
  doc = putEvent(doc, event("b", "2026-11-10"));
  doc = putEvent(doc, event("d", "2026-11-12", { time: "09:00", kind: "keppni" }));
  assert.deepEqual(doc.events.map((e) => e.id), ["b", "a", "d", "c"], "by day, all-day first, then by time");
  const a = doc.events[1];
  assert.deepEqual([a.title, a.skaterIds, a.minutes, a.note], ["Svellið", ["s1"], undefined, undefined]);
  assert.deepEqual(eventsOn(doc.events, "2026-11-10").map((e) => e.id), ["b", "a"]);
  assert.deepEqual(upcoming(doc.events, "2026-11-10").map((e) => e.id), ["d", "c"]);
  assert.deepEqual(removeEvent(doc, "a", 9).events.map((e) => e.id), ["b", "d", "c"]);
});

test("todos and events merge across devices like everything else", () => {
  let phone = putTodo(putTodo(emptyDoc(), { id: "t1", at: 1, text: " Panta svellið ", done: false }), { id: "t2", at: 2, text: "Prenta lista", done: false });
  let tablet = phone;
  phone = putTodo(phone, { id: "t1", at: 5, text: "Panta svellið", done: true });
  tablet = putTodo(tablet, { id: "t3", at: 4, text: "Kaupa límband", done: false });
  tablet = putEvent(tablet, event("e1", "2026-11-20"));
  const merged = mergeDocs(phone, tablet);
  assert.deepEqual(sortedTodos(merged.todos).map((t) => [t.id, t.done]), [["t3", false], ["t2", false], ["t1", true]]);
  assert.equal(merged.todos.find((t) => t.id === "t1")!.text, "Panta svellið");
  assert.equal(merged.events.length, 1);
  const cleared = clearDone(merged, 9);
  assert.deepEqual(cleared.todos.map((t) => t.id).sort(), ["t2", "t3"]);
  assert.deepEqual(mergeDocs(cleared, phone).todos.map((t) => t.id).sort(), ["t2", "t3"], "a cleared todo does not come back from the other device");
  assert.equal(clearDone(cleared, 10), cleared);
  const loaded = normalizeDoc({ events: [event("ok", "2026-01-05", { time: "8:00" }), { id: "x", at: 1, title: "t", date: "5. jan" }], todos: [{ id: "t", at: 1, text: "a", done: "yes" }, { id: 4 }] });
  assert.deepEqual(loaded.events.map((e) => [e.id, e.time]), [["ok", undefined]]);
  assert.deepEqual(loaded.todos, [{ id: "t", at: 1, text: "a", done: false }]);
});

test("song names are tidied from file names", () => {
  assert.equal(trackNameFromFile("04.Kickstart_My_Heart.mp3"), "Kickstart My Heart");
  assert.equal(trackNameFromFile("01 - Lagið mitt.m4a"), "Lagið mitt");
  assert.equal(trackNameFromFile("Ramstein_-_Du_Hast_Techno_Remix.mp3"), "Ramstein - Du Hast Techno Remix");
  assert.equal(trackNameFromFile("99 Luftballons.mp3"), "99 Luftballons", "a number that is part of the title stays");
  assert.equal(trackNameFromFile("7.mp3"), "7");
  assert.equal(trackNameFromFile(".mp3"), "Lag");
});

test("photos and videos follow the same merge rules, and a skater keeps her dance video", () => {
  const photo = { id: "m1", at: 3, kind: "mynd" as const, name: "a.jpg", size: 1000, type: "image/jpeg", skaterId: "s1" };
  const video = { id: "m2", at: 5, kind: "myndband" as const, name: "dans.mov", size: 9e6, type: "video/quicktime", skaterId: "s1" };
  let phone = putMedia(putMedia(emptyDoc(), photo), video);
  assert.deepEqual(phone.media.map((m) => m.id), ["m2", "m1"], "newest first");
  const tablet = removeMedia(phone, "m1", 8);
  phone = putSkater(phone, skater("s1", 6, { videoId: "m2", videoStart: 2.5 }));
  const merged = mergeDocs(phone, tablet);
  assert.deepEqual(merged.media.map((m) => m.id), ["m2"], "the deleted photo stays deleted");
  assert.deepEqual([merged.skaters[0].videoId, merged.skaters[0].videoStart], ["m2", 2.5]);
  const loaded = normalizeDoc(JSON.parse(JSON.stringify({ ...merged, media: [...merged.media, { id: "x", at: 1, kind: "skjal", size: 1 }, { id: "y", at: 1, kind: "mynd" }] })));
  assert.deepEqual(loaded.media, [video]);
  assert.deepEqual([loaded.skaters[0].videoId, loaded.skaters[0].videoStart], ["m2", 2.5]);
});

test("cloud: big videos go up in parts that add back up to the whole file", () => {
  const MB = 1024 * 1024;
  // Litlar skrár (lög, myndir, stutt myndbönd) fara upp í heilu lagi, eins og áður.
  assert.equal(cloudParts(0), 1);
  assert.equal(cloudParts(5 * MB), 1);
  assert.equal(cloudParts(CLOUD_WHOLE_BYTES), 1);
  assert.deepEqual(cloudPartRange(5 * MB, 0), [0, 5 * MB]);
  // Stærri skrár í hlutum sem hver um sig er undir mörkum geymslunnar (50 MB).
  assert.ok(CLOUD_PART_BYTES < CLOUD_WHOLE_BYTES && CLOUD_WHOLE_BYTES < 50 * MB);
  assert.equal(cloudParts(CLOUD_WHOLE_BYTES + 1), 4);
  assert.equal(cloudParts(160 * MB), 10);
  assert.equal(cloudParts(160 * MB + 1), 11);
  for (const size of [CLOUD_WHOLE_BYTES + 1, 90 * MB + 123, 160 * MB, 600 * MB + 7, MAX_CLOUD_BYTES]) {
    const n = cloudParts(size);
    let at = 0;
    for (let i = 0; i < n; i++) {
      const [from, to] = cloudPartRange(size, i);
      assert.equal(from, at);
      assert.ok(to > from && to - from <= CLOUD_PART_BYTES);
      at = to;
    }
    assert.equal(at, size);
    // Heiti hlutanna („<auðkenni>-p63“) rúmast í slóðarreglunni (mest 40 stafir).
    assert.ok(`abcdefgh-p${n - 1}`.length <= 40);
  }
  assert.ok(MAX_CLOUD_BYTES >= 1024 * MB);
});

test("elements: the ISU list — codes, combinations, flying and change-foot spins, search", () => {
  // Engin tvítekin heiti, og gömlu heitin sem þegar eru í notkun eru enn á listanum.
  assert.equal(new Set(ALL_ELEMENTS.map((n) => n.toLowerCase())).size, ALL_ELEMENTS.length);
  for (const old of ["Valshopp", "Salchow", "Toe loop", "Loop", "Flip", "Lutz", "Axel", "Stökksamsetning", "Uppréttur snúningur", "Sitjandi snúningur", "Vogarsnúningur", "Layback", "Samsettur snúningur", "Skrefaröð", "Spírall", "Ina Bauer", "Byrjunarstaða", "Lokastaða"]) {
    assert.ok(ALL_ELEMENTS.includes(old), old);
  }
  assert.ok(ALL_ELEMENTS.length >= 70);
  assert.ok(ELEMENTS.every((g) => g.items.every((i) => i.name.length <= 30)));

  // Stökk: skammstöfun með snúningafjölda, líka í samsetningu.
  assert.equal(codeOf("Lutz"), "1Lz");
  assert.equal(codeOf("2× Axel"), "2A");
  assert.equal(codeOf("4× Toe loop"), "4T");
  assert.equal(codeOf("2× Lutz + 2× Toe loop"), "2Lz+2T");
  assert.equal(codeOf("3× Axel + Euler + 3× Salchow"), "3A+1Eu+3S");
  assert.equal(groupOf("2× Lutz + 2× Toe loop"), "stokk");
  assert.deepEqual(jumpParts("2x lutz+toe loop"), [
    { turns: "2×", name: "Lutz" },
    { turns: "", name: "Toe loop" },
  ]);
  assert.equal(jumpParts("Lutz + Spírall"), null);
  assert.equal(jumpParts("Stökksamsetning"), null);
  assert.equal(groupOf("Valshopp"), "hopp");
  assert.equal(joinCombo(["2× Flip", " ", "Loop"]), "2× Flip + Loop");
  assert.equal(joinCombo(["Axel", "Axel", "Axel", "Axel", "Axel"]).split("+").length, 4);

  // Skammstöfun → heiti (þjálfari getur slegið inn „2lz+2t“).
  assert.equal(fromCode("2lz+2t"), "2× Lutz + 2× Toe loop");
  assert.equal(fromCode("1A"), "Axel");
  assert.equal(fromCode("3A+1Eu+3S"), "3× Axel + Euler + 3× Salchow");
  assert.equal(fromCode("Lz"), "Lutz");
  assert.equal(fromCode("s"), null);
  assert.equal(fromCode("spírall"), null);
  assert.equal(fromCode("StSq"), "Skrefaröð");
  assert.equal(fromCode("chsq"), "Kóreógrafísk röð");

  // Snúningar: flug (F) og fótaskipti (C) fyrir framan grunnstöðuna.
  assert.equal(codeOf("Sitjandi snúningur"), "SSp");
  assert.equal(codeOf("Vogarsnúningur"), "CSp");
  assert.equal(withSpin("Sitjandi snúningur", true, false), "Sitjandi snúningur með flugi");
  assert.equal(codeOf("Sitjandi snúningur með flugi"), "FSSp");
  assert.equal(codeOf("Vogarsnúningur með fótaskiptum"), "CCSp");
  assert.equal(codeOf("Samsettur snúningur með flugi og fótaskiptum"), "FCCoSp");
  assert.deepEqual(splitSpin("layback með fótaskiptum"), { base: "Layback", fly: false, change: true });
  assert.equal(splitSpin("Biellmann"), null);
  assert.equal(groupOf("Samsettur snúningur með fótaskiptum"), "snuningar");
  for (const [code, label] of [
    ["USp", "Uppréttur snúningur"],
    ["CSp", "Vogarsnúningur"],
    ["CCSp", "Vogarsnúningur með fótaskiptum"],
    ["FCSp", "Vogarsnúningur með flugi"],
    ["FCCSp", "Vogarsnúningur með flugi og fótaskiptum"],
    ["CSSp", "Sitjandi snúningur með fótaskiptum"],
    ["FCSSp", "Sitjandi snúningur með flugi og fótaskiptum"],
    ["CoSp", "Samsettur snúningur"],
    ["CCoSp", "Samsettur snúningur með fótaskiptum"],
    ["FCoSp", "Samsettur snúningur með flugi"],
    ["FCCoSp", "Samsettur snúningur með flugi og fótaskiptum"],
    ["CLSp", "Layback með fótaskiptum"],
  ]) {
    assert.equal(fromCode(code), label, code);
    assert.equal(codeOf(label), code, label);
  }
  assert.equal(codeOf("Spírall"), null);
  assert.equal(codeOf("Eitthvað annað"), null);

  // Leit: án brodda, eftir öðru heiti og eftir skammstöfun.
  const names = (q: string) => searchElements(q).flatMap((g) => g.items.map((i) => i.name));
  assert.equal(searchElements("").length, ELEMENTS.length);
  assert.ok(names("spirall").includes("Spírall"));
  assert.ok(names("waltz").includes("Valshopp"));
  assert.ok(names("camel").includes("Vogarsnúningur"));
  assert.deepEqual(names("lz"), ["Lutz"]);
  assert.ok(names("STSQ").includes("Skrefaröð"));
  assert.deepEqual(names("þristur"), ["Three-turn"]);
  assert.deepEqual(names("zzzz"), []);
});

test("elements: English and Icelandic names, and a short explanation for each", () => {
  // Það sem er geymt er alltaf grunnheitið; málið ræður aðeins því sem sést.
  assert.equal(labelIn("2× Axel", "en"), "Double Axel");
  assert.equal(labelIn("2× Axel", "is"), "Tvöfaldur Axel");
  assert.equal(labelIn("Axel", "en"), "Axel");
  assert.equal(labelIn("3× Lutz + 2× Toe loop", "en"), "Triple Lutz + Double Toe loop");
  assert.equal(labelIn("4× Salchow", "en"), "Quad Salchow");
  assert.equal(labelIn("4× Salchow", "is"), "Fjórfaldur Salchow");
  assert.equal(labelIn("2× Loop", "en"), "Double Loop");
  assert.equal(labelIn("Sitjandi snúningur", "en"), "Sit spin");
  assert.equal(labelIn("Sitjandi snúningur með flugi", "en"), "Flying sit spin");
  assert.equal(labelIn("Vogarsnúningur með fótaskiptum", "en"), "Change foot camel spin");
  assert.equal(labelIn("Samsettur snúningur með flugi og fótaskiptum", "en"), "Flying change foot combination spin");
  assert.equal(labelIn("Samsettur snúningur með flugi og fótaskiptum", "is"), "Samsettur snúningur með flugi og fótaskiptum");
  assert.equal(labelIn("Layback", "en"), "Layback spin");
  assert.equal(labelIn("Skrefaröð", "en"), "Step sequence");
  assert.equal(labelIn("Skrefaröð", "is"), "Skrefaröð");
  assert.equal(labelIn("Valshopp", "en"), "Waltz jump");
  assert.equal(labelIn("Spírall", "en"), "Spiral");
  assert.equal(labelIn("Ina Bauer", "en"), "Ina Bauer");
  assert.equal(labelIn("Mitt eigið trix", "en"), "Mitt eigið trix");
  assert.equal(labelIn("", "en"), "");
  // Skammstöfunin er sú sama á báðum málum.
  assert.equal(codeOf("2× Axel"), "2A");

  // Orð → grunnheiti, á báðum málum.
  assert.equal(fromWords("double axel"), "2× Axel");
  assert.equal(fromWords("Double Loop"), "2× Loop");
  assert.equal(fromWords("tvöfaldur lutz"), "2× Lutz");
  assert.equal(fromWords("þrefaldur toe loop"), "3× Toe loop");
  assert.equal(fromWords("triple lutz + double toe loop"), "3× Lutz + 2× Toe loop");
  assert.equal(fromWords("double axel + euler + double salchow"), "2× Axel + Euler + 2× Salchow");
  assert.equal(fromWords("single axel"), "Axel");
  assert.equal(fromWords("quad toe loop"), "4× Toe loop");
  assert.equal(fromWords("flying sit spin"), "Sitjandi snúningur með flugi");
  assert.equal(fromWords("flying camel"), "Vogarsnúningur með flugi");
  assert.equal(fromWords("change foot combination spin"), "Samsettur snúningur með fótaskiptum");
  assert.equal(fromWords("flying change foot sit spin"), "Sitjandi snúningur með flugi og fótaskiptum");
  assert.equal(fromWords("axel"), null);
  assert.equal(fromWords("double spiral"), null);
  assert.equal(fromWords("sit spin"), null);
  assert.equal(fromWords("eitthvað annað"), null);
  assert.equal(parseElement("2a+2t"), "2× Axel + 2× Toe loop");
  assert.equal(parseElement("double flip"), "2× Flip");
  assert.equal(parseElement("spíral"), null);
  // Fram og til baka: enska heitið á hverju stökki og snúningi skilar sér í sama grunnheiti.
  for (const label of ["2× Lutz", "3× Flip + 2× Toe loop", "Sitjandi snúningur með flugi", "Layback með fótaskiptum", "Uppréttur snúningur með flugi og fótaskiptum"]) {
    assert.equal(parseElement(labelIn(label, "en")), label, label);
  }

  // Leitin finnur ensku heitin líka.
  const names = (q: string) => searchElements(q).flatMap((g) => g.items.map((i) => i.name));
  assert.ok(names("sit spin").includes("Sitjandi snúningur"));
  assert.ok(names("step seq").includes("Skrefaröð"));
  assert.ok(names("lunge").includes("Útfall"));
  assert.ok(names("crossovers").includes("Krossskref"));

  // Hvert atriði (nema augnablikin „í dansinum“) hefur skýringu, og ensku heitin eru einkvæm.
  for (const g of ELEMENTS) {
    for (const i of g.items) {
      if (g.id !== "dans") assert.ok(i.info && i.info.length > 20, `${i.name} vantar skýringu`);
      assert.ok(nameIn(i, "en").length > 0 && nameIn(i, "is") === i.name);
    }
    if (g.id !== "dans") assert.ok(g.about && g.about.length > 40, `${g.label} vantar inngang`);
  }
  const en = ELEMENTS.flatMap((g) => g.items.map((i) => nameIn(i, "en").toLowerCase()));
  assert.equal(new Set(en).size, en.length);
  assert.ok(infoOf("2× Lutz + 2× Toe loop")?.startsWith("Tástökk"));
  assert.ok(infoOf("Sitjandi snúningur með flugi")?.includes("sitjandi"));
  assert.ok(infoOf("Axel")?.includes("áfram"));
  assert.equal(infoOf("Mitt eigið trix"), null);
});

test("elements: names, jump rotations, and what to practise first", () => {
  assert.equal(groupOf("Lutz"), "stokk");
  assert.equal(groupOf("2× salchow"), "stokk");
  assert.equal(groupOf("Sitjandi snúningur"), "snuningar");
  assert.equal(groupOf("Skrefaröð"), "skref");
  assert.equal(groupOf("Eitthvað annað"), null);
  assert.deepEqual(splitTurns("3x Toe loop"), { turns: "3×", name: "Toe loop" });
  assert.deepEqual(splitTurns("Axel"), { turns: "", name: "Axel" });
  assert.equal(withTurns("Flip", "2×"), "2× Flip");
  assert.equal(withTurns("Flip", ""), "Flip");
  const marks = [
    { label: "Lutz", grade: 2 },
    { label: "Axel", grade: 5 },
    { label: "lutz", grade: 3 },
    { label: "Sitjandi snúningur", grade: 3 },
    { label: "Skrefaröð" },
    { label: "", grade: 1 },
  ];
  assert.deepEqual(focusList(marks), [
    { label: "Lutz", grade: 2.5, count: 2 },
    { label: "Sitjandi snúningur", grade: 3, count: 1 },
    { label: "Axel", grade: 5, count: 1 },
  ]);
  assert.deepEqual(needsWork(marks).map((f) => f.label), ["Lutz", "Sitjandi snúningur"], "only grade 3 and below");
  const doc = putSkater(emptyDoc(), skater("s", 1, { markers: [{ t: 5, label: "Lutz", grade: 2 }, { t: 9, label: "Axel", grade: 9 }, { t: 12, label: "Loop", grade: 2.5 }] }));
  assert.deepEqual(doc.skaters[0].markers.map((m) => m.grade), [2, undefined, undefined], "grades are whole numbers 1–5");
});

test("covers: only a sure match is picked automatically", () => {
  const art = (n: number) => `https://is1-ssl.mzstatic.com/image/thumb/Music/v4/${n}/100x100bb.jpg`;
  const hits = parseItunes({
    results: [
      { trackName: "Enter Sandman (Hard Rock Remix)", artistName: "Power Music Workout", collectionName: "Workout", artworkUrl100: art(1) },
      { trackName: "Kickstart My Heart", artistName: "Mötley Crüe", collectionName: "Dr. Feelgood", artworkUrl100: art(2) },
      { trackName: "Kickstart My Heart", artistName: "Mötley Crüe", collectionName: "Dr. Feelgood", artworkUrl100: art(2) },
      { trackName: "Du hast", artistName: "Rammstein", collectionName: "Sehnsucht", artworkUrl100: art(3) },
      { trackName: "Illt", artistName: "x", artworkUrl100: "http://evil.example/100x100bb.jpg" },
      { trackName: "Án myndar", artistName: "x" },
    ],
  });
  assert.equal(hits.length, 3, "duplicates and anything not from the artwork host are dropped");
  assert.equal(hits[1].art, "https://is1-ssl.mzstatic.com/image/thumb/Music/v4/2/300x300bb.jpg");
  assert.equal(plain("Mötley Crüe – Kickstart (Live)!"), "motley crue kickstart");
  assert.equal(coverQuery("Rammstein – Du Hast (Techno Remix)"), "rammstein du hast");
  assert.equal(coverQuery("Ramstein - Du Hast Techno Remix"), "ramstein du hast");
  assert.equal(confidentCover("Kickstart My Heart", hits)?.artist, "Mötley Crüe");
  assert.equal(confidentCover("Mötley Crüe - Kickstart My Heart (Remastered)", hits)?.album, "Dr. Feelgood");
  assert.equal(confidentCover("Rammstein – Du Hast (Techno Remix)", hits)?.title, "Du hast");
  assert.equal(confidentCover("Rock Remix", hits), null, "a vague name gets no cover on its own");
  assert.equal(confidentCover("Anna keppni lag 2", hits), null);
  assert.equal(confidentCover("Kickstart My Heart æfing", hits), null, "extra words that are not the artist → not sure");
  assert.equal(confidentCover("", hits), null);
  assert.equal(artAt("https://x.mzstatic.com/a/100x100bb.jpg", 600), "https://x.mzstatic.com/a/600x600bb.jpg");
  assert.deepEqual(parseItunes(null), []);
});
