/** Hraðabreyting án þess að tónhæðin breytist (WSOLA): hljóðið er klippt í
 *  stutta, skaraða glugga sem er raðað þéttar eða gisnar, og hver gluggi er
 *  hliðrað örlítið svo bylgjurnar falli saman. Hrein reikniaðgerð — prófuð í node. */

/** Línuleg endursýnataka (breytir tónhæð) — bara fyrir örstutta búta. */
function resampleLinear(src: Float32Array, outLen: number): Float32Array {
  const out = new Float32Array(outLen);
  if (!src.length || !outLen) return out;
  const step = src.length / outLen;
  for (let i = 0; i < outLen; i++) {
    const x = i * step;
    const i0 = Math.min(src.length - 1, Math.floor(x));
    const i1 = Math.min(src.length - 1, i0 + 1);
    const f = x - i0;
    out[i] = src[i0] * (1 - f) + src[i1] * f;
  }
  return out;
}

/** `tempo` 1.1 = 10% hraðar (úttakið verður inLen/1.1 langt). Allar rásir fá
 *  sömu hliðrun, svo steríómyndin helst. */
export function timeStretch(channels: Float32Array[], tempo: number, sampleRate: number): Float32Array[] {
  const inLen = channels[0]?.length ?? 0;
  if (!inLen || !(tempo > 0) || Math.abs(tempo - 1) < 1e-4) return channels.map((c) => c.slice());
  const outLen = Math.max(1, Math.round(inLen / tempo));

  let N = Math.round(sampleRate * 0.046);
  if (N % 2) N++;
  const Hs = N / 2;
  const S = Math.round(sampleRate * 0.012);
  if (inLen < N * 3) return channels.map((c) => resampleLinear(c, outLen));

  const nch = channels.length;
  // Einóma útgáfa til að leita að bestu hliðrun, og gróf útgáfa (÷8) fyrir fyrstu leit.
  const mono = new Float32Array(inLen);
  for (let c = 0; c < nch; c++) {
    const ch = channels[c];
    for (let i = 0; i < inLen; i++) mono[i] += ch[i];
  }
  if (nch > 1) for (let i = 0; i < inLen; i++) mono[i] /= nch;
  const D = 8;
  const lenD = Math.floor(inLen / D);
  const monoD = new Float32Array(lenD);
  for (let m = 0; m < lenD; m++) {
    let s = 0;
    const base = m * D;
    for (let j = 0; j < D; j++) s += mono[base + j];
    monoD[m] = s / D;
  }
  const ND = Math.floor(N / D);
  const SD = Math.ceil(S / D);

  const win = new Float32Array(N);
  for (let n = 0; n < N; n++) win[n] = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / N);

  const out = channels.map(() => new Float32Array(outLen + N));
  const wsum = new Float32Array(outLen + N);

  const scoreD = (cand: number, ref: number): number => {
    const cnt = Math.min(ND, lenD - ref, lenD - cand);
    if (cnt < ND / 4) return -Infinity;
    let dot = 0;
    let e = 0;
    for (let j = 0; j < cnt; j++) {
      const b = monoD[cand + j];
      dot += monoD[ref + j] * b;
      e += b * b;
    }
    return dot / Math.sqrt(e + 1e-12);
  };
  const scoreFull = (cand: number, ref: number): number => {
    const cnt = Math.min(N, inLen - ref, inLen - cand);
    if (cnt < N / 4) return -Infinity;
    let dot = 0;
    let e = 0;
    for (let j = 0; j < cnt; j += 2) {
      const b = mono[cand + j];
      dot += mono[ref + j] * b;
      e += b * b;
    }
    return dot / Math.sqrt(e + 1e-12);
  };

  let prev = 0;
  for (let k = 0; ; k++) {
    const outPos = k * Hs;
    if (outPos >= outLen) break;
    let pos = 0;
    if (k > 0) {
      const ideal = Math.round(k * Hs * tempo);
      const natural = prev + Hs;
      pos = Math.min(ideal, inLen - 1);
      if (natural + N / 4 < inLen) {
        // Gróf leit í kringum kjörstaðinn …
        const iD = Math.round(ideal / D);
        const nD = Math.round(natural / D);
        let bestC = Math.max(0, Math.min(lenD - 1, iD));
        let best = scoreD(bestC, nD);
        for (let d = 1; d <= SD; d++) {
          for (const c of [iD - d, iD + d]) {
            if (c < 0 || c >= lenD) continue;
            const s = scoreD(c, nD);
            if (s > best + 1e-12) {
              best = s;
              bestC = c;
            }
          }
        }
        // … og fínleit í fullri upplausn þar í kring.
        const center = bestC * D;
        let bestP = Math.max(0, Math.min(inLen - 1, center));
        let bestF = scoreFull(bestP, natural);
        for (let d = 1; d <= D; d++) {
          for (const p of [center - d, center + d]) {
            if (p < 0 || p >= inLen) continue;
            const s = scoreFull(p, natural);
            if (s > bestF + 1e-12) {
              bestF = s;
              bestP = p;
            }
          }
        }
        pos = bestP;
      }
    }
    const cnt = Math.min(N, inLen - pos);
    for (let c = 0; c < nch; c++) {
      const src = channels[c];
      const dst = out[c];
      for (let n = 0; n < cnt; n++) dst[outPos + n] += win[n] * src[pos + n];
    }
    for (let n = 0; n < N; n++) wsum[outPos + n] += win[n];
    prev = pos;
  }

  return out.map((dst) => {
    const res = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) res[i] = wsum[i] > 1e-3 ? dst[i] / wsum[i] : dst[i];
    return res;
  });
}
