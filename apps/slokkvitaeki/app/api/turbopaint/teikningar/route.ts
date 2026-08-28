import { NextRequest, NextResponse } from "next/server";

// Heimilisfang → landnúmer → teikningar.
//
// Tvö þrep, tvö ólík kerfi — bæði loka á vafrann með CORS, svo þau fara hér um:
//
//   ?heimilisfang=Skútuvogur 4
//     → Landeignaskrá HMS (geo.fasteignaskra.is). Skilar landnúmeri, PÓSTNÚMERI
//       og ISN93-hnitum. Póstnúmerið ræður hvaða skjalasafn á við; hnitin gera
//       okkur kleift að djúptengja í map.is fyrir sveitarfélög utan Reykjavíkur.
//
//   ?landnr=105166
//     → FotoWeb-safn Reykjavíkur. Skilar `.info`-permalinkum sem
//       /api/turbopaint/fetch-plan kann ÞEGAR að sækja — teikningin fer því
//       beint á borðið án þess að notandinn afriti slóð.
//
// ⚠️ BRODDSTAFIR: Landeignaskrá finnur ekkert fyrir "Skutuvogur". Staðfest
//    28.08.2026 — "Skútuvogur 4" skilar tveimur eignum, "Skutuvogur 4" engri.
//
// ⚠️ AÐEINS REYKJAVÍK Á TEIKNINGAR HÉR. Skjalasafn Reykjavíkur nær aðeins yfir
//    Reykjavík. Kópavogur og Garðabær eru á map.is með eigin kortum; fyrir þau
//    skilum við djúptengli á hnitin í stað teikningalista, svo notandinn lendi
//    á réttum stað í stað þess að fá tóman lista og halda að kerfið sé bilað.

export const maxDuration = 30;

/* Útgáfumerki fylgir hverju svari. Tvisvar 28.08 taldi ég deploy lent af því
 * bið-skilyrðið mitt var merki sem GAMLI kóðinn gat líka gefið (landnúmerið
 * fannst grafið í ruslinu; tómt svar við rugli). Þetta er ótvírætt. */
const API_UTGAFA = "2026-08-28-nfc";

const LANDEIGN = "https://geo.fasteignaskra.is/landeignaskra/search";
const FOTOWEB = "https://skjalasafn.reykjavik.is";
const RVK_ARCHIVE = "/fotoweb/archives/5000-A%C3%B0aluppdr%C3%A6ttir/";

// Sveitarfélög sem Agnar hefur staðfest slóðamynstrið á (map.is/<slug>/@X,Y,z,0
// með ISN93-hnitum). Aðeins staðfest gildi hér — ekki ágiskuð.
const MAP_IS: { slug: string; nafn: string; postnr: number[] }[] = [
  { slug: "kopavogur", nafn: "Kópavogur", postnr: [200, 201, 202, 203] },
  { slug: "gardabaer", nafn: "Garðabær", postnr: [210, 211, 212, 225] },
];
const RVK_POSTNR = new Set([
  101, 102, 103, 104, 105, 107, 108, 109, 110, 111, 112, 113, 116,
  121, 123, 124, 125, 127, 128, 129, 130, 132, 155, 161, 162,
]);

type LeitRow = { Landnr?: number; Vef_Birting?: string; X?: number; Y?: number; Heinum?: number };

/** Samanburður óháður hástöfum, aukabilum og rithætti broddstafa. */
function norm(t: string) {
  return t
    .normalize("NFC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function bad(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  /* ⚠️ NFC-SAMRÆMING. Android/iOS-lyklaborð senda "ú" sem TVO stafi (u + laus
   * broddur, NFD) þar sem tölvan sendir einn (NFC). Landeignaskrá hunsar lausa
   * broddinn, leitar að "Sku…" og skilar Skuld, Skál, Eskiás — algjörlega
   * óskyldum eignum. Staðfest 28.08: NFC skilar Skútuvogi 4, NFD skilar Skuld.
   * Þetta gerði leitina ónothæfa í síma þótt hún virkaði á tölvu. */
  const heimilisfang = (sp.get("heimilisfang") || "").normalize("NFC").trim();
  const landnr = (sp.get("landnr") || "").replace(/[^0-9]/g, "");

  if (landnr) return teikningar(landnr);
  if (heimilisfang.length >= 2) return heimilisfong(heimilisfang);
  return bad(400, "Sláðu inn a.m.k. tvo stafi.");
}

/** Þrep 1 — heimilisfang → landnúmer + póstnúmer + hnit. */
async function heimilisfong(q: string) {
  let raw: LeitRow[];
  try {
    const r = await fetch(`${LANDEIGN}?term=${encodeURIComponent(q)}`, {
      headers: { "User-Agent": "Kjarni-TurboPaint/1.0", Accept: "application/json, */*" },
    });
    if (!r.ok) return bad(502, `Landeignaskrá svaraði ${r.status}`);
    // Content-Type er 'application/javascript' þótt innihaldið sé JSON — því
    // er textinn þáttaður sjálfur en ekki með r.json().
    raw = JSON.parse(await r.text()) as LeitRow[];
  } catch {
    return bad(502, "Náði ekki í Landeignaskrá");
  }
  if (!Array.isArray(raw)) raw = [];

  /* Landeignaskrá er LAUS í leit — hún skilar einhverju sem líkist inntakinu
   * fremur en engu (staðfest: "zzzqqq ekkert hér" skilaði Héraðsdal). Fyrir
   * notandann er það verra en ekkert: hann skrifar Skútuvogur og fær Eskiás,
   * og heldur að kerfið sé bilað. Hér er haldið eftir því sem byrjar á
   * götuheitinu sem slegið var inn; finnist ekkert er sagt frá því hreint út. */
  const gata = norm(q.replace(/\s*\d.*$/, ""));
  const results = raw
    .filter((x) => x.Landnr)
    .filter((x) => {
      if (gata.length < 2) return true;
      const label = String(x.Vef_Birting || "");
      return norm(label.split("(")[0]).startsWith(gata);
    })
    .map((x) => {
      const label = String(x.Vef_Birting || "").replace(/\s+/g, " ").trim();
      // "Skútuvogur 4 (104) - L 105166" → póstnúmerið er í svigunum.
      const postnr = Number((label.match(/\((\d{3})\)/) || [])[1]) || null;
      return {
        landnr: Number(x.Landnr),
        label,
        postnr,
        x: x.X ?? null,
        y: x.Y ?? null,
        ...heimild(postnr, x.X ?? null, x.Y ?? null),
      };
    });

  return NextResponse.json({ utgafa: API_UTGAFA, results });
}

/** Hvaða skjalasafn á við þetta póstnúmer — og hvert má senda notandann. */
function heimild(postnr: number | null, x: number | null, y: number | null) {
  if (postnr && RVK_POSTNR.has(postnr)) {
    return { heimild: "reykjavik" as const, heimildNafn: "Skjalasafn Reykjavíkur", ytriSlod: null };
  }
  const m = postnr ? MAP_IS.find((s) => s.postnr.includes(postnr)) : null;
  if (m && x != null && y != null) {
    return {
      heimild: "map.is" as const,
      heimildNafn: m.nafn,
      // Hnitin úr Landeignaskrá eru ISN93 (EPSG:3057) — sama og map.is notar
      // í @X,Y,zoom,snúningur. Því má djúptengja beint á eignina.
      ytriSlod: `https://map.is/${m.slug}/@${Math.round(x)},${Math.round(y)},z2,0`,
    };
  }
  return {
    heimild: "óþekkt" as const,
    heimildNafn: null,
    // Landeignaskráin virkar alltaf — betri lending en tómur listi.
    ytriSlod: null,
  };
}

// Hæða-þáttun úr lýsingarreitnum (214). Agnar 28.08: "ég þarf helst að finna
// hæðarnar — hæð 1, hæð 2, kjallari". Raunveruleg gildi úr safninu:
//   "Grunnmynd 1. hæð" · "Grunnmynd 2. hæð" · "Grunnmynd 1. hæð, snið"
//   "Grunnmynd 2. hæð, útlit austur, suður, norður"
//   "Útlit norður, suður, vestur" · "Útlit N, V, S" · "Skráningartafla"
//   "Afstöðumynd, byggingarlýsing, snið" · "Teikningasett"
// Ein teikning getur borið FLEIRI en eina hæð, svo þetta skilar lista.
function haedir(lysing: string | null) {
  const t = (lysing || "").toLowerCase();
  const haed: number[] = [];
  for (const m of t.matchAll(/(\d+)\.\s*h[æa][eð]?ð/g)) {
    const n = Number(m[1]);
    if (n && !haed.includes(n)) haed.push(n);
  }
  const kjallari = /kjallar/.test(t);
  const ris = /ris|ris\.|rish[æa]ð/.test(t);
  // NEFNDAR hæðir sem bera enga tölu. Staðfest á Skútuvogi 2: "grunnmynd
  // milligólf, snið" datt út úr hæða-síunni af því orðið er ekki tala, og
  // teikningin varð ófinnanleg þótt hún sé grunnmynd af hæð.
  const stig: string[] = [];
  if (kjallari) stig.push("Kjallari");
  if (/milligólf|milligolf/.test(t)) stig.push("Milligólf");
  if (/jarðh[æa]ð|jardh/.test(t)) stig.push("Jarðhæð");
  if (ris) stig.push("Ris");
  return {
    haed: haed.sort((a, b) => a - b),
    stig,
    kjallari,
    ris,
    // Grunnmynd = teikning AF hæð. Útlit/snið/skráningartafla/afstöðumynd eru
    // annars konar blöð og eiga ekki heima í hæða-síunni.
    grunnmynd: /grunnmynd/.test(t) || haed.length > 0 || stig.length > 0,
  };
}

/** Þrep 2 — landnúmer → teikningar úr FotoWeb-safni Reykjavíkur. */
const MAX_SIDUR = 6;   // 25 á síðu → allt að 150 blöð; Skútuvogur 4 er 66.

async function teikningar(landnr: string) {
  // ⚠️ SAFNIÐ SÍÐUSKIPTIR. Fyrsta svarið gefur 25 blöð en `paging.next` vísar á
  // framhaldið — Skútuvogur 4 er með 66 (staðfest í viðmóti safnsins 28.08).
  // Fyrsta útgáfan sótti bara fyrstu síðuna og hefði því þagað yfir tveimur
  // þriðju af teikningunum, þar á meðal hæðum sem vantaði.
  const assets: Record<string, unknown>[] = [];
  let next: string | null = `${RVK_ARCHIVE}?q=${encodeURIComponent(landnr)}`;
  let bud = MAX_SIDUR;
  try {
    while (next && bud-- > 0) {
      const r: Response = await fetch(FOTOWEB + next, {
        headers: {
          // Án þessa haus skilar safnið HTML-síðu. Með honum kemur hrein
          // eignaskrá með `.info`-permalinkum og forskoðunum.
          Accept: "application/vnd.fotoware.assetlist+json",
          "User-Agent": "Kjarni-TurboPaint/1.0",
        },
      });
      if (!r.ok) return bad(502, `Skjalasafnið svaraði ${r.status}`);
      const d = (await r.json()) as {
        data?: Record<string, unknown>[];
        paging?: { next?: string };
      };
      if (Array.isArray(d.data)) assets.push(...d.data);
      next = d.paging?.next || null;
    }
  } catch {
    return bad(502, "Náði ekki í skjalasafnið");
  }
  const results = assets.map((a) => {
    const md = (a.metadata || {}) as Record<string, { value?: unknown }>;
    const gildi = (k: string) => {
      const v = md[k]?.value;
      return v == null ? null : String(Array.isArray(v) ? v[0] : v).trim() || null;
    };
    const previews = (Array.isArray(a.previews) ? a.previews : []) as {
      href?: string;
      width?: number;
    }[];
    // Smámynd: minnsta forskoðun ≥200px — nógu skörp í rist, létt að sækja.
    const thumb =
      previews
        .filter((p) => p.href && (p.width || 0) >= 200)
        .sort((p, q2) => (p.width || 0) - (q2.width || 0))[0]?.href || null;

    return {
      filename: String(a.filename || ""),
      // `.info`-permalinkurinn — nákvæmlega það sem fetch-plan tekur við.
      infoUrl: a.href ? FOTOWEB + String(a.href) : null,
      thumb: thumb ? FOTOWEB + thumb : null,
      stada: gildi("7"),        // t.d. "Samþykkt"
      dags: gildi("30"),        // skráningardagur
      tegund: gildi("205"),     // t.d. "Aðaluppdrættir"
      // Reitur 214 er LÝSINGIN — "Grunnmynd 1. hæð", "Útlit norður, suður,
      // vestur". Á FotoWeb sést hún aðeins þegar bendlinum er haldið yfir
      // myndinni, svo það var ekki hægt að sjá hvaða hæð teikning var án þess
      // að sveima yfir hverja og eina (Agnar 28.08). Hún fer nú á spjaldið.
      lysing: gildi("214"),
      bnnr: gildi("209"),       // BN…/USK… byggingarleyfisnúmer
      ...haedir(gildi("214")),
      gata: [gildi("203"), gildi("204")].filter(Boolean).join(" ") || null,
    };
  }).filter((x) => x.infoUrl);

  // ÚRELT-MERKING (Agnar 28.08: "það eru alltaf nýjustu teikningarnar fyrst,
  // síðan eftir það eru það bara úreltar teikningar — bara notast við nýjustu").
  //
  // Röðin sem safnið skilar er EKKI áreiðanlega dagsett — staðfest 28.08:
  // 2019-blað sat inni á milli 2022- og 2021-blaða. Því er raðað á dagsetningu
  // hér frekar en að treysta röðinni. Fyrir hverja hæð (eða, á blöðum sem sýna
  // enga hæð, fyrir hverja lýsingu) gildir aðeins NÝJASTA blaðið; eldri eintök
  // eru merkt úrelt og viðmótið felur þau nema beðið sé um þau.
  // Lyklað á STAKA hæð, ekki á samsetninguna: blað sem sýnir "1. hæð, 2. hæð"
  // á að víkja fyrir nýrri blöðum sem þekja hvora hæð fyrir sig. Annars lifði
  // 2014-blað af þótt 2022-blöð sýndu báðar hæðirnar (staðfest 28.08).
  const lyklar = (r: (typeof results)[number]) => {
    const k: string[] = [];
    r.stig.forEach((sn) => k.push("s:" + sn));
    r.haed.forEach((h) => k.push("h" + h));
    if (!k.length) k.push("l:" + (r.lysing || r.filename).toLowerCase().replace(/\s+/g, " ").trim());
    return k;
  };
  const nyjast = new Map<string, string>();
  for (const r of results) {
    for (const k of lyklar(r)) {
      const fyrir = nyjast.get(k);
      if (!fyrir || (r.dags || "") > fyrir) nyjast.set(k, r.dags || "");
    }
  }
  // Blað gildir ef það er NÝJASTA blaðið fyrir a.m.k. eina hæð sem það sýnir.
  const merkt = results.map((r) => ({
    ...r,
    urelt: !lyklar(r).some((k) => nyjast.get(k) === (r.dags || "")),
  }));
  // Nýjast fremst — svo rétta teikningin sé alltaf efst í hverri síu.
  merkt.sort((a, b) => (b.dags || "").localeCompare(a.dags || ""));

  return NextResponse.json({
    utgafa: API_UTGAFA,
    landnr: Number(landnr),
    fjoldi: merkt.length,
    gildandi: merkt.filter((x) => !x.urelt).length,
    results: merkt,
  });
}
