# LESAÐEINS. Hringtákn á grænum frárennslislögnum (4x flísar M115) + fjöldi arma (lagna sem ganga út frá hringnum).
# Endahringur = 1 armur (lögn endar í tækinu / gólfgatinu). Gatnamótahringur = 2+ armar (ekki skotmark).
# python hringir3.py -> ml/hringir.json
import sys, json, os
import numpy as np, cv2
from collections import Counter
from skoda import svaedi, K, BX, BY
HER = os.path.dirname(os.path.abspath(__file__))
W, H, M = 5790, 2850, 40
GW, GH = W * K, H * K
Gm = np.zeros((GH, GW), np.uint8)
def graent(t):
    B, G, R, A = [t[..., i].astype(int) for i in range(4)]
    return ((A > 60) & (G > 75) & (G - R > 35) & (G - B > 35)).astype(np.uint8)
got = []
for c in range(12):
    for r in range(6):
        if not os.path.exists(os.path.join(HER, '..', 'flisar', 'M115', f'{c}_{r}.png')): continue
        X0, Y0 = c * BX - M, r * BY - M
        t = svaedi(X0 / K, Y0 / K, (BX + 2 * M) / K, (BY + 2 * M) / K)
        g = graent(t)
        if g.sum() == 0: continue
        # í heildargrímu (án jaðars)
        y1, x1 = min(GH, (r + 1) * BY), min(GW, (c + 1) * BX)
        Gm[r * BY:y1, c * BX:x1] = g[M:M + (y1 - r * BY), M:M + (x1 - c * BX)]
        g0 = g
        for kk in (3, 5):
          g = cv2.morphologyEx(g0, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kk, kk)))
          n, lab, st, _ = cv2.connectedComponentsWithStats(g, connectivity=8)
          cs, hi = cv2.findContours(g, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
          if hi is None: continue
          for i, cn in enumerate(cs):
              if hi[0][i][3] == -1: continue
              a = cv2.contourArea(cn)
              if a < (10 if kk == 3 else 5) or a > 2500: continue
              (cx, cy), rad = cv2.minEnclosingCircle(cn)
              if not (M <= cx < BX + M and M <= cy < BY + M): continue
              py, px = cn[0][0][1], cn[0][0][0]; l = 0
              for dy in (-1, 0, 1):
                  for dx in (-1, 0, 1):
                      yy, xx = py + dy, px + dx
                      if 0 <= yy < g.shape[0] and 0 <= xx < g.shape[1] and lab[yy, xx]: l = lab[yy, xx]
              if l == 0: continue
              got.append((cx + X0, cy + Y0, a, a / (np.pi * rad * rad + 1e-6), rad, max(st[l, cv2.CC_STAT_WIDTH], st[l, cv2.CC_STAT_HEIGHT])))
got = np.array(got); ok = got[(got[:, 4] <= 22) & (got[:, 5] >= 30)]
notad = np.zeros(len(ok), bool); Hr = []
for i in np.argsort(-ok[:, 2]):
    if notad[i]: continue
    d = np.hypot(ok[:, 0] - ok[i, 0], ok[:, 1] - ok[i, 1]); m = (d <= 26) & ~notad; notad |= m
    w = ok[m, 2]; cx, cy = (ok[m, 0] * w).sum() / w.sum(), (ok[m, 1] * w).sum() / w.sum()
    rut = float((np.hypot(ok[m, 0] - cx, ok[m, 1] - cy) + ok[m, 4]).max())
    Hr.append({'X': cx, 'Y': cy, 'geirar': int(m.sum()), 'hringl': float(ok[m, 3].max()), 'rut': rut})
Hr = [h for h in Hr if h['geirar'] >= 2 or h['hringl'] >= 0.55]
Gd = cv2.dilate(Gm, np.ones((3, 3), np.uint8))
th = np.linspace(0, 2 * np.pi, 240, endpoint=False)
def armar(h, auka):
    R = h['rut'] + auka
    xs = np.clip(np.round(h['X'] + R * np.cos(th)).astype(int), 0, GW - 1); ys = np.clip(np.round(h['Y'] + R * np.sin(th)).astype(int), 0, GH - 1)
    v = Gd[ys, xs]
    if v.all(): return 9
    # fjöldi samfelldra grænna boga á hringnum
    return int(((v == 1) & (np.roll(v, 1) == 0)).sum())
for h in Hr:
    a = [armar(h, e) for e in (8, 11, 14)]
    h['armar'] = sorted(a)[1]   # miðgildi þriggja radíusa
    h['x'], h['y'] = h['X'] / K, h['Y'] / K
def deild(x): f = x / W; return 'S1' if f < 0.179 else 'S2' if f < 0.5 else 'S4' if f < 0.812 else 'S5'
for h in Hr: h['deild'] = deild(h['x'])
json.dump([{k: (round(v, 2) if isinstance(v, float) else v) for k, v in h.items() if k not in ('X', 'Y')} for h in Hr], open(os.path.join(HER, 'hringir.json'), 'w'))
print('hringir alls', len(Hr), '· armar:', dict(sorted(Counter(h['armar'] for h in Hr).items())))
for a in (1,):
    print('ENDAHRINGIR (1 armur) per deild:', dict(sorted(Counter(h['deild'] for h in Hr if h['armar'] == 1).items())), '· þar af niðurfallstákn (geiraskipt):', sum(1 for h in Hr if h['armar'] == 1 and h['geirar'] >= 2))
print('gatnamótahringir (2+ armar) per deild:', dict(sorted(Counter(h['deild'] for h in Hr if h['armar'] >= 2).items())), '· án arms:', sum(1 for h in Hr if h['armar'] == 0))
P = json.load(open(os.path.join(HER, 'gogn.json')))
hv = [p for p in P if p['uppruni'] == 'handvirkt']
for nafn, vel in (('allir hringir', Hr), ('endahringir', [h for h in Hr if h['armar'] == 1]), ('gatnamót', [h for h in Hr if h['armar'] >= 2])):
    hx = np.array([h['x'] for h in vel]); hy = np.array([h['y'] for h in vel])
    d = np.array([np.hypot(hx - p['x'], hy - p['y']).min() for p in hv])
    print(f'handfærðir {len(hv)} → {nafn} ({len(vel)}): miðgildi {np.median(d):.1f} px · ≤3: {(d<=3).sum()} ≤6: {(d<=6).sum()} ≤10: {(d<=10).sum()} ≤15: {(d<=15).sum()}')
print('búið')
