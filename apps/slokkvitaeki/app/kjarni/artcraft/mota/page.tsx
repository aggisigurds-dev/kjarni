import type { Metadata } from "next";
import MotaClient from "./MotaClient";

export const metadata: Metadata = {
  title: "Móta — Kjarni",
  description: "Mjókka, þenja eða draga líkamslínur með bursta — í vafranum, engin mynd send neitt.",
};

export default function MotaPage() {
  return <MotaClient />;
}
