import type { Metadata } from "next";
import BreytaClient from "./BreytaClient";

export const metadata: Metadata = {
  title: "Breyta mynd — Kjarni",
  description: "Þrjú skýja-líkön á Replicate: pro headshot, breyta bakgrunni, hraðvirk multi-image edit.",
};

export default function BreytaPage() {
  return <BreytaClient />;
}
