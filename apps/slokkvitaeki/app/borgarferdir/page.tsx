import type { Metadata } from "next";
import BorgarferdirClient from "./BorgarferdirClient";

export const metadata: Metadata = {
  title: "Borgarferðir — Manchester · Glasgow",
  description:
    "Flugleit og bestu pakkarnir í nóvember til Manchester og Glasgow fyrir 3 fullorðna og eitt barn: flug, töskur og hótel reiknað saman, með tenglum á lifandi verð.",
};

export default function BorgarferdirPage() {
  return <BorgarferdirClient />;
}
