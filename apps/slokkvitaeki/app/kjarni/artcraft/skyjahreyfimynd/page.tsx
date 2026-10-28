import type { Metadata } from "next";
import SkyjahreyfimyndClient from "./SkyjahreyfimyndClient";

export const metadata: Metadata = {
  title: "Skýjahreyfimynd — Kjarni",
  description: "Mynd → myndband með Wan 2.2 á Replicate — opin uppspretta úr Alibaba, ~$0.05 per myndband.",
};

export default function SkyjahreyfimyndPage() {
  return <SkyjahreyfimyndClient />;
}
