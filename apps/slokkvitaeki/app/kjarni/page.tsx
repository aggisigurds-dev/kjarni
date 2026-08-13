import type { Metadata } from "next";
import MasterClient from "./MasterClient";

export const metadata: Metadata = {
  title: "Kjarni — Stjórnstöð",
  description: "Master-bakendi kjarni-platformsins — allir vefir og kerfi á einum stað.",
};

export default function KjarniPage() {
  return <MasterClient />;
}
