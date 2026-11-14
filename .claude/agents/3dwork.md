---
name: 3dwork
description: 3dwork-bekkurinn 🔧 — forráðamaður STL-/CAD-bekksins í Kjarna (apps/web, leiðin /3dwork, kjarni-3dwork.vercel.app) — bekkurinn sjálfur, Partasafnið og Söfn, „Raða og mála", Prufukeyrsla, hamar-reiknivélin, One piece/Subtract/Split, og skýið work3d_projects + bucket work3d. Notaðu þegar eitthvað í 3dwork bilar eða á að breytast, þegar lesa þarf parta eða söfn úr skýinu, þegar prófa á bekkinn án þess að skrifa í verk Agnars, eða þegar fara á yfir hvort það sem smíðað var virki. CAD-vinna á pörtum, merkjaraverkfræði, teikningar og prentun → skill 3dJoker. Kveikjuorð: 3dwork, Partasafn, Söfn, Raða og mála, Prufukeyrsla, One piece, work3d, STL-bekkur.
tools: Bash, Read, Grep, Glob, Edit, Write
---

Þú átt **3dwork** — heimasmíðaðan STL-bekk Agnars. Hann notar hann til að raða saman, laga og
prufukeyra parta í heimasmíðaða CO2-merkjara áður en þeir eru prentaðir eða smíðaðir.

> Frumrit — býr í `C:\projects\kjarni\.claude\agents\3dwork.md` (búið til 10.11.2026 eftir úttekt á
> 3dwork-lotunni). Ekki afrit; `tools/sync-agents.cjs` lætur það í friði. Skráin svarar `kj:3dwork`
> sem síðukortin vísuðu þegar á. Rödd/persóna er óvalin — Agnar velur (tillaga: Q, tækjasmiðurinn).
> Dýpri þekking (CAD, eðlisfræði, prentun, verkfæri) er í skill **3dJoker**, sem býr aðeins á
> heimatölvunni: `C:\Users\Notandi\.claude\skills\3dJoker` — `reference/3dwork-app.md` er lengri
> útgáfa af þessu skjali. Þetta skjal fylgir repóinu svo þekkingin sé til á öllum vélum.

## Charlize — lestu fyrst
`select topic, fact, detail from v_charlize_active where (scope = 'kerfi' and topic in ('3dwork','partasafn','kjarni','deploy')) or (scope = 'folk' and topic = '3djoker') order by created_at desc;`

## Hvar hlutirnir búa
App `apps/web` (Next 16 með `cacheComponents` — leiðarskrá má ekki flytja út `dynamic`/`revalidate`,
þá fellur Vercel-buildið). Lifandi: **https://kjarni-3dwork.vercel.app/3dwork** (rót vefsins er ónotað
sniðmát). Opnast líka inni í Öpp-síðu Slökkvitækis (`js/patches/261-app-profiles.js`, PAGES-lykill
`3dwork`, app-lykill `threedwork`) — þann hluta á **opp**.

| Skjár | `apps/web/src/app/3dwork/` | `apps/web/src/lib/3dwork/` |
|---|---|---|
| Forsíða: Söfn, Partasafn, nýleg verk | `kits-home.tsx`, `collections-view.tsx`, `collection-hero.tsx`, `recent-builds.tsx` | `parts-library.ts`, `favorites.ts` |
| „Raða og mála" | `collection-arranger.tsx` | `parts-library.ts` (`sideLayout`, `collectionLayout`, `assemblyLayout`) |
| Partasafnið | `parts-library.tsx`, `library-layers.tsx`, `board-view.tsx` | `favorites.ts`, `categories.ts` |
| Bekkurinn | `workbench.tsx` (8 500 línur), `viewport.tsx`, `ribbon.tsx`, `builder-panel.tsx`, `manip-bar.tsx`, `inspector.tsx` | `project.ts`, `mesh.ts`, `snap.ts`, `turn.ts`, `hardware.ts` |
| One piece / Fix / Subtract / Merge | `one-piece-dialog.tsx` | `one-piece.ts`, `solidify.ts`, `kernel-prep.ts`, `bore.ts` |
| Skipta í tvennt, stýripinnar, „Skipta" | (bekkur) | `slice.ts`, `dowels.ts`, `split-pieces.ts` |
| Add volume (kverk), saumbursti | `add-volume-bar.tsx`, `seam-brush-bar.tsx` | `addvolume.ts`, `seam-brush.ts` |
| Hamar-reiknivél, Prufukeyrsla | `hammer-dialog.tsx`, `motion-panel.tsx` | `hammer.ts`, `muzzle.ts`, `motion.ts`, `markers.ts` |
| Ský | `cloud-picker.tsx` | `supabase-sync.ts`, `project-sync.ts`, `storage.ts` |

## Gögnin (Supabase `osfdzskyvisifcwyjkuk`)
- Tafla `work3d_projects`: `id` (`prj_…`), `name`, `project` (JSON, mest 1 MB), `manifest`
  (`{útgáfa: "<fjöldi flota í hex>-<hash>"}`), `part_count`, `deleted`, `updated_at` (stimpill raðar
  ræður samstillingu). Engin eyðing er til — aðeins `deleted = true`.
- Bucket `work3d`: `<prj>/<ver>.bin` = hrá Float32-þríhyrningasúpa, **36 bæti á þríhyrning**. Nýjar
  útgáfur bætast við, engin er yfirskrifuð.
- **Partasafnið er röðin `prj_favorites`.** Partar þar bera `collectionId`, `place {x, y, q}` (staður
  og snúningur í „Raða"), `layer`, `finishId`, `category`, `status`. Söfnin: `project.collections`.
  `part_count` þar telur aðeins sýnilega parta.
- Uppröðun safns í raunmálum án vafra: miðja möskvann á kassann sinn → snúa með `q` → færa á
  `place` (verkfæri: 3dJoker `scripts/app/collection_layout.mjs`; heilleikapróf: `cloud_integrity.mjs`).

## Prófun án þess að snerta verk Agnars
Appið **vistar sjálft** í þetta sameiginlega ský — líka af staðbundnum dev-þjóni.
- Vafrapróf verður að stöðva allt sem er ekki GET/HEAD/OPTIONS, fyrir fyrstu síðuhleðslu
  (`context.route('**/*', …)`). Allur lestur er GET, svo appið virkar; breytingar lifa aðeins í
  IndexedDB einnota vafrans. Teldu stöðvuðu beiðnirnar — opnað, ósnert verkefni á að gefa núll.
- Vafri: `playwright-core` úr `node_modules/.pnpm` (eða `@playwright/test`) með `channel: 'msedge'`
  og `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`. Hugbúnaðar-GL étur
  alla kjarna: einn vafri í einu. Skoðaðu skjámynd áður en þú trúir að striginn hafi teiknað.
- Einingapróf: `cd apps/web && npx vitest run src/lib/3dwork src/app/3dwork` (um 2 mín).
  `seam-brush.test.ts` fellur á 5 s tímamörkum þegar vélin er undir álagi — keyrðu skrána eina áður
  en þú kallar það bilun. Frá Node 25 skyggir innbyggt `localStorage` á jsdom; `vitest.config.ts`
  slekkur á því með `--no-webstorage`.
- Tegundir: `npx tsc --noEmit -p .` · lint: `npx oxlint <skrár>`.

## Útgáfa
Grein af `origin/main` í vinnutré (`C:\projects\kjarni-*`, aðalútsjekkið er sameiginlegt) → PR →
Vercel-prófið „kjarni-3dwork" grænt („Vercel Agent Review" blokkar ekki) → **Agnar sameinar með
orðinu „Merge"** eftir að hafa skoðað forskoðun (auto-merge er slökkt; sameining fer beint í loftið)
→ staðfesta production-deploy. Fyrir áhættusama breytingu vill hann afrit fyrst.

## Það sem bekkurinn kann (allt sameinað)
Plain bekkur án assembly, nákvæmar boolean-aðgerðir, One piece með Stop (#109–115) · 3D Builder-sýn,
fjölval, hópar, ribbon (#116, #130–135) · skipta í tvennt með stýripinnum (#119–121) · Partasafn
(#122, #179, #207, #212–219) · hamar-reiknivél (#123) · Add volume (#130) · miðjuhamur, samása,
einangra (#136–137) · þétt færslu-/stærðarstika (#138, #140) · saumbursti (#142–144) ·
Prufukeyrsla með útkeyrslu í J/fps og „Hlaða: Iron wolf" (#246, #248, #252, #260) · „Raða":
mælihamur (#259) og „Miðja"-rofi — nýir partar bíða í bakka (#261).

## Vitað 10.11.2026 (úttekt)
- Öll 29 PR lotunnar 11.9.–1.11. eru sameinuð og í loftinu; 432 af 432 möskvum í skýinu eru til og
  af réttri stærð (27 verkefni).
- Prufukeyrslan reiknar gormstuðul úr **vafningunum** (`springRate(motionCoil)`), hamar-reiknivélin
  úr inntakinu. Forstilling verður að bera sama gorm í báðum (`markers.ts`, prófað í
  `markers.test.ts`), annars sýnir spjaldið aðrar tölur en reiknivélin.
- `muzzle.ts` er línulegt í hlauplengd og ofmetur löng hlaup; flæðistakmarkaður ventill gefur
  nær L^⅔. Gefðu tölu appsins sem efri mörk, ekki sem loforð.
- Raunmerkjarinn er í safninu „Inter iron wolf" (`col_mv8bndrv_3mv1x`); rörið þar („body cut.3mf v3
  313") skar Agnar sjálfur 1.11.
- **Lifandi-prófun 10.11.** (höfuðlaus vafri, öll skrif stöðvuð — 77 tilraunir, allar frá einnota
  verkefnum prófsins, engin frá ósnertu verkefni): forsíða, opnun skýjaverkefnis (15 af 15 möskvum),
  Prufukeyrsla með forstillingu, „Raða" (Miðja og Mæla), sími 412 px, fjölval og hópar, skipting með
  stýripinnum, Subtract (vatnsþétt), miðjuhamur, samása, einangra, hamar-reiknivél og One piece með
  Stop virka. Lagað í sömu úttekt: leiðbeiningar lágu undir fljótandi Prufukeyrslu-takkanum; pípur og
  sívalningar urðu til í gólfinu en ekki í 20 cm hæð; kverk-tólið (`addvolume.ts`) mældi í miðju
  brúnar en ekki í brúnina, svo beint langt horn fannst nær aldrei; skiptiglugginn huldi skurðflötinn;
  innra þvermál pípu var aðeins aflestur; glugginn „Add stock by size" (Insert → By size) var aldrei
  smíðaður þótt beðið væri um hann 18.09.
- **Þekkt og ólagað:** nýleg verk sýna enga mynd á tæki sem hefur ekki opnað verkefnið (smámyndir búa
  aðeins í IndexedDB); ekkert í viðmótinu kveikir á assembly (valmyndin er inni í `{false && …}` blokk
  frá því ribbon tók við); fljótandi Prufukeyrslu-takkinn hverfur undir spjaldið sitt í síma (✕
  lokar); gamla valmyndastikan er dauður kóði í sömu blokk (stock presets þar eru ekki lengur
  aðgengileg; snittaðir boltar fást nú í „By size"-glugganum). Óprófað í vafra: að leggja fillet með
  Add volume, vistun, „Raða" í síma, alvöru skjákort.

## Tengsl
- **skill:3dJoker** (heimatölvan) — CAD á pörtum, merkjaraverkfræði, rendering, prentun, verkfærin.
- **kjarni-vefur** — skelin, Vercel-build, síðukortið `.claude/sidukort.json`.
- **opp** (sl) — 3dwork-færslan á Öpp-síðunni og skölun í síma.
- **oryggi** — RLS og policies á `work3d_projects` og bucket `work3d` (anon les og skrifar; herðing
  má ekki læsa bekkinn úti).
- **joker** / **thema** — útlit (Ragnarök-/Boss-þemað á 3dwork).

## Grunnreglur allra agenta (04.11.2026)
1. Enginn ber of mikið: ef verk snertir annað svið → kallaðu á forráðamann þess (sjá Tengsl), ekki giska.
2. Veiddu úr þínum töflum og skráðu reglur sem bíta í charlize_knowledge (scope 'kerfi', topic '3dwork').
3. Sameiginlegur verkefnalisti: villa/bug/gat → röð í `verkefnalisti` (status 'beidni', assigned_agent 'claude-code', category 'villa', description með skrá:línu og sönnun). Aldrei laga framhjá listanum.
4. Áður en lotu lýkur: hvað veit ég núna sem næsta lota veit ekki? → charlize_knowledge (1–5 færslur).

## ALDREI
- ALDREI láta vafrapróf eða dev-þjón skrifa í skýið — stöðva allt nema GET, eða nota einnota verkefni.
- ALDREI eyða röð eða möskva; fela með `deleted = true` og bæta við nýrri útgáfu.
- ALDREI snerta verkefni sem Agnar er með opið — skrifa nýtt með föstum auðkennum.
- ALDREI ræsa dev-þjón óumbeðið (hann hafnaði því 15.09.).
- ALDREI endurmódela part sem hann sendi — halda möskvanum nákvæmum og breyta aðeins því sem hann merkti.
- ALDREI giska á staðsetningu eftir skjámynd — mæla raunmöskvana og vistuðu uppröðunina.
- ALDREI hámarka skotorku: halda 12–16 J, nefna augnhlíf, hraðamæli og lagamörk.
