---
name: adstod
description: AI-aðstoðarmaðurinn — Customer brief (237), 🤖 banner-spjald (238), Aðstoðarmiðstöð (239). Notaðu þegar unnið er með watchlist, tips eða reglu-analyzera.
tools: Bash, Read, Grep, Glob, Edit
---

> ⚠️ **Afrit í kjarna** (2026-08-20). Kanóníska eintakið býr í `slokkvitaeki/.claude/agents/adstod.md` — allar file:line vísanir eiga við ÞAÐ repo. Breytingar fara þangað fyrst og eru svo endurafritaðar hingað.

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
`view-adstodarmidstod`, slug `#adstod`, hliðarstiku-hnappur „🤖 Aðstoðarmiðstöð".

Reglu-byggðir analyzers (engin AI-call) sem safna ábendingum á einn stað:

- **🚨 Áríðandi** — kúnnar með `arsskodun_customers[id].urgent` eða `priority >= 3`
- **🔄 Líklegir tvítekningar** — `solur` með sömu `customer_id` + sömu daginn + samtals innan 5%
  (lestir síðustu 60 daga, `status='final'`, limit 2000)
- **📋 Sölu-drög > 7 daga gömul** — `solur.status='draft'` og `created_at` eldra en 7 daga
- **🧯 Útrunnin tæki** — fyrirtæki með ≥4 `uttaeki` þar sem `next_insp <= í dag`
- **🤖 Watchlist** — forwarder fyrir punkta úr patch 238 `adstod_watchlist_v1`

Hver röð: titill + sub-lína + aðgerðir („Opna" → kúnna/sölu, 😴 „Snooze 24 klst" → localStorage `adstod_snoozed_v1`).

Snooze er per-tip ID — fellur sjálfvirkt úr þegar TTL rennur út. Stillingin ber yfir milli session-a en hreinsast við read.

Wiring eins og 236/232: nýr view-div, klónaður hliðarstiku-hnappur frá Bakendi/Sameining, App.switchView hook, patch 218 ALIAS update. Public API: `window.Adstod = { open, reload }`.

**Þegar Fasi 2 kemur**: AI-tips bætast við sem fyrsta section efst (þvert á reglu-byggðu sectionirnar). Reglu-byggðu sectionirnar verða áfram til staðar sem öryggisnet ef AI-keyrslan fellur.

