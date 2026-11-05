import type { Metadata } from "next";
import PrentaClient from "./PrentaClient";
import "../skraning.css";
import "./prenta.css";

export const metadata: Metadata = {
  title: "Skráning — prenta teikningu",
  description: "Hæðarskýrsla: teikning með pinnum og tafla yfir skráningar — prentast / vistast sem PDF úr vafranum.",
};

export default function PrentaPage() {
  return <PrentaClient />;
}
