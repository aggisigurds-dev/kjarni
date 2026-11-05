import type { Metadata } from "next";
import EndurljosClient from "./EndurljosClient";

export const metadata: Metadata = {
  title: "Endurljós — Kjarni",
  description:
    "IC-Light á Replicate: endurlýsa persónu eða vöru með texta + ljósastefnu (vinstri/hægri/efst/neðst). Depth-aware að innan.",
};

export default function EndurljosPage() {
  return <EndurljosClient />;
}
