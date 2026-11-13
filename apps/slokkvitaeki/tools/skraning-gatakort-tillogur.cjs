#!/usr/bin/env node
// Tillögur að óskráðum loftræstiþéttingum á gatakortinu (13.11.2026): staðir þar sem stokkur fer gegnum rauðan brunavegg á yfirlitsblaði hæðar,
// engin loftræstiskráning er innan 0,9 m, en sami staður á viðmiðunarhæðinni er skráður. Fer inn í skr_aaetlud með uppruni 'tillaga:kross-<haed>'.
// TILLAGA telst EKKI í stöðuskýrslunni (SkyrslaClient sleppir uppruni like 'tillaga:%'); á gatakortinu er hún appelsínugulur hringur með „?“ sem
// Agnar staðfestir („Já, eftir að þétta“ → uppruni handvirkt, rauður punktur, telst þá sem Eftir) eða hafnar („Nei, ekki gat“ → eytt).
//
//   node tools/skraning-gatakort-tillogur.cjs --haed 5H --vidmid 6H --yfirlit <mappa> --log <mappa>            → ÞURRKEYRSLA
//   … --write            → setur nýjar tillögur inn. Endurkeyranlegt: staður sem á áætlað gat eða tillögu (líka hafnaða) fær ekki nýja.
//   … --radius 30        px (33,3 px = 1 m)
// Þarf yfirlit-<haed>.jpg (5790 × 2850) og lag-<haed>-loftraesing-*.png í sömu stærð á diski (sömu möppur og skraning-gatakort-skr-festa).
// Skráningum og Ajour er aldrei breytt. Keyra aftur eftir nýjan Ajour-innflutning eða færslur (þá hverfa staðir sem hafa fengið skráningu EKKI sjálfkrafa:
// para.cjs parar tillöguna við skráninguna og hún hættir að birtast sem tillaga).
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), { execFileSync } = require('node:child_process');
const ARGS = process.argv.slice(2), WRITE = ARGS.includes('--write'), opt = (f, d) => { const i = ARGS.indexOf(f); return i >= 0 ? ARGS[i + 1] : d; };
const HAED = opt('--haed'), VIDMID = opt('--vidmid'), YF = opt('--yfirlit'), LOG = opt('--log'), RAD = +opt('--radius', 30), VERK = 4;
const env = {}; for (const f of ['C:/Users/Slokkvitaeki/luna-bridge/.env']) if (fs.existsSync(f)) for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, ''); }
const URL_ = process.env.SUPABASE_URL || env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!HAED || !VIDMID || !YF || !LOG || !URL_ || !KEY) { console.error('Notkun: skraning-gatakort-tillogur.cjs --haed 5H --vidmid 6H --yfirlit <mappa> --log <mappa> [--radius 30] [--write]'); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const allt = async (p) => { const ut = []; for (let i = 0; ; i += 1000) { const r = await fetch(`${URL_}/rest/v1/${p}`, { headers: { ...H, Range: `${i}-${i + 999}` } }); if (!r.ok) throw new Error(`${p} ${r.status} ${(await r.text()).slice(0, 200)}`); const d = await r.json(); ut.push(...d); if (d.length < 1000) break; } return ut; };
(async () => {
  const teikn = await allt(`skr_teikningar?verk_id=eq.${VERK}&tegund=eq.yfirlit&eytt=eq.false&select=id,haed`), tid = teikn.find((t) => t.haed === HAED)?.id;
  if (!tid) throw new Error(`Yfirlitsblað ${HAED} fannst ekki`);
  const fl = await allt('skr_flokkar?select=id,heiti'), loft = new Set(fl.filter((f) => /^(Loft|Raufar)/i.test(f.heiti)).map((f) => f.id));
  const skr = await allt(`skr_skraningar?verk_id=eq.${VERK}&eytt=eq.false&select=id,flokkur_id&order=id`), lid = new Set(skr.filter((s) => loft.has(s.flokkur_id)).map((s) => s.id));
  const hn = await allt(`skr_haedarhnit?verk_id=eq.${VERK}&haed=in.(${HAED},${VIDMID})&select=skraning_id,haed,x_px,y_px&order=skraning_id`);
  const stadir = { [HAED]: [], [VIDMID]: [] }; for (const h of hn) if (lid.has(h.skraning_id)) stadir[h.haed].push([+h.x_px, +h.y_px]);
  // staðir sem eiga þegar áætlað loftræstigat (óeytt) eða tillögu (líka hafnaða: hún kemur ekki aftur)
  const aa = await allt(`skr_aaetlud?verk_id=eq.${VERK}&teikning_id=eq.${tid}&fag=eq.loftraesting&select=x_px,y_px,eytt,uppruni&order=id`);
  const til = aa.filter((a) => !a.eytt || String(a.uppruni).startsWith('tillaga:')).map((a) => [+a.x_px, +a.y_px]);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gk-till-')), inn = path.join(tmp, 'inn.json'), ut = path.join(tmp, 'ut.json');
  fs.writeFileSync(inn, JSON.stringify({ skr: stadir, til }));
  execFileSync('python', ['-I', path.join(__dirname, 'skraning-gatakort-tillogur.py'), YF, LOG, HAED, VIDMID, inn, ut, String(RAD)], { stdio: ['ignore', 'ignore', 'inherit'] });
  const { tal, tillogur } = JSON.parse(fs.readFileSync(ut, 'utf8')); fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`${HAED} (viðmið ${VIDMID}, radíus ${RAD} px = ${(RAD / 33.3).toFixed(2)} m): loftræstiskráningar ${stadir[HAED].length} / ${stadir[VIDMID].length}`);
  console.log(`  skurðklasar stokks og brunaveggjar ${tal.klasar} · með skráningu ${tal.med_skraningu} · án ${tal.an}: sami staður á ${VIDMID} skráður ${tal.vidmid_skrad}, líka óskráður ${tal.vidmid_oskrad}, enginn klasi þar ${tal.vidmid_enginn}`);
  console.log(`  þegar áætlað gat eða tillaga á staðnum: ${tal.til_fyrir} · NÝJAR TILLÖGUR: ${tillogur.length} (` + ['S1', 'S2', 'S4', 'S5'].map((d) => `${d} ${tillogur.filter((t) => t.deild === d).length}`).join(' · ') + ')');
  if (!WRITE) { console.log('ÞURRKEYRSLA: ekkert skrifað. Bættu við --write til að setja tillögurnar inn.'); return; }
  const radir = tillogur.map((t) => ({ verk_id: VERK, teikning_id: tid, x_px: t.x, y_px: t.y, fag: 'loftraesting', fjoldi: 2, uppruni: `tillaga:kross-${HAED.toLowerCase()}`, athugasemd: `Tillaga (${new Date().toISOString().slice(0, 10)}): loftræsistokkur fer gegnum brunavegg hér á teikningu. Sami staður er skráður á ${VIDMID}, en engin loftræstiskráning er innan ${(RAD / 33.3).toFixed(1).replace('.', ',')} m á ${HAED}${t.naesta_m != null ? ` (næsta er ${String(t.naesta_m).replace('.', ',')} m frá)` : ''}.` }));
  for (let i = 0; i < radir.length; i += 200) { const r = await fetch(`${URL_}/rest/v1/skr_aaetlud`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(radir.slice(i, i + 200)) }); if (!r.ok) throw new Error(`skrif ${r.status} ${(await r.text()).slice(0, 300)}`); }
  console.log(`SKRIFAÐ: ${radir.length} tillögur í skr_aaetlud (uppruni tillaga:kross-${HAED.toLowerCase()}).`);
})().catch((e) => { console.error('VILLA', e.message); process.exit(1); });
