import type { Metadata } from "next";
import BordClient from "./BordClient";

export const metadata: Metadata = {
  title: "Borð — stjórnborð",
  description:
    "Sérsniðið stjórnborð: draganleg spjöld með lifandi gögnum, tenglum, sjálfvirkni-hnöppum, innfelldum síðum og klukku. Skjár/Sími útlit, aðdráttur og læsing.",
};

export default function BordPage() {
  return <BordClient />;
}
