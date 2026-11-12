#!/usr/bin/env node
// Ljósmyndir skráninga úr Ajour í geymslu Kjarna (12.11.2026, Agnar: „mátt sækja myndirnar líka“) — svo myndirnar birtist þegar
// smellt er á punkt í stöðuskýrslunni. Ajour er AÐEINS LESIÐ (GET á prentstærð myndar, ~100 kB, 1122×1496).
//
//   node tools/skraning-myndir-ajour.cjs                    → DRY: telur hvað vantar, sækir ekkert
//   node tools/skraning-myndir-ajour.cjs --write            → sækir og skráir (endurkeyranlegt: sleppir því sem er komið)
//   … --limit 200   aðeins N myndir · --verk 4   annað verk · --samhlida 4   fjöldi samtímis
//
// Hver mynd: Ajour /api/construction/registration/file/scaled/print?id=<fileId> → fatan „skraning“ (OPIN fata):
//   verk/<verk>/myndir/<fileId>.jpg → röð í skr_myndir {skraning_id, path, ajour_file_id, rod, stig:'annad', breidd, haed}.
// Auðkennin koma úr skr_skraningar.ajour_gogn.myndir. stig er 'annad': Ajour segir ekki hvort myndin er fyrir eða eftir þéttingu.
// Lotan (luna-bridge/ajour-state.json) rennur út — þá stöðvast tólið með skilaboðum; `node ajour-fetch.js --login` og keyra aftur.
// Skrifar ALDREI í Ajour, ajour_registrations eða skr_skraningar.
const fs = require('node:fs');
const ARGS = process.argv.slice(2), flag = (f) => ARGS.includes(f), opt = (f) => { const i = ARGS.indexOf(f); return i >= 0 ? ARGS[i + 1] : null; };
const WRITE = flag('--write'), LIMIT = Number(opt('--limit')) || Infinity, VERK = Number(opt('--verk')) || 4, SAMHLIDA = Number(opt('--samhlida')) || 4;
const ENVF = process.env.LUNA_ENV || 'C:/Users/Slokkvitaeki/luna-bridge/.env', STATE = process.env.AJOUR_STATE || 'C:/Users/Slokkvitaeki/luna-bridge/ajour-state.json';
const env = {}; try { for (const l of fs.readFileSync(ENVF, 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, ''); } } catch {}
const URL_ = process.env.SUPABASE_URL || env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) { console.error('Vantar SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (luna-bridge/.env)'); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const BASE = 'https://brunaholf.ajoursystem.net';
function cookie() {
  if (!fs.existsSync(STATE)) throw new Error('Engin vistuð Ajour-lota (luna-bridge: node ajour-fetch.js --login)');
  const st = JSON.parse(fs.readFileSync(STATE, 'utf8')), now = Date.now() / 1000;
  return (st.cookies || []).filter((c) => /ajoursystem/i.test(c.domain || '')).filter((c) => !(c.expires > 0 && c.expires < now)).map((c) => `${c.name}=${c.value}`).join('; ');
}
async function allt(slod) { const ut = []; for (let i = 0; ; i += 1000) { const r = await fetch(`${URL_}/rest/v1/${slod}`, { headers: { ...H, Range: `${i}-${i + 999}`, 'Range-Unit': 'items' } }); if (!r.ok) throw new Error(`${slod} → ${r.status} ${(await r.text()).slice(0, 200)}`); const j = await r.json(); ut.push(...j); if (j.length < 1000) break; } return ut; }
function jpegDims(b) { for (let i = 2; i < b.length - 9;) { if (b[i] !== 0xff) return {}; const m = b[i + 1], l = b.readUInt16BE(i + 2); if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) }; i += 2 + l; } return {}; }

(async () => {
  const skr = await allt(`skr_skraningar?select=id,myndir:ajour_gogn->myndir&verk_id=eq.${VERK}&eytt=eq.false&order=id`);
  const til = new Set((await allt(`skr_myndir?select=ajour_file_id&ajour_file_id=not.is.null&order=id`)).map((m) => m.ajour_file_id));
  const verk = []; const sed = new Set();
  for (const s of skr) (Array.isArray(s.myndir) ? s.myndir : []).forEach((fileId, rod) => { if (fileId && !til.has(fileId) && !sed.has(fileId)) { sed.add(fileId); verk.push({ skraning_id: s.id, fileId, rod }); } });
  const allar = skr.reduce((a, s) => a + (Array.isArray(s.myndir) ? s.myndir.length : 0), 0);
  console.log(`verk ${VERK}: ${skr.length} skráningar, ${allar} myndir í Ajour, ${til.size} þegar í skr_myndir, ${verk.length} vantar${Number.isFinite(LIMIT) ? ` (tek ${Math.min(LIMIT, verk.length)})` : ''}`);
  if (!WRITE) { console.log('DRY — ekkert sótt. Bættu við --write.'); return; }
  const COOKIE = cookie(), biid = verk.slice(0, LIMIT); let i = 0, ok = 0, villur = 0, baeti = 0, stopp = null; const radir = [], t0 = Date.now();
  const skra = async () => { if (!radir.length) return; const b = radir.splice(0, radir.length); const r = await fetch(`${URL_}/rest/v1/skr_myndir?on_conflict=ajour_file_id`, { method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(b) }); if (!r.ok) throw new Error(`skr_myndir → ${r.status} ${(await r.text()).slice(0, 200)}`); };
  const einn = async () => {
    for (;;) {
      if (stopp) return; const v = biid[i++]; if (!v) return;
      try {
        const r = await fetch(`${BASE}/api/construction/registration/file/scaled/print?id=${v.fileId}`, { redirect: 'manual', headers: { Cookie: COOKIE } });
        if (r.status === 401 || r.status === 403 || (r.status >= 300 && r.status < 400)) { stopp = 'Ajour-lotan er útrunnin (luna-bridge: node ajour-fetch.js --login) — keyrðu svo aftur; það sem komið er helst.'; return; }
        const buf = Buffer.from(await r.arrayBuffer());
        if (!r.ok || !/image\/jpeg/i.test(r.headers.get('content-type') || '') || buf[0] !== 0xff || buf[1] !== 0xd8) { villur++; if (villur <= 5) console.log(`\n  ! ${v.fileId}: staða ${r.status}, ${r.headers.get('content-type')}`); continue; }
        const sp = `verk/${VERK}/myndir/${v.fileId}.jpg`;
        const u = await fetch(`${URL_}/storage/v1/object/skraning/${sp}`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'image/jpeg', 'x-upsert': 'true', 'cache-control': 'max-age=31536000' }, body: buf });
        if (!u.ok) { villur++; if (villur <= 5) console.log(`\n  ! upphleðsla ${v.fileId}: ${u.status} ${(await u.text()).slice(0, 120)}`); continue; }
        const d = jpegDims(buf); radir.push({ skraning_id: v.skraning_id, path: sp, ajour_file_id: v.fileId, rod: v.rod, stig: 'annad', breidd: d.w || null, haed: d.h || null }); ok++; baeti += buf.length;
        if (radir.length >= 100) await skra();
        if (ok % 250 === 0) { const s = (Date.now() - t0) / 1000; console.log(`  ${ok}/${biid.length} · ${Math.round(baeti / 1048576)} MB · ${(ok / s).toFixed(1)} á sek · um ${Math.round((biid.length - ok) / (ok / s) / 60)} mín eftir · villur ${villur}`); }
      } catch (e) { villur++; if (villur <= 5) console.log(`\n  ! ${v.fileId}: ${e.message}`); if (villur > 200) { stopp = 'Of margar villur — stöðvað.'; return; } }
    }
  };
  await Promise.all(Array.from({ length: SAMHLIDA }, einn)); await skra();
  console.log(`${stopp ? 'STÖÐVAÐ: ' + stopp + '\n' : ''}Lokið: ${ok} myndir sóttar og skráðar (${Math.round(baeti / 1048576)} MB), ${villur} villur, ${Math.round((Date.now() - t0) / 60000)} mín.`);
  if (stopp) process.exit(2);
})().catch((e) => { console.error('VILLA', e.message); process.exit(1); });
