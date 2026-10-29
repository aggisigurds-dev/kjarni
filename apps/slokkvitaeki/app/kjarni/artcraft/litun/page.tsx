import type { Metadata } from "next";
import LitunClient from "./LitunClient";

export const metadata: Metadata = {
  title: "Litun — Kjarni",
  description:
    "DDColor á Replicate: litar svart/hvítt myndir. Fyrir gamlar skoðunarmyndir, archive-ljósmyndir, svarthvítar vörumyndir.",
};

export default function LitunPage() {
  return <LitunClient />;
}
