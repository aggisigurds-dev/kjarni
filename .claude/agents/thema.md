---
name: thema
description: theme.css hönnunarkerfið + per-page skeletons (endursköpun síðna í Brunastál-stíl). Notaðu þegar síða er endurhönnuð eða skinnuð.
tools: Bash, Read, Grep, Glob, Edit
---

> ⚠️ **Afrit í kjarna** (samstillt 2026-08-31). Kanóníska eintakið býr í `slokkvitaeki/.claude/agents/thema.md` — allar file:line vísanir eiga við ÞAÐ repo. Breytingar fara þangað fyrst og eru svo endurafritaðar hingað.

Þú kannt **þemað** — class-based theme.css, scoped undir `.thm`. GILDRA: patch 245 (Brunastál) berst við theme.css (whitear `[class*=-card]`) — þarf hærri sérhæfni.

## ⚠️ ÞEMAÐ ER FROSIÐ (2026-08-17)

Þemaskiptikerfið var fjarlægt að ósk Agnars („nota núverandi stillingar sem
grunnstillingu, eyða öðrum þemum og þemu-veseninu"):

- **220-theme-system.js** er nú lítill frosinn applier: Brunastál-tókenar hart
  kóðaðir, setur alltaf `data-thm-preset="brunastal"`, `data-thm-dark="0"`,
  `data-thm-density="venju"`, `data-bstal-accent="red"` (230). Engin 11-preseta
  skrá, ekkert ⚙️ Útlit-stjórnborð, engin vistun — `slokk_theme` /
  `ui_theme` / `brunastal_accent` eru EKKI lesin lengur (localStorage-leifar
  hreinsaðar við ræsingu; AppSettings `ui_theme` stendur ónotað).
- **230-brunastal-theme.js**: accent-kassarnir (rautt/blátt/gyllt), 🔥
  þemaskiptirinn og endurkveikju-flísin (`#bstal-restore`) eru farin; borðinn
  er alltaf á. Blau/gylltu accent-CSS-settin fjarlægð.
- `window.Theme` stendur sem lágmarks-stubb (get/set/apply/open) svo eldri
  kallarar brotni ekki — `set()` skiptir ENGU, endur-applyar bara grunninn.
- Playwright-ráðið að neðan um `localStorage slokk_theme={preset:'brunastal'}`
  er ÓÞARFT núna (skaðlaust no-op) — presetið er alltaf á.
- Stílstjórinn (262, 🎨) lifir áfram og er ótengdur þessu — hann geymir
  fínstillingar notandans í AppSettings `page_editor_v1_json` og er með
  öryggisventil gegn akkerislausum selectorum (sjá c6fc57c).
- Vilji menn þemaskipti aftur: endurvekja 220/230 úr git fyrir 2026-08-17
  (commit cd54337 hefur gömlu skrárnar í foreldra sínum).

### Samræming þemans — mælt og skjalfest, bíður ákvörðunar (29.08.2026)

Agnar: „kanski bara henda þessu þemabulli út… skrá litina, delete, hreinsa og
enduraetja." Fyrri hlutinn er BÚINN — grunnlínan er mæld í báðar áttir svo enginn
þurfi að mæla hana aftur:

- **`docs/LITASKRA.md`** (28.08) — litirnir eins og þeir ERU: 15 textalitir undir
  ólíkum nöfnum (`--ink1`/`--ink-on-card`/`--ink-on-steel` eru SAMI litur),
  5 rauðir, þrír bakgrunnar sem stangast á, 85 CSS-breytur, 135 stílblöð
  samtímis. Þrír raunverulegir gallar mældust: 100 innsláttarreitir með
  GEGNSÆJAN bakgrunn, 24 af 26 fellilistum með `#94a3b8` sem textalit (2,8:1),
  og 6 töfluhausar með nær-hvítan texta á gegnsæju.
- **`docs/DESIGN.md`** (29.08) — MARKMIÐIÐ í DESIGN.md-sniði, með „Leiðin
  þangað" í sex skrefum sem má taka eitt og eitt. Formin mældust líka:
  **9 radíusar, 11 leturstærðir, 7 þyngdir, 9 bil-gildi** í virkri notkun.
  Rammar eru 1px í 287 af 288 tilvikum — eina víddin sem er þegar öguð.
- Tvennt sem mældist og stóð hvergi áður: letrið er **IBM Plex Sans** (10.547
  hlutir), ekki Inter. Og bakgrunnurinn `#f5f4ef` er ekki slys — hann liggur í
  sömu fjölskyldu og Intercom (`#f5f1ec`) og PostHog (`#eeefe9`), svo hlýi
  off-white flöturinn HELDUR SÉR í endurstillingunni.
- Viðmiðunarkerfi í `docs/honnun/` (Stripe, Supabase, Notion, Intercom — ljós og
  gagnaþétt, úr awesome-design-md, MIT). **Viðmið um uppbyggingu, ekki auðkenni
  sem á að afrita.**

⚠️ **Ekkert af þessu er komið í framkvæmd og þemað er ENN FROSIÐ.** Agnar hefur
ekki gefið grænt ljós á samræminguna — skjölin eru til svo hún sé möguleg, ekki
af því að hún sé hafin. Ekki byrja á henni óumbeðið.


---

# 📚 Þekkingargrunnur — ÓBREYTTUR texti úr CLAUDE.md

> Fluttur hingað 2026-08-01 við uppskiptingu CLAUDE.md (~15k tokens hlóðust í HVERRI
> lotu). Engu breytt, engu sleppt — hleðst aðeins þegar þessi sérfræðingur er kallaður.

## Theme refactor — `theme.css` + per-page skeletons (IN PROGRESS, 2026-07-03)

Re-skinning pages to Agnar's class-based design system, replacing an earlier
mistaken pass where I invented a dark metallic "title BAR" that is **not** in the
comps (it caused black-on-black regressions). The correct look = plain title on a
dark→grey page band, metallic 3D stat cards, filled pills, dark-header data table.

- **Source of truth:** `css/theme-handoff/` — `theme.css` (the whole system as
  named classes), `README.md` (recipe + class cheat-sheet), and per-page
  `*.skeleton.html` (class-only markup with `{{PLACEHOLDERS}}`). Full pixel
  reference = `brunaholf-theme-handoff/reference-pages/*.dc.html` (in the v3 zip
  Agnar uploaded; extracted copy under scratchpad). Ask Agnar (via Claude design)
  for a new page's skeleton — he generates them.
- **Scoping (critical):** do NOT load `theme.css` globally — its class names
  (`.btn` 75 files, `.pill` 12, `.chip` 19, …) collide with the app. Instead
  `css/theme-scoped.css` = `theme.css` auto-prefixed under `.thm` (regenerate from
  theme.css with the prefix transform; keep the `@import`/`:root` global). Linked
  once in `index.html <head>`. Each rebuilt page wraps its content in
  `<div class="thm"><div class="app-page"><main class="app-main">…`.
- **Per-page recipe (mechanical):** keep the patch's data/logic + every event-hook
  class (`._hr-*` etc.); replace ONLY the render markup with the skeleton's theme
  classes. Title `.page-title` (plain, white, on the band — NO boxed bar). Cards
  `.stat-card`(+`--green/amber/red/hero`). `.pill--*`, `.chip--*`, `.btn--*`,
  actions `.abtn5`, table `.data-table-wrap>.data-table-scroll>table.data-table`.
  Reset the view so the band shows: `#view-X{padding:0!important;background:transparent!important}`.
  Bump the `?v=` on BOTH `theme-scoped.css` and the edited patch in index.html.
- **GOTCHA — patch 245 (Brunastál content-skin) fights theme.css.** It paints
  `.view .stat-card`, `.view input`, and `.view [class*="-card"]{background:#fff!important}`.
  That **substring** selector matches `stat-card__value`/`__label` (they contain
  "-card") and whitens them → an invisible "white box" (this is the "two
  backgrounds" Agnar flagged). Fix = higher-specificity overrides in
  theme-scoped.css: `.thm .app-page .stat-card .stat-card__value{background:transparent!important;border:0!important}`
  and the hero card `.thm .app-page .stat-card.stat-card--hero{background:<blue>!important}`.
- **Gradient (Agnar 2026-07-03):** `.app-page` holds dark longer + darker —
  `linear-gradient(180deg,#060607 0px,#060607 240px,#8e949e 660px,#9198a3 100%)`
  (in both `theme.css` and `theme-scoped.css`).
- **Verify:** render skeleton+theme.css standalone (fill placeholders) = the
  target; screenshot the live preview with Playwright and compare. Navigate via a
  **sidebar `.vnav-btn` click** (board/ledger pages don't render via
  `App.switchView` alone). Chromium `/opt/pw-browsers/chromium-1194`,
  `--no-sandbox --ignore-certificate-errors`, `proxy:{server:HTTPS_PROXY}`,
  `localStorage slokk_theme={preset:'brunastal'}`, `waitUntil:'load'`.
- **Done:** Hreyfingarlisti (patch 167) fully on theme.css ✓. ÞjónustuVerkstæði
  (patch 190) header → plain title + coloured stat **pills** (matches its comp) ✓.
  Kröfu yfirlit (#166, 2026-07-09) — chrome on theme.css: `.thm .app-page`
  wrapper (also around loading/error states), `.page-title` + `__tools` (month
  nav/sort/search keep their `.ky-navbtn` Brunastál overrides), `.stat-row` with
  4 `.stat-card` (hero/amber/green), view-filter buttons → `.filter-chip`; the
  grouped-by-company cards + kyAbtn action rows + bulk bar kept UNTOUCHED
  (money-critical, heavily iterated — v5 lesson) ✓.
- **Also done (2026-07-09):** Vörur (core `js/vorur.js` — page-title band,
  tabs → `.filter-chip`, category headers as dark translucent pills so they read
  on both the dark and grey parts of the band), Tekjur (`js/tekjur.js` —
  page-title + 4 `.stat-card`), Allir viðskiptavinir (157 — page-title band,
  counts line in `<p>` with light accents). Each injects its own
  `#view-X{padding:0;background:transparent}` reset style.
- **Skipped on purpose:** Rekstrarfélög (175) — it has its OWN dark design
  (`html[data-thm-dark]` view-background + `.rf-card` rules) integrated with the
  theme presets; wrapping it in the `.thm` band would fight that. Convert only
  together with a redesign of that page.
- **Next:** Fyrirtæki í Þjónustu (153) + remaining pages, one per skeleton.
- **Cleanup DONE (2026-07-09, #322):** the wrong dark title BARs #260 stamped
  onto Vörur/Tekjur/Allir/Rekstrarfélög/Bókhald were replaced with plain
  theme-token titles (var(--ink1)/var(--ink3)), and `260-global-titlebar.js`
  (which prepended the bar to every other Brunastál view, incl. Fyrirtæki í
  Þjónustu) is hibernated — script tag commented out like 152. The proper
  theme.css conversion still proceeds page by page as above.

