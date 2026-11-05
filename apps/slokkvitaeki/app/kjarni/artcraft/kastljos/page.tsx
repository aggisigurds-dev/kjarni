import type { Metadata } from "next";
import KastljosClient from "./KastljosClient";

export const metadata: Metadata = {
  title: "Kastljós — Kjarni",
  description:
    "Finnur persónuna í myndinni sjálfkrafa og stillir birtuna sitt í hvoru lagi á henni og bakgrunninum — í vafranum, engin mynd send neitt.",
};

export default function KastljosPage() {
  return <KastljosClient />;
}
