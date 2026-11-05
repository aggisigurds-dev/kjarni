import type { Metadata } from "next";
import OfficeCraftHub from "./OfficeCraftHub";

export const metadata: Metadata = {
  title: "OfficeCraft — Kjarni",
  description:
    "Skrifstofuforritin í Kjarnanum: WordCraft, GridCraft, DeckCraft, PdfCraft, CADCraft, FigCraft, VectorCraft og SoundCraft — opin uppspretta, í vafranum.",
};

export default function OfficeCraftPage() {
  return <OfficeCraftHub />;
}
