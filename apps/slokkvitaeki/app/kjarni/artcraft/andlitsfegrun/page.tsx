import type { Metadata } from "next";
import AndlitsfegrunClient from "./AndlitsfegrunClient";

export const metadata: Metadata = {
  title: "Andlitsfegrun — Kjarni",
  description: "Náttúrulegt portrett-retouch — jöfn húð, bletti burt, hvítari tennur, í vafranum.",
};

export default function AndlitsfegrunPage() {
  return <AndlitsfegrunClient />;
}
