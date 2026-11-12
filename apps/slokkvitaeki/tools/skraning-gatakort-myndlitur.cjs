#!/usr/bin/env node
// Rauður litur á ljósmyndum stálröraskráninga → skr_kerfi.rautt (12.11.2026, Agnar samþykkti: „Jú hljómar vel“).
// Úðalagnir á NLSH eru rauðmálaðar; hlutfall rauðra díla á mynd skráningarinnar er vísbending um úðakerfi, betri en nálægð á teikningu.
// Les myndir úr OKKAR geymslu (skr_myndir, opna fatan „skraning“), ekki úr Ajour. Skrifar aðeins dálkinn rautt í skr_kerfi.
//
//   node tools/skraning-gatakort-myndlitur.cjs                 → DRY: mælir og sýnir dreifingu, skrifar ekkert
//   node tools/skraning-gatakort-myndlitur.cjs --write         → skrifar skr_kerfi.rautt (raðir sem eru til; kerfi óbreytt)
//   … --syni <mappa>   vistar smámyndir ~5 % skráninga merktar hlutfallinu (til að rýna þröskuldinn) · --limit N
// Flokkunin sjálf (kerfi = 'udi' ef rautt ≥ þröskuldur) er í tools/skraning-gatakort-kerfi.cjs.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), { spawnSync } = require('node:child_process');
const ARGS = process.argv.slice(2), flag = (f) => ARGS.includes(f), opt = (f) => { const i = ARGS.indexOf(f); return i >= 0 ? ARGS[i + 1] : null; };
const WRITE = flag('--write'), SYNI = opt('--syni'), LIMIT = Number(opt('--limit')) || Infinity, VERK = Number(opt('--verk')) || 4;
const ENVF = process.env.LUNA_ENV || 'C:/Users/Slokkvitaeki/luna-bridge/.env';
const env = {}; try { for (const l of fs.readFileSync(ENVF, 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, ''); } } catch {}
const URL_ = process.env.SUPABASE_URL || env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) { console.error('Vantar SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (luna-bridge/.env)'); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
async function allt(slod) { const ut = []; for (let i = 0; ; i += 1000) { const r = await fetch(`${URL_}/rest/v1/${slod}`, { headers: { ...H, Range: `${i}-${i + 999}`, 'Range-Unit': 'items' } }); if (!r.ok) throw new Error(`${slod} → ${r.status} ${(await r.text()).slice(0, 200)}`); const j = await r.json(); ut.push(...j); if (j.length < 1000) break; } return ut; }

(async () => {
  const kerfi = await allt(`skr_kerfi?select=skraning_id,verk_id,kerfi,fjarlaegd_px,naest,vafi,uppruni&verk_id=eq.${VERK}&order=skraning_id`);
  const flokkar = new Map((await allt(`skr_flokkar?select=id,heiti&or=(verk_id.eq.${VERK},verk_id.is.null)`)).map((f) => [f.id, f.heiti]));
  const fl = new Map((await allt(`skr_skraningar?select=id,flokkur_id&verk_id=eq.${VERK}&eytt=eq.false&order=id`)).map((s) => [s.id, (flokkar.get(s.flokkur_id) || '').replace(/^Stál\s*/, '').replace(/\s*LV.*$/, '')]));
  const myndir = new Map(); for (const m of await allt('skr_myndir?select=skraning_id,path,rod&order=skraning_id,rod')) (myndir.get(m.skraning_id) || myndir.set(m.skraning_id, []).get(m.skraning_id)).push(m.path);
  const inn = kerfi.filter((k) => myndir.has(k.skraning_id)).slice(0, LIMIT).map((k, i) => ({ id: k.skraning_id, slodir: myndir.get(k.skraning_id), syni: !!SYNI && i % 20 === 0 }));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'myndlitur-')), fInn = path.join(tmp, 'inn.json'), fUt = path.join(tmp, 'ut.json'); fs.writeFileSync(fInn, JSON.stringify(inn));
  console.log(`${kerfi.length} stálröraskráningar í skr_kerfi, ${inn.length} með mynd — mæli rauðan lit…`);
  const r = spawnSync('python', [path.join(__dirname, 'skraning-gatakort-myndlitur.py'), fInn, fUt, `${URL_}/storage/v1/object/public/skraning`, ...(SYNI ? [SYNI] : [])], { encoding: 'utf8', maxBuffer: 64e6, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  if (r.status !== 0) throw new Error('python: ' + (r.stderr || r.stdout || '').slice(-600));
  const ut = new Map(JSON.parse(fs.readFileSync(fUt, 'utf8')).map((q) => [q.id, q.rautt]));
  const bil = [0, 0.01, 0.03, 0.06, 0.1, 0.2, 1.01], tel = {};
  for (const [id, v] of ut) { const st = fl.get(id) || '?', t = tel[st] || (tel[st] = { n: 0, b: bil.slice(1).map(() => 0), villa: 0 }); t.n++; if (v == null) { t.villa++; continue; } t.b[bil.findIndex((x, i) => i > 0 && v < x) - 1]++; }
  console.log('Hlutfall rauðra díla, fjöldi skráninga per stærð:  <1 % | 1–3 % | 3–6 % | 6–10 % | 10–20 % | ≥20 %');
  for (const st of Object.keys(tel).sort()) console.log(`  ${st.padEnd(10)} n=${String(tel[st].n).padStart(5)}  ${tel[st].b.map((x) => String(x).padStart(5)).join(' |')}${tel[st].villa ? `  (mynd las ekki: ${tel[st].villa})` : ''}`);
  if (!WRITE) { console.log('DRY — ekkert skrifað. Bættu við --write.'); return; }
  const radir = kerfi.filter((k) => ut.has(k.skraning_id)).map((k) => ({ ...k, rautt: ut.get(k.skraning_id) }));
  for (let i = 0; i < radir.length; i += 500) { const q = await fetch(`${URL_}/rest/v1/skr_kerfi?on_conflict=skraning_id`, { method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(radir.slice(i, i + 500)) }); if (!q.ok) throw new Error(`skr_kerfi → ${q.status} ${(await q.text()).slice(0, 200)}`); }
  console.log('Skrifað: rautt í', radir.length, 'raðir í skr_kerfi');
})().catch((e) => { console.error('VILLA', e.message); process.exit(1); });
