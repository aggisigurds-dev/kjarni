import type { Metadata } from "next";
import VidgerdClient from "./VidgerdClient";

export const metadata: Metadata = {
  title: "Ljósmyndaviðgerð — Kjarni",
  description:
    "Laga óskýr andlit, rauð augu og áferð á myndum — staðbundið á þinni eigin vél, ekkert sent í skýið.",
};

export default function VidgerdPage() {
  return <VidgerdClient />;
}
