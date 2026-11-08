// Brú fyrir IKEA Dirigera — keyrir á tölvu HEIMA á sama neti og Dirigera.
// Opnar litla HTTP-þjónustu sem /api/ljos í skýinu talar við. Sjá README.md.
// Env: DIRIGERA_TOKEN, BRIDGE_TOKEN, DIRIGERA_IP (valfrjálst — mDNS-leit annars), PORT (sjálfgefið 8787)
// Keyra: node --env-file=.env bridge.mjs   ·   lærdómshamur: node --env-file=.env bridge.mjs --learn
import http from "node:http";
import { createDirigeraClient } from "dirigera";
import { discoverGatewayIP } from "./node_modules/dirigera/dist/mdnsDiscovery.js";

const { DIRIGERA_TOKEN, BRIDGE_TOKEN, PORT = "8787" } = process.env;
let { DIRIGERA_IP } = process.env;
const LEARN = process.argv.includes("--learn");
if (!DIRIGERA_TOKEN || !BRIDGE_TOKEN) {
  console.error("Vantar DIRIGERA_TOKEN eða BRIDGE_TOKEN — sjá .env og README.md (npm run auth)");
  process.exit(1);
}
if (!DIRIGERA_IP) {
  console.log("DIRIGERA_IP ekki sett — leita með mDNS …");
  DIRIGERA_IP = await discoverGatewayIP(10000);
}
const client = await createDirigeraClient({ gatewayIP: DIRIGERA_IP, accessToken: DIRIGERA_TOKEN });

// Litir: hex ↔ hue/saturation (Dirigera notar colorHue 0-360, colorSaturation 0-1)
function hexToHs(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { colorHue: Math.round((h * 60 + 360) % 360), colorSaturation: max ? Number((d / max).toFixed(2)) : 0 };
}
function hsToHex(h, s) {
  const f = (n) => {
    const k = (n + h / 60) % 6;
    return Math.round((1 - s * Math.max(0, Math.min(k, 4 - k, 1))) * 255).toString(16).padStart(2, "0");
  };
  return `#${f(5)}${f(3)}${f(1)}`;
}
function approxColor(a) {
  if (a.colorMode === "color" && typeof a.colorHue === "number") return hsToHex(a.colorHue, a.colorSaturation ?? 1);
  const k = a.colorTemperature;
  if (typeof k === "number") return k < 2900 ? "#FFC27A" : k < 3600 ? "#FFE2B8" : "#EEF3FF";
  return "#FFD9A0";
}

async function lights() {
  const list = await client.lights.list();
  return list
    .filter((l) => !l.isHidden)
    .map((l) => ({
      id: l.id,
      name: l.attributes.customName || l.id,
      room: l.room?.name ?? null,
      on: Boolean(l.attributes.isOn),
      bri: Math.min(100, Math.max(1, Math.round(l.attributes.lightLevel ?? 100))),
      reachable: Boolean(l.isReachable),
      color: approxColor(l.attributes),
      canColor: (l.capabilities?.canReceive ?? []).includes("colorHue"),
      canWhite: (l.capabilities?.canReceive ?? []).includes("colorTemperature"),
    }));
}

const WHITE_K = { warm: 2700, neutral: 3300, cool: 4000 };

async function setOne(id, { on, bri, color, white }) {
  if (typeof on === "boolean") await client.lights.setIsOn({ id, isOn: on });
  if (typeof bri === "number") {
    await client.lights.setLightLevel({ id, lightLevel: Math.min(100, Math.max(1, Math.round(bri))) });
  }
  if (typeof white === "string" && Object.hasOwn(WHITE_K, white)) {
    // Perurnar hafa hvert sitt bil (Dirigera skilar min/max stundum öfugt) — klemma innan þess.
    const l = await client.lights.get({ id });
    const a = l.attributes;
    const bounds = [a.colorTemperatureMin, a.colorTemperatureMax].filter((x) => typeof x === "number");
    let k = WHITE_K[white];
    if (bounds.length === 2) k = Math.min(Math.max(...bounds), Math.max(Math.min(...bounds), k));
    await client.lights.setLightTemperature({ id, colorTemperature: k });
  }
  if (typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color)) {
    await client.lights.setLightColor({ id, ...hexToHs(color) });
  }
}

// Lærdómshamur: `node bridge.mjs --learn` skrifar atburði frá Dirigera (hnappaýtingar o.fl.) í gluggann.
if (LEARN) {
  const ctrls = await client.controllers.list();
  console.log("Lærdómshamur — fjarstýringar sem Dirigera þekkir:");
  if (ctrls.length === 0) console.log("  (engar)");
  for (const c of ctrls) {
    const a = c.attributes;
    console.log(
      `  ${a.customName || c.id} · ${c.deviceType} · ${c.isReachable ? "tengd" : "OFFLINE"} · rafhlaða ${a.batteryPercentage ?? "?"}%` +
        ` · id ${c.id} · remoteLinks ${JSON.stringify(c.remoteLinks ?? [])}`,
    );
  }
  console.log("Ýttu á hnappa á fjarstýringunum. Ctrl+C til að hætta.");
  const ctrlIds = new Set(ctrls.map((c) => c.id));
  client.startListeningForUpdates((ev) => {
    if (ev.type === "ping" || ev.type === "pong") return;
    const t = new Date().toISOString().slice(11, 19);
    if (ev.type === "remotePressEvent") console.log(`${t} [HNAPPUR] ${ev.data.id} ${ev.data.clickPattern}`);
    else if (ev.type === "deviceStateChanged" && ctrlIds.has(ev.data.id))
      console.log(`${t} [fjarstýring] ${ev.data.id} ${JSON.stringify(ev.data.attributes ?? {})}`);
    else console.log(`${t} ${ev.type} ${JSON.stringify(ev.data ?? null).slice(0, 300)}`);
  });
}

const server = http.createServer(async (req, res) => {
  const send = (code, obj) => {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(obj));
  };
  if (req.headers.authorization !== `Bearer ${BRIDGE_TOKEN}`) return send(401, { error: "unauthorized" });
  try {
    if (req.method === "GET" && req.url === "/lights") return send(200, await lights());
    if (req.method === "PUT" && req.url === "/state") {
      let raw = "";
      for await (const c of req) {
        raw += c;
        if (raw.length > 10_000) return send(413, { error: "too large" });
      }
      const body = JSON.parse(raw);
      const ids = Array.isArray(body.ids) ? body.ids.map(String).slice(0, 50) : [];
      if (ids.length === 0) return send(400, { error: "ids vantar" });
      const results = await Promise.allSettled(ids.map((id) => setOne(id, body)));
      const failed = ids.filter((_, i) => results[i].status === "rejected");
      results.forEach((r, i) => r.status === "rejected" && console.error(`x ${ids[i]}:`, r.reason?.message ?? r.reason));
      if (failed.length === ids.length) return send(502, { error: "dirigera", failed });
      return send(200, { ok: true, failed });
    }
    send(404, { error: "not found" });
  } catch (e) {
    console.error(e);
    send(502, { error: "dirigera", detail: String(e?.message ?? e).slice(0, 200) });
  }
});
server.listen(Number(PORT), async () => {
  let n = "?";
  try { n = (await lights()).length; } catch (e) { console.error("Næ ekki ljósalista:", e.message); }
  console.log(`ljos-bridge á porti ${PORT} · Dirigera ${DIRIGERA_IP} · ${n} ljós`);
});
