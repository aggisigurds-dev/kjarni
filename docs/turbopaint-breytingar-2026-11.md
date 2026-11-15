# TurboPaint — breytingar 06.–10.11.2026 og hvernig þær eru sannreyndar

Heimildin um Teikning-gluggann og TurboPaint í heild (hvað virkar, hvað er opið, prófunarmynstur, veggjavélin) er
`slokkvitaeki/.claude/skills/arnold/references/turbopaint-stada.md` — ein staðreynd á einum stað. Þetta er stutt
kóðaskrá fyrir kjarna-lotur.

| PR | Hvað | Skrár | Próf |
|---|---|---|---|
| #290 | Halli blaðsins mældur á myndinni (ekki veggjum borðsins), handstýring sem vélin skrifar aldrei yfir, vistast (`uttekt.skekkja`, `skekkjaHandvirk`) | `lib/board/thunnir-veggir.ts`, `skonnun-veggir-mynd.ts`, `skonnun-veggir-verk.ts`, `components/kjarni/VeggjaRitill.tsx` | `thunnir-veggir.test.ts`, `uttekt-stillingar.test.ts` |
| #291 | Húsið handteiknað (`HusUtlina.tsx`), `uttekt.husUtlina` í dílum frummyndar; greining + 3D nota hana | `lib/board/veggja-hreinsun.ts`, `sjalfvirkt.ts`, `uttekt.ts`, `hus3d.ts` | `veggja-hreinsun.test.ts`, `hus3d.test.ts`, `uttekt.test.ts` |
| #292 | Veggjaritillinn læsir ekki laginu „Teikning“ sjálfkrafa | `lib/board/veggja-ritill-stada.ts` | `veggja-ritill.test.ts` |
| #294 | `fetch-plan` leyfir `osfdzskyvisifcwyjkuk.supabase.co` (eigin geymsla) | `app/api/turbopaint/fetch-plan/route.ts` | framleiðsla 403 → 200 |
| #296 | `?uttekt=&haed=` opnast í skoðun þegar ekkert borð er til; fyrsta breytingin / „Vista í úttekt“ býr borðið til (`useSkodun.uttekt`) | `lib/board/skodun.ts`, `persistence.ts`, `components/kjarni/WhiteboardApp.tsx`, `TopBar.tsx` | `skodun.test.ts`; skrifvarin prófun á framleiðslu: engin POST við opnun |
| #298, #300 | Húsið (handteiknuð útlína) ræður skurðinum í sjálfvirka verkferlinu (`kassiUtlinu`, 2,5 % spássía); fyrri skurður víkur nema `myndSkurdur` eða leiðrétt hæð | `lib/board/sjalfvirkt.ts`, `veggja-hreinsun.ts` | `veggja-hreinsun.test.ts`; framleiðsla Breiðhöfði 2. hæð |
| #299, #301 | Halli blaðsins allur í vinnuþræði (`halliblad`: createImageBitmap + OffscreenCanvas) og bíður eftir blobinu allt að 20 s | `lib/board/skonnun-veggir-verk.ts`, `skonnun-veggir-mynd.ts` | long tasks: 377 ms → 0 ≥100 ms á JPEG-blaði |
| #302 | Útlit í 3D: litir veggja/hurða, gólfáferðir (`golfaferdir.ts`), vistast sem `uttekt.utlit3d` → `haedir[].utlit3d` | `components/kjarni/Hus3D.tsx`, `lib/board/uttekt.ts`, `types.ts` | `golfaferdir.test.ts`, `uttekt-stillingar.test.ts` |
| #306, #310 | Gólfáferð bökuð á einn striga (three r128: `map.repeat` endurtók `alphaMap`-grímuna → gólfið hvarf); ólýst efni fyrir rétta liti | `components/kjarni/Hus3D.tsx`, `lib/board/golfaferdir.ts` | skjáskot af framleiðslu |
| #307 | Lokaskref skarprar TIF-skönnunar í þræði (OffscreenCanvas: sía + JPEG) | `lib/board/skonnun-verk.ts`, `skonnun.ts` | 904 + 548 ms → 386 ms; blaðið pixlarétt eins |
| #308 | `?uttekt=` opnast beint: biðstaða í minni í stað `loadBoard`, `takaVidBordi` í stað `switchBoard`, `haettaBidOgHlada` við villu | `components/kjarni/WhiteboardApp.tsx`, `lib/board/persistence.ts` | opnun 19,9 → 14,5 s, löng verk 4,9 → 0,8 s |
| #309 | „Útveggir úr útlínu“ (`utveggirSemVantar`) | `components/kjarni/HusUtlina.tsx`, `lib/board/veggja-hreinsun.ts` | `veggja-hreinsun.test.ts` 30/30; framleiðsla 68 → 72 → undo 68 |
| #313 | „Vista í úttekt“ sést líka í úttektar-skoðun (hæð opnuð án borðs) | `components/kjarni/WhiteboardApp.tsx` | framleiðsla: takkinn til, smellur skrifar borð + hæð |
| #314–#317 | Hökt við veggjabreytingar: blaðið án skugga, í eigin Konva-lagi, `ObjectNode` í `React.memo` með stöðugum meðhöndlurum, `perfectDrawEnabled={false}` á öll form, `GridLayer` minnisað | `components/kjarni/ObjectNode.tsx`, `BoardCanvas.tsx`, `SymbolNode.tsx`, `GridLayer.tsx` | framleiðsla: löng verk við drátt á veggenda 150 → 0; teikningar blaðs/rúðunets 59 → 0 |

**Prófun án skrifa á framleiðslu:** Playwright, `ctx.route('**/*')` → allt nema GET/HEAD/OPTIONS á `supabase.co` er
`fulfill`-að og skráð. `window.__tpStore`, `__tpSkodun`, `__tpSjalfvirkt` eru til fyrir próf (`WhiteboardApp.tsx` ~270).
Vercel-forskoðun PR-a er á bak við innskráningu — sannreyndu á `slokkvitaeki.vercel.app` eftir sameiningu.

**Gildrur:** `uttekt` á myndinni er ENDURBYGGÐ úr hæðinni við hverja opnun og „Vista í úttekt“ (`utbuaVistun`) afritar
aðeins tiltekna reiti í `haedir[]` — ný notendastilling lifir aðeins ef BÁÐAR hliðar eru uppfærðar (`skrifaStillingarIHaed`,
þrístig: `undefined` ósnert / `null` hreinsað / gildi skrifað). Handteiknuð gögn vistast í dílum frummyndar
(`utlinaIFrum`/`utlinaIBord`), borðhnit lifa aðeins lotuna.

## 12.–15.11.2026 — án nets, forsíða og sync-ljós

| PR | Hvað | Skrár | Próf |
|---|---|---|---|
| #320 | TurboPaint virkar án nets: þjónustuþráður (scope `/kjarni/turbopaint`), installanlegt (manifest + tákn), „Sækja fyrir offline" per borð (doc + allar myndir, líka frumritið, í IndexedDB) | `public/turbopaint-sw.js`, `public/turbopaint/manifest.webmanifest`, `components/kjarni/OfflineReady.tsx`, `lib/board/persistence.ts` (`g_oraBordOfflineTilbuid`, `erBordOfflineTilbuid`), `lib/board/assets.ts` | `offline-tilbuid.test.ts`; Playwright: endurhleðsla án nets skilar appinu |
| #321 | Eigið app-auðkenni (`id`) í manifest + `navigator.storage.persist()` | `manifest.webmanifest`, `OfflineReady.tsx` | framleiðsla: manifest með `id` |
| #322 | „Aa − +" viðmótsstærð á snertiskjá: `--tp-ui` + `zoom` á stikur (`.tp-ui-scale`), ALDREI á `.kjarni-stage` | `components/kjarni/UiScale.tsx`, `styles.css`, `WhiteboardApp.tsx` | Playwright: topbar 56 → 73 px við 1,3×, strigi óbreyttur |
| #323 | Verkefni-forsíða: listi yfir borðin, leit, opnast sjálfkrafa á síma (ekki við `?uttekt=`/`?skoda=`) | `components/kjarni/Verkefni.tsx`, `WhiteboardApp.tsx`, `TopBar.tsx` | Playwright: forsíða á síma, hnappur á tölvu |
| #324 | Sync-ljós á forsíðunni: rautt úrelt / gult óvistað á borði / grænt í sync / grátt ótengt; „Sækja ferska útgáfu úr úttekt"; eyða eftir auðkenni | `lib/board/sync-stada.ts`, `sync-saekja.ts`, `Verkefni.tsx`, `persistence.ts` (`eydaBordi`) | `sync-stada.test.ts` (15); raungögn 54 borð: 9 græn / 16 rauð / 7 gul / 22 ótengd |

**Sync-ljósin í hnotskurn:** þurrkeyrsla á „Vista í úttekt" (`utbuaVistun`, skrifar ekkert) fyrir hvert borð; `uttekt.merki` á
myndinni segir í hvora áttina munurinn er (úttekt nýrri → rautt; óvistað á borði → gult, sem gengur fyrir). Geymt borð er aðeins
vinnueintak — hæð sem er opnuð úr Slökkvitæki-appinu er alltaf endurbyggð úr `teikning_bord`, en borð opnað beint í TurboPaint
(forsíðan, án nets) sýnir geymdu útgáfuna.

**Gildrur:** (1) `app/globals.css` á hnattræna, ólagskipta `.grid { margin-top: 44px; gap: 18px }` (markaðssíðan) sem vinnur á
Tailwind-klasanum `grid` — notaðu `[display:grid]` í TurboPaint-hlutum. (2) Forsíðan er með eyða-hnapp og „Sækja ferska útgáfu":
lokaðu ALLTAF á skrif í prófun gegn raungögnum (sjá að ofan). (3) `zoom` má aldrei lenda á `.kjarni-stage` eða foreldri hennar —
snerti-hnit teikningarinnar ruglast.

## 15.11.2026 — eyðing milli tækja og offline-útgáfur

| PR | Hvað | Skrár | Próf |
|---|---|---|---|
| #325 | Kjarna-Stjórnstöðin fær heimaskjás-tákn (hvítt K, appelsínugulur kjarni) + manifest `display: browser` (flýtileið, gleypir ekki TurboPaint/Apex) | `public/stjornstod/*`, `app/kjarni/page.tsx` | Chromium les manifestið villulaust í framleiðslu |
| #326 | Eytt borð lifnar ekki við af öðru tæki (`eyttISkyi`/`ovisstUmSky` → `pushBoard` ýtir ekki eyddu borði nema nýrri vinna sé á því; `listBoards` hreinsar; `eydaBordi` ský fyrst líka fyrir opna borðið). ⬇ offline uppfærir eldra eintak; „eldri útgáfa í síma" | `lib/board/persistence.ts`, `Verkefni.tsx`, `TopBar.tsx` | `eyding-sync.test.ts` (6); vafri gegn raungögnum án skrifa |

**Gildra:** `pushBoard` er upsert með `deleted: false` — hvert nýtt skrif-flæði sem ýtir borði verður að virða `eyttISkyi`,
annars lífgar það eytt borð við á öllum tækjum. Tímastimplar: staðbundið `…Z`, skýið `…+00:00` → berðu saman með `erNyrra`
(Date.parse), aldrei strengjum.
