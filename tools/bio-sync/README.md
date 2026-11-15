# bio-sync — Plex-samantekt fyrir `/bio`

Keyrir á PC-tölvunni heima, þar sem Plex Media Server og diskarnir eru. Síðan `/bio` í Kjarna
(kjarni.vercel.app/bio) les það sem þetta sendir.

## Hvað það gerir
1. Les Plex (`127.0.0.1:32400`, token úr registry): söfnin, alla þætti og myndir, og möppur safnanna
   sem eru ekki lengur til (t.d. `E:\Þættir 3 seagate` → skrárnar eru í `E:\Þættir`).
2. Leitar að þáttaskrám (SxxEyy / 1x01 í heitinu) á öllum diskum.
3. Velur þætti til að fylgjast með: horft á síðustu 90 daga, sería/þáttur bættist í Plex síðustu 30 daga,
   10 síðast séðu, `fylgjast.txt` og listinn sem bætt er við á síðunni.
4. Ber hvern þátt saman við TVmaze: hvað er sýnt, í Plex, á diski utan Plex, vantar, næsti þáttur.
5. Nýir þættir: fyrstu þættir síðustu 14 daga (TVmaze, enska). Nýjar myndir: iTunes-topplistinn (US).
6. Sendir samantektina í Supabase (`bio_gogn`, sjá `apps/database/supabase/schemas/bio.sql`).

Skrifar ekkert í Plex og færir engar skrár.

## Keyra
```
node tools/bio-sync/sync.mjs           # samstilla og senda
node tools/bio-sync/sync.mjs --prufa   # ekkert sent, aðeins ~/.kjarni-bio/sidasta.json
```
Node ≥ 20. Tekur um mínútu (TVmaze leyfir ~20 köll á 10 s). Falið, t.d. í Task Scheduler á 3 klst. fresti:
`wscript.exe "<repo>\tools\bio-sync\keyra-falid.vbs"` (skrifar í `sync.log`).

## Lykill
Fyrsta keyrsla býr til lykil í `%USERPROFILE%\.kjarni-bio\.lykill` og tengil í `tengill.txt` í sömu möppu.
Opnaðu tengilinn einu sinni í hverjum vafra/síma — lykillinn fer í localStorage og úr slóðinni.
Gagnagrunnurinn geymir aðeins sha256 af lyklinum; sá sem hefur ekki lykilinn sér ekkert.
Á síðunni afritar „Tengja síma“ tengilinn til að senda í símann.

`%USERPROFILE%\.kjarni-bio\fylgjast.txt` — þættir sem alltaf er fylgst með (eitt nafn í línu).
