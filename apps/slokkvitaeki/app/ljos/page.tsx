import type { Metadata } from "next";
import LjosClient from "./LjosClient";

export const metadata: Metadata = {
  title: "Ljós — Langamýri 22",
  description: "Ljósastýring fyrir Langamýri 22 (Philips Hue í gegnum skýið).",
  robots: { index: false, follow: false },
};

export default function LjosPage() {
  return <LjosClient />;
}
