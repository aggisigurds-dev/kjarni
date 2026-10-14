// OCR rýmismerkingar: vísbendingar um lokuð rými, ekki sjálfkrafa veggir eða hurðir.
// Endurnýtir orð sem lesaTextaTeikningar hefur þegar staðsett í myndhnitum.
import type { OcrWord } from "./firewall-rating";

export type RymisTegund = "wc" | "badherbergi" | "herbergi" | "eldhus" | "geymsla" | "gangur" | "skrifstofa";
export interface RymisVisbending {
  tegund: RymisTegund;
  texti: string;
  x: number;
  y: number;
  confidence: number;
  /** Tillaga, aldrei sjálfvirk staðfesting á heilum veggjum eða hurð. */
  stada: "otadfest";
}

function samraema(texti: string): string {
  return texti.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

const ORÐ: Record<string, RymisTegund> = {
  wc: "wc", salerni: "wc", snyrting: "wc",
  bad: "badherbergi", badherbergi: "badherbergi", bath: "badherbergi",
  herbergi: "herbergi", svefnherbergi: "herbergi",
  eldhus: "eldhus", kitchenette: "eldhus",
  geymsla: "geymsla", geymslur: "geymsla",
  gangur: "gangur", gangr: "gangur",
  skrifstofa: "skrifstofa", skrifstofur: "skrifstofa",
};

/** Staðsettar OCR-vísbendingar; lágmarksöryggi dregur úr misskilningi á málsetningum. */
export function finnaRymisMerkingar(words: OcrWord[], lagmark = 52): RymisVisbending[] {
  return words.flatMap((w) => {
    if (!Number.isFinite(w.confidence) || w.confidence < lagmark || w.width <= 0 || w.height <= 0) return [];
    const tegund = ORÐ[samraema(w.text)];
    if (!tegund) return [];
    return [{
      tegund,
      texti: w.text,
      x: w.x + w.width / 2,
      y: w.y + w.height / 2,
      confidence: w.confidence,
      stada: "otadfest" as const,
    }];
  });
}
