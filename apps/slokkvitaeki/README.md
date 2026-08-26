# apps/slokkvitaeki

Slökkvitæki/Kjarni vefurinn — Stjórnstöðin (`/kjarni`), TurboPaint
(`/kjarni/turbopaint`), Kerfi, Skjalarinn o.fl.

## Deploy

Deployast sjálfkrafa á Vercel við push á `main`:

- Vercel-verkefni: **slokkvitaeki** (team Kjarni), Root Directory `apps/slokkvitaeki`
- Production-lén: **kjarni.vercel.app** (líka slokkvitaeki.vercel.app)
- Build: `npm run build` / `npm install` (overrides í Vercel-stillingum)

Deploy-slóðir (`slokkvitaeki-<hash>-kjarni.vercel.app`) eru bak við Vercel
Authentication; production-lénin eru opin.
