/** Er ramminn auður? — hrein aðgerð, prófuð í node.
 *
 *  Chrome á Android skilar stundum svörtum (eða gegnsæjum) ramma þegar
 *  myndbandi sem aldrei hefur spilað er leitað og það teiknað á striga. Slíkur
 *  rammi fór sem upphafsmynd framhalds og Wan bjó þá til allt aðra manneskju
 *  úr textanum einum. Raunverulegir rammar úr myndbandi eru aldrei einlitir. */
export function isBlankFrame(rgba: ArrayLike<number>, opts: { minStd?: number } = {}): boolean {
  const minStd = opts.minStd ?? 1;
  const n = Math.floor(rgba.length / 4);
  if (n === 0) return true;
  let sum = 0;
  let sum2 = 0;
  let opaque = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (rgba[o + 3] > 8) opaque++;
    const l = 0.299 * rgba[o] + 0.587 * rgba[o + 1] + 0.114 * rgba[o + 2];
    sum += l;
    sum2 += l * l;
  }
  if (opaque < n * 0.5) return true; // gegnsætt = ekkert teiknað
  const mean = sum / n;
  const std = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
  return std < minStd;
}
