import type { Metadata } from "next";
import ArtCraftHub from "./ArtCraftHub";

export const metadata: Metadata = {
  title: "ArtCraft — Kjarni",
  description:
    "Sjö opin uppspretta sköpunartól frá ArtCraft í Kjarnanum: PhotoCraft, VectorCraft, FilmCraft, LightCraft, PdfCraft, EffectCraft og DesignCraft.",
};

export default function ArtCraftPage() {
  return <ArtCraftHub />;
}
