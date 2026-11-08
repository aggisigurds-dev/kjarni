# Ljósastýring Langamýri 22 — uppsetning (`/ljos`)

Leiðbeiningar sem hægt er að gefa Claude á PC-tölvunni (eða fylgja sjálf/ur).

- Síða: `apps/slokkvitaeki/app/ljos` · API: `apps/slokkvitaeki/app/api/ljos/route.ts` (+ `tuya.ts`)
- IKEA-brú: `tools/ljos-bridge/` (lestu `README.md` fyrst)
- Reglur: aldrei prenta eða commit-a lykla. Spyrja áður en Vercel er breytt.

## A. Luminus-borðar (Tuya Cloud)
Luminus-appið er Tuya-byggt; borðarnir eru Wi-Fi Tuya-tæki í heimilinu „Langamýri".

1. Stofna ókeypis aðgang á iot.tuya.com og „Cloud project" (Smart Home, gagnaver **Central Europe**).
2. Í verkefninu: Devices → Link App Account → Add App Account. QR-kóði birtist; skanna hann úr
   Luminus-appinu (Me → skanna-tákn). Ef það tekst ekki: bæta borðunum í Smart Life-appið og tengja
   þann reikning í staðinn.
3. Lesa Access ID, Access Secret og UID reikningsins → Vercel: `TUYA_ACCESS_ID`, `TUYA_ACCESS_SECRET`,
   `TUYA_UID` (`TUYA_REGION` = `eu`).
4. Sum ljós eru offline í appinu — það er tækja-/Wi-Fi-vandi, ekki kóði.

## B. IKEA-ljós (Dirigera-brú á PC)
1. Node ≥ 20. Í `tools/ljos-bridge`: `npm i dirigera`.
2. Finna IP Dirigera í tækjalista routersins (heitir DIRIGERA). `npx dirigera authenticate`; ýta á
   hnappinn undir stöðinni þegar beðið er um. Skrifar token.
3. Búa til langt leyndarmál: sama gildi sem `BRIDGE_TOKEN` (hér) og `LJOS_BRIDGE_TOKEN` (Vercel).
4. Ræsa: setja `DIRIGERA_IP`, `DIRIGERA_TOKEN`, `BRIDGE_TOKEN` sem umhverfisbreytur, `node bridge.mjs`.
5. Opna port 8787 yfir HTTPS, t.d. `cloudflared tunnel --url http://localhost:8787`; slóðin fer í Vercel
   sem `LJOS_BRIDGE_URL` (quick tunnel fær nýja slóð í hvert skipti).
6. Brúin er **óprófuð** gegn raunverulegu Dirigera. Ef endapunktur klikkar: laga `bridge.mjs`. Þekkt
   ágiskun: `client.lights.setLightTemperature` gæti heitið öðru nafni í `dirigera`-pakkanum.
7. Fjarstýringar: `node bridge.mjs --learn`, ýta á hnappa á „Hring fjarstyringin" (þarf nýja CR2032;
   sýnir offline) og skrá hvaða atburðir koma. Óvíst hvort Dirigera tilkynnir hnappaýtingar.

## C. Vercel
Verkefnið `slokkvitaeki` → Settings → Environment Variables: `LJOS_PIN` (PIN að eigin vali),
`LJOS_BRIDGE_URL`, `LJOS_BRIDGE_TOKEN`, `TUYA_ACCESS_ID`, `TUYA_ACCESS_SECRET`, `TUYA_UID`.
Valfrjálst fyrir Philips Hue: `HUE_REMOTE_TOKEN`, `HUE_USERNAME`. Svo redeploy.

## D. Prófun
Opna `/ljos`, slá inn PIN, staðfesta að IKEA- og Luminus-ljós birtist. Prófa kveikja/slökkva, birtu og
hvítu hnappana. Skrá villutexta nákvæmlega. Á teikningunni: „Staðsetja á teikningu" fyrir hvert ljós.
