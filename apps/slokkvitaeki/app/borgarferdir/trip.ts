/* Borgarferðir (Manchester · Glasgow) — gögn og reikningur. Verð eru ÚR LEITARVÉLUM (mynd frá okt. 2026), ekki tilboð;
 * pakkarnir hér eru reiknaðir (flug + töskur + hótel), ekki tilbúnir pakkar ferðaskrifstofa. */

export type DestCode = "MAN" | "GLA";
export type AirlineId = "ez" | "ic";

export type Airline = {
  id: AirlineId;
  nafn: string;
  /** fargjald á mann, fram og til baka, £ */
  fare: number;
  /** taska, hvor leið, £ */
  bag: number;
  /** vikudagar (0 = sun) sem flogið var — óskilgreint = oftast daglega eða óvíst */
  days?: number[];
  athugasemd: string;
};

export type Hotel = { nafn: string; stjornur: string; hverfi: string; rate: number | null; hvers: string };

export type Dest = {
  code: DestCode;
  borg: string;
  skyscanner: string;
  flugtimi?: string;
  airlines: Airline[];
  hotels: Hotel[];
  flugLinks: { nafn: string; href: string }[];
};

export const DESTS: Record<DestCode, Dest> = {
  MAN: {
    code: "MAN",
    borg: "Manchester",
    skyscanner: "man",
    flugtimi: "um 2 klst. 45 mín.",
    airlines: [
      { id: "ez", nafn: "easyJet", fare: 66, bag: 15, days: [4, 0], athugasemd: "Beint, fimmtudaga og sunnudaga. Taska bókuð á netinu." },
      { id: "ic", nafn: "Icelandair", fare: 161, bag: 47, athugasemd: "Beint, nánast daglega. Economy Light." },
    ],
    hotels: [
      { nafn: "The Midland", stjornur: "4★", hverfi: "0,6 km frá miðbæ", rate: 120, hvers: "Fjölskylduherbergi. Fínasti kosturinn." },
      { nafn: "INNSiDE by Meliá Manchester", stjornur: "4★", hverfi: "Miðborg", rate: 80, hvers: "Fjölskylduherbergi og ódýrasta 4★ sem fannst." },
      { nafn: "Manchester Portland by Sunday", stjornur: "3,5★", hverfi: "Miðborg", rate: 60, hvers: "Góð staðsetning og gott verð — sparnaðarkosturinn." },
      { nafn: "Crowne Plaza Manchester City Centre", stjornur: "4★", hverfi: "Við Arndale", rate: null, hvers: "Foreldrar mæla með herbergi með tveimur stórum rúmum — biðja um það." },
      { nafn: "DoubleTree by Hilton Manchester Piccadilly", stjornur: "4★", hverfi: "Piccadilly", rate: null, hvers: "Innisundlaug — gott fyrir 10 ára." },
      { nafn: "Holiday Inn Manchester City Centre", stjornur: "3–4★", hverfi: "Miðborg", rate: null, hvers: "Oft nefnt sem fjölskylduhótel; fjölskylduherbergi sofa yfirleitt fjóra." },
      { nafn: "Staycity Aparthotels Manchester", stjornur: "Íbúðahótel", hverfi: "Miðborg", rate: null, hvers: "Íbúð með aðskildu svefnrými hentar 3 fullorðnum + barni betur en eitt herbergi." },
    ],
    flugLinks: [
      { nafn: "Icelandair", href: "https://www.icelandair.com/en-gb/flights/flights-from-manchester-to-reykjavik" },
      { nafn: "easyJet", href: "https://www.easyjet.com/en/" },
    ],
  },
  GLA: {
    code: "GLA",
    borg: "Glasgow",
    skyscanner: "gla",
    airlines: [{ id: "ic", nafn: "Icelandair", fare: 192, bag: 47, athugasemd: "Beint, um 2 klst. 25 mín., 6–7 flug á viku. Eina flugfélagið á leiðinni. Dagar óstaðfestir." }],
    hotels: [
      { nafn: "DoubleTree by Hilton Glasgow Central", stjornur: "4★", hverfi: "Miðborg", rate: 65, hvers: "Innisundlaug og heitur pottur." },
      { nafn: "voco Grand Central Glasgow", stjornur: "4★", hverfi: "Miðborg", rate: 65, hvers: "Morgunverður í boði og veitingastaður." },
      { nafn: "Hilton Glasgow", stjornur: "4★", hverfi: "Miðborg", rate: 85, hvers: "Innisundlaug — örugg fjölskylduleið." },
      { nafn: "Apex City of Glasgow Hotel", stjornur: "4★", hverfi: "Bath Street", rate: 85, hvers: "Rúmgóð fjölskylduherbergi og þjónusta fyrir börn." },
      { nafn: "Novotel Glasgow Centre", stjornur: "4★", hverfi: "Pitt Street", rate: null, hvers: "Fjölskylduvænt, með gufubaði og líkamsrækt." },
    ],
    flugLinks: [{ nafn: "Icelandair", href: "https://www.icelandair.com/en-gb/" }],
  },
};

/** pakkar frá ferðaskrifstofum — aðeins tenglar; verð fundust ekki á lifandi síðum */
export const FERDASKRIFSTOFUR: { nafn: string; lysing: string; href: string }[] = [
  { nafn: "Icelandair — Manchester", lysing: "Flug báðar leiðir, hótel með morgunverði, handfarangur og taska. Frá 72.900 kr. á mann (miðað við 2 fullorðna).", href: "https://www.icelandair.com/is/pakkaferdir/manchester-borgarferdir/" },
  { nafn: "Icelandair VITA — tilboð", lysing: "Tilboðsferðir. Glasgow og Manchester hafa verið á listanum fyrir ferðir 1. nóv.–17. des.", href: "https://vita.is/tilbod" },
  { nafn: "Úrval Útsýn — Glasgow", lysing: "Borgarferðir til Glasgow.", href: "https://uu.is/afangastadur/glasgow/" },
  { nafn: "Úrval Útsýn — borgarpakkar", lysing: "Allir borgarpakkar.", href: "https://www.uu.is/ferdir/borgir" },
  { nafn: "Tango Travel — Glasgow", lysing: "Glasgow-pakkar með flugi og hóteli. Sást frá 78.100 kr. á mann í 3 nætur (2 fullorðnir, vetur 2026 — gamalt verð).", href: "https://www.tango.travel/afangastadir/bretland/glasgow/" },
  { nafn: "Lastminute.com — Glasgow", lysing: "Pakkar með flugi frá Reykjavík. Sást frá um 121.000 kr. á mann í 5 nætur (citizenM). Erlend síða, verð óstaðfest.", href: "https://is.lastminute.com/flug-hotel/gb_bretland/glasgow-d19141800" },
  { nafn: "Visitor — borgarferðir", lysing: "Manchester sést frá 58.259 kr. (óvíst hvað er innifalið).", href: "https://www.visitor.is/borgarferdir/" },
  { nafn: "Tango Travel — borgarferðir", lysing: "Manchester sést frá 57.132 kr. (óvíst hvað er innifalið).", href: "https://www.tango.travel/borgarferdir/" },
];

export type Stada = "athuga" | "lokid" | "ekki" | "rad";
export type Atridi = { titill: string; texti: string; stada: Stada; href?: string };

/** Tilboð, kóðar og ráð. „stada“: athuga = skoðaðu núna, lokid = rann út/líklega búið, ekki = gildir ekki fyrir Manchester/Glasgow, rad = almennt ráð. */
export const AFSLATTUR: { titill: string; atridi: Atridi[] }[] = [
  {
    titill: "Tilboð og kóðar",
    atridi: [
      { stada: "athuga", titill: "Icelandair tilboðsferðir", texti: "Manchester og Glasgow eru á listanum fyrir ferðir 1. nóv.–17. des. Sölutímabilið sem síðan sýndi var 13.–16. okt., svo það er líklega búið — opnaðu og athugaðu hvort það stendur enn.", href: "https://www.icelandair.com/is-is/pakkaferdir/tilbodsferdir/" },
      { stada: "athuga", titill: "Bankatilboð Icelandair (30%)", texti: "Íslandsbanki, Landsbankinn og Arion hafa fengið kóða með 30% afslætti. Íslandsbankasíðan sýndi ferðir 15. nóv.–16. jan.; Landsbankasíðan er frá 2024. Óvíst hvort þeir gilda til Manchester eða Glasgow — prófaðu kóðann í bókunarvélinni.", href: "https://www.icelandair.com/is-is/flug/kynning/tilbod_isb/" },
      { stada: "ekki", titill: "OLIS-kóðinn (30%)", texti: "Fyrir ferðir 1. nóv.–15. des., Economy Standard og Saga Premium, en Manchester og Glasgow eru ekki á listanum, og bókunartíminn á síðunni var 20.–22. okt. 2025.", href: "https://www.olis.is/frettir/flugtilbod-icelandair-oktober" },
      { stada: "athuga", titill: "Icelandair VITA — tilboð", texti: "Tilboðsferðir Icelandair VITA. Ég sá ekki verð.", href: "https://vita.is/tilbod" },
      { stada: "lokid", titill: "easyJet HOLIDAYSALE", texti: "Allt að £400 af pökkum, en bókunartíminn rann út 29. sept. Skráðu þig á póstlista easyJet til að sjá næstu útsölu.", href: "https://www.easyjet.com/en/" },
      { stada: "rad", titill: "Black Friday", texti: "27. nóvember 2026 (Cyber Monday 30. nóv.). Engin útsala frá Icelandair eða easyJet var auglýst enn, og hún kemur líklega of seint fyrir nóvemberferð." },
    ],
  },
  {
    titill: "Glasgow",
    atridi: [
      { stada: "athuga", titill: "Flugið", texti: "Icelandair flýgur beint, um 2 klst. 25 mín., og FlightsFrom sýnir 7 flug á viku fram í lok nóvember (aðrar heimildir segja 6). Icelandair auglýsti flug fram og til baka í nóvember frá £192 (um 30.000 kr. á annarri síðu). Ég fékk ekki dag-fyrir-dag áætlun, svo staðfestu dagana.", href: "https://www.flightsfrom.com/KEF-GLA" },
      { stada: "rad", titill: "Edinborg sem valkostur", texti: "Til Edinborgar fljúga bæði Icelandair og easyJet, daglega, og fargjöld sáust frá um €86 fram og til baka — oft ódýrara en til Glasgow, og miðborgirnar eru stutt á milli með lest. Berðu saman áður en þú bókar.", href: "https://www.skyscanner.ie/routes/kef/edi/reykjavik-keflavik-to-edinburgh.html" },
      { stada: "athuga", titill: "Pakkar", texti: "Ég fann ekkert um Glasgow-pakka frá Icelandair, Vita eða Úrval Útsýn (síða Úrvals Útsýnar fannst ekki). Tango og Lastminute birta pakka — sjá tengla ofar." },
      { stada: "rad", titill: "Hótelverð", texti: "Miðlungs miðborgarhótel með morgunverði eru sögð £80–120 á nótt, og ódýr £55 og upp. Premier Inn Buchanan Galleries sást frá um $42 (almennt herbergi, ekki fjölskylduherbergi). Ég fann ekkert verð fyrir herbergi fyrir 3 fullorðna + barn.", href: "https://www.glasgowtourism.org/best-hotels-glasgow-city-centre/" },
      { stada: "rad", titill: "Jólamarkaðir", texti: "St Enoch Square er sagt opna 5.–6. nóv. og Glasgow Green 20. nóv. George Square er í endurbyggingu. Dagsetningar eru væntanlegar, ekki staðfestar.", href: "https://appsavvytraveller.com/glasgow-christmas-markets/" },
      { stada: "rad", titill: "Fyrir 10 ára", texti: "Frítt: Riverside Museum, Kelvingrove og Burrell Collection. Glasgow Science Centre (stjörnuver, IMAX) hentar vel en kostar. Athugaðu opnunartíma.", href: "https://kidsareatrip.com/top-things-to-do-in-glasgow-with-children/" },
    ],
  },
  {
    titill: "Flug",
    atridi: [
      { stada: "rad", titill: "Verðvakt og sveigjanlegir dagar", texti: "Settu verðvakt á KEF–MAN og KEF–GLA í Google Flights, Skyscanner eða Kayak, og skoðaðu heilan mánuð í einu. Einn dagur til eða frá getur breytt verðinu mikið." },
      { stada: "rad", titill: "Tveir stakir miðar", texti: "Stundum er ódýrara að fljúga út með einu félagi og heim með öðru (easyJet út, Icelandair heim) en að kaupa miða báðar leiðir. Þeir eru þá tvær aðskildar bókanir og engin vernd ef annar fellur niður." },
      { stada: "rad", titill: "Töskur", texti: "Icelandair Economy Light hefur enga innritaða tösku, Standard hefur eina 23 kg. Barn með sæti fær sömu heimild og fullorðinn. Berðu saman Standard við Light plús tösku. Hjá easyJet er taska miklu ódýrari bókuð á netinu en á flugvellinum.", href: "https://www.icelandair.com/support/on-board/classes-of-service/" },
      { stada: "rad", titill: "Bókaðu fljótt", texti: "Nóvember er eftir tæpan mánuð. Verð á stuttum fyrirvara lækka sjaldan. Ábendingin um að sunnudagar séu ódýrastir til að bóka byggir á bandarískum gögnum og er óviss." },
      { stada: "rad", titill: "Play er hætt", texti: "Play varð gjaldþrota í sept. 2025, svo Icelandair og easyJet eru þeir kostir sem fundust á þessum leiðum." },
    ],
  },
  {
    titill: "Hótel",
    atridi: [
      { stada: "rad", titill: "Frí afbókun og endurbókun", texti: "Bókaðu herbergi með fríri afbókun, fylgstu með verði og bókaðu aftur ef það lækkar (bókaðu nýja verðið fyrst, afbókaðu svo það gamla). Athugaðu fresti hvers hótels." },
      { stada: "rad", titill: "Booking.com Genius og appið", texti: "Genius er frítt: um 10% afsláttur á þrepi 1, allt að 15% á 2 og 20% á 3, á völdum hótelum. Appið er stundum ódýrara en vefurinn. Berðu alltaf saman lokaverð með sköttum og skoðaðu verðið líka beint hjá hótelinu." },
      { stada: "rad", titill: "Afsláttarkóðar á Booking.com", texti: "Flestir kóðar á kóðasíðum eru útrunnir eða bundnir við reikninga — ekki treysta á þá." },
      { stada: "rad", titill: "Jólamarkaðir í Manchester", texti: "Þeir opna 6. nóv. og standa til 22. des. Ég fann ekkert um hækkað hótelverð, en ferðin 5.–8. nóv. er fyrir opnun og 12.–15. nóv. er eftir hana.", href: "https://appsavvytraveller.com/manchester-christmas-markets/" },
      { stada: "rad", titill: "Verð á leikdögum", texti: "Á leikhelgum á Old Trafford og Etihad hækkar hótelverð í Manchester. Athugaðu leikjadagskrána áður en þú velur dagsetningu." },
    ],
  },
  {
    titill: "Greiðsla og kort",
    atridi: [
      { stada: "athuga", titill: "Vildarpunktar á kortum", texti: "Icelandair-kort bankanna safna Vildarpunktum sem má nota upp í flug og hótel. Íslandsbanki Gold og Classic gefa 6 punkta á hverjar 1.000 kr. (10 hjá Icelandair), en heimildir ber ekki saman — staðfestu hjá bankanum.", href: "https://www.islandsbanki.is/en/product/cards/gold-icelandair-eng" },
      { stada: "athuga", titill: "Aukakrónur", texti: "Landsbankakort safna Aukakrónum sem gilda hjá samstarfsaðilum, og Gold kortið hefur ferðatryggingu.", href: "https://www.landsbankinn.is/en/personal/cards-and-payments/aukakronur" },
      { stada: "rad", titill: "Greiddu í pundum", texti: "Ef posi eða vefur býður að umreikna í krónur, veldu pund — krónugengið þar er oftast verra." },
    ],
  },
];

export const TRAVELLERS = 4;
/** 3. og 10. des. bætt við 25. okt. eftir víðari leit (nóv.–miðjan des.): 3. des. var ódýrasta 3-nátta flugið sem
 * fannst á öllu tímabilinu (Google Flights, ISK 45.896–48.896 fyrir 4, „prices currently low"). */
export const WINDOWS = ["2026-11-05", "2026-11-12", "2026-11-19", "2026-11-26", "2026-12-03", "2026-12-10"] as const;

/* Gautaborg (Gothenburg) — flug-aðeins könnun fyrir 27. jan – 1. feb. 27. jan. 2026 er liðinn dagur (í dag er 22. okt.
 * 2026), svo gert ráð fyrir 2027. Verð sótt af Google Flights 22. okt. 2026, fyrir 1 fullorðinn — ekki fjölskylduverð
 * eins og restin af síðunni. Ekkert beint flug KEF–GOT fannst á þessum dögum (reynt bæði með leit og handvirkt). */
export const GAUTABORG_GLUGGI = "27. jan. – 1. feb. 2027";

export const GAUTABORG_BEINT: { nafn: string; leid: string; timi: string; verd: string; lysing: string; href: string }[] = [
  {
    nafn: "KLM / Transavia", leid: "um Amsterdam", timi: "6 klst. 40 mín. · 1 stopp (2 klst. í AMS)",
    verd: "frá ISK 64.891", lysing: "Ódýrasta flugið sem fannst á þessar dagsetningar.",
    href: "https://www.google.com/travel/flights?q=Flights%20from%20KEF%20to%20GOT%20on%202027-01-27%20through%202027-02-01",
  },
  {
    nafn: "Finnair", leid: "um Helsinki", timi: "5 klst. 45 mín. · 1 stopp (50 mín. í HEL)",
    verd: "ISK 91.931", lysing: "Stysta biðin af stopp-flugunum, en dýrara en um Amsterdam.",
    href: "https://www.google.com/travel/flights?q=Flights%20from%20KEF%20to%20GOT%20on%202027-01-27%20through%202027-02-01",
  },
  {
    nafn: "SAS", leid: "um Kaupmannahöfn", timi: "4 klst. 50 mín. · 1 stopp (1 klst. í CPH)",
    verd: "verð ekki sýnt á Google Flights", lysing: "Stysta heildarferðin — athugaðu verð beint hjá SAS.",
    href: "https://www.flysas.com",
  },
  {
    nafn: "Icelandair + Finnair", leid: "um Reykjavík/Helsinki", timi: "8 klst. 15 mín. · 1 stopp (3 klst. 15 mín.)",
    verd: "ISK 125.831", lysing: "Dýrasti og lengsti kosturinn af þessum.",
    href: "https://www.google.com/travel/flights?q=Flights%20from%20KEF%20to%20GOT%20on%202027-01-27%20through%202027-02-01",
  },
];

/** DIY-leiðin: beint til Köben, svo lest til Gautaborgar — oft hraðara og ódýrara en stopp-flugin að ofan. */
export const KAUPMANNAHOFN_LEID = {
  flug: {
    nafn: "Icelandair, beint KEF–CPH", timi: "3 klst. 15 mín., nánast daglega",
    verd: "frá ISK 30.721 á mann fram og til baka (1 fullorðinn, sömu dagsetningar)",
    href: "https://www.google.com/travel/flights?q=Flights%20from%20KEF%20to%20CPH%20on%202027-01-27%20through%202027-02-01",
  },
  lest: {
    nafn: "Öresundståg / SJ, beint Kaupmannahöfn H–Gautaborg C", timi: "um 3 klst. 20–50 mín., u.þ.b. á klukkutíma fresti",
    verd: "um 40–90 EUR aðra leið eftir því hvað er bókað snemma",
    href: "https://www.omio.com/trains/copenhagen-central-station/gothenburg-centralstation-mkgrq",
  },
};

const DAGAR = ["sun", "mán", "þri", "mið", "fim", "fös", "lau"];
const MANUDIR = ["jan", "feb", "mar", "apr", "maí", "jún", "júl", "ágú", "sep", "okt", "nóv", "des"];

const parse = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
export const addDays = (s: string, n: number) => {
  const d = parse(s);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const dagsetning = (s: string) => {
  const d = parse(s);
  return `${DAGAR[d.getUTCDay()]} ${d.getUTCDate()}. ${MANUDIR[d.getUTCMonth()]}`;
};
export const stutt = (s: string) => `${parse(s).getUTCDate()}. ${MANUDIR[parse(s).getUTCMonth()]}`;
const compact = (s: string) => s.slice(2, 4) + s.slice(5, 7) + s.slice(8, 10);
const dayOf = (s: string) => parse(s).getUTCDay();

export const fitsDays = (a: Airline, out: string, nights: number) =>
  !a.days || (a.days.includes(dayOf(out)) && a.days.includes(dayOf(addDays(out, nights))));

export type Settings = { out: string; nights: number; bags: number; rooms: number; gengi: number };

export type Package = {
  id: string;
  dest: Dest;
  airline: Airline;
  hotel: Hotel;
  flights: number;
  bags: number;
  hotelCost: number;
  total: number;
  fits: boolean;
};

/** Allir reiknaðir pakkar (flug + töskur + hótel með þekktu verði), ódýrastur fyrst. */
export function buildPackages(s: Settings): Package[] {
  const out: Package[] = [];
  for (const dest of Object.values(DESTS)) {
    for (const airline of dest.airlines) {
      for (const hotel of dest.hotels) {
        if (hotel.rate === null) continue;
        const flights = airline.fare * TRAVELLERS;
        const bags = s.bags * airline.bag * 2;
        const hotelCost = hotel.rate * s.rooms * s.nights;
        out.push({
          id: `${dest.code}-${airline.id}-${hotel.nafn}`,
          dest, airline, hotel, flights, bags, hotelCost,
          total: flights + bags + hotelCost,
          fits: fitsDays(airline, s.out, s.nights),
        });
      }
    }
  }
  return out.sort((a, b) => Number(b.fits) - Number(a.fits) || a.total - b.total);
}

const punkta = (n: number) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
/** £ → kr., rúnnað á þúsund */
export const isk = (pund: number, gengi: number) => punkta(Math.round((pund * gengi) / 1000) * 1000) + " kr.";
export const gbp = (n: number) => "£" + Math.round(n).toLocaleString("en-GB");

export function bookingUrl(query: string, s: Settings) {
  return `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(query)}&checkin=${s.out}&checkout=${addDays(s.out, s.nights)}&group_adults=3&group_children=1&age=10&no_rooms=${s.rooms}`;
}

export function flugLeit(dest: Dest, s: Settings): { nafn: string; href: string }[] {
  const ret = addDays(s.out, s.nights);
  return [
    { nafn: "Google Flights", href: `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights from KEF to ${dest.code} on ${s.out} through ${ret} for 3 adults 1 child nonstop`)}` },
    { nafn: "Skyscanner", href: `https://www.skyscanner.net/transport/flights/kef/${dest.skyscanner}/${compact(s.out)}/${compact(ret)}/?adultsv2=3&childrenv2=10&cabinclass=economy&preferdirects=true` },
    { nafn: "Kayak", href: `https://www.kayak.co.uk/flights/KEF-${dest.code}/${s.out}/${ret}/3adults/children-10?sort=price_a&fs=stops=0` },
    ...dest.flugLinks,
  ];
}
