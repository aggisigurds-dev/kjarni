"use client";

/* Stöðuskýrsla — „Efni og kerfi“ og „Verkferli“ (12.11.2026, Agnar: verkferlar og efnin frá Redder „með myndum og svona“;
 * svarar líka liðum 1 og 2 í beiðni COWI: yfirlit yfir kerfi, framleiðendur og vörur, og uppsetningarleiðbeiningar).
 *
 * EFNI: vörurnar eru þær sem standa á reikningum Redder vegna verkstaðarins (redder_line_items, lesið 12.11.2026):
 *   POL PRO005 / PRO022 hvítt eldvarnarakríl · POL PRO010 háþenslukítti · POL A006 þéttull 50 mm · POL PRO0039-30 kragi 110 mm ·
 *   POL PRO276 eldvarnarband. Vöruheiti, lýsingar, myndir og tækniblöð eru af vörusíðum redder.is (lesið sama dag) — lýsingarnar
 *   eru endursagðar, ekki afritaðar. Magn og innkaupsverð eru EKKI sýnd (viðskiptaupplýsingar).
 *   Myndirnar eru sóttar beint af redder.is (ekki afritaðar í okkar geymslu); mynd sem næst ekki er falin.
 *   Reikningar merktir „Landsspítalinn“ frá 14.11.2023 til 05.02.2024 („BUGL“, „LSH 0104-14“) eru ANNAÐ verk og teljast ekki með:
 *   FSi háþenslukíttið (FS310HPE) er aðeins þar. NLSH-reikningarnir byrja 03.10.2025. FSi á NLSH: aðeins FS310CW25 ×75 (09.07.2026)
 *   og eldvarnarband PW á rúllu ×2 (30.06. og 09.07.2026). Forsniðnu böndin eftir rörastærð (POL PRO076 82 mm, PRO069 110 mm) eru
 *   aðeins á ótengdum reikningum — ekki hægt að eigna þau verkinu, svo þau eru ekki talin upp.
 *   Vottorð (ETA, DoP) eru ekki í kerfinu — aðeins tenglar á tækniblöð Redder. Aldrei fullyrða um vottun umfram það.
 * VERKFERLI: skrefin eru DRÖG þar til Agnar hakar við „Yfirfarið“ (gogn.verkferli_ok) — merkið „Drög“ prentast með á meðan.
 *   Texta hvers skrefs má yfirskrifa (gogn.verkferli[lykill]); tómt = sjálfgefinn texti.
 */

export type EfniGogn = { verkferli?: Record<string, string>; verkferli_ok?: boolean };

const EFNI: { k: string; heiti: string; vara: string; nr?: string; mynd?: string; sida?: string; lysing: string; notkun: string; skjol: [string, string][]; vott?: string }[] = [
  { k: "akril", heiti: "Hvítt eldvarnarakríl", vara: "Protecta FR Acrylic", nr: "POL PRO005 (310 ml) · POL PRO022 (600 ml)",
    mynd: "https://redder.is/wp-content/uploads/2023/06/POL-PRO005.jpg", sida: "https://redder.is/voruflokkar/protecta-eldvarnar-akril/",
    lysing: "Eldvarnarþéttiefni fyrir samskeyti og op í brunahólfandi veggjum og gólfum. Helst sveigjanlegt eftir hörðnun, heldur hljóðeinangrun byggingarhlutans og þenst út við hita.",
    notkun: "Þétting umhverfis lagnir og meðfram eldvarnarþéttull.",
    skjol: [["Yfirlýsing um nothæfi (DoP)", "https://protecta.si/wp-content/uploads/2026/02/FR-Acrylic-DoP.pdf"], ["ETA 22/0735", "https://www.eota.eu/etassessments/19594"], ["ETA 23/0257", "https://www.eota.eu/etassessments/16673"], ["Uppsetningarleiðbeiningar", "https://fireprotect.dk/wp-content/uploads/2024/01/FR-Acrylic-Installation-Instructions.pdf"], ["Tækniblað", "https://redder.is/wp-content/uploads/2023/11/Technical-Data-Sheet.pdf"]], vott: "DoP PS-14010 (30.07.2024) · ETA 22/0735, ETA 23/0257 · vottorð 0843-CPR-1226" },
  { k: "grafit", heiti: "Svart háþenslukítti", vara: "Protecta FR Graphite", nr: "POL PRO010 (310 ml)",
    mynd: "https://redder.is/wp-content/uploads/2026/09/772a1563-9c9f-471b-b128-394f3d84f3f0.jpg", sida: "https://redder.is/voruflokkar/eldv-hathennslukitti-iso14001-310mm25/",
    lysing: "Þéttiefni með grafíti sem þenst mikið út í hita og lokar opinu þegar brennanleg lögn gefur sig. Ætlað þar sem hefðbundið eldvarnarkítti dugar ekki.",
    notkun: "Plaströr, kaplar, kapalbakkar og einangruð málmrör.",
    skjol: [["Yfirlýsing um nothæfi (DoP)", "https://protecta.si/wp-content/uploads/2026/02/FR-Graphite-DoP.pdf"], ["ETA 22/0749", "https://fireprotect.dk/wp-content/uploads/2024/01/FR-Graphite-ETA.pdf"], ["Uppsetningarleiðbeiningar", "https://fireprotect.dk/wp-content/uploads/2024/01/FR-Graphite-Installation-Instructions.pdf"]], vott: "DoP PS-14016 (05.07.2024) · ETA 22/0749 · vottorð 0843-CPR-1223" },
  { k: "ull", heiti: "Eldvarnarþéttull 50 mm", vara: "Protecta FR Board", nr: "POL A006 (1200 × 600 mm)",
    mynd: "https://redder.is/wp-content/uploads/2026/09/ed9771bd-2f1c-40fe-9544-40382eb19dd3.jpg", sida: "https://redder.is/voruflokkar/eldvarnar-thettull-50mm-1200x600/",
    lysing: "Plata úr þéttri steinull með eldvarnarhúð. Lokar stærri opum í brunahólfandi veggjum og gólfum þar sem lagnir fara í gegn og heldur hljóðeinangrun byggingarhlutans.",
    notkun: "Fylling í stærri op; þétt með FR Acrylic allan hringinn.",
    skjol: [["Yfirlýsing um nothæfi (DoP)", "https://fireprotect.dk/wp-content/uploads/2024/01/FR-Board-DoP.pdf"], ["ETA 22/0733", "https://www.eota.eu/etassessments/19589"], ["ETA 22/0771", "https://www.eota.eu/etassessments/19588"], ["Uppsetningarleiðbeiningar", "https://fireprotect.dk/wp-content/uploads/2024/01/FR-Board-Installation-Instructions.pdf"], ["Tækniblað", "https://redder.is/wp-content/uploads/2023/06/Technical-Data-Sheet.pdf"], ["Myndband", "https://youtu.be/mSRlSbdhZJQ"]], vott: "DoP PS-14013 (22.06.2023) · ETA 22/0733, ETA 22/0771 · vottorð 0843-CPR-1221" },
  { k: "kragi", heiti: "Eldvarnarkragi", vara: "Protecta FR Collar", nr: "POL PRO0039-30 (110 mm)",
    mynd: "https://redder.is/wp-content/uploads/2026/06/0018_Protecta-FR-Collar-white.jpg", sida: "https://redder.is/voruflokkar/protecta-eldvarnarkragar/",
    lysing: "Stálkragi með útþenjandi efni sem lokar opinu þegar plaströrið bráðnar. Settur utan um rörið og festur við vegg eða gólf.",
    notkun: "Plaströr í gegnum brunahólfandi veggi og gólf.",
    skjol: [["Yfirlýsing um nothæfi (DoP)", "https://fireprotect.dk/wp-content/uploads/2024/01/FR-Collar-DOP.pdf"], ["ETA 22/0752", "https://fireprotect.dk/wp-content/uploads/2024/01/FR-Collar-ETA.pdf"], ["Uppsetningarleiðbeiningar", "https://fireprotect.dk/wp-content/uploads/2024/01/FR-Collar-Installation-Instructions.pdf"], ["Tækniblað", "https://redder.is/wp-content/uploads/2026/06/FR-Collar-Technical-Data-Sheet.pdf"], ["Öryggisblað", "https://redder.is/wp-content/uploads/2026/06/FR-Collar-Safety-Data-Sheet.pdf"]], vott: "DoP PS-14011 (14.07.2023) · ETA 22/0752 · vottorð 0843-CPR-1222" },
  { k: "band", heiti: "Eldvarnarband", vara: "Protecta FR Pipe Wrap", nr: "POL PRO276 (50 mm × 25 m)",
    mynd: "https://redder.is/wp-content/uploads/2026/06/0011_Protecta-FR-Pipe-Wrap.jpg", sida: "https://redder.is/voruflokkar/protecta-eldvarnarband/",
    lysing: "Útþenjandi vafningur sem er settur utan um plaströr inni í gegnumtakinu og lokar því þegar rörið bráðnar.",
    notkun: "Plaströr og rafmagnsrör í gegnum veggi og gólf.",
    skjol: [["Yfirlýsing um nothæfi (DoP)", "https://protecta.si/wp-content/uploads/2026/02/FR-Pipe-Wrap-DoP.pdf"], ["ETA 24/0957", "https://www.eota.eu/etassessments/19596"], ["Uppsetningarleiðbeiningar", "https://s3.eu-west-1.amazonaws.com/static.fw1.biz/Templates/80674/myimages/protecta%20pipe%20wrap%20-%20installation%20instructions_1755090852546.pdf"], ["Tækniblað", "https://redder.is/wp-content/uploads/2026/06/FR-Pipe-Wrap-Technical-Data-Sheet.pdf"], ["Öryggisblað", "https://redder.is/wp-content/uploads/2026/06/FR-Pipe-Wrap-Safety-Data-Sheet.pdf"], ], vott: "DoP PS-14015 (12.08.2025) · ETA 22/0733, ETA 22/0748, ETA 24/0957" },
  // FSi-efnin (Anni, mál #1686 nr. 5, 19.11.2026): akrýlið er skráð „Akríl / Pyrocoustic Sealant“ í gátlistum Ajour og PipeBloc EL
  // er í efnisyfirlitinu. DoP-, ETA- og UL-númer eru frá Anna; tenglar og vörunúmer ekki sannreynd, því engir tenglar.
  { k: "fsi-akril", heiti: "Hvítt eldvarnarakríl (FSi)", vara: "FSi Pyrocoustic Sealant",
    lysing: "Hljóð- og eldvarnarþéttiefni úr akríli fyrir samskeyti og op í brunahólfandi veggjum og gólfum.",
    notkun: "Þétting umhverfis lagnir og meðfram eldvarnarþéttull, sama notkun og FR Acrylic.",
    skjol: [], vott: "DoP05-PS-21 · ETA 21/0049 · DoP05-LGS-21 · ETA 21/0050 · UL-EU-00500" },
  { k: "fsi-band", heiti: "Eldvarnarband (FSi)", vara: "FSi PipeBloc EL",
    lysing: "Útþenjandi vafningur sem er settur utan um plaströr í gegnumtakinu og lokar því þegar rörið bráðnar.",
    notkun: "Plaströr í gegnum veggi og gólf, sama notkun og FR Pipe Wrap.",
    skjol: [], vott: "DoP022 · ETA 20/1007 · UL-EU-01023" },
];

export function Efni() {
  return (
    <div className="sk-efnid">
      <div className="sk-efni-rist">
        {EFNI.map((e) => (
          <article key={e.k}>
            {e.mynd ? (
              <a className="sk-efni-mynd" href={e.sida} target="_blank" rel="noreferrer" aria-label={`${e.vara} hjá Redder`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={e.mynd} alt={e.vara} loading="lazy" referrerPolicy="no-referrer" onError={(ev) => { ev.currentTarget.style.visibility = "hidden"; }} />
              </a>
            ) : <span className="sk-efni-mynd" aria-hidden="true" />}
            <div>
              <h3>{e.heiti}</h3>
              <b>{e.vara}</b>
              <p>{e.lysing}</p>
              <dl>
                <dt>Ætlað fyrir</dt><dd>{e.notkun}</dd>
                {e.nr && <><dt>Vörunúmer</dt><dd>{e.nr}</dd></>}
                {e.vott && <><dt>Vottun</dt><dd>{e.vott}</dd></>}
              </dl>
              {e.skjol.length > 0 && <div className="sk-efni-skjol">{e.skjol.map(([n, u]) => <a key={u} href={u} target="_blank" rel="noreferrer">{n}</a>)}</div>}
            </div>
          </article>
        ))}
      </div>
      <p className="sk-smatt">Efnin eru frá Protecta (Polyseam Ltd.) og FSi, keypt hjá Redder ehf. Brunamótstaða hverrar þéttingar ræðst af prófaðri útfærslu samkvæmt gögnum framleiðanda (gerð veggjar eða gólfs, stærð ops og tegund lagnar). Tenglarnir vísa á tækniblöð og leiðbeiningar á vef Redder. Myndir: Redder ehf.</p>
    </div>
  );
}

/* Verkferlið með tilvísunum (Agnar 19.11.2026: „gera textann um verkferlana með tilvísun, eins og á að gera þetta“).
 * Vísað er í gögn framleiðanda í heild (DoP, ETA, uppsetningarleiðbeiningar, tæknihandbók), ekki í einstakar greinar: ETA-skjölin
 * hafa ekki verið lesin í smáatriðum, svo engar tölur (dýpt, bil, stærðarmörk) eru settar fram. Tilvísanalistinn er dreginn úr EFNI. */
const SKREF: { k: string; heiti: string; texti: string }[] = [
  { k: "gogn", heiti: "Gögn framleiðanda", texti: "Allar þéttingar eru gerðar með vörum frá Protecta (framleiðandi Polyseam Ltd.) og FSi, og samkvæmt gögnum framleiðanda: yfirlýsingu um nothæfi (DoP), evrópsku tæknimati (ETA) og uppsetningarleiðbeiningum hverrar vöru, ásamt tæknihandbók Protecta. Gögnin eru talin upp í tilvísunum hér að neðan og fylgja skýrslunni." },
  // Skref 2–4 og 7–8 eru vinnulagið eins og Agnar lýsti því 19.11.2026: punktur í Ajour, mæla gatið og rétt stærð, mynd,
  // blása úr, þétta, miði (fyrirtæki, efni, dagsetning, upphafsstafir), sömu upplýsingar í kerfið og mynd í lokin (og í miðju verki).
  { k: "punktur", heiti: "Skráning í Ajour", texti: "Áður en vinna hefst við nýja þéttingu er punktur skráður í Ajour á réttum stað á teikningu hæðarinnar." },
  { k: "flokkun", heiti: "Mæling og val á lausn", texti: "Gatið er mælt og rétt stærð og flokkur skráð í Ajour. Metið er í hvaða byggingarhluta gegnumtakið er (veggur eða gólf), tegund lagnar (stálrör, plaströr, loftstokkur, raflögn), þvermál og einangrun. Út frá því er valin sú lausn sem ETA vörunnar nær yfir. Gegnumtak sem fellur utan prófaðra útfærslna er borið undir verkkaupa áður en þétt er." },
  { k: "undirbuningur", heiti: "Mynd og hreinsun", texti: "Tekin er mynd af gatinu áður en unnið er í því. Síðan er blásið úr opinu svo ryk og laust efni hverfi og þéttiefnið nái viðloðun eins og uppsetningarleiðbeiningar gera ráð fyrir." },
  { k: "fylling", heiti: "Fylling stærri opa", texti: "Stærri op eru fyllt með eldvarnarþéttull (FR Board) sem er skorin þétt að lögnum og brúnum opsins. Samskeyti, jaðrar og bil við lagnir eru þétt með eldvarnarakríli (FR Acrylic), samkvæmt uppsetningarleiðbeiningum FR Board." },
  { k: "thetting", heiti: "Þétting eftir tegund lagnar", texti: "Stálrör og óeinangruð málmrör: eldvarnarakríl (FR Acrylic eða FSi Pyrocoustic Sealant) allan hringinn.\nEinangruð málmrör, kaplar og kapalbakkar: háþenslukítti (FR Graphite).\nPlaströr: háþenslukítti (FR Graphite), og eldvarnarkragi (FR Collar) eða eldvarnarband (FR Pipe Wrap eða FSi PipeBloc EL) þar sem ETA gerir kröfu um það miðað við efni og þvermál rörs.\nLoftstokkar: opið fyllt með FR Board og þétt með FR Acrylic að stokknum.\nÍ öllum tilvikum er farið eftir uppsetningarleiðbeiningum viðkomandi vöru um magn, dýpt og frágang." },
  // Milliloft eftir lýsingu Agnars 19.11.2026; dýpt og frágangur úr uppsetningarleiðbeiningum FR Acrylic (rigid floors, lesið sama dag):
  // stoðefni skorið aðeins í yfirstærð og þrýst þétt í gatið (almennt lið 8), akríl 15–25 mm eftir útfærslu, á steinull.
  { k: "milliloft", heiti: "Milliloftsþéttingar (gólf)", texti: "Lagnirnar í gólfinu eru stálrör, steypt föst að ofanverðu, og þar er þétt með eldvarnarakríli (FR Acrylic eða FSi Pyrocoustic Sealant) umhverfis rörið. Að neðan er blásið úr gatinu, eldvarnarakríl sett í hringinn í gatinu og á rörið til festu, eldvarnarþéttull skorin aðeins í yfirstærð og þrýst þétt í gatið umhverfis rörið, og loks er eldvarnarakríl lagt vel yfir. Dýpt akríls og steinullar fylgir uppsetningarleiðbeiningum framleiðanda fyrir stálrör í gólfi (FR Acrylic: ETA 22/0735, ETA 23/0257; Pyrocoustic Sealant: ETA 21/0049)." },
  { k: "merking", heiti: "Merking", texti: "Við hverja þéttingu er settur miði með nafni fyrirtækisins, efninu sem notað var, dagsetningu og upphafsstöfum starfsmanns." },
  { k: "skraning", heiti: "Lokaskráning og mynd", texti: "Sömu upplýsingar eru skráðar í Ajour og tekin mynd af fullgerðri þéttingu. Sé þéttingin unnin í fleiri skrefum er einnig tekin mynd á milli skrefa. Skráningin er staðfestingin á verkinu og grunnur þessarar skýrslu." },
  { k: "eftirlit", heiti: "Eftirlit og lagfæringar", texti: "Opnar skráningar og athugasemdir eftirlits eru unnar jafnóðum. Lagfæring er skráð sem ný skráning, svo saga hvers gats haldist." },
];

/** Tilvísanir verkferlisins: ein lína á vöru (DoP, ETA, leiðbeiningar) úr EFNI, auk tæknihandbókarinnar. */
const TILVISANIR: { heiti: string; texti: string; leid?: string }[] = [
  ...EFNI.map((e) => ({ heiti: e.vara, texti: e.vott || "", leid: e.skjol.find(([n]) => n === "Uppsetningarleiðbeiningar")?.[1] })),
  { heiti: "Protecta tæknihandbók", texti: "Technical Manual, 8. útgáfa (2024)" },
];

export function Verkferli({ gogn, onChange, les }: { gogn: EfniGogn; onChange: (b: EfniGogn) => void; les: boolean }) {
  const br = gogn.verkferli || {};
  const setja = (k: string, v: string) => { const n = { ...br }; if (v.trim() && v !== SKREF.find((s) => s.k === k)?.texti) n[k] = v; else delete n[k]; onChange({ verkferli: n }); };
  return (
    <div className="sk-vf">
      {!gogn.verkferli_ok && <p className="sk-vf-drog sk-skjar"><b>Drög.</b> Textinn hér að neðan er tillaga sem á eftir að yfirfara.{!les && <span className="sk-skjar"> Leiðréttu skrefin og hakaðu við þegar textinn er réttur — þá hverfur þessi merking. <label className="sk-val"><input type="checkbox" checked={false} onChange={() => onChange({ verkferli_ok: true })} /> Yfirfarið</label></span>}</p>}
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
      <div className="sk-vf-tilv">
        <h3>Tilvísanir</h3>
        <ul>
          {TILVISANIR.map((t) => <li key={t.heiti}><b>{t.heiti}</b>{t.texti ? ` · ${t.texti}` : ""}{t.leid ? <> · <a href={t.leid} target="_blank" rel="noreferrer">uppsetningarleiðbeiningar</a></> : null}</li>)}
        </ul>
      </div>
      {gogn.verkferli_ok && !les && <p className="sk-smatt sk-skjar">Verkferlið er merkt yfirfarið. <label className="sk-val"><input type="checkbox" checked onChange={() => onChange({ verkferli_ok: false })} /> Yfirfarið</label></p>}
    </div>
  );
}
