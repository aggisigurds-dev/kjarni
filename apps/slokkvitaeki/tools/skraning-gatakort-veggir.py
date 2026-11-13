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
# HURÐALÍNUR (Agnar 14.11.2026: „væri hægt að gera bláa línu í hurðagötin sem myndi kannski hjálpa kerfinu að nema gegnumtakastaðsetningarnar“ og
# „það er samt næstum því bara bein lína eftir öllum ganginum“): ofan við hurðir er veggurinn samfelldur, svo í lofthæð (þar sem stokkarnir fara) er
# gangveggurinn BEIN LÍNA þótt blaðið sýni hurðaop. Rauðir veggbútar í sömu línu (lárétt eða lóðrétt, innan 4 px) eru því tengdir saman: bil upp að 4,0 m
# alltaf, bil 4,0–6,6 m aðeins ef BLÁTT hurðartákn er við bilið. Línan þarf að eiga a.m.k. 2 m af rauðum vegg. Innri hurðir (milli gáttar og sjúkrastofu)
# fá ekki línu: þar er enginn rauður veggur í sömu línu. Bilin fara aftast í "seg" (kortið fer með þau sem vegg) og sér í "hurdir" (bláar línur á kortinu).
blatt = ((g[..., 2] > 150) & (g[..., 0] < 110) & (g[..., 1] < 110)).astype(np.uint8)
MINB, STUTT, LANGT, LINA_MIN = 15, 134, 220, 66; hurdir = []
for stefna in ('v', 'h'):
    but = []   # (hnit þvert á línuna, upphaf, endi) fyrir búta sem liggja eftir ásnum
    for x1, y1, x2, y2 in seg:
        dx, dy = abs(x2 - x1), abs(y2 - y1)
        if stefna == 'v' and dy >= 6 and dx <= 0.06 * dy + 1: but.append(((x1 + x2) / 2, min(y1, y2), max(y1, y2)))
        if stefna == 'h' and dx >= 6 and dy <= 0.06 * dx + 1: but.append(((y1 + y2) / 2, min(x1, x2), max(x1, x2)))
    but.sort(); hopar = []
    for c, u, e in but:
        if hopar and c - hopar[-1][0][0] <= 4: hopar[-1].append((c, u, e))
        else: hopar.append([(c, u, e)])
    for hp in hopar:
        c = int(round(float(np.median([q[0] for q in hp])))); bil = sorted((q[1], q[2]) for q in hp); sam = [list(bil[0])]
        for u, e in bil[1:]:
            if u - sam[-1][1] < MINB: sam[-1][1] = max(sam[-1][1], e)
            else: sam.append([u, e])
        if sum(e - u for u, e in sam) < LINA_MIN: continue
        for (u1, e1), (u2, e2) in zip(sam, sam[1:]):
            gl = u2 - e1
            if gl > LANGT: continue
            if gl > STUTT:
                bl = blatt[e1:u2, max(0, c - 16):c + 16] if stefna == 'v' else blatt[max(0, c - 16):c + 16, e1:u2]
                if int(bl.sum()) < 15: continue
            hurdir.append([c, int(e1), c, int(u2)] if stefna == 'v' else [int(e1), c, int(u2), c])
seg += hurdir
print(f'hurðalínur: {len(hurdir)} · lengd miðgildi {np.median([max(abs(a[2] - a[0]), abs(a[3] - a[1])) for a in hurdir]) / 33.3 if hurdir else 0:.2f} m')
print(f'{os.path.basename(inn)}: {W} × {Hh} · miðlína {int(bein.sum())} px · bútar {len(seg)} · þekja miðlínu {float((bein & (teikn > 0)).sum()) * 100 / max(1, int(bein.sum())):.1f} %')
os.makedirs(os.path.dirname(os.path.abspath(ut)), exist_ok=True)
json.dump({'w': W, 'h': Hh, 'seg': [v for s in seg for v in s], 'hurdir': [v for s in hurdir for v in s]}, open(ut, 'w'), separators=(',', ':'))
print('skrifað', ut, os.path.getsize(ut), 'bæti')
