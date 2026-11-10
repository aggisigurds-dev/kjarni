/* Þjónustuþráður Tónklippu (/tonklippa): appið opnast líka án nets, t.d. á
   svellinu. Forritsskrár Next eru með efnisbundin heiti (óbreytanlegar) og
   koma úr skyndiminni; síðan sjálf er sótt af netinu fyrst og skyndiminnið
   notað þegar netið vantar. Annað (Supabase o.fl.) er látið ósnert. */

const CACHE = "tonklippa-v1";
const PAGE = "/tonklippa";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith("tonklippa-") && name !== CACHE) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

async function fromCacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

async function pageNetworkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    // Lykillinn í slóðinni skiptir ekki máli fyrir síðuna sjálfa — ein færsla.
    if (res.ok) cache.put(PAGE, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(PAGE);
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    if (url.pathname === PAGE || url.pathname === PAGE + "/") event.respondWith(pageNetworkFirst(request));
    return;
  }
  if (url.pathname.startsWith("/_next/static/") || (url.pathname.startsWith("/tonklippa/") && !url.pathname.endsWith(".webmanifest"))) {
    event.respondWith(fromCacheFirst(request));
  }
});
