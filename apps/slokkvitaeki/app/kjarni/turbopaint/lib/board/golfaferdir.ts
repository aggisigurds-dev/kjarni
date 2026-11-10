// Útlit í 3D — litir veggja og hurða og áferð gólfs (Agnar 06.11.2026: „yrði hægt að bæta við að maður geti breytt lit á
// hurðum og veggjum, jafnvel áferð á gólfi, steypu, epoxy smásteina, litlar flísar, stórar flísar, parket, eða epoxy glans").
// Valið er vistað á hæðina (uttekt.utlit3d → haedir[].utlit3d, skrifaStillingarIHaed) svo það sé eins á öllum vélum.
// Áferðirnar eru teiknaðar á striga (engar myndir sóttar) — sama sæði gefur sömu áferð í hvert sinn.

export type GolfAferd = "teikning" | "steypa" | "epoxy-smasteinar" | "flisar-litlar" | "flisar-storar" | "parket" | "epoxy-glans";

export interface Utlit3D {
  /** Litur veggja (#rrggbb). */
  veggir?: string;
  /** Litur hurðarblaða (#rrggbb). */
  hurdir?: string;
  /** Gólfáferð; „teikning" (eða vantar) = teikningin sjálf á gólfinu eins og áður. */
  golf?: GolfAferd;
}

/** Áferðirnar í röð valmyndarinnar; `metrar` = hve marga metra ein endurtekning áferðarinnar nær yfir. */
export const GOLFAFERDIR: { id: GolfAferd; heiti: string; metrar: number; glans?: boolean }[] = [
  { id: "teikning", heiti: "Teikningin (sjálfgefið)", metrar: 1 },
  { id: "steypa", heiti: "Steypa", metrar: 4 },
  { id: "epoxy-smasteinar", heiti: "Epoxy — smásteinar", metrar: 2 },
  { id: "flisar-litlar", heiti: "Flísar, litlar (30 cm)", metrar: 1.2 },
  { id: "flisar-storar", heiti: "Flísar, stórar (60 cm)", metrar: 1.8 },
  { id: "parket", heiti: "Parket", metrar: 2.4 },
  { id: "epoxy-glans", heiti: "Epoxy — glans", metrar: 1, glans: true },
];

const HEX = /^#[0-9a-f]{6}$/i;

export function erHexLitur(s: unknown): s is string {
  return typeof s === "string" && HEX.test(s);
}

export function erGolfAferd(s: unknown): s is GolfAferd {
  return typeof s === "string" && GOLFAFERDIR.some((g) => g.id === s);
}

/** Les vistað útlit; aðeins gild gildi komast í gegn. `null` = ekkert gilt (sjálfgefið útlit). */
export function lesaUtlit3D(v: unknown): Utlit3D | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const ut: Utlit3D = {};
  if (erHexLitur(o.veggir)) ut.veggir = o.veggir.toLowerCase();
  if (erHexLitur(o.hurdir)) ut.hurdir = o.hurdir.toLowerCase();
  if (erGolfAferd(o.golf) && o.golf !== "teikning") ut.golf = o.golf;
  return Object.keys(ut).length ? ut : null;
}

/** Metrar á hverja endurtekningu áferðarinnar (fyrir `texture.repeat`). */
export function aferdarMetrar(id: GolfAferd): number {
  return GOLFAFERDIR.find((g) => g.id === id)?.metrar ?? 1;
}

export function erGlansAferd(id: GolfAferd | undefined): boolean {
  return !!id && !!GOLFAFERDIR.find((g) => g.id === id)?.glans;
}

/** Sáð slembitala (mulberry32) — sama áferð í hvert sinn. */
function slembi(saed: number) {
  let a = saed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Ctx = Pick<CanvasRenderingContext2D, "fillStyle" | "strokeStyle" | "lineWidth" | "globalAlpha" | "fillRect" | "beginPath" | "arc" | "fill" | "moveTo" | "lineTo" | "stroke" | "createRadialGradient">;

/** Teiknar eina flís áferðarinnar (px × px) á strigann — flísin er endurtekin yfir gólfið (RepeatWrapping). */
export function teiknaGolfAferd(x: Ctx, id: GolfAferd, px: number): void {
  const r = slembi(1234 + id.length * 97);
  const fylla = (l: string) => {
    x.fillStyle = l;
    x.fillRect(0, 0, px, px);
  };
  const punktur = (cx: number, cy: number, rad: number, l: string, a = 1) => {
    x.globalAlpha = a;
    x.fillStyle = l;
    x.beginPath();
    x.arc(cx, cy, rad, 0, Math.PI * 2);
    x.fill();
    x.globalAlpha = 1;
  };
  const lina = (ax: number, ay: number, bx: number, by: number, l: string, w: number, a = 1) => {
    x.globalAlpha = a;
    x.strokeStyle = l;
    x.lineWidth = w;
    x.beginPath();
    x.moveTo(ax, ay);
    x.lineTo(bx, by);
    x.stroke();
    x.globalAlpha = 1;
  };
  const gra = (g: number) => `rgb(${g},${g},${g})`;
  if (id === "steypa") {
    fylla(gra(182));
    for (let i = 0; i < (px * px) / 60; i++) punktur(r() * px, r() * px, 0.6 + r() * 1.4, gra(150 + r() * 60), 0.35);
    for (let i = 0; i < 6; i++) {
      const g = x.createRadialGradient(r() * px, r() * px, 0, r() * px, r() * px, px * (0.2 + r() * 0.3));
      g.addColorStop(0, "rgba(120,118,112,0.18)");
      g.addColorStop(1, "rgba(120,118,112,0)");
      x.fillStyle = g;
      x.fillRect(0, 0, px, px);
    }
    lina(px / 2, 0, px / 2, px, gra(140), 1.5, 0.5);
    lina(0, px / 2, px, px / 2, gra(140), 1.5, 0.5);
  } else if (id === "epoxy-smasteinar") {
    fylla("#c8bfb0");
    const litir = ["#6b655c", "#9a9187", "#d9d2c6", "#3f3b36", "#b08a66", "#857a6b", "#e5e0d6"];
    for (let i = 0; i < (px * px) / 22; i++) punktur(r() * px, r() * px, 0.9 + r() * 2.2, litir[Math.floor(r() * litir.length)]);
  } else if (id === "flisar-litlar" || id === "flisar-storar") {
    const n = id === "flisar-litlar" ? 4 : 3;
    const s = px / n;
    fylla("#8c8780");
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const t = 200 + Math.round(r() * 22);
        x.fillStyle = `rgb(${t + 6},${t + 3},${t - 4})`;
        x.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
      }
  } else if (id === "parket") {
    const radir = 8;
    const h = px / radir;
    const lengd = px / 2.5;
    fylla("#7d6243");
    for (let j = 0; j < radir; j++) {
      const hl = (j % 3) * (lengd / 3);
      for (let k = -1; k < 4; k++) {
        const x0 = k * lengd + hl;
        const t = r();
        x.fillStyle = `rgb(${Math.round(166 + t * 26)},${Math.round(132 + t * 22)},${Math.round(94 + t * 18)})`;
        x.fillRect(x0 + 1, j * h + 1, lengd - 2, h - 2);
        for (let g = 0; g < 3; g++) lina(x0 + 2, j * h + 2 + r() * (h - 4), x0 + lengd - 2, j * h + 2 + r() * (h - 4), "rgba(90,55,25,0.25)", 0.8);
      }
    }
  } else if (id === "epoxy-glans") {
    fylla("#9aa3ad");
    const g = x.createRadialGradient(px * 0.35, px * 0.3, 0, px * 0.5, px * 0.5, px * 0.9);
    g.addColorStop(0, "rgba(255,255,255,0.18)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, px, px);
  } else {
    fylla("#c9c4ba");
  }
}
