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
import { encodeMp3 } from "./mp3.ts";
import { extract, renderMix, type TrackAudio } from "./render.ts";
import { timeStretch } from "./stretch.ts";
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
