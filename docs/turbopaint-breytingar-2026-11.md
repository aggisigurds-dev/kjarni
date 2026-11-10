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

**Prófun án skrifa á framleiðslu:** Playwright, `ctx.route('**/*')` → allt nema GET/HEAD/OPTIONS á `supabase.co` er
`fulfill`-að og skráð. `window.__tpStore`, `__tpSkodun`, `__tpSjalfvirkt` eru til fyrir próf (`WhiteboardApp.tsx` ~270).
Vercel-forskoðun PR-a er á bak við innskráningu — sannreyndu á `slokkvitaeki.vercel.app` eftir sameiningu.

**Gildrur:** `uttekt` á myndinni er ENDURBYGGÐ úr hæðinni við hverja opnun og „Vista í úttekt“ (`utbuaVistun`) afritar
aðeins tiltekna reiti í `haedir[]` — ný notendastilling lifir aðeins ef BÁÐAR hliðar eru uppfærðar (`skrifaStillingarIHaed`,
þrístig: `undefined` ósnert / `null` hreinsað / gildi skrifað). Handteiknuð gögn vistast í dílum frummyndar
(`utlinaIFrum`/`utlinaIBord`), borðhnit lifa aðeins lotuna.
