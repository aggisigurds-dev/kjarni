/** Parse Replicate `logs` streng frá diffusion/video líkönum í framvindu-info.
 *
 * Dæmigerð tqdm-lína (Clarity, SDXL o.fl.):
 *   11%|█         | 2/18 [00:12<01:42,  6.42s/it]
 *
 * Dæmigerð Wan video-lína:
 *   Sampling ...  7%|▋         | 3/40 [00:18<03:50, 6.23s/it]
 *
 * ElevenLabs/music gefur minni formal output — oftast bara „Generating..." án
 * tqdm; þá getum við ekki parsað hlutfall en getum sýnt síðustu línu.
 *
 * Við tökum SÍÐUSTU tqdm-línu sem passar (líkanið getur farið gegnum
 * nokkra fasa — ControlNet, upscale, decode — hver fasi hefur sitt eigið
 * progress-bar). */

export type ParsedProgress = {
  percent?: number; // 0–100
  current?: number;
  total?: number;
  etaSeconds?: number; // tqdm skilar í "MM:SS" eða "H:MM:SS"
  itsPerSecond?: number;
  logTail?: string; // síðasta meaningful lína til að sýna í UI
};

// Mörg möguleg progress-mynstur — líkön nota mismunandi:
//   tqdm (SDXL/ControlNet):    "11%|█ | 2/18 [00:12<01:42, 6.42s/it]"
//   compact tqdm:              "11% 2/18 [00:12<01:42]"
//   step syntax (Wan, custom): "Step 5/20" eða "step 5 of 20"
//   sampling syntax:           "Sampling 11/50"
//   percent only:              "Generating 45%"
//   N / M:                     "4 / 10 frames" (Wan)
const PROGRESS_PATTERNS: ReadonlyArray<RegExp> = [
  /(\d+)%\|[^|]*\|\s*(\d+)\s*\/\s*(\d+)(?:\s*\[([\d:]+)\s*<\s*([\d:?]+))?/, // tqdm með bar
  /(\d+)%\s+(\d+)\s*\/\s*(\d+)(?:\s*\[([\d:]+)\s*<\s*([\d:?]+))?/, // tqdm án bar
  /step[s]?\s*:?\s*(\d+)\s*(?:\/|of)\s*(\d+)/i, // "step 5/20" eða "step 5 of 20"
  /sampling[:\s]+(\d+)\s*\/\s*(\d+)/i, // "Sampling 11/50"
  /frame[s]?\s*:?\s*(\d+)\s*\/\s*(\d+)/i, // "frames: 10/40"
  /(\d+)\s*\/\s*(\d+)\s+(?:frame|step|iter)/i, // "10/40 frames"
];
// Standalone prósentur sem síðasti valkostur ef ekkert N/M fannst.
const PERCENT_ONLY_RE = /(\d+(?:\.\d+)?)\s*%/;

function parseDuration(s: string): number {
  // "MM:SS" eða "H:MM:SS" → sekúndur
  const parts = s.split(":").map((p) => parseInt(p, 10));
  if (parts.some((n) => Number.isNaN(n))) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

export function parseReplicateLogs(logs?: string): ParsedProgress {
  if (!logs) return {};
  // Síðustu 30 línur duga — tqdm skrifar yfir sömu línu með \r en
  // Replicate normaliserar oft yfir í eina línu per update.
  const lines = logs.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return {};
  const tail = lines.slice(-30);
  let latest: ParsedProgress | null = null;
  // Fyrsta pass: leitum að N/M mynstri (með eða án prósentu). Þannig
  // getum við reiknað percent sjálf úr N og M ef mynstrið gefur ekki.
  for (const line of tail) {
    for (const re of PROGRESS_PATTERNS) {
      const m = line.match(re);
      if (!m) continue;
      // Mynstur geta skilað ýmist [pct, cur, tot, elapsed, eta] eða
      // bara [cur, tot]; athugum lengd match-sins.
      let percent: number | undefined;
      let current: number | undefined;
      let total: number | undefined;
      let etaSeconds: number | undefined;
      if (m.length >= 4 && /^\d+$/.test(m[1]) && m[2] && m[3]) {
        // tqdm-líkt: [pct, cur, tot, elapsed?, eta?]
        percent = Math.max(0, Math.min(100, parseInt(m[1], 10)));
        current = parseInt(m[2], 10);
        total = parseInt(m[3], 10);
        const eta = m[5];
        if (eta && eta.includes(":") && !eta.includes("?")) etaSeconds = parseDuration(eta);
      } else {
        // Bara N/M (step/frame/sampling)
        current = parseInt(m[1], 10);
        total = parseInt(m[2], 10);
        if (Number.isFinite(current) && Number.isFinite(total) && total > 0) {
          percent = Math.round((current / total) * 100);
        }
      }
      if (percent != null) {
        latest = { percent, current, total, etaSeconds, logTail: line.trim() };
        break;
      }
    }
  }
  if (latest) return latest;
  // Annar valkostur: leita að hreinni prósentu einhvers staðar.
  for (const line of tail.slice().reverse()) {
    const m = line.match(PERCENT_ONLY_RE);
    if (m) {
      const percent = Math.max(0, Math.min(100, Math.round(parseFloat(m[1]))));
      return { percent, logTail: line.trim() };
    }
  }
  // Síðasti valkostur: bara skilum síðustu meaningful línu.
  return { logTail: tail[tail.length - 1].trim() };
}

export function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}
