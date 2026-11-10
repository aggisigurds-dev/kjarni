/** Umslög laga fundin sjálfkrafa eftir heiti lagsins (opin leit iTunes).
 *  Sjálfvirkt val er aðeins gert þegar heiti lagsins og niðurstaðan passa
 *  örugglega saman; annars velur notandinn sjálfur úr lista. */

export type CoverHit = { title: string; artist: string; album: string; art: string };

/** Orð í skráarheitum sem segja ekkert um hvaða lag þetta er. */
const NOISE = new Set(["remix", "mix", "edit", "version", "techno", "official", "audio", "video", "lyrics", "hq", "hd", "remastered", "remaster", "live", "cover", "feat", "ft", "the", "a"]);

/** "Mötley Crüe – Kickstart (Live)!" → "motley crue kickstart" */
export function plain(text: string): string {
  return text
    .toLowerCase()
    .replace(/[([{][^)\]}]*[)\]}]/g, " ")
    .replace(/[ðþæ]/g, (c) => ({ ð: "d", þ: "th", æ: "ae" })[c] ?? c)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const words = (text: string) => plain(text).split(" ").filter((w) => w && !NOISE.has(w));

/** Leitarstrengur úr heiti lags (án orða eins og „remix“). */
export function coverQuery(name: string): string {
  return words(name).join(" ");
}

/** Fyrsta niðurstaðan sem passar örugglega við heitið: öll orð titilsins eru
 *  í heitinu, og heitið inniheldur ekkert umfram titil og flytjanda. Þannig
 *  fær „Kickstart My Heart“ sitt umslag, en „Rock Remix“ ekkert. */
export function confidentCover(name: string, hits: CoverHit[]): CoverHit | null {
  const n = words(name);
  if (!n.length) return null;
  for (const hit of hits) {
    const title = words(hit.title);
    if (!title.length || title.join("").length < 3) continue;
    const known = new Set([...title, ...words(hit.artist)]);
    if (title.every((w) => n.includes(w)) && n.every((w) => known.has(w))) return hit;
  }
  return null;
}

/** Slóð á umslagið í stærðinni `size` (iTunes skilar 100×100 slóð). */
export function artAt(url: string, size = 300): string {
  return url.replace(/\/\d+x\d+(bb)?\.(jpg|png)$/i, `/${size}x${size}bb.$2`);
}

type ItunesResult = { trackName?: string; artistName?: string; collectionName?: string; artworkUrl100?: string };

export function parseItunes(json: unknown): CoverHit[] {
  const results = (json as { results?: ItunesResult[] } | null)?.results;
  if (!Array.isArray(results)) return [];
  const seen = new Set<string>();
  const out: CoverHit[] = [];
  for (const r of results) {
    if (!r || typeof r.artworkUrl100 !== "string" || !/^https:\/\/[a-z0-9-]+\.mzstatic\.com\//.test(r.artworkUrl100)) continue;
    const art = artAt(r.artworkUrl100);
    if (seen.has(art)) continue;
    seen.add(art);
    out.push({ title: r.trackName ?? "", artist: r.artistName ?? "", album: r.collectionName ?? "", art });
  }
  return out;
}

/** Leitar að umslögum fyrir heitið. Tómt ef ekkert finnst eða netið vantar. */
export async function searchCovers(name: string, signal?: AbortSignal): Promise<CoverHit[]> {
  const term = coverQuery(name) || plain(name);
  if (!term) return [];
  try {
    const res = await fetch(`https://itunes.apple.com/search?entity=song&limit=8&term=${encodeURIComponent(term)}`, { signal });
    if (!res.ok) return [];
    return parseItunes(await res.json());
  } catch {
    return [];
  }
}
