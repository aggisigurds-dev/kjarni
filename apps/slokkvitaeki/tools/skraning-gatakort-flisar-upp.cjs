#!/usr/bin/env node
// Gatakort NLSH — hleður skörpum flísum (úr skraning-gatakort-flisar.py) upp í geymsluna og skráir þær á grunnmynd / lag (11.11.2026).
//
//   node tools/skraning-gatakort-flisar-upp.cjs <flísamappa>            → DRY: sýnir hvað færi hvert
//   node tools/skraning-gatakort-flisar-upp.cjs <flísamappa> --write    → hleður upp og skrifar `flisar` á skr_teikningar / skr_log
//
// Mappan geymir <nafn>/<d>_<r>.png|jpg og <nafn>.json. Nöfn: grunnur-5h / grunnur-6h → yfirlitsblað hæðarinnar (5H-blaðið er líka
// notað fyrir 4H); annað → lagið þar sem skr_log.uppruni byrjar á „Procore <nafn> ". Ný slóð með slembiendingu í hverri keyrslu
// (eldri flísar standa í geymslunni; engu er eytt).
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const ARGS = process.argv.slice(2), WRITE = ARGS.includes('--write'), DIR = ARGS.find((a) => !a.startsWith('--'));
const ENVF = process.env.LUNA_ENV || 'C:/Users/Slokkvitaeki/luna-bridge/.env';
const env = {}; try { for (const l of fs.readFileSync(ENVF, 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, ''); } } catch {}
const URL_ = process.env.SUPABASE_URL || env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!DIR || !URL_ || !KEY) { console.error('Notkun: skraning-gatakort-flisar-upp.cjs <flísamappa> [--write]'); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
async function rest(method, p, body) { const r = await fetch(`${URL_}/rest/v1/${p}`, { method, headers: { ...H, Prefer: 'return=representation' }, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); if (!r.ok) throw new Error(`${method} ${p.slice(0, 60)} → ${r.status} ${t.slice(0, 300)}`); return t ? JSON.parse(t) : null; }
async function upload(sp, buf, ct) { for (let i = 0; i < 3; i++) { const r = await fetch(`${URL_}/storage/v1/object/skraning/${sp}`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': ct, 'Cache-Control': 'max-age=31536000' }, body: buf }); if (r.ok) return; if (i === 2) throw new Error(`upload ${sp} → ${r.status} ${(await r.text()).slice(0, 200)}`); } }
(async () => {
  const [verk] = await rest('GET', `skr_verk?heiti=eq.${encodeURIComponent('NLSH 5-6. hæð · gatakort')}&select=id`);
  const teikn = await rest('GET', `skr_teikningar?verk_id=eq.${verk.id}&tegund=eq.yfirlit&eytt=eq.false&select=id,heiti`);
  const log = await rest('GET', `skr_log?verk_id=eq.${verk.id}&eytt=eq.false&select=id,heiti,uppruni`);
  const sett = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort();
  for (const nafn of sett) {
    const meta = JSON.parse(fs.readFileSync(path.join(DIR, nafn + '.json'), 'utf8'));
    const g = nafn.match(/^grunnur-(\d)h$/);
    const mark = g ? teikn.filter((t) => new RegExp(`Brunayfirlit ${g[1]}H\\b`).test(t.heiti) || (g[1] === '5' && /Brunayfirlit 4H\b/.test(t.heiti))).map((t) => ['skr_teikningar', t.id, t.heiti])
      : log.filter((l) => (l.uppruni || '').startsWith(`Procore ${nafn} `)).map((l) => ['skr_log', l.id, l.heiti]);
    if (!mark.length) { console.log('EKKERT MARK fyrir', nafn); continue; }
    const slod = `verk/${verk.id}/flisar/${nafn}-${crypto.randomBytes(5).toString('hex')}`;
    console.log(`${WRITE ? 'hleð' : 'DRY '} ${nafn}: ${meta.til.length} flísar → ${mark.map((m) => `${m[0]} ${m[1]} „${m[2]}"`).join(' + ')}`);
    if (!WRITE) continue;
    let i = 0; const vinna = async () => { for (;;) { const t = meta.til[i++]; if (!t) return; const f = `${t}.${meta.ending}`; await upload(`${slod}/${f}`, fs.readFileSync(path.join(DIR, nafn, f)), meta.ending === 'jpg' ? 'image/jpeg' : 'image/png'); } };
    await Promise.all(Array.from({ length: 6 }, vinna));
    for (const [tafla, id] of mark) await rest('PATCH', `${tafla}?id=eq.${id}`, { flisar: { kvardi: meta.kvardi, bx: meta.bx, by: meta.by, dalkar: meta.dalkar, radir: meta.radir, slod, ending: meta.ending, til: meta.til } });
  }
  console.log(WRITE ? 'BÚIÐ' : 'DRY — ekkert skrifað');
})().catch((e) => { console.error('VILLA', e.message); process.exit(1); });
