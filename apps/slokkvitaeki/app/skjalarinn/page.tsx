import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Skjalarinn — skjöl · pdf · lestur",
  description:
    "Skjala-verkfæri: PDF-vinnslustöð (sameina, kljúfa, snúa, endurraða, draga út síður) og AI-lestur reikninga beint í Google Sheet. Allt gerist í vafranum — ekkert fer neitt.",
};

// Skjalarinn is the full document multitool, served as a self-contained app
// from /public/skjalarinn.html (PDF workbench + AI read/extract). Rendered
// full-viewport so it is a complete website of its own.
export default function SkjalarinnPage() {
  return (
    <iframe
      src="/skjalarinn.html"
      title="Skjalarinn"
      style={{ position: "fixed", inset: 0, width: "100%", height: "100%", border: "none" }}
    />
  );
}
