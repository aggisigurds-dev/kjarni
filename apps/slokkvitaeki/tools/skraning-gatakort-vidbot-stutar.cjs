#!/usr/bin/env node
// Gatakort NLSH — VIÐBÓTARVERK Á 4. HÆÐ (12.11.2026, Agnar: „Jú inn“): stútar af 5. hæð niður í inntaksrými 4. hæðar.
// Setur staðina 35 úr skjalinu „Lagnir 4. hæð – Stútar af 5. hæð niður í inntaksrými 4. hæðar“ inn sem ÁÆTLUÐ GÖT (skr_aaetlud, fag 'golf')
// á yfirlitsblað 4H (5H-blaðið) og parar hvern við skráningu á 4. hæð sem er innan radíuss (einn á móti einum, næsti fyrst).
// Paraður stútur (parad.stada = 'fullt') er þegar til í Ajour og telst því EKKI aftur; ópöruðu stútarnir eru „eftir“ og bætast við Áætlað
// á gólfi 5. hæðar í skýrslunni. Skráningum er EKKI breytt. Endurkeyranlegt: raðir þekkjast á uppruna (vidbot:stutar-4h:<nr>), pörun uppfærist.
//
//   node tools/skraning-gatakort-vidbot-stutar.cjs            → DRY: sýnir pörun, skrifar ekkert
//   node tools/skraning-gatakort-vidbot-stutar.cjs --write    → setur inn / uppfærir pörun
//   … --radius 20   radíus í px grunnmyndar (sjálfgefið 20 ≈ 0,6 m; þröngt, því milliloftaþéttingar liggja þétt)
//   … --skra <json> [{nr, svaedi, x, y}] í px yfirlitsblaðsins (sjálfgefið skraning-gatakort-vidbot-stutar.json við hlið tólsins)
const fs = require('node:fs'), path = require('node:path');
const ARGS = process.argv.slice(2), WRITE = ARGS.includes('--write'), opt = (f, d) => { const i = ARGS.indexOf(f); return i >= 0 ? ARGS[i + 1] : d; };
const RAD = +opt('--radius', 20), SKRA = opt('--skra', path.join(__dirname, 'skraning-gatakort-vidbot-stutar.json'));
const ENVF = process.env.LUNA_ENV || 'C:/Users/Slokkvitaeki/luna-bridge/.env';
const env = {}; try { for (const l of fs.readFileSync(ENVF, 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, ''); } } catch {}
const URL_ = process.env.SUPABASE_URL || env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) { console.error('Vantar SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (luna-bridge/.env)'); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
async function rest(method, p, body, prefer = 'return=representation') { const r = await fetch(`${URL_}/rest/v1/${p}`, { method, headers: { ...H, Prefer: prefer }, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); if (!r.ok) throw new Error(`${method} ${p.slice(0, 60)} → ${r.status} ${t.slice(0, 300)}`); return t ? JSON.parse(t) : null; }
async function allt(p) { let ut = [], fra = 0; for (;;) { const b = await rest('GET', `${p}&limit=1000&offset=${fra}`); ut = ut.concat(b); if (b.length < 1000) break; fra += 1000; } return ut; }
(async () => {
  const pk = JSON.parse(fs.readFileSync(SKRA, 'utf8'));
  const [verk] = await rest('GET', `skr_verk?heiti=eq.${encodeURIComponent('NLSH 5-6. hæð · gatakort')}&select=id`);
  const [yf] = await rest('GET', `skr_teikningar?verk_id=eq.${verk.id}&tegund=eq.yfirlit&haed=eq.4H&eytt=eq.false&select=id,heiti`);
  if (!yf) throw new Error('ekkert yfirlitsblað fyrir 4H');
  const hn = (await allt(`skr_haedarhnit?verk_id=eq.${verk.id}&haed=eq.4H&select=skraning_id,x_px,y_px`)).filter((h) => h.x_px != null);
  const skr = new Map((await allt(`skr_skraningar?verk_id=eq.${verk.id}&eytt=eq.false&select=id,radnr,ajour_serial,stada&order=id`)).map((s) => [s.id, s]));
  const til = new Map((await rest('GET', `skr_aaetlud?verk_id=eq.${verk.id}&uppruni=like.vidbot:stutar-4h:*&select=id,uppruni,eytt`)).map((a) => [a.uppruni, a]));
  const por = []; pk.forEach((p, i) => hn.forEach((h, j) => { const d = Math.hypot(+h.x_px - p.x, +h.y_px - p.y); if (d <= RAD && skr.has(h.skraning_id)) por.push([d, i, j]); }));
  por.sort((a, b) => a[0] - b[0]); const notad = new Set(), par = new Map();
  for (const [d, i, j] of por) { if (par.has(i) || notad.has(j)) continue; par.set(i, { d, s: skr.get(hn[j].skraning_id) }); notad.add(j); }
  const reiknad = new Date().toISOString().slice(0, 16), radir = pk.map((p, i) => {
    const q = par.get(i);
    return { uppruni: `vidbot:stutar-4h:${p.nr}`, verk_id: verk.id, teikning_id: yf.id, x_px: p.x, y_px: p.y, fag: 'golf', flokkur_id: null, fjoldi: 1,
      athugasemd: `Viðbótarverk 12.11.2026: stútur af 5. hæð niður í inntaksrými 4. hæðar · svæði ${p.svaedi} · nr. ${p.nr} á teikningu`,
      parad: { ids: q ? [q.s.id] : [], radnr: q ? [q.s.radnr] : [], n: q ? 1 : 0, stada: q ? 'fullt' : 'vantar', radius_px: RAD, reiknad }, _q: q, _p: p };
  });
  console.log(`${yf.heiti} (teikning ${yf.id}) · ${pk.length} stútar · ${hn.length} skráningar á 4H · radíus ${RAD} px (${(RAD / 33.3).toFixed(1)} m)`);
  for (const r of radir) console.log(`  ${String(r._p.nr).padStart(2)} ${r._p.svaedi.padEnd(6)} ${r._q ? `paraður við nr. ${r._q.s.ajour_serial} (${r._q.s.stada === 'done' ? 'klárað' : 'opið'}, ${(r._q.d / 33.3).toFixed(2)} m)` : 'eftir'}`);
  const deild = (x) => (x / 5790 < 0.179 ? 'S1' : x / 5790 < 0.5 ? 'S2' : x / 5790 < 0.812 ? 'S4' : 'S5'), t = {};
  for (const r of radir) { const d = deild(r._p.x), v = t[d] || (t[d] = { alls: 0, parad: 0, eftir: 0 }); v.alls++; if (r._q) v.parad++; else v.eftir++; }
  console.log('deild:', Object.entries(t).map(([d, v]) => `${d} ${v.alls} (pöruð ${v.parad}, eftir ${v.eftir})`).join(' · '), '· eftir alls', radir.filter((r) => !r._q).length, '· þegar í gagnagrunni', til.size);
  if (!WRITE) { console.log('DRY — ekkert skrifað. Bættu við --write.'); return; }
  let nytt = 0, uppf = 0;
  for (const r of radir) {
    const { _q, _p, ...rod } = r, e = til.get(rod.uppruni);
    if (e) { await rest('PATCH', `skr_aaetlud?id=eq.${e.id}`, { parad: rod.parad }, 'return=minimal'); uppf++; }
    else { await rest('POST', 'skr_aaetlud', rod, 'return=minimal'); nytt++; }
  }
  console.log(`BÚIÐ — ${nytt} nýjar raðir, ${uppf} uppfærðar (pörun)`);
})().catch((e) => { console.error('VILLA', e.message); process.exit(1); });
