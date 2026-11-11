#!/usr/bin/env node
// Gatakort NLSH — setur merki úr Miro inn sem ÁÆTLUÐ GÖT (skr_aaetlud) og ber þau saman við skráningar (11.11.2026).
//
// Inntak er JSON úr festingarskriftunni (merki með fx/fy = staður á grunnmynd yfirlitsblaðsins í px, bx/by = Miro-staður,
// fest = 'brunaveggur' | 'vegglina' | null, faersla_px). Eitt merki = eitt gegnumtak = `--fjoldi` stök verk (sjálfgefið 2).
// Merki mega bera eigin fag, flokkur_id, fjoldi og heiti (úr flokkunarskriftunni); þau ganga fyrir skipanalínunni.
//
//   node tools/skraning-gatakort-aaetlud.cjs <merki.json> --haed 6H --fag rafmagn --flokkar 34,41,44,45            → DRY
//   node tools/skraning-gatakort-aaetlud.cjs <merki.json> --haed 6H --fag rafmagn --flokkar 34,41,44,45 --write    → skrifar
//
// Endurkeyranlegt: `uppruni` = `miro:<borð>:<id merkis>`; merki sem er til er sleppt. Skráningum er ALDREI breytt.
const fs = require('node:fs');
const ARGS = process.argv.slice(2), WRITE = ARGS.includes('--write'), opt = (f, d) => { const i = ARGS.indexOf(f); return i >= 0 ? ARGS[i + 1] : d; };
const INN = ARGS.find((a) => !a.startsWith('--') && a.endsWith('.json'));
const HAED = opt('--haed'), FAG = opt('--fag'), FJOLDI = +opt('--fjoldi', 2), BORD = opt('--bord', 'uXjVJ1jKBnY='), RAD = +opt('--radius', 60);
const FLOKKAR = (opt('--flokkar', '') || '').split(',').filter(Boolean).map(Number), HEITI = opt('--heiti', 'Merki');
const ENVF = process.env.LUNA_ENV || 'C:/Users/Slokkvitaeki/luna-bridge/.env';
const env = {}; try { for (const l of fs.readFileSync(ENVF, 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, ''); } } catch {}
const URL_ = process.env.SUPABASE_URL || env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!INN || !HAED || !URL_ || !KEY) { console.error('Notkun: skraning-gatakort-aaetlud.cjs <merki.json> --haed 6H --fag rafmagn [--flokkar 1,2] [--fjoldi 2] [--write]'); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
async function rest(method, p, body) { const r = await fetch(`${URL_}/rest/v1/${p}`, { method, headers: { ...H, Prefer: 'return=representation' }, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); if (!r.ok) throw new Error(`${method} ${p.slice(0, 60)} → ${r.status} ${t.slice(0, 300)}`); return t ? JSON.parse(t) : null; }
const PX_M = 3 / (250 * 0.0254 / 72);            // grunnmynd: 3 px/pt, brunayfirlit 1:250 → px per metra (≈ 34)
(async () => {
  const d = JSON.parse(fs.readFileSync(INN, 'utf8'));
  const [verk] = await rest('GET', `skr_verk?heiti=eq.${encodeURIComponent('NLSH 5-6. hæð · gatakort')}&select=id`);
  const teikn = await rest('GET', `skr_teikningar?verk_id=eq.${verk.id}&eytt=eq.false&select=id,heiti,tegund,yfirlit_id,vorpun`);
  const yf = teikn.find((t) => t.tegund === 'yfirlit' && new RegExp(`Brunayfirlit ${HAED}\\b`).test(t.heiti));
  if (!yf) throw new Error('ekkert yfirlitsblað fyrir ' + HAED);
  const til = new Set((await rest('GET', `skr_aaetlud?verk_id=eq.${verk.id}&eytt=eq.false&select=uppruni`)).map((x) => x.uppruni));
  if (d.merki.some((m) => !(m.fag || FAG))) throw new Error('merki án fags og ekkert --fag');
  const rod = d.merki.map((m) => ({
    verk_id: verk.id, teikning_id: yf.id, x_px: m.fx, y_px: m.fy, fag: m.fag || FAG, fjoldi: m.fjoldi || FJOLDI, flokkur_id: m.flokkur_id ?? null, uppruni: `miro:${BORD}:${m.id}`,
    athugasemd: `${m.heiti || HEITI} (Miro „${d.titill}") = ${m.fjoldi || FJOLDI} stök verk. ` + (m.fest ? `Fest við ${m.fest === 'brunaveggur' ? 'skurðpunkt lagnar og brunaveggs' : 'skurðpunkt lagnar og vegglínu (veggur ekki rauður á Rev.A)'}, fært ${(m.faersla_px / PX_M).toFixed(1)} m.` : 'Ófest — stendur á Miro-staðnum.') + ` Miro-staður: ${Math.round(m.bx)},${Math.round(m.by)}.`,
  }));
  const ny = rod.filter((r) => !til.has(r.uppruni));
  console.log(`${d.titill}: ${rod.length} merki · ný ${ny.length} · til fyrir ${rod.length - ny.length} · teikning ${yf.id}`);
  // samanburður við skráningar í völdum flokkum (aðeins skráningar á blöðum sem varpast á þetta yfirlitsblað)
  if (FLOKKAR.length) {
    const born = new Map(teikn.filter((t) => t.yfirlit_id === yf.id && t.vorpun).map((t) => [t.id, t.vorpun]));
    let skr = [], fra = 0;
    for (;;) { const b = await rest('GET', `skr_skraningar?verk_id=eq.${verk.id}&eytt=eq.false&flokkur_id=in.(${FLOKKAR.join(',')})&select=id,radnr,teikning_id,x_px,y_px,flokkur_id,framkvaemt_til&order=id&limit=1000&offset=${fra}`); skr = skr.concat(b); if (b.length < 1000) break; fra += 1000; }
    const a_bladi = skr.filter((s) => born.has(s.teikning_id)).map((s) => { const v = born.get(s.teikning_id); return { ...s, X: v.a * s.x_px + v.e, Y: (v.d ?? v.a) * s.y_px + v.f }; });
    const xs = d.merki.map((m) => m.fx), ys = d.merki.map((m) => m.fy), bil = 150;
    const i_svaedi = a_bladi.filter((s) => s.X > Math.min(...xs) - bil && s.X < Math.max(...xs) + bil && s.Y > Math.min(...ys) - bil && s.Y < Math.max(...ys) + bil);
    const taln = d.merki.map((m) => i_svaedi.filter((s) => Math.hypot(s.X - m.fx, s.Y - m.fy) <= RAD).length);
    const n0 = taln.filter((n) => n === 0).length, n1 = taln.filter((n) => n > 0 && n < FJOLDI).length, n2 = taln.filter((n) => n >= FJOLDI).length;
    const utan = i_svaedi.filter((s) => !d.merki.some((m) => Math.hypot(s.X - m.fx, s.Y - m.fy) <= RAD)).length;
    console.log(`skráningar í flokkum ${FLOKKAR.join(',')}: ${skr.length} alls · ${a_bladi.length} á blöðum sem varpast á ${HAED} · ${i_svaedi.length} á svæði merkjanna · ${skr.length - a_bladi.length} á óvörpuðum blöðum (ekki bornar saman)`);
    console.log(`merki með ≥ ${FJOLDI} skráningar innan ${(RAD / PX_M).toFixed(1)} m: ${n2} · með færri: ${n1} · með enga: ${n0} · skráningar á svæðinu fjær öllum merkjum: ${utan}`);
  }
  if (!WRITE) { console.log('DRY — ekkert skrifað'); return; }
  for (let i = 0; i < ny.length; i += 200) await rest('POST', 'skr_aaetlud', ny.slice(i, i + 200));
  console.log('BÚIÐ — sett inn', ny.length);
})().catch((e) => { console.error('VILLA', e.message); process.exit(1); });
