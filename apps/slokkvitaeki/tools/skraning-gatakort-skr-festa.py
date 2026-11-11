# Færir SKRÁNINGAR gatakortsins á næsta skurðpunkt síns lags (loftræsting / lagnir / raflagnaleiðir) og brunaveggjar á yfirlitsblaðinu.
# Kallað af skraning-gatakort-skr-festa.cjs:
#   python -I skraning-gatakort-skr-festa.py <yfirlit.jpg> <lagamappa> <6h|5h> <inn.json> <út.json> <radíus px> [prufumynd.jpg x y w h]
# inn.json: [{id, x, y, hopur}] í pixlum yfirlitsins; hopur = loft | ror | rafmagn.
# Skurðpunktur = klasi pixla þar sem lagið (alfa > 60) liggur á eða innan 4 px frá RAUÐUM brunavegg (þrep 1). Punktur fær næsta skurðpunkt
# innan radíuss — margir punktar mega eiga sama skurðpunkt (tvö stök verk, sitt hvorum megin við vegg, eru ein lokun). Finnist enginn
# rauður veggur er leitað á svartri vegglínu (þrep 2: veggir sem eru ekki rauðir á Rev.A), en aðeins innan 20 px, svo punktur færist
# aldrei langt á vegg sem er ekki brunaveggur. Punkturinn lendir 5 px frá skurðpunktinum, sín megin við vegginn.
import sys, json, math, glob, os
sys.path.append(r'C:\Users\Slokkvitaeki\AppData\Roaming\Python\Python314\site-packages')
sys.stdout.reconfigure(encoding='utf-8')
import numpy as np
from PIL import Image, ImageFilter, ImageDraw
Image.MAX_IMAGE_PIXELS = None
YF, LOG, H, INN, UT, R = sys.argv[1], sys.argv[2], sys.argv[3].lower(), sys.argv[4], sys.argv[5], float(sys.argv[6])
R2, HLID = 20.0, 5.0
LAGSKRAR = {'loft': ['loftraesing'], 'ror': ['vatn-litur', 'vatnslagnir', 'vatnsudi', 'lyfjaloft'], 'rafmagn': ['raflagnaleidir']}
grunnur = Image.open(YF).convert('RGB'); W, Hh = grunnur.size
g = np.asarray(grunnur, dtype=np.int16)
rautt = (g[..., 0] > 190) & (g[..., 1] < 100) & (g[..., 2] < 100)
vikka = lambda m, n: np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(n))) > 0
rd = vikka(rautt, 9); sd = vikka(g.max(axis=2) < 90, 5)
def lag(hopur):
    a = np.zeros((Hh, W), bool); fundid = []
    for nafn in LAGSKRAR[hopur]:
        for f in glob.glob(os.path.join(LOG, f'lag-{H}-{nafn}-*.png')):
            b = np.asarray(Image.open(f).convert('RGBA'))[..., 3] > 60; a[:min(Hh, b.shape[0]), :min(W, b.shape[1])] |= b[:Hh, :W]; fundid.append(os.path.basename(f))
    return a, fundid
def klasaleit(kross):
    kd = vikka(kross, 15); merkt = np.zeros(kd.shape, bool); kl = []
    ys, xs = np.nonzero(kd)
    for y, x in zip(ys.tolist(), xs.tolist()):
        if merkt[y, x]: continue
        st = [(y, x)]; merkt[y, x] = True; sx = sy = c = 0
        while st:
            cy, cx = st.pop()
            if kross[cy, cx]: sx += cx; sy += cy; c += 1
            for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                if 0 <= ny < Hh and 0 <= nx < W and kd[ny, nx] and not merkt[ny, nx]: merkt[ny, nx] = True; st.append((ny, nx))
        if c >= 4: kl.append((sx / c, sy / c))
    return np.array(kl, dtype=float).reshape(-1, 2)
punktar = json.load(open(INN, encoding='utf-8')); ut = []; yfirlit = {}
for hopur in ('loft', 'ror', 'rafmagn'):
    pp = [p for p in punktar if p['hopur'] == hopur]
    if not pp: continue
    a, skrar = lag(hopur)
    if not skrar: print(f'{hopur}: ekkert lag fannst — sleppt'); ut += [{**p, 'fx': p['x'], 'fy': p['y'], 'd': 0, 'fest': None} for p in pp]; continue
    k1 = klasaleit(rd & a); k2 = klasaleit(sd & a & ~rd)
    P = np.array([[p['x'], p['y']] for p in pp], dtype=float); n1 = n2 = 0; fd = []
    def naest(K):
        if not len(K): return np.full(len(P), -1), np.full(len(P), 1e9)
        best = np.full(len(P), -1); bd = np.full(len(P), 1e9)
        for i in range(0, len(P), 500):   # í bútum svo minnið haldist lítið
            D = np.sqrt(((P[i:i + 500, None, :] - K[None, :, :]) ** 2).sum(-1)); j = D.argmin(1); best[i:i + 500] = j; bd[i:i + 500] = D[np.arange(len(j)), j]
        return best, bd
    j1, d1 = naest(k1); j2, d2 = naest(k2)
    for i, p in enumerate(pp):
        c = None
        if d1[i] <= R: c, fest, d = k1[j1[i]], 'brunaveggur', d1[i]; n1 += 1
        elif d2[i] <= R2: c, fest, d = k2[j2[i]], 'vegglina', d2[i]; n2 += 1
        if c is None: ut.append({**p, 'fx': p['x'], 'fy': p['y'], 'd': 0, 'fest': None}); continue
        # sín megin við vegginn: 5 px frá skurðpunktinum í átt að upprunalega staðnum (eða á honum sé punkturinn nær en það)
        # (fjarlægðin vex lítillega með upphaflegri fjarlægð, mest 12 px, svo mörg stök verk við sama gat leggist ekki hvert ofan á annað)
        hl = min(d, HLID - 1 + 0.2 * d); fx = c[0] + (p['x'] - c[0]) / d * hl if d > 0 else c[0]; fy = c[1] + (p['y'] - c[1]) / d * hl if d > 0 else c[1]
        faert = math.hypot(fx - p['x'], fy - p['y']); fd.append(faert)
        ut.append({**p, 'fx': round(float(fx), 1), 'fy': round(float(fy), 1), 'd': round(float(faert), 1), 'fest': fest})
    yfirlit[hopur] = {'punktar': len(pp), 'log': skrar, 'skurdpunktar_brunaveggur': int(len(k1)), 'skurdpunktar_vegglina': int(len(k2)), 'a_brunavegg': n1, 'a_vegglinu': n2, 'ofaerdir': len(pp) - n1 - n2,
                      'faersla_midgildi_px': round(float(np.median(fd)), 1) if fd else None, 'faersla_90_px': round(float(np.percentile(fd, 90)), 1) if fd else None, 'faersla_mest_px': round(float(max(fd)), 1) if fd else None}
ut += [{**p, 'fx': p['x'], 'fy': p['y'], 'd': 0, 'fest': None} for p in punktar if p['hopur'] not in LAGSKRAR]
json.dump({'yfirlit': yfirlit, 'punktar': ut}, open(UT, 'w', encoding='utf-8'))
if len(sys.argv) > 11:   # prufumynd: grár hringur = skráð staða, blá lína = færsla, grænn/blár punktur = ný staða (brunaveggur/vegglína), bleikur = ófærður
    px, py, pw, ph = [int(v) for v in sys.argv[8:12]]; z = 2
    im = grunnur.crop((px, py, px + pw, py + ph)).resize((pw * z, ph * z), Image.LANCZOS).convert('RGBA'); im.alpha_composite(Image.new('RGBA', im.size, (255, 255, 255, 90))); dr = ImageDraw.Draw(im)
    for u in ut:
        if not (px <= u['x'] <= px + pw and py <= u['y'] <= py + ph): continue
        x, y, fx, fy = (u['x'] - px) * z, (u['y'] - py) * z, (u['fx'] - px) * z, (u['fy'] - py) * z
        dr.ellipse([x - 5, y - 5, x + 5, y + 5], outline=(120, 120, 120, 255), width=2)
        if u['fest']: dr.line([(x, y), (fx, fy)], fill=(0, 90, 200, 255), width=2); dr.ellipse([fx - 4, fy - 4, fx + 4, fy + 4], fill=(0, 140, 50, 255) if u['fest'] == 'brunaveggur' else (0, 90, 220, 255))
        else: dr.ellipse([x - 4, y - 4, x + 4, y + 4], fill=(220, 0, 180, 255))
    im.convert('RGB').save(sys.argv[7], quality=88)
