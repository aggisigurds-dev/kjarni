import type { Metadata } from "next";
import SkjalarinnClient from "./SkjalarinnClient";

export const metadata: Metadata = {
  title: "Skjalarinn — skjöl · pdf · lestur",
  description:
    "Skjala-verkfæri: PDF-vinnslustöð (sameina, kljúfa, snúa, endurraða, draga út síður) og AI-lestur reikninga beint í Google Sheet. Allt gerist í vafranum — ekkert fer neitt.",
};

export default function SkjalarinnPage() {
  return <SkjalarinnClient />;
}
