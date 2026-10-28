import type { Metadata } from "next";
import VinnslurClient from "./VinnslurClient";

export const metadata: Metadata = {
  title: "Verkbók — Kjarni",
  description: "Allar pending Replicate-vinnslur og vistaðar útkomur á einum stað. Opnaðu úr Verkbók beint í tólið.",
};

export default function VinnslurPage() {
  return <VinnslurClient />;
}
