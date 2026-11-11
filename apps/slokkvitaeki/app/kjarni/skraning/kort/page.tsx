import type { Metadata } from "next";
import KortClient from "./KortClient";
import "../skraning.css";
import "./kort.css";

export const metadata: Metadata = {
  title: "Skráning — gatakort",
  description: "Gatakort: skráningar á brunayfirlitsteikningu með lögum (fagteikningar, áætluð göt) og síum eftir deild, tegund, stöðu, starfsmanni, tímabili og lagfæringum.",
};

export default function KortPage() {
  return (
    <div className="aj">
      <header className="aj-top">
        <a className="aj-logo" href="/kjarni" title="Kjarni" aria-label="Kjarni"><span>⌂</span></a>
        <nav className="aj-nav" aria-label="Skráning">
          <a href="/kjarni/skraning/yfirsyn">Yfirsýn</a>
          <a href="/kjarni/skraning/greining">Greining</a>
          <a className="on" href="/kjarni/skraning/kort">Gatakort</a>
          <a href="/kjarni/skraning/skyrsla">Skýrsla</a>
          <a href="/kjarni/skraning">Skráning &amp; QA</a>
          <a href="/kjarni/skraning/vinna">Vinna</a>
          <a href="/kjarni/skraning/verk">Byggingar</a>
          <a href="/kjarni/skraning/flokkar">Categories/schema</a>
        </nav>
        <div className="aj-right"><span className="aj-felag">Brunahólf ehf</span><span className="aj-merki">Brunah<i>ó</i>lf</span></div>
      </header>
      <KortClient />
    </div>
  );
}
