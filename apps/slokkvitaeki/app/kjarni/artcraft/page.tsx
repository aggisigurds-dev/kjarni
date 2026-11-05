import type { Metadata } from "next";
import ArtCraftHub from "./ArtCraftHub";

export const metadata: Metadata = {
  title: "ArtCraft — Kjarni",
  description:
    "Opin sköpunartól frá ArtCraft í Kjarnanum: PhotoCraft, FilmCraft, LightCraft, EffectCraft og DesignCraft, ásamt Móta-ritlinum og skýjatólunum.",
};

export default function ArtCraftPage() {
  return <ArtCraftHub />;
}
