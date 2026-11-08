// Saekir adgangslykil fra Dirigera og vistar hann sem DIRIGERA_TOKEN i .env — prentar hann ALDREI.
// Keyra: node --env-file=.env auth.mjs [ip]
// Thegar "Press the Action Button" birtist: yta a hnappinn UNDIR Dirigera-stodinni innan 60 s.
import { readFileSync, writeFileSync } from "node:fs";
import { createDirigeraClient } from "dirigera";
import { discoverGatewayIP } from "./node_modules/dirigera/dist/mdnsDiscovery.js";

const ENV = new URL("./.env", import.meta.url);
let ip = process.argv[2] || process.env.DIRIGERA_IP;
if (!ip) {
  console.log("Leita ad Dirigera med mDNS ...");
  ip = await discoverGatewayIP(10000);
}
console.log("Dirigera:", ip);
const client = await createDirigeraClient({ gatewayIP: ip });

let token;
try {
  token = await client.authenticate({ verbose: true });
} catch (e) {
  const msg = String(e?.message ?? e);
  if (/Invalid authorization code/i.test(msg)) {
    console.error("\nHnappurinn var ekki yttur innan 60 s (eda stodin hafnadi kodanum). Keyrdu aftur og yttu a hnappinn UNDIR stodinni.");
  } else {
    console.error("\nAudkenning mistokst:", msg.slice(0, 300));
  }
  process.exit(2);
}

let env = readFileSync(ENV, "utf8");
const set = (k, v) => {
  const re = new RegExp(`^${k}=.*$`, "m");
  env = re.test(env) ? env.replace(re, () => `${k}=${v}`) : `${env.replace(/\n?$/, "\n")}${k}=${v}\n`;
};
set("DIRIGERA_TOKEN", token);
set("DIRIGERA_IP", ip);
writeFileSync(ENV, env);
console.log(`OK: adgangslykill vistadur i .env (${token.length} stafir) — ekki prentadur.`);
