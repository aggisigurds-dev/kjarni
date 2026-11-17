# Veggjagreining — mæling og lykkja (17. nóvember 2026, Powerplan lota 5)

Agnar: „3d teikningarnar að finna veggina er svona smá stuck, nær ekki að finna alla veggi í floorplani, nema svona 40%“.

## Hvar kóðinn er

| Skref | Skrá | Hvenær |
|---|---|---|
| Vigur-PDF | `lib/board/pdf-veggir.ts`, `pdf-veggjaflokkar.ts` | born-digital PDF (fáar teikningar) |
| Skönnun í vafra | `lib/board/skonnun-veggir.ts` (`skonnunarVeggir`) + `thunnir-veggir.ts` | **flestar hæðir** (Veggjavélin svaraði ekki / ekki beðin) |
| Veggjavél | luna-bridge `veggjavel.js` → U-Net á skrifstofutölvunni | aðeins **22 keyrslur alls** í `automation_triggers` |
| Hreinsun | `lib/board/veggja-hreinsun.ts` (`hreinsaVeggi`) → `hurdagreining.ts` → „utan húss“ | allar leiðir (`sjalfvirkt.ts` vinnaLinur) |

## Mælikvarðinn

`lib/board/veggja-maeling.ts` — lengdarvegið, sýni á 5 cm fresti, vik 0,25 m + hálf þykkt, stefna ≤ 20°.

* **Hittni** = hlutfall af lengd raunveggja (veggur / EI) sem greindur veggur liggur á.
* **Nákvæmni** = hlutfall af lengd greindra veggja (veggur / EI / gler) sem liggur á línu í sannleikanum (hvaða tegund sem er — veggur á gluggalínu er ekki rusl).
* Aðeins innan skurðar hæðarinnar (húsið).

Keyrsla á raunteikningum: `apps/slokkvitaeki/tools/veggja-maeling.ts` (myndirnar sóttar í skyndiminni utan repós).
Próf án mynda/nets: `lib/board/veggja-maeling.test.ts` (hráar línur greiningarinnar geymdar í `fixtures/veggjamaeling/hrar/`).

## Prufusettið (sannleikur)

| Id | Gerð | Raunveggir | Sannleikur |
|---|---|---|---|
| R1 | Hreinn rastaður aðaluppdráttur, opin rými + þunnir skrifstofuveggir (4004 dílar, ~47 d/m) | 554 m | leiðrétting Agnars + **7 skrifstofuveggir sem vantaði** (bætt við 17.11) |
| R2 | Þétt fjölbýli, litaður texti, húsgögn, málsetningar (A1 1:100) | 661 m | leiðrétting Agnars (yfirfarin, heil) |
| R3 | Föl skönnun af iðnaðarhúsi, rekkar og ásalínur (A0 1:100) | 425 m | leiðrétting Agnars (yfirfarin) |
| R4 | Lítil hæð í stórum kvarða, húsgögn, skygging (100 d/m) | 64 m | leiðrétting Agnars (yfirfarin) |

**Fyrirvari:** sannleikurinn er leiðrétting Agnars *ofan á úttak Veggjavélarinnar* (R1: 95,6 % samsvörun eftir vörpun).
Veggir sem vélin missti og Agnar bætti ekki við vantar því líka í sannleikann — tölur Veggjavélarinnar eru of háar.
Myndgreining vafrans er óháð sannleikanum og tölur hennar eru marktækari.

## Grunnlína (fyrir)

| Leið | R1 | R2 | R3 | R4 | **Allt** |
|---|---|---|---|---|---|
| Vafri + hreinsun (hittni / nákvæmni) | 50,6 / 88,6 | 69,0 / 77,3 | **12,2** / 85,4 | 91,1 / 58,0 | **49,7 / 77,6** |
| Veggjavél + hreinsun | 89,6 / 98,1 | 96,7 / 95,0 | 72,3 / 72,8 | 85,4 / 88,2 | 87,9 / 90,3 |
| Vafri hrátt (án hreinsunar) | 59,6 / 78,2 | 79,1 / 81,1 | 67,1 / 69,8 | 91,5 / 57,9 | 70,2 / 75,8 |

Vafraleiðin (sú sem flestar hæðir fá) gefur ~50 % — í samræmi við „~40 %“ Agnars.
**Hreinsunin tók 20 prósentustig af hittninni** — mest „hillusían“.

## Tilraunir (ein breyting í einu, mælt á öllu settinu)

| # | Breyting | Vafri+h hittni / nákv. | Veggjavél+h hittni / nákv. | Niðurstaða |
|---|---|---|---|---|
| 0 | grunnlína | 49,7 / 77,6 | 87,9 / 90,3 | — |
| 1 | hillusía af (`hillurM` 1000) | 69,2 / 75,1 | 81,7 / 70,1 * | hafnað — Veggjavél missir 10 stig nákvæmni (rekkar R3) |
| 2a | endi „hillu“ tengdur innan 0,5 m (var 0,15) | 56,1 / 76,0 | 78,0 / 79,5 * | of lítið |
| 2b | … innan 1,0 m | 61,7 / 77,0 | 78,6 / 79,6 * | of lítið |
| 3 | hilla fer aðeins ef ≥ 2 önnur samsíða, álíka löng, innan 15 m (rekkaröð) | 68,2 / 75,1 | 91,2 / 85,3 | nákvæmni Veggjavélar −5 |
| 3b | sama, ≥ 3 önnur | 68,2 / 75,1 | 92,8 / 83,1 | verra |
| **4** | **röð (3) fyrir línur ≥ 12 m; styttri frístandandi fara eins og áður** | **65,3 / 77,1** | **89,7 / 88,6** | **haldið** |
| 4b | sama með 10 m | 66,1 / 76,8 | 89,7 / 88,1 | jafnt, 12 m valið (nákvæmni) |
| 4c | röð = klasi (keðja), lengdarhlutfall −20 % / +25 % | 65,3 / 77,1 | 89,7 / 88,6 | sama á settinu; endarekkar raðar fara líka (próf) |
| **5** | **„utan húss“ hendir engu þegar útlínan lokast ekki** (hæðin er þegar skorin að húsinu) | 65,2 / 77,2 | 89,7 / 88,4 | **haldið** — í appinu á R3: 40,6 / 64,3 → 53,7 / 69,6 |

### Í appinu sjálfu (R3, `tools/turbopaint-sjalfvirkt.cjs --hreinsa --leid vafri`, öll skrif gripin af verðinum)

Appið les TIF-frumritið (9044 × 4423) en ekki JPEG skjalasafnsins, svo hráu línurnar eru aðrar en í mælitólinu.
Sömu hráu línur appsins (geymdar í `fixtures/veggjamaeling/hrar/R3-app.json`) eftir hreinsun:

| Reglur | Hittni | Nákvæmni |
|---|---|---|
| gamlar (fyrir) | 22,9 % | 56,3 % |
| aðeins hillusía ný (tilraun 4) | 40,6 % | 64,3 % |
| **báðar nýjar (4 + 5)** | **53,7 %** | **69,6 %** |

\* tilraunir 1–2 voru mældar fyrir vörpunarleiðréttingu R1 (Veggjavél keyrði á annarri útgáfu blaðsins) — samanburður innan línu gildir.

## Eftir

| Leið | R1 | R2 | R3 | R4 | **Allt** |
|---|---|---|---|---|---|
| Vafri + hreinsun | 53,3 / 89,1 | 78,2 / 79,0 | 56,8 / 74,8 | 91,1 / 53,5 | **65,2 / 77,2** |
| Veggjavél + hreinsun | 89,6 / 98,1 | 96,7 / 95,0 | 79,5 / 68,1 | 85,4 / 88,2 | **89,7 / 88,4** |

Markmiðið (≥ 85 % / ≥ 85 % á öllu settinu) **næst ekki á vafraleiðinni**. Veggjavélarleiðin mælist yfir því,
en sá sannleikur er hlutdrægur henni í hag (sjá fyrirvara).

## Hvað stendur eftir (vafraleiðin)

Mælt af yfirlögum (rautt = týndur raunveggur, fjólublátt = rangur greindur veggur):

1. **Þunnir holir/glerjaðir skrifstofuveggir og glerframhlið** (R1: ~40 % af lengdinni). Teiknaðir sem tvær hárfínar
   gráar línur (1–2 dílar) — hvorki `skonnunarVeggir` (þykkir/fylltir) né `finnaThunnaVeggi` (rák ~0,15 m) sjá þá.
   Þarf: pörun samsíða hárlína í fullri upplausn (eins og `pdf-veggir.ts` gerir á vigrum) — eða Veggjavélina.
2. **Gluggaveggir út að svölum og stuttir stubbar milli glugga** (R2). Glugginn sjálfur greinist ekki sem gler.
3. **Föl skönnun** (R3): `skonnunarVeggir` einn finnur 28 %; `thunnir` bjarga upp í 67 % hrátt. Stuttir frístandandi
   raunveggir (7–12 m) falla enn í hillusíunni (~40 m).
4. **Rangir veggir (nákvæmni):** málsetningarkeðjur með merkjum, punktalínur (loft/bitar), herbergjaheiti (lína í
   gegnum texta), stigar (R4 nákvæmni 53 %). Þarf textasíu (OCR-reitir eins og Veggjavélin notar) og
   málsetningarsíu (lína með reglulegum þverstrikum + tölum).
5. **Veggjavélin er sjaldan notuð** (22 keyrslur, 2 villur: `torchvision::nms`, PDF-slóð). Hún skilar 89,7 / 88,6
   þegar hún keyrir. Að hún svari alltaf er líklega stærsta einstaka umbótin fyrir Agnar — en það er rekstrarmál
   skrifstofutölvunnar, ekki kóði hér.
