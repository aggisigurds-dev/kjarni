import type { Metadata } from "next";
import FlokkarClient from "./FlokkarClient";
import "../skraning.css";
import "../vinna/vinna.css";
import "../verk/verk.css";
import "./flokkar.css";

export const metadata: Metadata = {
  title: "Skráning — flokkar, gátlisti og starfsmenn",
  description: "Categories/schema: stærðarflokkar (verðskrárlínur), gátlisti (brunamótstaða, efni) og starfsmannalisti fyrir skráningar.",
};

export default function FlokkarPage() {
  return (
    <div className="aj aj-vinna">
      <header className="aj-top">
        <a className="aj-logo" href="/kjarni/skraning" title="Skráning" aria-label="Skráning"><span>⌂</span></a>
        <nav className="aj-nav" aria-label="Skráning">
          <a href="/kjarni/skraning/yfirsyn">Yfirsýn</a>
          <a href="/kjarni/skraning/greining">Greining</a>
          <a href="/kjarni/skraning">Yfirlit</a>
          <a href="/kjarni/skraning/vinna">Vinna</a>
          <a href="/kjarni/skraning/verk">Byggingar &amp; teikningar</a>
          <a className="on" href="/kjarni/skraning/flokkar">Categories/schema</a>
        </nav>
        <div className="aj-right"><span className="aj-merki">Brunah<i>ó</i>lf</span></div>
      </header>
      <FlokkarClient />
    </div>
  );
}
