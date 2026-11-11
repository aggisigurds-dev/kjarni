// Varpar Miro-merkjum á grunnmynd með stillingu úr miro_hough.py (án skjámyndar): base_px = s·P + t_flísar.
// Notkun: node miro_varpa2.cjs <merki.json> <hough.json> <út.json> [y-mörk flísa í borðhnitum ...]
const fs = require('fs');
const [,, inn, hf, ut, ...mork] = process.argv;
const d = JSON.parse(fs.readFileSync(inn, 'utf8')), h = JSON.parse(fs.readFileSync(hf, 'utf8'));
const M = mork.map(Number), merki = [];
for (const f of d.form) {
  if (f.teg === 'image') continue;
  const k = M.filter((m) => f.y >= m).length, t = h.flisar.find((x) => x.k === k) || h.flisar[0];
  merki.push({ ...f, flis: k + 1, bx: +(h.s * f.x + t.tx).toFixed(1), by: +(h.s * f.y + t.ty).toFixed(1), bw: +(h.s * f.w).toFixed(1) });
}
fs.writeFileSync(ut, JSON.stringify({ titill: d.titill, S: h.s, merki }));
const a = merki.filter((m) => m.logun === 'left_right_arrow');
console.log(d.titill, 's', h.s, 'merki', merki.length, 'x', Math.min(...merki.map((m) => m.bx)), '…', Math.max(...merki.map((m) => m.bx)), 'y', Math.min(...merki.map((m) => m.by)), '…', Math.max(...merki.map((m) => m.by)), '· örvar:', JSON.stringify([...new Set(a.map((m) => m.texti))]));
