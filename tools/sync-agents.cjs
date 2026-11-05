#!/usr/bin/env node
// sync-agents.cjs — heldur agent-afritunum í kjarna/.claude/agents í takt við frumritin.
//
//   node tools/sync-agents.cjs --check     lesaðeins: ok | úrelt | vantar | munaðarlaust per skrá, exit 1 á reki
//   node tools/sync-agents.cjs --sync      afritar frumrit hingað (+ afrit-merki strax eftir frontmatter)
//   node tools/sync-agents.cjs --hreinsa   eyðir munaðarlausum afritum (afrit-merki en ekkert frumrit)
//
// Heimild per agent:
//   1. C:\projects\brunaholf\data\agents-registry.json ef til: `heimili` (fyrsta repó sem á skrána
//      og er ekki merkt afrit:true í `skrar`). YFIRSKRIFT hér að neðan gengur framar.
//   2. annars: agent-skrá til í brunaholf → brunaholf, annars slokkvitaeki.
// Kjarna-frumrit (engin afrit-merki og ekkert frumrit annars staðar, t.d. kjarni-vefur, artcraft,
// skraning) eru látin í friði.
// Engin npm-dep. Búið til 04.11.2026 (Agentakerfið 2.0, fasi 2).
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PROJECTS = 'C:\\projects';
const KJARNI = path.resolve(__dirname, '..');
const AGENTS_DIR = path.join(KJARNI, '.claude', 'agents');
const REGISTRY = path.join(PROJECTS, 'brunaholf', 'data', 'agents-registry.json');
const REPOS = ['brunaholf', 'slokkvitaeki'];

// Þar sem registry raðar heimili í stafrófsröð en frumritið býr annars staðar.
// joker: slokkvitaeki-eintakið er stóra hönnuða-frumritið (~620 l.); brunaholf á styttri systurútgáfu.
const YFIRSKRIFT = { joker: 'slokkvitaeki' };

// Sama regla og build-agents-registry.cjs í brunaholf notar til að sleppa afritum.
const AFRIT_RE = /^> (?:AFRIT — frumrit í|⚠️ \*\*Afrit\b)/m;

const agentPath = (repo, nafn) => path.join(PROJECTS, repo, '.claude', 'agents', nafn + '.md');
const les = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 12);
const iDag = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function erFrumrit(repo, nafn) {
  const p = agentPath(repo, nafn);
  return fs.existsSync(p) && !AFRIT_RE.test(les(p));
}

// nafn → repo frumrits
function finnaHeimildir() {
  const heimildir = new Map();
  let reg = null;
  if (fs.existsSync(REGISTRY)) {
    try { reg = JSON.parse(fs.readFileSync(REGISTRY, 'utf8')); } catch (e) {
      console.error(`! gat ekki lesið ${REGISTRY}: ${e.message} — nota skráareglu`);
    }
  }
  if (reg && Array.isArray(reg.list)) {
    for (const a of reg.list) {
      if (a.type !== 'agent') continue;
      const skrar = Array.isArray(a.skrar) ? a.skrar : [];
      const merktAfrit = new Set(skrar.filter((s) => s.afrit).map((s) => s.repo));
      let repo = YFIRSKRIFT[a.name];
      if (!repo || !erFrumrit(repo, a.name)) {
        repo = (a.heimili || []).find((r) => REPOS.includes(r) && !merktAfrit.has(r) && erFrumrit(r, a.name));
      }
      if (repo) heimildir.set(a.name, repo);
    }
  }
  // Skráaregla — fyllir upp í (og dugar ein ef registry vantar).
  for (const repo of REPOS) {
    const dir = path.join(PROJECTS, repo, '.claude', 'agents');
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.md')) continue;
      const nafn = f.slice(0, -3);
      if (heimildir.has(nafn)) continue;
      const bh = erFrumrit('brunaholf', nafn), sl = erFrumrit('slokkvitaeki', nafn);
      if (YFIRSKRIFT[nafn] && erFrumrit(YFIRSKRIFT[nafn], nafn)) heimildir.set(nafn, YFIRSKRIFT[nafn]);
      else if (bh) heimildir.set(nafn, 'brunaholf');
      else if (sl) heimildir.set(nafn, 'slokkvitaeki');
    }
  }
  return heimildir;
}

const merkiLina = (repo, nafn, dags) =>
  `> ⚠️ **Afrit** — frumrit í C:\\projects\\${repo}\\.claude\\agents\\${nafn}.md (samstillt ${dags}). Breyttu þar.`;

// Setur afrit-merkið strax á eftir lokalínu frontmatter (`---`).
function bytaAfrit(frumrit, repo, nafn, dags) {
  const lines = frumrit.split('\n');
  let lok = -1;
  if (lines[0] === '---') lok = lines.indexOf('---', 1);
  const m = merkiLina(repo, nafn, dags);
  if (lok < 0) return m + '\n' + frumrit;
  lines.splice(lok + 1, 0, m);
  return lines.join('\n');
}

// Fjarlægir afrit-merkið (nýja sniðið, strax eftir frontmatter) svo bera megi saman við frumrit.
function anMerkis(afrit) {
  return afrit.replace(/^(---\n[\s\S]*?\n---\n)> ⚠️ \*\*Afrit\*\* — frumrit í [^\n]*\n/, '$1');
}

function stada() {
  const heimildir = finnaHeimildir();
  const nidurstodur = [];
  const kjarniSkrar = fs.existsSync(AGENTS_DIR) ? fs.readdirSync(AGENTS_DIR).filter((f) => f.endsWith('.md')) : [];
  const sed = new Set();
  for (const f of kjarniSkrar) {
    const nafn = f.slice(0, -3);
    sed.add(nafn);
    const texti = les(path.join(AGENTS_DIR, f));
    const erAfrit = AFRIT_RE.test(texti);
    const repo = heimildir.get(nafn);
    if (!repo) {
      nidurstodur.push({ nafn, stada: erAfrit ? 'munaðarlaust' : 'kjarna-frumrit' });
      continue;
    }
    if (!erAfrit) {
      // Sama nafn og frumrit annars staðar en ekkert afrit-merki — ekki snerta, en láta vita.
      nidurstodur.push({ nafn, repo, stada: 'árekstur', ath: 'kjarna-skrá án afrit-merkis heitir eins og frumrit' });
      continue;
    }
    const frumrit = les(agentPath(repo, nafn));
    const h1 = hash(frumrit), h2 = hash(anMerkis(texti));
    nidurstodur.push({ nafn, repo, stada: h1 === h2 ? 'ok' : 'úrelt', frumrit: h1, afrit: h2 });
  }
  for (const [nafn, repo] of heimildir) {
    if (!sed.has(nafn)) nidurstodur.push({ nafn, repo, stada: 'vantar' });
  }
  nidurstodur.sort((a, b) => a.nafn.localeCompare(b.nafn));
  return nidurstodur;
}

function prenta(nid) {
  for (const r of nid) {
    const hvar = r.repo ? ` ← ${r.repo}` : '';
    const h = r.frumrit && r.stada !== 'ok' ? `  (frumrit ${r.frumrit} ≠ afrit ${r.afrit})` : '';
    console.log(`${r.stada.padEnd(14)} ${r.nafn}${hvar}${h}${r.ath ? '  — ' + r.ath : ''}`);
  }
  const telja = {};
  for (const r of nid) telja[r.stada] = (telja[r.stada] || 0) + 1;
  console.log('\n' + Object.entries(telja).map(([k, v]) => `${k}: ${v}`).join(' · '));
}

const REK = new Set(['úrelt', 'vantar', 'munaðarlaust', 'árekstur']);

function main() {
  const arg = process.argv[2] || '--check';
  if (arg === '--check') {
    const nid = stada();
    prenta(nid);
    process.exit(nid.some((r) => REK.has(r.stada)) ? 1 : 0);
  } else if (arg === '--sync') {
    const dags = iDag();
    let n = 0;
    for (const r of stada()) {
      if (r.stada !== 'úrelt' && r.stada !== 'vantar') continue;
      const frumrit = les(agentPath(r.repo, r.nafn));
      fs.writeFileSync(path.join(AGENTS_DIR, r.nafn + '.md'), bytaAfrit(frumrit, r.repo, r.nafn, dags), 'utf8');
      console.log(`samstillt  ${r.nafn} ← ${r.repo} (${r.stada})`);
      n++;
    }
    console.log(`\n${n} afrit skrifuð.`);
    prenta(stada());
  } else if (arg === '--hreinsa') {
    let n = 0;
    for (const r of stada()) {
      if (r.stada !== 'munaðarlaust') continue;
      fs.unlinkSync(path.join(AGENTS_DIR, r.nafn + '.md'));
      console.log(`eytt  ${r.nafn}.md (munaðarlaust afrit)`);
      n++;
    }
    console.log(`\n${n} munaðarlausum eytt.`);
  } else {
    console.error('Notkun: node tools/sync-agents.cjs --check | --sync | --hreinsa');
    process.exit(2);
  }
}

main();
