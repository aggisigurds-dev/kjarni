import type { Metadata } from "next";
import StjornClient from "./StjornClient";

export const metadata: Metadata = {
  title: "Stjórnborð — Brunahólf Slökkvitæki",
  robots: { index: false, follow: false },
};

export default function StjornPage() {
  return <StjornClient />;
}
