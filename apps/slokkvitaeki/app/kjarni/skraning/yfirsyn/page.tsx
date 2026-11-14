import type { Metadata } from "next";
import YfirsynClient from "./YfirsynClient";
import "../skraning.css";
import "./yfirsyn.css";

export const metadata: Metadata = {
  title: "Apex Ajour — yfirsýn",
  description: "Yfirsýndarborð: afköst per dag og mánuð, verk, starfsmenn með Tímaveru-tímum, flokkar, aldur opinna punkta.",
};

export default function YfirsynPage() {
  return (
    <div className="aj">
      <header className="aj-top">
        <a className="aj-logo" href="/kjarni" title="Kjarni" aria-label="Kjarni"><span>⌂</span></a>
        <a className="aj-apex" href="/kjarni/skraning" title="Apex Ajour" aria-label="Apex Ajour"><img className="aj-apex-full" src="/apex/apex-ajour-haus.svg" alt="Apex Ajour" /><img className="aj-apex-takn" src="/apex/apex-takn-ljost.svg" alt="" /></a>
        <nav className="aj-nav" aria-label="Apex Ajour">
          <a className="on" href="/kjarni/skraning/yfirsyn">Yfirsýn</a>
          <a href="/kjarni/skraning/greining">Greining</a>
          <a href="/kjarni/skraning/kort">Gatakort</a>
          <a href="/kjarni/skraning/skyrsla">Skýrsla</a>
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
