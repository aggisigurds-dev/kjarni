#!/usr/bin/env node
// Gatakort NLSH (11.11.2026) — les Ajour-útflutning (luna-bridge/ajour-export, sjá ajour-export-allt.js) inn í skr_* sem
// SÉR GREININGARVERK: skr_verk.ajour_nafn er haft NULL svo viewið skr_yfirlit haldi áfram að lesa NLSH úr ajour_registrations
// og uppgjör hubsins (nlsh-uppgjor / nlsh-dashboard, lesa skr_hub_skraningar eftir project_name) breytist EKKI.
// ⚠ Keyrðu ALDREI luna-bridge/ajour-import.js --write fyrir NLSH: það setur ajour_nafn og snýr uppgjörinu á skr_*.
//
//   node tools/skraning-gatakort-innflutningur.cjs                 → DRY: telur, skrifar ekkert
//   node tools/skraning-gatakort-innflutningur.cjs --write         → skrifar (upsert, endurkeyranlegt)
//   … --yfirlit <mappa>   mappa með yfirlit-5h.jpg / yfirlit-6h.jpg (brunayfirlit skorið við CROP í S px/pt)
//
// Hver skráning fær ajour_gogn: { deild, svaedi, lagf, lagf_dags, a_stad, tvitak_af, upd, myndir[], teikning }.
//   deild   S1|S2|S4|S5 úr x-hniti (stærstu bilin á blaðinu); svaedi N|C|S úr y-hniti
//   lagf    'A' lagfæring skráð sem nýtt verk · 'B' aðeins athugasemd á upphaflegri skráningu · '?' óflokkað (engin dagsetning)
//   a_stad  raðnr. eldri gólfskráningar innan 6 ‰ með annan dag · tvitak_af raðnr. skráningar á nákvæmlega sömu hnitum
const fs = require('node:fs'), path = require('node:path');
const ARGS = process.argv.slice(2), flag = (f) => ARGS.includes(f), opt = (f) => { const i = ARGS.indexOf(f); return i >= 0 ? ARGS[i + 1] : null; };
const WRITE = flag('--write');
const DIR = process.env.AJOUR_EXPORT_DIR || 'C:/Users/Slokkvitaeki/luna-bridge/ajour-export';
const ENVF = process.env.LUNA_ENV || 'C:/Users/Slokkvitaeki/luna-bridge/.env';
const YFIRLIT = opt('--yfirlit');
const HEITI = 'NLSH 5-6. hæð · gatakort';
// Milliloft skráð OFAN FRÁ á 6H S2 (Ajour-númer): falin í grunninum (eytt=true) 14.11.2026 að ósk Agnars, því í gólfi er aðeins neðri vinnan talin.
// Innflutningurinn má EKKI birta þær aftur. Sami listi: OFAN_FRA í skyrsla/SkyrslaClient.tsx og tools/skraning-ofan-fra-fela.cjs.
const OFAN_FRA = new Set([145, 1060, 1061, 1063, 1064, 1065, 1066, 1077, 1078, 1079, 1080, 1081, 1082, 1083, 1084, 1089, 1090, 1092, 1094, 1095, 1097, 1098, 1099, 1363, 1364, 1365, 1366, 1367, 1368, 1369, 1370]);
const env = {}; try { for (const l of fs.readFileSync(ENVF, 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, ''); } } catch {}
const URL_ = process.env.SUPABASE_URL || env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) { console.error('Vantar SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (luna-bridge/.env)'); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
async function rest(method, p, body, prefer) {
  const r = await fetch(`${URL_}/rest/v1/${p}`, { method, headers: { ...H, ...(prefer ? { Prefer: prefer } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); if (!r.ok) throw new Error(`${method} ${p.slice(0, 60)} → ${r.status} ${t.slice(0, 300)}`); return t ? JSON.parse(t) : null;
}
const get = (p) => rest('GET', p);
const upsert = (table, rows, on) => rest('POST', `${table}?on_conflict=${on}`, rows, 'resolution=merge-duplicates,return=representation');
const insert = (table, rows) => rest('POST', table, rows, 'return=representation');
const patch = (table, q, body) => rest('PATCH', `${table}?${q}`, body, 'return=representation');
async function upload(sp, buf, ct) { const r = await fetch(`${URL_}/storage/v1/object/skraning/${sp}`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': ct, 'x-upsert': 'true' }, body: buf }); if (!r.ok && r.status !== 409) throw new Error(`upload ${sp} → ${r.status} ${(await r.text()).slice(0, 200)}`); }
function jpegDims(buf) { let i = 2; while (i < buf.length) { if (buf[i] !== 0xff) { i++; continue; } const m = buf[i + 1]; if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) }; i += 2 + buf.readUInt16BE(i + 2); } return {}; }

// Blöð → hæð og deildir (vinstri → hægri). Sama og brunaholf/tools/nlsh-stukur.cjs (RULES/TRANS/CROP) — breyta á báðum stöðum.
const RULES = [
  [/^6H\.pdf/i, '6H', ['S1', 'S2']], [/Brunayfirlit 6H/i, '6H', ['S4', 'S5']], [/^6H4S/i, '6H', ['S4']], [/^6H5S/i, '6H', ['S5']],
  [/^5H 1S og 2S/i, '5H', ['S1', 'S2']], [/^5H\. Ceiling/i, '5H', ['S1', 'S2', 'S4', 'S5']], [/^5H\s+S4 \+ S5/i, '5H', ['S4', 'S5']],
  [/^4H\. S1-S2/i, '4H', ['S1', 'S2']], [/^4H\s+4S \+ 5S/i, '4H', ['S4', 'S5']],
  // Rafmagn á sérteikningum (11.11.2026): S1 vinstra megin (ásar A–D), S2 hægra megin (F–I) — skipt við stærsta bilið í x
  [/^6H 2S-1S Rafmagns/i, '6H', ['S1', 'S2']], [/^5H1S OG 5H2S/i, '5H', ['S1', 'S2']],
];
// Sérteikningar stilltar af á yfirlitið með fylgni brunaveggja (11.11.2026): yfirlit_px = a·px + (e, f). „6H 2S-1S“ er sett saman úr
// tveimur myndum (S1 og S2 hlið við hlið, bilið á milli ekki í kvarða) og fær því sér vörpun fyrir hægri hlutann (x ≥ fra_x).
// Endurstilling 11.11.2026 (Agnar: „eins nákvæmt og hægt er“): SER_VORPUN ræður FRAM YFIR TRANS. Vörpun er full affín eins og
// canvas.transform: X = a·x + c·y + e, Y = b·x + d·y + f (b, c = 0 og d = a ef þau vantar).
//  · „5H 1S og 2S“ er samsett úr tveimur myndum → sér vörpun per helming (fylgni veggja 0,40 → 0,50 og 0,39 → 0,48).
//  · „4H. S1-S2“ er SKÖNNUÐ 4. hæðar grunnmynd, snúin um 0,31°: eldri vörpun (a 0,625) var metrum frá. Ný vörpun úr þremur
//    ásamótum sem eru eins á öllum hæðum (A∩1, I∩13, D∩13), lesin af blaðinu og af 5H-yfirlitinu.
//  · „4H 4S + 5S“ / „5H S4 + S5“: báðir helmingar gáfu kvarða 0,9328 (fylgni 0,55 → 0,64 og 0,46 → 0,65).
//  · „6H4S“ og „6H5S“ voru ekki á yfirliti (fylgni 0,50).
const SER_VORPUN = [
  [/^6H 2S-1S Rafmagns/i, '6H', { a: 0.46475, e: -58, f: -40, hlutar: [{ fra_x: 2180, a: 0.46775, e: 194.3, f: -50 }] }],
  [/^5H1S OG 5H2S/i, '5H', { a: 0.4536, e: -158, f: -172 }],
  [/^5H 1S og 2S/i, '5H', { a: 0.56772, e: -160, f: -172, hlutar: [{ fra_x: 2160, a: 0.56682, e: -158.3, f: -170 }] }],
  [/^4H\. S1-S2/i, '4H', { a: 0.71578, b: 0.00382, c: -0.00335, d: 0.71621, e: -308.78, f: -743.03 }],
  [/^4H\s+4S \+ 5S/i, '4H', { a: 0.9328, e: 3427, f: -242 }], [/^5H\s+S4 \+ S5/i, '5H', { a: 0.9328, e: 3427, f: -242 }],
  [/^6H4S/i, '6H', { a: 0.372, e: 3430, f: -82 }], [/^6H5S/i, '6H', { a: 0.36733, e: 4692, f: -70 }],
];
// Ajour px → PDF-punktar brunayfirlitsblaðsins (A285-31 5H / A286-31 6H Rev.A): pt = px / k + d. Yfirlitsmyndin = CROP í S px/pt.
const CROP = { x: 230, y: 265, w: 1930, h: 950 }, S = 3;
const TRANS = [
  [/^6H\.pdf/i, '6H', 1.58, 12.3, 34.1], [/Brunayfirlit 6H/i, '6H', 1.58, 2.1, 0.9],
  [/^5H 1S og 2S/i, '5H', 5.2906, 176.8, 207.2], [/^5H\s+S4 \+ S5/i, '5H', 3.22, 1372.1, 184.2], [/^5H\. Ceiling/i, '5H', 1.58, 12.3, 34.1],
  [/^4H\. S1-S2/i, '4H', 4.8, 202.5, 88.5], [/^4H\s+4S \+ 5S/i, '4H', 3.22, 1372.1, 184.2],
];
const YFIRLITSBLOD = [['6H', 'Brunayfirlit 6H (A286-31 Rev.A)', 'yfirlit-6h.jpg'], ['5H', 'Brunayfirlit 5H (A285-31 Rev.A)', 'yfirlit-5h.jpg'], ['4H', 'Brunayfirlit 4H (5H-blaðið notað)', 'yfirlit-5h.jpg']];
function deildFall(deildir, xs) {
  const r = [...xs].sort((p, q) => p - q), bil = [];
  for (let i = 1; i < r.length; i++) bil.push([r[i] - r[i - 1], (r[i - 1] + r[i]) / 2]);
  bil.sort((p, q) => q[0] - p[0]);
  const skil = bil.slice(0, deildir.length - 1).filter((b) => b[0] > 150).map((b) => b[1]).sort((p, q) => p - q);
  return (x) => deildir[Math.min(deildir.length - 1, skil.filter((c) => x >= c).length)];
}
const FIX = /fix|lagf|lagað|laga |repair|damage|put more|extra work|viðger|vidger|breyting|endur|re-?seal|redo|again/i;
const dmy = (s) => { const m = /^(\d{2})-(\d{2})-(\d{4})/.exec(s || ''); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
const dagarILysingu = (d) => { const out = []; const re = /(\d{1,2})[._\/-](\d{1,2})[._\/-](\d{2,4})/g; let m; while ((m = re.exec(d))) { let y = +m[3]; if (y < 100) y += 2000; if (+m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31 && y >= 2025 && y <= 2027) out.push(Date.UTC(y, +m[2] - 1, +m[1])); } return out; };
const starfsmNr = (r) => { for (const c of r.categoryNames || []) { const m = /Starfsmaður\s+(\d+)/i.exec(c.name || ''); if (m) return Number(m[1]); } return null; };
const flokkTegund = (h) => (/^(Stál|Plast|Loft|Gólf|Gat)/i.test(h) ? 'gat' : /rauf|Raf/i.test(h) ? 'lina' : /Guide/i.test(h) ? 'punktur' : 'annad');

(async () => {
  const mappa = fs.readdirSync(DIR).find((d) => /NLSH/i.test(d) && fs.existsSync(path.join(DIR, d, 'skraningar.json')));
  if (!mappa) throw new Error('NLSH-útflutningur fannst ekki í ' + DIR);
  const pakki = JSON.parse(fs.readFileSync(path.join(DIR, mappa, 'skraningar.json'), 'utf8'));
  const p = pakki.project, skr = pakki.skraningar.filter((r) => !r.deleted);
  const nafn = Object.fromEntries(pakki.teikningar.map((t) => [t.fileId, t.nafn || '']));
  console.log(`▶ ${p.name.trim()} — ${skr.length} skráningar, ${pakki.teikningar.length} teikningar, útflutt ${pakki.exported_at}${WRITE ? '' : ' — DRY (ekkert skrifað)'}`);

  // --- greining per skráning
  const G = new Map();
  const byFile = {}; for (const r of skr) { const c = (r.registrationCoordinates || [])[0]; if (c) (byFile[c.fileId] ??= []).push({ r, x: c.x, y: c.y }); }
  for (const [fid, a] of Object.entries(byFile)) {
    const rule = RULES.find((x) => x[0].test(nafn[fid]));
    const ys = a.map((q) => q.y), ymn = Math.min(...ys), ymx = Math.max(...ys);
    const deild = rule ? deildFall(rule[2], a.map((q) => q.x)) : null;
    for (const q of a) { const fy = (q.y - ymn) / ((ymx - ymn) || 1); G.set(q.r.id, { haed: rule ? rule[1] : null, deild: deild ? deild(q.x) : null, svaedi: rule ? (fy < 0.275 ? 'N' : fy < 0.725 ? 'C' : 'S') : null }); }
    // tvítök: nákvæmlega sömu hnit á sama blaði
    const hn = new Map(); for (const q of a) { const k = q.x + '|' + q.y; (hn.get(k) || hn.set(k, []).get(k)).push(q.r); }
    for (const h of hn.values()) if (h.length > 1) { h.sort((m, n) => m.serialNumber - n.serialNumber); for (const r of h.slice(1)) G.get(r.id).tvitak_af = Number(h[0].serialNumber); }
    // gólf: ný skráning innan 6 ‰ af eldri kláraðri gólfskráningu með annan framkvæmdadag
    const g = a.filter((q) => /^Gólf/i.test(q.r.categoryGroupName || '') && q.r.status === 4), Hh = (ymx - ymn) || 1;
    for (const q of g) { const e = g.find((o) => o.r.serialNumber < q.r.serialNumber && o.r.executionTo !== q.r.executionTo && Math.hypot(o.x - q.x, o.y - q.y) / Hh < 0.006); if (e) G.get(q.r.id).a_stad = Number(e.r.serialNumber); }
  }
  for (const r of skr) {
    const g = G.get(r.id) || G.set(r.id, {}).get(r.id), d = (r.description || '').trim();
    if (!FIX.test(d) && !g.a_stad) continue;
    const e = dmy(r.executionTo) ? Date.parse(dmy(r.executionTo)) : null, dl = dagarILysingu(d), sid = dl.length ? Math.max(...dl) : null;
    const visar = /(dot|punktur|hole|#)\s*#?\d{3,5}|\b\d{4,5}\s*(punktur|dot)/i.test(d);
    g.lagf = g.a_stad || visar ? 'A' : e != null && sid != null && sid - e > 7 * 864e5 ? 'B' : e != null && sid != null ? 'A' : '?';
    if (sid != null) g.lagf_dags = new Date(sid).toISOString().slice(0, 10);
  }
  const tel = (a, fn) => { const o = {}; for (const r of a) { const k = fn(r); if (k != null) o[k] = (o[k] || 0) + 1; } return Object.entries(o).sort().map(([k, v]) => k + ' ' + v).join(' · '); };
  console.log('  með pinna:', skr.filter((r) => (r.registrationCoordinates || []).length).length, '| klárað:', skr.filter((r) => r.status === 4).length, '| lagf:', tel(skr, (r) => G.get(r.id).lagf), '| tvítök:', skr.filter((r) => G.get(r.id).tvitak_af).length);
  console.log('  klárað per hæð/deild:', tel(skr.filter((r) => r.status === 4), (r) => { const g = G.get(r.id); return g.haed ? g.haed + ' ' + g.deild : null; }));
  if (!WRITE) { console.log('DRY — keyrðu með --write til að skrifa.'); return; }

  // --- verk (ajour_nafn = null: uppgjörið heldur áfram að lesa ajour_registrations)
  const [verk] = await upsert('skr_verk', [{ heiti: HEITI, ajour_project_id: p.projectId, ajour_nafn: null, verkkaupi: 'ÞG verk', heimilisfang: 'Nýr Landspítali, meðferðarkjarni', virkt: true, eytt: false }], 'ajour_project_id');
  console.log('  verk', verk.id, verk.heiti);
  // --- yfirlitsblöð
  const til = await get(`skr_teikningar?select=id,haed,tegund,ajour_file_id&verk_id=eq.${verk.id}`);
  const yfirlit = {};
  for (const [haed, heiti, skra] of YFIRLITSBLOD) {
    let row = til.find((t) => t.tegund === 'yfirlit' && t.haed === haed);
    const sp = `verk/${verk.id}/${skra}`; let dims = { w: CROP.w * S, h: CROP.h * S };
    if (YFIRLIT && fs.existsSync(path.join(YFIRLIT, skra))) { const buf = fs.readFileSync(path.join(YFIRLIT, skra)); dims = jpegDims(buf); await upload(sp, buf, 'image/jpeg'); }
    const body = { verk_id: verk.id, heiti, haed, tegund: 'yfirlit', mynd_path: sp, breidd_px: dims.w, haed_px: dims.h, rod: haed === '6H' ? 1 : haed === '5H' ? 2 : 3, deildir: ['S1', 'S2', 'S4', 'S5'] };
    row = row ? (await patch('skr_teikningar', `id=eq.${row.id}`, body))[0] : (await insert('skr_teikningar', [body]))[0];
    yfirlit[haed] = row.id;
  }
  // --- Ajour-teikningar
  const teiknId = new Map();
  for (const t of pakki.teikningar) {
    const jpg = path.join(DIR, mappa, 'teikningar', `${t.fileId}.jpg`); if (!fs.existsSync(jpg)) { console.log('  ! vantar', t.nafn); continue; }
    const buf = fs.readFileSync(jpg), dims = jpegDims(buf), sp = `verk/${verk.id}/ajour-${t.fileId}.jpg`;
    if (!til.some((x) => x.ajour_file_id === t.fileId)) await upload(sp, buf, 'image/jpeg');
    const tr = TRANS.find((x) => x[0].test(t.nafn || '')), rule = RULES.find((x) => x[0].test(t.nafn || '')), ser = SER_VORPUN.find((x) => x[0].test(t.nafn || ''));
    const [row] = await upsert('skr_teikningar', [{ verk_id: verk.id, heiti: t.nafn || t.fileId, haed: rule ? rule[1] : ((t.nafn || '').match(/^(\dH)/) || [])[1] || null, tegund: 'teikning', mynd_path: sp, breidd_px: dims.w || null, haed_px: dims.h || null, ajour_file_id: t.fileId, rod: 10,
      yfirlit_id: ser ? yfirlit[ser[1]] : tr ? yfirlit[tr[1]] : null, vorpun: ser ? ser[2] : tr ? { a: S / tr[2], e: (tr[3] - CROP.x) * S, f: (tr[4] - CROP.y) * S } : null, deildir: rule ? rule[2] : null }], 'ajour_file_id');
    teiknId.set(t.fileId, row.id);
  }
  console.log('  teikningar', teiknId.size, '+ yfirlit', Object.keys(yfirlit).length);
  // --- flokkar per verk, starfsmenn
  const flokkar = await get(`skr_flokkar?select=id,heiti&verk_id=eq.${verk.id}`);
  const vantar = [...new Set(skr.map((r) => r.categoryGroupName).filter((h) => h && !flokkar.some((f) => f.heiti === h)))];
  if (vantar.length) flokkar.push(...await insert('skr_flokkar', vantar.map((heiti, i) => { const m = /(\d+)\s*-\s*(\d+)/.exec(heiti); return { verk_id: verk.id, heiti, tegund: flokkTegund(heiti), mm_fra: m ? +m[1] : null, mm_til: m ? +m[2] : null, rod: 1000 + i }; })));
  const flokkId = (h) => (flokkar.find((f) => f.heiti === h) || {}).id || null;
  const menn = await get('skr_starfsmenn?select=id,numer');
  const brunaholf = ((await get('skr_fyrirtaeki?select=id&heiti=eq.Brunah%C3%B3lf%20ehf'))[0] || {}).id || null;
  const nrVantar = [...new Set(skr.map(starfsmNr).filter((n) => n && !menn.some((m) => m.numer === n)))];
  if (nrVantar.length) menn.push(...await upsert('skr_starfsmenn', nrVantar.map((numer) => ({ numer, nafn: `Starfsmaður ${numer}`, fyrirtaeki_id: brunaholf })), 'numer'));
  const mannId = (n) => (menn.find((m) => m.numer === n) || {}).id || null;
  // --- skráningar. Ajour á skráningar með SAMA raðnúmer (serialNumber) — skr_skraningar krefst einkvæms (verk_id, radnr), svo
  // sú fyrsta (elsta) heldur númerinu og hinar fá 1.000.000 + númer (+ n·1.000.000); rétta númerið er alltaf í ajour_serial.
  const sed = new Map(); const radnr = new Map();
  for (const r of [...skr].sort((a, b) => String(a.created).localeCompare(String(b.created)))) { const k = Number(r.serialNumber), c = sed.get(k) || 0; sed.set(k, c + 1); radnr.set(r.id, c ? k + c * 1000000 : k); if (c) (G.get(r.id) || G.set(r.id, {}).get(r.id)).radnr_tvitekid = true; }
  // Skráningar ÁN TEIKNINGAR sem voru faldar í grunninum (eytt=true, 14.11.2026, tools/skraning-an-teikningar-fela.cjs) haldast faldar meðan þær eru
  // enn án teikningar í Ajour; fái skráning stað á teikningu birtist hún aftur.
  const faldarAnT = new Set();
  for (let o = 0; ; o += 1000) { const d = await get(`skr_skraningar?verk_id=eq.${verk.id}&eytt=eq.true&teikning_id=is.null&select=ajour_registration_id&order=id&limit=1000&offset=${o}`); for (const q of d) faldarAnT.add(q.ajour_registration_id); if (d.length < 1000) break; }
  let n = 0;
  for (let i = 0; i < skr.length; i += 500) {
    const radir = skr.slice(i, i + 500).map((r) => { const c = (r.registrationCoordinates || [])[0], g = G.get(r.id) || {};
      return { verk_id: verk.id, radnr: radnr.get(r.id), teikning_id: c ? (teiknId.get(c.fileId) || null) : null, x_px: c ? c.x : null, y_px: c ? c.y : null,
        flokkur_id: flokkId(r.categoryGroupName), starfsmadur_id: mannId(starfsmNr(r)), tegund: 'qa', stada: r.status === 4 ? 'done' : r.status === 5 ? 'completed' : r.status === 6 ? 'rejected' : r.status === 7 ? 'not_approved' : 'created',
        lysing: r.description || null, framkvaemt_fra: dmy(r.executionFrom), framkvaemt_til: dmy(r.executionTo),
        lokid_at: r.status === 4 && r.senderStatusUpdated && !r.senderStatusUpdated.startsWith('0001') ? r.senderStatusUpdated : null,
        abyrgd_id: brunaholf, ajour_registration_id: r.id, ajour_serial: Number(r.serialNumber), eytt: OFAN_FRA.has(Number(r.serialNumber)) || (!c && faldarAnT.has(r.id)), created_at: r.created || new Date().toISOString(),
        ajour_gogn: { ...g, upd: r.updated || null, myndir: (r.photos || []).map((x) => x.fileId), teikning: r.blueprintName || null } }; });
    n += (await upsert('skr_skraningar', radir, 'ajour_registration_id')).length;
    process.stdout.write(`\r  ${n}/${skr.length} skráningar`);
  }
  console.log('\nBúið. verk_id =', verk.id);
})().catch((e) => { console.error('\nVILLA:', e.message); process.exit(1); });
