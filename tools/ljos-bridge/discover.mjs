// Finnur IP Dirigera-stöðvarinnar á heimanetinu með mDNS (_ihsp._tcp).
// Notkun: node discover.mjs   → prentar IP (eða villu ef ekkert svar innan 10 s)
import { discoverGatewayIP } from "./node_modules/dirigera/dist/mdnsDiscovery.js";
try {
  console.log(await discoverGatewayIP(10000));
} catch (e) {
  console.error("Fann ekki Dirigera med mDNS:", e.message);
  process.exit(1);
}
