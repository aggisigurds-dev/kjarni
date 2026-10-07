/* Vörður vafraprófa TurboPaint (07.10.2026): staðbundni þjónninn notar SAMA Supabase og lifandi síðan. Próf sem opnaði
 * ?uttekt=1612 skipti yfir á lifandi borð Agnars („Fiskislóð — 1. hæð"), endurbyggði það og ýtti því í turbopaint_boards
 * meðan hann vann í því — veggirnir hans „eyddust bara". Þess vegna:
 *
 *   const { vernda } = require("./turbopaint-vordur.cjs");
 *   const gripid = await vernda(ctx);   // STRAX eftir newContext, á undan öðrum route-um
 *
 * Öll skrif (allt nema GET/HEAD/OPTIONS) í Supabase REST og geymslu eru gripin og svarað 200 — ekkert fer út. Lestur fer
 * í gegn. Route sem prófið skráir SÍÐAR (t.d. teikning_bord til að skoða sendinguna) gengur fyrir (Playwright keyrir
 * route í öfugri skráningarröð). `gripid` = listi yfir gripin skrif ({ method, url }). */

const LESTUR = new Set(["GET", "HEAD", "OPTIONS"]);

async function vernda(ctx) {
  const gripid = [];
  const svara = (route) => {
    const req = route.request();
    if (LESTUR.has(req.method())) return route.fallback();
    gripid.push({ method: req.method(), url: req.url().replace(/\?.*$/, "") });
    const geymsla = /\/storage\/v1\//.test(req.url());
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: geymsla ? JSON.stringify({ Key: "turbopaint/profun", Id: "profun" }) : "[]",
    });
  };
  await ctx.route(/\/rest\/v1\//, svara);
  await ctx.route(/\/storage\/v1\//, svara);
  return gripid;
}

module.exports = { vernda };
