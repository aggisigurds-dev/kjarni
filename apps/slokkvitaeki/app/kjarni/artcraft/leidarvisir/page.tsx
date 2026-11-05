import type { Metadata } from "next";
import LeidarvisirClient from "./LeidarvisirClient";

export const metadata: Metadata = {
  title: "Leiðarvísir — ArtCraft — Kjarni",
  description: "Skref-fyrir-skref leiðbeiningar fyrir öll sjö ArtCraft-myndvinnslutólin, með skjáskotum af alvöru viðmótinu.",
};

export default function LeidarvisirPage() {
  return <LeidarvisirClient />;
}
