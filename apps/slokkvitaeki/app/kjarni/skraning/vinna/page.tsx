import type { Metadata } from "next";
import VinnaClient from "./VinnaClient";
import "../skraning.css";
import "./vinna.css";

export const metadata: Metadata = {
  title: "Skráning — vinna",
  description: "Vinnuútgáfa Skráningar: veldu byggingu og hæð, settu punkt á teikninguna, mynd, stærð og efni; mynd eftir þéttingu og merkja lokið.",
  // „Bæta á heimaskjá" í síma — opnast sem app án vafrastiku
  manifest: "/skraning/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Skráning", statusBarStyle: "black" },
  icons: { icon: "/skraning/icon-192.png", apple: "/skraning/icon-192.png" },
};
export const viewport = { themeColor: "#1e1e1e", width: "device-width", initialScale: 1 };

export default function VinnaPage() {
  return (
    <div className="aj aj-vinna">
      <header className="aj-top">
        <a className="aj-logo" href="/kjarni/skraning" title="Skráning" aria-label="Skráning"><span>⌂</span></a>
        <nav className="aj-nav" aria-label="Skráning">
          <a href="/kjarni/skraning/yfirsyn">Yfirsýn</a>
          <a href="/kjarni/skraning/greining">Greining</a>
          <a href="/kjarni/skraning">Yfirlit</a>
          <a className="on" href="/kjarni/skraning/vinna">Vinna</a>
        </nav>
        <div className="aj-right"><span className="aj-merki">Brunah<i>ó</i>lf</span></div>
      </header>
      <VinnaClient />
    </div>
  );
}
