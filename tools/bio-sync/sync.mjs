// Bíó-samstilling — keyrir á PC-tölvunni heima (þar sem Plex og diskarnir eru).
// Les Plex (127.0.0.1:32400), leitar að þáttaskrám á öllum diskum, ber saman við TVmaze
// og sækir nýja þætti (TVmaze) og nýjar myndir (iTunes-listinn). Sendir samantektina í
// Supabase (bio_gogn, hluti 'safn') sem síðan /bio les. Sjá README.md.
//
//   node sync.mjs            samstilla og senda
//   node sync.mjs --prufa    samstilla en senda ekki (skrifar aðeins sidasta.json)
import { execSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Lykill, tengill og skyndiminni búa utan repo-sins svo sami lykill gildi hvaðan sem keyrt er.
const DIR = path.join(os.homedir(), ".kjarni-bio");
fs.mkdirSync(DIR, { recursive: true });
// Publishable-lykillinn er opinber (sá sami og í apps/slokkvitaeki/app/lib/supabase.ts).
const SUPABASE_URL = "https://osfdzskyvisifcwyjkuk.supabase.co";
const SUPABASE_KEY = "sb_publishable_YVpznM5EK01qOdevQwOcIg_rMjTkT7f";
const SIDA = process.env.BIO_SIDA || "https://kjarni.vercel.app/bio";
const PLEX = process.env.PLEX_URL || "http://127.0.0.1:32400";
const PRUFA = process.argv.includes("--prufa");
const IDAG = new Date().toISOString().slice(0, 10);
const NU = Math.floor(Date.now() / 1000);
const DAGUR = 86400;
const NYIR_DAGAR = 14; // hversu langt aftur „nýir þættir“ ná

const VID = /\.(mkv|mp4|avi|m4v|mov|wmv|ts|webm|mpg|divx)$/i;
const SLEPPA = new Set(["$recycle.bin", "system volume information", "windows", "program files", "program files (x86)",
  "programdata", "appdata", "node_modules", ".git", "recovery", "perflogs", "$winreagent", "projects", "my drive", "shared drives"]);

const log = (...a) => console.log(new Date().toISOString().slice(0, 19).replace("T", " "), ...a);
const norm = (s) => String(s ?? "").toLowerCase().replace(/&/g, "and").replace(/\((19|20)\d\d\)/g, "")
  .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "").replace(/^(.+?)(19|20)\d\d$/, "$1");
const kodi = (s, e) => `S${String(s).padStart(2, "0")}E${String(e).padStart(2, "0")}`;
const hreinsa = (html, n = 260) => {
  const t = String(html ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t;
};

// ── Lykill: býr aðeins hér (.lykill) og í vafranum. Gagnagrunnurinn sér aðeins sha256 af honum.
function lykill() {
  const f = path.join(DIR, ".lykill");
  let k = fs.existsSync(f) ? fs.readFileSync(f, "utf8").trim() : "";
  if (k.length < 32) {
    k = crypto.randomBytes(32).toString("base64url");
    fs.writeFileSync(f, k + "\n");
    log("Nýr lykill búinn til (.lykill)");
  }
  fs.writeFileSync(path.join(DIR, "tengill.txt"), `${SIDA}#k=${k}\n`);
  return k;
}
const KEY = lykill();
const SKUFFA = crypto.createHash("sha256").update(KEY, "utf8").digest("hex");

function plexToken() {
  if (process.env.PLEX_TOKEN) return process.env.PLEX_TOKEN;
  try {
    const out = execSync('reg query "HKCU\\Software\\Plex, Inc.\\Plex Media Server" /v PlexOnlineToken',
      { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    const m = out.match(/PlexOnlineToken\s+REG_SZ\s+(\S+)/);
    if (m) return m[1];
  } catch {}
  const p = path.join(process.env.LOCALAPPDATA ?? "", "Plex Media Server", "Preferences.xml");
  const m = fs.existsSync(p) && fs.readFileSync(p, "utf8").match(/PlexOnlineToken="([^"]+)"/);
  if (m) return m[1];
  throw new Error("Finn ekki Plex-token (registry eða Preferences.xml)");
}
const PLEX_TOKEN = plexToken();

async function plex(p) {
  const r = await fetch(PLEX + p, { headers: { Accept: "application/json", "X-Plex-Token": PLEX_TOKEN } });
  if (!r.ok) throw new Error(`Plex ${r.status} á ${p}`);
  return (await r.json()).MediaContainer;
}

let sidastaKall = 0;
async function tvm(p, tilraun = 0) {
  const bid = sidastaKall + 600 - Date.now(); // TVmaze leyfir ~20 köll / 10 s
  if (bid > 0) await new Promise((r) => setTimeout(r, bid));
  sidastaKall = Date.now();
  const r = await fetch("https://api.tvmaze.com" + p, { headers: { "User-Agent": "kjarni-bio-sync/1.0" } });
  if (r.status === 404) return null;
  if (r.status === 429 && tilraun < 3) { await new Promise((res) => setTimeout(res, 5000)); return tvm(p, tilraun + 1); }
  if (!r.ok) throw new Error(`TVmaze ${r.status} á ${p}`);
  return r.json();
}

async function sb(method, q, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${q}`, {
    method,
    headers: {
      apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "x-bio-key": KEY, "Content-Type": "application/json",
      ...(method === "POST" ? { Prefer: "resolution=merge-duplicates,return=minimal" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return method === "GET" ? r.json() : null;
}

function ganga(mappa, ut) {
  let ents;
  try { ents = fs.readdirSync(mappa, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = path.join(mappa, e.name);
    if (e.isDirectory()) { if (!SLEPPA.has(e.name.toLowerCase())) ganga(p, ut); }
    else if (e.isFile() && VID.test(e.name)) ut.push(p);
  }
}

function bil(nums) {
  nums.sort((a, b) => a - b);
  const ut = [];
  for (let i = 0; i < nums.length; i++) {
    let j = i;
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
    const p = (n) => "E" + String(n).padStart(2, "0");
    ut.push(i === j ? p(nums[i]) : `${p(nums[i])}–${p(nums[j])}`);
    i = j;
  }
  return ut.join(", ");
}
function eftirSeriu(lyklar) {
  const m = new Map();
  for (const k of lyklar) { const [s, e] = k.split("x").map(Number); (m.get(s) || m.set(s, []).get(s)).push(e); }
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([s, eps]) => ({ s, ep: bil(eps), n: eps.length }));
}

async function main() {
  const t0 = Date.now();

  // 1. Plex-söfnin
  const secs = (await plex("/library/sections")).Directory ?? [];
  const allarMoppur = secs.flatMap((s) => (s.Location ?? []).map((l) => l.path.toLowerCase()));
  const advaranir = [];
  for (const s of secs) {
    for (const l of s.Location ?? []) {
      if (fs.existsSync(l.path)) continue;
      const stofn = path.basename(l.path).split(" ")[0];
      const gisk = stofn ? path.join(path.dirname(l.path), stofn) : "";
      const tillaga = gisk && fs.existsSync(gisk) && !allarMoppur.includes(gisk.toLowerCase()) ? gisk : null;
      advaranir.push({ safn: s.title, mappa: l.path, tillaga });
    }
  }
  const thaettir = [];
  for (const s of secs.filter((x) => x.type === "show")) {
    for (const m of (await plex(`/library/sections/${s.key}/all?type=2&includeGuids=1`)).Metadata ?? []) thaettir.push({ ...m, safn: s.title });
  }
  const myndir = [];
  for (const s of secs.filter((x) => x.type === "movie")) {
    for (const m of (await plex(`/library/sections/${s.key}/all?type=1`)).Metadata ?? []) myndir.push({ n: norm(m.title), y: m.year });
  }
  log(`Plex: ${thaettir.length} þættir, ${myndir.length} myndir, ${advaranir.length} möppur sem eru ekki til`);
  const thattaNofn = new Map(thaettir.map((s) => [norm(s.title), s]));
  const iPlexMynd = (titill, ar) => myndir.some((m) => m.n === norm(titill) && (!ar || !m.y || Math.abs(m.y - ar) <= 1));
  const iPlexThattur = (nafn, ar) => {
    const s = thattaNofn.get(norm(nafn));
    return Boolean(s && (!ar || !s.year || Math.abs(s.year - ar) <= 1));
  };

  // 2. Þáttaskrár á diskunum (SxxEyy eða 1x01 í skráarheitinu)
  const drif = "CDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((l) => `${l}:\\`)
    .filter((d) => { try { return fs.statSync(d).isDirectory(); } catch { return false; } });
  const skrar = [];
  for (const d of drif) ganga(d, skrar);
  // Fjölþáttaskrár: S01E01E02 / S01E01-E02 (listi) og S01E01-03 (bil) — „-720p“ o.þ.h. telst ekki með.
  const diskur = skrar.flatMap((f) => {
    const b = path.basename(f);
    const m = b.match(/^(.*?)[ ._\-[(]*S(\d{1,2})[ ._]?E(\d{1,3})((?:[ ._]?-?[ ._]?E\d{1,3}|-\d{1,3}(?![\dp]))*)/i)
      || b.match(/^(.*?)[ ._-]+(\d{1,2})x(\d{2,3})\b/i);
    if (!m) return [];
    const fyrsti = +m[3];
    const fleiri = [...(m[4] ?? "").matchAll(/\d{1,3}/g)].map((x) => +x[0]);
    let eps = [fyrsti, ...fleiri];
    const sidasti = fleiri.length ? Math.max(...fleiri) : fyrsti;
    if ((m[4] ?? "").includes("-") && sidasti > fyrsti && sidasti - fyrsti <= 10) {
      eps = Array.from({ length: sidasti - fyrsti + 1 }, (_, i) => fyrsti + i);
    }
    const forskeyti = norm(m[1]);
    const moppur = path.dirname(f).split(path.sep).map(norm);
    return [...new Set(eps)].map((e) => ({ forskeyti, s: +m[2], e, moppur }));
  });
  // Möppuheiti passar aðeins ef það ER nafn þáttarins, mögulega með ári, seríu eða gæðamerki á eftir —
  // ekki önnur sería með sama upphaf („The Boys Presents Diabolical“ ≠ „The Boys“).
  const moppaPassar = (m, n) => m === n || (m.startsWith(n) && /^((19|20)\d\d|s\d|season|complete|\d{3,4}p)/.test(m.slice(n.length)));
  log(`Diskar ${drif.join(" ")}: ${skrar.length} myndbandsskrár, ${diskur.length} með þáttanúmeri`);

  // 3. Hvaða þáttum er fylgst með:
  //    a) listinn á síðunni (bio_gogn 'fylgjast') og fylgjast.txt hér (eitt nafn í línu)
  //    b) virkni í Plex: horft síðustu 90 daga, sería/þáttur bættist við síðustu 30 daga, og 10 síðast séðu
  let handvirk = [];
  try {
    const rod = await sb("GET", `bio_gogn?select=gogn&hluti=eq.fylgjast&skuffa=eq.${SKUFFA}`);
    handvirk = Array.isArray(rod?.[0]?.gogn?.thaettir) ? rod[0].gogn.thaettir.filter((h) => Number.isInteger(h?.id)) : [];
  } catch (e) { log("Les ekki fylgjast-listann á síðunni:", e.message); }
  const txt = path.join(DIR, "fylgjast.txt");
  const nafnalisti = fs.existsSync(txt)
    ? fs.readFileSync(txt, "utf8").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#")) : [];

  const nyBaett = new Map(); // ratingKey þáttar → síðast bætt við (sería eða þáttur)
  for (const s of secs.filter((x) => x.type === "show")) {
    for (const m of (await plex(`/library/sections/${s.key}/recentlyAdded?X-Plex-Container-Start=0&X-Plex-Container-Size=150`)).Metadata ?? []) {
      const key = m.type === "season" ? m.parentRatingKey : m.type === "episode" ? m.grandparentRatingKey : m.ratingKey;
      if (key && (m.addedAt ?? 0) > NU - 30 * DAGUR) nyBaett.set(String(key), Math.max(nyBaett.get(String(key)) ?? 0, m.addedAt));
    }
  }
  const virkni = (s) => Math.max(s.lastViewedAt ?? 0, nyBaett.get(String(s.ratingKey)) ?? 0);
  const eftirVirkni = [...thaettir].sort((a, b) => virkni(b) - virkni(a));
  const sjalfvirk = [
    ...eftirVirkni.filter((s) => (s.lastViewedAt ?? 0) > NU - 90 * DAGUR || nyBaett.has(String(s.ratingKey))),
    ...eftirVirkni.filter((s) => s.lastViewedAt).slice(0, 10),
  ].slice(0, 30);
  const verk = [
    ...handvirk.map((h) => ({ tvmazeId: h.id, nafn: String(h.nafn ?? ""), handvirkt: true, plex: thattaNofn.get(norm(h.nafn)) })),
    ...nafnalisti.map((n) => ({ nafn: n, handvirkt: true, plex: thattaNofn.get(norm(n)) })),
    ...sjalfvirk.map((s) => ({ plex: s, nafn: s.title, handvirkt: false })),
  ];

  const kortSkra = path.join(DIR, "kort.json");
  const kort = fs.existsSync(kortSkra) ? JSON.parse(fs.readFileSync(kortSkra, "utf8")) : {};
  const fylgst = [];
  const buid = new Set();
  for (const v of verk) {
    try {
      let id = v.tvmazeId ?? (v.plex && kort[v.plex.ratingKey]);
      if (!id && !v.plex) id = (await tvm(`/singlesearch/shows?q=${encodeURIComponent(v.nafn)}`))?.id;
      if (!id && v.plex) {
        const allt = [v.plex.guid ?? "", ...(v.plex.Guid ?? []).map((g) => g.id)].join(" ");
        const tvdb = (allt.match(/(?:tvdb|thetvdb):\/\/(\d+)/) || [])[1];
        const imdb = (allt.match(/imdb:\/\/(tt\d+)/) || [])[1];
        const fannst = (tvdb && await tvm(`/lookup/shows?thetvdb=${tvdb}`)) || (imdb && await tvm(`/lookup/shows?imdb=${imdb}`))
          || await tvm(`/singlesearch/shows?q=${encodeURIComponent(v.plex.title)}`);
        id = fannst?.id;
      }
      if (!id || buid.has(id)) continue;
      buid.add(id);
      if (v.plex) kort[v.plex.ratingKey] = id;
      const s = await tvm(`/shows/${id}?embed[]=episodes&embed[]=nextepisode`);
      if (!s) continue;

      const eps = (s._embedded?.episodes ?? []).filter((e) => e.season > 0 && e.number != null);
      const synt = eps.filter((e) => e.airdate && e.airdate <= IDAG);
      const iPlex = new Set();
      if (v.plex) {
        for (const ep of (await plex(`/library/metadata/${v.plex.ratingKey}/allLeaves`)).Metadata ?? []) {
          if (!(ep.parentIndex > 0)) continue;
          if ((ep.Media ?? []).some((md) => (md.Part ?? []).some((p) => fs.existsSync(p.file)))) iPlex.add(`${ep.parentIndex}x${ep.index}`);
        }
      }
      const nofn = [norm(s.name), v.plex && norm(v.plex.title)].filter(Boolean);
      const aDiski = new Set(diskur.filter((d) => nofn.includes(d.forskeyti)
        || (d.forskeyti === "" && d.moppur.slice(-3).some((m) => nofn.some((n) => moppaPassar(m, n))))).map((d) => `${d.s}x${d.e}`));
      const lyklar = synt.map((e) => `${e.season}x${e.number}`);
      const utanPlex = lyklar.filter((k) => !iPlex.has(k) && aDiski.has(k));
      const vantar = lyklar.filter((k) => !iPlex.has(k) && !aDiski.has(k));
      const nyjasti = synt.at(-1);
      const naesti = s._embedded?.nextepisode;
      // Nýjasta sería sem er byrjuð — það sem skiptir máli þegar fylgst er með þætti
      const sNy = nyjasti?.season;
      const iSeriu = sNy ? lyklar.filter((k) => k.startsWith(`${sNy}x`)) : [];
      const nyjastaSeria = sNy ? {
        s: sNy, synt: iSeriu.length, alls: eps.filter((e) => e.season === sNy).length,
        iPlex: iSeriu.filter((k) => iPlex.has(k)).length, utanPlex: iSeriu.filter((k) => utanPlex.includes(k)).length,
        vantar: iSeriu.filter((k) => vantar.includes(k)).length, vantarEp: eftirSeriu(iSeriu.filter((k) => vantar.includes(k)))[0]?.ep ?? "",
      } : null;
      fylgst.push({
        id, nafn: s.name, ar: s.premiered ? Number(s.premiered.slice(0, 4)) : null, mynd: s.image?.medium ?? null,
        stada: s.status, stod: s.network?.name ?? s.webChannel?.name ?? null, tegund: s.genres ?? [], slod: s.url,
        uppruni: v.tvmazeId ? "sida" : v.handvirkt ? "skra" : "plex", iPlexSafni: Boolean(v.plex),
        sidastSedd: v.plex?.lastViewedAt ? new Date(v.plex.lastViewedAt * 1000).toISOString() : null,
        osedir: v.plex ? Math.max(0, (v.plex.leafCount ?? 0) - (v.plex.viewedLeafCount ?? 0)) : null,
        synt: lyklar.length, iPlex: lyklar.filter((k) => iPlex.has(k)).length, utanPlex: utanPlex.length, vantar: vantar.length,
        vantarSeriur: eftirSeriu(vantar), utanPlexSeriur: eftirSeriu(utanPlex), nyjastaSeria,
        nyjasti: nyjasti ? { kodi: kodi(nyjasti.season, nyjasti.number), dags: nyjasti.airdate, nafn: nyjasti.name } : null,
        naesti: naesti ? { kodi: kodi(naesti.season, naesti.number), dags: naesti.airdate, nafn: naesti.name } : null,
      });
    } catch (e) { log(`  ✗ ${v.nafn}: ${e.message}`); }
  }
  fs.writeFileSync(kortSkra, JSON.stringify(kort));
  log(`Fylgst með ${fylgst.length} þáttum (${handvirk.length} af síðunni, ${nafnalisti.length} úr fylgjast.txt)`);

  // 4. Nýir þættir: fyrstu þættir (S01E01) síðustu NYIR_DAGAR daga á streymisveitum og í US/GB-sjónvarpi
  const nyir = new Map();
  for (let i = 0; i < NYIR_DAGAR; i++) {
    const d = new Date(Date.now() - i * DAGUR * 1000).toISOString().slice(0, 10);
    for (const q of [`/schedule/web?date=${d}`, `/schedule?country=US&date=${d}`, `/schedule?country=GB&date=${d}`]) {
      for (const e of (await tvm(q).catch(() => null)) ?? []) {
        const s = e._embedded?.show ?? e.show;
        if (!s || e.season !== 1 || e.number !== 1 || nyir.has(s.id)) continue;
        if (s.language !== "English" || ["News", "Talk Show", "Sports"].includes(s.type)) continue;
        const ar = s.premiered ? Number(s.premiered.slice(0, 4)) : null;
        nyir.set(s.id, {
          id: s.id, nafn: s.name, ar, mynd: s.image?.medium ?? null, frumsynt: e.airdate, stod: s.network?.name ?? s.webChannel?.name ?? null,
          tegund: s.genres ?? [], lysing: hreinsa(s.summary), vinsaeld: s.weight ?? 0, slod: s.url, iPlex: iPlexThattur(s.name, ar),
        });
      }
    }
  }
  const nyirThaettir = [...nyir.values()].sort((a, b) => b.vinsaeld - a.vinsaeld || b.frumsynt.localeCompare(a.frumsynt)).slice(0, 48);
  log(`Nýir þættir: ${nyir.size} frumsýningar, ${nyirThaettir.length} sýndar`);

  // 5. Nýjar myndir: vinsælustu myndirnar á iTunes (US) — nýjustu stafrænu útgáfurnar
  let nyjarMyndir = [];
  try {
    const r = await fetch("https://itunes.apple.com/us/rss/topmovies/limit=50/json");
    const feed = (await r.json()).feed?.entry ?? [];
    nyjarMyndir = feed.map((e, i) => {
      const nafn = String(e["im:name"]?.label ?? "").replace(/\s*\((19|20)\d\d\)$/, "");
      const utg = e["im:releaseDate"]?.label?.slice(0, 10) ?? null;
      const ar = utg ? Number(utg.slice(0, 4)) : null;
      const links = [].concat(e.link ?? []);
      const mynd = [].concat(e["im:image"] ?? []).at(-1)?.label?.replace(/\/\d+x\d+bb\.\w+$/, "/400x600bb.jpg") ?? null;
      return {
        saeti: i + 1, nafn, ar, utgafa: utg, tegund: e.category?.attributes?.label ?? null, leikstjori: e["im:artist"]?.label ?? null,
        mynd, lysing: hreinsa(e.summary?.label, 300), slod: links.find((l) => l.attributes?.rel === "alternate")?.attributes?.href ?? null,
        iPlex: iPlexMynd(nafn, ar),
      };
    });
  } catch (e) { log("iTunes-listinn náðist ekki:", e.message); }
  log(`Nýjar myndir: ${nyjarMyndir.length} (${nyjarMyndir.filter((m) => m.iPlex).length} þegar í Plex)`);

  const gogn = {
    utgafa: 1, uppfaert: new Date().toISOString(), tok: Math.round((Date.now() - t0) / 1000),
    safn: { thaettir: thaettir.length, myndir: myndir.length, thattaNofn: [...new Set(thaettir.map((s) => s.title))].sort() },
    advaranir, fylgst, nyirThaettir, nyjarMyndir,
  };
  fs.writeFileSync(path.join(DIR, "sidasta.json"), JSON.stringify(gogn, null, 2));
  if (PRUFA) { log(`--prufa: ekkert sent (${Math.round(JSON.stringify(gogn).length / 1024)} KB í sidasta.json)`); return; }
  await sb("POST", "bio_gogn?on_conflict=skuffa,hluti", { skuffa: SKUFFA, hluti: "safn", gogn, uppfaert: gogn.uppfaert });
  log(`Sent í Supabase (${Math.round(JSON.stringify(gogn).length / 1024)} KB) á ${gogn.tok} s. Tengill fyrir vafra/síma: ${path.join(DIR, "tengill.txt")}`);
}

main().catch((e) => { log("VILLA:", e.message); process.exit(1); });
