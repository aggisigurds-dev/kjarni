# Ljósmyndaviðgerð — staðbundinn netþjónn

Keyrir á þinni eigin vél. Ekkert fer í skýið. Kjarni-síðan `/kjarni/artcraft/vidgerd`
talar við þennan netþjón yfir HTTP — sama mynstur og Einkastúdíó talar við
Automatic1111/Forge.

Notar: [GFPGAN](https://github.com/TencentARC/GFPGAN) (andlitsviðgerð),
[Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN) (áferð/skerping á allri
myndinni) og einfalda rauð-augna-leiðréttingu ofan á
[facexlib](https://github.com/xinntao/facexlib)'s andlitsgreiningu.

## Uppsetning

```sh
./setup.sh
```

Þetta býr til `.venv`, setur upp CPU-útgáfu af torch (skiptu út fyrir CUDA-slóð
í `setup.sh` ef þú átt GPU), og lagar eitt þekkt samhæfnisvandamál í `basicsr`
(gömlum pakka sem flytur inn úr `torchvision`-slóð sem var fjarlægð í nýrri
útgáfum).

## Keyrsla

```sh
source .venv/bin/activate
python3 server.py
```

Fyrsta keyrsla sækir líkönin sjálfkrafa (~500MB samtals — GFPGAN, RetinaFace,
parsing net). Eftir það ræsir netþjónninn samstundis.

Sjálfgefin slóð: `http://127.0.0.1:8787`. Breyttu með `PORT=9000 python3 server.py`.

## Hraði (CPU, án skjákorts)

- Andlit + rauð augu: ~20–25 sek fyrir dæmigerða mynd (eftir að hún er
  smækkuð, sjá næst).
- Andlit + áferð (öll myndin) saman: mun hægara — ~90 sek, því Real-ESRGAN
  keyrir yfir alla myndina, ekki bara andlitið.
- Myndir eru sjálfkrafa smækkaðar í mest 1600px á lengri hliðinni áður en
  unnið er úr þeim — án þess getur ein mynd úr síma/myndavél (20+ MP) tekið
  yfir 30 mínútur.
- Með skjákorti (CUDA) er `setup.sh` skipt yfir á CUDA-torch og allt keyrir
  margfalt hraðar.

## API

- `GET /health` → `{"ok": true, "device": "cpu"}`
- `POST /enhance` — `multipart/form-data`: `file` (mynd), `face` (bool),
  `redeye` (bool), `texture` (bool). Skilar JPEG.

## Ekki innifalið (ennþá)

CodeFormer var skoðað sem valkostur við GFPGAN (sterkara á mjög illa förnum
andlitum, en getur breytt svipmóti meira) en er ekki vírað inn ennþá.
