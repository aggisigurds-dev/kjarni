import type { Metadata } from "next";
import TolHub from "./TolHub";

export const metadata: Metadata = {
  title: "Sjálfvirk tól — Kjarni",
  description: "Autogenerator tól í Kjarnanum: fjarlægja bakgrunn, hvítur vörubakgrunnur og einkastúdíó.",
};

export default function ArtCraftToolsPage() {
  return <TolHub />;
}
