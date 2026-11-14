// Smíðar mock.html og merki.json úr EINNI lögunarskilgreiningu (einingahnit, R = 1, miðja 0,0, y niður).
// Keyrsla: node gen.js   (skrifar aðeins í eigin möppu)
'use strict';
const fs = require('fs');
const path = require('path');
const OUT = __dirname;
const D = Math.PI / 180;
const f = (n) => { const s = (Math.round(n * 100) / 100).toString(); return s === '-0' ? '0' : s; };
const r3 = (n) => Math.round(n * 1000) / 1000;

// ---------- slóðaskref -> SVG ----------
// Skref: ["M",x,y] ["L",x,y] ["Q",cx,cy,x,y] ["arc",cx,cy,r,a0,a1] (gráður, réttsælis eins og canvas) ["Z"]
function stepsToD(steps, R, ox, oy) {
  let d = '', started = false;
  const X = (v) => f(ox + v * R), Y = (v) => f(oy + v * R);
  for (const s of steps) {
    const k = s[0];
    if (k === 'M') { d += `M${X(s[1])} ${Y(s[2])}`; started = true; }
    else if (k === 'L') { d += `L${X(s[1])} ${Y(s[2])}`; }
    else if (k === 'Q') { d += `Q${X(s[1])} ${Y(s[2])} ${X(s[3])} ${Y(s[4])}`; }
    else if (k === 'Z') { d += 'Z'; started = false; }
    else if (k === 'arc') {
      const [, cx, cy, r, a0, a1] = s;
      const px = (a) => cx + r * Math.cos(a * D), py = (a) => cy + r * Math.sin(a * D);
      d += (started ? 'L' : 'M') + `${X(px(a0))} ${Y(py(a0))}`; started = true;
      let delta = (((a1 - a0) % 360) + 360) % 360;
      if (delta < 1e-9 && a1 !== a0) delta = 360;
      const rr = f(r * R);
      if (delta >= 359.999) {
        const am = a0 + 180;
        d += `A${rr} ${rr} 0 1 1 ${X(px(am))} ${Y(py(am))}A${rr} ${rr} 0 1 1 ${X(px(a1))} ${Y(py(a1))}`;
      } else {
        d += `A${rr} ${rr} 0 ${delta > 180 ? 1 : 0} 1 ${X(px(a1))} ${Y(py(a1))}`;
      }
    } else throw new Error('óþekkt skref ' + k);
  }
  return d;
}

// ---------- lögun ----------
const SW = 0.22;
const poly = (pts) => [['M', ...pts[0]], ...pts.slice(1).map((p) => ['L', ...p]), ['Z']];
const circ = (cx, cy, r) => [['arc', cx, cy, r, 0, 360], ['Z']];
const utl = (skref, extra) => Object.assign({ skref, fylling: 'stada', strik: SW, horn: 'miter', endar: 'butt' }, extra || {});

const PLUS = {
  logun: 'hol plúsútlína með 12 hornum (óbreytt)', hx: 1, hy: 1, tala: { x: 0, y: 0, fs: 0.6 },
  slodir: [utl(poly([[-0.4, -1], [0.4, -1], [0.4, -0.4], [1, -0.4], [1, 0.4], [0.4, 0.4], [0.4, 1], [-0.4, 1], [-0.4, 0.4], [-1, 0.4], [-1, -0.4], [-0.4, -0.4]]))],
};

const hexPts = [-90, -30, 30, 90, 150, 210].map((a) => [r3(Math.cos(a * D)), r3(Math.sin(a * D))]);

// --- A ---
const A = {
  stal: { logun: 'sexhyrningur með odd upp og niður (eins og ró)', hx: 0.87, hy: 1, tala: { x: 0, y: 0, fs: 0.95 }, slodir: [utl(poly(hexPts))] },
  plast: { logun: 'hringur', hx: 0.95, hy: 0.95, tala: { x: 0, y: 0, fs: 0.95 }, slodir: [utl(circ(0, 0, 0.95))] },
  raf: { logun: 'tígull', hx: 1.1, hy: 1.1, tala: { x: 0, y: 0, fs: 0.85 }, slodir: [utl(poly([[0, -1.1], [1.1, 0], [0, 1.1], [-1.1, 0]]))] },
  milli: { logun: 'ferningur', hx: 0.86, hy: 0.86, tala: { x: 0, y: 0, fs: 0.9 }, slodir: [utl(poly([[-0.86, -0.86], [0.86, -0.86], [0.86, 0.86], [-0.86, 0.86]]))] },
  raufar: { logun: 'liggjandi rétthyrningur með skorin horn', hx: 1.1, hy: 0.68, tala: { x: 0, y: 0, fs: 0.8 }, slodir: [utl(poly([[-0.8, -0.68], [0.8, -0.68], [1.1, -0.38], [1.1, 0.38], [0.8, 0.68], [-0.8, 0.68], [-1.1, 0.38], [-1.1, -0.38]]))] },
  annad: { logun: 'lítill þríhyrningur', hx: 0.6, hy: 0.85, tala: null, slodir: [utl(poly([[0, -0.8], [0.72, 0.45], [-0.72, 0.45]]))] },
};

// --- B ---
const eyru = [];
for (const a of [45, 135, 225, 315]) {
  eyru.push(['M', r3(0.93 * Math.cos(a * D)), r3(0.93 * Math.sin(a * D))]);
  eyru.push(['L', r3(1.36 * Math.cos(a * D)), r3(1.36 * Math.sin(a * D))]);
}
const rect = (hx, y0, y1) => poly([[-hx, y0], [hx, y0], [hx, y1], [-hx, y1]]);
const B = {
  stal: {
    logun: 'tvöfaldur hringur: þykkveggja rör í þversniði', hx: 0.98, hy: 0.98, tala: { x: 0, y: 0, fs: 0.72 },
    slodir: [utl(circ(0, 0, 0.98)), { skref: circ(0, 0, 0.58), fylling: 'engin', strik: 0.1, horn: 'round', endar: 'butt' }],
  },
  plast: {
    logun: 'hringur með fjórum kragaeyrum á ská (rör í brunakraga)', hx: 0.9, hy: 0.9, tala: { x: 0, y: 0, fs: 0.9 },
    slodir: [{ skref: eyru, fylling: 'engin', strik: 0.26, horn: 'miter', endar: 'butt' }, utl(circ(0, 0, 0.9))],
  },
  raf: {
    logun: 'U-laga kapalbakki, opinn að ofan', hx: 1, hy: 0.64, tala: { x: 0, y: 0.04, fs: 0.8 },
    slodir: [
      { skref: rect(1, -0.6, 0.62), fylling: 'stada', strik: 0 },
      { skref: [['M', -1, -0.6], ['L', -1, 0.62], ['L', 1, 0.62], ['L', 1, -0.6]], fylling: 'engin', strik: SW, horn: 'miter', endar: 'butt' },
    ],
  },
  milli: {
    logun: 'ferningur með skyggðu horni (gat í plötu)', hx: 0.86, hy: 0.86, tala: { x: -0.14, y: 0.16, fs: 0.8 },
    slodir: [
      utl(poly([[-0.86, -0.86], [0.86, -0.86], [0.86, 0.86], [-0.86, 0.86]])),
      { skref: poly([[0.12, -0.86], [0.86, -0.86], [0.86, -0.12]]), fylling: 'utlina', strik: 0 },
    ],
  },
  raufar: {
    logun: 'fjórir hornklofar kringum ferkantaðan stokk (raufar í útlínunni)', hx: 1.1, hy: 0.7, tala: { x: 0, y: 0, fs: 0.8 },
    slodir: [
      { skref: rect(1.1, -0.7, 0.7), fylling: 'stada', strik: 0 },
      {
        skref: [['M', -1.1, -0.18], ['L', -1.1, -0.7], ['L', -0.4, -0.7], ['M', 0.4, -0.7], ['L', 1.1, -0.7], ['L', 1.1, -0.18],
          ['M', 1.1, 0.18], ['L', 1.1, 0.7], ['L', 0.4, 0.7], ['M', -0.4, 0.7], ['L', -1.1, 0.7], ['L', -1.1, 0.18]],
        fylling: 'engin', strik: SW, horn: 'miter', endar: 'butt',
      },
    ],
  },
  annad: { logun: 'lítill tígull', hx: 0.7, hy: 0.7, tala: null, slodir: [utl(poly([[0, -0.7], [0.7, 0], [0, 0.7], [-0.7, 0]]))] },
};

// --- C: klasi úr n hringblöðum ---
function klasi(n, kjarni) {
  const KL = { 2: { d: 0.42, r: 0.58, a0: 0 }, 3: { d: 0.52, r: 0.48, a0: -90 }, 4: { d: 0.55, r: 0.45, a0: -45 } };
  let skref, midjur, hx, hy, fs, rl;
  if (n === 1) { skref = circ(0, 0, 0.95); midjur = [[0, 0]]; hx = hy = 0.95; fs = 0.95; rl = 0.95; }
  else {
    const { d, r, a0 } = KL[n]; rl = r;
    const h = 180 / n;
    const rho = d * Math.cos(h * D) + Math.sqrt(r * r - Math.pow(d * Math.sin(h * D), 2));
    midjur = []; skref = [];
    for (let i = 0; i < n; i++) {
      const th = a0 + i * 360 / n;
      const cx = d * Math.cos(th * D), cy = d * Math.sin(th * D);
      midjur.push([r3(cx), r3(cy)]);
      const n0 = [rho * Math.cos((th - h) * D), rho * Math.sin((th - h) * D)];
      const n1 = [rho * Math.cos((th + h) * D), rho * Math.sin((th + h) * D)];
      const s0 = Math.atan2(n0[1] - cy, n0[0] - cx) / D, s1 = Math.atan2(n1[1] - cy, n1[0] - cx) / D;
      skref.push(['arc', r3(cx), r3(cy), r, Math.round(s0 * 100) / 100, Math.round(s1 * 100) / 100]);
    }
    skref.push(['Z']);
    if (n === 2) { hx = 1.0; hy = 0.58; fs = 0.62; }
    if (n === 3) { hx = 0.93; hy = 1.0; fs = 0.7; }
    if (n === 4) { hx = 0.84; hy = 0.84; fs = 0.8; }
  }
  const slodir = [utl(skref, { horn: 'round' })];
  if (kjarni) {
    const kr = n === 1 ? 0.24 : 0.2;
    const ks = [];
    for (const m of midjur) ks.push(['arc', m[0], m[1], kr, 0, 360], ['Z']);
    slodir.push({ skref: ks, fylling: 'utlina', strik: 0 });
  }
  return {
    logun: kjarni ? `klasi úr ${n} hringblöðum með kjarnapunkti í hverju blaði` : `klasi úr ${n} hringblöðum, eitt blað á hvert rör`,
    hx, hy, tala: kjarni ? null : { x: 0, y: 0, fs }, blod: n, slodir,
  };
}
const C = {
  stal: (n) => klasi(n, false),
  plast: (n) => klasi(n, true),
  raf: { logun: 'þríhyrningur með odd upp', hx: 0.8, hy: 1.25, tala: { x: 0, y: 0.18, fs: 0.72 }, slodir: [utl(poly([[0, -1.12], [1.08, 0.7], [-1.08, 0.7]]))] },
  milli: { logun: 'ferningur', hx: 0.86, hy: 0.86, tala: { x: 0, y: 0, fs: 0.9 }, slodir: [utl(poly([[-0.86, -0.86], [0.86, -0.86], [0.86, 0.86], [-0.86, 0.86]]))] },
  raufar: {
    logun: 'tvö samsíða strik (=), opið til hliðanna', hx: 1.1, hy: 0.73, tala: { x: 0, y: 0, fs: 0.8 },
    slodir: [
      { skref: rect(1.1, -0.62, 0.62), fylling: 'stada', strik: 0 },
      { skref: [['M', -1.1, -0.62], ['L', 1.1, -0.62], ['M', -1.1, 0.62], ['L', 1.1, 0.62]], fylling: 'engin', strik: 0.24, horn: 'miter', endar: 'butt' },
    ],
  },
  annad: { logun: 'lítill tígull', hx: 0.7, hy: 0.7, tala: null, slodir: [utl(poly([[0, -0.7], [0.7, 0], [0, 0.7], [-0.7, 0]]))] },
};

// ---------- teiknun ----------
const FYLL = { tilbuid: ['#39ff14', 0.8], halfnad: ['#facc15', 0.85], opid: ['#f87171', 0.8], othekkt: ['#ffffff', 0.4] };
const GR = '#15803d', RD = '#dc2626';
const HAK_FJARL = 0.78;

function hak(x, y, R) {
  const d = `M${f(x - 0.34 * R)} ${f(y + 0.02 * R)}L${f(x - 0.1 * R)} ${f(y + 0.27 * R)}L${f(x + 0.36 * R)} ${f(y - 0.3 * R)}`;
  return `<path d="${d}" fill="none" stroke="#fff" stroke-width="${f(0.4 * R)}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="none" stroke="${GR}" stroke-width="${f(0.19 * R)}" stroke-linecap="round" stroke-linejoin="round"/>`;
}
function kross(x, y, R) {
  const a = 0.25 * R;
  const d = `M${f(x - a)} ${f(y - a)}L${f(x + a)} ${f(y + a)}M${f(x + a)} ${f(y - a)}L${f(x - a)} ${f(y + a)}`;
  return `<path d="${d}" fill="none" stroke="#fff" stroke-width="${f(0.4 * R)}" stroke-linecap="round"/>` +
    `<path d="${d}" fill="none" stroke="${RD}" stroke-width="${f(0.19 * R)}" stroke-linecap="round"/>`;
}

// o: {x,y,R,stada,litur,tala,hok:'baedi'|'halft'|'stakt'|null,stefna:'v'|'h',kerfi,bw,talaLitur}
function merki(sh, o) {
  const { x, y, R } = o; const bw = !!o.bw;
  const [fc, fo] = FYLL[o.stada || 'othekkt'];
  const lit = bw ? '#111' : o.litur;
  let s = '';
  for (const p of sh.slodir) {
    if (bw && p.fylling === 'stada' && !p.strik) continue;
    let a = '';
    if (p.fylling === 'stada') a += bw ? ' fill="none"' : ` fill="${fc}" fill-opacity="${fo}"`;
    else if (p.fylling === 'utlina') a += ` fill="${lit}"`;
    else a += ' fill="none"';
    if (p.strik) a += ` stroke="${lit}" stroke-width="${f(p.strik * R)}" stroke-linejoin="${p.horn || 'miter'}" stroke-linecap="${p.endar || 'butt'}"`;
    s += `<path d="${stepsToD(p.skref, R, x, y)}"${a}/>`;
  }
  if (o.tala != null && sh.tala) {
    const fs = sh.tala.fs * R, tx = f(x + sh.tala.x * R), ty = f(y + sh.tala.y * R + 0.36 * fs);
    const t = `font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="${f(fs)}" text-anchor="middle"`;
    s += `<text x="${tx}" y="${ty}" ${t} fill="none" stroke="#fff" stroke-opacity=".85" stroke-width="${f(Math.max(1.2, 0.16 * R))}" stroke-linejoin="round">${o.tala}</text>`;
    s += `<text x="${tx}" y="${ty}" ${t} fill="${o.talaLitur || '#0f172a'}">${o.tala}</text>`;
  }
  if (o.kerfi && !bw) {
    s += `<circle cx="${f(x - 0.92 * R)}" cy="${f(y + 0.92 * R)}" r="${f(0.27 * R)}" fill="${o.kerfi}" stroke="#fff" stroke-width="${f(0.09 * R)}"/>`;
  }
  if (o.hok) {
    const lod = o.stefna === 'h';
    const off = lod ? (sh.hy + HAK_FJARL) * R : (sh.hx + HAK_FJARL) * R;
    const pa = lod ? [x, y - off] : [x - off, y], pb = lod ? [x, y + off] : [x + off, y];
    if (o.hok === 'baedi') s += hak(pa[0], pa[1], R) + hak(pb[0], pb[1], R);
    else if (o.hok === 'halft') s += hak(pa[0], pa[1], R) + kross(pb[0], pb[1], R);
    else if (o.hok === 'stakt') s += hak(pb[0], pb[1], R);
  }
  return s;
}
const eftir = (x, y) => `<circle cx="${x}" cy="${y}" r="4.2" fill="#dc2626" stroke="#fff" stroke-width="1.6"/>`;
const tillaga = (x, y) => `<circle cx="${x}" cy="${y}" r="6.6" fill="#fff" fill-opacity=".6" stroke="#f97316" stroke-width="1.8"/>` +
  `<text x="${x}" y="${f(y + 3.3)}" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="9.5" text-anchor="middle" fill="#ea580c">?</text>`;
const svg = (w, h, inner, extra) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"${extra || ''}>${inner}</svg>`;

// ---------- gögn ----------
const TEG = [
  { k: 'loft', nafn: 'Loftræsting', litir: ['#2563eb'], litur: '#2563eb', tolur: ['315', '315', '315', '315'] },
  { k: 'stal', nafn: 'Stálrör', litir: ['#fbbf24', '#f97316', '#c2410c', '#7c2d12'], litur: '#f97316', fjoldi: [3, 2, 4, 1], kerfi: ['#dc2626', '#dc2626', null, null] },
  { k: 'plast', nafn: 'Plaströr', litir: ['#22d3ee', '#0891b2', '#155e75'], litur: '#0891b2', fjoldi: [2, 1, 2, 1] },
  { k: 'raf', nafn: 'Rafmagn', litir: ['#067429'], litur: '#067429', tolur: ['2', '2', '2', '2'] },
  { k: 'milli', nafn: 'Milliloft', litir: ['#0f766e'], litur: '#0f766e', eittVerk: true, synitala: '1' },
  { k: 'raufar', nafn: 'Loft raufar', litir: ['#1e3a8a'], litur: '#1e3a8a', tolur: ['3', '3', '3', '3'] },
  { k: 'annad', nafn: 'Annað', litir: ['#9ca3af'], litur: '#9ca3af' },
];
const STODUR = [['tilbuid', 'Tilbúið'], ['halfnad', 'Hálfnað'], ['opid', 'Opið'], ['othekkt', 'Óþekkt staða']];

const TILL = [
  {
    id: 'A', heiti: 'Fjölskylda plússins', set: A, klasar: false,
    rok: 'Öll merki eru holar útlínur með sömu strikþykkt (0,22·R) og hvössum hornum og plúsinn; aðeins lögunin breytist. <b>Vinnst:</b> minnst breyting frá því sem nú er, einfaldast í útfærslu, og ferningarnir tveir (milliloft og loft raufar) greinast loks að. <b>Tapast:</b> stál (sexhyrningur) og plast (hringur) eru enn lík við 10 px, og fjöldi röra sést aðeins á tölunni.',
    stutt: { stal: 'sexhyrningur (ró)', plast: 'hringur', raf: 'tígull', milli: 'ferningur', raufar: 'liggjandi, skorin horn', annad: 'lítill þríhyrningur' },
  },
  {
    id: 'B', heiti: 'Hluturinn sjálfur', set: B, klasar: false,
    rok: 'Hvert merki er einföld mynd af hlutnum: þykkveggja rör, rör í brunakraga, kapalbakki, gat í plötu, raufar kringum stokk. <b>Vinnst:</b> tegundin þekkist án þess að læra lykil, og stál og plast eru ólík í svarthvítu í vinnustærð. <b>Tapast:</b> meira blek í hverju merki, og smáatriðin (innri hringur, kragaeyru, skyggt horn) dofna við 10 px.',
    stutt: { stal: 'tvöfaldur hringur (rörveggur)', plast: 'hringur með kragaeyrum', raf: 'U-laga kapalbakki', milli: 'ferningur, skyggt horn', raufar: 'fjórir hornklofar', annad: 'lítill tígull' },
  },
  {
    id: 'C', heiti: 'Klasar: eitt blað á hvert rör', set: C, klasar: true,
    rok: 'Rör eru teiknuð sem klasi með einu bogablaði fyrir hvert rör á staðnum (1–4), svo fjöldinn sést á útlínunni án þess að lesa tölu; þetta er blómhringurinn þinn, nema nú þýða blöðin eitthvað. Plaströr fá kjarnapunkt í hvert blað en stálrör eru hol, svo efnið sést líka í svarthvítu og við 10 px. <b>Tapast:</b> plaströr hafa ekki rými fyrir tölu (punktarnir eru talan), og fleiri en fjögur rör þurfa tölu í miðju.',
    stutt: { stal: 'klasi, blað á hvert rör', plast: 'klasi með kjarnapunktum', raf: 'þríhyrningur', milli: 'ferningur', raufar: 'tvö samsíða strik (=)', annad: 'lítill tígull' },
  },
];

// skilar {sh, tala} fyrir tegund og fjölda
function gerd(T, k, n, synaTolu) {
  if (k === 'loft') return { sh: PLUS, tala: null };
  if (k === 'stal' || k === 'plast') {
    if (T.klasar) {
      const sh = T.set[k](Math.min(n, 4));
      return { sh, tala: (k === 'stal' && (synaTolu || n > 4)) ? String(n) : null };
    }
    return { sh: T.set[k], tala: String(n) };
  }
  return { sh: T.set[k], tala: null };
}

// ---------- töflur ----------
const CW = 150, CH = 60, RW = 13;
function reitur(T, t, si, opts) {
  opts = opts || {};
  const st = STODUR[si][0];
  let g = gerd(T, t.k, t.fjoldi ? t.fjoldi[si] : 1, true);
  let tala = g.tala;
  if (t.tolur) tala = t.tolur[si];
  let hok = st === 'tilbuid' ? 'baedi' : st === 'halfnad' ? 'halft' : null;
  if (t.eittVerk) hok = st === 'tilbuid' ? 'stakt' : null;
  let inner = '';
  if (!t.eittVerk) inner += `<line x1="${CW / 2}" y1="3" x2="${CW / 2}" y2="${CH - 3}" stroke="#e11d2e" stroke-width="3.5"/>`;
  inner += merki(g.sh, { x: CW / 2, y: CH / 2, R: RW, stada: st, litur: t.litur, tala, hok, kerfi: t.kerfi ? t.kerfi[si] : null });
  return svg(CW, CH, inner);
}
function stor(T, t) {
  const n = t.k === 'stal' ? 3 : t.k === 'plast' ? 2 : 1;
  const g = gerd(T, t.k, n, true);
  let tala = g.tala;
  if (t.tolur) tala = t.tolur[0];
  if (t.synitala) tala = t.synitala;
  return svg(100, 78, merki(g.sh, { x: 50, y: 40, R: 26, stada: 'othekkt', litur: t.litur, tala, talaLitur: '#475569' }));
}
function tafla(T) {
  let h = `<table><colgroup><col style="width:200px"><col style="width:110px"><col style="width:165px"><col style="width:165px"><col style="width:165px"><col style="width:165px"></colgroup>`;
  h += `<tr><th>Tegund</th><th>Lögun, tvöföld stærð</th>${STODUR.map((s) => `<th>${s[1]}</th>`).join('')}</tr>`;
  for (const t of TEG) {
    const stutt = t.k === 'loft' ? 'plúsútlína (óbreytt)' : T.stutt[t.k];
    const sw = t.litir.map((c) => `<i class="sw" style="background:${c}"></i>`).join('');
    h += `<tr><td class="teg"><strong>${t.nafn}</strong><em>${stutt}</em>${sw}</td><td>${stor(T, t)}</td>`;
    for (let si = 0; si < 4; si++) {
      if (t.eittVerk && STODUR[si][0] === 'halfnad') h += `<td><span class="na">á ekki við<br>(eitt verk er öll lokunin)</span></td>`;
      else h += `<td>${reitur(T, t, si)}</td>`;
    }
    h += `</tr>`;
  }
  return h + `</table>`;
}

// ---------- yfirlit ----------
function yfirlit(T) {
  const W = 466, H = 204;
  let dalkar;
  if (T.klasar) {
    dalkar = [['loft', 1, 'Loftr.'], ['stal', 1, 'Stál 1'], ['stal', 2, 'Stál 2'], ['stal', 3, 'Stál 3'], ['stal', 4, 'Stál 4'], ['plast', 1, 'Plast 1'], ['plast', 2, 'Plast 2'], ['raf', 1, 'Rafm.'], ['milli', 1, 'Millil.'], ['raufar', 1, 'Raufar'], ['annad', 1, 'Annað']];
  } else {
    dalkar = [['loft', 1, 'Loftræsting'], ['stal', 1, 'Stálrör'], ['plast', 1, 'Plaströr'], ['raf', 1, 'Rafmagn'], ['milli', 1, 'Milliloft'], ['raufar', 1, 'Loft raufar'], ['annad', 1, 'Annað']];
  }
  const cw = W / dalkar.length;
  const st = ['tilbuid', 'halfnad', 'opid'];
  const cap = (y, t) => `<text x="6" y="${y}" font-family="Arial,Helvetica,sans-serif" font-size="11.5" font-weight="700" fill="#374151">${t}</text>`;
  let s = `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" fill="#fff" stroke="#cbd5e1"/>`;
  s += cap(15, 'Í lit, þvermál 10 px (á rauðum vegg, stöður til skiptis)');
  s += `<line x1="0" y1="38" x2="${W}" y2="38" stroke="#e11d2e" stroke-width="1.6"/>`;
  s += cap(72, 'Svarthvítt, þvermál 20 px');
  s += cap(138, 'Svarthvítt, þvermál 10 px');
  dalkar.forEach((dk, i) => {
    const t = TEG.find((q) => q.k === dk[0]);
    const g = gerd(T, dk[0], dk[1], false);
    const x = cw * (i + 0.5);
    s += merki(g.sh, { x, y: 38, R: 5, stada: st[i % 3], litur: t.litur });
    s += merki(g.sh, { x, y: 100, R: 10, bw: true });
    s += merki(g.sh, { x, y: 158, R: 5, bw: true });
    s += `<text x="${f(x)}" y="194" font-family="Arial,Helvetica,sans-serif" font-size="${T.klasar ? 10 : 11}" text-anchor="middle" fill="#374151">${dk[2]}</text>`;
  });
  return svg(W, H, s);
}

// ---------- sýnishorn á teikningu ----------
// Sömu gögn í öllum þremur tillögum.
const SYN = [
  { k: 'loft', x: 118, y: 120, R: 12, stada: 'tilbuid', hok: 'baedi', stefna: 'h', litur: '#2563eb', tala: '315' },
  { k: 'milli', x: 50, y: 58, R: 11, stada: 'tilbuid', hok: 'stakt', stefna: 'v', litur: '#0f766e' },
  { k: 'stal', n: 3, x: 176, y: 120, R: 11, stada: 'halfnad', hok: 'halft', stefna: 'h', litur: '#fbbf24' },
  { k: 'stal', n: 2, x: 206, y: 120, R: 11, stada: 'tilbuid', hok: 'baedi', stefna: 'h', litur: '#c2410c', kerfi: '#dc2626' },
  { k: 'stal', n: 4, x: 238, y: 120, R: 12, stada: 'opid', hok: null, stefna: 'h', litur: '#7c2d12', kerfi: '#0891b2' },
  { k: 'raf', x: 360, y: 120, R: 11, stada: 'opid', hok: null, stefna: 'h', litur: '#067429' },
  { k: 'plast', n: 1, x: 440, y: 120, R: 11, stada: 'tilbuid', hok: 'baedi', stefna: 'h', litur: '#22d3ee' },
  { k: 'plast', n: 2, x: 300, y: 44, R: 11, stada: 'halfnad', hok: 'halft', stefna: 'v', litur: '#0891b2' },
  { k: 'raufar', x: 300, y: 180, R: 11, stada: 'tilbuid', hok: 'baedi', stefna: 'v', litur: '#1e3a8a' },
  { k: 'annad', x: 440, y: 56, R: 11, stada: 'othekkt', hok: null, stefna: 'v', litur: '#9ca3af' },
];
const SYN_TEXTI = [[12, 113, 'E30-CS'], [190, 50, 'Herb. 512'], [345, 34, 'Tæknirými'], [322, 152, 'Gangur'], [306, 208, 'EI60'], [190, 166, '315x200'], [131, 30, 'Ø315']];
const SYN_EFTIR = [268, 120], SYN_TILL = [300, 90];

function synishorn(T) {
  const W = 480, H = 220;
  let s = `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" fill="#fff" stroke="#cbd5e1"/>`;
  const gr = 'fill="none" stroke="#9aa3ad" stroke-width="1"';
  s += `<rect x="6" y="6" width="468" height="208" ${gr}/>`;
  s += `<path d="M150 6V74M150 96V120M150 74H172M172 74A22 22 0 0 1 150 96M6 90H110M400 120V214M9 9H471V211H9Z" ${gr}/>`;
  s += `<path d="M110 14H126V172H466V188H126V196H110Z" fill="#5fd6c9" fill-opacity=".22" stroke="#5fd6c9" stroke-width="1.6"/>`;
  s += `<path d="M6 120H474M300 6V214" fill="none" stroke="#e11d2e" stroke-width="4"/>`;
  for (const t of SYN_TEXTI) s += `<text x="${t[0]}" y="${t[1]}" font-family="Arial,Helvetica,sans-serif" font-size="9" fill="#111">${t[2]}</text>`;
  for (const m of SYN) {
    const g = gerd(T, m.k, m.n || 1, false);
    s += merki(g.sh, Object.assign({}, m, { tala: m.tala != null ? m.tala : g.tala }));
  }
  s += eftir(SYN_EFTIR[0], SYN_EFTIR[1]) + tillaga(SYN_TILL[0], SYN_TILL[1]);
  return svg(W, H, s);
}

// ---------- sjálfsprófun á sýnishorni: skarast eitthvað? ----------
function kassi(T, m) {
  const g = gerd(T, m.k, m.n || 1, false); const sh = g.sh; const R = m.R;
  let x0 = m.x - (sh.hx + 0.14) * R, x1 = m.x + (sh.hx + 0.14) * R, y0 = m.y - (sh.hy + 0.14) * R, y1 = m.y + (sh.hy + 0.14) * R;
  if (m.hok) {
    const e = HAK_FJARL + 0.5;
    if (m.stefna === 'h') { if (m.hok !== 'stakt') y0 = m.y - (sh.hy + e) * R; y1 = m.y + (sh.hy + e) * R; }
    else { if (m.hok !== 'stakt') x0 = m.x - (sh.hx + e) * R; x1 = m.x + (sh.hx + e) * R; }
  }
  if (m.kerfi) { x0 = Math.min(x0, m.x - 1.3 * R); y1 = Math.max(y1, m.y + 1.3 * R); }
  return [x0, y0, x1, y1, `${m.k}${m.n || ''}`];
}
function profa(T) {
  const ks = SYN.map((m) => kassi(T, m));
  ks.push([SYN_EFTIR[0] - 6, SYN_EFTIR[1] - 6, SYN_EFTIR[0] + 6, SYN_EFTIR[1] + 6, 'eftir']);
  ks.push([SYN_TILL[0] - 8, SYN_TILL[1] - 8, SYN_TILL[0] + 8, SYN_TILL[1] + 8, 'tillaga']);
  for (const t of SYN_TEXTI) ks.push([t[0], t[1] - 8, t[0] + t[2].length * 5.2, t[1] + 2, 'texti:' + t[2]]);
  const vill = [];
  for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) {
    const a = ks[i], b = ks[j];
    if (a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]) vill.push(`${T.id}: ${a[4]} x ${b[4]}`);
  }
  for (const k of ks) if (k[0] < 2 || k[1] < 2 || k[2] > 478 || k[3] > 218) vill.push(`${T.id}: ${k[4]} út fyrir ramma`);
  return vill;
}

// ---------- samanburður ----------
function samanburdur() {
  let h = `<table><colgroup><col style="width:200px"><col style="width:256px"><col style="width:256px"><col style="width:256px"></colgroup>`;
  h += `<tr><th>Tegund (staða: hálfnað)</th>${TILL.map((T) => `<th>${T.id} · ${T.heiti}</th>`).join('')}</tr>`;
  for (const t of TEG) {
    h += `<tr><td class="teg"><strong>${t.nafn}</strong>${t.eittVerk ? '<em>eitt verk: sýnt tilbúið með einu haki</em>' : ''}</td>`;
    for (const T of TILL) {
      const si = t.eittVerk ? 0 : 1;
      const tt = Object.assign({}, t);
      if (t.k === 'stal') { tt.fjoldi = [3, 3, 3, 3]; tt.kerfi = ['#dc2626', '#dc2626', null, null]; }
      if (t.k === 'plast') tt.fjoldi = [2, 2, 2, 2];
      const stutt = t.k === 'loft' ? 'plúsútlína (óbreytt)' : T.stutt[t.k];
      h += `<td>${reitur(T, tt, si)}<div class="cap">${stutt}</div></td>`;
    }
    h += `</tr>`;
  }
  return h + `</table>`;
}

// ---------- lykill ----------
function lykill() {
  const m = (st, hok) => svg(46, 24, merki(PLUS, { x: 23, y: 12, R: 8, stada: st, litur: '#2563eb', hok }));
  return `<div class="lykill">
<span>${m('tilbuid', 'baedi')} Tilbúið</span>
<span>${m('halfnad', 'halft')} Hálfnað</span>
<span>${m('opid', null)} Opið</span>
<span>${m('othekkt', null)} Óþekkt staða</span>
<span>${svg(16, 24, eftir(8, 12))} Eftir, óskráð</span>
<span>${svg(18, 24, tillaga(9, 12))} Tillaga</span>
<span>${svg(18, 24, `<circle cx="9" cy="12" r="4" fill="#dc2626" stroke="#fff" stroke-width="1.2"/>`)} Kerfispunktur (stálrör)</span>
</div>`;
}

// ---------- síða ----------
const css = `
*{box-sizing:border-box}
body{margin:0;background:#e9edf1;font-family:"Segoe UI",system-ui,Arial,Helvetica,sans-serif;color:#111827}
.page{width:1100px;margin:0 auto;padding:28px 40px 48px;background:#f6f7f9}
h1{font-size:32px;margin:0 0 6px;letter-spacing:-.3px}
.sub{font-size:17px;color:#374151;margin:0 0 14px;line-height:1.45}
.lykill{display:flex;flex-wrap:wrap;gap:6px 20px;align-items:center;background:#fff;border:1px solid #d9dee5;border-radius:10px;padding:10px 16px;font-size:15px}
.lykill span{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
section{background:#fff;border:1px solid #d9dee5;border-radius:12px;padding:22px 24px 24px;margin-top:26px}
h2{font-size:25px;margin:0 0 8px}
h2 b{display:inline-block;background:#0f2a4a;color:#fff;border-radius:8px;padding:1px 13px 3px;margin-right:10px}
.rok{font-size:17px;line-height:1.5;margin:0 0 16px;color:#1f2937}
table{border-collapse:collapse;width:100%;table-layout:fixed}
th,td{border:1px solid #e2e6eb;padding:0;text-align:center;vertical-align:middle}
th{background:#f1f4f7;font-size:15px;padding:8px 6px;font-weight:600}
td.teg{text-align:left;padding:7px 12px}
td.teg strong{font-size:17px;display:block}
td.teg em{font-style:normal;font-size:13.5px;color:#4b5563;display:block;line-height:1.3;margin-top:1px}
.sw{display:inline-block;width:12px;height:12px;border-radius:3px;margin:5px 4px 0 0}
td svg{display:block;margin:0 auto}
.na{font-size:13px;color:#6b7280;line-height:1.35;display:inline-block}
.cap{font-size:13px;color:#4b5563;padding:0 4px 6px;margin-top:-2px}
.nedri{display:flex;gap:24px;margin-top:18px;align-items:flex-start}
.nedri h3{font-size:15px;margin:0 0 6px;font-weight:600;color:#374151}
.nedri p{font-size:13px;color:#4b5563;line-height:1.4;margin:6px 0 0}
.nedri svg{display:block}
.tilm{font-size:18px;line-height:1.55;margin:18px 0 0;padding:14px 18px;background:#eef6ff;border:1px solid #bfdbfe;border-radius:10px}
`;

function kafli(T) {
  return `<section>
<h2><b>${T.id}</b>${T.heiti}</h2>
<p class="rok">${T.rok}</p>
${tafla(T)}
<div class="nedri">
<div style="width:480px"><h3>Sýnishorn á teikningu (vinnustærð, R = 11–12 px)</h3>${synishorn(T)}
<p>Lárétti veggurinn: loftræsting 315 á stokknum, stálrör ×3, ×2 (úðakerfi) og ×4 (vatn og hiti) saman, óskráður punktur, rafmagn, plaströr. Lóðrétti veggurinn: plaströr ×2, tillaga, loft raufar á stokknum. Í herbergjum: milliloft og annað.</p></div>
<div style="width:466px"><h3>Í yfirliti (öll hæðin sést) og í svarthvítu</h3><div class="yf">${yfirlit(T)}</div>
<p>Engin tala og engin hök við 10 px; aðeins lögun, útlína og fylling.</p></div>
</div>
</section>`;
}

const html = `<!doctype html>
<html lang="is"><head><meta charset="utf-8"><meta name="viewport" content="width=1100">
<title>Apex Ajour · tillögur að merkjum</title>
<style>${css}</style></head><body><div class="page">
<h1>Apex Ajour · tillögur að merkjum</h1>
<p class="sub">Þrjár heildartillögur að merkjum fyrir aðrar tegundir en loftræstingu. Plúsinn, hökin og litakerfi fyllingar eru eins í öllum þremur: <b>lögun = tegund, útlína = stærðarflokkur, fylling = staða.</b> Merkin í töflunum eru í vinnustærð (þvermál um 26 px) og rauða strikið bak við þau er brunaveggur.</p>
${lykill()}
${TILL.map(kafli).join('\n')}
<section>
<h2>Samanburður</h2>
<p class="rok">Sama merkið í stöðunni „hálfnað“ (✓ öðrum megin, ✕ hinum megin) í öllum þremur tillögum. Stálrör eru sýnd sem þrjú rör saman og plaströr sem tvö.</p>
${samanburdur()}
<p class="tilm"><b>Tilmæli:</b> Ég mæli með <b>C</b>. Hún er sú eina sem leysir bæði atriðin sem þú nefndir: fjöldi röra sést á löguninni sjálfri, og stál og plast greinast að án litar, líka þegar öll hæðin sést. Finnist þér þríhyrningurinn fyrir rafmagn minna of mikið á viðvörunarmerki má taka kapalbakkann úr B í staðinn. Athugaðu líka að ljósgula útlínan (stálrör 15-35) hverfur nánast á gulri fyllingu „hálfnað“ í öllum tillögum, sjá þriggja röra merkið á sýnishornunum.</p>
</section>
</div></body></html>
`;

// ---------- merki.json ----------
function utfl(sh) {
  return {
    logun: sh.logun, halfbreidd: sh.hx, halfhaed: sh.hy,
    tala: sh.tala ? { x: sh.tala.x, y: sh.tala.y, leturstaerd: sh.tala.fs } : null,
    slodir: sh.slodir.map((p) => ({ fylling: p.fylling, strik: p.strik || 0, horn: p.strik ? (p.horn || 'miter') : undefined, endar: p.strik ? (p.endar || 'butt') : undefined, skref: p.skref })),
  };
}
const json = {
  lysing: 'Apex Ajour · tillögur að merkjum (A, B, C). Allar stærðir í einingum af R; miðja merkis er (0,0), x til hægri, y NIÐUR eins og í canvas.',
  snid: {
    skref: {
      M: '["M",x,y] = moveTo', L: '["L",x,y] = lineTo', Q: '["Q",cx,cy,x,y] = quadraticCurveTo',
      arc: '["arc",cx,cy,r,a0,a1] = ctx.arc(cx,cy,r,a0·π/180,a1·π/180) réttsælis; horn í GRÁÐUM. Canvas dregur sjálft línu að upphafi bogans ef slóð er hafin.',
      Z: '["Z"] = closePath',
    },
    slodir: 'Slóðir merkis eru teiknaðar í röð. fylling: "stada" = stöðulitur, "utlina" = fyllt með lit stærðarflokks, "engin" = ófyllt. strik = strikþykkt í R (0 = ekkert strik), í lit stærðarflokks. horn = lineJoin, endar = lineCap.',
    tala: 'Miðja tölunnar (x,y) í R og leturstærð í R (feitt, miðjað). Teiknað fyrst með hvítu striki (0,16·R, 85% ógagnsætt), síðan fyllt #0f172a.',
    yfirlit: 'Þegar R < 7 px: sleppa tölu, hökum og kerfispunkti; teikna aðeins slóðirnar.',
  },
  sameiginlegt: {
    strik: SW,
    fylling: { tilbuid: 'rgba(57,255,20,.8)', halfnad: 'rgba(250,204,21,.85)', opid: 'rgba(248,113,113,.8)', othekkt: 'rgba(255,255,255,.4)' },
    hak: {
      stadur: 'Miðja haks er (halfbreidd + 0.78)·R frá miðju merkis til vinstri og hægri; ef veggurinn liggur lárétt: (halfhaed + 0.78)·R ofan og neðan. Milliloft: aðeins eitt hak, hægra megin.',
      hak_skref: [['M', -0.34, 0.02], ['L', -0.1, 0.27], ['L', 0.36, -0.3]],
      kross_skref: [['M', -0.25, -0.25], ['L', 0.25, 0.25], ['M', 0.25, -0.25], ['L', -0.25, 0.25]],
      strik: 0.19, hvitur_baugur: 0.4, endar: 'round', litur_haks: GR, litur_kross: RD,
    },
    kerfispunktur: { x: -0.92, y: 0.92, radius: 0.27, hvit_brun: 0.09, adeins: 'stálrör' },
    eftir_oskrad: { radius_px: 4.2, fylling: '#dc2626', hvit_brun_px: 1.6 },
    tillaga: { radius_px: 6.6, strik_px: 1.8, litur: '#f97316', takn: '?' },
  },
  loftraesting: utfl(PLUS),
  tillogur: {},
};
for (const T of TILL) {
  const o = { heiti: T.heiti, tegundir: {} };
  for (const k of ['stal', 'plast', 'raf', 'milli', 'raufar', 'annad']) {
    const nafn = { stal: 'stalror', plast: 'plastror', raf: 'rafmagn', milli: 'milliloft', raufar: 'loft_raufar', annad: 'annad' }[k];
    if (T.klasar && (k === 'stal' || k === 'plast')) {
      o.tegundir[nafn] = {
        logun: T.stutt[k],
        regla: k === 'stal'
          ? 'Fjöldi blaða = fjöldi röra á staðnum (1–4). Fleiri en 4: fjögur blöð og talan í miðju. Talan er annars valfrjáls.'
          : 'Fjöldi blaða = fjöldi röra (1–4); fylltur kjarnapunktur í miðju hvers blaðs í lit stærðarflokks. Engin tala.',
        snuningur: 'Valfrjálst: snúa tveggja blaða klasa þannig að blöðin liggi eftir veggnum.',
        afbrigdi: { 1: utfl(T.set[k](1)), 2: utfl(T.set[k](2)), 3: utfl(T.set[k](3)), 4: utfl(T.set[k](4)) },
      };
    } else {
      o.tegundir[nafn] = utfl(T.set[k]);
      if (T.id === 'C' && k === 'raufar') o.tegundir[nafn].snuningur = 'Valfrjálst: strikin liggja samsíða stokknum, þ.e. þvert á vegginn (= við lóðréttan vegg, ‖ við láréttan).';
    }
  }
  json.tillogur[T.id] = o;
}

// ---------- skrif + sjálfsprófun ----------
const vill = [].concat(...TILL.map(profa));
if (/NaN|undefined/.test(html)) vill.push('NaN/undefined í html');
const nOpen = (html.match(/<svg/g) || []).length, nClose = (html.match(/<\/svg>/g) || []).length;
if (nOpen !== nClose) vill.push(`svg ójafnt ${nOpen}/${nClose}`);
fs.writeFileSync(path.join(OUT, 'mock.html'), html, 'utf8');
fs.writeFileSync(path.join(OUT, 'merki.json'), JSON.stringify(json, null, 1).replace(/\[\s+("(?:M|L|Q|arc|Z)"[^\]]*?)\s+\]/g, (m, a) => '[' + a.replace(/\s+/g, ' ') + ']'), 'utf8');
console.log('mock.html', html.length, 'bæti; svg:', nOpen);
console.log(vill.length ? 'ATHUGA:\n' + vill.join('\n') : 'engin skörun í sýnishornum');
