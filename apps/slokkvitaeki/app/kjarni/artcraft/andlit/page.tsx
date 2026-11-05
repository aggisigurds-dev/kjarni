import type { Metadata } from "next";
import AndlitClient from "./AndlitClient";

export const metadata: Metadata = {
  title: "Andlit — Kjarni",
  description:
    "InstantID á Replicate: ein andlitsmynd + lýsing → nýjar myndir þar sem sama andlitið birtist í nýju umhverfi, stellingu, stíl.",
};

export default function AndlitPage() {
  return <AndlitClient />;
}
