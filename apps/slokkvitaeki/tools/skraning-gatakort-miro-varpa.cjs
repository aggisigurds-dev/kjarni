// Varpar Miro-merkjum (borðhnit) á grunnmynd gatakortsins (px). 6H2S-rammar eru fjórar flísar (skjámyndir úr QA) hver;
// hver flís er skráð á grunnmyndina með miro_skra.py (rammi „6H2S Vatnslagnakerfi með Yfirliti", skjámynd 648×2000).
// base_px = S·(P − flísamiðja rammans) + grunnmiðja flísar;  S = s · (skjá-px per borðeiningu).
// Notkun: node miro_varpa.cjs <merki.json úr miro_ur_lotu.cjs> <skra.json úr miro_skra.py> <út.json>
const fs = require('fs');
const [,, inn, skraF, ut] = process.argv;
const d = JSON.parse(fs.readFileSync(inn, 'utf8')), skra = JSON.parse(fs.readFileSync(skraF, 'utf8'));
const KSHOT = 648 / 3421;                                   // skjá-px per borðeiningu í skráningarrammanum
const S = skra.s * KSHOT;
const flisar = d.form.filter((f) => f.teg === 'image').sort((a, b) => a.y - b.y);
if (flisar.length !== skra.flisar.length) { console.error('flísafjöldi stemmir ekki', flisar.length, skra.flisar.length); process.exit(1); }
const mork = flisar.slice(1).map((f, i) => (f.y + flisar[i].y) / 2);
const merki = [];
for (const f of d.form) {
  if (f.teg === 'image') continue;
  const k = mork.filter((m) => f.y >= m).length, c = flisar[k], g = skra.flisar[k].grunn_midja;
  merki.push({ ...f, flis: k + 1, bx: +(S * (f.x - c.x) + g[0]).toFixed(1), by: +(S * (f.y - c.y) + g[1]).toFixed(1), bw: +(S * f.w).toFixed(1) });
}
fs.writeFileSync(ut, JSON.stringify({ titill: d.titill, S, merki }));
console.log(d.titill, 'S', S.toFixed(5), 'merki', merki.length, 'x', Math.min(...merki.map((m) => m.bx)), '…', Math.max(...merki.map((m) => m.bx)), 'y', Math.min(...merki.map((m) => m.by)), '…', Math.max(...merki.map((m) => m.by)));
