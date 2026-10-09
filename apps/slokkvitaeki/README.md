# apps/slokkvitaeki

Slökkvitæki/Kjarni vefurinn — Stjórnstöðin (`/kjarni`), TurboPaint
(`/kjarni/turbopaint`), ArtCraft (`/kjarni/artcraft`), Kerfi, Skjalarinn o.fl.

ArtCraft-öppin sjö (PhotoCraft, VectorCraft, FilmCraft, LightCraft, PdfCraft,
EffectCraft, DesignCraft) eru opin WASM-útgáfur frá
[getartcraft.com/apps](https://getartcraft.com/apps). Þau eru sótt við
`pnpm artcraft:install` / `prebuild` og hýst undir `/artcraft/<app>/`.

Einkastúdíó (`/kjarni/artcraft/studio`) myndar staðbundið gegnum Automatic1111 /
Forge / SD.Next (`--api` + CORS). Fullorðinsmyndefni er leyfilegt; kynferðislegt
myndefni af börnum er lokað. Keyrðu `scripts/private-studio-webui.sh` til að
sjá ræsi-skipunina.

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
