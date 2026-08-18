import type { Metadata } from "next";
import DraftClient from "./DraftClient";

export const metadata: Metadata = {
  title: "Prufusvæði — blokkir, þemu & skikt",
  description:
    "Draft-vinnusvæði til að prófa blokkir, þemu og skikt (útlit) áður en þú gerir alvöru síðu. Ekkert er birt — allt vistast í vafranum.",
};

export default function DraftPage() {
  return <DraftClient />;
}
