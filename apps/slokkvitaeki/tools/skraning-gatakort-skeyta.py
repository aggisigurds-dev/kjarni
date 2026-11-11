# Skeytir hlutablöðum loftræsingar (1:50) saman í eitt gegnsætt lag í hnitum grunnmyndar gatakortsins.
# Notkun: python -I lr_skeyta.py <stilling.json úr lr_stilla.py> <mappa með NLSH-M21x-NN.pdf> <út.png>
# Aðeins fylltir stokkar sitja eftir; þunnar línur, texti og arkitektagrunnur detta út.
import sys, json, os, math
sys.path.append(r'C:\Users\Slokkvitaeki\AppData\Roaming\Python\Python314\site-packages')
import numpy as np, pymupdf
from PIL import Image, ImageFilter
S, CX, CY, CW, CH = 3.0, 230, 265, 1930, 950          # grunnmynd: px/pt og skurður brunayfirlits
N = 4                                                   # yfirsýnataka
W, H = int(CW * S), int(CH * S)
dokk = np.zeros((H, W), np.float32); ljos = np.zeros((H, W), np.float32)
stilling = json.load(open(sys.argv[1], encoding='utf-8'))
TEIKN = pymupdf.Rect(40, 40, 2344, 1440)               # teiknisvæði blaðs án nafnreits og ramma (sýnd hnit)
def opna(m, k=5):
    im = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(k)).filter(ImageFilter.MaxFilter(k))
    return np.asarray(im, dtype=np.float32) / 255
for nafn, st in sorted(stilling.items()):
    q = st['q']; k = S * q * N                          # hi-res px per blað-pt
    pm = pymupdf.open(os.path.join(sys.argv[2], f'NLSH-{nafn}.pdf'))[0].get_pixmap(matrix=pymupdf.Matrix(k, k), clip=TEIKN, alpha=False)
    a = np.frombuffer(pm.samples, dtype=np.uint8).reshape(pm.height, pm.width, 3).astype(np.int16)
    mx, mn = a.max(axis=2), a.min(axis=2); grar = (mx - mn) < 12
    # Fyllingar stokka eru flatir gráir litir: dökkir 180 eða 200, ljósir 214–215 eða 230 (mælt á öllum 36 blöðum).
    # Útveggjafylling er 211–212, arkitektalínur 170 og veggfyllingar 234/249/251 — þær detta út.
    mD = opna((grar & (((mx >= 177) & (mx <= 183)) | ((mx >= 198) & (mx <= 202)))).astype(np.float32))
    mL = opna((grar & (((mx >= 214) & (mx <= 217)) | ((mx >= 229) & (mx <= 231)))).astype(np.float32))
    # staðsetning efra vinstra horns í hi-res px grunnmyndar
    ox = int(round((q * TEIKN.x0 + st['dx'] - CX) * S * N)); oy = int(round((q * TEIKN.y0 + st['dy'] - CY) * S * N))
    for m, mark in ((mD, dokk), (mL, ljos)):
        px, py = ox % N, oy % N                         # fylla svo ristin falli á N-margfeldi
        hh = math.ceil((m.shape[0] + py) / N) * N; ww = math.ceil((m.shape[1] + px) / N) * N
        f = np.zeros((hh, ww), np.float32); f[py:py + m.shape[0], px:px + m.shape[1]] = m
        f = f.reshape(hh // N, N, ww // N, N).mean(axis=(1, 3))
        bx, by = ox // N, oy // N
        x0, y0 = max(0, bx), max(0, by); x1, y1 = min(W, bx + f.shape[1]), min(H, by + f.shape[0])
        if x1 > x0 and y1 > y0: mark[y0:y1, x0:x1] = np.maximum(mark[y0:y1, x0:x1], f[y0 - by:y1 - by, x0 - bx:x1 - bx])
    print(nafn, 'dökkt %', round(100 * float(mD.mean()), 2), 'ljóst %', round(100 * float(mL.mean()), 2))
TD, TL = np.array([15, 118, 110], np.float32), np.array([45, 212, 191], np.float32)   # dökkir og ljósir stokkar
alfa = np.maximum(dokk * 0.92, ljos * 0.8)
vD = (dokk >= ljos)[..., None]
rgb = np.where(vD, TD, TL)
im = Image.fromarray(np.dstack([rgb, alfa[..., None] * 255]).astype(np.uint8), 'RGBA')
im.save(sys.argv[3], optimize=True)
print(im.size, 'þekja %', round(100 * float((alfa > 0.05).mean()), 2), os.path.getsize(sys.argv[3]) // 1024, 'kB')
