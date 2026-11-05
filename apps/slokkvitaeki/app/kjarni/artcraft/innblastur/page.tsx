import type { Metadata } from "next";
import InnblasturClient from "./InnblasturClient";

export const metadata: Metadata = {
  title: "Innblástur — Kjarni",
  description:
    "Flux Redux á Replicate: innblástursmynd → 1–4 nýjar afbrigði með svipaðan stíl/lit/samsetningu.",
};

export default function InnblasturPage() {
  return <InnblasturClient />;
}
