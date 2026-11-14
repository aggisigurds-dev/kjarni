import type { Metadata } from "next";
import VerkClient from "./VerkClient";
import "../skraning.css";
import "../vinna/vinna.css";
import "./verk.css";

export const metadata: Metadata = {
  title: "Apex Ajour — byggingar og teikningar",
  description: "Stofna byggingu (verk) og hlaða upp grunnmyndum sem starfsmenn setja punkta á.",
};

export default function VerkPage() {
  return (
    <div className="aj aj-vinna">
      <header className="aj-top">
        <a className="aj-logo" href="/kjarni/skraning" title="Skráning" aria-label="Apex Ajour"><span>⌂</span></a>
        <a className="aj-apex" href="/kjarni/skraning" title="Apex Ajour" aria-label="Apex Ajour"><img className="aj-apex-full" src="/apex/apex-ajour-haus.svg" alt="Apex Ajour" /><img className="aj-apex-takn" src="/apex/apex-takn-ljost.svg" alt="" /></a>
        <nav className="aj-nav" aria-label="Skráning">
          <a href="/kjarni/skraning/yfirsyn">Yfirsýn</a>
          <a href="/kjarni/skraning/greining">Greining</a>
          <a href="/kjarni/skraning/kort">Gatakort</a>
          <a href="/kjarni/skraning/skyrsla">Skýrsla</a>
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
