# „Nemar“ gatakortsins: hvert gegnumtak lags (t.d. loftræsistokks) gegnum RAUÐAN brunavegg yfirlitsblaðs, með breidd stokksins meðfram veggnum.
# Agnar 13.11.2026: „gera rauða vegginn með einhvers konar nema … hann nemi sirka breiddina af rörunum sem fara í gegn“. Kortið tengir skráningu við nema
# ef sýnd staða hennar er innan breiddarinnar við vegginn, og hinn endinn telst aðeins skráning á SAMA nema hinum megin við vegginn.
#   python -I skraning-gatakort-nemar.py <yfirlit.jpg> <lag.png> <veggir.json> <út.json>
#   t.d. … yfirlit-5h.jpg lag-5h-loftraesing-M215.png app/kjarni/skraning/kort/veggir/yfirlit-5h.json app/kjarni/skraning/kort/nemar/loft-5h.json
# Út: {"nemar": [x, y, tx, ty, hb, x, y, …]} flatt — (x, y) á miðlínu veggjar, (tx, ty) einingarvigur meðfram vegg, hb = hálf breidd gegnumtaksins í px.
# Aðferð: pixlar þar sem lagið (alfa > 60) er innan 4 px frá rauðum vegg, tengdir hlutar (3×3 útvíkkun svo stokkar hlið við hlið haldist aðskildir);
# hlutum yfir 60 px (stokkur MEÐFRAM vegg) og undir 12 pixlum er sleppt; stefna veggjar = lengsti veggbútur (veggir.json) innan 6 px. Skrifar ekkert í grunn.
import sys, os, json
sys.path.append(r'C:\Users\Slokkvitaeki\AppData\Roaming\Python\Python314\site-packages')
sys.stdout.reconfigure(encoding='utf-8')
import numpy as np, cv2
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
YF, LAG, VEGGIR, UT = sys.argv[1:5]
seg = np.array(json.load(open(VEGGIR))['seg'], float).reshape(-1, 4)
g = np.asarray(Image.open(YF).convert('RGB'), dtype=np.int16); Hh, W = g.shape[:2]
rautt = (g[..., 0] > 190) & (g[..., 1] < 100) & (g[..., 2] < 100)
a = np.asarray(Image.open(LAG).convert('RGBA'))[..., 3] > 60
lag = np.zeros((Hh, W), bool); lag[:min(Hh, a.shape[0]), :min(W, a.shape[1])] = a[:Hh, :W]
fjarl = lambda m: cv2.distanceTransform((~m).astype(np.uint8), cv2.DIST_L2, 5)
kross = (fjarl(lag) <= 4) & (fjarl(rautt) <= 4)
n, merki, stats, _ = cv2.connectedComponentsWithStats(cv2.dilate(kross.astype(np.uint8), np.ones((3, 3), np.uint8)), connectivity=8)
dxs, dys = seg[:, 2] - seg[:, 0], seg[:, 3] - seg[:, 1]; Ls = np.maximum(np.hypot(dxs, dys), 1e-9); ut = []; hb = []
for i in range(1, n):
    x, y, w, hh, _ = stats[i]; ys, xs = np.nonzero(kross[y:y + hh, x:x + w] & (merki[y:y + hh, x:x + w] == i))
    if len(xs) < 12 or max(w, hh) > 60: continue
    xs = xs + x; ys = ys + y; cx, cy = xs.mean(), ys.mean()
    t = np.clip(((cx - seg[:, 0]) * dxs + (cy - seg[:, 1]) * dys) / (Ls * Ls), 0, 1); d = np.hypot(cx - seg[:, 0] - t * dxs, cy - seg[:, 1] - t * dys)
    if d.min() > 8: continue
    naer = np.nonzero(d <= max(6.0, d.min() + 1))[0]; j = int(naer[np.argmax(Ls[naer])]); tx, ty = dxs[j] / Ls[j], dys[j] / Ls[j]
    al = (xs - cx) * tx + (ys - cy) * ty; t0 = ((cx - seg[j, 0]) * dxs[j] + (cy - seg[j, 1]) * dys[j]) / (Ls[j] ** 2)
    ut += [round(float(seg[j, 0] + t0 * dxs[j]), 1), round(float(seg[j, 1] + t0 * dys[j]), 1), round(float(tx), 4), round(float(ty), 4), round(float(al.max() - al.min()) / 2, 1)]; hb.append(ut[-1])
print(f'{os.path.basename(LAG)} × {os.path.basename(YF)}: {len(hb)} nemar · hálf breidd: miðgildi {np.median(hb):.1f} px, 90 % {np.percentile(hb, 90):.1f} px (33,3 px = 1 m)')
os.makedirs(os.path.dirname(os.path.abspath(UT)), exist_ok=True)
json.dump({'nemar': ut}, open(UT, 'w'), separators=(',', ':')); print('skrifað', UT, os.path.getsize(UT), 'bæti')
