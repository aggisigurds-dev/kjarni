# ljos-bridge — IKEA Dirigera → /ljos

Dirigera er bara aðgengilegt á heimanetinu, svo þessi litla þjónusta keyrir heima og
`/api/ljos` í skýinu talar við hana. **Ekki prófað gegn raunverulegu Dirigera enn.**

1. Á Raspberry Pi (Node ≥ 20): `npm i dirigera` í þessari möppu.
2. Sækja token: `npx dirigera authenticate` (ýta á hnappinn á Dirigera þegar beðið er um það).
3. Ræsa: `DIRIGERA_IP=… DIRIGERA_TOKEN=… BRIDGE_TOKEN=<langt-leyndarmál> node bridge.mjs`
4. Gera port 8787 aðgengilegan að utan með HTTPS, t.d. Cloudflare Tunnel (`cloudflared tunnel --url http://localhost:8787`).
5. Í Vercel (slokkvitaeki): `LJOS_BRIDGE_URL=<https-slóð>` og `LJOS_BRIDGE_TOKEN=<sama leyndarmál>`.

Brúin neitar öllu án `Authorization: Bearer <BRIDGE_TOKEN>`. Ekki opna hana án tunnels með auth.

## Lærdómshamur (fjarstýringar)

`node bridge.mjs --learn` (með sömu env-breytum) skrifar alla atburði frá Dirigera í gluggann.
Ýttu á hnapp á fjarstýringu og sendu mér það sem birtist. **Óvíst enn** hvort Dirigera tilkynnir
hnappaýtingar frá fjarstýringum sem eru tengdar beint við ljós; ótengd fjarstýring (t.d. „Hring")
er líklegust til að sýna atburði. Skiptu um CR2032-rafhlöðu ef hún er offline.
