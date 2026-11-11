import type { Metadata } from "next";
import SkyrslaClient from "./SkyrslaClient";
import "../skraning.css";
import "./skyrsla.css";

export const metadata: Metadata = {
  title: "Skráning — stöðuskýrsla",
  description: "Stöðuskýrsla: staða verks per hæð og deild með tölum og prósentum og samanburður við upprunalegt útboð; markmið, magn og athugasemdir eru breytanleg og vistast.",
};

export default function SkyrslaPage() {
  return (
    <div className="aj">
      <header className="aj-top">
        <a className="aj-logo" href="/kjarni" title="Kjarni" aria-label="Kjarni"><span>⌂</span></a>
        <nav className="aj-nav" aria-label="Skráning">
          <a href="/kjarni/skraning/yfirsyn">Yfirsýn</a>
          <a href="/kjarni/skraning/greining">Greining</a>
          <a href="/kjarni/skraning/kort">Gatakort</a>
          <a className="on" href="/kjarni/skraning/skyrsla">Skýrsla</a>
          <a href="/kjarni/skraning">Skráning &amp; QA</a>
          <a href="/kjarni/skraning/vinna">Vinna</a>
          <a href="/kjarni/skraning/verk">Byggingar</a>
          <a href="/kjarni/skraning/flokkar">Categories/schema</a>
        </nav>
        <div className="aj-right"><span className="aj-felag">Brunahólf ehf</span><span className="aj-merki">Brunah<i>ó</i>lf</span></div>
      </header>
      <SkyrslaClient />
    </div>
  );
}
