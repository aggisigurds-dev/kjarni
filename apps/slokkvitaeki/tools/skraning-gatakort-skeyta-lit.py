# Skeytir hlutablöðum (1:50) saman í eitt gegnsætt lag í hnitum grunnmyndar gatakortsins — lagnir eftir LIT eða DÖKKU bleki.
# Notkun: python -I lr_skeyta2.py <hamur: litur|dokkt> <stilling.json> <mappa með NLSH-<nafn>.pdf> <út.png> [tint RRGGBB fyrir dokkt]
#   litur: litaðar lagnir halda sínum lit (vatnslagnablöð M115/M116: rautt, blátt, brúnt, grænt); svart, grátt og
#          dökkbláar/fjólubláar merkingar (r≈g, b hæst) detta út.
#   dokkt: texti er fjarlægður úr blaðinu (redaction) og svart blek situr eftir í einum lit (raflagnaleiðir R1150/R1160).
import sys, json, os, math
sys.path.append(r'C:\Users\Slokkvitaeki\AppData\Roaming\Python\Python314\site-packages')
import numpy as np, pymupdf
from PIL import Image, ImageFilter
hamur, stf, mappa, utskra = sys.argv[1:5]
TINT = [int((sys.argv[5] if len(sys.argv) > 5 else '000000')[i:i + 2], 16) for i in (0, 2, 4)]
S, CX, CY, CW, CH, N = 3.0, 230, 265, 1930, 950, 4
W, H = int(CW * S), int(CH * S)
cov = np.zeros((H, W), np.float32); lit = np.zeros((H, W, 3), np.float32)
TEIKN = pymupdf.Rect(40, 40, 2344, 1440)
def nidur(m, px, py):
    hh = math.ceil((m.shape[0] + py) / N) * N; ww = math.ceil((m.shape[1] + px) / N) * N
    f = np.zeros((hh, ww) + m.shape[2:], np.float32); f[py:py + m.shape[0], px:px + m.shape[1]] = m
    return f.reshape((hh // N, N, ww // N, N) + m.shape[2:]).mean(axis=(1, 3))
for nafn, st in sorted(json.load(open(stf, encoding='utf-8')).items()):
    q = st['q']; k = S * q * N
    pg = pymupdf.open(os.path.join(mappa, f'NLSH-{nafn}.pdf'))[0]
    if hamur == 'dokkt':
        for x0, y0, x1, y1, *_ in pg.get_text('words'): pg.add_redact_annot(pymupdf.Rect(x0, y0, x1, y1))
        pg.apply_redactions(images=0, graphics=0)
    pm = pg.get_pixmap(matrix=pymupdf.Matrix(k, k), clip=TEIKN, alpha=False)
    a = np.frombuffer(pm.samples, dtype=np.uint8).reshape(pm.height, pm.width, 3).astype(np.float32)
    mx, mn = a.max(axis=2), a.min(axis=2); r, g, b = a[..., 0], a[..., 1], a[..., 2]
    if hamur == 'litur':
        merking = (b > r + 40) & (np.abs(r - g) < 30)                     # dökkbláar merkingar og fjólubláar hurðalínur
        sky = (r > 220) & (np.abs(g - b) < 14) & (g > 75)                # bleikrauð breytingaský (lagnarautt er 248,56,40)
        m = ((mx - mn) > 60) & ~merking & ~sky
    else:
        m = mx < 90
    m = m.astype(np.float32)
    ox = int(round((q * TEIKN.x0 + st['dx'] - CX) * S * N)); oy = int(round((q * TEIKN.y0 + st['dy'] - CY) * S * N))
    c0 = nidur(m, ox % N, oy % N); rgb = nidur(a * m[..., None], ox % N, oy % N)
    # þykkja línur um einn hi-res pixil á hvorn veg svo mjóar lagnir hverfi ekki við smækkun; liturinn kemur úr óþykktu grímunni
    md = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3)), dtype=np.float32) / 255
    c = nidur(md, ox % N, oy % N)
    bx, by = ox // N, oy // N
    x0, y0 = max(0, bx), max(0, by); x1, y1 = min(W, bx + c.shape[1]), min(H, by + c.shape[0])
    if x1 <= x0 or y1 <= y0: print(nafn, 'utan grunnmyndar'); continue
    cs = c[y0 - by:y1 - by, x0 - bx:x1 - bx]; rs = rgb[y0 - by:y1 - by, x0 - bx:x1 - bx]; c0s = c0[y0 - by:y1 - by, x0 - bx:x1 - bx]
    betri = cs > cov[y0:y1, x0:x1]
    cov[y0:y1, x0:x1] = np.where(betri, cs, cov[y0:y1, x0:x1])
    lit[y0:y1, x0:x1] = np.where(betri[..., None], np.where(c0s[..., None] > 0.01, rs / np.maximum(c0s, 1e-6)[..., None], lit[y0:y1, x0:x1]), lit[y0:y1, x0:x1])
    print(nafn, 'þekja %', round(100 * float(m.mean()), 2))
alfa = np.clip(cov * (2.6 if hamur == 'litur' else 2.2), 0, 1)
rgb = lit if hamur == 'litur' else np.broadcast_to(np.array(TINT, np.float32), lit.shape)
im = Image.fromarray(np.dstack([rgb, alfa[..., None] * 255]).astype(np.uint8), 'RGBA')
im.save(utskra, optimize=True)
print(im.size, 'þekja %', round(100 * float((alfa > 0.05).mean()), 2), os.path.getsize(utskra) // 1024, 'kB')
