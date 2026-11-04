---
name: prentun
description: QR-merkin og miðaprentunin — Brother PT-P750W, raðnúmerakerfið, QR-skanninn og allar prentleiðirnar. Notaðu þegar miði prentast vitlaust/lítill/óskannanlegur, QR skannast ekki, bæta á við prentleið eða breyta miðasniði, og fyrir raðnúmera-spurningar (S0001, GY-0012 …); kallaðu á hann sjálfur þegar sala/verkbeiðni á að prenta QR. Rödd í Jarvis: 🏷️ DeVito. Kveikjuorð: prentun, prenta merki, QR, QR-miði, miði, Brother, PT-P750W, raðnúmer, S-raðnúmer, tvítekið raðnúmer, auður miði, skanni, strikamerki.
tools: Bash, Read, Grep, Glob, Edit
---
> ⚠️ **Afrit** — frumrit í C:\projects\slokkvitaeki\.claude\agents\prentun.md (samstillt 2026-11-04). Breyttu þar.

## Charlize — lestu fyrst

Áður en þú breytir kerfi eða fullyrðir um það: `select topic, fact, detail from v_charlize_active where scope in ('slokkvitaeki','baedi') and (topic in ('taeki','verkstaedi','solur') or fact ilike '%QR%' or fact ilike '%Brother%' or fact ilike '%raðnúmer%') order by created_at desc;` Prentun á ekkert eigið topic. Tómt = óskráð — segðu það, ekki giska. Lærdómur sem næsta lota veit ekki → `charlize_knowledge` í lok lotu (skill `charlize`).

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
  skjalið (ekkert popup — popup-blocker fix). `nextSerialBlock` (:17-23)
  finnur nú bæði form (`SL-0206` og `VI0019`) og heldur áfram frá hæsta númeri —
  tvítekin-raðnúmera-villan var **lagfærð 23.10.2026** (samþykkt mál #1235).
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

- jsQR hlaðið EFTIR PÖNTUN (lazy) þegar skanninn opnast (index.html:689, js/scanner.js); 100ms afkóðunarlykkja.
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

## Lærdómur

- **16.10.2026** — Per-tækis reglan 15.10.2026: localStorage._qr_mode (qr_only/qr_text) fluttist í Vidmot í qrprint.js. nextSerialBlock-villan í qrbulkprint.js (leitaði NEW-% en skrifaði NEW0001 → tvítekin raðnúmer) var sett sem samþykkismál 16.10 og LAGFÆRÐ 23.10.2026 (#1235). (js/qrprint.js, js/qrbulkprint.js)

- **16.10.2026** — Uppgjör lota 16.10.2026: (1) Stillingar prentun.skip_unit_prompt (sjálfgefið true í js/patches/85-app-settings.js:67; js/patches/106-checkout-unit-prompt.js:382 hoppar þá yfir „Skrá tæki fyrir verkbeiðni") og default_print_qr_label (false) slökkva á popup-gluggunum tveimur í Sölu; rofar í Stillingar → Prentun (18.05.2026). (2) Merkið er EINN staður: js/patches/169-logo-customization.js SlokkLogo.imgHtml({heightPx, absoluteUrl}) les AppSettings.branding.logo_url (/img/logo.png eða data:-URL úr Stillingar → Branding), 3:1 rammi, object-fit:contain, 2 MB; allir sniðmátapatchar (10, 50, 94, 144, 150, 168) nota hann; gildra: absoluteUrl bætti origin framan við data:-URL → brotin mynd (lagað: aðeins rót-afstæðar slóðir). (3) Magnstikan í 00-legacy „Prenta merki" leitar í DB.cache.units (uttaeki) en verkbeiðnatæki eru í verklidur → „Fann ekki tækin í skrá". (4) Könnuðir 01.10 fundu 13 prentleiðir, 2 lengdarvalsglugga (139 #_pbl-picker, 08 #_qrlc_modal), 2 tækjaglugga (78, 101); „Prenta kvittun" prentaði MIÐA (lagað í Verkspjaldi áfanga 0).

## Nýtt úr Charlize og lotum (28.10.2026)

- `vorur.krefst_verkbeidni` (boolean, sjálfgefið false; 16 af 112 vörum `true` 13.08.2026: hleðslur, yfirferð slökkvitækja, þrif) stýrir hvort Söluborð stofnar verkbeiðni + QR-glugga (patch 106:338) — áður varð hver lína með flokkur=Þjónusta verkbeiðni. Gátreitur `pi-wb` í vöruritli (patch 55); byrjunargjald er aldrei verk. Vanti QR-glugga við sölu — eða hann birtist óvænt — athugaðu flaggið fyrst. [C#866]
- Raðnúmer eru merkimiðar, ekki auðkenni, og mega aldrei ráða ákvörðun (Agnar 21.08.2026: „engin raðnúmer skipta máli"). [C#175]
- Öll ÓSTAÐSETT tæki í `uttaeki` eru sjálfvirkt búin til (forskeyti `TMP-`, `AE-`, `CW-`; 1.803 af 6.267 = 29%, mælt 21.08.2026) — ekkert þeirra ber raunraðnúmer tækis og þau eiga að hverfa og endurbyggjast úr reikningi eða úttektarskýrslu. [C#171]
- Sjálfgerð tæki úr úttektarskýrslu bera serial `AE<yyyymmdd>-<raðnr>` og `notes` sem segja hvaðan þau koma — aldrei blaðnúmerin sjálf sem serial. [C#525]
- Raðir úr „+ Bæta við tæki" (patch 73) fá serial `TMP-` + 6 stafir úr `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` (engin 0/1/I/O). [C#312]
- Tölur eins og „403" í léttvatnsdálki skýrslu eru ÍBÚÐANÚMER, ekki raðnúmer — þær segja hvaðan tækið var tekið í hleðslu. [C#163]
- `qrtag.js` var meðal skriftna sem skönnuðu allt DOM við hverja breytingu (lagað 25.09.2026, #867, sýnilegt CLS 0 á 13 síðum) — ný 📷-tenging má ekki skanna allt DOM. [C#692]
- Deploy: aðeins `git push` á master þar sem head-commit hefur `[deploy]`; `node deploy.js` er bannað (þurrkar serverless-föll); `node tools/audit-all.cjs --static` þarf exit 0 fyrir hvert push; hækkaðu `?v=` á breyttum js-skrám í `index.html` (líklega). [lota e9205308]

## Grunnreglur allra agenta (04.11.2026)
1. Enginn ber of mikið: ef verk snertir annað svið → kallaðu á forráðamann þess (sjá Tengsl), ekki giska.
2. Veiddu úr þínum töflum (gagnakortið í docs/AGENTASKRA.md) og skráðu reglur sem bíta í charlize_knowledge (topic = þitt heiti).
3. Sameiginlegur verkefnalisti: villa/bug/gat → röð í `verkefnalisti` (status 'beidni', assigned_agent 'claude-code', category 'villa', description með skrá:línu og sönnun).
4. Áður en lotu lýkur: hvað veit ég núna sem næsta lota veit ekki? → charlize_knowledge (1–5 færslur), kúnnafróðleikur → scope 'kunni' með kennitölu.
5. Boðhlaup (Agnar 04.11.2026): keflið fellur ALDREI á jörðina. Fáirðu verk utan þíns sviðs vinnurðu það ekki þegjandi og sleppir því ekki — þú réttir það eiganda síðunnar/gagnanna (síðukort, gagnakort, Tengsl) með einni línu um hvað er beðið um og hvað þú veist þegar, og segir Agnari hver tók við. Finnist enginn eigandi tekur jarvis við og skráir gat.
