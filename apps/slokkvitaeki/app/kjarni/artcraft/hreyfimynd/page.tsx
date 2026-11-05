import type { Metadata } from "next";
import HreyfimyndClient from "./HreyfimyndClient";

export const metadata: Metadata = {
  title: "Hreyfimynd — Kjarni",
  description: "Mynd → stutt myndband (Wan 2.1) gegnum þitt eigið ComfyUI á vélinni þinni — staðbundið, engin mynd send neitt.",
};

export default function HreyfimyndPage() {
  return <HreyfimyndClient />;
}
