/* Þjónustuþráður TurboPaint (/kjarni/turbopaint): appið opnast líka án nets,
   t.d. úti á verkstað hjá Bílabúð Benna eða Nesdekk þar sem símasamband er
   stopult. Forritsskrár Next eru með efnisbundin heiti (óbreytanlegar) og koma
   úr skyndiminni; síðan sjálf er sótt af netinu fyrst og skyndiminnið notað
   þegar netið vantar. Allt annað (Supabase, Landeignaskrá, map.is) er látið
   ósnert — borð, myndir og samstilling fara sína eigin leið (persistence.ts).

   Fyrirmynd: public/coach-sw.js. Scope er þröngt (/kjarni/turbopaint) svo þetta
   snertir ekki önnur Kjarna-tól (artcraft, skraning, marks …). */

const CACHE = "turbopaint-v1";
const PAGE = "/kjarni/turbopaint";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith("turbopaint-") && name !== CACHE) await caches.delete(name);
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
    // Ein færsla fyrir síðuna sjálfa — fyrirspurnarstrengur skiptir ekki máli.
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
  // Next-bútar (hashaðir, óhætt að cache-a fast) og kyrrstæðar TurboPaint-skrár
  // (t.d. tákn tækja undir /turbopaint/) — en aldrei manifestið (lifandi lykill).
  if (
    url.pathname.startsWith("/_next/static/") ||
    (url.pathname.startsWith("/turbopaint/") && !url.pathname.endsWith(".webmanifest"))
  ) {
    event.respondWith(fromCacheFirst(request));
  }
});
