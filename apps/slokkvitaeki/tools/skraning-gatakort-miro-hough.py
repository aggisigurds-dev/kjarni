# Stillir Miro-ramma af ÁN skjámyndar: finnur kvarða og hliðrun sem leggja flest merki ofan á skurðpunkta lags og rauðra
# brunaveggja (atkvæðagreiðsla: hvert par merki–skurðpunktur kýs hliðrun; toppurinn er rétta hliðrunin).
# Notkun: python -I miro_hough.py <yfirlit.jpg> <lag.png> <merki.json (borðhnit)> <loganir, t.d. cross> <x0> <x1 grunnskurðar> <s0> <s1> <skref> <út.json> [y-mörk flísa í borðhnitum ...]
import sys, json, math
sys.path.append(r'C:\Users\Slokkvitaeki\AppData\Roaming\Python\Python314\site-packages')
import numpy as np
from PIL import Image, ImageFilter
Image.MAX_IMAGE_PIXELS = None
grunnur = Image.open(sys.argv[1]).convert('RGB'); lag = Image.open(sys.argv[2]).convert('RGBA')
d = json.load(open(sys.argv[3], encoding='utf-8')); loganir = sys.argv[4].split(',')
X0, X1 = int(sys.argv[5]), int(sys.argv[6]); s0, s1, ds = float(sys.argv[7]), float(sys.argv[8]), float(sys.argv[9])
mork = [float(v) for v in sys.argv[11:]]
g = np.asarray(grunnur.crop((X0, 0, X1, grunnur.height)), dtype=np.int16)
rautt = (g[..., 0] > 190) & (g[..., 1] < 100) & (g[..., 2] < 100)
rd = np.asarray(Image.fromarray((rautt * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(9))) > 0
a = np.asarray(lag.crop((X0, 0, X1, lag.height)))[..., 3] > 60
kross = rd & a
kd = np.asarray(Image.fromarray((kross * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(15))) > 0
H, W = kd.shape; merkt = np.zeros((H, W), bool); K = []
for y, x in zip(*[v.tolist() for v in np.nonzero(kd)]):
    if merkt[y, x]: continue
    st = [(y, x)]; merkt[y, x] = True; sx = sy = c = 0
    while st:
        cy, cx = st.pop()
        if kross[cy, cx]: sx += cx; sy += cy; c += 1
        for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
            if 0 <= ny < H and 0 <= nx < W and kd[ny, nx] and not merkt[ny, nx]: merkt[ny, nx] = True; st.append((ny, nx))
    if c >= 4: K.append((sx / c + X0, sy / c))
K = np.array(K)
M = np.array([(m['x'], m['y']) for m in d['form'] if m.get('logun') in loganir])
flis = np.array([sum(1 for b in mork if y >= b) for y in M[:, 1]])
print('skurðpunktar', len(K), 'merki', len(M), 'flísar', {int(k): int((flis == k).sum()) for k in set(flis.tolist())})
BIN = 10
def kjosa(P, s):
    # hliðrun t = K − s·P fyrir öll pör; 2D súlurit með 10 px reitum, sléttað 3×3
    tx = (K[:, 0][None, :] - s * P[:, 0][:, None]).ravel(); ty = (K[:, 1][None, :] - s * P[:, 1][:, None]).ravel()
    x_lo, y_lo = tx.min(), ty.min()
    hx = ((tx - x_lo) / BIN).astype(int); hy = ((ty - y_lo) / BIN).astype(int)
    h = np.zeros((hy.max() + 3, hx.max() + 3), np.float32); np.add.at(h, (hy + 1, hx + 1), 1)
    hs = sum(np.roll(np.roll(h, i, 0), j, 1) for i in (-1, 0, 1) for j in (-1, 0, 1))
    iy, ix = np.unravel_index(np.argmax(hs), hs.shape)
    return float(hs[iy, ix]), x_lo + (ix - 1 + 0.5) * BIN, y_lo + (iy - 1 + 0.5) * BIN, float(np.partition(hs.ravel(), -400)[-400])
best = None; s = s0
while s <= s1 + 1e-9:
    tot = 0; nidur = []
    for k in sorted(set(flis.tolist())):
        t, tx, ty, bak = kjosa(M[flis == k], s); tot += t; nidur.append((int(k), round(tx, 1), round(ty, 1), t, bak))
    if not best or tot > best[0]: best = (tot, s, nidur)
    print(round(s, 4), int(tot), [(n[0], int(n[3]), round(n[4], 1)) for n in nidur]); s += ds
tot, s, nidur = best
# fínstilling: miðgildi hliðrunar þeirra para sem falla innan 25 px frá toppi
ut = {'s': s, 'flisar': []}
for k, tx, ty, t, bak in nidur:
    P = M[flis == k]; dx = (K[:, 0][None, :] - s * P[:, 0][:, None]); dy = (K[:, 1][None, :] - s * P[:, 1][:, None])
    nal = (np.abs(dx - tx) < 25) & (np.abs(dy - ty) < 25)
    fx, fy = float(np.median(dx[nal])), float(np.median(dy[nal]))
    hitt = int((np.hypot(dx - fx, dy - fy).min(axis=1) < 20).sum())
    ut['flisar'].append({'k': k, 'tx': round(fx, 1), 'ty': round(fy, 1), 'merki': int(len(P)), 'innan_20px': hitt, 'toppur': t, 'bakgrunnur': round(bak, 1)})
    print('flís', k, 'hliðrun', round(fx, 1), round(fy, 1), 'merki innan 20 px frá skurðpunkti:', hitt, 'af', len(P), '· toppur', t, 'bakgrunnur', round(bak, 1))
print('BEST s', round(s, 4))
json.dump(ut, open(sys.argv[10], 'w'), indent=1)
