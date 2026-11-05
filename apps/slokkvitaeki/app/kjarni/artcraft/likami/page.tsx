import type { Metadata } from "next";
import LikamiClient from "./LikamiClient";

export const metadata: Metadata = {
  title: "Líkamsmótun — Kjarni",
  description: "Mitti, mjaðmir, axlir, fótleggir og höfuð með sleðum — líkaminn fundinn sjálfkrafa, allt í vafranum.",
};

export default function LikamiPage() {
  return <LikamiClient />;
}
