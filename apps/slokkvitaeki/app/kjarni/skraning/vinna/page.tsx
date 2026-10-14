import type { Metadata } from "next";
import VinnaClient from "./VinnaClient";
import "../skraning.css";
import "./vinna.css";

export const metadata: Metadata = {
  title: "Skráning — vinna",
  description: "Vinnuútgáfa Skráningar: veldu byggingu og hæð, settu punkt á teikninguna, mynd, stærð og efni; mynd eftir þéttingu og merkja lokið.",
};

export default function VinnaPage() {
  return (
    <div className="aj aj-vinna">
      <header className="aj-top">
        <a className="aj-logo" href="/kjarni/skraning" title="Skráning" aria-label="Skráning"><span>⌂</span></a>
        <nav className="aj-nav" aria-label="Skráning">
          <a href="/kjarni/skraning">Yfirlit</a>
          <a className="on" href="/kjarni/skraning/vinna">Vinna</a>
        </nav>
        <div className="aj-right"><span className="aj-merki">Brunah<i>ó</i>lf</span></div>
      </header>
      <VinnaClient />
    </div>
  );
}
