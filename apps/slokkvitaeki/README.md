# apps/slokkvitaeki

Slökkvitæki/Kjarni vefurinn — Stjórnstöðin (`/kjarni`), TurboPaint
(`/kjarni/turbopaint`), ArtCraft (`/kjarni/artcraft`), Kerfi, Skjalarinn o.fl.

ArtCraft-öppin þrettán (PhotoCraft, VectorCraft, FilmCraft, LightCraft, PdfCraft,
EffectCraft, DesignCraft, FigCraft, WordCraft, SoundCraft, DeckCraft, CADCraft,
GridCraft) eru opin WASM-útgáfur frá
[getartcraft.com/apps](https://getartcraft.com/apps). Þau eru sótt við
`pnpm artcraft:install` / `prebuild` og hýst undir `/artcraft/<app>/`.

Einkastúdíó (`/kjarni/artcraft/studio`) er skipt í þrjá hama við titilinn: Stakar
(prompt og ein mynd), Videó (hreyfimynd og athafnir) og Persóna (prófíll, hringur,
3D-stelling). Staðbundið WebUI helst alltaf sýnilegt. Myndun gengur gegnum Automatic1111 /
Forge / SD.Next (`--api` + CORS). Það breytir ljósmynd sem þú setur inn — án myndar
er ekki myndað, svo líkanið teikni ekki nýtt andlit. Hægt er að stilla stærð /
skref / CFG / seed / sampler / denoising, fínpússa líkamslínur (þenja, minnka,
draga) og mála maska sem promptið eða skjáskot endurskrifar (inpaint, ekki lágur
heildar-img2img). Hægt er að sleppa skjáskoti af bikini / sundfatnaði eða höfði
við promptið; Forge byrjar á því í máluðu gatinu. Greina merkir bol, ermar, buxur,
skó, bakgrunn og hluti. Fatnaður er eytt fyrst og nýtt bætt við (t.d. buxur →
stuttbuxur), ekki breytt á staðnum. Síðan má breyta lit eða skipta um bakgrunn.
Stúdíóljós (high-key / Rembrandt / Butterfly) stilla þrjú flass. Bakgrunnur er
valinn sem pappírsdúkur (bleikur, hvítur, beige, grár, blár, grænn, vínrauður,
strigi, kolagrár, svartur); „Stúdíómyndataka“ skiptir um bakgrunn og heldur
manneskju og stellingu. Persónuprófíll geymir allt að 10 skýrar andlitsmyndir
og 8 sjónarhorn allan hringinn; „Skerpa andlit“ endurbyggir óskýrt andlit og
„Realistic avatar“ gerir samræmdan 2D-snúningsblað (ekki 3D-möskva) með GFPGAN
og IP-Adapter Face þegar það er til á vélinni. „Hreyfimynd“ gengur ramma-fyrir-ramma
úr sömu ljósmynd (ekki úr síðustu útkomu) með einu seed, svo andlitið leki
ekki yfir í aðra konu. Athafnir: öndun, dansa, pósur, standa upp, snúa í hring;
hægt er að vista nýjar skipanir úr prompti. Saumar WebM. Útlitsflísar (myndavél,
svipbrigði, fatnaður), lookbook (4 kyrrar), athafnaröð og uppruna/útkomu-samanburður.
Pósuviðmið (OpenPose þegar það er til) læsir stellingu avatarsins við markmiðsmynd.
Stutt videó er lesið í ramma og avatarinn endurgerir hreyfinguna. Skjámynd af
fatnaði eða skarti fer á manneskjuna (IP-Adapter án andlits, annars prompt).
Hægt er að snúa avatarnum um horn, mála galla og biðja um lagfæringu
á því svæði. Útgáfur (sumar, elegant, jólafatnaður, diskó, eða eigið nafn)
vistast með prófílnum. Líkamsgrunnar (A-pose, rúmmál, liðamót) læsa
hlutföllum; hæð, þyngd, slim/athletic, húðlitur, hárlitur og hárlengd
stýra mannikin og aðlögun. Eigin grunnur má vera skjámynd
af Ready Player Me, VRoid eða Mixamo. Hægt er að draga ljósmyndir eða stutt
videóbrot yfir andlit, bol, hendur og fætur — part fyrir part — baka saumana
eða hreyfa aðeins þann part.
Ófullkominn hringur: „Fylla vantar horn“ málar vantar gráður af næstu
ljósmynd gegnum Forge. 3D er aðeins stelling — dúkka og Barbie fara ekki
inn sem mynd. Á
3D-spjaldinu eru hlekkir og skref-fyrir-skref leiðbeiningar (Meshy, Tripo,
Sketchfab, Modly): sækja GLB, Setja inn GLB, fylla hornin. Duix og SMPL-X
eru merkt sem ekki fyrsta skref.
Fullorðinsmyndefni er leyfilegt;
kynferðislegt myndefni af börnum er lokað. Keyrðu
`scripts/private-studio-webui.sh` til að sjá ræsi-skipunina.

## Deploy

Deployast sjálfkrafa á Vercel við push á `main`:

- Vercel-verkefni: **slokkvitaeki** (team Kjarni), Root Directory `apps/slokkvitaeki`
- Production-lén: **kjarni.vercel.app** (líka slokkvitaeki.vercel.app — sama app, ekki önnur útgáfa)
- Build: `npm run build` / `npm install` (overrides í Vercel-stillingum)

Deploy-slóðir (`slokkvitaeki-<hash>-kjarni.vercel.app`) eru bak við Vercel
Authentication; production-lénin eru opin.

## Tvö Vercel-verkefni

Kjarni-monorepoið keyrir **tvö** production-lén. Þau eru ekki tvær TurboPaint-útgáfur.

| Lén | App | Hvað er þarna |
| --- | --- | --- |
| https://kjarni.vercel.app | `apps/slokkvitaeki` | Stjórnstöð + **TurboPaint** + **ArtCraft** |
| https://slokkvitaeki.vercel.app | sama app | alias á lénið að ofan |
| https://kjarni-3dwork.vercel.app | `apps/web` | Marks + 3dwork. `/kjarni/turbopaint` var 404; nú vísar það á kjarni.vercel.app |

PDF-innflutningur er aðeins á fyrsta léninu, inni í TurboPaint (ekki á Stjórnstöðinni).
