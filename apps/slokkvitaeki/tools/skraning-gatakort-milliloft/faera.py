# Færir milliloftspunkta á hringtákn frárennslis (M115) — AÐEINS öruggar færslur. Þurrkeyrsla nema --write.
# Regla (prófuð á 86 handfærslum Agnars á 5H S1, 18.11.2026: 45 af 46 sami hringur):
#   einn punktur á hring (lágmarksheildarfjarlægð, radíus 60 px) · hringurinn er NÆSTI hringur við punktinn · færsla 1–30 px ·
#   næstnæsti hringur a.m.k. 15 px fjær. Handfærðir punktar halda sínum hring og eru ekki snertir.
# 5H: allar deildir · 4H: aðeins S4/S5 (teikning 17; skannaða S1-S2 blaðið er of ónákvæmt).
# python faera.py [--write]
import sys, json, os, re, urllib.request, io, contextlib
import numpy as np
from collections import Counter
HER = os.path.dirname(os.path.abspath(__file__)); WRITE = '--write' in sys.argv
import importlib.util
sys.argv = ['x', '60']
spec = importlib.util.spec_from_file_location('para', os.path.join(HER, 'para.py')); m = importlib.util.module_from_spec(spec)
with contextlib.redirect_stdout(io.StringIO()): spec.loader.exec_module(m)
P, Hr, hx, hy = m.P, m.Hr, m.hx, m.hy
RMAX, FMAX, BIL = 60, 30, 15
ut = []; yfirlit = []
for haed, deildir in (('5H', ('S1', 'S2', 'S4', 'S5')), ('4H', ('S4', 'S5'))):
    pts = [p for p in P if p['haed'] == haed]
    tekid = set()
    for p in pts:
        if p['uppruni'] == 'handvirkt':
            dd = np.hypot(hx - p['x'], hy - p['y']); i = int(np.argmin(dd))
            if dd[i] <= 10: tekid.add(i)
    lausir = np.array([i for i in range(len(Hr)) if i not in tekid])
    for d in deildir:
        pd = [p for p in pts if p['deild'] == d and not p['faerdur']]
        if not pd: continue
        lz = lausir[(hx[lausir] > min(p['x'] for p in pd) - RMAX) & (hx[lausir] < max(p['x'] for p in pd) + RMAX)]
        par = m.para(pd, lambda p: (p['x'], p['y']), lz, RMAX)
        n_or = n_tv = n_langt = n_stutt = n_ekki = 0
        for p in pd:
            j = par.get(p['id'])
            if j is None: n_ekki += 1; continue
            dd = np.hypot(hx - p['x'], hy - p['y']); o = np.argsort(dd)
            f = float(dd[j])
            if f < 1: n_stutt += 1; continue
            tvib = np.hypot(hx - hx[j], hy - hy[j]) <= 8          # tvöfalt tákn telst einn staður
            adrir = dd[~tvib]
            if not tvib[o[0]] or (len(adrir) and adrir.min() - f < BIL): n_tv += 1; continue
            if f > FMAX: n_langt += 1; continue
            n_or += 1
            ut.append({'verk_id': 4, 'skraning_id': p['id'], 'teikning_id': p['yf'], 'x_px': round(float(hx[j]), 1), 'y_px': round(float(hy[j]), 1),
                       'fra_x': round(p['x'], 1), 'fra_y': round(p['y'], 1), 'uppruni': 'sjalfvirkt', '_f': round(f, 1), '_haed': haed, '_deild': d, '_nr': p['nr']})
        yfirlit.append((haed, d, len(pd), n_or, n_tv, n_langt, n_ekki, n_stutt))
print('hæð deild | ófærðir | ÖRUGG færsla | tvírætt | of langt | enginn hringur | þegar á hring')
for r in yfirlit: print(f'{r[0]}  {r[1]}   | {r[2]:7d} | {r[3]:12d} | {r[4]:7d} | {r[5]:8d} | {r[6]:14d} | {r[7]:5d}')
f = np.array([u['_f'] for u in ut]); print(f'ALLS öruggar færslur: {len(ut)} · miðgildi {np.median(f):.1f} px ({np.median(f)*0.029:.2f} m) · mest {f.max():.1f} px')
assert len({(u['skraning_id'], u['teikning_id']) for u in ut}) == len(ut)
assert len({(u['teikning_id'], u['x_px'], u['y_px']) for u in ut}) == len(ut), 'tveir punktar á sama hring'
json.dump(ut, open(os.path.join(HER, 'faerslur-skrifa.json'), 'w'))
if not WRITE: print('ÞURRKEYRSLA — ekkert skrifað'); sys.exit(0)
env = {}
for l in open('C:/Users/Slokkvitaeki/luna-bridge/.env', encoding='utf8'):
    mm = re.match(r'^\s*([A-Z0-9_]+)\s*=\s*(.*)$', l)
    if mm: env[mm[1]] = mm[2].strip().strip('"').strip("'")
U, K = env['SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']
radir = [{k: v for k, v in u.items() if not k.startswith('_')} for u in ut]
for i in range(0, len(radir), 200):
    rq = urllib.request.Request(U + '/rest/v1/skr_faerslur', data=json.dumps(radir[i:i + 200]).encode(), method='POST',
                                headers={'apikey': K, 'Authorization': 'Bearer ' + K, 'Content-Type': 'application/json', 'Prefer': 'return=minimal'})
    urllib.request.urlopen(rq)
print('SKRIFAÐ:', len(radir), 'færslur (uppruni sjalfvirkt)')
