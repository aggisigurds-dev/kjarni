import type { Metadata } from "next";
import StudioClient from "./StudioClient";

export const metadata: Metadata = {
  title: "Einkastúdíó — Kjarni",
  description:
    "Staðbundin myndgerð í Kjarnanum. Fullorðinsmyndefni leyfilegt. Ekkert sem snýr að börnum.",
  robots: { index: false, follow: false },
};

export default function PrivateStudioPage() {
  return <StudioClient />;
}
