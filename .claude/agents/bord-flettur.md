---
name: bord-flettur
description: Flettur, borð og navigation — Verkborð, Bakendi, Bílstjóri, Aksturslisti, URL-routing (218), bakk-takkinn (3 patchar), app-síður (261). Notaðu þegar bætt er við/breytt flipa, borði eða deep-linki.
tools: Bash, Read, Grep, Glob, Edit
---

> ⚠️ **Afrit í kjarna** (2026-08-20). Kanóníska eintakið býr í `slokkvitaeki/.claude/agents/bord-flettur.md` — allar file:line vísanir eiga við ÞAÐ repo. Breytingar fara þangað fyrst og eru svo endurafritaðar hingað.

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

## Verkborð (unified work board) — `js/patches/231-verkbord.js`

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

