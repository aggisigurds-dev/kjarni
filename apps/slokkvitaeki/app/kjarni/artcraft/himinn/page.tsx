import type { Metadata } from "next";
import HiminnClient from "./HiminnClient";

export const metadata: Metadata = {
  title: "Himinn — Kjarni",
  description: "Málaðu yfir himininn og lýstu nýjum — AI setur hann inn, restin helst óbreytt.",
};

export default function HiminnPage() {
  return <HiminnClient />;
}
