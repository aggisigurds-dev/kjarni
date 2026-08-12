import type { Metadata } from "next";
import StoreClient from "./StoreClient";

export const metadata: Metadata = {
  title: "Verslun — Slökkvitæki ehf",
  description:
    "Slökkvitæki, eldvarnarteppi, skynjarar, sjúkrabúnaður og fylgihlutir. Prufuverslun keyrð á kjarna.",
};

export default function VerslunPage() {
  return <StoreClient />;
}
