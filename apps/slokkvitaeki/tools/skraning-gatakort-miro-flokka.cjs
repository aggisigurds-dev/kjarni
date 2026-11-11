// Flokkar vörpuð Miro-merki eftir tegund ramma: bætir við fag, flokkur_id, fjoldi (stök verk) og heiti; sleppir skýringatáknum.
// Notkun: node miro_flokka.cjs <vörpuð.json> <loft|sprinkler|vatn|regn> <út.json>
// Flokkar (skr_flokkar, verk 4): 32 Stál Ø15-35 · 33 Stál Ø40-50 · 35 Plast Ø20-34 · 36 Stál Ø110-160 · 37 Stál Ø75-110 ·
//   39 Loft Ø200-315 · 40 Loft Ø125-160 · 41 Raufar (metrar) · 42 Loft Ø400-630.
// Eitt gegnumtak = 2 stök verk (báðar hliðar veggjar). Vatnsský með tölunni n = n lagnir á sama stað = 2·n stök verk
// (sannreynt á 6H2S: 34 dökkrauð ský, 68 lagnir = 136 = talan í yfirlitstöflu rammans; dökkblá 52 lagnir = 104).
const fs = require('fs');
const [,, inn, teg, ut] = process.argv;
const d = JSON.parse(fs.readFileSync(inn, 'utf8'));
const tala = (s) => { const m = (s || '').match(/\d+/); return m ? +m[0] : null; };
const merki = [];
for (const m of d.merki) {
  if (m.by < -20 || m.by > 2870) continue;                 // utan grunnmyndar = skýringar/tafla neðst í rammanum
  let x = null;
  if (teg === 'loft') {
    if (m.logun === 'cross') {
      const kant = /\d\s*x\s*\d/i.test(m.texti), n = tala(m.texti);
      if (kant) x = { flokkur_id: 41, heiti: `Kantaður stokkur ${m.texti.replace(/\s+/g, '')}` };
      else {
        let f = n && n <= 160 ? 40 : n && n <= 315 ? 39 : n && n <= 630 ? 42 : null;
        if (!f) f = m.stroke === '#659df2' ? 40 : m.stroke === '#6631d7' ? 39 : 42;   // stærð vantar/ólæsileg → eftir lit krossins
        x = { flokkur_id: f, heiti: `Loftstokkur Ø${m.texti || '?'}` };
      }
    } else if (!m.logun && m.teg === 'rect' && /\d\s*x\s*\d/i.test(m.texti)) x = { flokkur_id: 41, heiti: `Kantaður stokkur ${m.texti.replace(/\s+/g, '')}` };
    if (x) x = { ...x, fag: 'loftraesting', fjoldi: 2 };
  } else if (teg === 'sprinkler') {
    if (m.logun === 'star') { const n = tala(m.texti); x = { fag: 'sprinkler', fjoldi: 2, flokkur_id: n == null ? null : n <= 35 ? 32 : n <= 50 ? 33 : 37, heiti: `Sprinklerlögn ${n ?? '?'} mm` }; }
  } else if (teg === 'vatn') {
    if (m.logun === 'cloud') {
      const n = (m.texti.match(/\d+/g) || []).map(Number);
      if (n.length === 1 && n[0] === 110) x = { fag: 'fravatn', flokkur_id: 36, fjoldi: 2, heiti: 'Regnvatnslögn Ø110' };
      else {
        const lagnir = n.reduce((a, b) => a + b, 0) || 1;
        const k = { '#659df2': ['vatn', 32, 'Neysluvatn Ø15-35'], '#bd0a0a': ['hiti', 32, 'Gólfhiti Ø15-35'], '#ff6464': ['hiti', 32, 'Gólfhiti Ø15-35'], '#fe9f4d': ['hiti', 33, 'Ofnakerfi Ø40-50'], '#305bab': ['vatn', 33, 'Neysluvatn Ø40-50'] }[m.stroke] || ['annad', null, 'Vatnslögn (óflokkað)'];
        x = { fag: k[0], flokkur_id: k[1], fjoldi: 2 * lagnir, heiti: `${k[2]} · ${lagnir} lagnir` };
      }
    } else if (m.logun === 'left_right_arrow') { const lagnir = tala(m.texti) || 2; x = { fag: 'vatn', flokkur_id: 35, fjoldi: 2 * lagnir, heiti: `Plaströr Ø20-34 · ${lagnir} lagnir` }; }
  } else if (teg === 'regn') {
    if (m.logun === 'cloud') x = { fag: 'fravatn', flokkur_id: 36, fjoldi: 2, heiti: 'Regnvatnslögn Ø110' };
  }
  if (x) merki.push({ ...m, ...x });
}
fs.writeFileSync(ut, JSON.stringify({ titill: d.titill, merki }));
const t = {}; for (const m of merki) { const k = m.heiti.replace(/ · .*$/, '').replace(/Ø\d+$/, 'Ø…').replace(/\d+x\d+$/, '…').replace(/ \d+ mm$/, ''); t[k + ' → ' + m.flokkur_id] = t[k + ' → ' + m.flokkur_id] || [0, 0]; t[k + ' → ' + m.flokkur_id][0]++; t[k + ' → ' + m.flokkur_id][1] += m.fjoldi; }
console.log(d.titill, '→', merki.length, 'merki [fjöldi, stök verk]:', JSON.stringify(t));
