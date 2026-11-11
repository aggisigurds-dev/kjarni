# Gatakort NLSH — skarpar FLÍSAR (4× upplausn grunnmyndar) af brunayfirliti og fagteikningalögum (11.11.2026).
#
# Grunnmynd gatakortsins er 3 px/pt (5790×2850). Þegar stækkað er langt inn verður hún gróf, svo kortið hleður flísum í
# 12 px/pt (23160×11400 = 12×6 flísar, hver 1930×1900 px) aðeins fyrir það sem sést. Hver flís er teiknuð beint úr PDF —
# aldrei öll myndin í minni. Sama afstilling og sömu síur og í -lagmynd.py / -skeyta.py / -skeyta-lit.py.
#
#   python -I skraning-gatakort-flisar.py <stilling.json> <útmappa> [nafn lags ...]
#
# stilling.json: { "<nafn>": { "hamur": "grunnur|blek|stokkar|litur|dokkt", "tint": "RRGGBB", "blod": [ {"pdf", "q", "dx", "dy", "hluti": bool} ] } }
#   base_pt = q·blað_pt + (dx,dy);  hluti = true → aðeins teiknisvæði hlutablaðs (án nafnreits).
# Úttak: <útmappa>/<nafn>/<dálkur>_<röð>.png|jpg og <útmappa>/<nafn>.json (hvaða flísar eru til; tómum er sleppt).
import sys, json, os, math
sys.path.append(r'C:\Users\Slokkvitaeki\AppData\Roaming\Python\Python314\site-packages')
import numpy as np, pymupdf
from PIL import Image, ImageFilter
K, CX, CY, CW, CH = 12.0, 230, 265, 1930, 950
TW, TH, M = 1930, 1900, 16                      # flísastærð í px og spássía fyrir síur
DALKAR, RADIR = int(CW * K) // TW, int(CH * K) // TH
TEIKN = pymupdf.Rect(40, 40, 2344, 1440)
stilling = json.load(open(sys.argv[1], encoding='utf-8')); UT = sys.argv[2]; velja = sys.argv[3:]
sidur = {}
def sida(b, hamur):
    k = b['pdf']
    if k not in sidur:
        pg = pymupdf.open(k)[0]
        if hamur == 'dokkt':
            for x0, y0, x1, y1, *_ in pg.get_text('words'): pg.add_redact_annot(pymupdf.Rect(x0, y0, x1, y1))
            pg.apply_redactions(images=0, graphics=0)
        sidur[k] = pg
    return sidur[k]
def sia(m, f): return np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(f)) > 0
def flokka(a, hamur, tint):
    """a: (h,w,3) int16 → (rgb uint8, alfa uint8)"""
    mx, mn = a.max(axis=2), a.min(axis=2); r, g, b = a[..., 0], a[..., 1], a[..., 2]
    if hamur == 'blek':
        litur = (mx - mn) > 40; dokkt = mx < 110
        alfa = np.where(litur, 255 - mn, np.where(dokkt, 255, np.clip((150 - mx) * 6, 0, 255)))
        rgb = np.where(litur[..., None], a, np.array(tint, np.int16))
    elif hamur == 'stokkar':
        grar = (mx - mn) < 12
        d = sia(grar & (((mx >= 177) & (mx <= 183)) | ((mx >= 198) & (mx <= 202))), ImageFilter.MinFilter(5)); d = sia(d, ImageFilter.MaxFilter(5))
        l = sia(grar & (((mx >= 214) & (mx <= 217)) | ((mx >= 229) & (mx <= 231))), ImageFilter.MinFilter(5)); l = sia(l, ImageFilter.MaxFilter(5))
        alfa = np.where(d, 235, np.where(l, 205, 0)); rgb = np.where(d[..., None], np.array([15, 118, 110], np.int16), np.array([45, 212, 191], np.int16))
    elif hamur == 'litur':
        merking = (b > r + 40) & (np.abs(r - g) < 30); sky = (r > 220) & (np.abs(g - b) < 14) & (g > 75)
        m = ((mx - mn) > 60) & ~merking & ~sky; md = sia(m, ImageFilter.MaxFilter(3))
        # litur þykkingarinnar: næsti lagnapixill (hámarks-/lágmarkssía á litrásum grímunnar)
        lit = np.where(m[..., None], a, 0).astype(np.uint8); lit = np.dstack([np.asarray(Image.fromarray(lit[..., i]).filter(ImageFilter.MaxFilter(3))) for i in range(3)])
        alfa = np.where(md, 255, 0); rgb = lit
    elif hamur == 'dokkt':
        m = sia(mx < 90, ImageFilter.MaxFilter(3)); alfa = np.where(m, 240, 0); rgb = np.broadcast_to(np.array(tint, np.int16), a.shape)
    else: raise SystemExit('óþekktur hamur ' + hamur)
    return np.asarray(rgb).astype(np.uint8), np.asarray(alfa).astype(np.uint8)
for nafn, st in stilling.items():
    if velja and nafn not in velja: continue
    hamur = st['hamur']; tint = [int(st.get('tint', '000000')[i:i + 2], 16) for i in (0, 2, 4)]
    os.makedirs(os.path.join(UT, nafn), exist_ok=True); til = []
    for r in range(RADIR):
        for c in range(DALKAR):
            # flís með spássíu í grunn-px (K) → grunn-pt
            gx0, gy0 = c * TW - M, r * TH - M; W, H = TW + 2 * M, TH + 2 * M
            rgb = np.full((H, W, 3), 255, np.uint8) if hamur == 'grunnur' else np.zeros((H, W, 3), np.uint8); alfa = np.zeros((H, W), np.uint8)
            for b in st['blod']:
                q = b['q']; pg = sida(b, hamur)
                bx0, by0 = (CX + gx0 / K - b['dx']) / q, (CY + gy0 / K - b['dy']) / q
                clip = pymupdf.Rect(bx0, by0, bx0 + W / (K * q), by0 + H / (K * q))
                I = clip & (TEIKN if b.get('hluti') else pg.rect)
                if I.is_empty or I.width < 0.5 or I.height < 0.5: continue
                pm = pg.get_pixmap(matrix=pymupdf.Matrix(K * q, K * q), clip=I, alpha=False)
                a = np.frombuffer(pm.samples, dtype=np.uint8).reshape(pm.height, pm.width, 3)
                ox, oy = int(round((I.x0 - clip.x0) * K * q)), int(round((I.y0 - clip.y0) * K * q))
                h, w = min(a.shape[0], H - oy), min(a.shape[1], W - ox)
                if h <= 0 or w <= 0: continue
                if hamur == 'grunnur': rgb[oy:oy + h, ox:ox + w] = a[:h, :w]; alfa[oy:oy + h, ox:ox + w] = 255; continue
                rr, aa = flokka(a[:h, :w].astype(np.int16), hamur, tint)
                betri = aa > alfa[oy:oy + h, ox:ox + w]
                alfa[oy:oy + h, ox:ox + w] = np.where(betri, aa, alfa[oy:oy + h, ox:ox + w])
                rgb[oy:oy + h, ox:ox + w] = np.where(betri[..., None], rr, rgb[oy:oy + h, ox:ox + w])
            rgb, alfa = rgb[M:M + TH, M:M + TW], alfa[M:M + TH, M:M + TW]
            if hamur == 'grunnur':
                if not alfa.any(): continue
                Image.fromarray(rgb).save(os.path.join(UT, nafn, f'{c}_{r}.jpg'), quality=80, optimize=True)
            else:
                if (alfa > 20).mean() < 0.0004: continue           # tóm flís
                Image.fromarray(np.dstack([rgb, alfa]), 'RGBA').save(os.path.join(UT, nafn, f'{c}_{r}.png'), optimize=True)
            til.append(f'{c}_{r}')
    json.dump({'kvardi': int(K / 3), 'bx': TW, 'by': TH, 'dalkar': DALKAR, 'radir': RADIR, 'ending': 'jpg' if hamur == 'grunnur' else 'png', 'til': til}, open(os.path.join(UT, nafn + '.json'), 'w'))
    st_mb = sum(os.path.getsize(os.path.join(UT, nafn, f)) for f in os.listdir(os.path.join(UT, nafn))) / 2**20
    print(nafn, hamur, 'flísar', len(til), 'af', DALKAR * RADIR, f'· {st_mb:.1f} MB', flush=True)
    sidur.clear()
