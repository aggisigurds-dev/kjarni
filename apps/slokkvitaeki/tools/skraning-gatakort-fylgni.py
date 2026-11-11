# Afstilling hlutablaða ÁN ásamerkja (raflagnaleiðir R11x0-NN): blaðið er borið saman við hlutablað sama númers úr öðru fagi
# (t.d. M21x-NN, sem er stillt af eftir ásamerkjum) með FFT-fylgni arkitektagrunnsins; sami kvarði (1:50).
# Notkun: python -I lr_fylgni.py <stilling-viðmiðs.json> <mappa viðmiðs> <forskeyti viðmiðs, t.d. M216> <út.json> <blað.pdf> [...]
import sys, json, os, re
sys.path.append(r'C:\Users\Slokkvitaeki\AppData\Roaming\Python\Python314\site-packages')
import numpy as np, pymupdf
S = 1.5
TEIKN = pymupdf.Rect(40, 40, 2344, 1440)
def blek(pdf):
    pm = pymupdf.open(pdf)[0].get_pixmap(matrix=pymupdf.Matrix(S, S), clip=TEIKN, colorspace=pymupdf.csGRAY, alpha=False)
    a = np.frombuffer(pm.samples, dtype=np.uint8).reshape(pm.height, pm.width)
    return ((a > 120) & (a < 245)).astype(np.float32)          # aðeins grár arkitektagrunnur; svartar/hvítar línur fagsins detta út
vid = json.load(open(sys.argv[1], encoding='utf-8')); ut = {}
for f in sys.argv[5:]:
    nafn = os.path.basename(f)[5:-4]; nn = nafn.split('-')[1]; v = f'{sys.argv[3]}-{nn}'
    if v not in vid: print(nafn, 'ekkert viðmiðsblað', v); continue
    A = blek(os.path.join(sys.argv[2], f'NLSH-{v}.pdf')); B = blek(f)
    h, w = min(A.shape[0], B.shape[0]), min(A.shape[1], B.shape[1]); A = A[:h, :w] - A[:h, :w].mean(); B = B[:h, :w] - B[:h, :w].mean()
    c = np.fft.irfft2(np.fft.rfft2(A) * np.conj(np.fft.rfft2(B)), s=A.shape)
    iy, ix = np.unravel_index(np.argmax(c), c.shape); topp = float(c[iy, ix])
    c2 = c.copy(); c2[max(0, iy - 6):iy + 7, max(0, ix - 6):ix + 7] = 0
    annar = float(c2.max())
    if iy > h // 2: iy -= h
    if ix > w // 2: ix -= w
    sx, sy = ix / S, iy / S                                       # R-blað fært um (sx,sy) blað-pt fellur á viðmiðsblaðið
    q = vid[v]['q']
    ut[nafn] = {'q': q, 'dx': round(vid[v]['dx'] + q * sx, 2), 'dy': round(vid[v]['dy'] + q * sy, 2), 'hliðrun': [round(sx, 1), round(sy, 1)], 'styrkur': round(topp / (annar + 1e-9), 2), 'viðmið': v}
    print(nafn, ut[nafn])
json.dump(ut, open(sys.argv[4], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
