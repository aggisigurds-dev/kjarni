import type { Metadata } from "next";
import DyptClient from "./DyptClient";

export const metadata: Metadata = {
  title: "Dýpt — Kjarni",
  description:
    "Depth Anything á Replicate: mynd → grátóna dýptarkort. Fyrir fókus-trikk, parallax, eða depth-aware endurlýsingu.",
};

export default function DyptPage() {
  return <DyptClient />;
}
