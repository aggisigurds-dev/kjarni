import type { Metadata } from "next";
import KerfiClient from "./KerfiClient";

export const metadata: Metadata = {
  title: "Kerfi — þjónustukerfi",
  description: "Hreint, þrepaskipt þjónustukerfi — viðskiptavinir, búnaður og skoðanir, með einingum sem kveikt er á eftir þörfum.",
};

export default function KerfiPage() {
  return <KerfiClient />;
}
