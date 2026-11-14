#!/usr/bin/env node
// Gatakort NLSH — VIÐBÓTARVERK Á 4. HÆÐ (12.11.2026, Agnar: „Jú inn“): stútar af 5. hæð niður í inntaksrými 4. hæðar.
// Setur staðina 35 úr skjalinu „Lagnir 4. hæð – Stútar af 5. hæð niður í inntaksrými 4. hæðar“ inn sem ÁÆTLUÐ GÖT (skr_aaetlud, fag 'golf')
// á yfirlitsblað 4H (5H-blaðið) og parar hvern við skráningu á 4. hæð (einn á móti einum). Skráningum er EKKI breytt.
// Paraður stútur (parad.stada = 'fullt') er þegar til í Ajour og telst því EKKI aftur; ópöruðu stútarnir eru „eftir“ og bætast við Áætlað
// á gólfi 5. hæðar í skýrslunni. Endurkeyranlegt: raðir þekkjast á uppruna (vidbot:stutar-4h:<nr>), pörun og athugasemd uppfærast.
//
// PÖRUN Í FIMM UMFERÐUM (12.11.2026, Agnar: „mátt reyna matcha meira, þá getur maður séð hvar maður hefur gleymt að gera“):
//   Þrjár heimildir: (a) fjarlægð frá stút að pinna skráningar, (b) nóvemberlotan (skráningar stofnaðar frá 01.11.2026 — þá voru stútarnir
//   skráðir; pinnar þeirra liggja 0,1–1,2 m frá stútnum) og (c) ÚTTEKTIN í skjalinu sjálfu (merkingar frá 11.11.2026: „Brunaþétting: Komið“ /
//   „Eftir“, „Stútur: Í lagi / Ekki í lagi / Ekki til staðar“ …), sem stendur per stút í JSON-skránni (th, st, ath).
//   „Stemmir“ = úttekt segir Komið og skráningin er kláruð, EÐA úttekt segir Eftir / stút vanta og skráningin er opin.
//     1. stemmir og innan 0,6 m          2. stemmir, nóvemberlota, innan 1,6 m     3. hvaða skráning sem er innan 0,6 m
//     4. nóvemberlota innan 1,5 m         5. stemmir, nóvemberlota, gagnkvæmt næst, innan 3 m
//   Eldri skráningar (fyrir nóvember) parast aðeins innan 0,6 m: á sömu stofnum eru eldri þéttingar í öðrum rýmum (hvítmáluð loft á myndum).
//   parad.flokkun segir niðurstöðuna:
//     stadfest      úttekt Komið + kláruð skráning          eftir_skrad   úttekt Eftir / stút vantar + opin skráning
//     osamraemi     úttekt og skráning segja sitt hvað     klarad | opid paraður stútur sem úttektin metur ekki
//     eftir_oskrad  úttekt Eftir, engin skráning            thett_oskrad  úttekt Komið, engin skráning fannst
//     stutur_vantar stútur ekki til staðar / innan í vegg   ometid        engin merking í skjalinu, engin skráning
//
//   node tools/skraning-gatakort-vidbot-stutar.cjs            → DRY: sýnir pörun, skrifar ekkert
//   node tools/skraning-gatakort-vidbot-stutar.cjs --write    → setur inn / uppfærir pörun og athugasemd
//   … --skra <json> [{nr, svaedi, x, y, th, st, ath}] í px yfirlitsblaðsins (sjálfgefið skraning-gatakort-vidbot-stutar.json við hlið tólsins)
//   … --nov 2026-11-01   upphaf lotunnar sem má parast lengra frá (umferðir 2, 4 og 5)
const fs = require('node:fs'), path = require('node:path');
const ARGS = process.argv.slice(2), WRITE = ARGS.includes('--write'), opt = (f, d) => { const i = ARGS.indexOf(f); return i >= 0 ? ARGS[i + 1] : d; };
const SKRA = opt('--skra', path.join(__dirname, 'skraning-gatakort-vidbot-stutar.json')), NOV = opt('--nov', '2026-11-01'), PXM = 33.3;
const ENVF = process.env.LUNA_ENV || 'C:/Users/Slokkvitaeki/luna-bridge/.env';
const env = {}; try { for (const l of fs.readFileSync(ENVF, 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, ''); } } catch {}
const URL_ = process.env.SUPABASE_URL || env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) { console.error('Vantar SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (luna-bridge/.env)'); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
async function rest(method, p, body, prefer = 'return=representation') { const r = await fetch(`${URL_}/rest/v1/${p}`, { method, headers: { ...H, Prefer: prefer }, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); if (!r.ok) throw new Error(`${method} ${p.slice(0, 60)} → ${r.status} ${t.slice(0, 300)}`); return t ? JSON.parse(t) : null; }
async function allt(p) { let ut = [], fra = 0; for (;;) { const b = await rest('GET', `${p}&limit=1000&offset=${fra}`); ut = ut.concat(b); if (b.length < 1000) break; fra += 1000; } return ut; }
const TH = { komid: 'brunaþétting komin', eftir: 'brunaþétting eftir' }, ST = { i_lagi: 'stútur í lagi', ekki_i_lagi: 'stútur ekki í lagi', of_stuttur: 'stútur of stuttur', ekki_til: 'stútur ekki til staðar', i_vegg: 'stútur lendir innan í vegg' };
const uttektTexti = (p) => { const b = [p.th && TH[p.th], p.st && ST[p.st]].filter(Boolean).join(', '); return b || p.ath ? [b, p.ath].filter(Boolean).join('. ').replace(/^./, (c) => c.toUpperCase()).replace(/\.?$/, '.') : null; };
const komma = (v) => v.toFixed(1).replace('.', ',');
(async () => {
  const pk = JSON.parse(fs.readFileSync(SKRA, 'utf8'));
  const [verk] = await rest('GET', `skr_verk?heiti=eq.${encodeURIComponent('NLSH 5-6. hæð · gatakort')}&select=id`);
  const [yf] = await rest('GET', `skr_teikningar?verk_id=eq.${verk.id}&tegund=eq.yfirlit&haed=eq.4H&eytt=eq.false&select=id,heiti`);
  if (!yf) throw new Error('ekkert yfirlitsblað fyrir 4H');
  const skr = new Map((await allt(`skr_skraningar?verk_id=eq.${verk.id}&eytt=eq.false&select=id,radnr,ajour_serial,stada,created_at&order=id`)).map((s) => [s.id, s]));
  const hn = (await allt(`skr_haedarhnit?verk_id=eq.${verk.id}&haed=eq.4H&select=skraning_id,x_px,y_px`)).filter((h) => h.x_px != null && skr.has(h.skraning_id)).map((h) => ({ x: +h.x_px, y: +h.y_px, s: skr.get(h.skraning_id) }));
  const til = new Map((await rest('GET', `skr_aaetlud?verk_id=eq.${verk.id}&uppruni=like.vidbot:stutar-4h:*&select=id,uppruni,eytt`)).map((a) => [a.uppruni, a]));
  const D = pk.map((p) => hn.map((h) => Math.hypot(h.x - p.x, h.y - p.y) / PXM));   // fjarlægð í metrum
  const nov = (h) => (h.s.created_at || '') >= NOV, done = (h) => h.s.stada === 'done';
  /** true = stemmir við úttekt, false = stangast á, null = úttektin segir ekkert um þéttinguna */
  const stemmir = (p, h) => (p.th === 'komid' ? done(h) : p.th === 'eftir' || p.st === 'ekki_til' || p.st === 'i_vegg' ? !done(h) : null);
  const par = new Map(), notad = new Set();
  const umferd = (nr, skilyrdi) => { const l = []; pk.forEach((p, i) => { if (!par.has(i)) hn.forEach((h, j) => { if (!notad.has(j) && skilyrdi(p, h, D[i][j], i, j)) l.push([D[i][j], i, j]); }); }); l.sort((a, b) => a[0] - b[0]); for (const [d, i, j] of l) { if (par.has(i) || notad.has(j)) continue; par.set(i, { d, j, u: nr }); notad.add(j); } };
  umferd(1, (p, h, d) => d <= 0.6 && stemmir(p, h) === true);
  umferd(2, (p, h, d) => d <= 1.6 && nov(h) && stemmir(p, h) === true);
  umferd(3, (p, h, d) => d <= 0.6);
  umferd(4, (p, h, d) => d <= 1.5 && nov(h));
  { // 5: gagnkvæmt næst (stútur ↔ ónotuð nóvemberskráning), innan 3 m, og stemmir við úttekt
    const opnirSt = pk.map((_, i) => i).filter((i) => !par.has(i)), lausar = hn.map((_, j) => j).filter((j) => !notad.has(j) && nov(hn[j]));
    for (const i of opnirSt) { let bj = -1; for (const j of lausar) if (!notad.has(j) && (bj < 0 || D[i][j] < D[i][bj])) bj = j; if (bj < 0 || D[i][bj] > 3 || stemmir(pk[i], hn[bj]) !== true) continue;
      let bi = -1; for (const k of opnirSt) if (!par.has(k) && (bi < 0 || D[k][bj] < D[bi][bj])) bi = k; if (bi === i) { par.set(i, { d: D[i][bj], j: bj, u: 5 }); notad.add(bj); } }
  }
  const reiknad = new Date().toISOString().slice(0, 16), radir = pk.map((p, i) => {
    const q = par.get(i), h = q ? hn[q.j] : null, st = h ? stemmir(p, h) : null, ut = uttektTexti(p);
    const flokkun = h ? (st === true ? (p.th === 'komid' ? 'stadfest' : 'eftir_skrad') : st === false ? 'osamraemi' : done(h) ? 'klarad' : 'opid')
      : p.th === 'eftir' ? 'eftir_oskrad' : p.th === 'komid' ? 'thett_oskrad' : p.st === 'ekki_til' || p.st === 'i_vegg' ? 'stutur_vantar' : 'ometid';
    let naest = null; if (!h) { let bj = -1; hn.forEach((_, j) => { if (!notad.has(j) && (bj < 0 || D[i][j] < D[i][bj])) bj = j; }); if (bj >= 0 && D[i][bj] <= 3.5) naest = { nr: hn[bj].s.ajour_serial, d_m: +D[i][bj].toFixed(2), stada: done(hn[bj]) ? 'done' : 'opid' }; }
    const skrTexti = h ? `Skráning nr. ${h.s.ajour_serial} (${done(h) ? 'kláruð' : 'opin'}, ${komma(q.d)} m frá)${flokkun === 'osamraemi' ? ' — stangast á við úttektina' : ''}` : `Engin skráning innan 1,5 m${naest ? ` (næsta ónotaða: nr. ${naest.nr}, ${naest.stada === 'done' ? 'kláruð' : 'opin'}, ${komma(naest.d_m)} m frá)` : ''}`;
    return { uppruni: `vidbot:stutar-4h:${p.nr}`, verk_id: verk.id, teikning_id: yf.id, x_px: p.x, y_px: p.y, fag: 'golf', flokkur_id: null, fjoldi: 1,
      athugasemd: `Viðbótarverk 12.11.2026: stútur af 5. hæð niður í inntaksrými 4. hæðar · svæði ${p.svaedi} · nr. ${p.nr} á teikningu · Úttekt 11.11.2026: ${ut || 'stúturinn er ekki merktur í skjalinu.'} · ${skrTexti}`,
      parad: { ids: h ? [h.s.id] : [], radnr: h ? [h.s.radnr] : [], n: h ? 1 : 0, stada: h ? 'fullt' : 'vantar', reiknad, stutur: p.nr, svaedi: p.svaedi, umferd: q ? q.u : null, d_m: q ? +q.d.toFixed(2) : null,
        skr: h ? { nr: h.s.ajour_serial, stada: done(h) ? 'done' : 'opid' } : null, uttekt: { th: p.th || null, st: p.st || null, texti: ut }, flokkun, naest }, _p: p };
  });
  console.log(`${yf.heiti} (teikning ${yf.id}) · ${pk.length} stútar · ${hn.length} skráningar á 4H · nóvemberlota frá ${NOV}`);
  for (const r of radir) { const a = r.parad; console.log(`  ${String(a.stutur).padStart(2)} ${a.svaedi.padEnd(6)} ${a.flokkun.padEnd(13)} ${a.skr ? `nr. ${a.skr.nr} ${a.skr.stada === 'done' ? 'kláruð' : 'opin  '} ${a.d_m.toFixed(2)} m (umf. ${a.umferd})` : `engin${a.naest ? ` (næst nr. ${a.naest.nr}, ${a.naest.d_m} m)` : ''}`} · úttekt: ${a.uttekt.texti || '—'}`); }
  const deild = (x) => (x / 5790 < 0.179 ? 'S1' : x / 5790 < 0.5 ? 'S2' : x / 5790 < 0.812 ? 'S4' : 'S5'), t = {}, fl = {};
  for (const r of radir) { const d = deild(r._p.x), v = t[d] || (t[d] = { alls: 0, parad: 0, eftir: 0 }); v.alls++; if (r.parad.n) v.parad++; else v.eftir++; fl[r.parad.flokkun] = (fl[r.parad.flokkun] || 0) + 1; }
  console.log('deild:', Object.entries(t).map(([d, v]) => `${d} ${v.alls} (pöruð ${v.parad}, eftir ${v.eftir})`).join(' · '), '· eftir alls', radir.filter((r) => !r.parad.n).length, '· þegar í gagnagrunni', til.size);
  console.log('flokkun:', Object.entries(fl).map(([k, n]) => `${k} ${n}`).join(' · '));
  if (!WRITE) { console.log('DRY — ekkert skrifað. Bættu við --write.'); return; }
  let nytt = 0, uppf = 0;
  for (const r of radir) {
    const { _p, ...rod } = r, e = til.get(rod.uppruni);
    if (e) { await rest('PATCH', `skr_aaetlud?id=eq.${e.id}`, { parad: rod.parad, athugasemd: rod.athugasemd }, 'return=minimal'); uppf++; }
    else { await rest('POST', 'skr_aaetlud', rod, 'return=minimal'); nytt++; }
  }
  console.log(`BÚIÐ — ${nytt} nýjar raðir, ${uppf} uppfærðar (pörun og athugasemd)`);
})().catch((e) => { console.error('VILLA', e.message); process.exit(1); });
