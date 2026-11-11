# Afstilling hlutablaða (1:50) á brunayfirlit út frá ásamerkjum: base = q·blað + (dx,dy), í sýndum (snúnum) pt-hnitum.
# Notkun: python -I lr_stilla.py <brunayfirlit.pdf> <út.json> <blað.pdf> [...]
import sys, re, json, os
sys.path.append(r'C:\Users\Slokkvitaeki\AppData\Roaming\Python\Python314\site-packages')
import pymupdf
def merki(pdf):
    pg = pymupdf.open(pdf)[0]; M = pg.rotation_matrix
    b, t = [], []
    for x0, y0, x1, y1, w, *_ in pg.get_text('words'):
        p = pymupdf.Point((x0 + x1) / 2, (y0 + y1) / 2) * M
        if re.fullmatch(r'[A-Z]', w): b.append((w, p.x, p.y))
        elif re.fullmatch(r'\d{1,2}', w): t.append((w, p.x, p.y))
    return b, t
def lina(m, i):
    # stærsti hópur merkja á sömu línu (hnit i innan ±2 pt), hvert merki einu sinni
    best = []
    for _, *p in m:
        h = {}
        for w, *q in m:
            if abs(q[i] - p[i]) <= 2 and w not in h: h[w] = q[1 - i]
        if len(h) > len(best): best = sorted(h.items(), key=lambda kv: kv[1])
    return dict(best)
def fit(par):
    # minnstu kvaðrata lína y = q·x + d
    n = len(par); sx = sum(x for x, _ in par); sy = sum(y for _, y in par)
    sxx = sum(x * x for x, _ in par); sxy = sum(x * y for x, y in par)
    q = (n * sxy - sx * sy) / (n * sxx - sx * sx); d = (sy - q * sx) / n
    return q, d, max(abs(q * x + d - y) for x, y in par)
gb, gt = merki(sys.argv[1]); GX = lina(gb, 1); GY = lina(gt, 0)   # bókstafir á sömu y-línu → x; tölur á sömu x-línu → y
print('grunnur: bókstafir', len(GX), 'tölur', len(GY))
ut = {}
for f in sys.argv[3:]:
    b, t = merki(f); X = lina(b, 1); Y = lina(t, 0)
    px = [(X[k], GX[k]) for k in X if k in GX]; py = [(Y[k], GY[k]) for k in Y if k in GY]
    nafn = os.path.basename(f)[5:12]
    if len(px) < 2 or len(py) < 2: print(nafn, 'VANTAR MERKI', sorted(X), sorted(Y)); continue
    def hreinsa(par):
        # halda aðeins merkjum sem falla í stærsta hóp hliðrana miðað við q = 0.2 (aukatölur á sömu línu detta út)
        d = [g - 0.2 * x for x, g in par]
        best = max(([p for p, dd in zip(par, d) if abs(dd - d0) < 1.5] for d0 in d), key=len)
        return best
    px, py = hreinsa(px), hreinsa(py)
    if len(px) < 2 or len(py) < 2: print(nafn, 'OF FÁ MERKI EFTIR HREINSUN'); continue
    qx, dx, rx = fit(px); qy, dy, ry = fit(py)
    ut[nafn] = {'q': round((qx + qy) / 2, 5), 'qx': round(qx, 5), 'qy': round(qy, 5), 'dx': round(dx, 2), 'dy': round(dy, 2), 'ásar': f'{len(px)}+{len(py)}', 'frávik': round(max(rx, ry), 2)}
    print(nafn, ut[nafn])
json.dump(ut, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
