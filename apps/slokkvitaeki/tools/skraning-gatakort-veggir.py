# Rauðir brunaveggir yfirlitsblaðs sem línubútar handa gatakortinu („hinn endinn“: liggur brunaveggur milli Ajour-staða tveggja skráninga?).
# Les yfirlitsmyndina, skrifar JSON {"w", "h", "seg": [x1, y1, x2, y2, x1, y1, …]} (flatt, px á blaðinu). Skrifar ekkert í grunn.
#   python -I skraning-gatakort-veggir.py <yfirlit.jpg> <út.json>
#   t.d. … <mappa>/yfirlit-5h.jpg app/kjarni/skraning/kort/veggir/yfirlit-5h.json   (KortClient hleður skrána eftir hæð og myndarheiti, sjá VEGGIR)
# Aðferð: rauður litur (R > 190, G og B < 100) → smáflekkir undir 40 px burt → þynnt í eins pixils miðlínu (Zhang–Suen) → Hough-línubútar í þremur
# umferðum (langir fyrst, svo það sem eftir stendur). Prentar hve stór hluti miðlínunnar er innan 1,5 px frá bút (13.11.2026: 96 % á 5H og 6H).
# Keyra aftur ef yfirlitsmynd er skipt út; hurðir í brunaveggjum (bláar á blaðinu) eru göt í línunum og eiga að vera það.
import sys, os, json
sys.path.append(r'C:\Users\Slokkvitaeki\AppData\Roaming\Python\Python314\site-packages')
sys.stdout.reconfigure(encoding='utf-8')
import numpy as np, cv2
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
inn, ut = sys.argv[1], sys.argv[2]
g = np.asarray(Image.open(inn).convert('RGB'), dtype=np.int16); Hh, W = g.shape[:2]
rautt = ((g[..., 0] > 190) & (g[..., 1] < 100) & (g[..., 2] < 100)).astype(np.uint8)
rautt = cv2.morphologyEx(rautt, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
n, lab, st, _ = cv2.connectedComponentsWithStats(rautt, 8); rautt[np.isin(lab, np.nonzero(st[:, cv2.CC_STAT_AREA] < 40)[0])] = 0   # texti og tákn


def thynna(m):
    """Zhang–Suen þynning með numpy (cv2.ximgproc er ekki alltaf til). m er 0/1."""
    m = m.copy().astype(np.uint8)
    while True:
        breytt = 0
        for skref in (0, 1):
            P = np.pad(m, 1); p2, p3, p4, p5, p6, p7, p8, p9 = P[:-2, 1:-1], P[:-2, 2:], P[1:-1, 2:], P[2:, 2:], P[2:, 1:-1], P[2:, :-2], P[1:-1, :-2], P[:-2, :-2]
            B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9; s = [p2, p3, p4, p5, p6, p7, p8, p9, p2]
            A = sum(((s[i] == 0) & (s[i + 1] == 1)).astype(np.uint8) for i in range(8))
            c = (m == 1) & (B >= 2) & (B <= 6) & (A == 1)
            c &= ((p2 * p4 * p6 == 0) & (p4 * p6 * p8 == 0)) if skref == 0 else ((p2 * p4 * p8 == 0) & (p2 * p6 * p8 == 0))
            breytt += int(c.sum()); m[c] = 0
        if not breytt: return m


try: bein = cv2.ximgproc.thinning(rautt * 255) > 0
except Exception: bein = thynna(rautt) > 0
seg = []; eftir = bein.astype(np.uint8) * 255
for thr, mn, gap in [(8, 8, 2), (5, 5, 1), (3, 3, 1)]:
    lin = cv2.HoughLinesP(eftir, 1, np.pi / 180, threshold=thr, minLineLength=mn, maxLineGap=gap)
    if lin is None: continue
    for x1, y1, x2, y2 in np.asarray(lin).reshape(-1, 4): seg.append([int(x1), int(y1), int(x2), int(y2)]); cv2.line(eftir, (int(x1), int(y1)), (int(x2), int(y2)), 0, 3)
teikn = np.zeros((Hh, W), np.uint8)
for x1, y1, x2, y2 in seg: cv2.line(teikn, (x1, y1), (x2, y2), 1, 3)
print(f'{os.path.basename(inn)}: {W} × {Hh} · miðlína {int(bein.sum())} px · bútar {len(seg)} · þekja miðlínu {float((bein & (teikn > 0)).sum()) * 100 / max(1, int(bein.sum())):.1f} %')
os.makedirs(os.path.dirname(os.path.abspath(ut)), exist_ok=True)
json.dump({'w': W, 'h': Hh, 'seg': [v for s in seg for v in s]}, open(ut, 'w'), separators=(',', ':'))
print('skrifað', ut, os.path.getsize(ut), 'bæti')
