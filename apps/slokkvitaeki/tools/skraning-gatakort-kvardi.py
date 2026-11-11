# Leitar að kvarða q fagblaðs: fylgnitoppur á öllu blaðinu fyrir hvert q. Notkun: python -I pc_kvardi.py <grunnur.pdf> <lag.pdf> q0 q1 skref [S]
import sys
sys.path.append(r'C:\Users\Slokkvitaeki\AppData\Roaming\Python\Python314\site-packages')
import numpy as np, pymupdf
S = float(sys.argv[6]) if len(sys.argv) > 6 else 1.0
def blek(pdf, mork, s):
    pm = pymupdf.open(pdf)[0].get_pixmap(matrix=pymupdf.Matrix(s, s), colorspace=pymupdf.csGRAY, alpha=False)
    return (np.frombuffer(pm.samples, dtype=np.uint8).reshape(pm.height, pm.width) < mork).astype(np.float32)
g = blek(sys.argv[1], 200, S); g -= g.mean(); G = np.fft.rfft2(g)
q0, q1, d = float(sys.argv[3]), float(sys.argv[4]), float(sys.argv[5])
best = None; q = q0
while q <= q1 + 1e-9:
    l0 = blek(sys.argv[2], 238, S * q); l = np.zeros_like(g); h = min(g.shape[0], l0.shape[0]); w = min(g.shape[1], l0.shape[1]); l[:h, :w] = l0[:h, :w]; l -= l.mean()
    c = np.fft.irfft2(G * np.conj(np.fft.rfft2(l)), s=g.shape)
    iy, ix = np.unravel_index(np.argmax(c), c.shape); t = float(c[iy, ix])
    if iy > g.shape[0] // 2: iy -= g.shape[0]
    if ix > g.shape[1] // 2: ix -= g.shape[1]
    print(round(q, 4), round(ix / S, 2), round(iy / S, 2), round(t))
    if not best or t > best[0]: best = (t, q, ix / S, iy / S)
    q += d
print('BEST', best)
