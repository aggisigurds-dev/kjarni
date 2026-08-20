# kjarni — project guide for Claude

Kjarni er **platform-monorepo-ið**: einn kóðagrunnur, margar síður/öpp fyrir
Slökkvitæki ehf + Brunahólf ehf (Next.js 16 · Supabase · Turborepo · TypeScript ·
Tailwind · shadcn/ui). Öppin búa undir `apps/` (`web`, `slokkvitaeki`,
`database` = Supabase local stack); deilt efni undir `packages/`.

**Lestu `AGENTS.md` fyrst** — setup-skrefin, `.env`-reglurnar og
gagnagrunns-vinnuflæðið (schema-breytingar í `apps/database/supabase/schemas/*.sql`,
ALDREI handskrifaðar migrations — `supabase db diff -f <nafn>`). Það skjal er
kanónískt; þetta skjal endurtekur það ekki.

> **📋 Í upphafi vinnu-session:** líta á opin verk á Verkefnalistanum —
> `GET https://brunaholf.netlify.app/api/verkefnalisti` (status: beidni/i_vinnu) —
> áður en nýtt verk er hafið (standing instruction Agnars 2026-07-30).
> Vinnureglurnar: `.claude/skills/verkefnalisti/`. ATH: POST-reiturinn heitir
> `status`, ekki `stada` — API-ið hunsar óþekkta reiti hljóðlaust.

---

## 🧭 HVER KANN HVAÐ — sérfræðingarnir

Allur sérfræðingahópurinn úr rekstrar-repóunum er hér í `.claude/agents/` svo
kjarna-sessions hafi sömu viðskiptaþekkingu (sama Supabase-verkefnið,
`osfdzskyvisifcwyjkuk`, liggur undir öllu).

⚠️ **Afrit, ekki frumrit.** Kanóníska eintak hvers sérfræðings býr í repo-inu í
„Heim"-dálknum — file:line vísanir þeirra eiga við ÞAÐ repo, ekki kjarna.
Breytingar fara þangað fyrst og eru svo endurafritaðar hingað. Afritað 2026-08-20.

| Spurningin snýst um … | → Sérfræðingur | Heim |
|---|---|---|
| Viðskiptavini, kennitölur, rekstrarfélög, `customers_base`, customer.html | `kunnaskra` ❄️ | brunaholf |
| Verðútreikninga, taxta, VSK, afslætti, NLSH, gata-uppgjör, dkPlus, pricing_guide | `bokari` 💫 | brunaholf |
| Skýrslu↔reikningur pör (document_pairs), þekju, gloppur | `sara-organizer` 🗂️ | brunaholf |
| Skjöl, Drive, PDF, endurnefningu, multitool, Eyðublöð | `skjol` 🎙️ | brunaholf |
| Tímavera, Ajour, Payday, Redder, email-innsog, sjálfvirkni | `gagnaleidslur` 🥊 | brunaholf |
| Hub-flipa og hvar eitthvað í brunaholf `index.html` býr | `framendi` 🗂️ | brunaholf |
| Hvað er bilað — Supabase vs Netlify vs Claude vs appið | `kerfisheilsa` 🩺 | brunaholf |
| Hraða, þung köll, polling | `hradi` 💥 | brunaholf |
| Tengingar/lyklar á Kerfisheilsu-borðinu | `tengingar` 😤 | brunaholf |
| Dagleg yfirsýn + jarvis.html (svið, raddir, TTS) | `jarvis` 🎩 | brunaholf |
| RLS, policies, lyklar/tokens, public buckets — öryggið | `oryggi` 🔒 | brunaholf |
| Hype-yfirlitið — sigrarnir og það sem á að klára | `hype` 🇺🇸 | brunaholf |
| Sölu/POS, reikninga, PDF-vistun, úttektartexta | `sala-reikningar` | slokkvitaeki |
| Fylla úttektarskýrslur LIVE, verðin, Cowork/MCP-flæðið 🤝 | `sara-coworker` | slokkvitaeki |
| Flipa/borð/nav í Slökkvitæki-appinu (Verkborð, Bílstjóri …) | `bord-flettur` | slokkvitaeki |
| theme.css hönnunarkerfið + skeletons | `thema` | slokkvitaeki |
| AI-aðstoðarmanninn (Customer brief, watchlist) | `adstod` | slokkvitaeki |
| Útlit, farsímaskjái, endurhönnun — hönnuðurinn 🃏 | `joker` | slokkvitaeki |
| QR-merki, miðaprentun (Brother PT-P750W), raðnúmer | `prentun` | slokkvitaeki |
| Kort, Leaflet, mapfix, geocode/Nominatim | `kort` | slokkvitaeki |

`kunnaskra` er brunaholf-útgáfan (kúnna-líkanið sjálft — brunaholf á
`customers_base`); app-hliðar útgáfa slokkvitaeki var ekki afrituð til að forðast
nafnaárekstur.

**Notkun:** kallaðu á sérfræðinginn með Agent-tólinu (`subagent_type`), eða lestu
skrána beint. **Ekki afrita innihald þeirra hingað** — ein staðreynd á einn stað.

## Skills

- `.agents/skills/` = repo-tólin (t.d. supabase-schema-migrations) — sjá AGENTS.md;
  þau eru EKKI tvítekin í `.claude/`.
- `.claude/skills/` = viðskipta-skills (Drive-reglurnar, cowork-doc-sweep,
  verkefnalisti, hönnunar-skills o.fl.) sem eiga við þvert á repo.

## Systur-repóin

- **slokkvitaeki** (slokkvitaeki.netlify.app) — núverandi Slökkvitæki-app; plain
  HTML/JS + Netlify functions. Deploy AÐEINS með `git push` (aldrei `deploy.js`).
- **brunaholf** (brunaholf.netlify.app) — stjórnstöð/hub móðurfélagsins; einnig
  Verkefnalisti-borðið og API-in sem sérfræðingarnir vísa í.
- Bæði nota SAMA Supabase-verkefni og kjarni: `osfdzskyvisifcwyjkuk`.
  ⚠️ RLS-staðan þar er opin (sjá `oryggi`) — kjarni-öpp eiga að gera betur frá
  fyrsta degi: RLS + policies fylgja hverri nýrri töflu (sbr. AGENTS.md
  schema-vinnuflæðið).
