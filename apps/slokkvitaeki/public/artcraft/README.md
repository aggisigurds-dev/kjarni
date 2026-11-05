# ArtCraft web builds

Official WASM builds from [ArtCraft Crafting Apps](https://getartcraft.com/apps).
Each app folder (`photocraft`, `vectorcraft`, …) is fetched by
`scripts/install-artcraft.mjs` and is gitignored.

```
pnpm --filter slokkvitaeki-vefur artcraft:install
```

Vercel runs the same script on `prebuild`.
