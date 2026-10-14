import type { Metadata } from "next";
import VerkClient from "./VerkClient";
import "../skraning.css";
import "../vinna/vinna.css";
import "./verk.css";

export const metadata: Metadata = {
  title: "Skráning — byggingar og teikningar",
  description: "Stofna byggingu (verk) og hlaða upp grunnmyndum sem starfsmenn setja punkta á.",
};

export default function VerkPage() {
  return (
    <div className="aj aj-vinna">
      <header className="aj-top">
        <a className="aj-logo" href="/kjarni/skraning" title="Skráning" aria-label="Skráning"><span>⌂</span></a>
        <nav className="aj-nav" aria-label="Skráning">
          <a href="/kjarni/skraning">Yfirlit</a>
          <a href="/kjarni/skraning/vinna">Vinna</a>
          <a className="on" href="/kjarni/skraning/verk">Byggingar &amp; teikningar</a>
        </nav>
        <div className="aj-right"><span className="aj-merki">Brunah<i>ó</i>lf</span></div>
      </header>
      <VerkClient />
    </div>
  );
}
