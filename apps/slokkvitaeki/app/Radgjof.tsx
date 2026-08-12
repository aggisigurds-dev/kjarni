"use client";

import { useState } from "react";

type Opt = { k: string; title: string; desc: string; specs: [string, string, string][] };

const OPTS: Opt[] = [
  {
    k: "Heimili",
    title: "6 kg duft + slökkuteppi í eldhús",
    desc: "Eitt fjölnota duftslökkvitæki á hverri hæð og slökkuteppi við eldavélina nær yfir langflest heimilisatvik. Við skoðum tækin á fimm ára fresti og skiptum út því sem er komið á tíma.",
    specs: [["ABC", "Duft 6 kg", "Í forstofu eða gang"], ["TEPPI", "Slökkuteppi", "Við eldavél"], ["QR", "Merking", "Skoðunardagsetning"]],
  },
  {
    k: "Bíll",
    title: "1–2 kg duft í bílinn",
    desc: "Handhægt duftslökkvitæki fest í farþegarými nær eldi í vél og innréttingu áður en hann magnast — og er skylda í atvinnutæki.",
    specs: [["ABC", "Duft 1 kg", "Fest í rými"], ["FEST", "Bílfesting", "Traust festing"], ["QR", "Merking", "Skoðunardagsetning"]],
  },
  {
    k: "Fyrirtæki",
    title: "Kortlagning og reglubundin skoðun",
    desc: "Við förum yfir húsnæðið, veljum réttan búnað eftir áhættu, merkjum allt með QR og höldum utan um árlega skoðun og þrýstiprófun.",
    specs: [["ABC/CO₂", "Blandað", "Eftir rýmum"], ["QR", "Eignayfirlit", "Öll tæki á einum stað"], ["SKOÐUN", "Árlega", "Áminning send"]],
  },
  {
    k: "Skip og bátar",
    title: "Vottaður búnaður fyrir sjó",
    desc: "Slökkvitæki, festingar og teppi samkvæmt kröfum fyrir skip — með skoðun og vottorðum sem standast úttekt.",
    specs: [["ABC", "Duft", "Vottað"], ["FEST", "Skipafesting", "Svört"], ["VOTTORÐ", "Skoðun", "Fyrir úttekt"]],
  },
];

export function Radgjof() {
  const [i, setI] = useState(0);
  const o = OPTS[i];
  return (
    <div className="rd-adv">
      <div className="rd-tabs">
        {OPTS.map((x, xi) => (
          <button key={x.k} className={`rd-tab ${i === xi ? "on" : ""}`} onClick={() => setI(xi)}>
            {x.k}
          </button>
        ))}
      </div>
      <div className="rd-reco">
        <span className="rd-ey">Mælt með fyrir {o.k.toLowerCase()}</span>
        <h3>{o.title}</h3>
        <p>{o.desc}</p>
        <div className="rd-specs">
          {o.specs.map((s, si) => (
            <div className="rd-spec" key={si}>
              <span className="k">{s[0]}</span>
              <b>{s[1]}</b>
              <span>{s[2]}</span>
            </div>
          ))}
        </div>
        <a className="rd-btn rd-btn-org" href="#hafa-samband">Fá tilboð fyrir {o.k.toLowerCase()}</a>
      </div>
    </div>
  );
}
