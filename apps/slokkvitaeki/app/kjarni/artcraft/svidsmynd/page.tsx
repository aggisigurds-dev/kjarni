import type { Metadata } from "next";
import SvidsmyndClient from "./SvidsmyndClient";

export const metadata: Metadata = {
  title: "Sviðsmynd — Kjarni",
  description: "Settu vöru í nýtt umhverfi með AI — lýstu senunni, varan sjálf helst óbreytt.",
};

export default function SvidsmyndPage() {
  return <SvidsmyndClient />;
}
