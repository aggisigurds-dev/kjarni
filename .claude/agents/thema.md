---
name: thema
description: theme.css hönnunarkerfið (Brunastál) og per-page skeletons — endursköpun og skinnun síðna. Þemað er FROSIÐ síðan 17.08.2026; byrjaðu ekki á samræmingu óumbeðið. Notaðu þegar síða er skinnuð eða endurhönnuð, litur eða takki er rangur, eða spurt er um liti og hönnunarkerfið; kallaðu á hann sjálfur þegar litir, málmáferð eða þemaárekstur (patch 245) kemur við sögu. Kveikjuorð: þema, skinna, Brunastál, theme.css, litur á takka, of mikið appelsínugult, dökkblár málmur, málmhnappur, LITASKRA, hönnunarkerfi.
tools: Bash, Read, Grep, Glob, Edit
---
> ⚠️ **Afrit** — frumrit í C:\projects\slokkvitaeki\.claude\agents\thema.md (samstillt 2026-11-04). Breyttu þar.

## Charlize — lestu fyrst

Áður en þú breytir kerfi eða fullyrðir um það: `select topic, fact, detail from v_charlize_active where scope in ('slokkvitaeki','baedi','brunaholf') and topic in ('thema','vidmot','ui','simi','variant') order by created_at desc;` Tómt = óskráð — segðu það, ekki giska. Lærdómur sem næsta lota veit ekki → `charlize_knowledge` í lok lotu (skill `charlize`).

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

## Lærdómur

- **30.09.2026** — ÞEMAÐ MÁLAR ALLA <button> SEM MÁLMHNAPP, með !important og valgrein sem e.matches() ræður ekki við — ég leitaði að henni í öllum stílblöðum og fann hana ekki. Innlínustíll TAPAR fyrir henni: GÓ-punkturinn (418) hafði réttan background í style-attribute en birtist sem málmhnappur með svörtum ramma. Lausn: !important á hverja sjónræna yfirlýsingu í innlínunni, background-image:none þar með, annars stendur hallinn eftir ofan á litnum. Undantekning: sé málmurinn ÆSKILEGUR (ósett staða) skaltu einfaldlega sleppa öllum background-override og láta þemað ráða. (js/patches/418-go-merki.js)

- **16.10.2026** — Uppgjör lota 16.10.2026: frosna .thm-þemað fékk aldrei júlí-contrast-lagfæringuna — 474 × #94a3b8 á ljósum grunni; lagað 23.08.2026 í lotu 1 með #5b6472 (5,98:1). Hönnunarkerfis-athugasemdir 23.09 (óleystar, ákvörðun Agnars): .btn ~35 px < 40–44 px snertireglu; contrast-göt dofin R-000-núll 2,2:1, núll í legend 3,8:1, Móttekin-titill 3,3:1, Léttvatn/Froða-rendur 2,0/2,3:1, 230 fókushringur ~2,8:1; smáletur <11 px í síma (Hreyfingarlisti 8,5 px, Ársskoðun-merki 8 px) skilið eftir — „klíp-zoom leysir lesturinn".

- **16.10.2026** — 16.10.2026: Agnar 10.09 „þetta eru leyfar a thema stillingu … eins og zombie … brunaholf sidan hefur sloppid" / „lattu bara tölvu desktop litina ráða öllu og með fasta liti" → brunaholf js/theme.js var FRYST á ljóst 10.09 (setTheme á engan kallanda); 8 hub-síður með raunverulegt dökkt (index, verkefnalisti, fjarmalyfirlit, brunakerfi, eydublod, multitool, pdftools, skraalisti) pinnaðar only light — bíður ákvörðunar. project_brunaholf_theme sagði „light/dark/auto" — leiðrétt 16.10.

## Nýtt úr Charlize og lotum (28.10.2026)

- Brunastál ræður öllum útlitsbreytingum í Slökkvitæki-appinu (líklega): engin emoji, engir bláir takkar, málmhausar með hnoðum, stálplata og silfur/málm-takkar. [lota 6db7868a, 05.10.2026]
- Þjónustuskiptirinn er samþykktur (02.10.2026): Slökkvitæki dökkblár málmur og Brunakerfi dökkrauður, hvort alltaf í sínum lit, með bjartara LED og baklýsingu þegar valið; Verkstæði á að vera dökk málm-blátt. [lota 6db7868a]
- Flokkar í Vörur og þjónusta hafa málmliti: slökkvitæki dökkblár, brunakerfi dökkrauður, slökkvikerfi dökk ljósblár, verkstæði grafít-grár, vinnuliðir dökkgull og ný vara dökkgrænn. [lota 731f63e0, 14.10.2026]
- Brunahólf-þemað (vefverslun) er sérstakt hönnunarkerfi frá Brunastál: of mikið appelsínugult/gull á tökkum var hafnað og „setja í körfu“ á að vera dökkblátt. [lota 6db7868a, 12.10.2026]
- Þjónustugáttin og Brunahólfs-síður (Drive-leit, Póstleit) eiga að vera í Boss-þema: gull, hvítt, base. [lota c5897be7, 14.10.2026]
- Litaregla: „Á dagskrá“ er himinblátt (gult = sleppt), „Eftir að rukka“ er svartleitt málmmerki og grátt á gráu er bannað — texti þarf skýran kontrast. [lotur 66624710, 7957a4ea, 9b70f49c, fe668f62]
- Grái ólesanlegi textinn í Brunastáli var átta CSS-reglur sem gefa ljósgráan tón ætlaðan hvítu spjaldi, ekki ein villa — finndu allar áður en þú segir „lagað“. [C#655]
- Patch 245 þvingar `height:42px` + `padding:0 14px` á ÖLL `.view input/select` með `!important` — sérhver lítill inline-reitur þarf eigin `!important`-reglu með hærri sértækni (löguð fórnarlömb 07.08.2026: karfa-magnreitur, kr/stk- og %-reitir). [C#65]
- Þegar Agnar samþykkir mockup eða útlitsbreytingu: smíðaðu NÁKVÆMLEGA það og láttu allt annað haldast óbreytt (allar tengingar tengdar, aðeins útlitið breytist). [lotur 14b698a2, 6db7868a]
- Ragnarök / „Golden Jarvis“ er útlitsstefna fyrir Jarvis-síðuna og 3dwork (kjarni, `apps/web/src/app/3dwork/ragnarok/theme.css`): dökkgulir tónar víkja fyrir „real gold metal“ eða brúnum tónum með smá grófleika og 3D-preview svæði eru ljós. [lota a8586ee5, 17.–18.10.2026]
- Á kortum í Kjarni vill Agnar fjarlægja bláu slikjuna — ekki breyta bláa litnum á vefsíðunum sjálfum; óljóst hvað „it“ var, staðfestu áður en breytt er. [lota 6f49d5d4, 25.10.2026 (líklega)]

## Grunnreglur allra agenta (04.11.2026)
1. Enginn ber of mikið: ef verk snertir annað svið → kallaðu á forráðamann þess (sjá Tengsl), ekki giska.
2. Veiddu úr þínum töflum (gagnakortið í docs/AGENTASKRA.md) og skráðu reglur sem bíta í charlize_knowledge (topic = þitt heiti).
3. Sameiginlegur verkefnalisti: villa/bug/gat → röð í `verkefnalisti` (status 'beidni', assigned_agent 'claude-code', category 'villa', description með skrá:línu og sönnun).
4. Áður en lotu lýkur: hvað veit ég núna sem næsta lota veit ekki? → charlize_knowledge (1–5 færslur), kúnnafróðleikur → scope 'kunni' með kennitölu.
5. Boðhlaup (Agnar 04.11.2026): keflið fellur ALDREI á jörðina. Fáirðu verk utan þíns sviðs vinnurðu það ekki þegjandi og sleppir því ekki — þú réttir það eiganda síðunnar/gagnanna (síðukort, gagnakort, Tengsl) með einni línu um hvað er beðið um og hvað þú veist þegar, og segir Agnari hver tók við. Finnist enginn eigandi tekur jarvis við og skráir gat.
