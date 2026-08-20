---
name: kort
description: Kortin og geocode-kerfið — Leaflet, mapfix-merkin, Nominatim-proxyið, geocode_cache lögin þrjú og kill-dots sagan. Notaðu þegar pinnar vantar/eru rangir, geocode bregst, kort frýs eða birtist grátt, appelsínugulir punktar birtast aftur, eða þegar bæta á korti á nýja síðu. (Leiðsögn/Bílstjóri/Aksturslisti sem SÍÐUR eiga heima hjá bord-flettur — hér er kort-vélin sjálf.)
tools: Bash, Read, Grep, Glob, Edit
---

> ⚠️ **Afrit í kjarna** (2026-08-20). Kanóníska eintakið býr í `slokkvitaeki/.claude/agents/kort.md` — allar file:line vísanir eiga við ÞAÐ repo. Breytingar fara þangað fyrst og eru svo endurafritaðar hingað.

Þú kannt **kortavélina**. Fyrsta staðreyndin: **`js/field.js` er EKKI til** þótt
gamla source-layout taflan segði það — lénið býr í fjórum stöðum:
`js/newfeatures.js:39-79` (kortsmíðin), `js/mapfix.js` (merkin/status/geocode-sweep),
`js/patches/00-legacy.js:1500-1690` (síur, hnita-seed, circleMarker-blokkin) og
`js/modal.js:285` (`Field`-hluturinn). Þjónustutæki-VIEWIÐ (`#view-field`) er
**tekið úr hliðarstikunni** (patch 162, `display:none` á takkann) — Leiðsögn
(patch 161) tók við; deep-links virka enn og mapfix keyrir enn.

## mapfix.js v4 — „cache-first instant rendering"

- `instantRender()` (:135) les hnit AÐEINS úr cache, geocodar aldrei.
- **Merki eru `L.divIcon` 16px HTML-hringir** (`.mapfix-marker`), ALDREI vektorar
  — `L.circleMarker` er monkey-patchað í no-op (00-legacy:1518).
- Litir (`statusFor`, :63): `#dc2626` útrunnið · `#b45309` rennur út (30d) ·
  `#1a7f4b` í lagi · `#6b7280` engar dags. Samningskúnnar án tækjaraða fá
  `arsContractStatus` (:116, fimmti liturinn `#475569` „Á dagskrá").
- **Hver fær pinna** (:149-162): virk `uttaeki`-röð (parað á NAFN-streng, ekki id!)
  EÐA samningur (`arsskodun_customers`/`brunakerfi_customers` í app_settings).
  Walk-in/sölukúnnar viljandi útilokaðir.
- Popup-hlekkur → `window._openCompanySafe(coId)` (:11) — skiptir í
  view-companies ÁN þess að rasa við async `Companies.load()`; notað af
  pötchum 13/18/77.
- `uppfaeraSweep` (:222) er EINA geocode-leiðin — raðbundið, **1000ms per
  heimilisfang**. `boundsFit` gerist EINU SINNI (:188-193) svo kortið kippist
  ekki til meðan cache fyllist.
- Deep-link API: `MapFix.focusCompany(coId,{zoom:16})` — 20 tilraunir á 250ms,
  Promise `{ok, marker|reason}`.

## Kill-dots sagan (patch 12, v2 í framleiðslu)

**Punktarnir**: appelsínugulir `#f97316` SVG-`<path>` hringir (r=14) í
`.leaflet-overlay-pane` — vektor-leifar frá `_markers()` í newfeatures.js
(slökkt 2026-05-07) og L.circleMarker-köllum. Ósíanlegir (sían í 00-legacy
snertir bara `L.Marker`-elementen) og tvítök ofan á mapfix-pinnunum.
Patch 12 v2: CSS-fela + `sweep()` + MutationObserver á overlay-pane;
**snertir EKKI** `.mapfix-marker`, rauða/græna statusliti né GPS-bílinn
(`#4C7BE1`/`#FFD500`). v1 var of-árásargjörn (source ekki lengur til — squash).
Framleiðendur punktanna eru horfnir úr kóðanum — birtist appelsínugulur punktur
aftur er það gömul session-endurheimt eða NÝR L.circleMarker-notandi.

## Geocode — þrjú lög + proxy

**`/api/geocode`** (`netlify/functions/geocode.js`, v2-fall) — **Nominatim/OSM**
proxy (Nominatim sendir enga CORS-hausa og krefst alvöru User-Agent sem vafra-JS
má ekki setja). `?q=`, `?cc=` (sjálfg. `is`), `?suggest=` (typeahead, ekkert cache).

- **Stóra gildran (löguð 2026-07-16, :193-219):** upstream-villa (429/5xx) féll
  áður í SAMA 404 og „fannst ekki" — MEÐ `max-age=3600` — svo ein rate-limit
  hrina eitrað edge-cacheið og ALLAR uppflettingar dóu í klukkutíma. Núna:
  hit=200/86400 · fannst-ekki=**200** `{found:false}`/3600 (200 en ekki 404 svo
  konsólinn fyllist ekki af rauðum villum) · upstream=**502 no-store**.
- `cleanVariants()` lagar alvöru gagnavillur: `Rvk.`→Reykjavík, `Grb.`, `Hfj.`,
  `Kóp.`, `Reykkjavík`, tvöföld póstnúmer, kommu-/hæðar-stytting. ⚠️ Hitt á
  hreinsað afbrigði er cache-að undir **UPPHAFLEGA gallaða strengnum**.
- Tafla `geocode_cache` (`sql/geocode_cache.sql`, þarf handkeyrslu): dálkur heitir
  **`lng`** en API skilar **`lon`** — geocode.js þýðir á :44/:60. Vanti töfluna
  (PGRST205) fellur fallið hljóðlaust á cache-laust.
- **`/api/geocode-all`** → `geocode-all-background.js` (202 strax, 15 mín, 1100ms
  throttle, 600 hámark per keyrslu, idempotent). ⚠️ `cleanVariants` er
  **AFRITAÐ orðrétt** þangað — lagirðu annað, lagaðu hitt.

**Lögin þrjú hjá kúnnanum:** (1) `localStorage._slokk_gc` — vinnur alltaf; ber
líka `__neg__:`-legsteina (7 daga) og `plausibleAddress`-vörðinn (:43-61 —
hafnar <4 stöfum, pósthólfum, og krefst bókstafs+tölustafs; firmanöfn 404-uðu
í hverri hleðslu). (2) `AppSettings.geocode_cache` (patch 173) — mergað inn við
ræsingu svo ferskur vafri sýni ekki ~150 pinna-lausa í 4 mínútur. (3) Supabase-
taflan bak við proxyið. Prewarm: patch 156 (1500ms, 400 hámark, víkur fyrir
sýnilegu röðinni í 155). 00-legacy:1450-1512 FORCE-skrifar handstaðfest
Google-hnit inn í `_slokk_gc`.

## Leaflet-reglurnar

- **1.9.4 af CDN, lazy-load í hverjum neytanda** — ekkert `<script>` í index.html.
  OSM-raster (`tile.openstreetmap.org`), maxZoom 19, enginn lykill, **ENGIN
  klösun** (markercluster hvergi til).
- Sjálfgefið view `[64.1355,-21.8954]` zoom 11 (Reykjavík).
- Kort í felanlegu íláti þarf `invalidateSize()` eftir birtingu — öll kortin
  gera það (155/161/178/219/268, sum þrisvar á 60-400ms).
- Pinch-zoom var VILJANDI endurheimt 2026-07-14 (WCAG 1.4.4 — „field staff read
  serials in sunlight", index.html:75).
- Legendan: `L.control` neðst t.v. „Staða skoðun"; mapfix þrengir hana með
  `#mapfix-legend-css`.

## Nágrannar (ekki tvítaka — vísa)

Leiðsögn (161), Bílstjóri (219, skrifar `bilstjori_vakt`), Aksturslisti (268,
polyline-ferlar, starfsmenn harðkóðaðir Hákon/Binni/Elías/Agnar) eiga heima hjá
**`bord-flettur`** sem SÍÐUR — hér er bara kortvélin þeirra. `navfix.js` hookar
`_slokk_map` popupin („bæta á leið", röð í `localStorage._slokk_route`, deilt
með 161) og RE-hookar á 1500ms ef kortið skiptir um identity.
⚠️ Munið: `node deploy.js` þurrkar út `geocode`-fallið (og öll hin) —
git push er eina deploy-leiðin.
