#!/usr/bin/env node
// Gatakort NLSH — færir SKRÁNINGAR sjálfvirkt á næsta skurðpunkt síns lags og brunaveggjar (11.11.2026, Agnar: „já endilega“).
// Punktarnir voru oft settir ónákvæmt í síma. Nýja staðan fer í skr_faerslur (uppruni 'sjalfvirkt', fra_x/fra_y = vörpuð staða);
// skráningin sjálf er ÓBREYTT og hverja færslu má afturkalla á kortinu („Upprunaleg staða“). Handvirkar færslur eru aldrei snertar.
//
//   node tools/skraning-gatakort-skr-festa.cjs --haed 6H --yfirlit <mappa> --log <mappa>            → ÞURRKEYRSLA: telur, skrifar ekkert
//   … --write                                                                                       → skrifar (endurkeyranlegt)
//   … --radius 45            mesta færsla á rauðan brunavegg í px (45 px ≈ 1,35 m); á svarta vegglínu mest 20 px
//   … --prufa <mynd.jpg> x y w h   teiknar svæði á yfirlitinu með færslunum
//   … --afturkalla           merkir allar sjálfvirkar færslur hæðarinnar eytt (með --write)
// <mappa> yfirlit: yfirlit-6h.jpg / yfirlit-5h.jpg (brunayfirlit 5790 × 2850). <mappa> log: lag-6h-<fag>-<blað>.png í sömu stærð.
// Hópar: Loft og Raufar → loftræsting; Stál og Plast → vatnslagnir, vatnsúði, lyfjaloft; Raf → raflagnaleiðir. Milliloft er ekki fært.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), { spawnSync } = require('node:child_process');
const ARGS = process.argv.slice(2), WRITE = ARGS.includes('--write'), AFTUR = ARGS.includes('--afturkalla'), opt = (f, d) => { const i = ARGS.indexOf(f); return i >= 0 ? ARGS[i + 1] : d; };
const HAED = opt('--haed'), RAD = +opt('--radius', 45), YF = opt('--yfirlit'), LOG = opt('--log'), iP = ARGS.indexOf('--prufa'), PRUFA = iP >= 0 ? ARGS.slice(iP + 1, iP + 6) : [];
const ENVF = process.env.LUNA_ENV || 'C:/Users/Slokkvitaeki/luna-bridge/.env';
const env = {}; try { for (const l of fs.readFileSync(ENVF, 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, ''); } } catch {}
const URL_ = process.env.SUPABASE_URL || env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!HAED || !URL_ || !KEY || (!AFTUR && (!YF || !LOG))) { console.error('Notkun: skraning-gatakort-skr-festa.cjs --haed 6H --yfirlit <mappa> --log <mappa> [--radius 45] [--write] [--afturkalla]'); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
async function rest(method, p, body, prefer = 'return=representation') { const r = await fetch(`${URL_}/rest/v1/${p}`, { method, headers: { ...H, Prefer: prefer }, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); if (!r.ok) throw new Error(`${method} ${p.slice(0, 70)} → ${r.status} ${t.slice(0, 300)}`); return t ? JSON.parse(t) : null; }
async function allt(p) { let ut = [], fra = 0; for (;;) { const b = await rest('GET', `${p}&limit=1000&offset=${fra}`); ut = ut.concat(b); if (b.length < 1000) break; fra += 1000; } return ut; }
// Stálrör skiptast eftir kerfi (skr_kerfi): úðakerfi festist aðeins á úðalagnir, önnur stálrör á vatns- og lyfjaloftslagnir (12.11.2026).
const hopur = (heiti, kerfi) => (/^(Loft|Raufar)/i.test(heiti) ? 'loft' : /^Raf/i.test(heiti) ? 'rafmagn' : /^Stál/i.test(heiti) ? (kerfi === 'udi' ? 'udi' : kerfi ? 'stal' : 'ror') : /^Plast/i.test(heiti) ? 'ror' : null);
(async () => {
  const [verk] = await rest('GET', `skr_verk?heiti=eq.${encodeURIComponent('NLSH 5-6. hæð · gatakort')}&select=id`);
  const yf = (await rest('GET', `skr_teikningar?verk_id=eq.${verk.id}&eytt=eq.false&tegund=eq.yfirlit&haed=eq.${HAED}&select=id,heiti`))[0];
  if (!yf) throw new Error('ekkert yfirlitsblað fyrir ' + HAED);
  const faerslur = await allt(`skr_faerslur?verk_id=eq.${verk.id}&teikning_id=eq.${yf.id}&eytt=eq.false&select=id,skraning_id,uppruni,fra_x,fra_y&order=id`);
  const fAf = new Map(faerslur.map((f) => [f.skraning_id, f]));
  const sjalf = faerslur.filter((f) => f.uppruni === 'sjalfvirkt');
  if (AFTUR) {
    console.log(`${HAED}: ${sjalf.length} sjálfvirkar færslur${WRITE ? ' — merktar eytt' : ' (þurrkeyrsla)'}`);
    if (WRITE) for (let i = 0; i < sjalf.length; i += 200) await rest('PATCH', `skr_faerslur?id=in.(${sjalf.slice(i, i + 200).map((f) => f.id).join(',')})`, { eytt: true }, 'return=minimal');
    return;
  }
  const flokkar = new Map((await rest('GET', `skr_flokkar?or=(verk_id.eq.${verk.id},verk_id.is.null)&select=id,heiti`)).map((f) => [f.id, f.heiti]));
  const flAf = new Map((await allt(`skr_skraningar?verk_id=eq.${verk.id}&eytt=eq.false&select=id,flokkur_id&order=id`)).map((s) => [s.id, flokkar.get(s.flokkur_id) || '']));
  const hnit = await allt(`skr_haedarhnit?verk_id=eq.${verk.id}&yfirlit_id=eq.${yf.id}&select=skraning_id,x_px,y_px&order=skraning_id`);
  const kerfi = new Map((await allt(`skr_kerfi?verk_id=eq.${verk.id}&select=skraning_id,kerfi&order=skraning_id`)).map((k) => [k.skraning_id, k.kerfi]));
  // upprunaleg (vörpuð) staða: handvirkt færðir punktar eru látnir í friði; sjálfvirkt færðir reiknast aftur frá fra_x/fra_y
  const inn = []; let handv = 0;
  for (const h of hnit) {
    const f = fAf.get(h.skraning_id); if (f && f.uppruni !== 'sjalfvirkt') { handv++; continue; }
    const hp = hopur(flAf.get(h.skraning_id) || '', kerfi.get(h.skraning_id)); if (!hp) continue;
    inn.push({ id: h.skraning_id, x: f && f.fra_x != null ? +f.fra_x : +h.x_px, y: f && f.fra_y != null ? +f.fra_y : +h.y_px, hopur: hp });
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'skr-festa-')), fInn = path.join(tmp, 'inn.json'), fUt = path.join(tmp, 'ut.json');
  fs.writeFileSync(fInn, JSON.stringify(inn));
  const r = spawnSync('python', ['-I', path.join(__dirname, 'skraning-gatakort-skr-festa.py'), path.join(YF, `yfirlit-${HAED.toLowerCase()}.jpg`), LOG, HAED.toLowerCase(), fInn, fUt, String(RAD), ...PRUFA], { encoding: 'utf8', maxBuffer: 64e6 });
  if (r.status !== 0) throw new Error('python: ' + (r.stderr || r.stdout || '').slice(-600));
  if (r.stdout.trim()) console.log(r.stdout.trim());
  const ut = JSON.parse(fs.readFileSync(fUt, 'utf8')); fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`${HAED}: ${hnit.length} skráningar á yfirliti · ${inn.length} í hópum með lag · ${handv} handvirkt færðar (ósnertar) · radíus ${RAD} px`);
  console.log('hópur    | punktar | á brunavegg | á vegglínu | ófærðir | færsla miðg. | 90 % | mest (m)');
  for (const [h, y] of Object.entries(ut.yfirlit)) console.log(`${h.padEnd(8)} | ${String(y.punktar).padStart(7)} | ${String(y.a_brunavegg).padStart(11)} | ${String(y.a_vegglinu).padStart(10)} | ${String(y.ofaerdir).padStart(7)} | ${y.faersla_midgildi_px == null ? '—' : (y.faersla_midgildi_px / 33.3).toFixed(2).padStart(12)} | ${y.faersla_90_px == null ? '—' : (y.faersla_90_px / 33.3).toFixed(2)} | ${y.faersla_mest_px == null ? '—' : (y.faersla_mest_px / 33.3).toFixed(2)}`);
  const faerdir = ut.punktar.filter((p) => p.fest && p.d >= 1);
  if (!WRITE) { console.log(`ÞURRKEYRSLA — ${faerdir.length} punktar yrðu færðir; ekkert skrifað`); return; }
  const nyir = [], breyta = [], idNu = new Set(faerdir.map((p) => p.id));
  for (const p of faerdir) { const f = fAf.get(p.id); if (f) breyta.push([f.id, p]); else nyir.push({ verk_id: verk.id, skraning_id: p.id, teikning_id: yf.id, x_px: p.fx, y_px: p.fy, fra_x: Math.round(p.x * 10) / 10, fra_y: Math.round(p.y * 10) / 10, uppruni: 'sjalfvirkt' }); }
  for (let i = 0; i < nyir.length; i += 500) await rest('POST', 'skr_faerslur', nyir.slice(i, i + 500), 'return=minimal');
  for (const [id, p] of breyta) await rest('PATCH', `skr_faerslur?id=eq.${id}`, { x_px: p.fx, y_px: p.fy }, 'return=minimal');
  const ur = sjalf.filter((f) => !idNu.has(f.skraning_id));   // eldri sjálfvirk færsla sem á ekki lengur við
  for (let i = 0; i < ur.length; i += 200) await rest('PATCH', `skr_faerslur?id=in.(${ur.slice(i, i + 200).map((f) => f.id).join(',')})`, { eytt: true }, 'return=minimal');
  console.log(`BÚIÐ — ${nyir.length} nýjar færslur, ${breyta.length} uppfærðar, ${ur.length} afturkallaðar`);
})().catch((e) => { console.error('VILLA', e.message); process.exit(1); });
