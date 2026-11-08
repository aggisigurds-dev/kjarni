// Brú fyrir IKEA Dirigera — keyrir á tölvu HEIMA (Raspberry Pi o.fl.) á sama neti og Dirigera.
// Opnar litla HTTP-þjónustu sem /api/ljos í skýinu talar við. Sjá README.md.
// Env: DIRIGERA_IP, DIRIGERA_TOKEN, BRIDGE_TOKEN, PORT (sjálfgefið 8787)
import http from "node:http";
import { createDirigeraClient } from "dirigera";

const { DIRIGERA_IP, DIRIGERA_TOKEN, BRIDGE_TOKEN, PORT = "8787" } = process.env;
if (!DIRIGERA_IP || !DIRIGERA_TOKEN || !BRIDGE_TOKEN) {
  console.error("Vantar DIRIGERA_IP, DIRIGERA_TOKEN eða BRIDGE_TOKEN");
  process.exit(1);
}
const client = await createDirigeraClient({ gatewayIP: DIRIGERA_IP, accessToken: DIRIGERA_TOKEN });

function hexToHs(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { colorHue: Math.round((h * 60 + 360) % 360), colorSaturation: max ? Number((d / max).toFixed(2)) : 0 };
}

async function lights() {
  const list = await client.lights.list();
  return list.map((l) => ({
    id: l.id,
    name: l.attributes.customName || l.id,
    on: Boolean(l.attributes.isOn),
    bri: Math.max(1, l.attributes.lightLevel ?? 100),
    reachable: Boolean(l.isReachable),
    color: "#FFD9A0",
    canColor: (l.capabilities?.canReceive ?? []).includes("colorHue"),
  }));
}

// Lærdómshamur: `node bridge.mjs --learn` skrifar alla atburði frá Dirigera (t.d. hnappaýtingar).
// Ýttu á hnapp á fjarstýringu og sjáðu hvað kemur — svo er hægt að tengja hnappa við aðgerðir.
if (process.argv.includes("--learn")) {
  console.log("Lærdómshamur: ýttu á hnappa á fjarstýringunum. Ctrl+C til að hætta.");
  client.startListeningForUpdates((ev) => console.log(new Date().toISOString(), JSON.stringify(ev)));
}

const server = http.createServer(async (req, res) => {
  const send = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
  if (req.headers.authorization !== `Bearer ${BRIDGE_TOKEN}`) return send(401, { error: "unauthorized" });
  try {
    if (req.method === "GET" && req.url === "/lights") return send(200, await lights());
    if (req.method === "PUT" && req.url === "/state") {
      let raw = "";
      for await (const c of req) { raw += c; if (raw.length > 10_000) return send(413, { error: "too large" }); }
      const { ids, on, bri, color } = JSON.parse(raw);
      for (const id of ids) {
        if (typeof on === "boolean") await client.lights.setIsOn({ id, isOn: on });
        if (typeof bri === "number") await client.lights.setLightLevel({ id, lightLevel: bri });
        if (typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color)) await client.lights.setLightColor({ id, ...hexToHs(color) });
      }
      return send(200, { ok: true });
    }
    send(404, { error: "not found" });
  } catch (e) {
    console.error(e);
    send(502, { error: "dirigera" });
  }
});
server.listen(Number(PORT), () => console.log(`ljos-bridge á porti ${PORT}`));
