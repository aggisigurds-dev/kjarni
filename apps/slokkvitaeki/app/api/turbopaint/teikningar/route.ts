import { NextRequest, NextResponse } from "next/server";
import { haedir } from "../haedir";
import { mapisFyrirPostnr, mapisFyrirSvf, mapisTeikningar } from "../mapis";
import { lesaHusnumer, siaHusnumer } from "../husnumer";

// Heimilisfang → landnúmer → teikningar.
//
// Þrjú kerfi — öll loka á vafrann með CORS, svo þau fara hér um:
//
//   ?heimilisfang=Skútuvogur 4
//     → Landeignaskrá HMS (geo.fasteignaskra.is). Skilar landnúmeri, HEITINÚMERI,
//       PÓSTNÚMERI og ISN93-hnitum. Póstnúmerið ræður hvaða skjalasafn á við.
//
//   ?landnr=105166
//     → FotoWeb-safn Reykjavíkur. Skilar `.info`-permalinkum sem
//       /api/turbopaint/fetch-plan kann ÞEGAR að sækja — teikningin fer því
//       beint á borðið án þess að notandinn afriti slóð.
//
//   ?landnr=122391&heitinr=1030450&svf=1400
//     → Kortasjá sveitarfélagsins á map.is (Hafnarfjörður 1400, Garðabær 1300,
//       Kópavogur 1000) — sjá ../mapis.ts. Skilar beinum PDF-slóðum sem
//       fetch-plan sækir líka.
//
// ⚠️ BRODDSTAFIR: Landeignaskrá finnur ekkert fyrir "Skutuvogur". Staðfest
//    28.08.2026 — "Skútuvogur 4" skilar tveimur eignum, "Skutuvogur 4" engri.
//
// Utan þessara fjögurra sveitarfélaga er enginn teikningalisti til hér; þá er
// aðeins skilað hnitatengli á kortasjá ef hún er þekkt.

export const maxDuration = 30;

/* Útgáfumerki fylgir hverju svari. Tvisvar 28.08 taldi ég deploy lent af því
 * bið-skilyrðið mitt var merki sem GAMLI kóðinn gat líka gefið (landnúmerið
 * fannst grafið í ruslinu; tómt svar við rugli). Þetta er ótvírætt. */
const API_UTGAFA = "2026-09-20-husnumer-bil";

const LANDEIGN = "https://geo.fasteignaskra.is/landeignaskra/search";
const FOTOWEB = "https://skjalasafn.reykjavik.is";
const RVK_ARCHIVE = "/fotoweb/archives/5000-A%C3%B0aluppdr%C3%A6ttir/";

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
  const heitinr = (sp.get("heitinr") || "").replace(/[^0-9]/g, "");
  const svf = Number((sp.get("svf") || "").replace(/[^0-9]/g, "")) || 0;

  if (landnr && svf) return mapis(Number(landnr), Number(heitinr), svf);
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

  // „Fiskislóð 4" er ekki til sem stök eign — en „Fiskislóð 2 2-8" nær yfir númerið. Landeignaskrá skilar þá ENGU
  // fyrir leitina með númeri, svo gatan ein er sótt og húsnúmerasían hér að neðan finnur bilið sem á við.
  if (!raw.length && lesaHusnumer(q)) {
    const gataEin = q.replace(/\s*\d.*$/, "").trim();
    if (gataEin.length >= 2) {
      try {
        const r2 = await fetch(`${LANDEIGN}?term=${encodeURIComponent(gataEin)}`, {
          headers: { "User-Agent": "Kjarni-TurboPaint/1.0", Accept: "application/json, */*" },
        });
        if (r2.ok) {
          const aftur = JSON.parse(await r2.text()) as LeitRow[];
          if (Array.isArray(aftur)) raw = aftur;
        }
      } catch {
        /* fyrri niðurstaða (tóm) stendur */
      }
    }
  }

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
        // Heitinúmer Staðfangaskrár — kortasjár map.is lykla teikningar á það
        // ásamt landnúmerinu (staðfest 14.09: Strandgata 6 = L 122391 / H 1030450).
        heitinr: x.Heinum ? Number(x.Heinum) : null,
        label,
        postnr,
        x: x.X ?? null,
        y: x.Y ?? null,
        ...heimild(postnr, x.X ?? null, x.Y ?? null),
      };
    });

  // Húsnúmer í leitinni → AÐEINS það númer (sjá ../husnumer.ts). `gataFjoldi` segir kallaranum hve margar eignir
  // voru á götunni áður en síað var, svo hann geti sagt „ekkert skráð á þetta númer" í stað „ekkert fannst".
  const siad = siaHusnumer(results, q);
  return NextResponse.json({
    utgafa: API_UTGAFA,
    results: siad,
    numer: lesaHusnumer(q)?.nr ?? null,
    gataFjoldi: results.length,
  });
}

/** Hvaða skjalasafn á við þetta póstnúmer — og hvert má senda notandann. */
function heimild(postnr: number | null, x: number | null, y: number | null) {
  if (postnr && RVK_POSTNR.has(postnr)) {
    return { heimild: "reykjavik" as const, heimildNafn: "Skjalasafn Reykjavíkur", svf: null, ytriSlod: null };
  }
  const m = mapisFyrirPostnr(postnr);
  if (m) {
    return {
      heimild: "map.is" as const,
      heimildNafn: m.nafn,
      svf: m.svf,
      // Hnitin úr Landeignaskrá eru ISN93 (EPSG:3057) — sama og map.is notar
      // í @X,Y,zoom,snúningur. Því má djúptengja beint á eignina.
      ytriSlod:
        x != null && y != null
          ? `https://map.is/${m.slug}/@${Math.round(x)},${Math.round(y)},z2,0`
          : `https://map.is/${m.slug}/`,
    };
  }
  return {
    heimild: "óþekkt" as const,
    heimildNafn: null,
    svf: null,
    // Landeignaskráin virkar alltaf — betri lending en tómur listi.
    ytriSlod: null,
  };
}

/** Þrep 2b — map.is-sveitarfélag: landnúmer + heitinúmer → teikningalisti. */
async function mapis(landnr: number, heitinr: number, svf: number) {
  const sv = mapisFyrirSvf(svf);
  if (!sv) return bad(400, "Óþekkt sveitarfélagsnúmer");
  if (!heitinr) return bad(400, "Heitinúmer vantar — veldu heimilisfangið úr leitinni.");
  try {
    const { results, hrar } = await mapisTeikningar(landnr, heitinr, svf);
    return NextResponse.json({
      utgafa: API_UTGAFA,
      heimild: "map.is",
      heimildNafn: sv.nafn,
      landnr,
      heitinr,
      svf,
      fjoldi: results.length,
      gildandi: results.filter((x) => !x.urelt).length,
      hrar,
      results,
    });
  } catch (err) {
    return bad(502, err instanceof Error ? err.message : "Náði ekki í kortasjána");
  }
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
