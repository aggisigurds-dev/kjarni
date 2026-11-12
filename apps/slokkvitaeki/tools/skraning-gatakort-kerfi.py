# Lagnakerfi stálröraþéttinga (12.11.2026, Agnar: „brjóta aðeins upp og bjóða filter fyrir sprinklerkerfi“).
# Ajour flokkar stálrör aðeins eftir stærð; kerfið (úðakerfi / vatn og hiti / lyfjaloft) er lesið af lagnateikningunum:
# fyrir hvern punkt er mæld fjarlægð (px á yfirlitsblaðinu, 1 px ≈ 29 mm) að næstu lögn í hverju lagi; næsta lag ræður.
#   python skraning-gatakort-kerfi.py <lagamappa> <6h|5h> <inn.json> <út.json> <radíus px> [<yfirlit.jpg> <prufa.png> x y w h]
# inn.json: [{id, x, y}] í pixlum yfirlitsins.  út.json: [{id, kerfi, d, k2, d2, vafi}]
#   kerfi  'udi' | 'vatn' | 'lyfjaloft' | 'oflokkad' (engin lögn innan radíuss)
#   vafi   True ef næstnæsta kerfi er innan 6 px frá því næsta, eða næsta lögn er lengra en 15 px frá punktinum
# Lögin eru PNG með gegnsæi á sama pixlaneti og yfirlitið (lag-<hæð>-<nafn>-<blað>.png), sömu skrár og sjálfvirka færslan notar.
import sys, json, glob, os
import numpy as np
from PIL import Image, ImageDraw
Image.MAX_IMAGE_PIXELS = None
LOG, H, INN, UT, R = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], int(sys.argv[5])
PRUFA = sys.argv[6:]
LAG = {'udi': ['vatnsudi'], 'vatn': ['vatn-litur', 'vatnslagnir'], 'lyfjaloft': ['lyfjaloft']}
LITUR = {'udi': (29, 78, 216), 'vatn': (5, 150, 105), 'lyfjaloft': (168, 85, 247), 'oflokkad': (107, 114, 128)}

grimur = {}; skrar = {}
for k, nofn in LAG.items():
    a = None; fundid = []
    for nafn in nofn:
        for f in glob.glob(os.path.join(LOG, f'lag-{H}-{nafn}-*.png')):
            b = np.asarray(Image.open(f).convert('RGBA'))[..., 3] > 60
            a = b.copy() if a is None else (a[:min(a.shape[0], b.shape[0]), :min(a.shape[1], b.shape[1])] | b[:min(a.shape[0], b.shape[0]), :min(a.shape[1], b.shape[1])])
            fundid.append(os.path.basename(f))
    grimur[k] = a; skrar[k] = fundid
yy, xx = np.mgrid[-R:R + 1, -R:R + 1]; D = np.sqrt(xx * xx + yy * yy)

def fjarl(a, x, y):
    if a is None: return None
    hh, ww = a.shape; x0, y0 = int(round(x)), int(round(y))
    xa, xb, ya, yb = max(0, x0 - R), min(ww, x0 + R + 1), max(0, y0 - R), min(hh, y0 + R + 1)
    if xa >= xb or ya >= yb: return None
    sub = a[ya:yb, xa:xb]
    if not sub.any(): return None
    d = D[ya - (y0 - R):yb - (y0 - R), xa - (x0 - R):xb - (x0 - R)][sub].min()
    return float(d) if d <= R else None

punktar = json.load(open(INN, encoding='utf-8')); ut = []
for p in punktar:
    ds = sorted([(d, k) for k in LAG for d in [fjarl(grimur[k], p['x'], p['y'])] if d is not None])
    if not ds: ut.append({'id': p['id'], 'kerfi': 'oflokkad', 'd': None, 'k2': None, 'd2': None, 'vafi': True}); continue
    d, k = ds[0]; d2, k2 = ds[1] if len(ds) > 1 else (None, None)
    ut.append({'id': p['id'], 'kerfi': k, 'd': round(d, 1), 'k2': k2, 'd2': round(d2, 1) if d2 is not None else None, 'vafi': bool(d > 15 or (d2 is not None and d2 - d < 6))})
json.dump({'skrar': skrar, 'punktar': ut}, open(UT, 'w', encoding='utf-8'))

if len(PRUFA) >= 6:   # prufumynd: úðalögn blá, vatn grænt, lyfjaloft fjólublátt; punktar litaðir eftir kerfi (holur hringur = vafi)
    yf, skra, px, py, pw, ph = PRUFA[0], PRUFA[1], int(PRUFA[2]), int(PRUFA[3]), int(PRUFA[4]), int(PRUFA[5]); z = 3
    im = Image.open(yf).convert('RGB').crop((px, py, px + pw, py + ph)).convert('RGBA'); im.alpha_composite(Image.new('RGBA', im.size, (255, 255, 255, 150)))
    for k, a in grimur.items():
        if a is None: continue
        m = a[py:py + ph, px:px + pw]; lag = np.zeros((m.shape[0], m.shape[1], 4), np.uint8); lag[m] = (*LITUR[k], 200)
        t = Image.new('RGBA', im.size); t.paste(Image.fromarray(lag, 'RGBA'), (0, 0)); im.alpha_composite(t)
    im = im.resize((pw * z, ph * z), Image.LANCZOS); dr = ImageDraw.Draw(im); sk = {q['id']: q for q in ut}
    for p in punktar:
        if not (px <= p['x'] < px + pw and py <= p['y'] < py + ph): continue
        q = sk[p['id']]; x, y, c = (p['x'] - px) * z, (p['y'] - py) * z, LITUR[q['kerfi']]
        if q['vafi']: dr.ellipse((x - 7, y - 7, x + 7, y + 7), outline=c, width=3)
        else: dr.ellipse((x - 7, y - 7, x + 7, y + 7), fill=c, outline=(255, 255, 255), width=2)
    im.convert('RGB').save(skra)
