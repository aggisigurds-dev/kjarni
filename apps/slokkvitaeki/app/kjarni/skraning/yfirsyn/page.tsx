import type { Metadata } from "next";
import YfirsynClient from "./YfirsynClient";
import "../skraning.css";
import "./yfirsyn.css";

export const metadata: Metadata = {
  title: "Skráning — yfirsýn",
  description: "Yfirsýndarborð: afköst per dag og mánuð, verk, starfsmenn með Tímaveru-tímum, flokkar, aldur opinna punkta.",
};

export default function YfirsynPage() {
  return (
    <div className="aj">
      <header className="aj-top">
        <a className="aj-logo" href="/kjarni" title="Kjarni" aria-label="Kjarni"><span>⌂</span></a>
        <nav className="aj-nav" aria-label="Skráning">
          <a className="on" href="/kjarni/skraning/yfirsyn">Yfirsýn</a>
          <a href="/kjarni/skraning/greining">Greining</a>
          <a href="/kjarni/skraning">Skráning &amp; QA</a>
          <a href="/kjarni/skraning/vinna">Vinna</a>
          <a href="/kjarni/skraning/verk">Byggingar</a>
          <a href="/kjarni/skraning/flokkar">Categories/schema</a>
        </nav>
        <div className="aj-right"><span className="aj-felag">Brunahólf ehf</span><span className="aj-merki">Brunah<i>ó</i>lf</span></div>
      </header>
      <YfirsynClient />
    </div>
  );
}
