# Býr til lagmynd (PNG með gegnsæi) úr fagblaði í hnitakerfi grunnmyndar gatakortsins (CROP 230,265,1930×950 pt við 3 px/pt).
# Notkun: python -I pc_lag.py <fagblað.pdf> <q> <dx> <dy> <út.png> [prufa: x y w h í grunn-px]
# base_pt = q·lag_pt + (dx,dy). Bakgrunnur (ljósgrár arkitektagrunnur, hvítt) verður gegnsær; lagnir halda lit sínum.
import sys
sys.path.append(r'C:\Users\Slokkvitaeki\AppData\Roaming\Python\Python314\site-packages')
import numpy as np, pymupdf
from PIL import Image
pdf, q, dx, dy, ut = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4]), sys.argv[5]
S = 3.0; CX, CY, CW, CH = 230, 265, 1930, 950
x0, y0, w, h = (0, 0, CW * S, CH * S) if len(sys.argv) < 10 else [float(v) for v in sys.argv[6:10]]
clip = pymupdf.Rect((CX + x0 / S - dx) / q, (CY + y0 / S - dy) / q, (CX + (x0 + w) / S - dx) / q, (CY + (y0 + h) / S - dy) / q)
pm = pymupdf.open(pdf)[0].get_pixmap(matrix=pymupdf.Matrix(S * q, S * q), clip=clip, alpha=False)
a = np.frombuffer(pm.samples, dtype=np.uint8).reshape(pm.height, pm.width, 3).astype(np.int16)
if len(sys.argv) >= 11 and sys.argv[10] == 'hratt':
    Image.fromarray(a.astype(np.uint8)).save(ut); print(a.shape); sys.exit()
mx, mn = a.max(axis=2), a.min(axis=2)
litur = (mx - mn) > 40                      # litaðar lagnir
dokkt = mx < 110                            # svartar lagnir og tákn (arkitektagrunnur er ljósgrár)
alfa = np.where(litur, 255 - mn, np.where(dokkt, 255, np.clip((150 - mx) * 6, 0, 255))).astype(np.uint8)
import os
T = [int(os.environ.get('TINT','000000')[i:i+2],16) for i in (0,2,4)]
rgb = np.where(litur[..., None], a, np.array(T, dtype=np.int16)[None, None, :]).astype(np.uint8)
im = Image.fromarray(np.dstack([rgb, alfa]), 'RGBA')
im.save(ut, optimize=True)
print(im.size, 'þekja %', round(100 * float((alfa > 0).mean()), 2), 'litað %', round(100 * float(litur.mean()), 2))
