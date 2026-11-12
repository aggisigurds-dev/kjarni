"use client";

/* Stöðuskýrsla — „Efni og kerfi“ og „Verkferli“ (12.11.2026, Agnar: verkferlar og efnin frá Redder „með myndum og svona“;
 * svarar líka liðum 1 og 2 í beiðni COWI: yfirlit yfir kerfi, framleiðendur og vörur, og uppsetningarleiðbeiningar).
 *
 * EFNI: vörurnar eru þær sem standa á reikningum Redder vegna verkstaðarins (redder_line_items, lesið 12.11.2026):
 *   POL PRO005 / PRO022 hvítt eldvarnarakríl · POL PRO010 háþenslukítti · POL A006 þéttull 50 mm · POL PRO0039-30 kragi 110 mm ·
 *   POL PRO276 eldvarnarband. Vöruheiti, lýsingar, myndir og tækniblöð eru af vörusíðum redder.is (lesið sama dag) — lýsingarnar
 *   eru endursagðar, ekki afritaðar. Magn og innkaupsverð eru EKKI sýnd (viðskiptaupplýsingar).
 *   Myndirnar eru sóttar beint af redder.is (ekki afritaðar í okkar geymslu); mynd sem næst ekki er falin.
 *   Vottorð (ETA, DoP) eru ekki í kerfinu — aðeins tenglar á tækniblöð Redder. Aldrei fullyrða um vottun umfram það.
 * VERKFERLI: skrefin eru DRÖG þar til Agnar hakar við „Yfirfarið“ (gogn.verkferli_ok) — merkið „Drög“ prentast með á meðan.
 *   Texta hvers skrefs má yfirskrifa (gogn.verkferli[lykill]); tómt = sjálfgefinn texti.
 */

export type EfniGogn = { verkferli?: Record<string, string>; verkferli_ok?: boolean };

const EFNI: { k: string; heiti: string; vara: string; nr: string; mynd: string; sida: string; lysing: string; notkun: string; skjol: [string, string][] }[] = [
  { k: "akril", heiti: "Hvítt eldvarnarakríl", vara: "Protecta FR Acrylic", nr: "POL PRO005 (310 ml) · POL PRO022 (600 ml)",
    mynd: "https://redder.is/wp-content/uploads/2023/06/POL-PRO005.jpg", sida: "https://redder.is/voruflokkar/protecta-eldvarnar-akril/",
    lysing: "Eldvarnarþéttiefni fyrir samskeyti og op í brunahólfandi veggjum og gólfum. Helst sveigjanlegt eftir hörðnun, heldur hljóðeinangrun byggingarhlutans og þenst út við hita.",
    notkun: "Þétting umhverfis lagnir og meðfram eldvarnarþéttull.",
    skjol: [["Tækniblað", "https://redder.is/wp-content/uploads/2023/11/Technical-Data-Sheet.pdf"]] },
  { k: "grafit", heiti: "Svart háþenslukítti", vara: "Protecta FR Graphite", nr: "POL PRO010 (310 ml)",
    mynd: "https://redder.is/wp-content/uploads/2026/09/772a1563-9c9f-471b-b128-394f3d84f3f0.jpg", sida: "https://redder.is/voruflokkar/eldv-hathennslukitti-iso14001-310mm25/",
    lysing: "Þéttiefni með grafíti sem þenst mikið út í hita og lokar opinu þegar brennanleg lögn gefur sig. Ætlað þar sem hefðbundið eldvarnarkítti dugar ekki.",
    notkun: "Plaströr, kaplar, kapalbakkar og einangruð málmrör.",
    skjol: [] },
  { k: "ull", heiti: "Eldvarnarþéttull 50 mm", vara: "Protecta FR Board", nr: "POL A006 (1200 × 600 mm)",
    mynd: "https://redder.is/wp-content/uploads/2026/09/ed9771bd-2f1c-40fe-9544-40382eb19dd3.jpg", sida: "https://redder.is/voruflokkar/eldvarnar-thettull-50mm-1200x600/",
    lysing: "Plata úr þéttri steinull með eldvarnarhúð. Lokar stærri opum í brunahólfandi veggjum og gólfum þar sem lagnir fara í gegn og heldur hljóðeinangrun byggingarhlutans.",
    notkun: "Fylling í stærri op; þétt með FR Acrylic allan hringinn.",
    skjol: [["Tækniblað", "https://redder.is/wp-content/uploads/2023/06/Technical-Data-Sheet.pdf"], ["Uppsetning", "https://redder.is/wp-content/uploads/2023/06/Installation-Instructions.pdf"], ["Myndband", "https://youtu.be/mSRlSbdhZJQ"]] },
  { k: "kragi", heiti: "Eldvarnarkragi", vara: "Protecta FR Collar", nr: "POL PRO0039-30 (110 mm)",
    mynd: "https://redder.is/wp-content/uploads/2026/06/0018_Protecta-FR-Collar-white.jpg", sida: "https://redder.is/voruflokkar/protecta-eldvarnarkragar/",
    lysing: "Stálkragi með útþenjandi efni sem lokar opinu þegar plaströrið bráðnar. Settur utan um rörið og festur við vegg eða gólf.",
    notkun: "Plaströr í gegnum brunahólfandi veggi og gólf.",
    skjol: [["Tækniblað", "https://redder.is/wp-content/uploads/2026/06/FR-Collar-Technical-Data-Sheet.pdf"], ["Öryggisblað", "https://redder.is/wp-content/uploads/2026/06/FR-Collar-Safety-Data-Sheet.pdf"]] },
  { k: "band", heiti: "Eldvarnarband", vara: "Protecta FR Pipe Wrap", nr: "POL PRO276 (50 mm × 25 m)",
    mynd: "https://redder.is/wp-content/uploads/2026/06/0011_Protecta-FR-Pipe-Wrap.jpg", sida: "https://redder.is/voruflokkar/protecta-eldvarnarband/",
    lysing: "Útþenjandi vafningur sem er settur utan um plaströr inni í gegnumtakinu og lokar því þegar rörið bráðnar.",
    notkun: "Plaströr og rafmagnsrör í gegnum veggi og gólf.",
    skjol: [["Tækniblað", "https://redder.is/wp-content/uploads/2026/06/FR-Pipe-Wrap-Technical-Data-Sheet.pdf"], ["Öryggisblað", "https://redder.is/wp-content/uploads/2026/06/FR-Pipe-Wrap-Safety-Data-Sheet.pdf"], ["DoP", "https://redder.is/wp-content/uploads/2026/06/FR-Pipe-Wrap-DoP.pdf"]] },
];

export function Efni() {
  return (
    <div className="sk-efnid">
      <div className="sk-efni-rist">
        {EFNI.map((e) => (
          <article key={e.k}>
            <a className="sk-efni-mynd" href={e.sida} target="_blank" rel="noreferrer" aria-label={`${e.vara} hjá Redder`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={e.mynd} alt={e.vara} loading="lazy" referrerPolicy="no-referrer" onError={(ev) => { ev.currentTarget.style.visibility = "hidden"; }} />
            </a>
            <div>
              <h3>{e.heiti}</h3>
              <b>{e.vara}</b>
              <p>{e.lysing}</p>
              <dl>
                <dt>Ætlað fyrir</dt><dd>{e.notkun}</dd>
                <dt>Vörunúmer</dt><dd>{e.nr}</dd>
              </dl>
              {e.skjol.length > 0 && <div className="sk-efni-skjol">{e.skjol.map(([n, u]) => <a key={u} href={u} target="_blank" rel="noreferrer">{n}</a>)}</div>}
            </div>
          </article>
        ))}
      </div>
      <p className="sk-smatt">Efnin eru úr Protecta-línunni og keypt hjá Redder ehf. Á reikningum vegna verksins eru auk þess, í minna magni, eldvarnarakríl og háþenslukítti frá FSi (FSI FS310CW25 og FSI FS310HPE). Brunamótstaða hverrar þéttingar ræðst af prófaðri útfærslu samkvæmt gögnum framleiðanda (gerð veggjar eða gólfs, stærð ops og tegund lagnar). Tenglarnir vísa á tækniblöð og leiðbeiningar á vef Redder. Myndir: Redder ehf.</p>
    </div>
  );
}

const SKREF: { k: string; heiti: string; texti: string }[] = [
  { k: "flokkun", heiti: "Yfirferð og flokkun", texti: "Hvert gat er skoðað áður en þétt er: tegund lagnar (stálrör, plaströr, loftstokkur, raflögn), stærð ops og hvort það er í vegg eða gólfi. Flokkurinn ræður því hvaða lausn er notuð og er sá sami og þéttingin er skráð á." },
  { k: "undirbuningur", heiti: "Undirbúningur", texti: "Opið og lögnin eru hreinsuð af ryki og lausu efni svo þéttiefnið nái góðri viðloðun." },
  { k: "fylling", heiti: "Fylling", texti: "Stærri op eru fyllt með eldvarnarþéttull sem er skorin þétt að lögnunum og brúnum opsins." },
  { k: "thetting", heiti: "Þétting", texti: "Þétt er með hvítu eldvarnarakríli umhverfis lagnir og meðfram þéttull. Við plaströr og kapla er notað svart háþenslukítti, og eldvarnarkragi eða eldvarnarband á plaströr þar sem lausnin gerir kröfu um það. Unnið er eftir uppsetningarleiðbeiningum framleiðanda." },
  { k: "skraning", heiti: "Skráning", texti: "Hver þétting er skráð í Ajour á teikningu af hæðinni: staðsetning, flokkur, starfsmaður, dagsetning og ljósmyndir. Skráningin er staðfestingin á verkinu og grunnur þessarar skýrslu." },
  { k: "eftirlit", heiti: "Eftirlit og lagfæringar", texti: "Opnar skráningar og athugasemdir eftirlits eru unnar jafnóðum. Lagfæring er skráð sem ný skráning, svo saga hvers gats haldist." },
];

export function Verkferli({ gogn, onChange, les }: { gogn: EfniGogn; onChange: (b: EfniGogn) => void; les: boolean }) {
  const br = gogn.verkferli || {};
  const setja = (k: string, v: string) => { const n = { ...br }; if (v.trim() && v !== SKREF.find((s) => s.k === k)?.texti) n[k] = v; else delete n[k]; onChange({ verkferli: n }); };
  return (
    <div className="sk-vf">
      {!gogn.verkferli_ok && <p className="sk-vf-drog"><b>Drög.</b> Textinn hér að neðan er tillaga sem á eftir að yfirfara.{!les && <span className="sk-skjar"> Leiðréttu skrefin og hakaðu við þegar textinn er réttur — þá hverfur þessi merking. <label className="sk-val"><input type="checkbox" checked={false} onChange={() => onChange({ verkferli_ok: true })} /> Yfirfarið</label></span>}</p>}
      <ol className="sk-vf-skref">
        {SKREF.map((s, i) => (
          <li key={s.k}>
            <span>{i + 1}</span>
            <div>
              <h3>{s.heiti}</h3>
              {!les && <textarea className="sk-texti" rows={5} value={br[s.k] ?? s.texti} onChange={(e) => setja(s.k, e.target.value)} aria-label={`Texti skrefs: ${s.heiti}`} />}
              <p className={les ? "" : "sk-prent"}>{br[s.k] ?? s.texti}</p>
            </div>
          </li>
        ))}
      </ol>
      {gogn.verkferli_ok && !les && <p className="sk-smatt sk-skjar">Verkferlið er merkt yfirfarið. <label className="sk-val"><input type="checkbox" checked onChange={() => onChange({ verkferli_ok: false })} /> Yfirfarið</label></p>}
    </div>
  );
}
