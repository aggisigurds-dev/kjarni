import type { Metadata } from "next";
import SkyjastudioClient from "./SkyjastudioClient";

export const metadata: Metadata = {
  title: "Skýjastúdíó — Kjarni",
  description: "Texti → mynd með Juggernaut XL v7 á Replicate — engin uppsetning, kostar smá upphæð per mynd.",
};

export default function SkyjastudioPage() {
  return <SkyjastudioClient />;
}
