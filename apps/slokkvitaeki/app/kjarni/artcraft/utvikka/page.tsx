import type { Metadata } from "next";
import UtvikkaClient from "./UtvikkaClient";

export const metadata: Metadata = {
  title: "Útvíkka — Kjarni",
  description:
    "Flux Fill á Replicate: stækkar mynd út fyrir upprunalega rammann — portrait → landscape, þéttur rammi → loft með bakgrunni.",
};

export default function UtvikkaPage() {
  return <UtvikkaClient />;
}
