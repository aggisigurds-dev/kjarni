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

// 11%|█         | 2/18 [00:12<01:42,  6.42s/it]
// 7%|▋         | 3/40 [00:18<03:50, 6.23s/it]
// 100%|██████████| 18/18 [00:45<00:00,  2.52s/it]
// 0%|          | 0/18 [00:00<?, ?it/s]                      ← ETA „?" í byrjun
const TQDM_RE = /(\d+)%\|[^|]*\|\s*(\d+)\s*\/\s*(\d+)(?:\s*\[([\d:]+)\s*<\s*([\d:?]+))?/;

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
  for (const line of tail) {
    const m = line.match(TQDM_RE);
    if (m) {
      const [, pct, cur, tot, , eta] = m;
      const percent = Math.max(0, Math.min(100, parseInt(pct, 10)));
      const current = parseInt(cur, 10);
      const total = parseInt(tot, 10);
      // tqdm skrifar "?" fyrir ETA þar til hann hefur safnað nægum sýnum.
      const etaSeconds = eta && eta.includes(":") && !eta.includes("?") ? parseDuration(eta) : undefined;
      latest = {
        percent,
        current,
        total,
        etaSeconds,
        logTail: line.trim(),
      };
    }
  }
  if (latest) return latest;
  // Enginn tqdm — bara skilum síðustu meaningful línu.
  return { logTail: tail[tail.length - 1].trim() };
}

export function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}
