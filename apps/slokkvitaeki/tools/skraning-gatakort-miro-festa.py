# Festir vörpuð Miro-merki við skurðpunkta LAGS (t.d. strengjabakka) og rauðra BRUNAVEGGJA á grunnmynd gatakortsins.
# Notkun: python -I miro_festa.py <yfirlit.jpg> <lag.png> <vörpuð.json> <út.json> <logun merkja> <radíus px> [prufumynd.jpg x y w h]
# Skurðpunktur = klasi pixla þar sem lagið (alfa > 60) liggur á eða innan 4 px frá rauðum vegg; klasar innan ~14 px renna saman.
# Hvert merki fær næsta lausa skurðpunkt innan radíuss (græðgisleg pörun eftir fjarlægð); annars heldur það Miro-staðnum.
import sys, json, math
sys.path.append(r'C:\Users\Slokkvitaeki\AppData\Roaming\Python\Python314\site-packages')
import numpy as np
from PIL import Image, ImageFilter, ImageDraw
Image.MAX_IMAGE_PIXELS = None
grunnur = Image.open(sys.argv[1]).convert('RGB'); lag = Image.open(sys.argv[2]).convert('RGBA')
d = json.load(open(sys.argv[3], encoding='utf-8')); logun, R = sys.argv[5], float(sys.argv[6])
merki = [m for m in d['merki'] if logun == 'allt' or m.get('logun') == logun]
x0 = int(min(m['bx'] for m in merki) - 200); x1 = int(max(m['bx'] for m in merki) + 200)
x0, x1 = max(0, x0), min(grunnur.width, x1)
g = np.asarray(grunnur.crop((x0, 0, x1, grunnur.height)), dtype=np.int16)
rautt = (g[..., 0] > 190) & (g[..., 1] < 100) & (g[..., 2] < 100)
rd = np.asarray(Image.fromarray((rautt * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(9))) > 0
a = np.asarray(lag.crop((x0, 0, x1, lag.height)))[..., 3] > 60
def klasaleit(kross):
    kd = np.asarray(Image.fromarray((kross * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(15))) > 0
    H, W = kd.shape; merkt = np.zeros((H, W), np.int32); kl = []
    ys, xs = np.nonzero(kd)
    for y, x in zip(ys.tolist(), xs.tolist()):
        if merkt[y, x]: continue
        st = [(y, x)]; merkt[y, x] = 1; sx = sy = c = 0
        while st:
            cy, cx = st.pop()
            if kross[cy, cx]: sx += cx; sy += cy; c += 1
            for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                if 0 <= ny < H and 0 <= nx < W and kd[ny, nx] and not merkt[ny, nx]: merkt[ny, nx] = 1; st.append((ny, nx))
        if c >= 4: kl.append((sx / c + x0, sy / c, c))
    return kl
def para(idx, kl, rad):
    par = sorted(((math.hypot(merki[i]['bx'] - k[0], merki[i]['by'] - k[1]), i, j) for i in idx for j, k in enumerate(kl) if math.hypot(merki[i]['bx'] - k[0], merki[i]['by'] - k[1]) <= rad))
    nm, nk = {}, set()
    for dist, i, j in par:
        if i in nm or j in nk: continue
        nm[i] = (j, dist); nk.add(j)
    return nm
klasar = klasaleit(rd & a)                                   # þrep 1: lag × rauður brunaveggur
# þrep 2: lag × svört vegglína grunnmyndar (veggir sem eru ekki rauðir á þessari útgáfu brunayfirlitsins)
svart = (g.max(axis=2) < 90)
sd = np.asarray(Image.fromarray((svart * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))) > 0
klasar2 = klasaleit(sd & a & ~rd)
print('skurðpunktar: lag × brunaveggur', len(klasar), '· lag × vegglína', len(klasar2), '· merki', len(merki))
n1 = para(range(len(merki)), klasar, R)
n2 = para([i for i in range(len(merki)) if i not in n1], klasar2, R)
ut = []
for i, m in enumerate(merki):
    if i in n1: j, dist = n1[i]; ut.append({**m, 'fx': round(klasar[j][0], 1), 'fy': round(klasar[j][1], 1), 'faersla_px': round(dist, 1), 'fest': 'brunaveggur'})
    elif i in n2: j, dist = n2[i]; ut.append({**m, 'fx': round(klasar2[j][0], 1), 'fy': round(klasar2[j][1], 1), 'faersla_px': round(dist, 1), 'fest': 'vegglina'})
    else: ut.append({**m, 'fx': m['bx'], 'fy': m['by'], 'faersla_px': 0, 'fest': None})
f = [u['faersla_px'] for u in ut if u['fest']]
print('fest á brunavegg:', sum(1 for u in ut if u['fest'] == 'brunaveggur'), 'á vegglínu:', sum(1 for u in ut if u['fest'] == 'vegglina'), 'ófest:', len(ut) - len(f), 'færsla px miðgildi', round(float(np.median(f)), 1) if f else '-', 'mest', max(f) if f else '-')
json.dump({'titill': d['titill'], 'merki': ut, 'skurdpunktar': len(klasar)}, open(sys.argv[4], 'w', encoding='utf-8'))
if len(sys.argv) > 11:
    im = grunnur.convert('RGBA'); hv = Image.new('RGBA', im.size, (255, 255, 255, 110)); im.alpha_composite(hv); im.alpha_composite(lag.crop((0, 0, im.width, im.height)))
    dr = ImageDraw.Draw(im)
    for k in klasar: dr.ellipse([k[0] - 4, k[1] - 4, k[0] + 4, k[1] + 4], fill=(0, 0, 0, 255))
    for u in ut:
        x, y, r = u['bx'], u['by'], 11; dr.polygon([(x, y - r), (x + r, y), (x, y + r), (x - r, y)], outline=(150, 150, 150, 255), width=2)
        if u['fest']:
            dr.line([(u['bx'], u['by']), (u['fx'], u['fy'])], fill=(0, 90, 200, 255), width=2)
            x, y, r = u['fx'], u['fy'], 13; dr.polygon([(x, y - r), (x + r, y), (x, y + r), (x - r, y)], outline=(0, 130, 40, 255) if u['fest'] == 'brunaveggur' else (0, 90, 220, 255), width=4)
        else:
            x, y, r = u['bx'], u['by'], 13; dr.polygon([(x, y - r), (x + r, y), (x, y + r), (x - r, y)], outline=(220, 0, 180, 255), width=4)
    px, py, pw, ph = [int(v) for v in sys.argv[8:12]]
    im.crop((px, py, px + pw, py + ph)).convert('RGB').save(sys.argv[7], quality=88)
