import type { Metadata } from "next";
import GreiningClient from "./GreiningClient";
import "../skraning.css";
import "./greining.css";

export const metadata: Metadata = {
  title: "Apex Ajour — greining",
  description: "Gagnvirk greining í anda Power BI: samtengd súlurit yfir tíma, verk, starfsmenn, flokka og stöðu með Tímaveru-tímum; smellur síar allt.",
};

export default function GreiningPage() {
  return (
    <div className="aj">
      <header className="aj-top">
        <a className="aj-logo" href="/kjarni" title="Kjarni" aria-label="Kjarni"><span>⌂</span></a>
        <a className="aj-apex" href="/kjarni/skraning" title="Apex Ajour" aria-label="Apex Ajour"><img className="aj-apex-full" src="/apex/apex-ajour-haus.svg" alt="Apex Ajour" /><img className="aj-apex-takn" src="/apex/apex-takn-ljost.svg" alt="" /></a>
        <nav className="aj-nav" aria-label="Apex Ajour">
          <a href="/kjarni/skraning/yfirsyn">Yfirsýn</a>
          <a className="on" href="/kjarni/skraning/greining">Greining</a>
          <a href="/kjarni/skraning/kort">Gatakort</a>
          <a href="/kjarni/skraning/skyrsla">Skýrsla</a>
          <a href="/kjarni/skraning">Skráning &amp; QA</a>
          <a href="/kjarni/skraning/vinna">Vinna</a>
          <a href="/kjarni/skraning/verk">Byggingar</a>
        </nav>
        <div className="aj-right"><span className="aj-felag">Brunahólf ehf</span><span className="aj-merki">Brunah<i>ó</i>lf</span></div>
      </header>
      <GreiningClient />
    </div>
  );
}
