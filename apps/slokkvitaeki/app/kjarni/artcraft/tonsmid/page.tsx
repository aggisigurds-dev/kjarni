import type { Metadata } from "next";
import TonsmidClient from "./TonsmidClient";

export const metadata: Metadata = {
  title: "Tónsmíð — Kjarni",
  description: "Semur heilt lag úr texta-prompt-i með ElevenLabs Music á Replicate — jinglar, útvarpsauglýsingar, bakgrunnstónlist.",
};

export default function TonsmidPage() {
  return <TonsmidClient />;
}
