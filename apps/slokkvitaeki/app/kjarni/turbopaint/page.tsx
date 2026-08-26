import type { Metadata } from "next";
import TurboPaintClient from "./TurboPaintClient";

export const metadata: Metadata = {
  title: "TurboPaint — Kjarni",
  description:
    "TurboPaint — sjálfstætt hvítu borð á Kjarni. Flyttu inn PDF og TIF, merktu gólfplön og flyttu út í háum gæðum.",
};

export default function TurboPaintPage() {
  return <TurboPaintClient />;
}
