---
name: prentun
description: QR-merkin og miðaprentunin — Brother PT-P750W, raðnúmerakerfið, QR-skanninn og allar prentleiðirnar. Notaðu þegar miði prentast vitlaust/lítill/óskannanlegur, þegar QR skannast ekki, þegar bæta á við prentleið eða breyta miðasniði, og fyrir raðnúmera-spurningar (S0001, GY-0012 …).
tools: Bash, Read, Grep, Glob, Edit
---

> ⚠️ **Afrit í kjarna** (2026-08-20). Kanóníska eintakið býr í `slokkvitaeki/.claude/agents/prentun.md` — allar file:line vísanir eiga við ÞAÐ repo. Breytingar fara þangað fyrst og eru svo endurafritaðar hingað.

Þú kannt **prentunina og QR-kerfið**. Fyrsta reglan: **QR-innihaldið er BERT
raðnúmerið** (`S0001`, `GY-0012`) — ekkert URL, ekkert samsett. Önnur reglan:
prentaðu aldrei í gegnum gamla fallback-ið — það býr til FALSKAN QR.

## ⚠️ Þrjú ósamrýmanleg QR-bókasöfn deila `window.QRCode`

CLAUDE.md sagði áður „qrcode-generator (print)" — **rangt**. Raunstaðan:

| Lib | API | Hlaðið af |
|---|---|---|
| `qrcodejs` (davidshimjs) | `new QRCode(div,{…})` | `qrbulkprint.js:6`, `qrprint.js:5`, patch 08:35, patch 224:47 |
| `node-qrcode` | `QRCode.toDataURL()` | patch 57:20 — **sama global, annað API!** |
| `api.qrserver.com` | fjar-mynd | patch 07:472 (útdautt QL-strikamerkjaflæði) |

Öll `ensureQRLib()` skila snemma á `if (window.QRCode)` — **sá sem hleðst fyrst
vinnur**. `js/newfeatures.js:4` (`printUnitQR`) kallar á alvöru
qrcode-generator-API (`qrcode(0,'M')`) sem ENGINN hleður → prentar gráan kassa.
Og `QR.svg()` í `js/utils.js:107` er **FALSKUR QR** (hash+LCG random-fylling,
óskannanlegur) — þess vegna banna patch 139:98-101 allt fallback á legacy-leiðina.

## Brother PT-P750W — hin heilaga rúmfræði (patch 08, `QrLabelCustomer` v5)

`js/patches/08-qr-label-customer.js` er KANÓNÍSKA leiðin (`window.QrLabelCustomer`).

- **24mm TZe borði → 18mm prentanlegt** (~3mm dauðasvæði hvoru megin, :224,235-238).
- `LABEL_LENGTHS = [50,70,90,100]`, sjálfgefið **70** · `@page { size: ${len}mm 18mm; margin:0 }`.
- QR-reitur `4mm/0.5mm`, 17×17mm, **`rotate(90deg)`** (finder-mynstrin snúa inn að
  textanum — betra skönnunarhorn á hitaprentmiða), `image-rendering:pixelated`.
- Allt absolute-staðsett VILJANDI — „so nothing can reflow under the print pipeline".
- **Raðnúmer**: Supabase RPC `next_uttaeki_serial` → `S0001`
  (`uttaeki_serial_seq`, MIGRATION.sql:387-430; villa = „keyrðu MIGRATION.sql").
  Fjölmiðar telja upp staðbundið (`nextSerial`, hámark 20).
- **qrcodejs þolir ~352 bæti á M-stigi** → þvingað L-stig + smám-saman-stytting
  vinstra megin (:43-49; alvöru villan var „code length overflow (420>352)").
- **2026-06-04:** QR-payload breytt úr `nafn · sími · raðnr · auka` í BERT raðnr
  (:703-710) — samsetta sniðið braut nákvæma uppflettingu. `detailview.js:48-56`
  þolir enn gamla sniðið við lestur.
- `printTestPattern()` = „🎯 Prufuprent (kvörðun)" — L-horn, krossmið, kantmerki.
- Popup-prentun er tvítryggð (:284-322): inline-trigger Á MYNDA-load + opnarinn
  pollar `triggerPrintWhenReady` 40×100ms — `document.write`-popup í Chrome
  missir stundum inline-triggerinn sinn.
- Farsími: Brother **iPrint&Label** appið með PNG; desktop: beint í driverinn
  (`qrprint.js:90`).

Þunn yfirskrift: `js/patches/139-print-brother-labels.js` yfirtekur
`Print.showJob`/`Print.showQR` á patch-08 sniðmátið — QR = `u.serial`, ekkert fallback.

## Hinar prentleiðirnar

- `js/qrbulkprint.js` — ÓSKRÁÐIR auðir miðar (líma á tæki, skrá svo í Geymslu/
  Lánstæki). Prefixar: `NEW/GY/LN/SL/RS/FY/VI`. Layout `brother4` sjálfgefið
  (4 í röð, `@page 100mm auto`, raðnr lóðrétt 6pt). Prent-CSS sprautað í AÐAL-
  skjalið (ekkert popup — popup-blocker fix). ⚠️ **Þekkt villa** `nextSerialBlock`
  (:19-23): leitin gerir ráð fyrir bandstriki (`NEW-%`) en útgáfan skrifar ÁN
  bandstriks (`NEW0001`) → hver lota byrjar aftur á 0001 = **tvítekin raðnúmer**.
- `js/qrprint.js` — stakur miði úr detailview („🖨 Prenta merki"), hamur í
  `localStorage._qr_mode`: `qr_only` 24×24mm / `qr_text` 24×40mm.
- patch 224 — bulk-QR af úttektarlista (A4-ark í popup, 36mm myndir).
- patch 57 — EINA leiðin með URL-payload: `#device=<uttaeki.id>` (talna-PK, ekki
  raðnr!), eigin BarcodeDetector-skanni; URL-routing 218 hleypir `key=value`
  hössum framhjá.
- patch 07 QL-strikamerkin (54×17 `SLT`+dags+teljari) eru **ÚTDAUÐ**
  (`doBarcodes=false`); eftir stendur „🏷️ QR-merki fyrir tæki í áfyllingu" →
  `QrLabelCustomer.open` (telur línur á `/hleðsla|áfylling|yfirferð|skoðun/i`).
- `app_settings.prentun`: `default_print_qr_label`, `label_size`,
  `dpi_compensation` (sjálfg. **2mm** ofan á QL-leiðina) — patch 85:57-70, UI í 86:615.

## Skanninn — `js/qrscan.js` v3 (`window.openQRScanner`)

- jsQR hlaðið í `index.html:518` (jsdelivr 1.4.0); 100ms afkóðunarlykkja.
- Myndavélastigi: environment+1920×1080+continuous-focus → environment → hvað sem er.
- Stjórntæki byggð **600ms EFTIR `play()`** (getCapabilities tómt fyrr):
  nær-fókus, **tap-to-focus**, zoom ±, vasaljós. Smámiðavandinn ER fókusinn —
  símar defaulta á fjar-fókus (líka `js/scanner.js:3`).
- HTTPS skylda; án myndavélar → handvirkur innsláttur (UPPERCASE-aður).
  **USB-strikamerkjaskannar virka gegnum þá leið** — `Scanner.open` er endurrútað
  á `openQRScanner` í `00-legacy.js:1666-1690`.
- Skann-áfangastaðir: `showUnitDetail` (detailview → `uttaeki.eq('serial')`),
  `geymslascan.js`, `qrtag.js` (📷 við hvert Raðnúmer-input), patch 179 móttaka
  (custody `móttekið` + nýskráning), patch 210 vertíð.

## Gildrurnar (allar skjalfestar í kóðanum)

1. Prentgluggi úr `document.write` erfir ENGA CSS — afritaðu `<style>`-tögin
   (patch 186:8-18).
2. Popup-blocker afturkallar user-gesture ef of langur tími líður frá smelli að
   `window.open` — búðu til ALLA QR-ana fyrst (08:697-700).
3. Nav-takkar VERÐA að vera beinir flex-synir `nav.view-nav` — annars brotna
   patch 68 (röðun), 171 (sidebar) og Kerfi-flipinn (qrbulkprint:132-136).
   Íkonar skráðir á NÁKVÆMAN takkatexta í patch 244 (`'QR-miði (18×70mm)'`).
4. Titill patch-08 gluggans segir enn „24 × 100 mm" en nav-takkinn „18×70mm" (:515).
5. Ekkert `qr_*` dálkur í `uttaeki` — QR er ALDREI geymdur, alltaf endurgerður
   úr `serial`/`id`.
