/* MÆLING VEGGJAGREININGAR á raunteikningum (Powerplan lota 5, 17.11.2026).
 *
 * Keyrir sömu skref og sjálfvirka verkferlið (lib/board/sjalfvirkt.ts) gerir á SKÖNNUN — án vafra — og ber saman við
 * sannleikann í lib/board/fixtures/veggjamaeling/<id>.json (leiðréttir veggir Agnars, yfirfarnir; dílar frummyndar):
 *
 *   vafri      greinaVeggiSkonnunar (skonnunarVeggir) + þunnir veggir (finnaThunnaVeggi)        — „myndgreining í vafranum"
 *   vel        geymt úttak Veggjavélarinnar (skrifstofutölvan, U-Net) + þunnir veggir             — aðalleið skannana
 *   …+h        sama og svo hreinsun (hreinsaVeggi) + hurðir (finnaHurdir, án myndprófa) + „utan húss"
 *
 *   ../../node_modules/.bin/tsx tools/veggja-maeling.ts --saekja                  (myndir + Veggjavél-úttak í skyndiminni)
 *   ../../node_modules/.bin/tsx tools/veggja-maeling.ts [--leid vafri+h,vel+h] [--id R1,R2] [--yfirlag <mappa>] [--json <skrá>]
 *
 * Skyndiminni: VEGGJAMAELING_CACHE (sjálfgefið <tmp>/veggjamaeling) — myndirnar fara ALDREI í repóið (höfundaréttur
 * arkitekta; repóið er opið). Sóttar með opinbera lyklinum (NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY),
 * aðeins lestur. Myndvinnsla: sharp (VEGGJAMAELING_SHARP = slóð á sharp ef það er ekki í node_modules appsins).
 * Hurðaprófin sem þurfa myndina (bogi / lína í bili) eru EKKI með — hurðirnar hér eru því aðeins úr bilum. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { klemmaGreindaThykkt } from "../app/kjarni/turbopaint/lib/board/pdf-veggjaflokkar";
import { graTonar, greiningarkvardi, langirVeggir, skonnunarVeggir, teygjaFolva } from "../app/kjarni/turbopaint/lib/board/skonnun-veggir";
import { finnaHarlinuPor, finnaThunnaVeggi, type HarlinuStillingar } from "../app/kjarni/turbopaint/lib/board/thunnir-veggir";
import { f1, hreinsunSkonnunar, maelaVeggi, type MaelLinaInn } from "../app/kjarni/turbopaint/lib/board/veggja-maeling";
import { lesaVikmork, type HLina } from "../app/kjarni/turbopaint/lib/board/veggja-hreinsun";
import { malsetningaLinur, rettaHalla, textaLinur, veggKjarni, type Pt } from "../app/kjarni/turbopaint/lib/board/veggja-linur";

type Svaedi = { x: number; y: number; w: number; h: number };
type Fixture = { id: string; gerd: string; haed: string; cid: number; frum: { b: number; h: number }; svaedi: Svaedi; dpm: number; linur: MaelLinaInn[]; velVorpun?: { s: number; dx: number; dy: number } };

const arg = (n: string, d = "") => {
  const i = process.argv.indexOf("--" + n);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d;
};
const flagg = (n: string) => process.argv.includes("--" + n);
const FIX = path.join(__dirname, "../app/kjarni/turbopaint/lib/board/fixtures/veggjamaeling");
const CACHE = process.env.VEGGJAMAELING_CACHE || path.join(os.tmpdir(), "veggjamaeling");
fs.mkdirSync(CACHE, { recursive: true });

// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp = (() => {
  for (const s of [process.env.VEGGJAMAELING_SHARP, "sharp"].filter(Boolean) as string[]) {
    try {
      return require(s);
    } catch {
      /* næsta */
    }
  }
  return null;
})();

const lesaFix = (): Fixture[] =>
  fs
    .readdirSync(FIX)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(FIX, f), "utf8")) as Fixture)
    .filter((f) => !arg("id") || arg("id").split(",").includes(f.id));

async function saekja(fx: Fixture[]) {
  const U = process.env.NEXT_PUBLIC_SUPABASE_URL, K = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!U || !K) throw new Error("NEXT_PUBLIC_SUPABASE_URL og NEXT_PUBLIC_SUPABASE_ANON_KEY vantar (opinberi lykillinn, aðeins lestur)");
  const H = { apikey: K, Authorization: "Bearer " + K };
  for (const f of fx) {
    const r = await fetch(`${U}/rest/v1/teikning_bord?company_id=eq.${f.cid}&select=haedir`, { headers: H });
    const h = ((await r.json()) as { haedir: { id: string; image_url: string }[] }[])[0]?.haedir.find((x) => x.id === f.haed);
    if (!h) throw new Error(`${f.id}: hæðin fannst ekki`);
    const slod = h.image_url.startsWith("/") ? "https://slokkvitaeki.netlify.app" + h.image_url : h.image_url;
    const m = await fetch(slod);
    fs.writeFileSync(path.join(CACHE, f.id + ".mynd"), Buffer.from(await m.arrayBuffer()));
    const t = await fetch(`${U}/rest/v1/automation_triggers?workflow=eq.veggjavel&status=eq.done&select=result,gogn`, { headers: H });
    const rodir = ((await t.json()) as { result: unknown; gogn: { haed_id?: string; frum?: { b: number; h: number } } }[]).filter((x) => x.gogn?.haed_id === f.haed);
    const sidast = rodir[rodir.length - 1];
    if (sidast) {
      const res = (typeof sidast.result === "string" ? JSON.parse(sidast.result) : sidast.result) as { slod: string };
      const j = (await (await fetch(res.slod)).json()) as { linur?: unknown[] } | unknown[];
      fs.writeFileSync(path.join(CACHE, f.id + ".vel.json"), JSON.stringify({ frum: sidast.gogn.frum, linur: Array.isArray(j) ? j : j.linur }));
    }
    console.log(f.id, "sótt", m.status, sidast ? "+ Veggjavél" : "(engin Veggjavél)");
  }
}

/** Grátónamynd svæðisins í vinnukvarða (eins og vinnumynd í skonnun-veggir-mynd.ts: hvítur grunnur, mjúk smækkun). */
async function graSvaedis(id: string, frum: { b: number; h: number }, sk: Svaedi, W: number, H: number): Promise<Uint8Array> {
  const mynd = path.join(CACHE, id + ".mynd");
  const meta = await sharp(mynd).metadata();
  const fx = meta.width / frum.b, fy = meta.height / frum.h;
  const left = Math.max(0, Math.round(sk.x * fx)), top = Math.max(0, Math.round(sk.y * fy));
  const width = Math.min(meta.width - left, Math.round(sk.w * fx)), height = Math.min(meta.height - top, Math.round(sk.h * fy));
  const raw: Buffer = await sharp(mynd).flatten({ background: "#ffffff" }).extract({ left, top, width, height }).resize(W, H, { kernel: "cubic" }).ensureAlpha().raw().toBuffer();
  return graTonar(new Uint8Array(raw.buffer, raw.byteOffset, raw.length), W, H);
}

const VEGG = new Set(["veggur", "ei60", "ei30"]);

async function vafri(f: Fixture): Promise<HLina[]> {
  const k = greiningarkvardi(f.frum.b, f.frum.h);
  const sk = f.svaedi, W = Math.max(1, Math.round(sk.w * k)), H = Math.max(1, Math.round(sk.h * k));
  const gra0 = await graSvaedis(f.id, f.frum, sk, W, H);
  const til = (v: number[], tegund?: "gler"): HLina => ({ p: [v[0] + sk.x, v[1] + sk.y, v[2] + sk.x, v[3] + sk.y], t: Math.max(1, v[4] || 0), ...(tegund ? { tegund } : {}) });
  const r = skonnunarVeggir(gra0, W, H, k, f.frum.b, f.frum.h, { dilarAMetra: f.dpm });
  const linur = [...r.veggir.map((v) => til(v)), ...r.gler.map((v) => til(v, "gler"))];
  // Föl skönnun → teygð mynd greind líka og AÐEINS langir veggir þaðan bætast við (eins og greinaVeggiSkonnunar)
  const gra = process.env.VEGGJAMAELING_TEYGJA === "0" ? gra0 : teygjaFolva(gra0, process.env.VEGGJAMAELING_SVART ? { svart: Number(process.env.VEGGJAMAELING_SVART) } : {});
  if (process.env.VEGGJAMAELING_TALNING) console.log("  teygt:", gra !== gra0);
  if (gra !== gra0) {
    const t = skonnunarVeggir(gra, W, H, k, f.frum.b, f.frum.h, { dilarAMetra: f.dpm });
    linur.push(...langirVeggir(t.veggir, f.frum.b, f.frum.h, f.dpm, Number(process.env.VEGGJAMAELING_LANGIR ?? 6)).map((v) => til(v)));
  }
  return klemmaGreindaThykkt(linur, f.dpm);
}

async function thunnir(f: Fixture): Promise<HLina[]> {
  const sk = f.svaedi;
  let k = Math.min(1, 50 / f.dpm);
  const mp = sk.w * sk.h * k * k;
  if (mp > 40e6) k *= Math.sqrt(40e6 / mp);
  const W = Math.max(1, Math.round(sk.w * k)), H = Math.max(1, Math.round(sk.h * k));
  const gra = await graSvaedis(f.id, f.frum, sk, W, H);
  const th = finnaThunnaVeggi(gra, W, H, { dpm: f.dpm * k });
  return klemmaGreindaThykkt(
    th.map((v) => ({ p: [v[0] / k + sk.x, v[1] / k + sk.y, v[2] / k + sk.x, v[3] / k + sk.y], t: Math.max(1, v[4] / k) }) as HLina),
    f.dpm
  );
}

/** Hárlínupör (finnaHarlinuPor) — fullri upplausn svæðisins upp að 40 MP. --hp '{"lagmarkM":1}' prófar stillingar. */
async function harlinuPor(f: Fixture): Promise<HLina[]> {
  const sk = f.svaedi;
  let k = 1;
  const mp = sk.w * sk.h;
  if (mp > 40e6) k = Math.sqrt(40e6 / mp);
  const W = Math.max(1, Math.round(sk.w * k)), H = Math.max(1, Math.round(sk.h * k));
  const gra = await graSvaedis(f.id, f.frum, sk, W, H);
  const st: HarlinuStillingar = { dpm: f.dpm * k, ...(arg("hp") ? JSON.parse(arg("hp")) : {}) };
  return klemmaGreindaThykkt(
    finnaHarlinuPor(gra, W, H, st).map((v) => ({ p: [v[0] / k + sk.x, v[1] / k + sk.y, v[2] / k + sk.x, v[3] / k + sk.y], t: Math.max(1, v[4] / k) }) as HLina),
    f.dpm
  );
}

/** TILRAUN 7: lína sem er „stök mjó lína" í FULLRI upplausn (málsetning, húsgagnsbrún) fellur. Aðeins veggir (ekki gler). */
async function fullSia(f: Fixture, L: HLina[]): Promise<HLina[]> {
  const sk = f.svaedi;
  let k = 1;
  if (sk.w * sk.h > 40e6) k = Math.sqrt(40e6 / (sk.w * sk.h));
  const W = Math.max(1, Math.round(sk.w * k)), H = Math.max(1, Math.round(sk.h * k));
  const gra = await graSvaedis(f.id, f.frum, sk, W, H);
  const dpm = f.dpm * k, hamark = 0.35 * dpm, lagmark = Math.max(1.5, 0.05 * dpm);
  let n = 0;
  const ut = L.filter((l) => {
    if (l.tegund && l.tegund !== "veggur") return true;
    const A0: Pt = [(l.p[0] - sk.x) * k, (l.p[1] - sk.y) * k], B0: Pt = [(l.p[2] - sk.x) * k, (l.p[3] - sk.y) * k];
    const L0 = Math.hypot(B0[0] - A0[0], B0[1] - A0[1]);
    if (L0 < 2) return true;
    const breidd = Math.max(l.t * k, hamark) / 2 + 2;
    const { snid } = rettaHalla(gra, W, H, A0, B0, breidd, Math.min(12, L0 * 0.12));
    const kj = veggKjarni(snid, { hamark, lagmark });
    const burt = !kj || kj.gerd === "stok";
    if (burt) n++;
    return !burt;
  });
  if (process.env.VEGGJAMAELING_TALNING) console.log("  fullSia felldi", n, "af", L.length);
  return ut;
}

/** Textasía (lib/board/veggja-linur.ts textaLinur) í fullri upplausn — skilar vísum línanna sem falla. --ts '{"skiptiM":4}' prófar mörk. */
async function textaVisar(f: Fixture, L: HLina[]): Promise<Set<number>> {
  const sk = f.svaedi;
  let k = 1;
  if (sk.w * sk.h > 40e6) k = Math.sqrt(40e6 / (sk.w * sk.h));
  const W = Math.max(1, Math.round(sk.w * k)), H = Math.max(1, Math.round(sk.h * k));
  const gra0 = await graSvaedis(f.id, f.frum, sk, W, H);
  const gra = process.env.VEGGJAMAELING_TEYGJA === "0" ? gra0 : teygjaFolva(gra0, process.env.VEGGJAMAELING_SVART ? { svart: Number(process.env.VEGGJAMAELING_SVART) } : {});
  const iMynd = L.map((l) => ({ ...l, p: l.p.map((n, i) => (n - (i % 2 ? sk.y : sk.x)) * k), t: l.t * k }));
  const burt = textaLinur(iMynd, gra, W, H, f.dpm * k, arg("ts") ? JSON.parse(arg("ts")) : {});
  if (process.env.VEGGJAMAELING_TALNING) console.log("  textasía felldi", burt.size, "af", L.length);
  return burt;
}
/** Málsetningasía (lib/board/veggja-linur.ts malsetningaLinur) í fullri upplausn. --ms '{"minTolur":3}' prófar mörk. */
async function malsVisar(f: Fixture, L: HLina[]): Promise<Set<number>> {
  const sk = f.svaedi;
  let k = 1;
  if (sk.w * sk.h > 40e6) k = Math.sqrt(40e6 / (sk.w * sk.h));
  const W = Math.max(1, Math.round(sk.w * k)), H = Math.max(1, Math.round(sk.h * k));
  const gra = teygjaFolva(await graSvaedis(f.id, f.frum, sk, W, H));
  const iMynd = L.map((l) => ({ ...l, p: l.p.map((n, i) => (n - (i % 2 ? sk.y : sk.x)) * k), t: l.t * k }));
  const diag = process.env.VEGGJAMAELING_MSDIAG ? (j: number, x: { metrar: number; tolur: number; strik: number; tolurRof: number }) => { if (x.tolur < 2) return; const m = maelaVeggi(f.linur, [L[j]], { dpm: f.dpm, svaedi: f.svaedi }); console.log(`  ms ${m.nakvaemni < 0.5 ? "RANGT" : "rétt "} ${x.metrar.toFixed(1)} m tölur ${x.tolur} (rof ${x.tolurRof}) strik ${x.strik} ${L[j].p.map(Math.round).join(",")}`); } : undefined;
  const burt = malsetningaLinur(iMynd, gra, W, H, f.dpm * k, { ...(arg("ms") ? JSON.parse(arg("ms")) : {}), skyrsla: diag });
  if (process.env.VEGGJAMAELING_TALNING) console.log("  málsetningasía felldi", burt.size, "af", L.length);
  return burt;
}
async function malsSia(f: Fixture, L: HLina[]): Promise<HLina[]> {
  const burt = await malsVisar(f, L);
  return L.filter((_, i) => !burt.has(i));
}
async function textaSia(f: Fixture, L: HLina[]): Promise<HLina[]> {
  const burt = await textaVisar(f, L);
  return L.filter((_, i) => !burt.has(i));
}

function vel(f: Fixture): HLina[] | null {
  const s = path.join(CACHE, f.id + ".vel.json");
  if (!fs.existsSync(s)) return null;
  const v = JSON.parse(fs.readFileSync(s, "utf8")) as { frum?: { b: number; h: number }; linur: HLina[] };
  const vv = f.velVorpun;
  const k = vv ? vv.s : v.frum ? f.frum.b / v.frum.b : 1;
  const dx = vv?.dx ?? 0, dy = vv?.dy ?? 0;
  const sk = f.svaedi;
  const innan = (l: HLina) => {
    const mx = (l.p[0] + l.p[l.p.length - 2]) / 2, my = (l.p[1] + l.p[l.p.length - 1]) / 2;
    return mx >= sk.x && my >= sk.y && mx <= sk.x + sk.w && my <= sk.y + sk.h;
  };
  return klemmaGreindaThykkt(
    v.linur.map((l) => ({ p: l.p.map((n, i) => n * k + (i % 2 ? dy : dx)), t: l.t * k, ...(l.tegund && l.tegund !== "veggur" ? { tegund: l.tegund } : {}) })).filter(innan),
    f.dpm
  );
}

/** d) hreinsun + e) hurðir (úr bilum) + utan húss — hreinsunSkonnunar (sama og sjalfvirkt.ts gerir fyrir skönnun).
 *  --vik '{"hillurM":8}' prófar önnur vikmörk (sama snið og VIKMORK_LYKILL í localStorage).
 *  VEGGJAMAELING_FJARLAEGT=1 sýnir hvað hreinsunin tók og hve mikið af því var veggur í sannleikanum. */
function hreinsa(hrar: HLina[], dpm: number, anUtan = false, f?: Fixture): HLina[] {
  const h = hreinsunSkonnunar(hrar, dpm, lesaVikmork(arg("vik") || null), { anUtan });
  if (f && process.env.VEGGJAMAELING_FJARLAEGT) {
    const t: Record<string, { n: number; m: number; rett: number }> = {};
    for (const x of h.fjarlaegdar) {
      const m = maelaVeggi(f.linur, [{ p: x.p, t: 4 }], { dpm, svaedi: f.svaedi });
      const a = (t[x.astaeda] ??= { n: 0, m: 0, rett: 0 });
      a.n++;
      a.m += m.greintM;
      a.rett += m.nakvaemni * m.greintM;
    }
    console.log("  fjarlægt", Object.entries(t).map(([k, a]) => `${k}: ${a.n} línur ${a.m.toFixed(0)} m, þar af á vegg ${a.rett.toFixed(0)} m`).join(" · "));
  }
  return h.linur;
}

async function yfirlag(f: Fixture, greint: HLina[], m: ReturnType<typeof maelaVeggi>, ut: string) {
  const sk = f.svaedi, B = 2000, k = B / sk.w, Hh = Math.round(sk.h * k);
  const tynd = new Set(m.tyndir.map((t) => t.i)), rong = new Set(m.rangar.map((t) => t.i));
  const pl = (l: MaelLinaInn, lit: string, b: number, op = 0.8) =>
    `<polyline points="${l.p.map((v, i) => (i % 2 === 0 ? (v - sk.x) * k : (v - sk.y) * k).toFixed(1)).join(" ")}" fill="none" stroke="${lit}" stroke-opacity="${op}" stroke-width="${b}" stroke-linecap="round"/>`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${B}" height="${Hh}">` +
    f.linur.map((l, i) => (VEGG.has(l.tegund ?? "veggur") ? pl(l, tynd.has(i) ? "#ff0000" : "#ffb000", tynd.has(i) ? 6 : 3, tynd.has(i) ? 0.85 : 0.35) : "")).join("") +
    greint.map((l, i) => pl(l, rong.has(i) ? "#d000d0" : "#00a040", 2, 0.9)).join("") +
    `</svg>`;
  const mynd = path.join(CACHE, f.id + ".mynd");
  const meta = await sharp(mynd).metadata();
  const fx = meta.width / f.frum.b, fy = meta.height / f.frum.h;
  const base = await sharp(mynd)
    .extract({ left: Math.round(sk.x * fx), top: Math.round(sk.y * fy), width: Math.min(meta.width - Math.round(sk.x * fx), Math.round(sk.w * fx)), height: Math.min(meta.height - Math.round(sk.y * fy), Math.round(sk.h * fy)) })
    .resize(B, Hh)
    .modulate({ brightness: 1.05 })
    .png()
    .toBuffer();
  await sharp(base).composite([{ input: Buffer.from(svg) }]).png().toFile(ut);
}

async function main() {
  const fx = lesaFix();
  if (flagg("saekja")) return saekja(fx);
  if (!sharp) throw new Error("sharp fannst ekki — settu VEGGJAMAELING_SHARP=<slóð á sharp>");
  const leidir = arg("leid", "vafri,vafri+h,vel,vel+h").split(",");
  const yf = arg("yfirlag");
  if (yf) fs.mkdirSync(yf, { recursive: true });
  const nidurstodur: Record<string, unknown>[] = [];
  const samtals: Record<string, { hulidR: number; R: number; rett: number; G: number }> = {};
  for (const f of fx) {
    // --geymd: hráar línur myndgreiningarinnar lesnar úr skyndiminni (hraðar tilraunir á hreinsuninni einni)
    const geymd = async (nafn: string, fall: () => Promise<HLina[]>): Promise<HLina[]> => {
      const s = path.join(CACHE, `${f.id}.${nafn}.hrar.json`);
      if (flagg("geymd") && fs.existsSync(s)) return JSON.parse(fs.readFileSync(s, "utf8"));
      const l = await fall();
      fs.writeFileSync(s, JSON.stringify(l));
      return l;
    };
    const th = await geymd("thunnir", () => thunnir(f));
    // hárlínupör: ALDREI úr skyndiminni þegar --hp er gefið (stillingatilraun)
    const hpL = leidir.some((l) => l.includes("+hp")) ? (arg("hp") ? await harlinuPor(f) : await geymd("harlinur", () => harlinuPor(f))) : [];
    const vafriL = leidir.some((l) => l.startsWith("vafri")) ? await geymd("vafri", () => vafri(f)) : [];
    const velL = vel(f);
    if (flagg("vista-hrar")) {
      // Hráar línur greiningarinnar (aðeins rúmfræði, dílar frummyndar) → prufugögn veggja-maeling.test.ts, svo
      // hreinsunin sé prófuð á raungögnum án mynda og nets.
      const r = (L: HLina[]) => L.map((l) => ({ p: l.p.map((n) => Math.round(n * 10) / 10), t: Math.round(l.t * 10) / 10, ...(l.tegund ? { tegund: l.tegund } : {}) }));
      fs.mkdirSync(path.join(FIX, "hrar"), { recursive: true });
      // vafriMals / harlinurMals (umferð 3): vísar málsetningasíunnar — á myndgreininguna EFTIR textasíu (vísar í vafri) og á hárlínupörin
      const texti = await textaVisar(f, vafriL), eftirTexta = vafriL.map((_, i) => i).filter((i) => !texti.has(i));
      const mV = await malsVisar(f, eftirTexta.map((i) => vafriL[i]));
      const vafriMals = [...mV].map((k) => eftirTexta[k]).sort((a, b) => a - b), harlinurMals = [...(await malsVisar(f, hpL))].sort((a, b) => a - b);
      fs.writeFileSync(path.join(FIX, "hrar", f.id + ".json"), JSON.stringify({ vafri: r(vafriL), vafriTexti: [...texti], vafriMals, thunnir: r(th), harlinur: r(hpL), harlinurMals, vel: velL ? r(velL) : null }));
    }
    for (const leid of leidir) {
      // leiðir: vafri | vel | th (þunnir einir); viðskeyti -th = án þunnra veggja, +h = hreinsun, +hn = hreinsun án „utan húss"
      const grunnur0 = leid.startsWith("vel") ? velL : leid.startsWith("th") ? [] : vafriL;
      const grunnur1 = grunnur0 && leid.includes("+fs") ? await fullSia(f, grunnur0) : grunnur0;
      const grunnur = grunnur1 && (leid.includes("+ts+") || leid.endsWith("+ts")) ? await textaSia(f, grunnur1) : grunnur1;
      if (!grunnur) continue;
      // +ms: málsetningasía á myndgreininguna og hárlínupörin (eins og sjalfvirkt.ts gerir síðan umferð 3)
      const ms = leid.includes("+ms");
      const hrar0 = [...(ms ? await malsSia(f, grunnur) : grunnur), ...(leid.includes("-th") ? [] : th), ...(leid.includes("+hp") ? (ms ? await malsSia(f, hpL) : hpL) : [])];
      const hrar = leid.includes("+tsa") ? await textaSia(f, hrar0) : hrar0;
      const greint = leid.endsWith("+hn") ? hreinsa(hrar, f.dpm, true, f) : leid.endsWith("+h") ? hreinsa(hrar, f.dpm, false, f) : hrar;
      const m = maelaVeggi(f.linur, greint, { dpm: f.dpm, svaedi: f.svaedi });
      const s = (samtals[leid] ??= { hulidR: 0, R: 0, rett: 0, G: 0 });
      s.hulidR += m.hittni * m.raunM;
      s.R += m.raunM;
      s.rett += m.nakvaemni * m.greintM;
      s.G += m.greintM;
      nidurstodur.push({ id: f.id, leid, hittni: +m.hittni.toFixed(3), nakvaemni: +m.nakvaemni.toFixed(3), f1: +f1(m).toFixed(3), veggir: `${m.veggirFundnir}/${m.veggirAllir}`, raunM: m.raunM, greintM: m.greintM, linur: greint.length });
      console.log(`${f.id} ${leid.padEnd(8)} hittni ${(m.hittni * 100).toFixed(1).padStart(5)} %  nákvæmni ${(m.nakvaemni * 100).toFixed(1).padStart(5)} %  veggir ${m.veggirFundnir}/${m.veggirAllir}  (${m.raunM} m raun, ${m.greintM} m greint, ${greint.length} línur)`);
      if (yf) await yfirlag(f, greint, m, path.join(yf, `${f.id}-${leid.replace("+", "_")}.png`));
    }
  }
  for (const [leid, s] of Object.entries(samtals)) {
    const h = s.hulidR / s.R, n = s.rett / s.G;
    console.log(`ALLT ${leid.padEnd(8)} hittni ${(h * 100).toFixed(1)} %  nákvæmni ${(n * 100).toFixed(1)} %  F1 ${((2 * h * n) / (h + n)).toFixed(3)}`);
    nidurstodur.push({ id: "ALLT", leid, hittni: +h.toFixed(3), nakvaemni: +n.toFixed(3) });
  }
  if (arg("json")) fs.writeFileSync(arg("json"), JSON.stringify(nidurstodur, null, 1));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
