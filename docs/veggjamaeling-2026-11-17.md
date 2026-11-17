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

Keyrt aftur í appinu með báðum breytingum (17.11, 673 s, vörður: ekkert skrif fór út): lokalínur appsins
**53,7 % / 69,4 %** (fyrri keyrsla í appinu með tilraun 4 eingöngu: 40,5 % / 64,2 %). Skrefið segir nú
„utan húss: 0 fjarlægð (útlínan lokaðist ekki — engu hent, hæðin er skorin að húsinu)“.

\* tilraunir 1–2 voru mældar fyrir vörpunarleiðréttingu R1 (Veggjavél keyrði á annarri útgáfu blaðsins) — samanburður innan línu gildir.

## Umferð 2 (sama mælikvarði, sama sett — vafraleiðin)

| # | Breyting | Hittni / nákv. | Niðurstaða |
|---|---|---|---|
| — | grunnur (eftir umferð 1) | 65,2 / 77,2 | — |
| 6a | **hárlínupör** í fullri upplausn (`finnaHarlinuPor`): tvær hárlínur 0,05–0,3 m, fylltar ≥ 85 %, ≥ 1 m | 78,5 / 68,7 | of margar rangar (klæðning, stigar) |
| **6b** | **+ par í reglulegri röð ≥ 4 lína hafnað** | **78,4 / 77,4** | **haldið** (aðeins vafraleið; á Veggjavél 93,5 / 84,0 — nákv. −4,4) |
| 6c | röð ≥ 3 lína | 76,4 / 77,0 | verra |
| 7 | „stök mjó lína" í fullri upplausn (`veggKjarni`) fellur | 77,0 / 78,2 | hafnað |
| 8 | `lokunM` 2 / 3 m svo útlínan lokist | 78,4 / 77,4 | engin breyting, hafnað |
| 9 | **textasía** (`textaLinur`): stutt lína án samfelldrar dökkrar raðar (stafir) fellur; skiptiM 6, ≤ 4 m | 78,3 / 79,4 | betra |
| **9b** | **skiptiM 4, ≤ 8 m** | **78,3 / 80,7** | **haldið** (skiptiM 3: 77,1 / 82,0; allar uppsprettur: 77,7 / 82,0; Veggjavél: verra) |
| 10 | föl skönnun: öll greiningin á teygðri mynd (`teygjaFolva`, svart 40) | 84,0 / 75,6 | nákv. −4,9, hafnað |
| 10c | svart 80 / 110 / 140 (R3: 77,1 / 66,6 · 59,2 / 65,4 · 49,1 / 77,3) | — | hafnað |
| 11 | einangraðir smáklasar ≤ 6 m felldir í hreinsun | (R2: 88,2 / 81,9 → 80,4 / 88,7) | felldi 45 m raunveggja í R2 — hafnað, fjarlægt. Heildartala keyrslunnar ógild: R3-línur hennar voru úr svart-140-tilraun |
| **12** | **óteygð greining + aðeins langir veggir (≥ 6 m) úr teygðri (svart 80)** | **80,6 / 80,4** | **haldið** (R3 57,0 / 73,3 → 66,3 / 73,0) |
| 13 | sleppa hárlínupörum á fölri skönnun | settið: R3 66,1 / 75,2; **í appinu R3: 53,6 / 82,0 (með: 87,5 / 58,8)** | hafnað — kostar 34 stig hittni í appinu |
| 14 | einangraðar LOKAÐAR smámyndir ≤ 6 / 8 m felldar (bílar, reitir) | óbreytt (settið og línur appsins) | engin áhrif — hafnað, fjarlægt |

Tvær tilraunir í röð (13, 14) bættu ekkert; eftirstandandi rangar línur eru tákn og hlutir sem þarf að ÞEKKJA (bílar,
gryfjur, skástrikaðir reitir, skrifborð) — ekki rúmfræðiregla. Lykkjunni hætt.

### Í appinu eftir umferð 2 (`turbopaint-sjalfvirkt.cjs --hreinsa --leid vafri --sleppa ocr`, vörður: ekkert skrif fór út)

| Hæð | Fyrir umferð 2 | Eftir umferð 2 |
|---|---|---|
| R3 (TIF-frumrit 9044 dílar) | 53,7 / 69,4 | **87,4 / 58,1** |
| R1 | (ekki keyrt í appinu; utan vafra 53,3 / 89,1) | **81,3 / 81,0** |

Í appinu les R3 skarpara TIF-frumrit en mælitólið (JPEG) og hárlínupörin finna þar útveggi og innveggi (hittni +34) en líka
útlínur bíla, gryfju, skástrikaðra reita og skrifborða (nákvæmni −11). Rekkarnir greinast EKKI (hillusían heldur).

## Eftir

| Leið | R1 | R2 | R3 | R4 | **Allt** |
|---|---|---|---|---|---|
| Vafri + hreinsun (eftir umferð 1) | 53,3 / 89,1 | 78,2 / 79,0 | 56,8 / 74,8 | 91,1 / 53,5 | 65,2 / 77,2 |
| **Vafri + hreinsun (eftir umferð 2)** | **80,7 / 89,9** | **88,2 / 81,9** | **66,3 / 73,0** | **96,0 / 59,3** | **80,6 / 80,4** |
| Veggjavél + hreinsun | 89,6 / 98,1 | 96,7 / 95,0 | 79,5 / 68,1 | 85,4 / 88,2 | **89,7 / 88,4** |

Markmiðið (≥ 85 % / ≥ 85 % á öllu settinu) **næst ekki á vafraleiðinni** (80,6 / 80,4 eftir umferð 2; grunnlína 49,7 / 77,6). Veggjavélarleiðin mælist yfir því,
en sá sannleikur er hlutdrægur henni í hag (sjá fyrirvara).

## Hvað stendur eftir (vafraleiðin, eftir umferð 2)

Mælt af yfirlögum (rautt = týndur raunveggur, fjólublátt = rangur greindur veggur):

1. ~~Þunnir holir/glerjaðir veggir~~ — hárlínupör (6b): R1 53 → 81 %. Eftir standa stuttir (< 1 m) stubbar og veggir við hurðir.
2. **Gluggaveggir út að svölum og stuttir stubbar milli glugga** (R2). Glugginn sjálfur greinist ekki sem gler.
3. **Föl skönnun** (R3 66 %): teygð mynd finnur útveggina (80 %) en líka bíla, lyftur, tákn og texta (nákv. 56 %); aðeins langir veggir þaðan eru teknir. Stuttir innveggir á fölri skönnun vantar enn.
4. **Rangir veggir (nákvæmni):** textasían (9b) tók herbergjaheitin (R2 76,5 → 81,9). Eftir standa málsetningarkeðjur, hellulögn, bekkir og stigar á verönd UTAN hússins en innan skurðar (R4 nákvæmni 59 %) — útlínan lokast ekki svo „utan húss" getur ekki fellt þá. Þarf: málsetningarsíu (lína með reglulegum þverstrikum + tölum) eða þrengri skurð.
5. **Veggjavélin er sjaldan notuð** (22 keyrslur, 2 villur: `torchvision::nms`, PDF-slóð). Hún skilar 89,7 / 88,6
   þegar hún keyrir. Að hún svari alltaf er líklega stærsta einstaka umbótin fyrir Agnar — en það er rekstrarmál
   skrifstofutölvunnar, ekki kóði hér.
