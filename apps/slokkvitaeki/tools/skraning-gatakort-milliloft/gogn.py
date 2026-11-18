# LESAÐEINS. Finnur enda grænna frárennslislagna í M115-laginu (5790 x 2850, sama hnitakerfi og yfirlit 5H/4H)
# og ber saman við handfærslur Agnars á milliloftspunktum (5H S1, 18.11.2026).
# python endar.py  -> skrifar ml/gogn.json, ml/endar.json, ml/profun-*.png
import sys, json, re, urllib.request, os
import numpy as np
HER = os.path.dirname(os.path.abspath(__file__))
LAG = os.path.join(HER, '..', 'raf', 'lag-5h-vatn-litur-M115-d3c610229127.png')
env = {}
for l in open('C:/Users/Slokkvitaeki/luna-bridge/.env', encoding='utf8'):
    m = re.match(r'^\s*([A-Z0-9_]+)\s*=\s*(.*)$', l)
    if m: env[m[1]] = m[2].strip().strip('"').strip("'")
U, K = env['SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']
def allt(p):
    ut, i = [], 0
    while True:
        r = urllib.request.Request(U + '/rest/v1/' + p, headers={'apikey': K, 'Authorization': 'Bearer ' + K, 'Range': f'{i}-{i + 999}'})
        d = json.load(urllib.request.urlopen(r)); ut += d
        if len(d) < 1000: return ut
        i += 1000

# ---------- gögn ----------
fl = [f['id'] for f in allt('skr_flokkar?select=id,heiti&heiti=ilike.G%C3%B3lf*')]
skr = allt('skr_skraningar?verk_id=eq.4&eytt=eq.false&flokkur_id=in.(%s)&select=id,radnr,ajour_serial,stada,teikning_id' % ','.join(map(str, fl)))
ids = {s['id']: s for s in skr}
hn = [h for h in allt('skr_haedarhnit?verk_id=eq.4&select=skraning_id,haed,x_px,y_px,faerdur,deild,yfirlit_id') if h['skraning_id'] in ids]
fa = {f['skraning_id']: f for f in allt('skr_faerslur?verk_id=eq.4&eytt=eq.false&select=id,skraning_id,teikning_id,x_px,y_px,fra_x,fra_y,uppruni') if f['skraning_id'] in ids}
P = []
for h in hn:
    if h['haed'] not in ('5H', '4H'): continue
    f = fa.get(h['skraning_id']); s = ids[h['skraning_id']]
    x, y = float(h['x_px']), float(h['y_px'])
    P.append({'id': h['skraning_id'], 'nr': s['ajour_serial'] or s['radnr'], 'haed': h['haed'], 'deild': h['deild'], 'yf': h['yfirlit_id'], 'x': x, 'y': y,
              'x0': float(f['fra_x']) if f else x, 'y0': float(f['fra_y']) if f else y, 'faerdur': bool(f), 'uppruni': f['uppruni'] if f else None})
json.dump(P, open(os.path.join(HER, 'gogn.json'), 'w'))
print('milliloftspunktar 5H/4H:', len(P), '· færðir:', sum(p['faerdur'] for p in P))

