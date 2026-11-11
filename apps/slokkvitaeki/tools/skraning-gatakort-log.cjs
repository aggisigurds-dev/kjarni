#!/usr/bin/env node
// Gatakort NLSH — setur fagteikningar inn sem LÖG (skr_log) á brunayfirlitsblöðin (11.11.2026).
//
// Heimild: Procore-verk 2837845 „Verkteikningar 5. og 6. hæð", yfirlitsmyndir faganna (PDF, A1, sótt 11.11.2026).
// Lagmyndirnar eru gerðar með tools/skraning-gatakort-lagmynd.py: PNG með gegnsæi í hnitakerfi grunnmyndarinnar
// (CROP 230,265,1930×950 pt við 3 px/pt → 5790×2850), svo vörpunin er {a:1,e:0,f:0}.
// Afstillingin (base_pt = q·lag_pt + (dx,dy)) er mæld með FFT-fylgni við brunayfirlitið
// (tools/skraning-gatakort-stilla.py, fjórir gluggar; skraning-gatakort-kvardi.py þegar kvarðinn er annar):
//
//   blað      hæð  fag        q     dx      dy     teikning_id
//   M395-00   5H   sprinkler  1.0   -34.5   88.0   5
//   M195-00   5H   vatn       1.0   -52.0   40.0   5
//   M795-00   5H   gas        1.0   -10.5   24.0   5
//   M396-00   6H   sprinkler  1.1  -153.0  -53.0   4     ← teiknað 10 % minna en hin blöðin
//   M196-00   6H   vatn       1.0   -30.5   57.5   4
//   M796-00   6H   gas        1.0   -14.0   12.0   4
//
// Loftræsing (M215-01…20 á 5H, M216-01…08 og 13…20 á 6H) hefur enga yfirlitsmynd: 36 hlutablöð í 1:50 (q = 0,2).
// Hvert blað er stillt af eftir ÁSAMERKJUM (A–X, 1–13) með tools/skraning-gatakort-asar.py (frávik ≤ 0,06 pt) og blöðunum
// skeytt saman í eitt lag á hæð með tools/skraning-gatakort-skeyta.py — þar sitja aðeins fylltir stokkar eftir
// (gráar fyllingar 180/200 dökkir, 214–215/230 ljósir; útveggjafylling 211–212 og arkitektagrunnur detta út).
//
// Vatnslagnir í lit (hlutablöð M115-01…20 / M116, 1:50): stillt af eftir ásamerkjum, skeytt með
// tools/skraning-gatakort-skeyta-lit.py litur — lagnir halda lit teikningarinnar (rautt, blátt, brúnt, grænt).
// Raflagnaleiðir (R1150 / R1160, 1:50) hafa ENGIN ásamerki: hvert blað er borið saman við loftræsiblað sama hlutanúmers
// með tools/skraning-gatakort-fylgni.py (FFT-fylgni arkitektagrunns) og skeytt með …-skeyta-lit.py dokkt (texti fjarlægður).
//
//   node tools/skraning-gatakort-log.cjs <mappa með lag-*.png>            → DRY
//   node tools/skraning-gatakort-log.cjs <mappa með lag-*.png> --write    → hleður upp og skráir (sleppir því sem er til)
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const ARGS = process.argv.slice(2), WRITE = ARGS.includes('--write'), DIR = ARGS.find((a) => !a.startsWith('--'));
const ENVF = process.env.LUNA_ENV || 'C:/Users/Slokkvitaeki/luna-bridge/.env';
const env = {}; try { for (const l of fs.readFileSync(ENVF, 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, ''); } } catch {}
const URL_ = process.env.SUPABASE_URL || env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!DIR || !URL_ || !KEY) { console.error('Notkun: skraning-gatakort-log.cjs <mappa> [--write]  (þarf SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY í luna-bridge/.env)'); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
async function rest(method, p, body) { const r = await fetch(`${URL_}/rest/v1/${p}`, { method, headers: { ...H, Prefer: 'return=representation' }, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); if (!r.ok) throw new Error(`${method} ${p.slice(0, 60)} → ${r.status} ${t.slice(0, 300)}`); return t ? JSON.parse(t) : null; }
async function upload(sp, buf) { const r = await fetch(`${URL_}/storage/v1/object/skraning/${sp}`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'image/png' }, body: buf }); if (!r.ok) throw new Error(`upload ${sp} → ${r.status} ${(await r.text()).slice(0, 200)}`); }
const pngDims = (b) => ({ w: b.readUInt32BE(16), h: b.readUInt32BE(20) });

const VERK = 'NLSH 5-6. hæð · gatakort';
const LOG = [
  { skra: 'lag-5h-vatnsudi-M395.png',    haed: '5H', fag: 'sprinkler', heiti: 'Vatnsúðakerfi 5H (M395-00)',                 blad: 'M395-00', rod: 10, synilegt: true,  q: 1.0, dx: -34.5, dy: 88 },
  { skra: 'lag-5h-vatnslagnir-M195.png', haed: '5H', fag: 'vatn',      heiti: 'Þrifa-, hita- og kælikerfi 5H (M195-00)',    blad: 'M195-00', rod: 20, synilegt: false, q: 1.0, dx: -52, dy: 40 },
  { skra: 'lag-5h-lyfjaloft-M795.png',   haed: '5H', fag: 'gas',       heiti: 'Lyfjaloft 5H (M795-00)',                     blad: 'M795-00', rod: 30, synilegt: false, q: 1.0, dx: -10.5, dy: 24 },
  { skra: 'lag-5h-loftraesing-M215.png', haed: '5H', fag: 'loftraesting', heiti: 'Loftræsikerfi 5H (M215-01…20)',          blad: 'M215',    rod: 5,  synilegt: true,  gegnsaei: 0.75, q: 0.2, dx: 'ásar', dy: 'ásar' },
  { skra: 'lag-6h-loftraesing-M216.png', haed: '6H', fag: 'loftraesting', heiti: 'Loftræsikerfi 6H (M216-01…20)',          blad: 'M216',    rod: 5,  synilegt: true,  gegnsaei: 0.75, q: 0.2, dx: 'ásar', dy: 'ásar' },
  { skra: 'lag-5h-vatn-litur-M115.png',        haed: '5H', fag: 'vatn',    heiti: 'Vatnslagnir í lit 5H (M115-01…20)',  blad: 'M115',  rod: 18, synilegt: false, gegnsaei: 1,   q: 0.2, dx: 'ásar', dy: 'ásar' },
  { skra: 'lag-5h-raflagnaleidir-R1150.png',   haed: '5H', fag: 'rafmagn', heiti: 'Raflagnaleiðir 5H (R1150-01…20)',    blad: 'R1150', rod: 40, synilegt: false, gegnsaei: 0.9, q: 0.2, dx: 'fylgni', dy: 'fylgni' },
  { skra: 'lag-6h-vatn-litur-M116.png',        haed: '6H', fag: 'vatn',    heiti: 'Vatnslagnir í lit 6H (M116-01…20)',  blad: 'M116',  rod: 18, synilegt: false, gegnsaei: 1,   q: 0.2, dx: 'ásar', dy: 'ásar' },
  { skra: 'lag-6h-raflagnaleidir-R1160.png',   haed: '6H', fag: 'rafmagn', heiti: 'Raflagnaleiðir 6H (R1160-01…20)',    blad: 'R1160', rod: 40, synilegt: false, gegnsaei: 0.9, q: 0.2, dx: 'fylgni', dy: 'fylgni' },
  { skra: 'lag-6h-vatnsudi-M396.png',    haed: '6H', fag: 'sprinkler', heiti: 'Vatnsúðakerfi 6H (M396-00)',                 blad: 'M396-00', rod: 10, synilegt: true,  q: 1.1, dx: -153, dy: -53 },
  { skra: 'lag-6h-vatnslagnir-M196.png', haed: '6H', fag: 'vatn',      heiti: 'Þrifa-, hita- og kælikerfi 6H (M196-00)',    blad: 'M196-00', rod: 20, synilegt: false, q: 1.0, dx: -30.5, dy: 57.5 },
  { skra: 'lag-6h-lyfjaloft-M796.png',   haed: '6H', fag: 'gas',       heiti: 'Lyfjaloft 6H (M796-00)',                     blad: 'M796-00', rod: 30, synilegt: false, q: 1.0, dx: -14, dy: 12 },
];
(async () => {
  const [verk] = await rest('GET', `skr_verk?heiti=eq.${encodeURIComponent(VERK)}&select=id`);
  if (!verk) throw new Error('greiningarverkið finnst ekki');
  const yfirlit = await rest('GET', `skr_teikningar?verk_id=eq.${verk.id}&tegund=eq.yfirlit&eytt=eq.false&select=id,heiti,breidd_px,haed_px`);
  const til = await rest('GET', `skr_log?verk_id=eq.${verk.id}&eytt=eq.false&select=id,teikning_id,uppruni`);
  for (const l of LOG) {
    const t = yfirlit.find((y) => new RegExp(`Brunayfirlit ${l.haed}\\b`).test(y.heiti));
    if (!t) throw new Error('ekkert yfirlitsblað fyrir ' + l.haed);
    const f = path.join(DIR, l.skra); if (!fs.existsSync(f)) { console.log('VANTAR', l.skra); continue; }
    const buf = fs.readFileSync(f), d = pngDims(buf);
    const uppruni = `Procore ${l.blad} ${/-00$/.test(l.blad) ? 'rev 0' : 'gildandi útgáfur'} · sótt 11.11.2026 · q=${l.q} dx=${l.dx} dy=${l.dy} pt`;
    if (til.some((x) => x.teikning_id === t.id && (x.uppruni || '').startsWith(`Procore ${l.blad} `))) { console.log('til   ', l.blad, '→ teikning', t.id); continue; }
    const sp = `verk/${verk.id}/${l.skra.replace(/\.png$/, '')}-${crypto.randomBytes(6).toString('hex')}.png`;
    console.log(WRITE ? 'skrifa' : 'DRY   ', l.blad, '→ teikning', t.id, `${d.w}×${d.h}`, (buf.length / 1024).toFixed(0) + ' kB', l.fag, l.synilegt ? 'sýnilegt' : 'falið');
    if (!WRITE) continue;
    await upload(sp, buf);
    await rest('POST', 'skr_log', [{ verk_id: verk.id, teikning_id: t.id, heiti: l.heiti, fag: l.fag, mynd_path: sp, breidd_px: d.w, haed_px: d.h, vorpun: { a: 1, e: 0, f: 0 }, gegnsaei: l.gegnsaei || 0.9, synilegt: l.synilegt, rod: l.rod, uppruni }]);
  }
  console.log(WRITE ? 'BÚIÐ' : 'DRY — ekkert skrifað');
})().catch((e) => { console.error('VILLA', e.message); process.exit(1); });
