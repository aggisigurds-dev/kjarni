# Finnur hliðrun og kvarða fagblaðs miðað við brunayfirlit með FFT-fylgni í fjórum gluggum (hornum hússins).
# Notkun: python -I pc_stilla.py <brunayfirlit.pdf> <fagblað.pdf> [...]
import sys, json
sys.path.append(r'C:\Users\Slokkvitaeki\AppData\Roaming\Python\Python314\site-packages')
import numpy as np, pymupdf
S = 2.0
def blek(pdf, mork):
    pg = pymupdf.open(pdf)[0]
    pm = pg.get_pixmap(matrix=pymupdf.Matrix(S, S), colorspace=pymupdf.csGRAY, alpha=False)
    a = np.frombuffer(pm.samples, dtype=np.uint8).reshape(pm.height, pm.width)
    return (a < mork).astype(np.float32)
def hlidrun(g, l, x0, y0, n=1024, leit=260):
    # g = grunnur, l = lag; gluggi n×n (px við S) með horn í (x0,y0). Skilar (dx, dy, styrkur): lag þarf að færast um (dx,dy) px.
    A = g[y0:y0 + n, x0:x0 + n]; B = l[y0:y0 + n, x0:x0 + n]
    A = A - A.mean(); B = B - B.mean()
    c = np.fft.irfft2(np.fft.rfft2(A) * np.conj(np.fft.rfft2(B)), s=A.shape)
    c = np.fft.fftshift(c); m = n // 2
    sv = c[m - leit:m + leit + 1, m - leit:m + leit + 1]
    iy, ix = np.unravel_index(np.argmax(sv), sv.shape)
    topp = sv[iy, ix]; annar = np.partition(sv.ravel(), -200)[-200]
    return ix - leit, iy - leit, float(topp / (abs(annar) + 1e-9))
grunnur = blek(sys.argv[1], 200)
for f in sys.argv[2:]:
    lag = blek(f, 238)
    H, W = grunnur.shape
    # gluggar: vinstri/hægri × efri/neðri hluti hússins (CROP 230..2160 × 265..1215 pt)
    gl = {'VE': (300, 330), 'VN': (300, 800), 'HE': (1650, 330), 'HN': (1650, 800)}
    ut = {}
    for k, (px, py) in gl.items():
        dx, dy, st = hlidrun(grunnur, lag, int(px * S), int(py * S))
        ut[k] = (dx / S, dy / S, round(st, 2))
    # kvarði úr mun vinstri/hægri (x) og efri/neðri (y); miðjur glugga eru 1350 pt og 470 pt í sundur
    kx = 1 + ((ut['HE'][0] + ut['HN'][0]) - (ut['VE'][0] + ut['VN'][0])) / 2 / 1350
    ky = 1 + ((ut['VN'][1] + ut['HN'][1]) - (ut['VE'][1] + ut['HE'][1])) / 2 / 470
    print(f.split('/')[-1][-16:], json.dumps(ut), 'kx', round(kx, 5), 'ky', round(ky, 5))
