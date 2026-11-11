# Skráir skjámynd af Miro-ramma (6H2S) á grunnmynd gatakortsins: finnur kvarða s og hliðrun, svo hliðrun hverrar flísar.
# Notkun: python -I miro_skra.py <skjámynd> <yfirlit-6h.jpg> <x0 grunnskurðar> <x1> <s0> <s1> <skref> [flísamiðjur í skjámyndar-px: x,y ...]
import sys, json
sys.path.append(r'C:\Users\Slokkvitaeki\AppData\Roaming\Python\Python314\site-packages')
import numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
def veggir(im):
    a = np.asarray(im.convert('RGB'), dtype=np.int16); r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx, mn = a.max(axis=2), a.min(axis=2)
    svart = (mx < 150) & ((mx - mn) < 40)
    rautt = (r > 180) & (r - g > 50) & (r - b > 50) & (np.abs(g - b) < 45)      # rauðir/bleikir brunaveggir (ekki appelsínugult)
    return (svart | rautt).astype(np.float32)
shot = Image.open(sys.argv[1]); base = Image.open(sys.argv[2])
X0, X1 = int(sys.argv[3]), int(sys.argv[4])
B = veggir(base.crop((X0, 0, X1, base.height)))
Hc, Wc = 4096, 2048
def a_striga(m):
    c = np.zeros((Hc, Wc), np.float32); h, w = min(Hc, m.shape[0]), min(Wc, m.shape[1]); c[:h, :w] = m[:h, :w]; return c - c.mean()
FB = np.fft.rfft2(a_striga(B))
def fylgni(M):
    c = np.fft.irfft2(FB * np.conj(np.fft.rfft2(a_striga(M))), s=(Hc, Wc))
    iy, ix = np.unravel_index(np.argmax(c), c.shape); t = float(c[iy, ix])
    if iy > Hc // 2: iy -= Hc
    if ix > Wc // 2: ix -= Wc
    return int(ix), int(iy), t
s0, s1, ds = float(sys.argv[5]), float(sys.argv[6]), float(sys.argv[7])
best = None; s = s0
while s <= s1 + 1e-9:
    M = veggir(shot.resize((round(shot.width * s), round(shot.height * s)), Image.LANCZOS))
    ix, iy, t = fylgni(M)
    if not best or t > best[0]: best = (t, s, ix, iy)
    print(round(s, 4), ix, iy, round(t)); s += ds
t, s, ix, iy = best
print('BEST s', round(s, 4), 'grunn-px = s·skjá-px + (', ix + X0, ',', iy, ')')
# flísar: klippa ræmu ±190 skjá-px um hverja miðju og mæla hliðrun hennar með föstu s
M = veggir(shot.resize((round(shot.width * s), round(shot.height * s)), Image.LANCZOS))
mid = [tuple(float(v) for v in p.split(',')) for p in sys.argv[8:]]
ut = {'s': s, 'heild': [ix + X0, iy], 'flisar': []}
for k, (cx, cy) in enumerate(mid):
    y0, y1 = max(0, int((cy - 190) * s)), min(M.shape[0], int((cy + 190) * s))
    R = np.zeros_like(M); R[y0:y1] = M[y0:y1]
    # leita aðeins innan ±40 px frá heildarhliðruninni (annars grípur ræman endurtekið mynstur annars staðar)
    c = np.fft.irfft2(FB * np.conj(np.fft.rfft2(a_striga(R))), s=(Hc, Wc))
    best2 = (-1e18, 0, 0)
    for dy in range(-40, 41):
        rod = c[(iy + dy) % Hc]
        for dx in range(-40, 41):
            v = rod[(ix + dx) % Wc]
            if v > best2[0]: best2 = (float(v), ix + dx, iy + dy)
    ft, fx, fy = best2
    ut['flisar'].append({'k': k + 1, 'midja_skja': [cx, cy], 'hlidrun': [fx + X0, fy], 'grunn_midja': [round(s * cx + fx + X0, 1), round(s * cy + fy, 1)]})
    print('flís', k + 1, 'hliðrun', fx + X0, fy, 'frávik frá heild', fx - ix, fy - iy)
json.dump(ut, open(sys.argv[1] + '.skra.json', 'w'), indent=1)
