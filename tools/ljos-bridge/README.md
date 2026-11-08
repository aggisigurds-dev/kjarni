# ljos-bridge — IKEA Dirigera → /ljos

Dirigera er bara aðgengilegt á heimanetinu, svo þessi litla þjónusta keyrir heima (PC-tölvan á
Langamýri eða Raspberry Pi) og `/api/ljos` í skýinu talar við hana.

## Uppsetning (Node ≥ 20)

1. `npm i` í þessari möppu.
2. `npm run discover` — finnur IP Dirigera með mDNS (ef það klikkar: lesa IP úr tækjalista routersins, heitir DIRIGERA).
3. Lyklar búa í `.env` (í `.gitignore`, ALDREI commit-a):
   ```
   BRIDGE_TOKEN=<langt leyndarmál — sama gildi og LJOS_BRIDGE_TOKEN í Vercel>
   DIRIGERA_IP=<valfrjálst, mDNS annars>
   DIRIGERA_TOKEN=<skrifast af npm run auth>
   PORT=8787
   ```
   Nýtt `BRIDGE_TOKEN`: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
4. `npm run auth` — ýta á hnappinn UNDIR Dirigera-stöðinni innan 60 s þegar beðið er um það.
   Skrifar `DIRIGERA_TOKEN` (og IP) í `.env` án þess að prenta lykilinn.
5. `npm start` — brúin hlustar á `http://localhost:8787` og prentar fjölda ljósa.
   Falið (enginn gluggi): tvísmella á `start-bridge.vbs` (skrifar `bridge.log`) — setja í shell:startup svo hún lifi endurræsingu.
6. Gera port 8787 aðgengilegt að utan með HTTPS, t.d. Cloudflare Tunnel:
   `cloudflared tunnel --url http://localhost:8787` (quick tunnel fær nýja slóð í hvert skipti).
   Portable `bin/cloudflared.exe` (gitignored) + `start-tunnel.vbs` keyrir það falið; slóðin birtist í `tunnel.log`.
7. Í Vercel (slokkvitaeki): `LJOS_BRIDGE_URL=<https-slóð>` og `LJOS_BRIDGE_TOKEN=<sama og BRIDGE_TOKEN>`.

Brúin neitar öllu án `Authorization: Bearer <BRIDGE_TOKEN>`. Ekki opna hana án tunnels með auth.

## Endapunktar

- `GET /lights` → `[{ id, name, room, on, bri (1-100), reachable, color (#hex), canColor, canWhite }]`
- `PUT /state` `{ ids: [..], on?, bri?, color?: "#rrggbb", white?: "warm"|"neutral"|"cool" }`
  → `{ ok: true, failed: [ids sem höfnuðu] }`; 502 ef öll ljósin höfnuðu.
  Hvíta hitastigið (2700/3300/4000 K) er klemmt innan bils hverrar peru.

## Lærdómshamur (fjarstýringar)

`npm run learn` (= `node --env-file=.env bridge.mjs --learn`) listar fjarstýringarnar sem Dirigera
þekkir (nafn, tengd/OFFLINE, rafhlaða, id) og skrifar svo alla atburði í gluggann:
`[HNAPPUR] <id> singlePress|doublePress|longPress` (remotePressEvent) eða `[fjarstýring] <id> {...}`.
Ýttu á hnapp og sendu það sem birtist. **Óvíst enn** hvort Dirigera tilkynnir hnappaýtingar frá
fjarstýringum sem eru tengdar beint við ljós; ótengd fjarstýring (t.d. „Hring") er líklegust til að
sýna atburði. Skiptu um CR2032-rafhlöðu ef hún er offline.

Prófað 08.11.2026 gegn raunverulegu Dirigera (192.168.76.100, 25 ljós): `GET /lights` og 401 án lykils virka,
bæði staðbundið og gegnum Cloudflare quick tunnel. dirigera 2.0.2 — `lights.setLightTemperature` er til (ágiskunin stóðst).
