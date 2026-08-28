export type FireMinutes = 30 | 60;

export type FirewallRating = {
  minutes: FireMinutes;
  smoke: boolean;
  label: string;
};

const SKIP = /AREIM|REIM|REI.?M/;

/** Pull EI-30 / E-60 / EI-CS-30 style ratings out of noisy OCR. */
export function parseFirewallRating(raw: string): FirewallRating | null {
  const compact = raw
    .toUpperCase()
    .replace(/[O]/g, "0")
    .replace(/[!|]/g, "I")
    .replace(/[^A-Z0-9]/g, "");
  if (!compact || SKIP.test(compact)) return null;
  if (/120|90/.test(compact) && !/(?:30|60)/.test(compact)) return null;

  const match =
    compact.match(/^(?:REI|EICS|EIC|EI|E1|E)(CS)?(30|60)$/) ||
    compact.match(/^(?:REI|EICS|EIC|EI|E1|E)(30|60)(CS)$/);
  if (!match) return null;

  const minutes = Number(match[2] === "CS" ? match[1] : match[2]) as FireMinutes;
  if (minutes !== 30 && minutes !== 60) return null;
  const smoke = match[1] === "CS" || match[2] === "CS" || compact.includes("CS");
  return {
    minutes,
    smoke,
    label: smoke ? `EI-CS-${minutes}` : `EI-${minutes}`,
  };
}

export type OcrWord = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  vertical: boolean;
};

export type FirewallHit = OcrWord & { rating: FirewallRating };

function sameLine(a: OcrWord, b: OcrWord) {
  if (a.vertical !== b.vertical) return false;
  if (a.vertical) {
    return Math.abs(a.x + a.width / 2 - (b.x + b.width / 2)) <= Math.max(10, a.width);
  }
  return Math.abs(a.y + a.height / 2 - (b.y + b.height / 2)) <= Math.max(10, a.height);
}

function gap(a: OcrWord, b: OcrWord) {
  if (a.vertical) {
    const a1 = a.y + a.height;
    const b0 = b.y;
    return b0 - a1;
  }
  return b.x - (a.x + a.width);
}

/** Merge neighbouring OCR tokens so "EI" + "60" becomes EI-60. */
export function collectFirewallHits(words: OcrWord[]): FirewallHit[] {
  const sorted = [...words].sort((a, b) => {
    if (a.vertical !== b.vertical) return a.vertical ? 1 : -1;
    if (a.vertical) return a.x - b.x || a.y - b.y;
    return a.y - b.y || a.x - b.x;
  });

  const merged: OcrWord[] = [];
  for (const word of sorted) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      sameLine(prev, word) &&
      gap(prev, word) < Math.max(22, (prev.vertical ? prev.height : prev.width) * 0.8)
    ) {
      const minX = Math.min(prev.x, word.x);
      const minY = Math.min(prev.y, word.y);
      merged[merged.length - 1] = {
        text: `${prev.text} ${word.text}`,
        x: minX,
        y: minY,
        width: Math.max(prev.x + prev.width, word.x + word.width) - minX,
        height: Math.max(prev.y + prev.height, word.y + word.height) - minY,
        confidence: Math.max(prev.confidence, word.confidence),
        vertical: prev.vertical,
      };
    } else {
      merged.push({ ...word });
    }
  }

  const hits: FirewallHit[] = [];
  for (const word of [...merged, ...sorted]) {
    const rating = parseFirewallRating(word.text);
    if (!rating) continue;
    hits.push({ ...word, rating });
  }
  return nmsHits(hits);
}

function nmsHits(hits: FirewallHit[], dist = 70): FirewallHit[] {
  const ordered = [...hits].sort((a, b) => b.confidence - a.confidence);
  const kept: FirewallHit[] = [];
  for (const hit of ordered) {
    const cx = hit.x + hit.width / 2;
    const cy = hit.y + hit.height / 2;
    const dup = kept.some((other) => {
      if (other.rating.label !== hit.rating.label) return false;
      const ox = other.x + other.width / 2;
      const oy = other.y + other.height / 2;
      return (cx - ox) ** 2 + (cy - oy) ** 2 < dist * dist;
    });
    if (!dup) kept.push(hit);
  }
  return kept;
}

/** Litaregla Agnars (verkefnalisti 26.8): EI-60 appelsínugult, E-30 blátt,
 * EI/E30-CS hurðir ljósbláar. */
/* BRUNAHÓLFUN ER RAUÐ OG HÁLFGEGNSÆ (Agnar 28.08).
 *
 * Áður: EI-60 appelsínugult, EI-30 blátt, reyk ljósblátt — og teiknað með
 * opacity 0.88, sem er nánast gegnheilt. Á aðaluppdrætti lagðist það yfir
 * veggina og málsetninguna undir, svo ekki sást hvað var verið að merkja.
 *
 * Nú: einn rauður skali þar sem dýpt litarins fylgir brunamótstöðunni, og
 * gegnsæi sem hleypir teikningunni í gegn. Litirnir eru þeir sem Arnold
 * (brunavarna-sérfræðingurinn) notar: EI-60 #d32f2f, AREIM-120 #7f0000.
 *
 * EIN TAFLA fyrir bæði sjálfvirku greininguna og handvirku flokka-takkana —
 * áður voru þeir tvíteknir í BoardCanvas og gátu rekið í sundur. */
export const FIREWALL_OPACITY = 0.45;

export const FIREWALL_PALETTE = {
  /** EI-60 — 60 mín. brunahólf */
  ei60: { color: "#d32f2f", width: 8, dash: "solid" as const },
  /** EI-30 — 30 mín. brunahólf */
  ei30: { color: "#ef5350", width: 6, dash: "solid" as const },
  /** EI-CS / reykþétt — strikað svo það greinist frá heilu hólfi */
  smoke: { color: "#ff8a80", width: 6, dash: "dashed" as const },
  /** AREIM-120 — brunaveggur milli matshluta, þyngsta stigið */
  areim: { color: "#7f0000", width: 8, dash: "solid" as const },
};

export function ratingColor(rating: FirewallRating): string {
  if (rating.smoke) return FIREWALL_PALETTE.smoke.color;
  return rating.minutes === 60 ? FIREWALL_PALETTE.ei60.color : FIREWALL_PALETTE.ei30.color;
}

export function ratingDash(rating: FirewallRating): "solid" | "dashed" {
  return rating.smoke ? "dashed" : "solid";
}
