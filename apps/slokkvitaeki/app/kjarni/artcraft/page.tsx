import type { Metadata } from "next";
import ArtCraftHub from "./ArtCraftHub";

export const metadata: Metadata = {
  title: "ArtCraft — Kjarni",
  description:
    "13 opin uppspretta sköpunartól frá ArtCraft í Kjarnanum: PhotoCraft, VectorCraft, FilmCraft, LightCraft, PdfCraft, EffectCraft, DesignCraft, FigCraft, WordCraft, SoundCraft, DeckCraft, CADCraft og GridCraft.",
};

export default function ArtCraftPage() {
  return <ArtCraftHub />;
}
