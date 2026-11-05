import type { Metadata } from "next";
import MotaClient from "./MotaClient";

export const metadata: Metadata = {
  title: "Móta — Kjarni",
  description: "Myndritill í vafranum: líkamsmótun, mótunarbursti, lagfæringar, ljós og litir — engin mynd send neitt.",
};

export default function MotaPage() {
  return <MotaClient />;
}
