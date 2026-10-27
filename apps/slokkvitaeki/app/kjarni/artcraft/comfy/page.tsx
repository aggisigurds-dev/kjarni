import type { Metadata } from "next";
import ComfyClient from "./ComfyClient";

export const metadata: Metadata = {
  title: "ComfyUI — Kjarni",
  description: "Texti → mynd gegnum þitt eigið ComfyUI á vélinni þinni — staðbundið, engin mynd send neitt.",
};

export default function ComfyPage() {
  return <ComfyClient />;
}
