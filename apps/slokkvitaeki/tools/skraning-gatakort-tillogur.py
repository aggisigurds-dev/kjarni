# Tillögur að óskráðum loftræstiþéttingum: staðir þar sem loftræsistokkur fer gegnum RAUÐAN brunavegg á yfirlitsblaði hæðar, engin
# loftræstiskráning er innan radíuss, en SAMI staður á viðmiðunarhæð (t.d. 6H, sem er nær fullkláruð) á skráningu. Reiknar aðeins, skrifar ekkert í grunn.
# Kallað af skraning-gatakort-tillogur.cjs:
#   python -I skraning-gatakort-tillogur.py <yfirlitamappa> <lagamappa> <haed> <vidmid> <inn.json> <út.json> [radíus px = 30]
# inn.json: {"skr": {"5H": [[x, y], …], "6H": […]}, "til": [[x, y], …]}  — sýnd staða loftræstiskráninga á hvorri hæð; til = staðir á <haed> sem eiga
#   þegar áætlað gat eða (líka hafnaða) tillögu og fá því ekki nýja.
# Skurðklasi = samfelldur hópur pixla þar sem lagið (alfa > 60) er innan 4 px frá rauðum vegg. Klasi lengri en 60 px er stokkur MEÐFRAM vegg og er sleppt.
import sys, os, json, glob, math
sys.path.append(r'C:\Users\Slokkvitaeki\AppData\Roaming\Python\Python314\site-packages')
sys.stdout.reconfigure(encoding='utf-8')
import numpy as np, cv2
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
YF, LOG, HAED, VIDMID, INN, UT = sys.argv[1:7]; RAD = float(sys.argv[7]) if len(sys.argv) > 7 else 30.0
NAL = 25.0   # px: klasar á tveimur hæðum teljast sami staður innan þessa
inn = json.load(open(INN, encoding='utf-8'))
deild = lambda fx: 'S1' if fx < 0.179 else 'S2' if fx < 0.5 else 'S4' if fx < 0.812 else 'S5'
fjarl = lambda m: cv2.distanceTransform((~m).astype(np.uint8), cv2.DIST_L2, 5)
def klasar(haed):
    h = haed.lower(); g = np.asarray(Image.open(os.path.join(YF, f'yfirlit-{h}.jpg')).convert('RGB'), dtype=np.int16); Hh, W = g.shape[:2]
    rautt = (g[..., 0] > 190) & (g[..., 1] < 100) & (g[..., 2] < 100)
    lag = np.zeros((Hh, W), bool); skrar = glob.glob(os.path.join(LOG, f'lag-{h}-loftraesing-*.png'))
    if not skrar: raise SystemExit(f'Ekkert loftræsilag fyrir {haed} í {LOG}')
    for f in skrar: a = np.asarray(Image.open(f).convert('RGBA'))[..., 3] > 60; lag[:min(Hh, a.shape[0]), :min(W, a.shape[1])] |= a[:Hh, :W]
    kross = (fjarl(lag) <= 4) & (fjarl(rautt) <= 4)
    n, merki, stats, mid = cv2.connectedComponentsWithStats(cv2.dilate(kross.astype(np.uint8), np.ones((9, 9), np.uint8)), connectivity=8)
    P = np.array(inn['skr'].get(haed) or [[-9999, -9999]], dtype=float); ut = []
    for i in range(1, n):
        x, y, w, hh, _ = stats[i]
        if max(w, hh) > 60 or int((kross[y:y + hh, x:x + w] & (merki[y:y + hh, x:x + w] == i)).sum()) < 12: continue
        cx, cy = mid[i]; ut.append({'x': round(float(cx), 1), 'y': round(float(cy), 1), 'd': float(np.min(np.hypot(P[:, 0] - cx, P[:, 1] - cy))), 'deild': deild(cx / W)})
    return ut
kh, kv = klasar(HAED), klasar(VIDMID); til = inn.get('til') or []
ut = []; tal = {'klasar': len(kh), 'med_skraningu': 0, 'an': 0, 'vidmid_skrad': 0, 'vidmid_oskrad': 0, 'vidmid_enginn': 0, 'til_fyrir': 0}
for k in kh:
    if k['d'] <= RAD: tal['med_skraningu'] += 1; continue
    tal['an'] += 1
    q = min(kv, key=lambda v: math.hypot(v['x'] - k['x'], v['y'] - k['y'])) if kv else None
    if not q or math.hypot(q['x'] - k['x'], q['y'] - k['y']) > NAL: tal['vidmid_enginn'] += 1; continue
    if q['d'] > RAD: tal['vidmid_oskrad'] += 1; continue
    tal['vidmid_skrad'] += 1
    if any(math.hypot(t[0] - k['x'], t[1] - k['y']) <= RAD for t in til): tal['til_fyrir'] += 1; continue
    ut.append({'x': k['x'], 'y': k['y'], 'deild': k['deild'], 'naesta_m': round(k['d'] / 33.3, 1) if k['d'] < 9000 else None})
json.dump({'tal': tal, 'tillogur': ut}, open(UT, 'w', encoding='utf-8'))
print(json.dumps(tal))
