import type { Metadata } from "next";
import SimiClient from "./SimiClient";

export const metadata: Metadata = {
  title: "Sími → tölva — Kjarni",
  description:
    "Stjórnaðu tölvunni úr símanum: Claude + Desktop Commander fyrir skipanir, RustDesk fyrir skjáinn.",
  robots: { index: false, follow: false },
};

export default function SimiPage() {
  return <SimiClient />;
}
