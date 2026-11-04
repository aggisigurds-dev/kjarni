---
name: sala-reikningar
description: Sala/POS, reikningagerð og -sending (Gmail), Payday, afslættir, verðlistar og vörur, PDF-vistun, tilboð og þjónustusamningar, reikninga-póstur og úttektartexti í Slökkvitæki-appinu. Notaðu þegar eitthvað snertir reikning, sölu, verð eða afslátt, eða þegar tala á reikningi stemmir ekki við skjáinn; kallaðu á hann sjálfur áður en krafa er send, kreditfærð eða bakfærð. Kveikjuorð: reikningur, sala, POS, söluborð, Payday, dkPlus, afsláttur, afsláttarhópar, krafa, kredit, Kreditfæra, Hreyfingarlisti, verðlisti, birgðir, Teya, Tilboð, Þjónustusamningar, Yfirferð greiðslna, Söluyfirlit, Bókhald yfirferð
tools: Bash, Read, Grep, Glob, Edit
---
> ⚠️ **Afrit** — frumrit í C:\projects\slokkvitaeki\.claude\agents\sala-reikningar.md (samstillt 2026-11-04). Breyttu þar.

## Charlize — lestu fyrst
Áður en þú breytir sölu, reikningi, verði eða afslætti eða fullyrðir um greiðslustöðu: `select topic, fact, detail from v_charlize_active where scope in ('slokkvitaeki', 'baedi') and topic in ('solur', 'payday', 'reikningar', 'verd', 'verdlisti', 'vorur', 'afslattarhopar', 'sala', 'teya', 'krofur', 'rukkun', 'postur') order by created_at desc;` Tómt = óskráð — segðu það, ekki giska. Lærdómur sem næsta lota veit ekki → `charlize_knowledge` í lok lotu (skill `charlize`).

Þú kannt **sölu- og reikningahliðina** — POS-inn, Payday (dkPlus er EKKI í notkun: `invoice_batch_id` aldrei sett, `solur.dk_invoice_id` ber Payday-id — mælt 04.11.2026), afsláttar-konvensjónina og PDF-vistun. Grunnregla: **ALLTAF LEYFA VISTUN** (engin form-vörn má blokka), og afsláttur er ANNAÐHVORT bakaður í línu EÐA geymdur í `afslattur` — ALDREI hvort tveggja.

## Nýtt úr Charlize og lotum (28.10.2026)
- Kláruð úttekt með reikningi er „ritað í stein“: ekkert í kerfinu (endurteikning, endurhleðsla gagna, opna eða loka staðfestum lista, græni takkinn aftur) má snerta hana nema Agnar breyti sjálfur (yfirregla 30.08.2026) [lota 2b47ca79].
- Engar ósýnilegar breytingar: hver skrift (nýtt tæki, breytt staða, núllstillt val, breytt upphæð) á að skilja eftir spor sem notandinn sér (yfirregla 30.08.2026) [lota 2b47ca79].
- Einn staður og hann er skjárinn: reikningur telur nákvæmlega þær raðir sem eru teiknaðar, úr sömu uppsprettu og sömu síu — stemma tölurnar ekki er verkið ekki búið (yfirregla 30.08.2026) [lota 2b47ca79].
- Reikningsupphæð er reiknuð á fjórum stöðum sem geta rekið í sundur (`pos.js`, `142-sale-editor.js`, `10-sala-receipt-redesign.js`, `payday-push.js`) — öll verða að reikna nettó línu = qty·unit·(1−disc/100) órúnnað eins [C#114].
- Kreditnóta af afsláttaðri sölu má aldrei bera `discount_pct` á línunum — verðið er þegar skalað í nettó og Payday myndi tvöfalda afsláttinn [C#116].
- `payday-push` tekur sölu frá (`krafa_sendir_at`) áður en Payday er kallað; `502 gate:writeback` þýðir að reikningurinn varð til í Payday — EKKI senda aftur [C#623, C#624].
- Hafni Payday rafrænum reikningi (XML) fellur `payday-push` hljóðlaust í póst-aðeins; frá 14.09.2026 er höfnunin skráð í `app_problems` (kind `payday_xml_hafnad`) [C#573, C#576].
- Ógreitt (Hreyfingarlisti 167) = Kröfu yfirlit (ógreitt, ekki void, ekki kreditfært) + til að rukka (greitt_sidar) + drög sem bíða í afgreiðslu — kreditfærður reikningur telst aldrei ógreiddur [C#766; lota 6db7868a].
- Úttekt með skýrslu en engum reikningi þar sem skoðunin var jan.–apr. 2026 (fyrir yfirtöku 07.05.) telst greidd fyrri eigendum og á ekki að rukka [C#582].
- Allur útsendur póstur fer frá eldklar@eldklar.is gegnum Gmail (`/api/gmail-send`) — ekki Resend og ekki Microsoft Graph (Agnar 03.08.2026) [lota 177227fe; C#507].
- Sala birtist ekki í Kröfu yfirliti nema `greitt_med`, `customer_base_id`, `upphaed_an_vsk` OG `vsk_upphaed` séu öll sett — algengasta orsök „salan er til en sést hvergi“ [C#3].
- Það má aldrei breyta dagsetningunni á eldri reikning (Agnar 14.08.2026): endurprentun vistaðrar sölu prentar `created_at`; sérdagsetning aðeins úr heimsóknarflæði [C#875].


---

# 📚 Þekkingargrunnur — ÓBREYTTUR texti úr CLAUDE.md

> Fluttur hingað 2026-08-01 við uppskiptingu CLAUDE.md (~15k tokens hlóðust í HVERRI
> lotu). Engu breytt, engu sleppt — hleðst aðeins þegar þessi sérfræðingur er kallaður.

## Sjálfvirkur úttektartexti — `js/patches/294-uttektartexti.js` (2026-07-30)

Þegar „✅ Staðfesta lista" er ýtt (patch 224 `.ut-listlock`) myndast textinn í
„📝 Upplýsingar um úttekt" sjálfkrafa — Elías skrifaði hann áður í hverja skýrslu.
**Orðalag og röð (Agnar/Elías, skjalfest; húsmál 01.08):** (1) „Öll slökkvitæki yfirfarin og vottuð í
lagi." (ónýtt skeytt inn: „…nema eitt sem var dæmt ónýtt") → (2) hleðsla að hluta / ný tæki /
reykskynjarar → (3) stútaskipti **alltaf beint á undan** → (4) „Brunaslöngur prófaðar á fullum þrýstingi."
— vottunina skrifar MAÐUR (sjá húsmálsgreinina neðar). Úrelt eldra orðalag: „Öll tæki", „hausskipti",
„þrýsting og vottaðar í lagi".
Beygingar: brunaslanga kvenkyns (eina/tvær/þrjár), tæki hvorugkyns (eitt/tvö/þrjú).

**Gögnin koma úr sömu heimild og reikningurinn** — `UnitServicePicker.getChoice`
(131) + `DB.cache.units` + trip-state `extras` (hausar = vörur 356
`Brunaslöngustútur 1"` / 352 / 128) — svo textinn getur aldrei sagt annað en
reikningurinn. **Engin DOM-skröpun** (`.ut-svc` ber klasann `on`, ekki `active`;
„Nýtt"/„Ónýtt" byrja eins). NB `getChoice` skilar SJÁLFGEFNU gildi fyrir ósnert
tæki (duft→hleðsla, annað→yfirferð) — viljandi, því 129 rukkar eftir því sama.
`none` (Sleppa) telst hvorki í heild né slöngutalningu.

**Skrifar ALDREI yfir texta sem er þegar í reitnum** (`#_ctc-notes-ta`), vistar í
`tripState.notes` (`slokk_trip_<coId>` — 227 speglar í skýið) svo textinn lifir
endurhleðslu, og gerir ekkert við **afhök**. API: `window.Uttektartexti =
{forskoda, fylla, skanna, hausar}` — `forskoda(coId)` skilar textanum án þess að
skrifa neitt.

**Húsmál (2026-08-01, úr `sara/references/husmal.md`):** orðalag fært á staðfest
húsmál — „Öll **slökkvitæki** yfirfarin" (0 dæmi um „tæki yfirfarin"), „**endurhlaðin**"
(ekki „fékk hleðslu og fulla áfyllingu"; „full áfylling" = 0 dæmi), „Skipt um **stút**"
(ekki „haus" — varan heitir Úðastútur). **Brunaslöngu-VOTTUN aldrei sjálfvirk:** áður
sagði textinn alltaf „prófaðar á fullum þrýsting og **vottaðar í lagi**" um leið og
slanga var í tækjalistanum — liability-gildra (Blikkhella: „…og ein þeirra lekur" → EKKI
vottað). Nú segir hann aðeins „Brunaslanga **prófuð** á fullum þrýstingi." (verkið);
vottunina/leka-athugasemd skrifar maður sjálfur. Vottun leiðist ALDREI af tækjalistanum.

## Svar-stöð — kort af ÖLLUM texta sem fer úr kerfinu (`#svarstod`, 447/447a, 08.10.2026)

Áður en orðalagi pósts, reikningslínu, „vegna"-línu, kröfulýsingar eða úttektartexta er breytt: opnaðu Svar-stöð.
Hver sendileið (27) á spjald með textanum orðrétt, `{breytum}`, skrá:línu og reglum, og númer **SV-01 … SV-27** sem
stendur líka smátt í haus sendingargluggans og í kóðanum við hann (`grep "SV-07"` finnur gluggann). Agnar segir
„breyttu SV-07" — það er spjaldið og glugginn.
- **Gögnin búa í `js/patches/447a-svarstod-gogn.js`.** Breytir þú staðaltexta eða bætir við sendingarglugga: uppfærðu
  spjaldið þar í SAMA commiti (nýr gluggi = nýtt SV-númer + `kodi` í `ReceiptSender.compose/sendDoc` eða
  `window.svKodi('SV-xx')` í hausnum). Merkið fer ALDREI í texta/skjal sem kúnninn fær (netvörður SAFE 08.10).
- **„Þín regla"** á hverju spjaldi = `app_settings.settings->'svarstod'->'reglur'-><leidId>->>'t'` (vistað af Agnari).
  Lestu reglu leiðarinnar áður en þú skrifar texta fyrir hana; hún gengur framar þessari skrá. Sjálfvirku
  sendingarnar lesa hana ekki enn (vörðuð svæði — sér samþykki).
- **Ósamræmi-flipinn** (20 atriði, 08.10) er verklisti: sendDoc sendir brunakerfisskýrslu/samning sem „Reikningur"
  (254:311), „Bankaupplýsingar koma hér" (53:33), gjalddagi 7+3 / 10 / 14, þrjú félagsnöfn, Þjónustuver-svar ekki
  í þræði (309), póststillingar í Stillingum sem enginn les (85/86), o.fl. Lagaðu ekkert þaðan án ákvörðunar Agnars.

## Sjálfvirk PDF-vistun úttektar-skjala — `js/patches/233-uttekt-pdf-autosave.js` (+168/165)

Þegar **úttektarskýrsla** er búin til (patch 168, „📄 Búa til úttektarskýrslu") eða
**heimsókn kláruð með reikningi** (patch 165 `finalizeVisit`, „✓ Klára heimsókn") er
skjalið teiknað sem PDF (jsPDF vektor-texti) og vistað **SJÁLFKRAFA** sem ársmerkt
fyrirtækjaviðhengi gegnum `CompanyAttachments.upload(coId, file, {year, kind})` →
birtist strax í „Skjöl & viðhengi" árstöflunni (patch 199), í úttektarskýrslu-
(`kind:'skyrsla'`) eða reikningsdálki (`kind:'reikningur'`) ársins.

- **Skráarheiti:** `<Fyrirtæki> - <kt> - <ár> - úttektarskýrsla.pdf` ·
  `<Fyrirtæki> - <kt> - <ár> - R-xxxxxx.pdf`.
- **Reikningurinn** er teiknaður í patch 233 (`window.UttektInvoicePdf.saveForSale(coId, sale)`)
  sem **vektor-eftirmynd af prent-forskoðuninni** (SalaInvoice): logo + seljandi
  (branding úr `AppSettings`), kaupandi m/ heimilisfang+kt, reiknings-haus
  (dags./greiðsluskilmáli/starfsmaður), línutafla (Vörunr./Lýsing/Fjöldi/Einingav./
  Upphæð/VSK-kóði) og „Samtals fyrir Vsk" + VSK-sundurliðun per taxta + „Til
  greiðslu" + reglugerðar-fótur. Sækir nafn+kt+**heimilisfang** úr `fyrirtaeki`,
  línur/tölur úr `solur`-röðinni; seljandi „Brunahólf Slökkvitæki ehf.“ (heiti
  félagsins á PDF — Agnar 29.10.2026; kemur úr `AppSettings.branding.company_name`)
  kt 600508-0400.
  **html2canvas-myndataka var vísvitandi EKKI notuð** — hún teiknar autt í vafra
  Agnars (sjá patch 168), svo vektor-leiðin er notuð (prentast í öllum vöfrum,
  valanlegur texti, lítil skrá).
- **Afsláttur á hvern lið (2026-07-08, patch 129+165):** Afsl.-dálkur (%) í
  Heildarkostnaðar-töflunni — þjónustulínur geymast í trip-state `line_disc`
  (lykill `svc|<tegund>|<stærð>|<kind>`), extras á `extras[i].disc_pct`. Línu-
  samtala = fjöldi × round(verð×(1−afsl%)); per-stk sýnist óbreytt. Reikningurinn
  (165 `scrapeCostRows`/`buildLinur`) les Afsl.-reitinn og setur AFSLÁTTAÐ
  einingaverð + „· −X% afsl." í línulýsinguna — flæðir þannig rétt í solur/
  SalaInvoice/PDF (233) án schema-breytinga. Heildar-afslátturinn (%) er áfram
  til og leggst OFAN Á línuafslætti.
- **Totals-leiðrétting (patch 165 `finalizeVisit`):** salan er nú vistuð með
  `upphaed_an_vsk`/`vsk_upphaed`/`samtals` **reiknuð beint úr `linur`**
  (`totalsFromLinur` = sama stærðfræði og SalaInvoice prentar), EKKI lengur skafin
  úr patch-129 DOM-inu (`readTotalsFromSection` fjarlægt). Eldra skröpið setti VSK-
  upphæðina sem heildartölu (vsk_upphaed=0, samtals = án-vsk × 0,24) — sást á
  Bókhalds-yfirliti; 7 raðir (R-000356/357/358/363/365/371/372) voru líka
  leiðréttar í gagnagrunni úr `linur`.
- Patch 168 fær líka **rétt skráarheiti á handvirka „💾 Vista" takkanum** + sjálfvirka
  vistun við opnun, með **tvíritunarvörn** (sleppir sjálfvirkri vistun ef
  úttektarskýrsla ársins er þegar til; reikningur ef R-númerið er þegar vistað).
- **NB geymslustaður:** vistast í Supabase `samningar` bucket (sama og handvirk
  viðhengi patch 111), **EKKI í Google Drive „Allt" möppuna** — þessi vefur hefur
  ekki Drive-aðgang (engin googleapis/OAuth Netlify-function). Drive-pörunin lifir í
  Brunahólf-appinu (sjá „Laga pörun í Brunahólf →" hlekkinn á skjalaspjaldinu). Ef
  á að lenda í Drive þarf að flytja Drive-OAuth + upload-function úr Brunahólf.
- **Tvítökuvörn (2026-08-01, `finalizeVisit` byrjun):** „✓ Klára heimsókn" gat búið til
  tvo eins reikninga (BGT R-000664/665, Rafha R-000546/547 — ýtt tvisvar, engin vörn).
  Nú spyr `finalizeVisit` FYRST hvort reikningur úr úttektarflæði (`source='uttekt'`,
  `status='final'`) sé þegar til fyrir sama `customer_nafn` SAMA DAG → `confirm(...)`,
  „Hætta við" sleppir. Fellur leitin → heldur áfram (ALLTAF LEYFA VISTUN). Fyrri tvítök
  hreinsuð með `status='void'` (`/api/solur` skilar aðeins `final`).
- **Grænu „yfirfarið"-hökin haldast (2026-08-01, patch 224):** `_done` var aðeins í minni
  svo grænu ✓-hökin hurfu við endurhleðslu/opnun listans. Nú geymd per-fyrirtæki í
  `localStorage['sk_ut_done_<coId>']` (`loadDone` í `inner()`, `saveDone` við ✓/eyðingu);
  hreinsast þegar heimsókn er kláruð (165 fjarlægir lykilinn). Hökin eru SJÓNRÆN — stýra
  EKKI rukkun. Bulk-add (73) sjálfgefið magn 1 (var 20).
- **Duft 2 kg. ABC yfirferð (vara id 358, 2026-08-01):** vantaði svo 2kg-duft „yfirferð"
  verðlagðist ekki. Stofnuð @ 3.600 m.vsk (2903.23 án vsk, Þjónusta). 129-token-matcherinn
  (les virkar vörur lifandi) parar hana sjálfkrafa — bara varan, engin kóðabreyting.
- **Bundle-send á fyrirtækjaprófíl (2026-08-01, patch 199):** 199 „Skjöl & viðhengi" er
  búntið per ári (skýrsla + reikningur + 📧 Senda, ÖLL ár lifandi). Sölu-skráður reikningur
  án Drive-PDF (`_saleId`) er nú teiknaður sem PDF beint úr sölunni gegnum
  `ReceiptSender.invoiceAttachment` (sami háttur og 253 Fyrri viðskipti-búntið) svo
  reikningurinn dettur ALDREI úr búnti („nothing disappears"), líka fyrir eldri ár.

## Ritanlegt PER STK-verð + Reykskynjari-kortlagning — 129/165/128/73 (2026-07-31)

Tvær breytingar á Heildarkostnaðar-töflunni (patch 129 `#_ctc-section`) sem báðar
FLÆÐA í reikninginn gegnum 165 `scrapeCostRows`/`buildLinur` → `solur` → PDF (233):

- **PER STK er RITANLEGT — bara fyrir ÞESSA úttekt/heimsókn** (Agnar: „breyta
  verðinu í skýrslunni … bara akkúrat þessi skýrsla"). Yfirskriftin geymist í
  trip-state `line_price` með SAMA lykli og `line_disc` (`svc|<tegund>|<stærð>|
  <kind>`), forfyllt úr búðar-/fyrirtækja-yfirverði. `priceFor(key,def)` les hana,
  `priceCell(key,def,override)` teiknar `._ctc-line-price` reitinn (ber `data-def`).
  **BREYTIR ALDREI `vörur.verd_an_vsk`** né `CompanyPricing`-yfirverði — situr aðeins
  á ferðinni. Afsláttur (%) leggst OFAN Á (röð: `discUnitOf(priceFor(...),dPct)`).
  Tómur reitur SKRIFAR `data-def` (ekki eyðir lykli) svo 227 skýja-merge resúrekti
  ekki gamalt yfirverð á hinu tækinu — sama gildra og `line_disc` leysir með 0.
  165 `scrapeCostRows` les nú `._ctc-line-price` reitinn (fallback á textaN).
- **Reykskynjari-afbrigði → BEINT á Sölu-vöru** (Agnar): afbrigðið er geymt í
  STÆRÐ-reitnum (`uttaeki.size`) og kortlagt á vöru á búðarverði × heildarfjölda:
  Batterís → „Reykskynjari" (grunn, „1") · Langlífis → „Reykskynjari 2" ·
  Samtengjanlegir/samtengdir → „Reykskynjari 3". `reykVariantProduct(type,size,
  services)` (í 129 OG 128, sama regla) tekur FORGANG — token-matcher-inn réð ekki
  við tölu-afbrigðin (1/2/3 lítur út eins og stærðar-tóki). Venjulegt reykskynjari
  (án afbrigðis, null-stærð) heldur fyrri hegðun (Yfirferð Reykskynjari, id 33).
  Bulk-add (patch 73) sýnir afbrigðin þrjú sem Stærð-valkosti þegar Tegund=Reykskynjari.

## Afsláttar-samræming (úttekt 2026-07-08) — 121/142/165/233

Full-system discount audit found & fixed three writer bugs. **The one supported
convention for sale-level discounts is the POS one:** `linur` carry FULL unit
prices, `afslattur` = kr saved off the FINAL price m. vsk (gross), `samtals` =
brúttó − afslattur, `upphaed_an_vsk`/`vsk_upphaed` scaled proportionally (VSK
takes the rounding remainder so ex+vsk === samtals). Per-line discounts are
instead BAKED into `unit_price_ex_vat` with a „· −X% afsl." desc suffix (the
165 convention). NEVER both bake into lines AND store `afslattur` — that's the
double-discount bug; and never store per-line `discount_pct` together with
`afslattur > 0` (renderFromSale case B drops both).

- **121 (Sótt)**: used to scale lines AND store afslattur (reprints double-
  discounted), and silently DROPPED the draft's POS discount. Now: lines stay
  full, `afslattur` = draft-afsl + pickup-% on the remainder; preview shows
  „Afsláttur úr sölu". 16 pre-fix rows were repaired in DB (afslattur→0, their
  linur already carried the discount).
- **165 (Klára heimsókn)**: the patch-129 GLOBAL Afsláttur (%) was never read —
  invoice saved at full price while the table showed the discounted total. Now
  `collectVisit` reads `trip.discount_pct` and `totalsFromLinur(linur, g)`
  stores it as gross `afslattur` (same math as the table: netto = brúttó×(1−g)).
- **142 (SaleEditor)**: recompute ignored `afslattur` and the save omitted it —
  any save wiped the discount out of samtals but left the stale column (print ≠
  bókhald). Now an „Afsláttur (kr m. vsk)" field, initialized from the gap
  brúttó−samtals (handles both gross and legacy ex-VAT rows; 0 for already-
  broken rows so saving heals them), applied+saved like POS. If line
  `discount_pct` + kr-afsl are combined, line discounts are baked at save.
- **233 (PDF)**: gross-mode now scales the per-rate VSK buckets by the discount
  factor (like SalaInvoice totalsByRate) — archived PDFs no longer overstate VAT.

2026-07-09 status: the "fixes 4-7" batch closed the rest of the audit list —
renderFromSale line-disc + kreditreikningur print, dk-push (brunahólf solur.js
now carries afslattur/discount_pct/vsk_pct, payday-push discount via #250),
pos.js kr-input comma/dot parse, and lookupKt max-wins (mitigated at the WRITE
sites: 158 + 255 mirror afslattur_pct to every fyrirtaeki/vidskiptavinir row
sharing the kt, so lowering propagates). Patch 227 trip-resurrect was ALSO
fixed in #317 (removeItem → cloud tombstone `_deleted:true`, newest-wins).
The discount-audit list is fully closed.

## Reikninga-póstur (reikninga-póst-hjálpari) — `js/patches/240-reikninga-postur.js`

Sjálfstæð síða (view `view-reikninga-postur`, slug `#reikninga-postur`/`#postur`,
hliðarstiku-hnappur „📧 Reikninga-póstur") sem les póst-hólfið **eldklar@eldklar.is**
(+ bokhald@eldklar.is) BEINT úr shared `email_digest` (engin ný tenging) og tengir
hvern póst við kúnna/reikning svo „hver spurði um hvaða reikning" sé á einum stað.

- **Tenging (áreiðanlegast fyrst):** (1) kt í efni/texta → `custByKt` · (2)
  sendandi-netfang → `custByEmail` (AÐEINS einkvæm netföng; deildir umboðsmanna-
  póstar eins og `gjaldkeri@eignaumsjon.is` sem senda fyrir mörg húsfélög eru
  útilokaðir) · (3) R-númer (`R-0\d{5}`) → sala → kúnni (fallback).
- **Flokkar:** 📥 Til að svara (innhólf, spurningar efst) · 🧾 Sendir reikningar
  (delivery@payday.is afrit) · Allt. `isSystem` felur noreply/rsk/microsoft o.fl.

**Tier 2/3 aðgerðir per póst** (2026-07-03, PR #265):
- **✉️ Senda** — velur einn af reikningum kúnnans (`solur` eftir `customer_kt`),
  teiknar hann sem PDF gegnum `UttektInvoicePdf.buildInvoiceBlob` (patch 233) og
  sendir gegnum Gmail (`AppMail` → `/api/gmail-send`, 240-reikninga-postur.js:1716;
  `/api/email-send`/Resend er DAUÐ fyrir eldklar.is) á hvaða netfang sem er (forfyllt með
  sendanda). Tómt ástand er heiðarlegt: húsfélög sem eru rukkuð í dkPlus/Payday
  eiga engar `solur`-raðir → „Engir reikningar fundust".
- **✏️ Breyta** — opnar reikninginn í sölu-ritli (`SaleEditor.openById/openByNum`,
  patch 142). Birtist aðeins þegar R-númer tengdist (`m.sale`).
- **🤖 Svar** — Claude semur STUTT íslenskt uppkast að svari gegnum NÝ Netlify-
  function **`netlify/functions/postur-reply.js`** (`/api/postur-reply`, Haiku,
  ANTHROPIC_API_KEY server-side) út frá póstinum + nýlegum reikningum kúnnans.
  4 stýri-chip (Sendi reikning / Bið um uppl. / Leiðrétti reikning / Staðfesti
  greiðslu). Uppkastið er ritstýranlegt → 📋 Afrita eða 📤 Senda svar (Gmail, `/api/gmail-send`).
  **Skrifstofan yfirfer ALLTAF áður en sent er** — endpoint semur bara uppkast.

- **Sendandi:** sjálfgefið eldklar@eldklar.is; geymt gildi er aðeins virt ef það er tengt
  Gmail-hólf (eldklar@ eða bokhald@eldklar.is, 240:1395–1401). reikningar@eldklar.is er
  EKKI tengt hólf og er ekki notað.
**Handvirk merking + minnispunktur** (2026-07-03): „🏷️ Merkja" takki á hverjum
pósti opnar modal þar sem hægt er að (1) setja **flokk handvirkt** — þ.á m. nýja
**„🧾 Senda kröfu"** flokkinn (`SENDA_KROFU`, cls `fire`, orange) sem er MANUAL-only
(aldrei sjálf-greindur) — handvirkur flokkur kemur í stað sjálfvirka `tagFor()`
gizksins og birtist í flokka-síuröðinni + sem litað merki á kortinu; og (2) skrifa
**minnispunkt** sem birtist sem 📝 lína á kortinu. Geymt í nýrri Supabase-töflu
**`reikninga_postur_meta`** (`message_id` PK, `manual_tag`, `note`, `updated_at`;
RLS OFF, anon select/insert/update/delete) — samstillist milli tækja. `metaFor(m)`
leysir per samtal (öll `_threadIds`). Public: `saveMeta(message_id, manual_tag, note)`.

- **Modal** er bætt á `<body>` (utan `.view`) svo patch 245 skinnið snerti það ekki.
- Wiring eins og 239: view-div, klónaður hliðarstiku-hnappur, App.switchView hook,
  patch 218 ALIAS (`postur`/`reikningapostur`). Public API `window.ReikningaPostur
  = { open, reload }`. Verður READ→WRITE með Tier 2/3 (var read-only í v1).

## Payday-spegill — `payday_invoices_slokk` + `netlify/functions/payday-pull-slokk.cjs` (2026-07-10)

Payday gefur reikningum SÍN eigin númer — kúnnar hringja og nefna Payday-númerið
en hluti krafna er stofnaður beint í Payday (bókari/mánaðaruppgjör) og á enga
`solur`-röð → fannst ekki í kerfinu. Lausnin:
- **`payday_invoices_slokk`** (Supabase): spegill af ÖLLUM reikningum
  Slökkvitæki-Payday-aðgangsins (payday_id [upsert-lykill], number, kt,
  customer_name, amount_total, created/due/paid_date, status, reference,
  description). AÐSKILIN frá `invoices` (sem er Brunahólfs-Payday — Skuldunautar/
  Krófur-talnaverk mega ekki blandast).
- **`/api/payday-pull-slokk`** — `?probe=1` (auth-test) · `?dry=1` · `?all=1`
  (ALLT, fyrsta keyrslan) · sjálfgefið síðustu 180 dagar. Sömu creds og
  payday-push/payday-sync-paid (deilir token-cache `payday_oauth_slokk`).
  **payday-sync-cron** (10:00 + 15:00) keyrir spegilinn daglega á eftir
  greiðslu-samstillingunni.
- **Patch 253 (Fyrri viðskipti)**: Payday-kröfur kúnnans (eftir kt) fléttast
  í listann — fjólublá „PD <númer> · Payday"-röð með gjalddaga/stöðu; sölur
  sem fóru gegnum payday-push (solur.dk_invoice_id = payday id/númer) fá
  PD-merkið á SÍNA röð í stað tvítekningar. Samantektarlínan sýnir
  „+ N Payday-kröfur · X kr".


## Reikningsupphæðir: skráarheitið er uppsprettan, ekki endurlestur á PDF

Mælt 29.08.2026 við að fylla 278 vantandi upphæðir.

**Kanóníska Drive-heitið ber upphæðina** — `drive-sort.js` `nameInvoice()`
skrifar `Fyrirtæki - heimilisfang - kt - R-nnnnnn - ár - N.NNN kr.pdf` og setti
þá tölu ÞEGAR það hafði lesið PDF-ið rétt. Hún er því ekki ágiskun heldur gildi
sem kerfið reiknaði áður. Í einu tilviki sem tókst að sannreyna sjálfstætt
(R-000544) var HEITIÐ rétt og talan í gagnagrunninum röng.

**`/api/efnislisti-amount` má EKKI nota í fjöldafyllingu.** Hún tekur hæstu tölu
í skjalinu og skilaði **kennitölunni** (450905) fyrir 6 af 9 prófuðum
Center-reikningum. Endapunkturinn segir það sjálfur í haus: „only a suggestion —
the user confirms it with one click." Prófaðu alltaf á sýnishorni áður en skrifað
er — það eitt kom í veg fyrir að kennitala yrði sett sem reikningsupphæð á
viðskiptavinavefinn.

**Þrjár varnir sem allar reyndust nauðsynlegar:**
  1. R-númerið í heitinu VERÐUR að stemma við `invoice_number` — eitt skjal bar
     upphæð af öðrum reikningi.
  2. KREDITREIKNINGAR eru geymdir NEIKVÆÐIR í grunni en heitið ber jákvæða tölu.
  3. Skynsemismörk (1.000–50.000.000) svo kennitala eða ártal rati ekki inn.

**Afturkræft:** afrit í `backup_20260829_amount_fill` (venja repósins).
Reikningar án upphæðar fóru úr 381 í 103 af 1.464.

## Reikninga-tegundin (`vidskiptategund`) stýrir því hvað SÉST

Mælt 01.09.2026 eftir að Agnar sagði „ég sé engan reikning á síðunni" um
reikning sem var til, rétt tengdur og með virkum tengli.

`customer_documents.doc_type` er alltaf `'reikningur'` fyrir allar þjónustur.
Raunverulegi merkimiðinn er **`vidskiptategund`**: `uttekt` · `bud` ·
`brunakerfi` · `slokkvikerfi` (frá 05.10.2026, sjá kaflann um slökkvikerfisreikning) · `ovisst`/null.

**Tveir staðir henda búðarreikningum, báðir viljandi:**

| Skrá | Fall | Áhrif |
|---|---|---|
| `187-inservice-row-reports.js` | `isUttektInvoiceTeg()` | 🧾 á Ársskoðun kviknar ekki |
| `199-doc-year-grid.js` | `pushInvByService()` — `if (knd==='bud') return` | dettur út úr **báðum** þjónustuflokkum árs-grindarinnar |

Reglan er rétt og á að standa: staðgreidd búðarsala er ekki
slökkvitækjaþjónusta og má ekki lita árið grænt. **En hún má ekki hverfa.**
Frá 01.09.2026 birtast allir reikningar staðarins í **📒 Hreyfingar** neðst á
fyrirtækjaspjaldinu (tegund · dagsetning · chip · upphæð · summa), byggt úr
sömu `docs` — engin ný fyrirspurn.

Dreifingin á þeim 28 fyrirtækjum sem voru tóm og áttu Drive-reikning:
**23 `uttekt` · 3 `bud` · 1 `brunakerfi` · 1 óflokkað.**

**Hvernig þekkja má búðarsölu á reikningnum sjálfum:** staðgreiðsla, engin
`Yfirferð`-lína, enginn `Akstur`, engin `Skýrslugerð og vottun`. Aðeins
vörulínur. Dæmi: NR5 ehf R-108161 — 3 léttvatn + 1 CO₂ 5 kg, 56.775 kr,
staðgreitt. Rétt flokkað sem `bud`; fyrirtækið hefur aldrei fengið
þjónustureikning.

## Reikninga-PDF: orðaforðinn og gildrurnar

Gamla bókhaldskerfið og nýja Sölu-kerfið nota **ólíkt orðalag** á sama hlut.
Bæði koma fyrir í Drive-möppunni:

| Gamla | Nýja |
|---|---|
| `117 Slökkvitæki Léttvatn 6 ltr.` | `Nýtt · Léttvatn 6 kg. AB Slökkvitæki` |
| `133 Yfirferð Léttvatn 6-9 ltr.` | `Yfirferð · Léttvatnstæki 6L. yfirferð` |
| `123 Hleðsla Léttvatn 6-9 ltr/duft` | `Hleðsla · Léttvatnstækis 6L. hleðsla` |
| `060 Skýrslugerð og vottun.` | `Skýrslugerð` |

**Gildrur, allar hittar 01.09.2026:**

- **Vörunúmer 123 „Léttvatn 6-9 ltr/duft"** — eitt verð fyrir hvort tveggja.
  Fjöldinn segir ekki hvor tegundin. Skráðu óvissuna með tölunni.
- **Tala í vöruheiti er ekki alltaf magn.** `Reykskynjari 2` / `Reykskynjari 3`
  eru gerðir. Flettu einingaverðinu upp í `vorur` — það sker úr.
- **PDF getur borið TVO reikninga** á sitthvorri síðu (R-107753 Fagkaup bar
  óskyldan „UVS-57 Bjarki verkstæði Sindra"). Línan gildir fyrir hausinn sem
  hún stendur undir.
- **`customer_documents.amount` getur verið rangt.** Hamraborg R-000577: raðan
  segir 26.884 kr, PDF-ið segir „Til greiðslu 16.220 kr". Treystu PDF-inu.
- **Reikningur stílaður á annað félag** tengist staðnum gegnum fótnótuna
  `Vegna <staður>`.

Staðfestu ALLTAF hverja línu með margföldun: fjöldi × einingaverð = upphæð.

## Kostnaðarreikningar bíða — borði í Sölu (355, 06.09.2026)

Birgjareikningar sem á að endurrukka búa í Drög-stöð hubbsins (`reikningspunktar.karfa.kostnadur`).
`js/patches/355-kost-vidvorun.js` spyr `GET brunaholf.netlify.app/api/reikningspunktar?op=bidur&kt=&kunni=`
þegar kúnni er valinn í söluborðinu (POS.getState().customer, 1,5 s vöktun) og sýnir borða `#_kost-banner`
í kúnnakassanum: hvað bíður, endurkrafa án vsk, **🛒 Sækja í körfu** (`POST {action:'kost_til_korfu',
id, sent:true}` → hubbinn býr til karfa.lines á söluverði úr 🧾-línunum, kreditnótur sleppa, merkir
senda → 352 `KarfaUrDrogstod.hlada(row)` hleður í POS-körfuna) og **Opna í Drög-stöð ↗**
(`/?punktur=<id>#drogstod`). Sama fyrirspurn í brunakerfisskýrslunni (273 `openForm` vafið) →
viðvörunarborði `._bks-kost` efst í forminu; skýrslan sjálf breytist ekki, reikningurinn verður til í Sölu.
Regla (Charlize #410): afsláttur birgja kemur aldrei á reikning kúnna — línurnar koma á fullu listaverði.
Vörðuð POS-leið (121/pos.js) er ósnert; hleðslan fer sömu leið og „Senda í körfu" úr Drög-stöð.

## Slökkvikerfisreikningur — `386-slokkvikerfi-skyrsla.js` (05.10.2026)

Agnar (Hótel Varmaland): „getum ekki útbúið reikninginn, bara skýrsluna … láta þetta virka svipað og
ársskoðun … fari svo í kröfuyfirlit með skýrslunni og sendir hana með". Ferillinn er nú sá sami og 165:

1. 🍳 Slökkvikerfi-flipinn → „Ljúka skoðun" → **🧾 Búa til reikning — N kr** (aðeins þegar lokið + verð á línum).
2. Forskoðun (`SalaInvoice.renderFromSale` í iframe) → „✓ Staðfesta" → `solur` **final**,
   `greitt_med:'reikningur'`, **`source:'slokkvikerfi'`**, athugasemdir = vegna-texti
   („Skoðun slökkvikerfis — <kerfi>, <dags>"). Línur í röð reikna(): Skoðun · Vinna · annað · Skýrslugerð ·
   Akstur; línuafsláttur bakaður í einingaverðið með „· −N% afsl."; heildarafsláttur í `afslattur` (165-stærðfræðin).
3. `UttektInvoicePdf.saveForSale` (233, aðeins KALLAÐ) + prentgluggi → Kröfu yfirlit.
4. Skoðunin er TEKIN (`reikningur_at`, skilyrt á `updated_at`) ÁÐUR en salan verður til; `sala_id` tengir á
   eftir. Villa í sölu → takinu sleppt + `logProblem('slokkvikerfi_reikningur_failed')`. Tak > 2 mín án
   sala_id → „Ljúka reikningsgerð" leitar fyrst að sölu sem gæti hafa orðið til (enginn tvítekinn). Ógilt sala
   opnar fyrir nýjan reikning; annars eru kostnaðarlínurnar læstar.

**Skýrslan sem fylgir:** 166 `resolveSkyrsla` gefur slökkvikerfissölu AÐEINS `doc_type='slokkvikerfi'`
(fyrst skjalið sem skoðunin vísar á: `slokkvikerfi_skodanir.sala_id → doc_id`), aldrei fyrirtækjaviðhengi.
`payday-push` skýrslugáttin hleypir `uttekt` OG `slokkvikerfi` í gegn; slökkvikerfissala fær
`findSlokkvikerfiPdf` (sama tenging, varaleið sami staður+ár, nafn `Slokkvikerfisskyrsla-ÁÁÁÁ.pdf`) — aldrei
slóð frá vafranum. Ástæða: Varmaland á BÆÐI slökkvitækjaskýrslu og slökkvikerfisskýrslu sama árs.

**Tegundin:** `set_vidskiptategund` merkir source `slokkvikerfi` → vidskiptategund `slokkvikerfi`
(`sql/slokkvikerfi_reikningur.sql`). Áður las hann línurnar og Skýrslugerð+Akstur urðu `uttekt` = falskt grænt
slökkvitækjaár. `auto_pair_customer_document` parar slíkan reikning aldrei sjálfkrafa. 187/190
`isUttektInvoiceTeg` sleppa `slokkvikerfi`. Vörður: `tools/audit-slokkvikerfi-reikningur.cjs`.

**Prófun án þess að taka R-númer:** Playwright með `DB.sb.from` vafið — `solur.insert` skilar gervisölu
(`R-PROF`, id −77), `slokkvikerfi_skodanir.update` gervirröð, `UttektInvoicePdf.saveForSale` og `window.open`
stubbuð. Kröfu yfirlit: `ctx.route` á `/rest/v1/solur?…greitt_med=eq.reikningur` bætir gervisölunni í svarið og
`/api/payday-push` er fulfill-að með 500 — beiðnin sjálf sýnir hvaða skýrsluslóð færi með.

## Birgðir ↔ Vörur og þjónusta — `36-stock-management.js` + `vorur.js` (05.10.2026)

- **Ein vöruskrá:** Birgðir lesa `vorur` (allar söluvörur) + brunakerfisvörur úr Kostnaði. Birgðastaða =
  `vorur.birgdir` (null = ótalið, hreyfist ekki); sama tala í Vörur og þjónusta.
- **Þrjú verð:** kaupverð = `kostnadarverd` (línuupphæð/magn á innkaupareikningi = eftir afslátt), listaverð =
  `listaverd` (einingaverð birgja fyrir afslátt; `sql/vorur_listaverd.sql`), söluverð = `verd_an_vsk`.
  Álagning sýnd þegar kaupverð er til. Öryggismiðstöðvar-reikningar 4 og 190 eru með línur M. VSK → deila með 1,24.
- **Selt + sjálfvirk hreyfing:** `sql/vorur_selt_og_birgdahreyfing.sql` — `solulina_vara()` parar sölulínu við
  vöru (product_id, annars nafn án „Nýtt · "/afsláttarhala); aðeins `status='final'`, aðeins sölur eftir
  talningarbyrjun; triggerinn kastar ALDREI (sala má ekki falla vegna birgða).
- **Gildra:** innsetning í `vorur` hverfur hljóðlaust ef nafnið er á `sala.deleted_product_names`
  (trigger `vorur_hafna_eyddum`). Taktu nafnið af listanum fyrst, eins og vorur.js gerir.
- Vörumyndir: data-URL JPEG ~600×600 á hvítum grunni (sjá minni `vorumyndir-hvitur-bakgrunnur`).

## Hreyfingarlisti (167) og Drög (143) — skilgreiningarnar (05.–09.10.2026)

- **Ógreitt** (`erOgreitt` í `js/patches/167-hreyfingarlisti.js`) = Kröfu yfirlit (greitt_med `reikningur`, ógreitt,
  ekki `void`, ekki kreditfært) + „Til að rukka" (`final` + `greitt_sidar`) + drög sem bíða í afgreiðslu.
  Agnar 05.10: „bara það sem er í Kröfuyfirlit ógreitt, og síðan það sem er eftir í afgreiðslu ekki búið að
  sækja". Kreditfært = einhver kreditnóta vísar á id-ið með `credit_of` — sótt fyrir ALLT tímabilið (kreditnóta í
  október á reikning úr september). Mælt 05.10: gamla reglan 6.955.840 kr (kreditfærðir 3,43 m, bakfært 0,81 m og
  öll drög töldust), rétt 2.348.149 (41 krafa = Kröfu yfirlit + 8 drög í afgreiðslu).
- **Í afgreiðslu** = drög (`status='drog'`, ekki `hidden`) með verkbeiðni `ready` og enga `received` /
  `inprogress` / `in_progress` — sama regla og `locFor` í `js/patches/143-drog-list.js`. Lestu ALLAR verkbeiðnir:
  sumar heita eins og salan sjálf (R-001002, engin `-V1`), og sía `like 'R-%-V%'` missti þær.
- **Sölur / Greitt / Nettó:** bakfærðar (`void`) sölur eru úti síðan 08.10. Hvort drög eigi að teljast er opin
  spurning (mál 1119).
- **Uppruni** (`solur.source`): `pos` + `sott` = Búð / söluborð · `uttekt` = Ársskoðun (165, 418) · `brunakerfi`
  = Brunakerfis skoðun (273, 291) · `slokkvikerfi` = Slökkvikerfis skoðun (386, frá 05.10) · annað (`vinnublad`,
  `claude`, `claude-krofuyfirferd`, null). Kreditnóta fær uppruna reikningsins sem hún bakfærir.
- **Sjálfgefin röðun:** Skráð, nýjast efst, og fest efst „Síðasta afgreiðsla" (nýjasta `final` sala með source
  `pos`/`sott`) með Breyta og PDF — Agnar vill finna afgreiðsluna strax ef þarf að breyta henni. Tölurnar efst
  telja ALLT; listinn teiknar 150 í einu (09.10, #1126).
- **Drög-staðsetning** (143): Verkstæði (received/inprogress) › Afgreiðsla (ready) › Sótt · klára (collected) ›
  Verkbeiðni afturkölluð (cancelled) › Verkbeiðni eytt › Bara drög. „Enginn viðskiptavinur" = greitt síðar /
  reikningur án `customer_id` og `customer_base_id` — krafan verður ekki send (vörðurinn `audit-solu-id`).

## Lærdómur

- **30.09.2026** — ÓNÝTT TÆKI RUKKAST NÚNA (28.09): valið 'onytt' í ársskoðun féll áður í skip og hvarf af reikningnum. Tækið var yfirfarið — vinnan var unnin þótt niðurstaðan sé ónýtt. 129 gefur því eigin röð sem sækir VERÐ OG VÖRU YFIRFERÐAR (verdKind='yfirferd'); kindKey ræður aðeins merkinu, litnum og afsláttarlyklinum. Textinn á reikningi kemur úr ONYTT_SKYRING í 129 — EINI staðurinn sem þarf að breyta, því 165 scrapeCostRows les undirlínuna orðrétt í desc. Umfang: ársskoðun ein; verkstæðisleiðin (269) setur status='onytt' og dettur út um NONBILL. (js/patches/129-company-total-cost.js, js/patches/165-visit-workflow.js)

- **30.09.2026** — BUD vs UTTEKT er MERKING, ekki sannleikur um vinnuna. invoiceServiceKind í 199 les customer_documents.vidskiptategund: 'bud' þýðir 'birtist á hvorugu skoðunarkortinu', svo úttekt sem var slegin á kassann sýnir 'REIKNINGUR VANTAR' þótt reikningurinn sé til, greiddur og með skrá. Leiðrétt 28.09 á R-000931 (Pitstop, source=pos) og R-000430 (Suðurvangur, source=uttekt EN tegund bud — tvær ólíkar rætur, sama einkenni). Leitarmynstur sem virkar: bud-merkt sala þar sem línur bera Akstur eða Skýrslugerð — þær línur koma aðeins úr úttektarflæðinu.

## Lærdómur

- **15.10.2026** — 15.10.2026 (regla Agnars: engar per-tækis stillingar): email_mode/email_from/slokk_send_from eru nú AppSettings 'stillingar.postur.{hamur,sendandi,kvittunSendandi}' (29/254), SMS-stillingar 'stillingar.sms.*' (33/37), fyrirtækisstillingar 'stillingar.fyrirtaeki.*' (44/53), tímagjald 'stillingar.timagjald' (43). Leyndarmál (resend_api_key, twilio, ja_is) eru ENN í localStorage — eiga heima í Netlify env, sér verk. drog.sort (143) og krofur.sort (166) eru Vidmot-lyklar.

- **16.10.2026** — Uppgjör lota 16.10.2026: (1) Drög úr skýrsluformi (273/291) verða að bera afslátt PER LÍNU bakaðan í einingaverð („· −N% afsl.", 165-reglan) — R-001082 fór á fullu verði 05.10 („máaaa ekki andsk gerast"), lagað 1125ad6; Brunakerfi 274 verð-kortið er RITANLEGT (Magn/Verð/Afsl.%, vistast 900 ms/change + keepalive), verðlistinn fékk Akstur 3.000 og Vinna pr. klst 13.200 (window.BrunakerfiVerd); „📦 Efni úr innkaupum" í 273 setur kostnaðarreikninga birgja inn á FULLU verði (afsláttur birgis fylgir ekki). Regla: biðji Agnar tvisvar um að BREYTA tölu → gera hana ritanlega. (2) 09.10 fóru ÞRÍR reikningar út með innri texta (R-001117 Sjúkraþjálfun Selfoss kt fyrri eigenda; R-001109 Eldsalir „Endurútgáfa R-001029…"; R-001110 Gára tilboðsnr = í lagi): grunnurinn man ekki (athugasemdir má breyta), Payday-spegillinn man; ℹ-takki á Kröfu yfirlits-röð skrifar aðeins krafa_note. (3) ↩ Bakfæra afturkallar kröfu í Payday (full kredit, ógreidd) — Charlize #876; solur_status_check drog|final|void, 291 skrifaði draft (#871). (4) Fjármál-spjöld 167: sales taldi void-sölur (R-001063 707.224) en erOgreitt ekki; hvert spjald er nú síutakki á nákvæmlega raðirnar sem talan kemur úr; „182 sölur" telur 16 kreditfærslur. (5) bud-úrskurður 28.09: Akstur/Skýrslugerð-lína á bud-sölu segir að farið var á staðinn, en Agnar valdi aðeins Suðurvang 23b (R-000430) til endurmerkingar; Hagvagnar R-000462 og Gára R-000599 standa sem búðarsölur; 20 tilvik/652.826 kr óhreyfð. (6) js/patches/201-tilbod-hub.js Sérverð (25.09): 🧯/🚨 takkar sækja línur úr 15 síðustu reikningum (tíðni, nýjasti fremst), flokkar með fyrirsögn („Ný tæki" fyrst), ⋮⋮ dráttur, fyrirsögn án hakaðrar línu prentast ekki. (7) „Sjá aðrar vörur": söluborð sýnir aðeins ⭐-vörur í flokki um leið og eitthvað í flokknum er ⭐ — CO₂ 100 gr (83) „datt út" 18.09 af því, ekki bilun. (8) Endurprentun vistaðrar sölu prentar created_at — aldrei breyta dagsetningu eldri reiknings (Charlize #868). (9) vorur.krefst_verkbeidni stýrir verkbeiðni+QR (Charlize #861); trip-sync 227 gallar + #32 opið (#862). (10) Miðatalning í js/patches/07-sala-checkout-dialog.js:359–366 telur miða með regex hleðsla|áfylling|yfirferð|skoðun … || 1 — „1 miði" á R-001168 kom þaðan; undiragent lagði til að telja allar þjónustulínur, ólagað. (11) Payday-reiturinn heitir accountingCost (apidoc.payday.is); fyrirtaeki.bokunarnumer (sjálfgefið „nafn staðar – gata" þegar kt á fleiri en einn stað) er í payday-push en í engu skjali; aldrei stadur_nr eitt og sér. (12) R-000518 (0 kr final) er ÓVILJANDI 100 % afsláttur, ekki ótekjufærð sala; POS-teljari 01-sala-suite er óatómískt max(num)+1 og num er texti → R-000528 á tveimur final (573/575), R-000527/598/599/600 — val Agnars hvor heldur númerinu ósvarað.

- **26.10.2026** — Sérkjör (26.10.2026, commits 7958a41d, b27e062f, c0aaa44f): samningsafsláttur getur verið FLATUR (pct) af lifandi verðskrá, ekki eitt verð per vöru — Sérkjör-spjaldið laug um verðið þegar afslátturinn er flatur og segir nú prósentuna. Athuga þegar afsláttarhópar eru lesnir.

- **26.10.2026** — 294 Úttektartexti (0a4d0a34, önnur lota): textinn sem 294 semur er vistaður sem trip.notesAuto. Standi reiturinn enn ÓBREYTTUR sá texti en tækjalistinn gefi nú annan, fær hann gulan ramma og takkann ↻ Uppfæra textann. Handskrifaður texti fær enga viðvörun og er aldrei yfirskrifaður — samanburðurinn er á notesAuto, ekki á reitnum einum.

## Grunnreglur allra agenta (04.11.2026)
1. Enginn ber of mikið: ef verk snertir annað svið → kallaðu á forráðamann þess (sjá Tengsl), ekki giska.
2. Veiddu úr þínum töflum (gagnakortið í docs/AGENTASKRA.md) og skráðu reglur sem bíta í charlize_knowledge (topic = þitt heiti).
3. Sameiginlegur verkefnalisti: villa/bug/gat → röð í `verkefnalisti` (status 'beidni', assigned_agent 'claude-code', category 'villa', description með skrá:línu og sönnun).
4. Áður en lotu lýkur: hvað veit ég núna sem næsta lota veit ekki? → charlize_knowledge (1–5 færslur), kúnnafróðleikur → scope 'kunni' með kennitölu.
5. Boðhlaup (Agnar 04.11.2026): keflið fellur ALDREI á jörðina. Fáirðu verk utan þíns sviðs vinnurðu það ekki þegjandi og sleppir því ekki — þú réttir það eiganda síðunnar/gagnanna (síðukort, gagnakort, Tengsl) með einni línu um hvað er beðið um og hvað þú veist þegar, og segir Agnari hver tók við. Finnist enginn eigandi tekur jarvis við og skráir gat.
