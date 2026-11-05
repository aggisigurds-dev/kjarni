/** Líkamsmótun — formbreyting á líkama út frá liðum sem MediaPipe finnur í
 * vafranum (sjá pose.ts). Hrein stærðfræði, ekkert DOM: prófanleg í node, og
 * nákvæmlega sama breyting keyrir á litlu forsýninni og á upprunalegu
 * upplausninni við vistun, því líkaminn er geymdur í hlutfallshnitum (0..1).
 *
 * Ólíkt gömlu forstillingunum í Móta (studio/adjust.ts → warpBody), sem toga
 * alltaf fasta rönd á miðri myndinni um miðju myndarinnar, eru bönd hér sett
 * á raunverulegar axlir/mitti/mjaðmir og miðlínu líkamans, og dofna út
 * lárétt svo bakgrunnur fjarri líkamanum hreyfist ekki. */

export type Pixels = { data: Uint8ClampedArray; width: number; height: number };

/** MediaPipe NormalizedLandmark: x sem hlutfall af breidd, y af hæð. */
export type Landmark = { x: number; y: number; visibility?: number };

/** Persónugríma frá PoseLandmarker (0..1 líkur per pixel, row-major). */
export type SilhouetteMask = { data: Float32Array; width: number; height: number };

/** BlazePose landmark indices sem notaðir eru hér. */
export const POSE = {
  nose: 0,
  leftEar: 7,
  rightEar: 8,
  leftShoulder: 11,
  rightShoulder: 12,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
} as const;

/** Sleðagildi, -1..1 (neikvætt = mjórra/minna). `legs` er 0..1 (bara lengja). */
export type BodyTune = {
  waist: number;
  hips: number;
  bust: number;
  shoulders: number;
  slim: number;
  legs: number;
  head: number;
};

export const DEFAULT_TUNE: BodyTune = { waist: 0, hips: 0, bust: 0, shoulders: 0, slim: 0, legs: 0, head: 0 };

type BandName = "shoulders" | "bust" | "waist" | "hips";
/** y = hlutfall af hæð; half = hálf breidd líkamans í hlutfalli af breidd. */
export type Band = { y: number; half: number };

export type BodyFrame = {
  shoulderY: number;
  hipY: number;
  /** hipY - shoulderY, sem hlutfall af hæð — viðmiðunarlengd fyrir bönd. */
  torso: number;
  /** Miðlína líkamans (axlir → mjaðmir → ökklar), raðað eftir y. */
  center: Array<{ y: number; x: number }>;
  bands: Record<BandName, Band>;
  /** Fótleggjasvæðið sem teygt er (y-hlutföll), eða null ef hné sjást ekki. */
  legs: { from: number; to: number } | null;
  /** Höfuðmiðja og radíus (r sem hlutfall af breidd), eða null. */
  head: { x: number; y: number; r: number } | null;
};

const STRENGTH = { waist: 0.28, hips: 0.24, bust: 0.18, shoulders: 0.15, slim: 0.14 } as const;
/** Lóðrétt breidd hvers bands, sem hlutfall af búklengd. */
const SIGMA: Record<BandName, number> = { shoulders: 0.09, bust: 0.13, waist: 0.15, hips: 0.15 };
/** Lárétt dofnun, í einingum af hálfri líkamsbreidd: full áhrif inn að NEAR,
 *  engin áhrif utan FAR — bakgrunnur fjarri líkamanum hreyfist ekki. */
const NEAR = 1.1;
const FAR = 2.6;
const HEAD_STRENGTH = 0.22;
const HEAD_NEAR = 1;
const HEAD_FAR = 1.8;
/** Hámarks teygja á fótleggjasvæðinu (18%). */
const LEG_STRENGTH = 0.18;
/** Samanlagður samdráttur á einum stað. Varpanin u ↦ u/(1+Σcₖ·Hₖ) helst
 *  vaxandi ef 1 − Σ|cₖ|·max(H + r·|H′|) > 0; fyrir smoothstep frá NEAR til FAR
 *  er það hámark ≈ 2.35, svo Σ|cₖ| < 0.425. 0.38 skilur eftir öryggisbil. */
const MAX_SHRINK = 0.38;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function clampTuneValue(n: unknown, lo: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return Math.round(clamp(v, lo, 1) * 100) / 100;
}

export function normalizeTune(raw: Partial<BodyTune> | null | undefined): BodyTune {
  const src = raw || {};
  return {
    waist: clampTuneValue(src.waist, -1),
    hips: clampTuneValue(src.hips, -1),
    bust: clampTuneValue(src.bust, -1),
    shoulders: clampTuneValue(src.shoulders, -1),
    slim: clampTuneValue(src.slim, -1),
    legs: clampTuneValue(src.legs, 0),
    head: clampTuneValue(src.head, -1),
  };
}

export function tuneIsIdentity(t: BodyTune): boolean {
  return t.waist === 0 && t.hips === 0 && t.bust === 0 && t.shoulders === 0 && t.slim === 0 && t.legs === 0 && t.head === 0;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

function falloff(r: number, near: number, far: number): number {
  return 1 - smoothstep(near, far, r);
}

function visible(l: Landmark | undefined): l is Landmark {
  return !!l && Number.isFinite(l.x) && Number.isFinite(l.y) && (l.visibility ?? 1) >= 0.5;
}

/** Ytri brúnir persónugrímunnar á línu y, mælt út frá x (bæði hlutföll).
 *  Meðaltal þriggja lína svo stakir pixlar á brúninni skipti ekki máli.
 *  null ef x lendir ekki á persónunni. */
export function measureSilhouette(
  mask: SilhouetteMask,
  yNorm: number,
  xNorm: number,
): { left: number; right: number } | null {
  const { width: w, height: h, data } = mask;
  const cy = Math.round(yNorm * h - 0.5);
  const cx = Math.round(xNorm * w - 0.5);
  if (cy < 0 || cy >= h || cx < 0 || cx >= w) return null;
  const rows = [Math.max(0, cy - 1), cy, Math.min(h - 1, cy + 1)];
  const at = (x: number) => (data[rows[0] * w + x] + data[rows[1] * w + x] + data[rows[2] * w + x]) / 3;
  if (at(cx) < 0.5) return null;
  let left = cx;
  while (left > 0 && at(left - 1) >= 0.5) left--;
  let right = cx;
  while (right < w - 1 && at(right + 1) >= 0.5) right++;
  return { left: left / w, right: (right + 1) / w };
}

/** Miðlína líkamans á hæð y (línuleg brúun, föst utan enda). */
export function centerAt(center: BodyFrame["center"], y: number): number {
  if (y <= center[0].y) return center[0].x;
  for (let i = 1; i < center.length; i++) {
    const a = center[i - 1];
    const b = center[i];
    if (y <= b.y) return a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x);
  }
  return center[center.length - 1].x;
}

/** Breytir 33 BlazePose-liðum (+ valfrjálsri grímu) í líkamsramma. null ef
 *  axlir og mjaðmir sjást ekki — t.d. engin manneskja, eða bara andlit. */
export function deriveBodyFrame(landmarks: Landmark[], mask?: SilhouetteMask | null): BodyFrame | null {
  const ls = landmarks[POSE.leftShoulder];
  const rs = landmarks[POSE.rightShoulder];
  const lh = landmarks[POSE.leftHip];
  const rh = landmarks[POSE.rightHip];
  if (!visible(ls) || !visible(rs) || !visible(lh) || !visible(rh)) return null;

  const shoulderX = (ls.x + rs.x) / 2;
  const shoulderY = (ls.y + rs.y) / 2;
  const hipX = (lh.x + rh.x) / 2;
  const hipY = (lh.y + rh.y) / 2;
  const torso = hipY - shoulderY;
  const shoulderHalf = Math.abs(ls.x - rs.x) / 2;
  const hipHalf = Math.abs(lh.x - rh.x) / 2;
  // Liggjandi/öfug manneskja eða hrein hliðarmynd — böndin myndu lenda vitlaust.
  if (torso < 0.03 || shoulderHalf < 0.01) return null;

  const la = landmarks[POSE.leftAnkle];
  const ra = landmarks[POSE.rightAnkle];
  const anklesVisible = visible(la) && visible(ra);
  const kneesVisible = visible(landmarks[POSE.leftKnee]) && visible(landmarks[POSE.rightKnee]);
  const ankleY = anklesVisible ? Math.min(1, (la.y + ra.y) / 2) : 1;

  const center: BodyFrame["center"] = [
    { y: shoulderY, x: shoulderX },
    { y: hipY, x: hipX },
  ];
  if (anklesVisible && ankleY > hipY + 0.02) center.push({ y: ankleY, x: (la.x + ra.x) / 2 });

  // Mat út frá liðum (axlarliðir eru innan við axlarbrún, mjaðmaliðir vel
  // innan við mjaðmalínu) — leiðrétt með grímunni hér fyrir neðan þegar hún er til.
  const waistHalf = Math.max(hipHalf * 1.45, shoulderHalf * 0.68);
  const bands: Record<BandName, Band> = {
    shoulders: { y: shoulderY + 0.04 * torso, half: shoulderHalf * 1.18 },
    bust: { y: shoulderY + 0.3 * torso, half: shoulderHalf * 0.86 },
    waist: { y: shoulderY + 0.66 * torso, half: waistHalf },
    hips: { y: hipY + 0.1 * torso, half: Math.max(hipHalf * 1.75, waistHalf * 1.08) },
  };
  if (mask) {
    for (const name of Object.keys(bands) as BandName[]) {
      const band = bands[name];
      const cx = centerAt(center, band.y);
      const edges = measureSilhouette(mask, band.y, cx);
      if (!edges) continue;
      const measured = (cx - edges.left + (edges.right - cx)) / 2;
      // Of víð mæling = handleggir/flík sem skagar út; of þröng = gat í grímunni.
      if (measured >= band.half * 0.6 && measured <= band.half * 2.2) band.half = measured;
    }
  }

  const legsFrom = hipY + 0.1 * torso;
  const legs = kneesVisible && ankleY - legsFrom > 0.05 ? { from: legsFrom, to: ankleY } : null;

  const le = landmarks[POSE.leftEar];
  const re = landmarks[POSE.rightEar];
  const nose = landmarks[POSE.nose];
  let head: BodyFrame["head"] = null;
  if (visible(le) && visible(re) && Math.abs(le.x - re.x) > 0.005) {
    head = { x: (le.x + re.x) / 2, y: (le.y + re.y) / 2, r: Math.abs(le.x - re.x) * 0.8 };
  } else if (visible(nose)) {
    head = { x: nose.x, y: nose.y, r: shoulderHalf * 0.55 };
  }

  return { shoulderY, hipY, torso, center, bands, legs, head };
}

/** Fyrir hverja úttakslínu: hvaða upprunalínu (pixel-miðju hnit) á að sækja.
 *  Fótleggir lengjast með mjúkri teygju milli klofs og ökkla, svo fætur og
 *  gólf halda lögun sinni og engin skörp skil verða í teygjunni. */
export function buildRowMap(srcHeight: number, frame: BodyFrame, tune: BodyTune): Float32Array {
  const legs = frame.legs;
  if (!legs || tune.legs <= 0) {
    const map = new Float32Array(srcHeight);
    for (let i = 0; i < srcHeight; i++) map[i] = i;
    return map;
  }
  const y0 = legs.from * srcHeight;
  const y1 = legs.to * srcHeight;
  const ramp = Math.max(1, Math.min(0.12 * frame.torso * srcHeight, (y1 - y0) / 2));
  const extra = LEG_STRENGTH * tune.legs;
  const cum = new Float64Array(srcHeight + 1);
  for (let i = 0; i < srcHeight; i++) {
    const y = i + 0.5;
    const w = smoothstep(y0, y0 + ramp, y) * (1 - smoothstep(y1 - ramp, y1, y));
    cum[i + 1] = cum[i] + 1 + extra * w;
  }
  const outHeight = Math.max(1, Math.round(cum[srcHeight]));
  const map = new Float32Array(outHeight);
  let i = 0;
  for (let o = 0; o < outHeight; o++) {
    // Ekki skalað að heiltölu-hæðinni: línur fyrir ofan teygjuna eiga að
    // lenda nákvæmlega á sjálfum sér (engin endursýnataka = engin móða).
    const target = o + 0.5;
    while (i < srcHeight - 1 && cum[i + 1] < target) i++;
    map[o] = Math.min(srcHeight - 1, i + (target - cum[i]) / (cum[i + 1] - cum[i]) - 0.5);
  }
  return map;
}

type Term = { c: number; half: number };

/** Allt sem þarf til að reikna láréttu böndin á tiltekinni rasterstærð. */
type BandPlan = {
  width: number;
  height: number;
  center: Array<{ y: number; x: number }>;
  bands: Array<{ name: BandName; y: number; sigma: number; half: number; c: number }>;
  slim: { c: number; from0: number; from1: number; to0: number; to1: number; halves: Array<{ y: number; half: number }> } | null;
};

function planBands(frame: BodyFrame, tune: BodyTune, width: number, height: number): BandPlan {
  const torsoPx = frame.torso * height;
  const toPx = (b: Band) => ({ y: b.y * height - 0.5, half: Math.max(2, b.half * width) });
  const bands: BandPlan["bands"] = [];
  for (const name of ["shoulders", "bust", "waist", "hips"] as BandName[]) {
    const c = tune[name] * STRENGTH[name];
    if (c === 0) continue;
    const px = toPx(frame.bands[name]);
    bands.push({ name, y: px.y, half: px.half, sigma: SIGMA[name] * torsoPx, c });
  }
  let slim: BandPlan["slim"] = null;
  if (tune.slim !== 0) {
    const s = frame.shoulderY * height;
    const h = frame.hipY * height;
    slim = {
      c: tune.slim * STRENGTH.slim,
      from0: s - 0.05 * torsoPx,
      from1: s + 0.2 * torsoPx,
      to0: h + 0.25 * torsoPx,
      to1: h + 0.6 * torsoPx,
      halves: (["shoulders", "bust", "waist", "hips"] as BandName[]).map((n) => toPx(frame.bands[n])),
    };
  }
  return {
    width,
    height,
    center: frame.center.map((p) => ({ y: p.y * height - 0.5, x: p.x * width - 0.5 })),
    bands,
    slim,
  };
}

function interpolateHalf(halves: Array<{ y: number; half: number }>, y: number): number {
  if (y <= halves[0].y) return halves[0].half;
  for (let i = 1; i < halves.length; i++) {
    if (y <= halves[i].y) {
      const a = halves[i - 1];
      const b = halves[i];
      return a.half + ((y - a.y) / (b.y - a.y)) * (b.half - a.half);
    }
  }
  return halves[halves.length - 1].half;
}

/** Virk bönd á línu y (pixel-miðju hnit). */
function termsAt(plan: BandPlan, y: number): Term[] {
  const terms: Term[] = [];
  for (const b of plan.bands) {
    const d = (y - b.y) / b.sigma;
    const g = Math.exp(-0.5 * d * d);
    if (g > 1e-3) terms.push({ c: b.c * g, half: b.half });
  }
  if (plan.slim) {
    const s = plan.slim;
    const g = smoothstep(s.from0, s.from1, y) * (1 - smoothstep(s.to0, s.to1, y));
    if (g > 1e-3) terms.push({ c: s.c * g, half: interpolateHalf(s.halves, y) });
  }
  const shrink = terms.reduce((sum, t) => sum + Math.min(0, t.c), 0);
  if (shrink < -MAX_SHRINK) {
    const k = -MAX_SHRINK / shrink;
    for (const t of terms) if (t.c < 0) t.c *= k;
  }
  return terms;
}

function sourceX(x: number, cx: number, terms: Term[]): number {
  const dx = x - cx;
  const a = Math.abs(dx);
  let scale = 1;
  for (const t of terms) scale += t.c * falloff(a / t.half, NEAR, FAR);
  return cx + dx / clamp(scale, 0.5, 1.6);
}

/** Lárétta vörpunin á einni línu: úttaks-x → upprunalegt x (pixel-miðja).
 *  Þvinguð til að vera vaxandi, svo engin samsetning sleða getur nokkurn
 *  tíma "brotið" myndina saman (sami pixill tvisvar, speglun). */
export function horizontalRowMap(frame: BodyFrame, tune: BodyTune, width: number, height: number, y: number): Float32Array {
  return rowMapFromPlan(planBands(frame, tune, width, height), y);
}

function rowMapFromPlan(plan: BandPlan, y: number): Float32Array {
  const map = new Float32Array(plan.width);
  const terms = termsAt(plan, y);
  if (terms.length === 0) {
    for (let x = 0; x < plan.width; x++) map[x] = x;
    return map;
  }
  const cx = centerAt(plan.center, y);
  let prev = -Infinity;
  for (let x = 0; x < plan.width; x++) {
    const sx = Math.max(prev, sourceX(x, cx, terms));
    map[x] = sx;
    prev = sx;
  }
  return map;
}

function sample(src: Pixels, x: number, y: number, out: Uint8ClampedArray, o: number): void {
  const maxX = src.width - 1;
  const maxY = src.height - 1;
  const xx = clamp(x, 0, maxX);
  const yy = clamp(y, 0, maxY);
  const x0 = Math.floor(xx);
  const y0 = Math.floor(yy);
  const x1 = Math.min(maxX, x0 + 1);
  const y1 = Math.min(maxY, y0 + 1);
  const fx = xx - x0;
  const fy = yy - y0;
  const d = src.data;
  const i00 = (y0 * src.width + x0) * 4;
  const i10 = (y0 * src.width + x1) * 4;
  const i01 = (y1 * src.width + x0) * 4;
  const i11 = (y1 * src.width + x1) * 4;
  const w00 = (1 - fx) * (1 - fy);
  const w10 = fx * (1 - fy);
  const w01 = (1 - fx) * fy;
  const w11 = fx * fy;
  out[o] = d[i00] * w00 + d[i10] * w10 + d[i01] * w01 + d[i11] * w11;
  out[o + 1] = d[i00 + 1] * w00 + d[i10 + 1] * w10 + d[i01 + 1] * w01 + d[i11 + 1] * w11;
  out[o + 2] = d[i00 + 2] * w00 + d[i10 + 2] * w10 + d[i01 + 2] * w01 + d[i11 + 2] * w11;
  out[o + 3] = d[i00 + 3] * w00 + d[i10 + 3] * w10 + d[i01 + 3] * w01 + d[i11 + 3] * w11;
}

/** Keyrir alla líkamsmótunina á `src` og skilar nýrri mynd. Hæðin vex ef
 *  fótleggir eru lengdir; breiddin helst. Virkar eins á forsýn og á fullri
 *  upplausn — sama `frame`, bara annar `src`. */
export function warpBody(src: Pixels, frame: BodyFrame, tuneIn: BodyTune): Pixels {
  const tune = normalizeTune(tuneIn);
  const { width, height } = src;
  if (tuneIsIdentity(tune)) return { data: new Uint8ClampedArray(src.data), width, height };

  const rowMap = buildRowMap(height, frame, tune);
  const outHeight = rowMap.length;
  const out = new Uint8ClampedArray(width * outHeight * 4);
  const plan = planBands(frame, tune, width, height);

  const head =
    frame.head && tune.head !== 0
      ? {
          x: frame.head.x * width - 0.5,
          y: frame.head.y * height - 0.5,
          r: Math.max(2, frame.head.r * width),
          c: tune.head * HEAD_STRENGTH,
        }
      : null;
  const headZone = head ? head.r * HEAD_FAR : 0;

  const rowBytes = width * 4;
  for (let o = 0; o < outHeight; o++) {
    const y = rowMap[o];
    const rowBase = o * rowBytes;
    const terms = termsAt(plan, y);
    const nearHead = head !== null && Math.abs(y - head.y) < headZone;

    // Hraðleið: flestar línur breytast ekki lárétt — heil lína er þá afrituð
    // (eða brúuð lóðrétt milli tveggja lína innan fótleggjateygjunnar).
    copyRow(src, y, out, rowBase);
    if (terms.length === 0 && !nearHead) continue;

    // Aðeins innan áhrifasvæðis bandanna (og höfuðsins) þarf að reikna.
    const cx = centerAt(plan.center, y);
    let reach = 0;
    for (const t of terms) reach = Math.max(reach, t.half * FAR);
    let x0 = Math.max(0, Math.floor(cx - reach));
    let x1 = Math.min(width - 1, Math.ceil(cx + reach));
    if (terms.length === 0) {
      x0 = width;
      x1 = -1;
    }
    let prev = -Infinity;
    for (let x = x0; x <= x1; x++) {
      const sx = Math.max(prev, sourceX(x, cx, terms));
      prev = sx;
      sample(src, sx, y, out, rowBase + x * 4);
    }

    if (nearHead && head) {
      const hx0 = Math.max(0, Math.floor(head.x - headZone));
      const hx1 = Math.min(width - 1, Math.ceil(head.x + headZone));
      for (let x = hx0; x <= hx1; x++) {
        const dx = x - head.x;
        const dy = y - head.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d >= headZone) continue;
        const s = 1 + head.c * falloff(d / head.r, HEAD_NEAR, HEAD_FAR);
        const px = head.x + dx / s;
        const py = head.y + dy / s;
        const headTerms = termsAt(plan, py);
        const sx = headTerms.length ? sourceX(px, centerAt(plan.center, py), headTerms) : px;
        sample(src, sx, py, out, rowBase + x * 4);
      }
    }
  }
  return { data: out, width, height: outHeight };
}

/** Lína y (má vera brot) úr src yfir í out — bein afritun á heiltölu-línu,
 *  annars lóðrétt línuleg brúun milli tveggja nágrannalína. */
function copyRow(src: Pixels, y: number, out: Uint8ClampedArray, outBase: number): void {
  const rowBytes = src.width * 4;
  const yy = clamp(y, 0, src.height - 1);
  const y0 = Math.floor(yy);
  const fy = yy - y0;
  const a = y0 * rowBytes;
  if (fy < 1e-4 || y0 >= src.height - 1) {
    out.set(src.data.subarray(a, a + rowBytes), outBase);
    return;
  }
  const b = a + rowBytes;
  const d = src.data;
  const gy = 1 - fy;
  for (let i = 0; i < rowBytes; i++) out[outBase + i] = d[a + i] * gy + d[b + i] * fy;
}
