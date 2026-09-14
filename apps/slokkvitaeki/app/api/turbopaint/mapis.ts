// Teikningar af byggingum hjá sveitarfélögum sem nota map.is (Loftmyndir):
// Hafnarfjörður, Garðabær, Kópavogur — sami „building_drawing"-hluti hjá öllum.
//
// Kortasjáin sjálf spyr /webservice/queryTeiknigrunn.php?landnumer=…&svfnr=…
// &heitinumer=… um lista yfir teikningar lóðarinnar og fær JSON-fylki með
// beinum PDF-slóðum. Þjónustan svarar AÐEINS með PHP-setu (PHPSESSID + TS-kaka)
// og `config.t`-lykli sem kortasíðan sjálf gefur út — ein seta dugar fyrir öll
// sveitarfélögin (staðfest 14.09.2026: Garðabæjar-seta svaraði Hafnarfjarðarlóð).
// Setan er geymd í minni þjónsins og endurnýjuð þegar þjónustan hafnar henni.
//
// Lóðin er auðkennd með LANDNÚMERI og HEITINÚMERI (Staðfangaskrá) — hvort
// tveggja kemur úr Landeignaskrá HMS (Landnr, Heinum) í heimilisfangaleitinni,
// svo engin WFS-fyrirspurn þarf til viðbótar. Staðfest 14.09.2026:
//   Strandgata 6 (HF)   → 63 teikningar (teikningar.hafnarfjordur.is)
//   Garðatorg 7 (GB)    → 1052 teikningar (teikningar.gardabaer.is)
//   Digranesvegur 1 (KP) → 337 teikningar (gagnasja.kopavogur.is)
// Allar skrárnar eru PDF og sækjanlegar beint án innskráningar.

import { haedir } from "./haedir";

export const MAPIS_BASE = "https://www.map.is";

export interface MapisSveitarfelag {
  slug: string;
  svf: number;
  nafn: string;
  postnr: number[];
}

// Staðfest gildi (config.svnumer á hverri kortasjá) — ekki ágiskuð.
export const MAPIS_SVEITARFELOG: MapisSveitarfelag[] = [
  { slug: "kopavogur", svf: 1000, nafn: "Kópavogur", postnr: [200, 201, 202, 203] },
  { slug: "gardabaer", svf: 1300, nafn: "Garðabær", postnr: [210, 211, 212, 225] },
  { slug: "hafnarfjordur", svf: 1400, nafn: "Hafnarfjörður", postnr: [220, 221] },
];

/** Hýslar sem teikningaskrárnar liggja á — fetch-plan leyfir nákvæmlega þessa. */
export const MAPIS_TEIKNINGA_HOSTS = [
  "teikningar.hafnarfjordur.is",
  "teikningar.gardabaer.is",
  "gagnasja.kopavogur.is",
];

export function mapisFyrirPostnr(postnr: number | null): MapisSveitarfelag | null {
  if (!postnr) return null;
  return MAPIS_SVEITARFELOG.find((s) => s.postnr.includes(postnr)) ?? null;
}

export function mapisFyrirSvf(svf: number): MapisSveitarfelag | null {
  return MAPIS_SVEITARFELOG.find((s) => s.svf === svf) ?? null;
}

/** Hrá röð eins og queryTeiknigrunn.php skilar henni. */
export interface MapisRow {
  lysing?: string | null;
  dagsetning?: string | null;
  hofundur_nafn?: string | null;
  tegund?: string | null;
  gerd?: string | null;
  status?: string | null;
  teikninganumer?: string | null;
  online_path?: string | null;
}

/** Sama snið og Reykjavíkur-teikningarnar í HeimilisfangLeit, auk gerd/hofundur. */
export interface MapisTeikning {
  filename: string;
  infoUrl: string;
  thumb: null;
  stada: string | null;
  dags: string | null;
  tegund: string | null;
  gerd: string | null;
  hofundur: string | null;
  lysing: string | null;
  bnnr: string | null;
  gata: null;
  urelt: boolean;
  haed: number[];
  stig: string[];
  kjallari: boolean;
  ris: boolean;
  grunnmynd: boolean;
}

function texti(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  // Garðabær skilar bókstaflega strengnum "null" í status-reitnum.
  return s && s.toLowerCase() !== "null" ? s : null;
}

/** Kortasjáin felur Ó/F (ógilt / fellt úr gildi) — hér merkt úrelt, ekki falið. */
export function mapisUrelt(status: string | null): boolean {
  return status === "Ó" || status === "ó" || status === "F" || status === "f";
}

export function mapisRowToTeikning(row: MapisRow): MapisTeikning | null {
  const slod = texti(row.online_path);
  if (!slod || !/^https:\/\//i.test(slod)) return null;
  let host = "";
  let filename = "teikning.pdf";
  try {
    const u = new URL(slod);
    host = u.hostname;
    filename = decodeURIComponent(u.pathname.split("/").pop() || filename);
  } catch {
    return null;
  }
  if (!MAPIS_TEIKNINGA_HOSTS.includes(host)) return null;
  const stada = texti(row.status);
  const lysing = texti(row.lysing);
  const gerd = texti(row.gerd);
  return {
    filename,
    infoUrl: slod,
    thumb: null,
    stada: stada === null ? null : mapisUrelt(stada) ? (stada.toUpperCase() === "F" ? "Fellt úr gildi" : "Ógilt") : stada,
    dags: texti(row.dagsetning),
    tegund: texti(row.tegund),
    gerd,
    hofundur: texti(row.hofundur_nafn),
    lysing,
    bnnr: texti(row.teikninganumer),
    gata: null,
    urelt: mapisUrelt(stada),
    ...haedir(lysing, gerd),
  };
}

/** Nýjast fremst; dagsetningarlausar aftast; gildar á undan úreltum. */
export function mapisSort(a: MapisTeikning, b: MapisTeikning): number {
  if (a.urelt !== b.urelt) return a.urelt ? 1 : -1;
  return (b.dags || "").localeCompare(a.dags || "");
}

// ── Seta við map.is ────────────────────────────────────────────────────────
interface Seta {
  cookie: string;
  token: string;
  sott: number;
}

const SETA_LIFTIMI_MS = 20 * 60 * 1000;
let seta: Seta | null = null;
let setaLofordi: Promise<Seta> | null = null;

async function nySeta(): Promise<Seta> {
  const res = await fetch(`${MAPIS_BASE}/hafnarfjordur/`, {
    headers: { "User-Agent": "Mozilla/5.0 Kjarni-TurboPaint/1.0", Accept: "text/html" },
    redirect: "follow",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`map.is svaraði ${res.status}`);
  const html = await res.text();
  const token = (html.match(/config\.t\s*=\s*"([a-z0-9]{20,})"/) || [])[1];
  if (!token) throw new Error("Fann ekki lykil kortasjárinnar");
  const setCookies =
    typeof (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie === "function"
      ? (res.headers as Headers & { getSetCookie: () => string[] }).getSetCookie()
      : [res.headers.get("set-cookie") || ""];
  const cookie = setCookies
    .map((c) => c.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
  if (!/PHPSESSID=/.test(cookie)) throw new Error("Kortasjáin gaf enga setu");
  return { cookie, token, sott: Date.now() };
}

async function faSetu(endurnyja = false): Promise<Seta> {
  if (!endurnyja && seta && Date.now() - seta.sott < SETA_LIFTIMI_MS) return seta;
  if (!setaLofordi) {
    setaLofordi = nySeta()
      .then((s) => {
        seta = s;
        return s;
      })
      .finally(() => {
        setaLofordi = null;
      });
  }
  return setaLofordi;
}

/**
 * Teikningar einnar lóðar úr kortasjá sveitarfélagsins. Tómt fylki þegar
 * engin teikning er skráð; villa aðeins þegar þjónustan sjálf bregst.
 */
export async function mapisTeikningar(
  landnr: number,
  heitinr: number,
  svf: number
): Promise<{ results: MapisTeikning[]; hrar: number }> {
  const spyrja = async (s: Seta) => {
    const url =
      `${MAPIS_BASE}/webservice/queryTeiknigrunn.php?landnumer=${landnr}` +
      `&svfnr=${svf}&heitinumer=${heitinr}&t=${s.token}`;
    return fetch(url, {
      headers: {
        Cookie: s.cookie,
        Referer: `${MAPIS_BASE}/${mapisFyrirSvf(svf)?.slug ?? "hafnarfjordur"}/`,
        "User-Agent": "Mozilla/5.0 Kjarni-TurboPaint/1.0",
        "X-Requested-With": "XMLHttpRequest",
        Accept: "application/json, text/plain, */*",
      },
      cache: "no-store",
    });
  };

  const lesa = async (res: Response): Promise<MapisRow[]> => {
    if (!res.ok) throw new Error(`Kortasjáin svaraði ${res.status}`);
    const text = await res.text();
    if (text.trim().startsWith("[")) {
      try {
        return JSON.parse(text) as MapisRow[];
      } catch {
        throw new Error("Kortasjáin skilaði ólesanlegu svari");
      }
    }
    if (!/Engar niðurstöður/i.test(text)) {
      throw new Error(`Kortasjáin svaraði óvænt: ${text.slice(0, 80)}`);
    }
    return [];
  };

  let s = await faSetu();
  let res = await spyrja(s);
  if (res.status === 403) {
    s = await faSetu(true);
    res = await spyrja(s);
  }
  let rows = await lesa(res);
  // Tómt svar á eldri setu er tortryggilegt (Garðatorg 7 skilaði 0 í stað ~1050 einu
  // sinni 14.09.2026 og 10-mín skyndiminni niðurstreymis geymdi tómið) — ný seta og
  // ein endurtekning áður en tóminu er trúað.
  if (rows.length === 0 && Date.now() - s.sott > 30_000) {
    rows = await lesa(await spyrja(await faSetu(true)));
  }
  const results = rows
    .map(mapisRowToTeikning)
    .filter((t): t is MapisTeikning => t !== null)
    .sort(mapisSort);
  return { results, hrar: rows.length };
}
