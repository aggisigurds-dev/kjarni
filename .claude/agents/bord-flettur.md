---
name: bord-flettur
description: Flettur, borð og navigation — Verkborð, Bakendi, Bílstjóri, Aksturslisti, URL-routing (218), bakk-takkinn (3 patchar), app-síður (261). Notaðu þegar bætt er við/breytt flipa, borði eða deep-linki. Kveikjuorð: flipi, borð, nav, bílstjóri, aksturslisti, bakk.
tools: Bash, Read, Grep, Glob, Edit
---

> ⚠️ **Afrit í kjarna** (samstillt 2026-10-10). Kanóníska eintakið býr í `slokkvitaeki/.claude/agents/bord-flettur.md` — allar file:line vísanir eiga við ÞAÐ repo. Breytingar fara þangað fyrst og eru svo endurafritaðar hingað.

Þú kannt **viðmótsgrindina** — hvernig flipar/borð eru skráð (DEFAULT_STATE.tabs + renderXxx + dispatcher), URL-routing og bakk-takkann. GILDRA: bakk er á ÞREMUR lögum (18 afvirkur, 276, 277) — ekki blanda þeim.

---

# 📚 Þekkingargrunnur — ÓBREYTTUR texti úr CLAUDE.md

> Fluttur hingað 2026-08-01 við uppskiptingu CLAUDE.md (~15k tokens hlóðust í HVERRI
> lotu). Engu breytt, engu sleppt — hleðst aðeins þegar þessi sérfræðingur er kallaður.

## URL routing (deep links) — `js/patches/218-url-routing.js`

Views are deep-linkable by an ascii page name in the hash, e.g.
`slokkvitaeki.netlify.app/#leidsogn` (Leiðsögn), `#sala`, `#afgreidsla`.
The router wraps `App.switchView` (the nav fn in `js/modal.js`) to mirror the
current view into `location.hash` via `replaceState`, and applies an incoming
`#slug` on boot + on `hashchange`. `ALIAS` (in the patch) maps pretty ascii
slugs → internal view ids (`leidsogn→field`, `afgreidsla→counter`,
`fyrirtaeki→companies`, `tekjur→income`, `bokhald→bokhalds-yfirlit`, …); any
view without an alias is linkable by its own id (`#vorur`, `#companies`).
It ignores `key=value` hashes (`#device=`, `#portal=`, `#tab=`) and the legacy
`#view-…` form. Patch **154** (last-view-memory) was made to yield to any clean
slug hash so a deep link is not overridden by the remembered last view — keep
that cooperation if you touch either file. Add new pretty names to `ALIAS`.

## Djúptenging á fyrirtækjaprófíl — `#company/<id>` ræsingarþolin (06.09.2026, patch 357)

235 (deeplink-subroutes) á `#company/<id>` → `Companies.openDetail`, en FERSK hleðsla með því hashi endaði á `#sala`
með „Hleður…" (mælt 06.09.2026): App.init lendir á Sala, 218 speglar það strax í hashið, eitthvað kallar
`switchView('sala')` um t≈1500 ms og `Companies.load()` endurteiknar listann yfir opinn prófíl (sama og 154 lýsir).
`js/patches/357-fyrirtaeki-djuptenging.js` lagar það: grípur auðkennið VIÐ HLEÐSLU skriftunnar (líka úr
navigation-entry), opnar með `_openCompanySafe` (mapfix.js) og tikkar í allt að 8 s (eða til fyrstu raunverulegu
notendasnertingar) og opnar aftur ef Breyta-takkinn `Companies.openEdit(<id>)` er ekki lengur í `#companies-main`.
Tekur líka `#companies/<id>` og `#fyrirtaeki/<id>` og samræmir í `#company/<id>`. Á `hashchange` (t.d. #company/1101 límt í slóðina) gerir 235 sitt og 357 lagar á eftir (3 s). INNI Í ÖPPUM
(Fjármál/Boss) liggur hubbinn í iframe á ÖÐRUM uppruna og má ekki setja `top.location.hash` (SecurityError —
„ekkert að þessum lista gerir nokkurn skapaðan hlut", Agnar 06.09.2026): hann sendir `postMessage
{type:'slokk-open-company', id}` til foreldrisins; 357 svarar með `slokk-open-company-ack`, felur `#_app-frame` (liggur
ofan á öllu, z-index 2147481000) og opnar prófílinn; komi ekkert ack innan 900 ms opnar hubbinn nýjan flipa.
Hubbinn fær id-in úr `op=stada.kunnaIds` (nafn → id); í venjulegum vafra opnar hann appið í nýjum flipa.
`window.CoDeeplink.open(id)` / `.detailOpen(id)`.

## Þjónustuborð → fyrirtæki: spjaldið tengist fyrirtækinu (06.09.2026, patch 358)

`js/patches/358-verkbord-fyrirtaeki.js` (Verkefnalisti e3e61225, skrifað í Cowork-lotu sem komst ekki að ýta; tillagan
hét 350 en það númer var tekið). Undir `input[data-field="customer_nafn"]` á opnu spjaldi (231) kemur reitur:
„🏢 Opna fyrirtæki" (`_openCompanySafe`, varaleið `#company/<id>` → 357), „📄 Fyrri viðskipti" (`SalaCustomerHistory.open`),
LIFANDI tækjalisti talinn úr `uttaeki` (fyrirtaeki_id) í hvert sinn sem spjald opnast, viðvörun „telst hvergi" fyrir
tæki á status sem síast burt úr öllum listum („Í lagi" 154 / „ok" 74 í grunni 06.09.2026 — Kirkjuvalla-gallinn),
úrelt sýnd dauf (lögmæt staða), síðasta úttektarsala (`solur` source=uttekt, kt → nafn) og hvort hún sé óbókfærð.
Nafnauppfletting afmáð (lágstafir, broddar burt) og segir berum orðum ef nafn finnst ekki / á við fleiri en eitt.
Snertir EKKI 231. `window.VbFyrirtaeki`.

## Eitt samskiptabox á fyrirtækjaprófílnum (06.09.2026, patch 359) + DOM-lykkjur

`js/patches/359-samskipti-eitt-box.js`: 295-boxið („Póststaða & samskipti") er FALIÐ á prófílnum (CSS), og það sem það
gaf umfram 286 („Samskiptasaga & beiðnir", les beint úr `felag_samskipti`, síðasti póstur strax) er fært sem ræma
inn í 286-kortið: umferðarljós (`CompanyMail.status`), merkin (uppsögn/flutt/kvörtun…), ⭐ Mikilvægt / 🔕 slökkva
ósvarað (`CompanyMail.setImportant/setMuted` → AppSettings, samstillt). „Öll póstsaga" varð „⬇ Eldri póstar" neðst í
póstlistanum (`company-mail?co=`, bætir við þeim sem 286 sýnir ekki). Kortið er skreytt utan frá með undirskrift og
throttle; listamerkin 🔴🟡🟢 á Fyrirtæki í þjónustu eru óbreytt. 286 fékk 20 s öryggisventil á `_running` (hangi sókn
læsti spjaldið úti). Ósk Agnars: „sjá seinasta póstinn strax", „sameina bæði póstforritin í eitt".

**DOM-lykkjur (sama kvöld):** síðan mældist með ~2.500 MutationRecords/s í kyrrstöðu — 01-sala-suite vs 06-pos-fixes
(`.sm-toolbtn` 170×/s) og 244-sidebar-svg-icons (`<path/>` ≠ `<path></path>`, 1.170×/s) — lagað → ~25/s. Afleiðingin
var að debounce-vaktir hlupu aldrei (286 skjalfesti það sjálft 30.07). Aðferð + reglur: `.claude/skills/frontend-profiler`.
Eftirstöðvar á Verkefnalista d9024a61.

## Ræsi-skyndiminni (06.09.2026, patch 360)

`js/patches/360-raesi-skyndiminni.js`: síðasta vel heppnaða `DB.loadAll` (jobs, units, schedule, history) og `Companies.list`
geymd í IndexedDB (`slokk-boot`/`snap`) og sett í `DB.cache` um leið og appið ræsist (tugir ms) → `DB.online=true` →
`App.refreshAll()`. Upprunalega `loadAll` keyrir svo ÓBREYTT í bakgrunni (mælt fyrir: ~4,3 s, 86 REST-köll við
ræsingu) og skiptir öllu út fyrir ferskt; eftir hverja vel heppnaða hleðslu er myndin geymd aftur. Þetta er skyndiminni
sem þjónninn endurhleður (SAMSTILLT-reglan heldur). uttaeki hefur ekki updated_at → „aðeins breytingar" ekki hægt án
skemabreytingar. `window.RaesiCache.stada()` sýnir hydratedAt/snapAge; `RaesiCache.hreinsa()` tæmir. Bili IndexedDB
gerist ekkert. Ástæða: Agnar „fyrirtækjasíður oft mjög lengi að opnast" → „já máttu reyna endurbæta".

## Þjónustuborð: mál tengjast fyrirtæki með AUÐKENNI (07.09.2026)

`thjonustubeidni.fyrirtaeki_id` (FK → fyrirtaeki, migration `thjonustubeidni_fyrirtaeki_id`, 142 mál bakfyllt þar sem
nafnið passaði nákvæmlega við eitt fyrirtæki; 631 mál eru einstaklingar/frjáls texti og fá ekkert id). 231: `loadCompanies`
ber nú `fid`+`src` á fyrirtækjaraðir, ✏️ Tengja (`selco-save`) og nýtt mál skrifa `fyrirtaeki_id` (null ef nafnið er
ekki fyrirtæki). 358f: reiturinn les `fyrirtaeki_id` málsins fyrst (🔗 fest tenging), nafn til vara; finnist fyrirtækið
aðeins eftir nafni býður hann „📌 Festa tengingu" sem skrifar id + customer_base_id á málið. `customer_nafn` er
birtingarnafn, ekki lykill (villuleit-reglan „röng join"). Agnar: „uppfæra þjónustuborðið svo það sé hægt að vinna með það".

## Allir viðskiptavinir (157): töflusnið eins og Fyrirtæki í þjónustu (07.09.2026)

Listinn (`renderList`) notar nú `.data-table-wrap/.data-table.no-skin` með eigin CSS `_av-tbl-css` sem er afrit
af `_ensureMockCss` í 153 (153 má ekki snerta): dökkt málm-band í haus, 44 px raðir, `._co`/`._kt` staflað,
50 raðir á síðu (`state._page`, `_tfoot` SÝNI a–b AF n, #_av-pgprev/#_av-pgnext; ný sía/leit/röðun → síða 1).
Athugasemd er ein-lína `input._av-note._note` (þunn punktalína — Agnar: „textaboxið svo yfirþyrmandi"), vistast
800 ms eftir síðasta staf og strax við Enter/blur; `data-save` pending/saved/error litar línuna og `saveNote`
skilar false þegar supabase-js skilar {error}. Dálkur SÍÐAST (`_last` úr `lastYearsFor`): 📝 síðasta
úttektarskýrsla og 🧾 síðasti úttektarreikningur — customer_documents (uttektarskyrsla / reikningur uttekt|null,
is_duplicate=false) á fyrirtaeki_id, ∪ uttekt_reikningur_facts, ∪ solur (uttekt, final); base-id aðeins til vara
og þá strikað (via=kt). Litir eins og árs-perur 153: í ár grænt, í fyrra gull, eldra rautt. Röðun `last`.
Gildra: bstal-content-skin + bstal-polish setja `.view table tbody td{padding:10px 14px!important}` — þess
vegna !important á td-padding og `no-skin` á töflunni (annars 49 px raðir og klipptur aðgerðadálkur).
351 (á staðnum) reiknar colspan úr `row.children.length`, svo dálkafjöldinn er frjáls.

**Reikningaflokkun (157c, sama dag):** Skjöl-pillurnar eru S/Ú/R/B/? — R = úttektarreikningar (reikningur með
vidskiptategund uttekt eða ∅), B = búðarkaup (bud), ? = óvisst/annað; `_reikCntByF/_reikCntByBase` úr sömu
customer_documents-sókn (nú án `year`-síu; árlausir seðlar telja í fjölda, ekki í ár). Regla Agnars: reikningur
með „Akstur" innan í er úttektarreikningur → sýnin `v_solur_uttektarreikningar` (final-sölur með uttekt EÐA
Akstur/Skýrslugerð-línu) gefur 🧾-árið. Payday-reikningar hafa engar línur í grunninum, svo reglan er aðeins
sannreynanleg á sölum appsins og í uttekt_reikningur_facts (060). Yfirferðarlisti: `claude/an-samnings-uttekt-2026-09-07.md`.

## Brunakerfi-síða fyrirtækis: staða eftir ári (07.09.2026, 274 + 291)

274 (`_bkc-overlay`) sýnir nú EITT kort „🔥 Brunakerfi — staða eftir ári" í stað tveggja (Brunakerfisskýrslur / Eldri
skýrslur & skjöl): hvert ár er blokk með stöðupillu (LOKIÐ · GREITT / LOKIÐ ✓ / SKÝRSLA LOKIÐ · VANTAR REIKNING / Í VINNSLU /
SKÝRSLA (PDF) / VANTAR / EKKERT SKRÁÐ), skýrsla-línu (app-skýrsla final/drög OG Drive-skjöl, mánaðarval, Opna/Senda/🗑) og
reikningur-línu (`_inv` úr 291: num · kr · drög/stofnaður/sendur/greiddur). Grænn punktur = til, brotinn gulur = vantar —
sama myndmál og Ársskoðun (199). Yfirstandandi ár er alltaf með (VANTAR ef ekkert). Sömu data-attributes og áður
(`data-open/del/send/invpdf/docsend/docdel`, `._bkc-monsel`) svo víringin er óbreytt. 291 `findInvoice` ber nú
paid_at/krafa_sent_at/invoiced_at og stöðulínan efst notar sama orðalag. Ósk Agnars: „óskýrt hvað er búið… 2026 niður
hjá eldri skýrslum… líkara ársskoðun".

## Bakk-takkinn — ÞRÍR patchar, ekki blanda þeim saman

Bakk er leyst á þremur aðskildum lögum. Áður en þú breytir einhverju hér:
lestu öll þrjú, því þau grípa sama atburðinn.

- **`18-nav-history.js` — AFVIRKJAÐUR (`return` í línu 23, síðan 2026-05-12).**
  Hann rændi innbyggðu „Til baka"-tökkunum og keyrði þá gegnum eigin stafla sem
  fór úr takti við það sem var raunverulega á skjánum („Til baka gerir ekkert"
  gallinn; patchar 100 + 136 voru bara til að afvopna hann). **Ekki endurvekja.**
- **`276-brunakerfi-back.js` — bakk lokar efsta LAGI** (gluggar, form, ritlar,
  verðlista-ritill, greiðsluglugginn …). Ýtir færslum **án** slóðarbreytingar.
  Í uppsettu öppunum (`/app/<key>/`) er læst buffer svo bakk loki aldrei appinu;
  Bílstjórinn á sitt eigið `armBack` í 219.
- **`277-nav-back.js` — bakk fer á fyrri SÍÐU í appinu** (2026-07-22, ósk
  Agnars: bakk „turned off the program" hversu langt sem maður var kominn inn).
  Ástæðan: 218 og 235 skrifa slóðina viljandi með `replaceState`, svo appið bjó
  ALDREI til bakk-færslu — `history.length` stóð í stað hvað sem flakkað var.
  277 vefur EKKI utan um `switchView`/`setHash`; hann tekur eftir því þegar
  slóðin breytist eftir notenda-aðgerð án þess að sagan lengist og endurgerir þá
  skrifin sem alvöru færslu. Þess vegna nær hann líka yfir borð-patchana sem
  skrifa sinn eigin hash (219/231/232/239). Beðið er eftir að slóðin sitji kyrr
  (~240ms) svo tveggja-skrefa skrif 235 (`#fyrirtaeki` → `#company/293`) gefi
  EINA færslu en ekki tvær.

Lögin stafla rétt: 276 situr ofan á 277, svo bakk lokar fyrst opnum glugga og
fer svo á fyrri síðu. **Ef þú bætir `pushState` við einhvers staðar annars
staðar skaltu athuga hvort 277 sé þegar búinn að því** — annars fær ein aðgerð
tvær færslur og notandinn þarf að ýta tvisvar á bakk.

## Bílstjóri (Drivers app) — `js/patches/219-bilstjori.js`

Mobile-first driver page (`view-bilstjori`, slug `#bilstjori`/`#drivers`). Fuses
Leiðsögn (patch 161) + Fyrirtæki í þjónustu + the `uttaeki` inspection model and
**reads/writes the same stores** (no parallel data):
- **Driving list** — in-service customers needing work (Útrunnið / Þessi mánuður /
  🚩 Áríðandi), coloured by the SAME `statusFor` rule as Leiðsögn (computed from
  `arsskodun_customers[id]` via `AppSettings`). "📋 Dagsins verk" vs "🏢 Allir í
  þjónustu" toggle + search.
- **Company sheet** — "🧭 Keyra þangað" (Google Maps, reuses the `_slokk_gc`
  geocode cache + `Leidsogn.addToRoute/launchNav`), tel: call, shared
  **minnispunktar** + an 🚨 **urgent** message (both saved to
  `arsskodun_customers[id]` via `AppSettings.save`, so they sync office↔driver and
  appear in Leiðsögn), and the **tækjalisti**: each tæki has a tap-to-roll chip
  ⚪ Óskoðað → 🟢 Yfirfarið → 🔵 Á verkstæði, writing `uttaeki.status`
  (+`last_insp`/`next_insp` on Yfirfarið — same columns `DB.addInspection`/patch 90
  write; `loaned` = á verkstæði/hleðsla).
- "✅ Tekið út" sets `field_inspected_year` (the amber "tekið út — skjöl eftir"
  state the office report flow then turns green). "🚗 Keyra leið dagsins" routes
  the due list via Leiðsögn.

Mobile rules applied: ≥44px targets, ≥16px text, primary actions in the bottom
thumb-zone, stack nav (top-left back), loading/error/offline (DB.cache) states.
Wired like patch 161 (sidebar button + `App.switchView('bilstjori')` hook + mirrors
`#bilstjori` into the hash). Linkable via patch 218 ALIAS. Full-screen: the view is
appended to `<body>` (so the `position:fixed` overlay isn't trapped by the content
panel's transformed ancestor) at `z-index:1000`, and `body.bs-active` hides the
sidebar; the company sheet sits at `z-index:1100`.

**Locked driver mode (`?driver` / `/app/bilstjori/`)**: the share link + the PWA
`start_url` are `/app/bilstjori/` (own manifest `manifest-bilstjori.json` with
`id`/`scope`/`start_url` `/app/bilstjori/` + own icons `img/app-bilstjori-*.png`,
so it installs as a SEPARATE app from the main one — whose `manifest.json` has
`"id": "/"` + `start_url "/"`); `/?driver` stays a valid legacy alias. When that param is present (`LOCKED`), the app opens straight into
Bílstjóri, drops the ✕ exit button, and any `App.switchView` away snaps back —
so a driver can only see Bílstjóri. The office keeps full access via the bare URL.
It's a focus lock, not security (client-side, anon Supabase key). The 🔗 button and
the boot deep-link re-assert (outlasts the sala.js boot-lander) live here too.

## Aksturslisti (vakt-yfirlit skrifstofu) — `js/patches/268-aksturslisti-vakt.js`

Sjálfstæð skrifstofu-síða (view `view-aksturslisti`, slug `#aksturslisti`/`#vakt`,
hliðarstiku-hnappur „🚚 Aksturslisti") — les-only yfir `bilstjori_vakt` (patch 219)
+ `arsskodun_customers` (akstur 1/2/3) + `uttaeki`. Fjórir hlutar: **🗺️
Akstursleiðir** (3 leiðir + fyrirtækin á þeim, N/M kláruð, gráir→grænir strikaðir),
**🔧 Á verkstæði — á eftir að skila** (`uttaeki.status='loaned'` grúppað per
`client`), **👷 Starfsmenn í dag** (samantektar-spjöld: 🏢 fyrirtæki · 🟢 yfirfarið
· 🔵 verkstæði · ✅ kláruð · Σ), **kort** (síðasta staðsetning + slóð dagsins per
starfsmaður) og **🧭 Rakning dagsins** (tímaröð aðgerða). Verkstæðis-lífsferill: „Á verkstæði"-hlutinn er nú **gagnvirkur** — hvert tæki
(`uttaeki.status='loaned'`) fær verkstjóra-þrep gegnum `custody_status`: null
(Nýkomið) → `komid` (Komið á verkstæði) → `tilbuid` (+ `service_choice`
hladid/onytt/nytt) → `farid` (Farið af verkstæði → „Bíður skila hjá bílstjóra").
Bílstjóri (219) skilar: 🔵 Á verkstæði-chip → tapp → 🟢 Yfirfarið (status='ok',
hreinsar custody_status/service_choice), svo tækið dettur af verkstæðis-borðinu.
Bílstjóri fékk líka 🗑 **eyða-tæki** takka (leiðrétting þegar skýrsla var mistalin).
Dags-val (◀ Í dag ▶) +
starfsmanna-sía + 60s auto-refresh. Wiring: script í index.html (eftir 267),
`App.switchView`-hook, patch 218 ALIAS (`aksturslisti`/`vakt`), klónaður
hliðarstiku-hnappur. `window.Aksturslisti = {open, reload}`.

**Vakt — starfsmanna-nafn + dagleg virkni + staðsetning (2026-07-14):** driver
picks their name (`EMPLOYEES = ['Hákon','Binni','Elías']`, stored `localStorage
.bs_employee`; locked-boot prompts if unset, office can skip). Every action is
logged to Supabase table **`bilstjori_vakt`** (`employee, action, co_id, co_nafn,
uttaeki_id, lat, lng, created_at`; RLS off, anon full) via `logAct(action,opts)`
with best-effort `navigator.geolocation` (watchPosition). Actions: `visit`
(openCompany), `yfirfarid`/`verkstaedi` (tæki chip-roll), `company_done` (Klára
úttekt), `ping` (every 4 min). A **„📊 DAGURINN Í DAG"** band on the main list
(`#_bs-vakt`, `renderVakt`) shows per-driver today: 🏢 distinct fyrirtæki · 🟢
yfirfarið · 🔵 á verkstæði · Σ heild · last-seen; polls every 60s so the office
sees all drivers live. Each driver's last-known position draws a coloured
name-marker on the map (`_driverMarkers`, `_vaktGeo`). API: `window.Bilstjori
= {…, renderVakt, pickEmp, getEmp}`.

## Verkborð (unified work board) — SÖGULEGT, papp 231 er ekki lengur til

> **30.09.2026:** `js/patches/231-verkbord.js` var fjarlægt í commit d3eb1b78
> („gamla borðið (231) og spjallið (347) út; 368 tekur við"). Borðið í dag er
> **`js/patches/368-thjonustubord5.js`** (Þjónustuborð 2, Shadow DOM). Kaflinn
> hér að neðan lýsir gagnalíkaninu sem 368 erfði — `thjonustubeidni`-taflan og
> slug-arnir standa — en ekki skránni sjálfri.

One tool that replaces the cluster of overlapping top-of-sidebar lists
(Verkefni #145 · Þjónustuverk #172 · Beiðnir/Þjónustuver #182 · Eftirfylgni
#194) and folds in Verkdagbók #04. Slug `#verkbord` (and `#verkefni` → same).

- **Data: BEINT í `thjonustubeidni`** (the same table Beiðnir #182 already uses —
  no new table). Reads `select('*').is('deleted_at',null)`, inserts via quick-add,
  `update().eq('id',…)`, soft-delete sets `deleted_at`. Verkdagbók entries are read
  **live** from `verkdagbok` (done=false, archived=false) as read-through pseudo-rows
  (`id='vd:<uuid>'`, type `verkdagbok`) — clicking opens Verkdagbók to edit; ✓ writes
  `verkdagbok.done`. Structure of #04 is preserved (not copied/flattened).
- **Fast capture** front-and-center: type + Enter inserts a `thjonustubeidni` row
  (`status:'nytt'`, `source:'beint'`). One-tap type chips (Tilboð/Póstur/Skýrsla/
  Heimsókn/Annað → `type`).
- **Queues**: Í dag (important OR due≤today) · Allt opið · Lokað, + type-filter chips.
  Sort = áríðandi → útrunnið → gjalddagi → forgangur → nýjast. `due_at` drives the
  overdue (red) pill via `dueInfo()`.
- **TYPES** map includes the legacy #182 keys (`skodun_tilbod`/`nyr_samningur`/
  `uttekt_eftirfylgni`) so old rows still chip correctly; `TYPE_GROUP` maps filter →
  real type values.
- **AI**: reuses the existing `/api/tv-summary` (Haiku) endpoint — shows cached
  `summary` and a per-item ✨ Tillaga button. Deeper/auto AI is phase 2 (the schema
  already has `summary`; no migration was needed).
- **Migration** (explicit, idempotent): „⬇︎ Flytja inn úr gömlu" imports OPEN items
  from `AppSettings.todo` (cards) + `AppSettings.thjonustuverk` (cases), deduped by
  `channel_ref='imp:verkefni:<id>'`/`'imp:tverk:<id>'`. Beiðnir already live in the
  table; Eftirfylgni is derived state (not imported).
- **Retire-old (once, reversible)**: on first open, adds
  `['verkefni','thjonustuverk','thjonustuver','eftirfylgni']` to `sidebar_hidden`
  and prepends `verkbord` to a custom `sidebar_order` if one exists, guarded by
  `settings.verkbord.retired_v1`. Un-hide anytime in Stillingar → Valmynd. Old
  patches/data are untouched. Placed at the **top** of the sidebar via patch 68's
  ORDER (`['Verkborð']` first).
- Wired the 3 standard spots: `<script>` in index.html (after 230), `App.switchView`
  hook (`patchSwitchView`), and patch 218 ALIAS. `window.Verkbord = {open,reload,importOld}`.
- **Þjónustuver-samruni (2026-07-10, ósk Agnars — „nota bara borðið fyrir öll
  samskipti"):** Verkborð er nú EINI þjónustuverið. Quick-skráningarlínan fékk
  fyrirtækjareit (datalist úr `fyrirtaeki`, tengir `customer_base_id` við nafna-
  match) + lita-tegundarchippa + „⚙ Fleiri valkostir" (skráir OG opnar ritilinn
  strax). „✉️ Sækja tölvupóst" chip endurnýtir póst-innsogið úr Þjónustuveri
  (`Thjonustuver.ingestEmail`, exportað úr 182 — sama `thjonustubeidni`-tafla,
  idempotent á `channel_ref='email:<id>'`). **Svara beint af borðinu:** email-
  beiðnir (`source='email'` / `channel_ref` byrjar á `email:`) fá „✉️ Svara"-takka
  í ritlinum → `replyToBeidni` flettir upp `email_digest`-röðinni og kallar
  `ReikningaPostur.replyTo(m)` (exportað úr 240) — sami Claude-uppkast (`/api/
  postur-reply`) + Resend-sending (`/api/email-send`) og í Reikninga-pósti.
  `replyTo` er sjálf-innihaldið (sprautar sína `#_rp-modal` stíla, festir á
  `<body>`, tengir sendanda-netfang → kúnna fyrir reikninga-samhengi). Röðunar-
  chippar (⭐ Snjallröðun / 🕒 Nýjast efst) og sýn-rofi (☰ Þétt / ▤ Ítarlegt).
  **Sími-fyrst (2026-07-10, eftir „algjörlega ónothæft"-kvörtun):** stjórn-
  borðið fyllti heilan símaskjá áður en fyrsta verkefnið sást → allar chippa-
  raðir eru nú EIN skrunanleg lína (`.vb-scroll`, nowrap+overflow-x) í stað
  5-línu veggja. Fyrsta útgáfan faldi aukahlutina bak við fókus/„⚙ Meira" en
  Agnar hafnaði því („settu aftur tögin… eða revert") — ALLT er sýnilegt, bara
  þjappað. show() speglar líka `#verkbord` í hash sjálft — 231-switchView-
  wrapperinn skammhleypir framhjá 218-speglinum svo hash sat áður fast á #sala.
  **Þjónustuborð v2 (2026-07-10, eftir greiningu + „now you are head office
  CRM manager"):** Full endursmíði ofan á Verkefni/Pósthólf-skiptinguna.
  Biðraðir: **📥 Innhólf** (email, `promoted_at IS NULL`, `archived_at IS
  NULL`) · **📋 Verkefni** (handvirkt + fært yfir) · **✓ Lokað**. Innhólfið er
  í köflum: „🔴 Bíða svars" (ósvarað, ELSTU efst, biðdagar á chippa) → „Svarað
  & upplýsingar" → „📦 Sýna eldri póst (N í geymslu)". Morgunlína efst í
  stjórnborðinu („X póstar bíða svars · Y verk í dag · Z fram yfir") og
  badge-inn telur wait+idag. **Flokkarnir fimm** (`thjonustubeidni.flokkur`,
  additive: tilbod/thjonusta/brunakerfi/rukkun/samskipti + null=Annað) voru
  áður aðal-sían og eigin (ljós) chippa-tegund á röðum. **2026-07-22 (PR #456,
  ósk Agnars „það sýnir tvær tegundir af tögum") var þetta sameinað í EITT
  merkjakerfi:** flokkurinn hefur enga eigin chippa-tegund og engan fellilista
  í ritlinum lengur, heldur er þýddur yfir í sitt eigið MERKI gegnum
  `FLOKK_TO_TAG` (rukkun → „Eftir að rukka") og birtist fremst sem venjulegur
  dökk-metal chip. `rowChips(r)` = flokks-merkið ∪ `dispTags(r)` og er notað
  fyrir chippa, síur, talningar OG hökin í ritlinum, svo hak og chip segja
  alltaf það sama; `tagtoggle` hreinsar flokkinn þegar slökkt er á merki sem
  hann leiðir af sér. TÖG-sían tekur nú FLEIRI en eitt merki (`state.fTags`
  fylki, sameining, „✕ Hreinsa"). `flokkChip`/`TAG_TO_FLOKK` eru horfin og
  flokka-sían (`fFlokk`) er óvirk — hún átti enga hnappa en las samt vistað
  gildi úr localStorage, sem hefði síað borðið án leiðar til að slökkva.
  `flokkur`-dálkurinn sjálfur stendur óbreyttur í grunninum. „Svarað"-greining:
  `svarad_at` (sett þegar svar er SENT af borðinu — 240 `replyTo` kallar
  `m._onSent`) EÐA `threadLatest.mine` (SENT-ingest gerir það satt). Aðgerðir:
  📋 Færa/↩, 📦 Í geymslu/↩ Út, ✓ Klára verk, 📞 Hringja (tel:-hlekkur úr
  fyrsta símanúmeri), ✉️ Svara, 🧾 Fyrri viðskipti. **CRM-forvinnsla í grunni
  (2026-07-10):** 348 tómar browser-extension raðir eyddar úr email_digest;
  70 beiðnir tengdar við customers_base (kt→netfang→lén ladder); allar opnar
  flokkaðar í flokkana fimm (leitarorð/merki/tegund); 406 gamlar póst-raðir í
  geymslu (`archived_at`, ekkert eytt); 75 opin atriði FLUTT INN úr gömlu
  listunum (145 todo-spjöld + 172 þjónustuverk-mál, `channel_ref
  imp:verkefni:/imp:tverk:`, merki/forgangur/fyrirtæki fylgdu); AI-samantekt
  (tv-summary) á öll virk verk; 1 „✅ líklega búið" (greitt í Payday).
  **Sent-póstur:** luna-bridge les nú SENT-möppur (PR #4) og brunaholf
  gmail-ingest tekur `folder=sent` (PR #225, + tómra-pósta vörn í
  email-ingest-browser og folder-varðir á lesendum); 240 síar `.neq('folder',
  'SENT')` svo eigin svör birtist ekki sem „Til að svara", en 231
  loadThreadLatest les SENT viljandi (svarað-greining). Fyrirtækjareiturinn í
  skráningarlínunni tekur líka KENNITÖLU: 10 tölustafir → `/api/kt-lookup`
  (RSK) → opinbera nafnið fyllist og kt+heimilisfang fara í nótur
  (`state.addRsk`).

## Bakendi (gagnalíkans-stjórnborð) — `js/patches/232-bakendi.js`

Admin / „backend" page over the data model. View `view-bakendi`, deep-link
`#bakendi` (patch 218 ALIAS). Five tabs:
- **📊 Yfirlit** — per-table row counts + „gagnaheilsa" cards (clickable → jump
  to the relevant tab): fyrirtæki without kt, úttæki not linked to
  `customers_base`, orphan client strings, viðskiptavinir without kt.
- **🔗 Client-greining** — data genealogy: every `uttaeki.client` free-text
  string classified 🟢 linked to `customers_base` / 🟡 name-match only / 🔴
  orphan, with search + filter; links through to the company page.
- **🏢 Rekstrarfélög** — rollup from `customers_base.rekstrarfelag` + equipment
  count; links to the Rekstrarfélög page.
- **🗺️ Skema** — the data model + FK relationships with live row counts; flags
  the `tengiliður`/`tengilidur` duplicate column on `fyrirtaeki`.
- **🛠️ Endurhönnun** — known data problems + suggestions, and a live „vantar
  kennitölu" list (sorted by equipment count — those that own tæki first).

**Data: four read-only Postgres views** (created 2026-06-22, `SELECT` to `anon`):
`v_bakendi_overview` · `v_bakendi_uttaeki_clients` · `v_bakendi_rekstrarfelog` ·
`v_bakendi_missing_kt`. The frontend only does `DB.sb.from(view).select('*')` —
reads stay view-based — but **2026-06-23** the „Vantar kennitölu" list (Endurhönnun tab) is inline-editable: type a kt + „Vista" → `saveMissingKt` writes it to the source table (`fyrirtaeki`/`vidskiptavinir`/`customers_base`, `update({kennitala}).eq('id',…)`) and drops the row + decrements the count. No schema change.

Wiring mirrors kerfi-registry (221): new `view-bakendi` div, cloned sidebar
button, `App.switchView` patched for the `#bakendi` deep-link + boot re-assert.
`window.Bakendi = {open, reload}`. NB built in a parallel session as patch 231,
then renumbered to **232** because Verkborð (#196) landed on slot 231 first.

## App-síður (patch 261) — Jarvis + Rekstrarfélög (2026-07-31)

Fjármála-appið (og Brunahólf-appið) fá tvær síður í viðbót, gegnum SAMA
`PAGES`-lista og allt annað — engin ný umgjörð:

- **`rekstrarfelog`** — INNBYGGÐ slökkvitæki-síða. Patch 175 skýtur inn
  `.vnav-btn[data-view="rekstrarfelog"]`, og `navTo()` í 261 leitar einmitt að
  þeim hnappi og smellir á hann (fellur á `App.switchView` ef hann finnst ekki).
  Þess vegna dugði að bæta einni línu í `PAGES` — 175 skráir sig ekki á
  `App.switchView`, svo hnappa-leiðin er sú sem virkar.
- **`br-jarvis`** — sjálfstæð Brunahólf-síða (eins og Verkkaupar: eigin haus,
  engin hliðarstika) → BEIN slóð `…/jarvis.html?embed=1`. `?embed=1` þrengir
  spássíur og setur KJARNANN efst í eins-dálks útlitinu.

**Vistaðar stillingar:** `defaults` gildir aðeins um NÝJA uppsetningu, svo báðar
fóru líka í einskiptis-`insertOnce`-migrations (`__rf1`, `__jv1`, `__jv1b`) — sama
mynstur og `__brky1`/`__vkp1`. Þær bætast við ÞEGAR-vistaðar stillingar EINU SINNI;
af-haki notandinn þær eftirá troða þær sér ekki inn aftur.

## Þjónustuver póstar (síða patch 309, 2026-08-20)

Ný SJÁLFSTÆÐ síða fyrir kúnnaþjónustu Í PÓSTI — aðskilin frá Þjónustuborði
(patch 231, sem er áfram innra skipulag). Nákvæmt 231-mynstur: `NAV_KEY=
'thjonustuver-postar'`, view `view-thjonustuver-postar`; `injectNav()` bætir
`.vnav-btn`, `ensureView()` klónar `.view`-klasann inn í content-panel,
`patchSwitchView()` grípur `App.switchView('thjonustuver-postar')`, deep-link
`#thjonustuver-postar` (patch 218 leysir sjálfkrafa því view-ið er búið til við
boot). Sidebar-röð (patch 68) við hlið Reikninga-pósts. `waitForSB()` bíður eftir
`DB.sb` — síðan opnast stundum (deep-link á síma) á undan `DB.init()`.

- **Gögn:** `sb.rpc('tv_postar_list')` (Brunahólf SQL `public.tv_postar_list()`,
  SECURITY DEFINER + hækkað `statement_timeout`) hópar in-service kúnna
  (`er_i_thjonustu`) + pósta þeirra server-hlið — því `felag_samskipti`-viewið
  fellur á statement_timeout í full-scan úr anon.
- **✨ AI-yfirlit:** `/api/postur-triage` `mode:'thjonustuver'` (Haiku, server-hlið)
  → summary/ask/details[]/contact/needs_action/reply_hint. ⚠️ briefs eru lyklaðar á
  STRENG (Object.keys) en póst-id úr RPC er tala → nota `String(id)` við get/has/set.
- **Svarstaða:** cutOf (patch 286) + eigin „svarað"-merki í `localStorage.tvp_handled`
  (lifir innsognstöf) + AI `needs_action` (þaggar „takk"-pósta) + 150 d. recency-gólf.
- **Aðgerðir:** ✍️ Svara (uppkast `/api/postur-reply` → sending gegnum AppMail/
  email-send eins og patch 240), → Flytja á Þjónustuborð (`thjonustubeidni`,
  `channel_ref='email:<id>'`, ekki tvítak), ✓ Merki svarað. Public:
  `window.ThjonustuverPostar = {open, reload}`.

---

## Öpp-fylkið og símaramminn (29.08.2026)

**Fylkið** á Öpp-síðunni (`view-opp`, patch 261) listar síður sem raðir og öpp
sem dálka, með haki á hverjum skurðpunkti. Útgáfur (v1/v2/v3) raðast undir
móðursíðuna gegnum `VARIANT_OF`.

**↗-hnappurinn FLAKKAR EKKI LENGUR BURT.** Hann opnar símaramma (patch 320)
ofan á fylkinu, svo röðin sem verið er að meta tapast ekki:

- síða með eigin `url` (Brunahólfs-flipi) → römmuð óbreytt
- síða inni í appinu → römmuð sem RAUNVERULEG app-síða:
  `/?app=<lykill>&devframe=simi&page=<síða>`

`SlokkDevFrame.open(devKey, { url, title })` tekur við slóð; án hennar er
hegðunin sú gamla (núverandi síða). `?page=<lykill>` verður að stillast Á UNDAN
`buildShell()` — verndarinn í `patchSwitchView` snappar aftur á `_curPage`
fyrstu 12 sekúndurnar, svo `switchView` EFTIR shellið er kastað til baka.

### ⚠️ Pappanúmer — athugaðu áður en þú býrð til nýjan

Þrjú handoff-skjöl í röð lögðu til númer sem voru upptekin. Staðan 29.08:

```
312 canon-stadur      315 fjarmal-app-compact
313 contrast-clarity  316 simi-boards
314 simi-compact-layer + 314-arsskodun-mobile-compact  ← TVÆR skrár
317 arsskodun-bilstjori   318 honnunarhamur
```

`314-arsskodun-mobile-compact.js` er **aftengd úr index.html** (skráin er kyrr):
hún þjappaði skjáborðstöflunni sem birtist ekki lengur í síma, en reglur hennar
á `._ars-mo` og `._ars-filterstrip` voru enn virkar og unnu inline-stíla tvisvar
sama daginn. Tvö lög á sama borði — ekki endurtengja hana.

## Króm-zoom fyrir síma + manifest notenda-búinna appa (06.09.2026, patch 353)

**Rót:** Chrome á S26 Agnars keyrir síðuna í „Tölvusíða"-ham → layout-viewport ≈ 980 CSS-px
á 411 dp skjá (Ársskoðun·Skjár ≈ 1110). Fasta króm-ið (`#_app-hdr` 48px, `#_app-nav`,
`#bstal-banner`, `#_mnav_btn` 44px, `#_app-zoom`) birtist því á ~0,42 — 48px haus = 20 dp.
Síðuzoomið (333) skalar aðeins `.view.active`. Fjármál-appið á símanum sýndi rétta stærð
af því að það er sett upp af ÖÐRUM uppruna (Netlify deploy-preview → „Collaborate"-stika).

**353 `js/patches/353-simi-krom-zoom.js`:** mælir `innerWidth / screen.width` (eða
`1 / visualViewport.scale`) á snertitæki og setur CSS `zoom` = hlutfallið á króm-ið eitt
(`html.app-krom-zoomed`, `--app-krom-zoom`). Fyllingar eru MÆLDAR (`getBoundingClientRect`
= raunpixlar) og deilt með zoom `.view.active`: `window.__appHdrPad` (314 pinPad les það),
`__peBannerPad` er getter/setter-shim (323 skrifar hrágildið, mobilenav.js + 314 lesa mælda).
`#_app-frame` (iframe-síður, t.d. Boss-heimasíðan) fær `zoom: var(--app-page-zoom)` og
`top` stimplað; 261 `syncFrameBottom` deilir með zoom og stimplar `bottom` !important
(316 negldi 64px → stikan huldi neðstu 57px). Í raunstærð fá ÖLL öpp sömu botnstiku
(76×62 px, emoji 24) — 316-þjöppun og 349 Boss-tvöföldun voru bætur fyrir 0,42-skalann og
standa óbreytt þegar hlutfallið er 1. Handstilling/prófun: `AppKrom.set(2.4)` · `AppKrom.set('auto')`
(`localStorage.app_krom_zoom`). Herming í Browser pane: `resize_window 980×1940` + `AppKrom.set(2.4)`.

**336:** `desired()` skilar nú alltaf `initial-scale=1` — speglaði áður síðuzoomið í
initial-scale (tvöföld stækkun á venjulegum síma: CSS-zoom × klípa).

**Manifest fyrir notenda-búin öpp:** `netlify/functions/app-manifest.js` →
`/api/app-manifest?key=&name=&emoji=&color=&dark=&blurb=` (id/start_url/scope = `/app/<key>/`,
tákn = aðal-app-táknið `img/icon-192/512.png`). 261 `effectiveApp()` býr slóðina til fyrir
`custom`-öpp (`customManifestUrl`) og launcher-kortið sýnir „⤓ Setja upp í síma" líka á þeim.
Áður: ekkert manifest → Chrome bauð aldrei uppsetningu („get ekki installað Ársskoðun app").

## Öpp-stýriborð (354) + árekstrar uppsetninga (06.09.2026)

**Árekstrarrót („get bara haft fyrsta sem ég installaði"):** `<link rel=manifest>` benti á
aðal-manifestið (id „/") við hleðslu á `/app/<key>/` fyrir NOTENDA-BÚIN öpp; 261 skipti
fyrst eftir ræsingu. Chrome sótti stundum manifestið á undan → öll slík öpp fengu sama id
og aðeins fyrsta uppsetningin lifði. Lagað: head-veljarinn í `index.html` setur
`/api/app-manifest?key=<key>` STRAX fyrir lykla sem byrja á `x` (261 `customKeyFor`), og
261 `customManifestUrl()` notar SÖMU key-only slóð (fallið les nafn/lit úr
`app_settings.settings.custom_apps_json` + `app_profiles_overrides_json` með service-role).
Innbyggðu öppin voru þegar með sér manifest í head-veljaranum.

**354 `js/patches/354-opp-styribord.js`:** spjald `#_op-styri` efst á `#view-opp` (sett inn
aftur af MutationObserver þegar 261 `render()` endurteiknar). Tæki + útgáfa (skjár dp, síða
CSS-px, Tölvusíðu-hamur greindur = `AppKrom.auto() ≥ 1,2`, króm, zoom, keyrir sem app/vafri,
BUILD, SW), króm-stærð (`AppKrom.set`) og síðuzoom (`AppPageZoom.set`, sömu þrep og 333),
öpp á tækinu með stöðu (`getInstalledRelatedApps` — `manifest.json` fékk
`related_applications` fyrir innbyggðu sex; `appinstalled` → `localStorage.slokk_installed_apps_v1`;
display-mode standalone), „Athuga öpp" (sækir manifest hvers apps, staðfestir
id/start_url/scope = `/app/<key>/`, 512px tákn, standalone, og að engin tvö deili id),
aðgerðir (endurhlaða, hreinsa skyndiminni + SW, afrita greiningu). `window.OppStyribord`.

## App-síðan `br-efniskostnadur` (06.09.2026)

Hubbinn í embed-ham (`https://brunaholf.netlify.app/?embed=1#efniskostnadur`) sem app-síða í Fjármál og Boss
(defaults + `insertOnce('__efk1'/'__efk2')` í vistaðar stillingar). Þar er droppsvæðið fyrir kostnaðarreikninga:
📁 Velja skrá / 📷 Mynda reikning (`<input capture="environment">` — opnar myndavélina í símanum, engin
`allow="camera"` þörf því þetta er skráarval, ekki getUserMedia), fyrirtæki til endurrukkunar, AI-innlestur
(`/api/reikningspunktar lesa_kostnad`) og listinn (innkaupabók með hook á kúnna, „📚 Í bókhald").
Punktarnir sjálfir opnast í `br-drogstod` (sama hub-iframe, `sessionStorage.ds_open_karfa`).

## Svar-stöð `#svarstod` (447 + 447a, 08.10.2026)

Stýristöð texta sem fer úr kerfinu (Agnar: „hvernig texti yrði gerður … fara yfir alla send-takka og athuga hvaða
texti er skráður hvar"). Hliðarstika: hópurinn Kerfi á eftir Stjórnstöð (391); síðulisti appa: `svarstod` (261 PAGES,
engin insertOnce — audit-app-sidulisti fylgist með flöggunum). Síðan verður til strax, falin, svo djúptengill virki
(sama og 419). Fimm flipar: Sendileiðir (27 spjöld — hvaðan, hvert, sendandi, textinn með {breytum}, skrá:lína,
reglur, „Athugið"), Úttektarlýsing (294-reglurnar + húsmál Söru), Verk við beiðnir, Reglur, Ósamræmi.
**Gögnin búa í 447a** (`window.__SVARSTOD_DATA`, kortlagt 08.10.2026) — þegar senda-takki eða staðaltexti breytist
skal uppfæra spjaldið þar í sama commiti. „Þín regla" á hverju spjaldi vistast á þjóninn:
`AppSettings.svarstod.reglur[<leidId>] = { t, af, kl }` (app_settings_merge). Claude/Sara lesa það með
`Svarstod.regla(id)` eða beint úr app_settings áður en þau skrifa texta. Sjálfvirku sendingarnar lesa það EKKI enn.
**SV-númerin (08.10.2026):** hver sendileið á `kodi` SV-01 … SV-27 (447a). Sendingargluggar bera merkið smátt í hausnum
— `window.svKodi('SV-07')` (skilgreint í 447a, hlaðið SNEMMA í index.html), eða `kodi: 'SV-07'` í `ReceiptSender.compose/sendDoc`.
Nýr sendingargluggi fær nýtt númer + spjald í 447a. Merkið fer ALDREI í texta/skjal sem kúnninn fær (netvörður SAFE 08.10).
Smellur á merkið opnar `?sv=SV-07#svarstod` í nýjum flipa.

## Reglur `#reglur` (449, 08.10.2026)

Reglur og leiðbeiningar um brunavarnabúnað (Agnar: „nýja page … neðarlega á hliðarstikunni með öllum helstu reglum").
**Enginn reglutexti í kóðanum:** síðan les `.claude/skills/arnold/references/*.md` (sama reglusafn og Arnold notar);
`build-dist.js` afritar `references/*.md` + `*.json` í `dist/reglur/` (`copyReglur`). Staðbundið (`npx serve .`) er
`/reglur/` ekki til og síðan fellur á `/.claude/skills/arnold/references/`. Kaflar og röð: `references/kaflar.json`
(`skra`, `hlutar` = fyrirsagnir sem byrja svona, `inngangur`, `efni` fyrir fleiri skrár, `valkvaett` = sleppt þegjandi
ef skráin vantar). Ný regluskrá = ein lína þar, enginn JS. Hliðarstika: ['Reglur'] í ORDER 68 á eftir Birgðum, svo hann
sest ofan við Öpp/„Sjá meira" líka undir vistaðri röð. Leit síar línur með klasa (`rg-x`), engin endurteikning;
hápunktar með CSS Custom Highlight API. Kafli-hopp skrunar síðuna (view er skrunarinn, padding fyrir borðann) í tveimur
umferðum undir límdu stikuna. Teiknað EINU SINNI þegar öll gögn eru komin. Ekkert ritað, enginn nýr vafralykill.
`window.Reglur = { opna, hoppa(id), leita(q), hlada, md }`.

## Lærdómur

- **30.09.2026** — Borðið í dag er 368-thjonustubord5.js (Shadow DOM). Papp 231 var fjarlægt í d3eb1b78 ásamt spjallinu (347) — kaflinn um 231 hér er sögulegur og lýsir gagnalíkaninu sem 368 erfði, ekki lifandi skrá. thjonustubeidni-taflan og slug-arnir standa óbreyttir. (js/patches/368-thjonustubord5.js)

- **01.10.2026** — Brunakerfi-flipinn (274) reikningslínur: tegund línu kemur úr l.teg (Vara/Þjónusta, smellur á merkið skiptir; ágiskun aðeins á eldri línum), „Þar af nýtt:“-tillögur (vara tengd „Nýtt: <búnaður>“ í verðlista × bunadur[].nytt; lidLykill hunsar orðaröð og broddstafi), og ＋ Vara / ＋ Þjónusta úr verðlista við hlið „Auð lína“. Les úr window.BrunakerfiSkyrsla (273): verdlistiMedTegund, nyttLinur, tegAgiskun. Fyrirtækjaprófíllinn (357/360) var líka breyttur sama dag í öðru spjalli: kalt op málar borða og tæki áður en allar uttaeki-síður koma.
- **01.10.2026** — Kalt #company sækir ekki lengur allar uttaeki-síður í bakgrunni. Endurnýja á prófílnum sækir aðeins tæki þess félags. Hak og Yfirferð endurteikna ekki listann.

## Lærdómur

- **08.10.2026 — Gátlisti fyrir nýja síðu (lært á Svar-stöð 447 og Kostnaði 419).** (1) Búðu `view-<key>` til STRAX,
  falið, við ræsingu — annars hunsar beinirinn (218) `#<key>` (~1,9 s gluggi) og lendir á Stjórnstöð. (2) Hópur í
  hliðarstiku: bættu lyklinum í `SEC` í 391. (3) **Röðin í hliðarstikunni kemur úr `AppSettings.sidebar_order`** —
  nýr lykill sem er ekki þar lendir NEÐST; settu hann á réttan stað í þjóns-gildinu (atómísk SQL á app_settings eða
  AppSettings.save) eftir að síðan er komin í loftið. (4) Síðuval appa: `PAGES` í 261. `insertOnce(...)` með nýju
  flaggi brýtur `audit-app-sidulisti` (FLOGG-listinn þar er fastur) — bættu flagginu þar líka eða slepptu insertOnce.
  (5) Nýr `localStorage`-lykill brýtur `audit-vafrastada` (grunnlína 152) — slepptu honum eða rökstyddu og hækkaðu.
  (6) Hjálparfall sem gluggar annarra pappa nota við ræsingu (t.d. `window.svKodi`) verður að hlaðast SNEMMA í
  index.html (447a stendur á undan 00-legacy). (7) Fangaðu smelli inni í Shadow DOM með `e.composedPath()`.

- **04.10.2026** — 04.10.2026: litaspjaldið í app-hausnum (#_app-style, 261) opnar nú „Stærð og útlit" (AppPageZoom.vixla, 333) í stað PageEditor beint — „Litir og letur…" þar opnar ritilinn. Síðulykill 333: m:<modal-id> ef gluggi er opinn, f:<app-síða> fyrir iframe-síður, annars hash-rót (#company/123 → company). Companies.openDetail skiptir um slóð án hashchange — 333 vaktar lykilinn á 700 ms fresti. Öpp-stýriborðið (354) fékk S26-hnapp við hvert app (SlokkDevFrame.open('s26')). (js/patches/261-app-profiles.js, js/patches/333-app-page-zoom.js, js/patches/354-opp-styribord.js)
