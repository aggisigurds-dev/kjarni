# LESAÐEINS (þurrkeyrsla). Parar milliloftspunkta við hringtákn (einn punktur á hring, minnsta heildarfjarlægð innan RMAX).
# 1) PRÓF: allir 5H-punktar frá UPPHAFSSTÖÐU -> ber saman við hring sem Agnar valdi í handfærslum.
# 2) TILLAGA: ófærðir punktar (handfærðir halda sínum hring) -> ml/tillaga.json
# python para.py [RMAX]
import sys, json, os
import numpy as np
from collections import Counter
HER = os.path.dirname(os.path.abspath(__file__))
P0 = json.load(open(os.path.join(HER, 'gogn.json'))); Hr = json.load(open(os.path.join(HER, 'hringir.json')))
sed = set(); P = []
for p in P0:
    if (p['haed'], p['id']) in sed: continue
    sed.add((p['haed'], p['id'])); P.append(p)
hx = np.array([h['x'] for h in Hr]); hy = np.array([h['y'] for h in Hr]); hd = np.array([h['deild'] for h in Hr])
RMAX = float(sys.argv[1]) if len(sys.argv) > 1 else 45.0

def ungversk(C):   # lágmarkskostnaðarpörun, n <= m (e-maxx)
    n, m = C.shape; INF = 1e18
    u = [0.0] * (n + 1); v = [0.0] * (m + 1); p = [0] * (m + 1); way = [0] * (m + 1)
    for i in range(1, n + 1):
        p[0] = i; j0 = 0; minv = [INF] * (m + 1); used = [False] * (m + 1)
        while True:
            used[j0] = True; i0 = p[j0]; delta = INF; j1 = 0; Ci = C[i0 - 1]
            for j in range(1, m + 1):
                if not used[j]:
                    cur = Ci[j - 1] - u[i0] - v[j]
                    if cur < minv[j]: minv[j] = cur; way[j] = j0
                    if minv[j] < delta: delta = minv[j]; j1 = j
            for j in range(m + 1):
                if used[j]: u[p[j]] += delta; v[j] -= delta
                else: minv[j] -= delta
            j0 = j1
            if p[j0] == 0: break
        while True:
            j1 = way[j0]; p[j0] = p[j1]; j0 = j1
            if j0 == 0: break
    ut = [-1] * n
    for j in range(1, m + 1):
        if p[j]: ut[p[j] - 1] = j - 1
    return ut

def para(pts, xy, lausir, rmax):
    """pts: listi punkta; xy: (x, y) fall; lausir: vísar hringa sem má nota. Skilar {id: hringvísir} (aðeins innan rmax)."""
    if not pts or not len(lausir): return {}
    X = np.array([xy(p)[0] for p in pts]); Y = np.array([xy(p)[1] for p in pts])
    D = np.hypot(X[:, None] - hx[lausir][None, :], Y[:, None] - hy[lausir][None, :])
    C = np.where(D <= rmax, D, 1e6)
    C = np.hstack([C, np.full((len(pts), len(pts)), rmax + 0.01)])   # gervidálkar: „færist ekki"
    a = ungversk(C.tolist() and C)
    return {pts[i]['id']: int(lausir[j]) for i, j in enumerate(a) if 0 <= j < len(lausir) and D[i, j] <= rmax}

# ---------- 1) PRÓF ----------
for rmax in (30, 45, 60):
    for d in ('S1',):
        pts = [p for p in P if p['haed'] == '5H' and p['deild'] == d]
        lausir = np.nonzero(hd == d)[0]
        # deild punkts miðast við núverandi stöðu; hringir í sömu deild (+ allt innan rmax skiptir ekki máli við mörk)
        lausir = np.arange(len(Hr))[(hx > min(p['x0'] for p in pts) - rmax) & (hx < max(p['x0'] for p in pts) + rmax)]
        par = para(pts, lambda p: (p['x0'], p['y0']), lausir, rmax)
        hv = [p for p in pts if p['uppruni'] == 'handvirkt']
        rett = rangt = ekki = utan = 0; rangir = []
        for p in hv:
            dd = np.hypot(hx - p['x'], hy - p['y']); i = int(np.argmin(dd))
            if dd[i] > 10: utan += 1; continue
            j = par.get(p['id'])
            if j is None: ekki += 1; rangir.append((p['nr'], 'ópöruð', round(float(np.hypot(hx[i] - p['x0'], hy[i] - p['y0'])), 1)))
            elif np.hypot(hx[j] - hx[i], hy[j] - hy[i]) <= 8: rett += 1
            else: rangt += 1; rangir.append((p['nr'], 'annar hringur', round(float(np.hypot(hx[j] - hx[i], hy[j] - hy[i])), 1)))
        ofaerdir = [p for p in pts if not p['faerdur']]
        print(f'PRÓF 5H {d} rmax {rmax}: handfærðir {len(hv)} (þar af {utan} ekki á hring) · sami hringur og Agnar: {rett} · annar hringur: {rangt} · ópöruð: {ekki}'
              f' · ófærðir í deild {len(ofaerdir)}: pöruð {sum(1 for p in ofaerdir if p["id"] in par)}')
        if rmax == RMAX: print('   frávik:', rangir)

# ---------- 2) TILLAGA ----------
till = []
for haed in ('5H', '4H'):
    pts = [p for p in P if p['haed'] == haed]
    # handfærðir halda hring sínum (næsti innan 10 px)
    tekid = set()
    for p in pts:
        if p['uppruni'] == 'handvirkt':
            dd = np.hypot(hx - p['x'], hy - p['y']); i = int(np.argmin(dd))
            if dd[i] <= 10: tekid.add(i)
    fa = [p for p in pts if not p['faerdur']]
    lausir = np.array([i for i in range(len(Hr)) if i not in tekid])
    for d in ('S1', 'S2', 'S4', 'S5'):
        pd = [p for p in fa if p['deild'] == d]
        if not pd: continue
        lz = lausir[(hx[lausir] > min(p['x'] for p in pd) - RMAX) & (hx[lausir] < max(p['x'] for p in pd) + RMAX)]
        par = para(pd, lambda p: (p['x'], p['y']), lz, RMAX)
        fj = np.array([np.hypot(hx[par[p['id']]] - p['x'], hy[par[p['id']]] - p['y']) for p in pd if p['id'] in par])
        naest = np.array([np.sort(np.hypot(hx - p['x'], hy - p['y']))[0] for p in pd])
        print(f'TILLAGA {haed} {d}: ófærðir {len(pd)} · pöruð við hring {len(fj)} (miðgildi færslu {np.median(fj) if len(fj) else 0:.1f} px, ≤15: {(fj<=15).sum()}, 15–30: {((fj>15)&(fj<=30)).sum()}, >30: {(fj>30).sum()})'
              f' · enginn laus hringur innan {RMAX:.0f} px: {len(pd) - len(fj)} · þegar innan 3 px frá hring: {(naest<=3).sum()}')
        for p in pd:
            if p['id'] in par:
                j = par[p['id']]; f = float(np.hypot(hx[j] - p['x'], hy[j] - p['y']))
                till.append({'id': p['id'], 'nr': p['nr'], 'haed': haed, 'deild': d, 'yf': p['yf'], 'x0': p['x'], 'y0': p['y'], 'x': round(float(hx[j]), 1), 'y': round(float(hy[j]), 1), 'f': round(f, 1)})
json.dump(till, open(os.path.join(HER, 'tillaga.json'), 'w'))
print('tillaga alls', len(till), dict(Counter(t['haed'] for t in till)))
