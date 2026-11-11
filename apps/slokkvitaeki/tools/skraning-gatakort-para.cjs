#!/usr/bin/env node
// Gatakort NLSH — parar ÁÆTLUÐ GÖT (skr_aaetlud) við SKRÁNINGAR (skr_skraningar) eftir staðsetningu og flokki (11.11.2026).
//
// Hvert áætlað gat á að fá `fjoldi` skráningar (stök verk). Pörunin er græðgisleg eftir fjarlægð, ein skráning parast
// aðeins við eitt gat, í tveimur umferðum:
//   1) sami flokkur (t.d. Loft Ø200-315) innan radíuss
//   2) sami flokkahópur (loft | rör | rafmagn) innan radíuss — stærðaflokkun er ekki alltaf eins í Miro og Ajour
// Niðurstaðan fer í skr_aaetlud.parad = {ids, radnr, n, stada: fullt|hluti|vantar, radius_px, reiknad}. Skráningum er EKKI breytt.
// Aðeins skráningar á blöðum sem varpast á yfirlitsblaðið (skr_teikningar.yfirlit_id + vorpun) koma til greina.
//
//   node tools/skraning-gatakort-para.cjs --haed 6H            → DRY: telur, skrifar ekkert
//   node tools/skraning-gatakort-para.cjs --haed 6H --write    → skrifar parad á öll áætluð göt hæðarinnar
//   … --radius 60   radíus í px grunnmyndar (sjálfgefið 60 ≈ 1,8 m; skráningar eru oft settar ónákvæmt í síma)
const fs = require('node:fs');
const ARGS = process.argv.slice(2), WRITE = ARGS.includes('--write'), opt = (f, d) => { const i = ARGS.indexOf(f); return i >= 0 ? ARGS[i + 1] : d; };
const HAED = opt('--haed'), RAD = +opt('--radius', 60);
const ENVF = process.env.LUNA_ENV || 'C:/Users/Slokkvitaeki/luna-bridge/.env';
const env = {}; try { for (const l of fs.readFileSync(ENVF, 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, ''); } } catch {}
const URL_ = process.env.SUPABASE_URL || env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!HAED || !URL_ || !KEY) { console.error('Notkun: skraning-gatakort-para.cjs --haed 6H [--radius 60] [--write]'); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
async function rest(method, p, body, prefer = 'return=representation') { const r = await fetch(`${URL_}/rest/v1/${p}`, { method, headers: { ...H, Prefer: prefer }, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); if (!r.ok) throw new Error(`${method} ${p.slice(0, 60)} → ${r.status} ${t.slice(0, 300)}`); return t ? JSON.parse(t) : null; }
async function allt(p) { let ut = [], fra = 0; for (;;) { const b = await rest('GET', `${p}&limit=1000&offset=${fra}`); ut = ut.concat(b); if (b.length < 1000) break; fra += 1000; } return ut; }
const hopur = (heiti) => (/^(Loft|Raufar)/i.test(heiti) ? 'loft' : /^Raf/i.test(heiti) ? 'rafmagn' : /^(Stál|Plast)/i.test(heiti) ? 'ror' : null);
const FAG_HOPUR = { loftraesting: 'loft', rafmagn: 'rafmagn', sprinkler: 'ror', vatn: 'ror', hiti: 'ror', fravatn: 'ror', gas: 'ror' };
(async () => {
  const [verk] = await rest('GET', `skr_verk?heiti=eq.${encodeURIComponent('NLSH 5-6. hæð · gatakort')}&select=id`);
  const teikn = await rest('GET', `skr_teikningar?verk_id=eq.${verk.id}&eytt=eq.false&select=id,heiti,tegund,yfirlit_id,vorpun,deildir`);
  const yf = teikn.find((t) => t.tegund === 'yfirlit' && new RegExp(`Brunayfirlit ${HAED}\\b`).test(t.heiti));
  if (!yf) throw new Error('ekkert yfirlitsblað fyrir ' + HAED);
  const born = new Map(teikn.filter((t) => t.yfirlit_id === yf.id && t.vorpun).map((t) => [t.id, t.vorpun]));
  const flokkar = new Map((await rest('GET', `skr_flokkar?or=(verk_id.eq.${verk.id},verk_id.is.null)&select=id,heiti`)).map((f) => [f.id, f.heiti]));
  const aa = await allt(`skr_aaetlud?verk_id=eq.${verk.id}&teikning_id=eq.${yf.id}&eytt=eq.false&select=id,x_px,y_px,fag,fjoldi,flokkur_id&order=id`);
  // færðir punktar (skr_faerslur): leiðrétt staða á yfirlitsblaðinu ræður í pöruninni
  const faerslur = new Map((await allt(`skr_faerslur?verk_id=eq.${verk.id}&teikning_id=eq.${yf.id}&eytt=eq.false&select=skraning_id,x_px,y_px&order=id`)).map((f) => [f.skraning_id, f]));
  const skr = (await allt(`skr_skraningar?verk_id=eq.${verk.id}&eytt=eq.false&teikning_id=in.(${[...born.keys()].join(',')})&select=id,radnr,teikning_id,x_px,y_px,flokkur_id,framkvaemt_til,deild:ajour_gogn->>deild&order=id`))
    .filter((s) => s.x_px != null && s.y_px != null)
    .map((s) => { const v = born.get(s.teikning_id), f = faerslur.get(s.id); const h = (v.hlutar || []).reduce((m, q) => (s.x_px >= q.fra_x ? q : m), v); return { ...s, X: f ? +f.x_px : h.a * s.x_px + h.e, Y: f ? +f.y_px : (h.d ?? h.a) * s.y_px + h.f, hopur: hopur(flokkar.get(s.flokkur_id) || '') }; })
    .filter((s) => s.hopur);
  const merki = aa.map((a) => ({ ...a, x: +a.x_px, y: +a.y_px, hopur: (a.flokkur_id && hopur(flokkar.get(a.flokkur_id) || '')) || FAG_HOPUR[a.fag] || null, par: [] }));
  // rist til að finna nágranna hratt
  const R = RAD, rist = new Map(), lykill = (x, y) => `${Math.floor(x / R)}:${Math.floor(y / R)}`;
  skr.forEach((s, j) => { const k = lykill(s.X, s.Y); if (!rist.has(k)) rist.set(k, []); rist.get(k).push(j); });
  const nagr = (m) => { const ut = [], cx = Math.floor(m.x / R), cy = Math.floor(m.y / R); for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const j of rist.get(`${cx + dx}:${cy + dy}`) || []) { const d = Math.hypot(skr[j].X - m.x, skr[j].Y - m.y); if (d <= R) ut.push([d, j]); } return ut; };
  const notad = new Set();
  for (const umferd of [1, 2]) {
    const por = [];
    merki.forEach((m, i) => { if (!m.hopur || m.par.length >= m.fjoldi) return; for (const [d, j] of nagr(m)) { if (notad.has(j)) continue; const s = skr[j]; if (umferd === 1 ? (m.flokkur_id && s.flokkur_id === m.flokkur_id) : s.hopur === m.hopur) por.push([d, i, j]); } });
    por.sort((a, b) => a[0] - b[0]);
    for (const [d, i, j] of por) { const m = merki[i]; if (notad.has(j) || m.par.length >= m.fjoldi) continue; m.par.push({ j, d, umferd }); notad.add(j); }
  }
  // samantekt per deild og hóp
  const deildMerkis = (m) => { const n = nagr({ ...m, x: m.x, y: m.y }); let b = null, bd = 1e9; for (const s of skr) { const d = Math.hypot(s.X - m.x, s.Y - m.y); if (d < bd && s.deild) { bd = d; b = s.deild; } } return b || '?'; };
  const t = {};
  for (const m of merki) {
    m.deild = deildMerkis(m); m.stada = m.par.length >= m.fjoldi ? 'fullt' : m.par.length ? 'hluti' : 'vantar';
    const k = `${m.deild} ${m.hopur || '(enginn hópur)'}`; t[k] = t[k] || { merki: 0, aaetlad: 0, parad: 0, fullt: 0, hluti: 0, vantar: 0, skraningar: 0, umfram: 0 };
    t[k].merki++; t[k].aaetlad += m.fjoldi; t[k].parad += m.par.length; t[k][m.stada]++;
  }
  skr.forEach((s, j) => { const k = `${s.deild || '?'} ${s.hopur}`; if (!t[k]) return; t[k].skraningar++; if (!notad.has(j)) t[k].umfram++; });
  console.log(`${HAED}: ${merki.length} áætluð göt · ${skr.length} skráningar á vörpuðum blöðum (loft/rör/rafmagn) · radíus ${R} px`);
  console.log('deild hópur      | merki | áætluð stök | pöruð | fullt | hluti | vantar | skráningar | ópöruð');
  for (const k of Object.keys(t).sort()) { const v = t[k]; console.log(`${k.padEnd(16)} | ${String(v.merki).padStart(5)} | ${String(v.aaetlad).padStart(11)} | ${String(v.parad).padStart(5)} | ${String(v.fullt).padStart(5)} | ${String(v.hluti).padStart(5)} | ${String(v.vantar).padStart(6)} | ${String(v.skraningar).padStart(10)} | ${String(v.umfram).padStart(6)}`); }
  const u1 = merki.reduce((a, m) => a + m.par.filter((p) => p.umferd === 1).length, 0), u2 = merki.reduce((a, m) => a + m.par.filter((p) => p.umferd === 2).length, 0);
  console.log(`pöruð í 1. umferð (sami flokkur): ${u1} · í 2. umferð (sami hópur): ${u2}`);
  if (!WRITE) { console.log('DRY — ekkert skrifað'); return; }
  const reiknad = new Date().toISOString().slice(0, 16);
  let i = 0; const vinna = async () => { for (;;) { const m = merki[i++]; if (!m) return; await rest('PATCH', `skr_aaetlud?id=eq.${m.id}`, { parad: { ids: m.par.map((p) => skr[p.j].id), radnr: m.par.map((p) => skr[p.j].radnr), n: m.par.length, stada: m.stada, radius_px: R, reiknad } }, 'return=minimal'); } };
  await Promise.all(Array.from({ length: 8 }, vinna));
  console.log('BÚIÐ — parad skrifað á', merki.length, 'áætluð göt');
})().catch((e) => { console.error('VILLA', e.message); process.exit(1); });
