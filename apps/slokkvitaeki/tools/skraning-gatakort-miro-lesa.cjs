// Dregur Miro-SVG (canvas_read_as_svg) út úr lotuskránni (jsonl) eða tool-results skrá og skrifar form sem JSON.
// Notkun: node miro_ur_lotu.cjs "<titill ramma>" <út.json> [skrá með svari]
const fs = require('fs'), path = require('path');
const [,, titill, ut, skra] = process.argv;
const LOTA = 'C:/Users/Slokkvitaeki/.claude/projects/C--Users-Slokkvitaeki/201f439e-f668-4488-81ba-c256d537f940.jsonl';
const merki = `data-frame="${titill}"`;
let svg = null;
const leita = (v) => { if (typeof v === 'string') { if (v.includes(merki) && v.includes('<svg')) svg = v; else if (v.includes(merki.replace(/"/g, '\\"')) && v.includes('<svg')) { try { const o = JSON.parse(v); leita(o); } catch { svg = v.replace(/\\"/g, '"').replace(/\\n/g, '\n'); } } } else if (Array.isArray(v)) v.forEach(leita); else if (v && typeof v === 'object') Object.values(v).forEach(leita); };
if (skra) {
  const t = fs.readFileSync(skra, 'utf8');
  try { leita(JSON.parse(t)); } catch {
    // jsonl (lotuskrá undiragents): hver lína er JSON; annars hrár texti
    let fann = false;
    for (const l of t.split('\n')) { if (!l.includes('data-frame')) continue; try { leita(JSON.parse(l)); fann = true; } catch {} }
    if (!fann) leita(t);
  }
}
else for (const l of fs.readFileSync(LOTA, 'utf8').split('\n')) { if (!l.includes('data-frame')) continue; let o; try { o = JSON.parse(l); } catch { continue; } if (o.type !== 'user') continue; leita(o.message); }
if (!svg) { console.error('fann ekki SVG fyrir', titill); process.exit(1); }
const g = svg.match(new RegExp(`<g [^>]*transform="translate\\((-?[\\d.]+),(-?[\\d.]+)\\)"[^>]*${merki.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)) || svg.match(/transform="translate\((-?[\d.]+),(-?[\d.]+)\)"/);
const ox = +g[1], oy = +g[2];
const eig = (s, n) => { const m = s.match(new RegExp(`(?:^|\\s)${n}="([^"]*)"`)); return m ? m[1] : null; };
const texti = (c) => (c || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const form = [];
for (const m of svg.matchAll(/<(rect|ellipse|circle|polygon|text|textArea|image)\b([^>]*)>/g)) {
  const a = m[2]; if (eig(a, 'data-type') === 'frame') continue;
  const x = +eig(a, 'x'), y = +eig(a, 'y'), w = +eig(a, 'width') || 0, h = +eig(a, 'height') || 0;
  if (Number.isNaN(x) || Number.isNaN(y)) continue;
  form.push({ id: eig(a, 'data-miro-id'), teg: m[1], logun: eig(a, 'data-shape') || eig(a, 'data-type'), x: ox + x + w / 2, y: oy + y + h / 2, w, h, texti: texti(eig(a, 'data-content')), stroke: eig(a, 'stroke'), fill: eig(a, 'fill') });
}
fs.writeFileSync(ut, JSON.stringify({ titill, uppruni: [ox, oy], form }, null, 0));
const tal = {}; for (const f of form) { const k = `${f.teg}/${f.logun}/${f.stroke || ''}/${f.fill || ''}`; tal[k] = (tal[k] || 0) + 1; }
console.log(titill, 'uppruni', ox, oy, 'form', form.length, JSON.stringify(tal));
