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
