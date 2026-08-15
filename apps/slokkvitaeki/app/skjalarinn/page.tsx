import type { Metadata } from "next";
import SkjalarinnClient from "./SkjalarinnClient";

export const metadata: Metadata = {
  title: "Skjalarinn — skjöl, pdf & skrár",
  description: "Sjálfstætt skjala-, PDF- og skráaskipulagstól á kjarni — hlaða upp, flokka, leita og opna.",
};

export default function SkjalarinnPage() {
  return <SkjalarinnClient />;
}
