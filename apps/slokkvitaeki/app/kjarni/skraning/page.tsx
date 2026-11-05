import type { Metadata } from "next";
import SkraningClient from "./SkraningClient";
import "./skraning.css";

export const metadata: Metadata = {
  title: "Skráning — Kjarni",
  description:
    "Skráning — brunaþéttingar á verkstöðum: yfirlit yfir öll verk, síur og skýrslur. Eigið kerfi í stað Ajour.",
};

/* Útlitið fylgir Ajour (Agnar 13.10: „keep the same visual theme as ajour") — ljóst, svartur
 * haus með blágrænum virkum flipa, gráir hópar með talningu, grænt Done / gult Created.
 * Þess vegna er StationChrome (dökku skinnin) ekki notað hér; „Kjarni"-hlekkur er í hausnum. */
export default function SkraningPage() {
  return (
    <div className="aj">
      <header className="aj-top">
        <a className="aj-logo" href="/kjarni" title="Kjarni — stjórnstöð" aria-label="Kjarni">
          <span>⌂</span>
        </a>
        <nav className="aj-nav" aria-label="Skráning">
          <a href="/kjarni/skraning/yfirsyn">Yfirsýn</a>
          <a href="/kjarni/skraning/greining">Greining</a>
          <a href="/kjarni">Home</a>
          <a className="on" href="/kjarni/skraning">Skráning &amp; QA</a>
          <a href="/kjarni/turbopaint">TurboPaint</a>
        </nav>
        <div className="aj-right">
          <span className="aj-felag">Brunahólf ehf</span>
          <span className="aj-merki">Brunah<i>ó</i>lf</span>
        </div>
      </header>
      <SkraningClient />
    </div>
  );
}
