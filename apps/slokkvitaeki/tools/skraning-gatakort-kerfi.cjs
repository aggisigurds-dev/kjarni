#!/usr/bin/env node
// Lagnakerfi stálröraþéttinga á gatakortinu (12.11.2026, Agnar: „brjóta aðeins upp og bjóða filter fyrir sprinklerkerfi“).
// Ajour flokkar stálrör aðeins eftir stærð. Hér er hver stálröraskráning á 5H og 6H borin við lagnateikningarnar (sömu lög og
// sjálfvirka færslan notar) og merkt því kerfi sem á næstu lögn: úðakerfi (M395/M396), vatn og hiti (M115/M116, M195/M196) eða
// lyfjaloft (M795/M796). Niðurstaðan fer í töfluna skr_kerfi — skráningum er EKKI breytt.
//
//   node tools/skraning-gatakort-kerfi.cjs --log <lagamappa>                      → DRY: reiknar og telur, skrifar ekkert
//   node tools/skraning-gatakort-kerfi.cjs --log <lagamappa> --write              → skrifar skr_kerfi (upsert á skraning_id)
//   … --radius 40 (px) · --prufa <yfirlitsmappa> 6H x y w h   prufumynd í tímabundna möppu
// ÚÐAKERFI ER GREINT AF LJÓSMYND (12.11.2026): úðalagnir á NLSH eru rauðmálaðar; skr_kerfi.rautt (tools/skraning-gatakort-myndlitur.cjs) ≥ 1 % → 'udi',
// uppruni 'mynd' (vafi ef < 2,5 %). Teikningin ræður aðeins milli vatns og lyfjalofts. Engin stærðarregla: grönn rauð úðarör sjást líka í Ø15-35.
// (Eldri regla, ekki lengur notuð:) Úðakerfi kom aðeins til greina í flokkunum Stál Ø40-50, Ø75-110 og Ø110-160 (Agnar 12.11.2026: „er almennt í stál 50 mm til stál 75 mm“,
// „kannski líka í 110 mm“ — staðfest á ljósmyndum skráninga nr. 4808 og 5413: rauðmáluð úðarör í Ø110-160). Ekki í Ø15-35.
// Úðalagnirnar á NLSH eru RAUÐMÁLAÐAR — liturinn á ljósmynd skráningarinnar er betri vísbending en nálægð á teikningu (ekki nýtt enn).
// Þetta er ÁÆTLUN af teikningu: punktur er merktur „vafi“ ef tvö kerfi eru jafn nærri (innan 6 px) eða næsta lögn er lengra en 15 px.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), { spawnSync } = require('node:child_process');
const ARGS = process.argv.slice(2), flag = (f) => ARGS.includes(f), opt = (f) => { const i = ARGS.indexOf(f); return i >= 0 ? ARGS[i + 1] : null; };
const WRITE = flag('--write'), LOG = opt('--log'), RAD = Number(opt('--radius')) || 40, VERK = Number(opt('--verk')) || 4;
const pi = ARGS.indexOf('--prufa'), PRUFA = pi >= 0 ? ARGS.slice(pi + 1, pi + 7) : null;   // <yfirlitsmappa> <hæð> x y w h
if (!LOG) { console.error('Vantar --log <lagamappa>'); process.exit(1); }
const ENVF = process.env.LUNA_ENV || 'C:/Users/Slokkvitaeki/luna-bridge/.env';
const env = {}; try { for (const l of fs.readFileSync(ENVF, 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, ''); } } catch {}
const URL_ = process.env.SUPABASE_URL || env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) { console.error('Vantar SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (luna-bridge/.env)'); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
async function allt(slod) { const ut = []; for (let i = 0; ; i += 1000) { const r = await fetch(`${URL_}/rest/v1/${slod}`, { headers: { ...H, Range: `${i}-${i + 999}`, 'Range-Unit': 'items' } }); if (!r.ok) throw new Error(`${slod} → ${r.status} ${(await r.text()).slice(0, 200)}`); const j = await r.json(); ut.push(...j); if (j.length < 1000) break; } return ut; }

(async () => {
  const flokkar = new Map((await allt(`skr_flokkar?select=id,heiti&or=(verk_id.eq.${VERK},verk_id.is.null)`)).map((f) => [f.id, f.heiti]));
  const skr = new Map((await allt(`skr_skraningar?select=id,flokkur_id&verk_id=eq.${VERK}&eytt=eq.false&order=id`)).map((s) => [s.id, flokkar.get(s.flokkur_id) || '']));
  const rautt = new Map((await allt(`skr_kerfi?select=skraning_id,rautt&verk_id=eq.${VERK}&order=skraning_id`)).map((k) => [k.skraning_id, k.rautt == null ? null : Number(k.rautt)]));   // úr tools/skraning-gatakort-myndlitur.cjs
  const hnit = (await allt(`skr_haedarhnit?select=skraning_id,haed,x_px,y_px&verk_id=eq.${VERK}&order=skraning_id`)).filter((h) => /^Stál/i.test(skr.get(h.skraning_id) || '') && (h.haed === '5H' || h.haed === '6H'));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kerfi-')); const radir = [];
  const RAUTT_UDI = 0.01, RAUTT_VISS = 0.025;   // hlutfall rauðra díla í miðju myndar: ≥ 1 % = úðakerfi, ≥ 2,5 % = öruggt. Rýnt á sýnum 12.11.2026: 2,5–6 % → 15 af 15 úðarör; 0,8–2,5 % → um 10 af 15 (hitt: rautt rör í bakgrunni, rauður loki, rauð merking á mynd)
  for (const haed of ['6H', '5H']) {
    const pp = hnit.filter((h) => h.haed === haed).map((h) => ({ id: h.skraning_id, x: Number(h.x_px), y: Number(h.y_px), udi: false, rautt: rautt.get(h.skraning_id) ?? null }));   // úðakerfi er EKKI lesið af teikningu lengur heldur af rauðum lit á ljósmynd (sjá að neðan)
    const fInn = path.join(tmp, `inn-${haed}.json`), fUt = path.join(tmp, `ut-${haed}.json`); fs.writeFileSync(fInn, JSON.stringify(pp));
    const auka = PRUFA && PRUFA[1] === haed ? [path.join(PRUFA[0], `yfirlit-${haed.toLowerCase()}.jpg`), path.join(tmp, `prufa-${haed}.png`), ...PRUFA.slice(2)] : [];
    const r = spawnSync('python', [path.join(__dirname, 'skraning-gatakort-kerfi.py'), LOG, haed.toLowerCase(), fInn, fUt, String(RAD), ...auka], { encoding: 'utf8', maxBuffer: 64e6 });
    if (r.status !== 0) throw new Error('python: ' + (r.stderr || r.stdout || '').slice(-600));
    const ut = JSON.parse(fs.readFileSync(fUt, 'utf8')); const tel = {};
    for (const q of ut.punktar) {
      const rt = rautt.get(q.id), afMynd = rt != null && rt >= RAUTT_UDI;   // rauðmálað rör á ljósmynd = úðakerfi
      const rod = afMynd ? { skraning_id: q.id, verk_id: VERK, kerfi: 'udi', fjarlaegd_px: q.d, naest: `${q.kerfi} ${q.d ?? ''}`.trim(), vafi: rt < RAUTT_VISS, uppruni: 'mynd' } : { skraning_id: q.id, verk_id: VERK, kerfi: q.kerfi, fjarlaegd_px: q.d, naest: q.k2 ? `${q.k2} ${q.d2}` : null, vafi: q.vafi, uppruni: 'teikning' };
      const k = rod.kerfi + (afMynd ? ' [mynd]' : '') + (rod.vafi ? ' (vafi)' : ''); tel[k] = (tel[k] || 0) + 1; radir.push(rod);
    }
    console.log(haed, pp.length, 'stálrör ·', Object.entries(tel).sort().map(([k, n]) => `${k} ${n}`).join(' · '), '· lög:', Object.entries(ut.skrar).map(([k, s]) => `${k}=${s.length}`).join(' '), auka.length ? '· prufa: ' + auka[1] : '');
  }
  if (!WRITE) { console.log('DRY — ekkert skrifað. Bættu við --write.'); return; }
  for (let i = 0; i < radir.length; i += 500) { const r = await fetch(`${URL_}/rest/v1/skr_kerfi?on_conflict=skraning_id`, { method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(radir.slice(i, i + 500)) }); if (!r.ok) throw new Error(`skr_kerfi → ${r.status} ${(await r.text()).slice(0, 200)}`); }
  console.log('Skrifað:', radir.length, 'raðir í skr_kerfi');
})().catch((e) => { console.error('VILLA', e.message); process.exit(1); });
