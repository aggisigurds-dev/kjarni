import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildRowMap,
  DEFAULT_TUNE,
  deriveBodyFrame,
  horizontalRowMap,
  measureSilhouette,
  normalizeTune,
  POSE,
  warpBody,
  type BodyTune,
  type Landmark,
  type Pixels,
  type SilhouetteMask,
} from "./bodyWarp.ts";

const W = 200;
const H = 400;

/** Standandi manneskja séð að framan, í 200×400 mynd. */
function standingPerson(): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0 }));
  const set = (i: number, x: number, y: number) => (lm[i] = { x, y, visibility: 0.99 });
  set(POSE.nose, 0.5, 0.16);
  set(POSE.leftEar, 0.54, 0.15);
  set(POSE.rightEar, 0.46, 0.15);
  set(POSE.leftShoulder, 0.6, 0.25);
  set(POSE.rightShoulder, 0.4, 0.25);
  set(POSE.leftHip, 0.56, 0.5);
  set(POSE.rightHip, 0.44, 0.5);
  set(POSE.leftKnee, 0.55, 0.7);
  set(POSE.rightKnee, 0.45, 0.7);
  set(POSE.leftAnkle, 0.55, 0.92);
  set(POSE.rightAnkle, 0.45, 0.92);
  return lm;
}

/** Gríma: búkur er rétthyrningur x∈[0.36, 0.64), y∈[0.2, 0.6). */
function torsoMask(): SilhouetteMask {
  const data = new Float32Array(W * H);
  for (let y = Math.round(0.2 * H); y < Math.round(0.6 * H); y++) {
    for (let x = Math.round(0.36 * W); x < Math.round(0.64 * W); x++) data[y * W + x] = 1;
  }
  return { data, width: W, height: H };
}

function torsoImage(): Pixels {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) data[i * 4 + 3] = 255;
  const mask = torsoMask();
  for (let i = 0; i < W * H; i++) {
    if (mask.data[i] > 0) data.fill(255, i * 4, i * 4 + 3);
  }
  return { data, width: W, height: H };
}

function whiteInRow(img: Pixels, y: number): number {
  let n = 0;
  for (let x = 0; x < img.width; x++) if (img.data[(y * img.width + x) * 4] > 128) n++;
  return n;
}

function rowsEqual(a: Pixels, ay: number, b: Pixels, by: number): boolean {
  const w = a.width * 4;
  for (let i = 0; i < w; i++) if (a.data[ay * w + i] !== b.data[by * w + i]) return false;
  return true;
}

test("normalizeTune clamps every slider and only lets legs grow", () => {
  assert.deepEqual(normalizeTune({ waist: -5, hips: 3, legs: -1, head: Number.NaN }), {
    ...DEFAULT_TUNE,
    waist: -1,
    hips: 1,
    legs: 0,
    head: 0,
  });
});

test("deriveBodyFrame needs both shoulders and both hips", () => {
  const lm = standingPerson();
  lm[POSE.leftHip] = { ...lm[POSE.leftHip], visibility: 0.1 };
  assert.equal(deriveBodyFrame(lm), null);
});

test("deriveBodyFrame places the bands top-to-bottom on the actual body", () => {
  const frame = deriveBodyFrame(standingPerson());
  assert.ok(frame);
  const { shoulders, bust, waist, hips } = frame.bands;
  assert.ok(shoulders.y < bust.y && bust.y < waist.y && waist.y < hips.y);
  assert.ok(waist.y > frame.shoulderY && waist.y < frame.hipY, "waist sits between shoulders and hips");
  assert.ok(frame.legs && frame.legs.from > frame.hipY && frame.legs.to === 0.92);
  assert.ok(frame.head && Math.abs(frame.head.x - 0.5) < 1e-9);
});

test("deriveBodyFrame leaves legs off when the knees are out of frame", () => {
  const lm = standingPerson();
  lm[POSE.leftKnee] = { ...lm[POSE.leftKnee], visibility: 0 };
  assert.equal(deriveBodyFrame(lm)?.legs, null);
});

test("measureSilhouette finds both outer edges of the person on a row", () => {
  const edges = measureSilhouette(torsoMask(), 0.4, 0.5);
  assert.ok(edges);
  assert.ok(Math.abs(edges.left - 0.36) < 0.01);
  assert.ok(Math.abs(edges.right - 0.64) < 0.01);
  assert.equal(measureSilhouette(torsoMask(), 0.4, 0.05), null, "starting off the person → nothing to measure");
});

test("deriveBodyFrame snaps the waist width to the measured silhouette", () => {
  const withoutMask = deriveBodyFrame(standingPerson());
  const withMask = deriveBodyFrame(standingPerson(), torsoMask());
  assert.ok(withoutMask && withMask);
  assert.ok(Math.abs(withMask.bands.waist.half - 0.14) < 0.01);
  assert.notEqual(withoutMask.bands.waist.half, withMask.bands.waist.half);
});

test("warpBody with every slider at zero returns the image untouched", () => {
  const frame = deriveBodyFrame(standingPerson(), torsoMask());
  assert.ok(frame);
  const src = torsoImage();
  const out = warpBody(src, frame, DEFAULT_TUNE);
  assert.deepEqual(out.data, src.data);
  assert.equal(out.height, H);
});

for (const extreme of [-1, 1]) {
  test(`horizontal mapping never folds the image, all sliders at ${extreme}`, () => {
    const frame = deriveBodyFrame(standingPerson(), torsoMask());
    assert.ok(frame);
    const tune: BodyTune = { waist: extreme, hips: extreme, bust: extreme, shoulders: extreme, slim: extreme, legs: 1, head: extreme };
    for (let y = 0; y < H; y++) {
      const map = horizontalRowMap(frame, tune, W, H, y);
      for (let x = 1; x < W; x++) {
        assert.ok(map[x] > map[x - 1], `row ${y}: x=${x} maps to ${map[x]} ≤ ${map[x - 1]}`);
      }
    }
  });
}

test("slimming the waist pulls the body edges in — and only there", () => {
  const frame = deriveBodyFrame(standingPerson(), torsoMask());
  assert.ok(frame);
  const src = torsoImage();
  // Merki á bakgrunni lengst til vinstri, utan áhrifasvæðisins.
  for (let y = 0; y < H; y++) src.data.set([255, 0, 0, 255], (y * W + 5) * 4);
  const out = warpBody(src, frame, { ...DEFAULT_TUNE, waist: -1 });
  const waistRow = Math.round(frame.bands.waist.y * H);
  assert.ok(whiteInRow(out, waistRow) < whiteInRow(src, waistRow) - 8, "waist is narrower");
  const topRow = Math.round(0.21 * H);
  assert.ok(rowsEqual(out, topRow, src, topRow), "chest top, far from the waist band, is untouched");
  for (let y = 0; y < H; y++) {
    const i = (y * W + 5) * 4;
    assert.deepEqual([...out.data.slice(i, i + 4)], [255, 0, 0, 255], `background marker moved at row ${y}`);
  }
});

test("longer legs adds height inside the leg zone only", () => {
  const frame = deriveBodyFrame(standingPerson(), torsoMask());
  assert.ok(frame?.legs);
  const src = torsoImage();
  // Gólf: blátt neðst svo hægt sé að sjá að það færðist niður óbreytt.
  for (let y = Math.round(0.96 * H); y < H; y++) {
    for (let x = 0; x < W; x++) src.data.set([0, 0, 255, 255], (y * W + x) * 4);
  }
  const map = buildRowMap(H, frame, { ...DEFAULT_TUNE, legs: 1 });
  const out = warpBody(src, frame, { ...DEFAULT_TUNE, legs: 1 });
  assert.equal(out.height, map.length);
  assert.ok(out.height > H + 20 && out.height < H + 32, `height ${out.height}`);
  const firstStretched = Math.floor(frame.legs.from * H);
  for (let y = 0; y < firstStretched; y++) {
    assert.equal(map[y], y);
    assert.ok(rowsEqual(out, y, src, y), `row ${y} above the legs changed`);
  }
  assert.ok(rowsEqual(out, out.height - 1, src, H - 1), "floor at the bottom moved down intact");
});

test("bigger head grows a disk at the head and leaves the corners alone", () => {
  const frame = deriveBodyFrame(standingPerson());
  assert.ok(frame?.head);
  const src: Pixels = { data: new Uint8ClampedArray(W * H * 4), width: W, height: H };
  const hx = frame.head.x * W - 0.5;
  const hy = frame.head.y * H - 0.5;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      src.data[i + 3] = 255;
      if ((x - hx) ** 2 + (y - hy) ** 2 < 8 ** 2) src.data.fill(255, i, i + 3);
    }
  }
  const count = (img: Pixels) => {
    let n = 0;
    for (let i = 0; i < img.data.length; i += 4) if (img.data[i] > 128) n++;
    return n;
  };
  const bigger = warpBody(src, frame, { ...DEFAULT_TUNE, head: 1 });
  const smaller = warpBody(src, frame, { ...DEFAULT_TUNE, head: -1 });
  assert.ok(count(bigger) > count(src) * 1.2);
  assert.ok(count(smaller) < count(src) * 0.85);
  assert.ok(rowsEqual(bigger, 0, src, 0) && rowsEqual(bigger, H - 1, src, H - 1));
});
