---
name: adstod
description: AI-aðstoðarmaðurinn í Slökkvitæki-appinu — Customer brief (237), 🤖 banner-spjald (238), Aðstoðarmiðstöð (239) og forsíðu-aðstoðarmaðurinn (344). Notaðu þegar unnið er með watchlist, dots á kúnnum, tips, snooze eða reglu-analyzera; kallaðu á hann sjálfur þegar spurt er hvað „þurfi athygli“ hjá kúnna. Kveikjuorð: watchlist, banner, aðstoð, tips, Aðstoðarmiðstöð, customer brief, dot á kúnna, punktar á kúnnum, snooze, fresta, þarf athygli, áríðandi, útrunnin tæki, líklegir tvítekningar, Pennyworth.
tools: Bash, Read, Grep, Glob, Edit
---
> ⚠️ **Afrit** — frumrit í C:\projects\slokkvitaeki\.claude\agents\adstod.md (samstillt 2026-11-04). Breyttu þar.

## Charlize — lestu fyrst

Áður en þú breytir kerfi eða fullyrðir um það: `select topic, fact, detail from v_charlize_active where scope in ('slokkvitaeki','baedi') and topic in ('variant','stillingar','thjonustulisti','bord','kerfi') order by created_at desc;` Tómt = óskráð — segðu það, ekki giska. Lærdómur sem næsta lota veit ekki → `charlize_knowledge` í lok lotu (skill `charlize`).

Þú kannt **aðstoðarmanns-lögin** — dots á kúnnum, watchlist og reglu-byggða analyzera. Fasi 2 (AI-tips gegnum brunaholf) er óunninn.


---

# 📚 Þekkingargrunnur — ÓBREYTTUR texti úr CLAUDE.md

> Fluttur hingað 2026-08-01 við uppskiptingu CLAUDE.md (~15k tokens hlóðust í HVERRI
> lotu). Engu breytt, engu sleppt — hleðst aðeins þegar þessi sérfræðingur er kallaður.

## Aðstoðarmaður (Fasi 1) — `js/patches/237-customer-brief.js` + `238-adstod-banner.js`

Fyrsta lag af „AI-aðstoðarmaður" vísíóninni (Agnar 2026-06-29). Sjá fulla
útlistun í `docs/CLAUDE-LEIDBEININGAR.md` §10.

**Patch 237 — Customer brief:**
- Lítill litaður **dot** (🔴 rauður = áríðandi skilaboð · 🟠 amber = forgangur ≥3)
  birtist ÞIN á þeim kúnna-röðum sem þurfa athygli. Engir dotar á hreinum.
- Smella → popup með „Síðasta úttekt 11 mán síðan · 14 tæki · 2 útrunnin · ✓ greitt upp"
- `quickFlag()` keyrir synchronously á AppSettings (engin DB-call)
- Full `compute()` pullar úr fyrirtaeki/uttaeki/solur með 5-mín cache
- Mutation observer decorerar alla `[data-co-id]` raðir
- companieslist.js fékk 2-lína breytingu til að setja data-co-id á <tr>
- Public API: `window.CustomerBrief = { compute, show, invalidate, close, quickFlag, refreshFlags, setDotsHidden, getDotsHidden }`

**Patch 238 — 🤖 Aðstoðar-spjald í banner:**
- 🤖 takki festur í Brunastál-banner **rétt fyrir klukkuna** (sjá `.bb-clockbox`)
- Rauður badge sýnir fjölda opinna watchlist-punkta
- Smella → popover (`#_ad-panel`) með:
  - „Sýna dots á kúnnum" toggle (stýrir patch 237)
  - „🔔 Mín watchlist" listi
  - „➕ Bæta við punkti" form með 4 flokk-chip-um:
    - 🔔 Áminning · 🎯 Mynstur · ⚖️ Regla · 🐛 Bug
- Form: flokkur (chip) + titill (skylda) + valkv. target (kt/sendandi) + valkv. lýsing
- Geymsla: localStorage `adstod_watchlist_v1`
- ⤓ „Flytja út" til JSON
- Þegar Brunastál er slökkt: 🤖 birtist fljótandi við 🔥 restore-takka
- MutationObserver endurtengir 🤖 takka þegar banner er endurbyggt
- Public API: `window.AdstodHub = { open, close, toggle, addWatch, removeWatch, listWatch, exportJSON }`

**Næstu fasar (planað):**
- Fasi 2: brunaholf `/api/adstod-run` (Claude Sonnet) les watchlist + DB-state, skrifar tip í `adstod_tips` Supabase tafla
- Fasi 3: „hugsanaský" — reglur breyta hegðun AI í næstu yfirferð
- Fasi 4: Domain analyzers (duplicate sölur/reikningar, mikilvægir póstar, tilboð úr fyrirspurnum)

## Aðstoðarmiðstöð — `js/patches/239-adstodarmidstod.js`

Fasi 1B af Aðstoðarmaður-vísíón (Agnar 2026-06-29). Sjálfstæð síða
`view-adstod` (239:28, `VIEW_ID`; haus-athugasemdin í 239:5 segir enn view-adstodarmidstod — rangt), slug `#adstod`, hliðarstiku-hnappur „🤖 Aðstoðarmiðstöð".

Reglu-byggðir analyzers (engin AI-call) sem safna ábendingum á einn stað:

- **🚨 Áríðandi** — kúnnar með `arsskodun_customers[id].urgent` eða `priority >= 3`
- **🔄 Líklegir tvítekningar** — `solur` með sömu `customer_id` + sömu daginn + samtals innan 5%
  (lestir síðustu 60 daga, `status='final'`, limit 2000)
- **📋 Sölu-drög > 7 daga gömul** — `solur.status='draft'` og `created_at` eldra en 7 daga
- **🧯 Útrunnin tæki** — fyrirtæki með ≥4 `uttaeki` þar sem `next_insp <= í dag`
- **🤖 Watchlist** — forwarder fyrir punkta úr patch 238 `adstod_watchlist_v1`

Hver röð: titill + sub-lína + aðgerðir („Opna" → kúnna/sölu, 😴 „Snooze 24 klst" → Vidmot `adstod.snoozed`, 239:80-104; `adstod_snoozed_v1` aðeins einskiptis upphafsgildi).

Snooze er per-tip ID — fellur sjálfvirkt úr þegar TTL rennur út. Stillingin ber yfir milli session-a en hreinsast við read.

Wiring eins og 236/232: nýr view-div, klónaður hliðarstiku-hnappur frá Bakendi/Sameining, App.switchView hook, patch 218 ALIAS update. Public API: `window.Adstod = { open, reload }`.

**Þegar Fasi 2 kemur**: AI-tips bætast við sem fyrsta section efst (þvert á reglu-byggðu sectionirnar). Reglu-byggðu sectionirnar verða áfram til staðar sem öryggisnet ef AI-keyrslan fellur.

## Lærdómur

- **16.10.2026** — Per-tækis reglan 15.10.2026: snooze (`adstod.snoozed`) og punktavalið lesast nú um Vidmot (sama val á öllum vélum); watchlist (`adstod_watchlist_v1`) er ENN í localStorage (leiðrétt 04.11.2026); Vidmot.flytja() flutti gömlu gildin einu sinni. Fasi 2 (AI-tips) enn óunninn, /api/adstod-run er ekki til. (js/patches/238-adstod-banner.js, js/patches/239-adstodarmidstod.js)

## Nýtt úr Charlize og lotum (28.10.2026)

- Forsíðu-aðstoðarmaðurinn (patch 344 + `/api/assistant`) var KVEIKTUR 03.09.2026 að beiðni Agnars (migration assistant_memory_fasi1 — þrjár töflur voru aldrei til frá 31.08 svo hann skilaði alltaf 500) og svarar á íslensku í texta; þetta er ANNAÐ en Fasi 2 hér að ofan. [C#363]
- (Leiðrétt 04.11.2026: snooze býr í Vidmot `adstod.snoozed` og punktavalið í Vidmot `adstod.punktarFaldir` (237:373); aðeins **watchlist** (`adstod_watchlist_v1`, 238:30-45) er enn í localStorage.) Watchlist í localStorage — staða sem býr aðeins í vafra samstillist aldrei milli véla og Agnar vinnur á 3–4 tölvum; ábending, ekki breytt hér. [C#406 (MYNSTUR 1); lotur 532a8e1d, 9b70f49c]
- AppSettings er skyndiminni fyrstu sekúndurnar (allt að 30 daga gamalt): `quickFlag()` má lesa það en kóði má aldrei skrifa í app_settings út frá AppSettings.get(). [C#751]
- „Í þjónustu“ þýðir `fyrirtaeki.er_i_thjonustu = true` EÐA `AppSettings.arsskodun_customers[id].subscribed = true` (eða skráður búnaður); að taka fyrirtæki úr þjónustu krefst TVEGGJA skrifa (er_i_thjonustu=false OG blobbinn subscribed:false + removed_from_service_at). [C#454; lota 7576079c (líklega)]
- Lifandi tæki ein og sér setja fyrirtæki ekki á Fyrirtæki í þjónustu — flaggið, blob subscribed eða skráður búnaður ræður (08.09.2026); hafðu það í huga í analyzerum um útrunnin tæki. [C#465]
- „Sala á kúnnann eftir að málið varð til“ er EKKI sönnun um að mál sé afgreitt (búðarsala ≠ úttekt) — analyzerar mega ekki fullyrða „búið“ af seinni sölu einni saman (Agnar: „ég þori ekkert að loka neinu, svo mikið af false facts“). [C#425]
- Bakfærðir reikningar (kredit í appi eða CANCELLED í Payday) telja ekki þegar reiknað er hvort reikningur sé til á stað; reikningur telst aðeins á sama stað (`solur.customer_id`). [C#581]
- `uttaeki.status` er eitt af: active, i_vinnslu, geymsla, urelt, onytt. [lota 7576079c (líklega)]
