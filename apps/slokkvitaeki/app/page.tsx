import { Banner } from "./Banner";
import { ContactForm } from "./ContactForm";
import { RdNav } from "./RdNav";
import { Radgjof } from "./Radgjof";

const TICKER = [
  "Skoðun um allt land",
  "Löggilt þrýstiprófun",
  "Frí heimsending á höfuðborgarsvæðinu í þessari viku",
  "QR-merking fylgir hverju tæki",
];

const SERVICES = [
  ["Skoðun & árseftirlit", "Lögbundin skoðun og þrýstiprófun slökkvitækja, með fullum rekjanleika á hverju einasta tæki."],
  ["Sala á búnaði", "Slökkvitæki, slökkuteppi, brunaslöngur og fylgihlutir fyrir heimili, fyrirtæki og skip."],
  ["QR-merkingar", "Hvert tæki fær QR-merki — skannaðu og sérð sögu, staðsetningu og næstu skoðun samstundis."],
  ["Þjónusta á vettvangi", "Við komum á staðinn, kortleggjum tækin og höldum brunavörnunum í lagi — um allt land."],
];

const PRODUCTS = [
  { tag: "ABC", name: "Duftslökkvitæki", desc: "Fjölnota tæki sem ræður við flesta bruna — í bíl, á heimili og vinnustað.", verd: "frá 8.500 kr", img: "/vorur/12.jpg" },
  { tag: "CO₂", name: "Kolsýruslökkvitæki", desc: "Fyrir rafmagn og viðkvæman búnað þar sem duft á ekki við.", verd: "frá 16.500 kr", img: "/vorur/2.jpg" },
  { tag: "H₂O", name: "Léttvatnsslökkvitæki", desc: "Öflug lausn fyrir A-flokks elda í föstum efnum.", verd: "frá 11.500 kr", img: "/vorur/174.jpg" },
  { tag: "TEPPI", name: "Slökkuteppi", desc: "Fljótleg fyrstu viðbrögð við eldi í eldhúsi og smærri rýmum.", verd: "frá 4.328 kr", img: "/vorur/4.jpg" },
];

const FEATURES = [
  ["Saga á hverju tæki", "Hvert tæki er skráð og merkt — þú veist alltaf hvenær það var skoðað og hvenær næst."],
  ["Áminning fyrir skoðun", "Við látum vita áður en tækin falla á tíma, í stað þess að úttektin geri það."],
  ["Yfirlit fyrir úttekt", "Sækja má stöðuna á öllum tækjum á einum stað þegar eftirlitið mætir."],
];

const YFIRLIT: [string, string, string, string, string][] = [
  ["ABC", "Skrifstofa · 2. hæð", "SLT-0421-HF", "Í lagi", "ok"],
  ["CO₂", "Tölvurými", "SLT-0422-HF", "Í lagi", "ok"],
  ["ABC", "Lager · inngangur", "SLT-0430-HF", "Skoðun eftir 30 d.", "warn"],
  ["TEPPI", "Kaffistofa", "SLT-0433-HF", "Komið á tíma", "late"],
];

const TRUST = [
  ["Rekjanleiki", "Saga á hverju tæki", "Hvert tæki er skráð og merkt — þú veist alltaf hvenær það var skoðað og hvenær næst."],
  ["Um allt land", "Þjónusta á staðnum", "Við mætum þangað sem tækin eru og höldum brunavörnunum í lagi, hvar sem er."],
  ["Löggilt", "Skoðun eftir reglum", "Skoðun og þrýstiprófun samkvæmt kröfum — svo þú standist úttekt áhyggjulaus."],
];

export default function Home() {
  return (
    <main className="rd">
      <Banner />

      <div className="rd-ticker">
        <div className="rd-ticker-track">
          {[...TICKER, ...TICKER].map((t, i) => (
            <span key={i}>◆ {t}</span>
          ))}
        </div>
      </div>

      <RdNav />

      {/* hero */}
      <section className="rd-hero" id="top">
        <div className="rd-wrap">
          <div className="rd-hero-in">
            <div>
              <span className="rd-pill">Brunavarnir · Skoðun · Sala · Þjónusta</span>
              <h1>Brunavarnir í öruggum höndum</h1>
              <p className="rd-hero-lede">
                Við skoðum, þjónustum og seljum slökkvitæki og brunavarnabúnað — með fullum
                rekjanleika, QR-merkingum og þjónustu á vettvangi um allt land.
              </p>
              <div className="rd-hero-cta">
                <a className="rd-btn rd-btn-org" href="/verslun">Skoða verslun</a>
                <a className="rd-btn rd-btn-ghost" href="#hafa-samband">Bóka skoðun</a>
              </div>
              <div className="rd-stats">
                <div className="rd-stat"><b>12.400</b><span>Tæki í eftirliti</span></div>
                <div className="rd-stat"><b>380</b><span>Fyrirtæki í þjónustu</span></div>
                <div className="rd-stat"><b>25</b><span>Ár í faginu</span></div>
              </div>
            </div>

            <div className="rd-device">
              <div className="rd-device-top">
                <span className="lbl">Skannað tæki</span>
                <span className="rd-tag-green">Í lagi</span>
              </div>
              <h3>Duft 6 kg · ABC</h3>
              <span className="code">SLT-0421-HF · Skrifstofa, 2. hæð</span>
              <div className="rd-timeline">
                <div className="rd-tl"><span className="d">04.2026</span><div><b>Árleg skoðun — í lagi</b><span>Agnar · Slökkvitæki ehf.</span></div></div>
                <div className="rd-tl"><span className="d">03.2025</span><div><b>Þrýstiprófun</b><span>Verkstæði · vottorð útgefið</span></div></div>
                <div className="rd-tl"><span className="d">11.2023</span><div><b>Uppsetning og merking</b><span>QR-merki SLT-0421-HF</span></div></div>
                <div className="rd-tl next"><span className="d">04.2027</span><div><b>Næsta skoðun</b></div></div>
              </div>
              <div className="rd-qr">
                <span className="rd-qr-code" aria-hidden="true" />
                <div><b>Skannaðu merkið</b><span>Öll saga tækisins á 2 sek.</span></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* services */}
      <section className="rd-sec rd-cream" id="thjonusta">
        <div className="rd-wrap">
          <div className="rd-sec-head split">
            <div>
              <p className="rd-ey">Þjónusta</p>
              <h2>Allt sem brunavarnir þurfa</h2>
            </div>
            <p className="rd-sub">Frá árlegri skoðun til nýrra tækja — ein þjónusta heldur utan um brunavarnirnar þínar.</p>
          </div>
          <div className="rd-grid4">
            {SERVICES.map(([t, d], i) => (
              <article className="rd-num" key={i}>
                <span className="n">{String(i + 1).padStart(2, "0")}</span>
                <h3>{t}</h3>
                <p>{d}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* advisor */}
      <section className="rd-sec rd-cream" style={{ paddingTop: 0 }}>
        <div className="rd-wrap">
          <div className="rd-sec-head">
            <p className="rd-ey">Ráðgjöf</p>
            <h2>Finndu rétta tækið</h2>
            <p className="rd-sub">Veldu rýmið og við sýnum hvað á að vera til staðar — og hvað lögin gera ráð fyrir.</p>
          </div>
          <Radgjof />
        </div>
      </section>

      {/* qr system */}
      <section className="rd-sec rd-cream" id="qr">
        <div className="rd-wrap">
          <div className="rd-sec-head">
            <p className="rd-ey">QR-kerfið</p>
            <h2>Rekjanleiki, ekki bara skoðun</h2>
            <p className="rd-sub">Hvert tæki er skráð og merkt — þú veist alltaf hvenær það var skoðað og hvenær næst. Enginn möppuleikur fyrir úttekt.</p>
          </div>
          <div className="rd-qsys">
            <div>
              {FEATURES.map(([t, d], i) => (
                <div className="rd-feat" key={i}>
                  <span className="sq" aria-hidden="true" />
                  <div><b>{t}</b><p>{d}</p></div>
                </div>
              ))}
            </div>
            <div className="rd-yfirlit">
              <div className="rd-yfirlit-top"><b>Eignayfirlit</b><span>14 tæki · 3 staðir</span></div>
              {YFIRLIT.map(([ico, nafn, code, st, cls], i) => (
                <div className="rd-row" key={i}>
                  <span className="ico">{ico}</span>
                  <div><b>{nafn}</b><div className="code">{code}</div></div>
                  <span className={`rd-st ${cls}`}>{st}</span>
                </div>
              ))}
              <div className="rd-yfirlit-foot">
                <span>Yfirlit sent á tölvupósti fyrir hverja úttekt</span>
                <a href="#hafa-samband">Opna →</a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* trust */}
      <section className="rd-sec rd-cream" id="afhverju" style={{ paddingTop: 0 }}>
        <div className="rd-wrap">
          <div className="rd-trust">
            {TRUST.map(([ey, t, d], i) => (
              <div key={i}>
                <p className="rd-ey">{ey}</p>
                <h3>{t}</h3>
                <p>{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* products */}
      <section className="rd-sec rd-navys" id="vorur">
        <div className="rd-wrap">
          <div className="rd-sec-head">
            <p className="rd-ey">Vörur</p>
            <h2 style={{ color: "#fff" }}>Rétt tæki fyrir hvern eld</h2>
            <p className="rd-sub">Við aðstoðum þig að velja réttan búnað eftir rými og áhættu — og merkjum hann með QR svo eftirlitið sé einfalt.</p>
          </div>
          <div className="rd-grid4">
            {PRODUCTS.map((p) => (
              <article className="rd-prod" key={p.name}>
                <div className="rd-prod-img" style={{ background: "#fff" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.img} alt={p.name} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", padding: "14px" }} />
                </div>
                <div className="rd-prod-b">
                  <span className="rd-prod-tag">{p.tag}</span>
                  <h3>{p.name}</h3>
                  <p>{p.desc}</p>
                  <div className="rd-prod-foot">
                    <span className="pr">{p.verd}</span>
                    <a href="/verslun">Skoða →</a>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* cta */}
      <section className="rd-sec rd-ctasec" id="hafa-samband">
        <div className="rd-wrap rd-in">
          <div>
            <h2>Tökum stöðuna á brunavörnunum þínum</h2>
            <p className="rd-sub">Hafðu samband og við finnum réttu lausnina fyrir heimilið eða fyrirtækið.</p>
            <a className="rd-btn rd-btn-light" href="tel:5654080">Hringdu · 565-4080</a>
            <p className="addr">Helluhraun 10, 220 Hafnarfirði · Kt. 600508-0400</p>
          </div>
          <div className="rd-formcard">
            <ContactForm />
          </div>
        </div>
      </section>

      {/* footer */}
      <footer className="rd-foot">
        <div className="rd-wrap">
          <div className="rd-foot-top">
            <div>
              <a className="rd-brand" href="/">
                <span className="rd-badge">B</span>
                <span className="rd-brand-name">Brunahólf</span>
              </a>
              <div className="rd-foot-meta">
                Helluhraun 10, 220 Hafnarfirði · 565-4080
                <br />
                Kt. 600508-0400 · Brunavarnir · Skoðun · Sala
              </div>
            </div>
            <div className="rd-foot-col">
              <span className="h">Þjónusta</span>
              <a href="#thjonusta">Skoðun</a>
              <a href="/verslun">Verslun</a>
              <a href="#qr">QR-merkingar</a>
            </div>
            <div className="rd-foot-col">
              <span className="h">Fyrirtækið</span>
              <a href="#afhverju">Af hverju við</a>
              <a href="#hafa-samband">Hafa samband</a>
            </div>
          </div>
          <div className="rd-foot-bottom">
            <span>© 2026 Slökkvitæki ehf.</span>
            <span>Í rúmgerð · keyrt á kjarna</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
