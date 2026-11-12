# Rauður litur á ljósmyndum skráninga (12.11.2026): úðalagnir á NLSH eru rauðmálaðar, svo hlutfall rauðra díla á mynd er
# vísbending um úðakerfi (betri en nálægð á lagnateikningu). Myndirnar eru lesnar úr OKKAR geymslu (opna fatan „skraning“).
#   python skraning-gatakort-myndlitur.py <inn.json> <út.json> <grunnslóð fötu> [<sýnamappa>]
# inn.json: [{id, slodir:[…]}]   út.json: [{id, rautt}]  rautt = hæsta hlutfall rauðra díla yfir myndir skráningarinnar (0–1).
# Rauður díll: rauð rás stærst, mettun > 0,55, birta > 0,25 og litblær innan ±12° frá rauðum (|g−b| ≤ 0,2 × litstyrkur).
# Aðeins miðja myndarinnar (70 % × 70 %) er metin, svo rauðbrúnn bakgrunnur og rör í jaðri myndar vegi minna.
# Sýnamappa: vistar smámyndir (240 px) merktar hlutfallinu, til sjónrænnar rýni á þröskuldinum.
import sys, json, io, os, urllib.request
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from PIL import Image
INN, UT, GRUNNUR = sys.argv[1], sys.argv[2], sys.argv[3].rstrip('/')
SYNI = sys.argv[4] if len(sys.argv) > 4 else None

def rautt(slod):
    try:
        with urllib.request.urlopen(GRUNNUR + '/' + slod, timeout=40) as r: gogn = r.read()
        im = Image.open(io.BytesIO(gogn)).convert('RGB'); im.thumbnail((240, 240))
        a = np.asarray(im).astype(np.float32) / 255; r_, g_, b_ = a[..., 0], a[..., 1], a[..., 2]
        mx, mn = a.max(axis=2), a.min(axis=2); c = mx - mn
        m = (r_ >= mx - 1e-6) & (c > 0.55 * mx) & (mx > 0.25) & (np.abs(g_ - b_) <= 0.2 * c)
        hh, ww = m.shape; mid = m[int(hh * 0.15):int(hh * 0.85), int(ww * 0.15):int(ww * 0.85)]   # miðja myndarinnar: þéttingin sjálf, ekki bakgrunnur og jaðrar
        return float(mid.mean()), im
    except Exception:
        return None, None

def ein(p):
    best, mynd = None, None
    for s in p['slodir'][:2]:
        v, im = rautt(s)
        if v is not None and (best is None or v > best): best, mynd = v, im
    if SYNI and mynd is not None and p.get('syni'):
        mynd.save(os.path.join(SYNI, f"{best:.3f}_{p['id']}.jpg"), quality=80)
    return {'id': p['id'], 'rautt': None if best is None else round(best, 4)}

pp = json.load(open(INN, encoding='utf-8'))
if SYNI: os.makedirs(SYNI, exist_ok=True)
with ThreadPoolExecutor(12) as ex: ut = list(ex.map(ein, pp))
json.dump(ut, open(UT, 'w', encoding='utf-8'))
