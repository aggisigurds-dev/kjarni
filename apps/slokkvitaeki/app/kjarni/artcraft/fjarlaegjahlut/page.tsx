import type { Metadata } from "next";
import FjarlaegjaHlutClient from "./FjarlaegjaHlutClient";

export const metadata: Metadata = {
  title: "Fjarlægja hlut — Kjarni",
  description: "Málaðu yfir óæskilegan hlut í mynd — AI fjarlægir hann og endurgerir bakgrunninn.",
};

export default function FjarlaegjaHlutPage() {
  return <FjarlaegjaHlutClient />;
}
