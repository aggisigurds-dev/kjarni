// Kynningarhamur 3D-hússins: sama staðsetning tækja, en myndin sem fer til viðskiptavinar
// (heiti, lykill, dagsetning) í stað leikjamiða á stöngum.

import type { TaekjaGerd, Taeki3D } from "./hus3d";

export const GERD_HEITI: Record<TaekjaGerd, string> = {
  slokkvitaeki: "Slökkvitæki",
  co2: "CO₂",
  slanga: "Brunaslanga",
  reykskynjari: "Reykskynjari",
  hitaskynjari: "Hitaskynjari",
  segull: "Segulloki",
  bjalla: "Bjalla",
  rafmagn: "Rafmagnstafla",
  skilti: "Skilti",
  "skilti-ut": "Neyðarútgangur",
  teppi: "Eldvarnarteppi",
};

export type KynningarLidur = {
  gerd: TaekjaGerd | null;
  heiti: string;
  fjoldi: number;
};

const GERD_ROD: TaekjaGerd[] = [
  "slokkvitaeki",
  "co2",
  "slanga",
  "teppi",
  "reykskynjari",
  "hitaskynjari",
  "bjalla",
  "segull",
  "rafmagn",
  "skilti-ut",
  "skilti",
];

export function kynningarTitill(stadur?: string | null, haed?: string | null): string {
  const s = (stadur || "").trim();
  const h = (haed || "").trim();
  if (s && h && !s.toLowerCase().includes(h.toLowerCase())) return `${s} · ${h}`;
  return s || h || "Brunavarnir";
}

export function kynningarDags(d = new Date()): string {
  return new Intl.DateTimeFormat("is-IS", { day: "numeric", month: "long", year: "numeric" }).format(d);
}

export function kynningarLykill(taeki: readonly Pick<Taeki3D, "gerd" | "nafn" | "texti">[]): KynningarLidur[] {
  const talning = new Map<string, KynningarLidur>();
  for (const t of taeki) {
    const heiti = t.gerd ? GERD_HEITI[t.gerd] : (t.nafn || t.texti || "Annað").trim() || "Annað";
    const lykill = t.gerd || `annad:${heiti}`;
    const a = talning.get(lykill);
    if (a) a.fjoldi += 1;
    else talning.set(lykill, { gerd: t.gerd, heiti, fjoldi: 1 });
  }
  return [...talning.values()].sort((a, b) => {
    const ia = a.gerd ? GERD_ROD.indexOf(a.gerd) : 99;
    const ib = b.gerd ? GERD_ROD.indexOf(b.gerd) : 99;
    if (ia !== ib) return ia - ib;
    return a.heiti.localeCompare(b.heiti, "is");
  });
}

export function kynningarSkrarnafn(titill: string, dags = new Date()): string {
  const safe = (titill || "brunavarnir").replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim() || "brunavarnir";
  return `${safe} — 3D — ${dags.toISOString().slice(0, 10)}.png`;
}

