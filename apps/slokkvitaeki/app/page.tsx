import { Logo } from "./Logo";
import { Banner } from "./Banner";
import { ContactForm } from "./ContactForm";
import { SiteHeader } from "./SiteHeader";

const services = [
  {
    ico: "🧯",
    title: "Skoðun & árseftirlit",
    text: "Lögbundin skoðun og þrýstiprófun slökkvitækja, með fullum rekjanleika á hverju einasta tæki.",
  },
  {
    ico: "🛒",
    title: "Sala á búnaði",
    text: "Slökkvitæki, slökkuteppi, brunaslöngur og fylgihlutir fyrir heimili, fyrirtæki og skip.",
  },
  {
    ico: "🏷️",
    title: "QR-merkingar",
    text: "Hvert tæki fær QR-merki — skannaðu og sérð sögu, staðsetningu og næstu skoðun samstundis.",
  },
  {
    ico: "🚐",
    title: "Þjónusta á vettvangi",
    text: "Við komum á staðinn, kortleggjum tækin og höldum brunavörnunum í lagi — um allt land.",
  },
];

const products = [
  { tag: "ABC", title: "Duftslökkvitæki", text: "Fjölnota tæki sem ræður við flesta bruna — í bíl, á heimili og vinnustað." },
  { tag: "CO₂", title: "Kolsýruslökkvitæki", text: "Fyrir rafmagn og viðkvæman búnað þar sem duft á ekki við." },
  { tag: "H₂O", title: "Léttvatnsslökkvitæki", text: "Öflug lausn fyrir A-flokks elda í föstum efnum." },
  { tag: "★", title: "Slökkuteppi", text: "Fljótleg fyrstu viðbrögð við eldi í eldhúsi og smærri rýmum." },
];

export default function Home() {
  return (
    <main>
      <Banner />
      <SiteHeader />

      <section className="hero" id="top">
        <div className="container hero-inner">
          <p className="eyebrow">Brunavarnir · Skoðun · Sala · Þjónusta</p>
          <h1>Brunavarnir í öruggum höndum</h1>
          <p className="hero-lede">
            Við skoðum, þjónustum og seljum slökkvitæki og brunavarnabúnað — með fullum
            rekjanleika, QR-merkingum og þjónustu á vettvangi um allt land.
          </p>
          <div className="hero-cta">
            <a className="btn" href="/verslun">Skoða verslun</a>
            <a className="btn btn-ghost" href="#hafa-samband">Hafðu samband</a>
          </div>
        </div>
      </section>

      <section className="section" id="thjonusta">
        <div className="container">
          <p className="section-eyebrow">Þjónusta</p>
          <h2 className="section-title">Allt sem brunavarnir þurfa</h2>
          <p className="section-sub">
            Frá árlegri skoðun til nýrra tækja — ein þjónusta heldur utan um brunavarnirnar þínar.
          </p>
          <div className="grid grid-4">
            {services.map((s) => (
              <article className="card" key={s.title}>
                <span className="ico" aria-hidden="true">{s.ico}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-dark" id="vorur">
        <div className="container">
          <p className="section-eyebrow">Vörur</p>
          <h2 className="section-title">Rétt tæki fyrir hvern eld</h2>
          <p className="section-sub">
            Við aðstoðum þig að velja réttan búnað eftir rými og áhættu — og merkjum hann með QR svo
            eftirlitið sé einfalt.
          </p>
          <div className="grid grid-4">
            {products.map((p) => (
              <article className="pcard" key={p.title}>
                <span className="tag">{p.tag}</span>
                <h3>{p.title}</h3>
                <p>{p.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="afhverju">
        <div className="container">
          <p className="section-eyebrow">Af hverju við</p>
          <h2 className="section-title">Rekjanleiki, ekki bara skoðun</h2>
          <div className="features">
            <div className="feature">
              <span className="k">Rekjanleiki</span>
              <h3>Saga á hverju tæki</h3>
              <p>Hvert tæki er skráð og merkt — þú veist alltaf hvenær það var skoðað og hvenær næst.</p>
            </div>
            <div className="feature">
              <span className="k">Um allt land</span>
              <h3>Þjónusta á staðnum</h3>
              <p>Við mætum þangað sem tækin eru og höldum brunavörnunum í lagi, hvar sem er.</p>
            </div>
            <div className="feature">
              <span className="k">Löggilt</span>
              <h3>Skoðun eftir reglum</h3>
              <p>Skoðun og þrýstiprófun samkvæmt kröfum — svo þú standist úttekt áhyggjulaus.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="cta" id="hafa-samband">
        <div className="container">
          <h2>Tökum stöðuna á brunavörnunum þínum</h2>
          <p>Hafðu samband og við finnum réttu lausnina fyrir heimilið eða fyrirtækið.</p>
          <a className="btn" href="tel:5654080">Hringdu · 565-4080</a>
          <p style={{ marginTop: 16, opacity: 0.85, fontSize: "0.95rem" }}>
            Helluhraun 10, 220 Hafnarfirði · Kt 600508-0400
          </p>
          <div className="cta-form">
            <ContactForm />
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <div className="container footer-inner">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Logo light />
            <div className="footer-meta">
              Helluhraun 10, 220 Hafnarfirði · 565-4080
              <br />
              Kt 600508-0400 · Brunavarnir · Skoðun · Sala
            </div>
          </div>
          <span className="footer-badge">Frumgerð · keyrt á kjarna</span>
        </div>
      </footer>
    </main>
  );
}
