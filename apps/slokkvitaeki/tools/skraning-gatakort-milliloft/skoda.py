# LESAÐEINS. Setur saman svæði úr 4x flísum M115 og teiknar milliloftspunkta (handfærðir bláir, ófærðir svartir) yfir.
# python skoda.py x0 y0 w h nafn [haed]   (hnit í yfirlitspixlum)
import sys, json, os
import numpy as np, cv2
HER = os.path.dirname(os.path.abspath(__file__)); FL = os.path.join(HER, '..', 'flisar', 'M115'); K, BX, BY = 4, 1930, 1900
def svaedi(x0, y0, w, h):
    X0, Y0, Wd, Hd = int(x0 * K), int(y0 * K), int(w * K), int(h * K)
    ut = np.zeros((Hd, Wd, 4), np.uint8)
    for c in range(X0 // BX, (X0 + Wd - 1) // BX + 1):
        for r in range(Y0 // BY, (Y0 + Hd - 1) // BY + 1):
            f = os.path.join(FL, f'{c}_{r}.png')
            if not os.path.exists(f): continue
            t = cv2.imread(f, cv2.IMREAD_UNCHANGED)
            if t.shape[2] == 3: t = np.dstack([t, np.full(t.shape[:2], 255, np.uint8)])
            sx0, sy0 = max(X0, c * BX), max(Y0, r * BY); sx1, sy1 = min(X0 + Wd, c * BX + t.shape[1]), min(Y0 + Hd, r * BY + t.shape[0])
            if sx1 <= sx0 or sy1 <= sy0: continue
            ut[sy0 - Y0:sy1 - Y0, sx0 - X0:sx1 - X0] = t[sy0 - r * BY:sy1 - r * BY, sx0 - c * BX:sx1 - c * BX]
    return ut
if __name__ == '__main__':
    x0, y0, w, h = map(float, sys.argv[1:5]); nafn = sys.argv[5]; haed = sys.argv[6] if len(sys.argv) > 6 else '5H'
    t = svaedi(x0, y0, w, h); a = t[..., 3:4].astype(float) / 255
    c = (t[..., :3].astype(float) * a + 255 * (1 - a)).astype(np.uint8).copy()
    for p in json.load(open(os.path.join(HER, 'gogn.json'))):
        if p['haed'] != haed or not (x0 <= p['x'] < x0 + w and y0 <= p['y'] < y0 + h): continue
        A = (int((p['x'] - x0) * K), int((p['y'] - y0) * K)); B = (int((p['x0'] - x0) * K), int((p['y0'] - y0) * K))
        lit = (255, 0, 0) if p['uppruni'] == 'handvirkt' else (0, 0, 0)
        if p['faerdur']: cv2.line(c, B, A, lit, 1); cv2.circle(c, B, 3, lit, -1)
        cv2.rectangle(c, (A[0] - 9, A[1] - 9), (A[0] + 9, A[1] + 9), lit, 2)
    cv2.imwrite(os.path.join(HER, nafn), c); print(nafn, c.shape)
