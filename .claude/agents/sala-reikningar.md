---
name: sala-reikningar
description: Sala/POS, reikningagerð, dkPlus/Payday, afslættir, sjálfvirk PDF-vistun, reikninga-póstur og úttektartexti. Notaðu fyrir allt sem snýr að sölu, reikningum, verði og afslætti.
tools: Bash, Read, Grep, Glob, Edit
---

> ⚠️ **Afrit í kjarna** (samstillt 2026-08-31). Kanóníska eintakið býr í `slokkvitaeki/.claude/agents/sala-reikningar.md` — allar file:line vísanir eiga við ÞAÐ repo. Breytingar fara þangað fyrst og eru svo endurafritaðar hingað.

Þú kannt **sölu- og reikningahliðina** — POS-inn, dkPlus/Payday, afsláttar-konvensjónina og PDF-vistun. Grunnregla: **ALLTAF LEYFA VISTUN** (engin form-vörn má blokka), og afsláttur er ANNAÐHVORT bakaður í línu EÐA geymdur í `afslattur` — ALDREI hvort tveggja.


---

# 📚 Þekkingargrunnur — ÓBREYTTUR texti úr CLAUDE.md

> Fluttur hingað 2026-08-01 við uppskiptingu CLAUDE.md (~15k tokens hlóðust í HVERRI
> lotu). Engu breytt, engu sleppt — hleðst aðeins þegar þessi sérfræðingur er kallaður.

## Sjálfvirkur úttektartexti — `js/patches/294-uttektartexti.js` (2026-07-30)

Þegar „✅ Staðfesta lista" er ýtt (patch 224 `.ut-listlock`) myndast textinn í
„📝 Upplýsingar um úttekt" sjálfkrafa — Elías skrifaði hann áður í hverja skýrslu.
**Orðalag og röð (Agnar/Elías, skjalfest):** (1) „Öll tæki yfirfarin og vottuð í
lagi." → (2) hleðsla / ónýtt / ný tæki inn á milli → (3) hausskipti **alltaf beint
á undan** → (4) „Brunaslöngur prófaðar á fullum þrýsting og vottaðar í lagi."
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
  línur/tölur úr `solur`-röðinni; seljandi Slökkvitæki ehf kt 600508-0400.
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
  sendir gegnum `/api/email-send` (Resend) á hvaða netfang sem er (forfyllt með
  sendanda). Tómt ástand er heiðarlegt: húsfélög sem eru rukkuð í dkPlus/Payday
  eiga engar `solur`-raðir → „Engir reikningar fundust".
- **✏️ Breyta** — opnar reikninginn í sölu-ritli (`SaleEditor.openById/openByNum`,
  patch 142). Birtist aðeins þegar R-númer tengdist (`m.sale`).
- **🤖 Svar** — Claude semur STUTT íslenskt uppkast að svari gegnum NÝ Netlify-
  function **`netlify/functions/postur-reply.js`** (`/api/postur-reply`, Haiku,
  ANTHROPIC_API_KEY server-side) út frá póstinum + nýlegum reikningum kúnnans.
  4 stýri-chip (Sendi reikning / Bið um uppl. / Leiðrétti reikning / Staðfesti
  greiðslu). Uppkastið er ritstýranlegt → 📋 Afrita eða 📤 Senda svar (Resend).
  **Skrifstofan yfirfer ALLTAF áður en sent er** — endpoint semur bara uppkast.

- **Sendandi:** `localStorage.email_from` (fallback `Slökkvitæki ehf
  <reikningar@eldklar.is>`) — VERÐUR að vera á staðfestu Resend-léni (eldklar.is).
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

## Payday-spegill — `payday_invoices_slokk` + `netlify/functions/payday-pull-slokk.js` (2026-07-10)

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
