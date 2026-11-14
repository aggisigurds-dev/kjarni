// Felur (eytt=true, ALDREI hard-delete) 31 milliloftsskráningu á 6H S2 sem var skráð ofan frá (Agnar 14.11.2026: „Jú má soft delete“).
//   node skraning-ofan-fra-fela.cjs            → mælir aðeins (lesaðeins): raðirnar 31, sýnirnar skr_yfirlit / skr_hub_skraningar / skr_haedarhnit
//   node skraning-ofan-fra-fela.cjs --write    → afrit í <AFRIT>, eytt=true á raðirnar, færsla í skr_atburdir (hvad 'eytt') fyrir hverja, mælir svo aftur
//   node skraning-ofan-fra-fela.cjs --til-baka → eytt=false á sömu raðir (afturköllun)
const fs = require('node:fs'), path = require('node:path');
const env = {}; for (const l of fs.readFileSync('C:/Users/Slokkvitaeki/luna-bridge/.env', 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, ''); }
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }, U = env.SUPABASE_URL + '/rest/v1/';
const NR = [145, 1060, 1061, 1063, 1064, 1065, 1066, 1077, 1078, 1079, 1080, 1081, 1082, 1083, 1084, 1089, 1090, 1092, 1094, 1095, 1097, 1098, 1099, 1363, 1364, 1365, 1366, 1367, 1368, 1369, 1370];
const AFRIT = 'C:/Users/Slokkvitaeki/kjarni-skrkort/apps/slokkvitaeki/tools/skraning-ofan-fra-afrit-20261114.json';
const HAM = process.argv[2] || '';
const saekja = async (p, auka = {}) => { const r = await fetch(U + p, { headers: { ...H, ...auka } }); return { ok: r.ok, status: r.status, svid: r.headers.get('content-range'), d: r.ok ? await r.json() : (await r.text()).slice(0, 200) }; };
const telja = async (p) => { const r = await saekja(p, { Prefer: 'count=exact', Range: '0-0' }); return r.ok ? r.svid.split('/')[1] : `VILLA ${r.status} ${r.d}`; };
const maela = async (ids) => {
  const ut = {};
  ut['skr_skraningar verk 4, eytt=false'] = await telja('skr_skraningar?verk_id=eq.4&eytt=eq.false&select=id');
  ut['skr_skraningar verk 4, eytt=true'] = await telja('skr_skraningar?verk_id=eq.4&eytt=eq.true&select=id');
  for (const syn of ['skr_yfirlit', 'skr_hub_skraningar', 'skr_haedarhnit']) {
    const e = await saekja(`${syn}?select=*&limit=1`); if (!e.ok) { ut[syn] = `ekki lesanleg (${e.status})`; continue; }
    const dalkar = Object.keys(e.d[0] || {}); ut[syn + ' dálkar'] = dalkar.join(',').slice(0, 300);
    ut[syn + ' raðir alls'] = await telja(`${syn}?select=*`);
    if (dalkar.includes('verk_id')) ut[syn + ' verk 4'] = await telja(`${syn}?verk_id=eq.4&select=*`);
    const idd = dalkar.includes('skraning_id') ? 'skraning_id' : dalkar.includes('id') ? 'id' : null;
    if (idd) ut[`${syn} þar sem ${idd} er ein af 31`] = await telja(`${syn}?${idd}=in.(${ids.join(',')})&select=*`);
  }
  return ut;
};
(async () => {
  const r = await saekja(`skr_skraningar?verk_id=eq.4&ajour_serial=in.(${NR.join(',')})&select=*&order=ajour_serial`);
  if (!r.ok) throw new Error('lestur ' + r.status + ' ' + r.d);
  const radir = r.d, ids = radir.map((x) => x.id);
  console.log('raðir fundnar:', radir.length, '· eytt nú:', radir.filter((x) => x.eytt).length, '· done:', radir.filter((x) => x.stada === 'done').length, '· flokkur_id:', [...new Set(radir.map((x) => x.flokkur_id))].join(','), '· teikning_id:', [...new Set(radir.map((x) => x.teikning_id))].join(','));
  if (radir.length !== NR.length) throw new Error('fjöldi raða stemmir ekki við listann');
  console.log('MÆLING', JSON.stringify(await maela(ids), null, 1));
  if (HAM !== '--write' && HAM !== '--til-baka') return;
  const eytt = HAM === '--write';
  if (eytt) { fs.mkdirSync(path.dirname(AFRIT), { recursive: true }); if (!fs.existsSync(AFRIT)) fs.writeFileSync(AFRIT, JSON.stringify({ hvad: 'Afrit raða í skr_skraningar ÁÐUR en eytt=true var sett (milliloft skráð ofan frá, 6H S2)', hvenaer: new Date().toISOString(), radir }, null, 1)); console.log('afrit:', AFRIT); }
  const p = await fetch(U + `skr_skraningar?verk_id=eq.4&id=in.(${ids.join(',')})`, { method: 'PATCH', headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ eytt }) });
  if (!p.ok) throw new Error('PATCH ' + p.status + ' ' + (await p.text()).slice(0, 300));
  const br = await p.json(); console.log('uppfærðar raðir:', br.length, '· eytt =', eytt);
  const a = await fetch(U + 'skr_atburdir', { method: 'POST', headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(ids.map((id) => ({ skraning_id: id, hvad: 'eytt', gogn: { eytt, astaeda: eytt ? 'Milliloft skráð ofan frá: í gólfi er aðeins neðri vinnan talin (Agnar 14.11.2026)' : 'Afturkallað', uppruni: 'skraning-ofan-fra-fela.cjs' } }))) });
  console.log('skr_atburdir:', a.status, a.ok ? '' : (await a.text()).slice(0, 200));
  console.log('MÆLING EFTIR', JSON.stringify(await maela(ids), null, 1));
})().catch((e) => { console.error('VILLA', e.message); process.exit(1); });
