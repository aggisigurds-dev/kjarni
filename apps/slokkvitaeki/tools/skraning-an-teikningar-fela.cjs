// Felur (eytt=true, ALDREI hard-delete) skráningar NLSH-gatakortsins (verk 4) sem eru EKKI settar á teikningu („Registrations without drawing“ í Ajour).
// Það eru vinnufærslur, ekki unnið verk á stað (Agnar 14.11.2026: „þær sem eru utan teikningar, 400+ má soft eyða“).
//   node tools/skraning-an-teikningar-fela.cjs            → mælir aðeins (lesaðeins): fjöldi, staða, flokkar, mánuðir, sýnirnar
//   node tools/skraning-an-teikningar-fela.cjs --write    → afrit raðanna í AFRIT, eytt=true, færsla í skr_atburdir (hvad 'eytt'), mælir svo aftur
//   node tools/skraning-an-teikningar-fela.cjs --til-baka → eytt=false á raðirnar í AFRIT (afturköllun)
const fs = require('node:fs'), path = require('node:path');
const env = {}; for (const l of fs.readFileSync(process.env.LUNA_ENV || 'C:/Users/Slokkvitaeki/luna-bridge/.env', 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, ''); }
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }, U = env.SUPABASE_URL + '/rest/v1/';
const AFRIT = path.join(__dirname, 'skraning-an-teikningar-afrit-20261114.json'), HAM = process.argv[2] || '', VERK = 4;
const allt = async (p) => { const ut = []; for (let i = 0; ; i += 1000) { const r = await fetch(U + p, { headers: { ...H, Range: `${i}-${i + 999}` } }); if (!r.ok) throw new Error(p + ' ' + r.status + ' ' + (await r.text()).slice(0, 200)); const d = await r.json(); ut.push(...d); if (d.length < 1000) break; } return ut; };
const telja = async (p) => { const r = await fetch(U + p, { headers: { ...H, Prefer: 'count=exact', Range: '0-0' } }); return r.ok ? r.headers.get('content-range').split('/')[1] : `VILLA ${r.status}`; };
const maela = async () => ({
  'skr_skraningar eytt=false': await telja(`skr_skraningar?verk_id=eq.${VERK}&eytt=eq.false&select=id`),
  'skr_skraningar eytt=true': await telja(`skr_skraningar?verk_id=eq.${VERK}&eytt=eq.true&select=id`),
  'þar af án teikningar, eytt=false': await telja(`skr_skraningar?verk_id=eq.${VERK}&eytt=eq.false&teikning_id=is.null&select=id`),
  'skr_yfirlit': await telja(`skr_yfirlit?verk_id=eq.${VERK}&select=skraning_id`),
  'skr_hub_skraningar': await telja(`skr_hub_skraningar?verk_id=eq.${VERK}&select=skraning_id`),
  'skr_haedarhnit': await telja(`skr_haedarhnit?verk_id=eq.${VERK}&select=skraning_id`),
});
const hopa = (a, f) => { const t = {}; for (const x of a) { const k = f(x); t[k] = (t[k] || 0) + 1; } return Object.entries(t).sort((x, y) => y[1] - x[1]).map(([k, n]) => `${k} ${n}`).join(' · '); };
const skrifa = async (ids, eytt, astaeda) => {
  let n = 0;
  for (let i = 0; i < ids.length; i += 150) {
    const b = ids.slice(i, i + 150);
    const p = await fetch(U + `skr_skraningar?verk_id=eq.${VERK}&id=in.(${b.join(',')})`, { method: 'PATCH', headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ eytt }) });
    if (!p.ok) throw new Error('PATCH ' + p.status + ' ' + (await p.text()).slice(0, 300)); n += (await p.json()).length;
    const a = await fetch(U + 'skr_atburdir', { method: 'POST', headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(b.map((id) => ({ skraning_id: id, hvad: 'eytt', gogn: { eytt, astaeda, uppruni: 'skraning-an-teikningar-fela.cjs' } }))) });
    if (!a.ok) throw new Error('skr_atburdir ' + a.status + ' ' + (await a.text()).slice(0, 200));
  }
  return n;
};
(async () => {
  if (HAM === '--til-baka') { const ids = JSON.parse(fs.readFileSync(AFRIT, 'utf8')).radir.map((r) => r.id); console.log('birtar aftur:', await skrifa(ids, false, 'Afturkallað'), 'af', ids.length); console.log('MÆLING', JSON.stringify(await maela(), null, 1)); return; }
  const fl = new Map((await allt('skr_flokkar?select=id,heiti')).map((f) => [f.id, f.heiti]));
  const radir = await allt(`skr_skraningar?verk_id=eq.${VERK}&eytt=eq.false&teikning_id=is.null&select=*&order=id`);
  const my = new Set(); for (let i = 0; i < radir.length; i += 150) for (const m of await allt(`skr_myndir?select=skraning_id&skraning_id=in.(${radir.slice(i, i + 150).map((r) => r.id).join(',')})`)) my.add(m.skraning_id);
  console.log('án teikningar (teikning_id er tómt), ófaldar:', radir.length, '· með hnit (x_px):', radir.filter((r) => r.x_px != null).length, '· með myndir:', radir.filter((r) => my.has(r.id)).length);
  console.log('  staða:', hopa(radir, (r) => r.stada));
  console.log('  flokkur:', hopa(radir, (r) => fl.get(r.flokkur_id) || '(enginn)'));
  console.log('  stofnað (mánuður):', hopa(radir, (r) => (r.created_at || '').slice(0, 7)));
  console.log('  kláraðar (done), númer:', radir.filter((r) => r.stada === 'done').map((r) => r.ajour_serial ?? r.radnr).join(','));
  console.log('MÆLING', JSON.stringify(await maela(), null, 1));
  if (HAM !== '--write') return;
  if (fs.existsSync(AFRIT)) throw new Error('afrit er þegar til: ' + AFRIT + ' (færðu það eða notaðu --til-baka)');
  fs.writeFileSync(AFRIT, JSON.stringify({ hvad: 'Afrit raða í skr_skraningar ÁÐUR en eytt=true var sett (skráningar án teikningar, verk 4)', hvenaer: new Date().toISOString(), radir }, null, 1));
  console.log('afrit:', AFRIT, '·', radir.length, 'raðir');
  console.log('faldar:', await skrifa(radir.map((r) => r.id), true, 'Skráning án teikningar: vinnufærsla, ekki unnið verk (Agnar 14.11.2026)'));
  console.log('MÆLING EFTIR', JSON.stringify(await maela(), null, 1));
})().catch((e) => { console.error('VILLA', e.message); process.exit(1); });
