/** Merkjasafnið — EITT safn tækja og merkja, það sama og Teikning-glugginn í Slökkvitæki-appinu notar.
 *
 * Agnar 06.10.2026: „Samræma merkingar þarna á milli. Segulmerki er til í Teikningum. Og samræma tæknina — svo þetta
 * verði meira eins og sama forritið, nema TurboPaint með ýmsa auka features."
 *
 * Frumritið (aðeins lesið, aldrei breytt héðan) er í slokkvitaeki-repóinu:
 *   js/patches/433-teikning-merking.js  STIMPLAR (merki) og TAEKI_TAKN (tækjategundir) — id, nafn, stutt, litur, glyff
 *   js/patches/434-teikning-takn.js     GLYFF, SJALF (lykill → glyff), LITIR (málmplata + borði tegundar), STIMPIL_LYKILL,
 *                                       fjold (tegund tækis → lykill), lykillFyrir, teiknaGlyff + teiknaTakn (strigateikning)
 * Hér eru sömu id, nöfn, stuttheiti og litir, og teikningin er sami kóðinn (fluttur í TypeScript) svo táknin á
 * TurboPaint-borðinu og í tækjalistanum líta eins út og í Teikning-glugganum. Breytist frumritið skal þetta fylgja.
 *
 * Tákn TurboPaint fyrir safnið heita `teikn:<lykill>` (lykill = lykill 434: lettvatn, duft, co2, slanga, annad,
 * neydarutgangur, ut, hose, rafmagn, skilti_slt, skilti_slanga, reykskynjari, hitaskynjari, bjalla, segull). Merki vistast
 * í teikning_bord með `sign` = id 433 (neyðarútgangur, ut, hose …) — STIMPIL_LYKILL tengir þetta tvennt 1:1. */

export type Glyff =
  | "extinguisher"
  | "hose"
  | "sign-extinguisher"
  | "sign-hose"
  | "exit"
  | "electric"
  | "hydrant"
  | "pin"
  | "alarm"
  | "detector"
  | "magnet";

/** 434 GLYFF */
export const GLYFF: Glyff[] = [
  "extinguisher",
  "hose",
  "sign-extinguisher",
  "sign-hose",
  "exit",
  "electric",
  "hydrant",
  "pin",
  "alarm",
  "detector",
  "magnet",
];

/** 434 GLYFF_NOFN */
export const GLYFF_NOFN: Record<Glyff, string> = {
  extinguisher: "Slökkvitæki",
  hose: "Slanga",
  "sign-extinguisher": "Skilti SLT",
  "sign-hose": "Skilti slanga",
  exit: "Útgangur",
  electric: "Rafmagn",
  hydrant: "Hani",
  pin: "Pinni",
  alarm: "Hnappur",
  detector: "Skynjari",
  magnet: "Segull",
};

export interface Stimpill {
  id: string;
  nafn: string;
  stutt: string;
  litur: string;
  glyff: Glyff;
}

/** 433 STIMPLAR — merkin (kind:'sign'); `id` er það sem vistast í `sign`. */
export const STIMPLAR: Stimpill[] = [
  { id: "neyðarútgangur", nafn: "Neyðarútgangur", stutt: "NÚ", litur: "#15803d", glyff: "exit" },
  { id: "ut", nafn: "Út", stutt: "ÚT", litur: "#15803d", glyff: "exit" },
  { id: "hose", nafn: "Slöngumerki", stutt: "SL", litur: "#c93c1d", glyff: "hose" },
  { id: "rafmagn", nafn: "Rafmagnstafla", stutt: "RAF", litur: "#eab308", glyff: "electric" },
  { id: "skilti_slt", nafn: "Skilti slökkvitæki", stutt: "SKL", litur: "#c93c1d", glyff: "sign-extinguisher" },
  { id: "skilti_slanga", nafn: "Skilti brunaslanga", stutt: "SLS", litur: "#c93c1d", glyff: "sign-hose" },
  { id: "reykskynjari", nafn: "Reykskynjari", stutt: "RS", litur: "#c93c1d", glyff: "detector" },
  { id: "hitaskynjari", nafn: "Hitaskynjari", stutt: "HS", litur: "#c93c1d", glyff: "detector" },
  { id: "bjalla", nafn: "Viðvörunarbjalla", stutt: "BJ", litur: "#c93c1d", glyff: "alarm" },
  { id: "segull", nafn: "Segulloki", stutt: "SG", litur: "#c93c1d", glyff: "magnet" },
];

/** 433 TAEKI_TAKN — tækjategundirnar. */
export const TAEKI_TAKN: Stimpill[] = [
  { id: "lettvatn", nafn: "Léttvatn", stutt: "LÉ", litur: "#e11d2e", glyff: "extinguisher" },
  { id: "duft", nafn: "Duft", stutt: "DF", litur: "#e11d2e", glyff: "extinguisher" },
  { id: "co2", nafn: "CO₂", stutt: "CO", litur: "#e11d2e", glyff: "extinguisher" },
  { id: "slanga", nafn: "Slanga", stutt: "SL", litur: "#c93c1d", glyff: "hose" },
];

/** 434 SJALF — lykill → glyff. Lykill utan listans (annad) teiknast sem slökkvitæki. */
export const SJALF: Record<string, Glyff> = {
  lettvatn: "extinguisher",
  duft: "extinguisher",
  co2: "extinguisher",
  slanga: "hose",
  neydarutgangur: "exit",
  ut: "exit",
  hose: "hose",
  rafmagn: "electric",
  skilti_slt: "sign-extinguisher",
  skilti_slanga: "sign-hose",
  reykskynjari: "detector",
  hitaskynjari: "detector",
  bjalla: "alarm",
  segull: "magnet",
};

export interface Litur {
  bg: string;
  fg: string;
  /** Borði í lit tegundar á hvítum kútnum (léttvatn sægrænt, duft blátt, CO₂ svart). */
  band?: string;
  /** CO₂: trekt í stað slöngu. */
  horn?: boolean;
  outline?: string;
}

/** 434 LITIR */
export const LITIR: Record<string, Litur> = {
  lettvatn: { bg: "#e11d2e", fg: "#fff", band: "#14b8a6" },
  duft: { bg: "#e11d2e", fg: "#fff", band: "#2563eb" },
  co2: { bg: "#e11d2e", fg: "#fff", band: "#111827", horn: true },
  slanga: { bg: "#e11d2e", fg: "#fff" },
  neydarutgangur: { bg: "#15803d", fg: "#fff" },
  ut: { bg: "#15803d", fg: "#fff" },
  hose: { bg: "#e11d2e", fg: "#fff" },
  rafmagn: { bg: "#eab308", fg: "#1c1917" },
  skilti_slt: { bg: "#e11d2e", fg: "#fff" },
  skilti_slanga: { bg: "#e11d2e", fg: "#fff" },
  reykskynjari: { bg: "#e11d2e", fg: "#fff" },
  bjalla: { bg: "#e11d2e", fg: "#fff" },
  segull: { bg: "#e11d2e", fg: "#fff" },
  hitaskynjari: { bg: "#e11d2e", fg: "#fff" },
  annad: { bg: "#e11d2e", fg: "#fff" },
};

/** 434 STIMPIL_LYKILL — `sign` í teikning_bord → lykill. */
export const STIMPIL_LYKILL: Record<string, string> = {
  "neyðarútgangur": "neydarutgangur",
  ut: "ut",
  hose: "hose",
  rafmagn: "rafmagn",
  skilti_slt: "skilti_slt",
  skilti_slanga: "skilti_slanga",
  reykskynjari: "reykskynjari",
  hitaskynjari: "hitaskynjari",
  bjalla: "bjalla",
  segull: "segull",
};

export type TaekjaLykill = "lettvatn" | "duft" | "co2" | "slanga" | "annad";

/** 434 fjold — tegund tækis (uttaeki.type) → lykill. Nákvæmlega sama regla og Teikning-glugginn. */
export function fjold(tegund: string | null | undefined): TaekjaLykill {
  const t = String(tegund || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  if (/co2|kolsyr/.test(t)) return "co2";
  if (/duft|abc|pfc/.test(t)) return "duft";
  if (/slang/.test(t)) return "slanga";
  if (/lettvatn|vatn|abf|frod/.test(t)) return "lettvatn";
  return "annad";
}

export function erStimpilMerki(m: { kind?: string; unitId?: unknown } | null | undefined): boolean {
  if (!m) return false;
  return m.kind === "sign" || (typeof m.unitId === "string" && String(m.unitId).startsWith("s:"));
}

/** 434 lykillFyrir — `takn` merkis ræður fyrst, svo stimpill (sign), svo tegund tækisins. */
export function lykillFyrir(
  m: { kind?: string; unitId?: unknown; sign?: string; takn?: unknown },
  tegund?: string | null
): string {
  const takn = typeof m.takn === "string" ? m.takn : "";
  if (takn) {
    if (STIMPIL_LYKILL[takn]) return STIMPIL_LYKILL[takn];
    if (SJALF[takn] || LITIR[takn]) return takn;
  }
  if (erStimpilMerki(m)) {
    const sign = m.sign || (typeof m.unitId === "string" ? m.unitId.split(":")[1] : "") || "";
    return STIMPIL_LYKILL[sign] || "annad";
  }
  return fjold(tegund);
}

/** 434 teiknaMerki: `color` merkis ræður plötulitnum — nema á léttvatni, dufti og CO₂ (þar ræður tegundin). */
export function liturLykils(lykill: string, color?: string | null): Litur {
  const grunnur = LITIR[lykill] || LITIR.annad;
  if (color && lykill !== "lettvatn" && lykill !== "duft" && lykill !== "co2") return { ...grunnur, bg: color };
  return { ...grunnur };
}

export function glyffLykils(lykill: string): Glyff {
  return SJALF[lykill] || "extinguisher";
}

export const TEIKN_FORSKEYTI = "teikn:";

export function symbolIdLykils(lykill: string): string {
  return TEIKN_FORSKEYTI + lykill;
}

/** `teikn:<lykill>` → lykill (eða null ef táknið er ekki úr safninu). */
export function lykillTakns(symbolId: string | null | undefined): string | null {
  const s = String(symbolId || "");
  return s.startsWith(TEIKN_FORSKEYTI) ? s.slice(TEIKN_FORSKEYTI.length) : null;
}

export interface MerkjaFaersla {
  lykill: string;
  symbolId: string;
  nafn: string;
  stutt: string;
  flokkur: "taeki" | "merki";
  /** `sign` í teikning_bord (aðeins merki). */
  sign?: string;
  glyff: Glyff;
  /** Plötulitur eins og nýtt merki fær hann (433: color = litur stimpilsins; tæki: LITIR). */
  litur: Litur;
}

/** Allt safnið í röð Teikning-gluggans: tækjategundir, „annað tæki", svo merkin. */
export const MERKJASAFN: MerkjaFaersla[] = [
  ...TAEKI_TAKN.map((t) => ({
    lykill: t.id,
    symbolId: symbolIdLykils(t.id),
    nafn: t.nafn,
    stutt: t.stutt,
    flokkur: "taeki" as const,
    glyff: glyffLykils(t.id),
    litur: liturLykils(t.id),
  })),
  // Tæki sem fjold() þekkir ekki (Reykskynjari, Eldvarnarteppi …): Teikning teiknar þau sem rautt slökkvitæki án borða.
  {
    lykill: "annad",
    symbolId: symbolIdLykils("annad"),
    nafn: "Annað tæki",
    stutt: "TÆ",
    flokkur: "taeki" as const,
    glyff: "extinguisher" as Glyff,
    litur: liturLykils("annad"),
  },
  ...STIMPLAR.map((s) => {
    const lykill = STIMPIL_LYKILL[s.id];
    return {
      lykill,
      symbolId: symbolIdLykils(lykill),
      nafn: s.nafn,
      stutt: s.stutt,
      flokkur: "merki" as const,
      sign: s.id,
      glyff: glyffLykils(lykill),
      litur: liturLykils(lykill, s.litur),
    };
  }),
];

export function faerslaLykils(lykill: string | null | undefined): MerkjaFaersla | null {
  return MERKJASAFN.find((f) => f.lykill === lykill) ?? null;
}

export function faerslaTakns(symbolId: string | null | undefined): MerkjaFaersla | null {
  return faerslaLykils(lykillTakns(symbolId));
}

export function stimpillSigns(sign: string | null | undefined): Stimpill | null {
  const s = String(sign || "").toLowerCase().normalize("NFC");
  return STIMPLAR.find((x) => x.id === s) ?? null;
}

/* ── Teikningin: 434 teiknaGlyff + teiknaTakn, fluttar óbreyttar í TypeScript ────────────────────────────────────── */

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, r || 0);
  else ctx.rect(x, y, w, h);
}

/** 434 teiknaGlyff — í 24×24 hnitum. */
export function teiknaGlyff(ctx: CanvasRenderingContext2D, id: Glyff, fg: string, outline: string | undefined, litur: Litur) {
  const strok = () => {
    ctx.strokeStyle = fg;
    ctx.lineWidth = 1.6;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  };
  const fyll = () => {
    ctx.fillStyle = fg;
    if (outline) {
      ctx.strokeStyle = outline;
      ctx.lineWidth = 0.9;
      ctx.fill();
      ctx.stroke();
    } else ctx.fill();
  };
  const box = (x: number, y: number, w: number, h: number, r?: number) => rrect(ctx, x, y, w, h, r || 0);
  switch (id) {
    case "hose":
      ctx.beginPath(); ctx.arc(12, 13, 6.5, 0, 7); strok();
      ctx.beginPath(); ctx.arc(12, 13, 2.2, 0, 7); fyll();
      ctx.beginPath(); ctx.moveTo(12, 6.5); ctx.lineTo(12, 3); ctx.lineTo(16, 3); strok();
      break;
    case "sign-extinguisher":
      box(10, 6, 4, 8, 0); fyll(); box(11, 4.5, 2.2, 2, 0); fyll();
      break;
    case "sign-hose":
      ctx.beginPath(); ctx.arc(12, 11, 5, 0, 7); strok();
      break;
    case "exit":
      box(4, 6, 8, 12, 0); ctx.strokeStyle = fg; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(10, 12); ctx.lineTo(19, 12); strok();
      ctx.beginPath(); ctx.moveTo(15, 8); ctx.lineTo(19, 12); ctx.lineTo(15, 16); strok();
      break;
    case "electric":
      ctx.beginPath(); ctx.moveTo(13, 4); ctx.lineTo(8, 13); ctx.lineTo(12, 13); ctx.lineTo(11, 20); ctx.lineTo(16, 10); ctx.lineTo(12, 10); ctx.closePath(); fyll();
      break;
    case "hydrant":
      box(8, 8, 8, 11, 0); fyll(); box(6, 11, 12, 3, 0); fyll(); box(10, 4, 4, 4, 0); fyll();
      break;
    case "pin":
      ctx.beginPath(); ctx.arc(12, 9, 5, 0, 7); fyll();
      ctx.beginPath(); ctx.moveTo(12, 14); ctx.lineTo(12, 20); strok();
      break;
    case "alarm":
      box(6, 6, 12, 12, 0); ctx.strokeStyle = fg; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.beginPath(); ctx.arc(12, 12, 3, 0, 7); fyll();
      break;
    case "magnet":
      ctx.beginPath(); ctx.moveTo(7.5, 18); ctx.lineTo(7.5, 10.5); ctx.arc(12, 10.5, 4.5, Math.PI, 0); ctx.lineTo(16.5, 18);
      ctx.strokeStyle = fg; ctx.lineWidth = 3.4; ctx.lineCap = "butt"; ctx.lineJoin = "round"; ctx.stroke();
      break;
    case "detector":
      ctx.beginPath(); ctx.arc(12, 12, 7, 0, 7); strok();
      ctx.beginPath(); ctx.arc(12, 12, 2.4, 0, 7); fyll();
      break;
    default: {
      // Slökkvitæki: kútur með ávölum öxlum, borði í lit tegundar, háls, handfang, þrýstimælir og slanga (CO₂: trekt).
      const band = litur && litur.band;
      const kutur = () => box(7.6, 8.4, 7.6, 12.6, 2.6);
      kutur(); ctx.fillStyle = fg; ctx.fill();
      ctx.save(); kutur(); ctx.clip();
      if (band) { ctx.fillStyle = band; ctx.fillRect(7.6, 12.4, 7.6, 3.9); }
      ctx.fillStyle = "rgba(0,0,0,.14)"; ctx.fillRect(13.3, 8.4, 1.9, 12.6); // skuggi hægra megin: rúmtak
      ctx.restore();
      box(9.9, 6.1, 3, 2.7, 0.5); ctx.fillStyle = fg; ctx.fill(); // háls
      ctx.strokeStyle = fg; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(8.6, 5.5); ctx.lineTo(14.6, 4.1); ctx.stroke(); // handfang
      ctx.beginPath(); ctx.arc(8.5, 7.4, 1.05, 0, 7); ctx.fillStyle = fg; ctx.fill(); // þrýstimælir
      if (litur && litur.horn) {
        ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(12.9, 7.3); ctx.lineTo(16.2, 8.4); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(15.8, 7.6); ctx.lineTo(19.8, 8.6); ctx.lineTo(19.4, 14.6); ctx.lineTo(16.4, 11.4); ctx.closePath(); ctx.fillStyle = fg; ctx.fill();
      } else {
        ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(12.9, 7.2); ctx.quadraticCurveTo(18.6, 6.8, 18.3, 12.4); ctx.stroke();
        box(17.35, 12.1, 1.9, 2.5, 0.4); ctx.fillStyle = fg; ctx.fill();
      }
    }
  }
}

/** 434 blanda — blandar tvo #rrggbb liti (t = 0..1). */
export function blanda(a: string, b: string, t: number): string {
  const h = (c: string) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(c));
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const A = h(a), B = h(b);
  if (!A || !B) return a;
  return "rgb(" + A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(",") + ")";
}

/** 434 teiknaTakn — málmplata (Brunastál) með glyffinu, miðjuð á (x, y), `rot` í gráðum. Eini munurinn frá frumritinu:
 * skuggi strigans fylgir ekki umbreytingunni (þysjun TurboPaint-borðsins), svo hann er kvarðaður hér með henni. */
export function teiknaTakn(
  ctx: CanvasRenderingContext2D,
  glyffId: Glyff,
  litur: Litur,
  x: number,
  y: number,
  size: number,
  rot?: number
) {
  ctx.save();
  let k = 1;
  try {
    const t = ctx.getTransform();
    k = Math.hypot(t.a, t.b) || 1;
  } catch {
    k = 1;
  }
  ctx.translate(x, y);
  const deg = Number(rot) || 0;
  if (deg) ctx.rotate((deg * Math.PI) / 180);
  ctx.translate(-size / 2, -size / 2);
  const r = size * 0.2;
  const bg = litur.bg || "#e11d2e";
  const plata = (inn?: number) => {
    const i = inn || 0;
    rrect(ctx, i, i, size - 2 * i, size - 2 * i, Math.max(0, r - i));
  };
  plata();
  ctx.shadowColor = "rgba(0,0,0,.6)";
  ctx.shadowBlur = Math.max(3, size * 0.2) * k;
  ctx.shadowOffsetY = Math.max(1, size * 0.05) * k;
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.strokeStyle = "rgba(255,255,255,.96)";
  ctx.lineWidth = Math.max(2.4, size / 8.5);
  ctx.stroke();
  const halli = ctx.createLinearGradient(0, 0, size * 0.6, size);
  halli.addColorStop(0, blanda(bg, "#ffffff", 0.24));
  halli.addColorStop(0.42, bg);
  halli.addColorStop(1, blanda(bg, "#000000", 0.42));
  plata();
  ctx.fillStyle = halli;
  ctx.fill();
  ctx.save();
  plata();
  ctx.clip();
  const gljai = ctx.createLinearGradient(0, 0, size, size * 0.7);
  gljai.addColorStop(0.26, "rgba(255,255,255,0)");
  gljai.addColorStop(0.38, "rgba(255,255,255,.24)");
  gljai.addColorStop(0.47, "rgba(255,255,255,0)");
  ctx.fillStyle = gljai;
  ctx.fillRect(0, 0, size, size);
  ctx.restore();
  plata();
  ctx.strokeStyle = blanda(bg, "#000000", 0.66);
  ctx.lineWidth = Math.max(1.1, size / 22);
  ctx.stroke();
  plata(Math.max(1.2, size / 16));
  ctx.strokeStyle = "rgba(255,255,255,.3)";
  ctx.lineWidth = Math.max(0.7, size / 44);
  ctx.stroke();
  ctx.scale(size / 24, size / 24);
  teiknaGlyff(ctx, glyffId, litur.fg, litur.outline, litur);
  ctx.restore();
}

/** Tákn úr safninu teiknað eftir lykli (með lit merkisins ef það ber eigin `color`). */
export function teiknaLykil(
  ctx: CanvasRenderingContext2D,
  lykill: string,
  x: number,
  y: number,
  size: number,
  rot?: number,
  color?: string | null
) {
  const f = faerslaLykils(lykill);
  const litur = color ? liturLykils(lykill, color) : f ? f.litur : liturLykils(lykill);
  teiknaTakn(ctx, glyffLykils(lykill), litur, x, y, size, rot);
}

/* ── Stærð og snúningur merkis (433) ─────────────────────────────────────────────────────────────────────────────── */

export const STAERD_MIN = 24;
export const STAERD_MAX = 160;
/** Sjálfgefin stimpilstærð Teikning-gluggans á borðtölvu (436 stimpilPx: w/12 klemmt í 32–56) — viðmið þegar hæðin á
 * enga `stimpilStaerd`. */
export const STAERD_SJALF = 56;

/** 433 klemmaStaerd: 0 = engin eigin stærð. */
export function klemmaStaerd(n: unknown): number {
  const v = Math.round(Number(n));
  if (!v || !Number.isFinite(v)) return 0;
  return Math.max(STAERD_MIN, Math.min(STAERD_MAX, v));
}

/** Viðmiðsstærð hæðarinnar í Teikning (skjápunktar): `stimpilStaerd` hæðarinnar, annars sjálfgefna stærðin. */
export function grunnStaerdHaedar(haed: { stimpilStaerd?: unknown } | null | undefined): number {
  return klemmaStaerd(haed?.stimpilStaerd) || STAERD_SJALF;
}

/** Eigin stærð merkis (433 `staerd`) → stærð á borðinu: sama hlutfall við sjálfgefna stærð og í Teikning-glugganum. */
export function staerdABordi(m: { staerd?: unknown }, grunnPx: number, grunnTeikning: number): number {
  const eigin = klemmaStaerd(m.staerd);
  return eigin ? (grunnPx * eigin) / (grunnTeikning || STAERD_SJALF) : grunnPx;
}

/** Stærð á borðinu → `staerd` merkis (öfugt við staerdABordi), klemmt eins og 433 gerir. */
export function staerdUrBordi(px: number, grunnPx: number, grunnTeikning: number): number {
  return klemmaStaerd((px / (grunnPx || 1)) * (grunnTeikning || STAERD_SJALF)) || STAERD_MIN;
}

/** Snúningur í heilum gráðum 0–359 (433 `rot`). */
export function rotGradur(n: unknown): number {
  const v = Math.round(Number(n) || 0) % 360;
  return v < 0 ? v + 360 : v;
}
