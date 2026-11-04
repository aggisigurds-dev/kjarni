// ÞUNNIR VEGGIR Á SKÖNNUÐUM TEIKNINGUM (Agnar 04.11.2026, Nesdekk Breiðhöfða 13 1. hæð: „það eru reyndar fáranlega mjóir
// veggir á teikningunum hérna"). Lagerinn á 2018-skönnuninni er teiknaður með tvöfaldri hárfínni línu (bil ~7 cm) — hún
// rennur saman í ~9 díla breiða dökka rák á skönnuninni, og veggjavélin (U-Net) sér hana alls ekki eða aðeins í brotum.
// Málsetningarlínur eru líka þunnar en einfaldar (~4 dílar), og hillurekkar eru ferhyrningar með fínum brúnum.
//
// Aðferðin (hrein föll á grátónamynd, engin ósjálfstæði):
//   1. dökkir dílar  = grátónn < bakgrunnur − 16
//   2. rof           = díll lifir aðeins ef `wMin` (≈ 0,1 m) dílar í röð þvert á stefnuna eru dökkir → einföld hárlína (málsetning,
//                      rammi, texti) hverfur, tvöföld lína / breið rák stendur
//   3. langar rákir  = samfelld rák (bil ≤ ~6 cm) ≥ `lagmarkM` (6 m) langs eftir línunni, þykkt ≤ `hamarksThykktM`
//   4. samlína       = brot sömu línu (mismunandi þykkt, bil < 0,3 m) renna saman
//
// Þetta finnur LÍNUR — ekki hvort þær séu veggir. Málsetningarlínur með þykkara striki og rekkabrúnir fylgja með;
// sjálfvirka hreinsunin (veggja-hreinsun.ts) fellir þær sem tengjast engu (hillur ≥ 6 m, stakir bútar) og „utan húss" fellir
// afganginn utan útlínunnar.

export type ThunnVeggur = [number, number, number, number, number];

export interface ThunnirStillingar {
  /** Díla á metra í myndinni sem er greind. */
  dpm: number;
  /** Stysta rák (m). Sjálfgefið 6. */
  lagmarkM?: number;
  /** Mjóasta rák sem telst veggur (m) — mjórri línur (málsetning) hverfa. Sjálfgefið 0,1. */
  breiddM?: number;
  /** Þykkari rákir en þetta (m) eru ekki þunnir veggir (svört fylling, tákn). Sjálfgefið 0,45. */
  hamarksThykktM?: number;
  /** Lágmarksmunur á bakgrunni og línu (grátónar). Sjálfgefið 16. */
  munur?: number;
}

/** Bakgrunnsgrátónn: miðgildi sýnis (blaðið er að mestu autt). */
export function bakgrunnsTonn(gra: Uint8Array): number {
  const n = gra.length;
  const skref = Math.max(1, Math.floor(n / 60000));
  const h = new Uint32Array(256);
  let t = 0;
  for (let i = 0; i < n; i += skref) {
    h[gra[i]]++;
    t++;
  }
  let s = 0;
  for (let v = 0; v < 256; v++) {
    s += h[v];
    if (s >= t / 2) return v;
  }
  return 255;
}

interface Rak {
  a: number;
  b: number;
  c: number;
  th: number;
}

/** Raðir stefnunnar: `m` er dökk-gríman með röð = lengd W í stefnu rákarinnar og H raðir þvert á. */
function leitaRaka(m: Uint8Array, W: number, H: number, wMin: number, lagmark: number, gat: number, hamarkThykkt: number): Rak[] {
  // rof þvert á stefnuna: e[y] = 1 ef m[y..y+wMin-1] allar 1
  const e = new Uint8Array(W * H);
  const tel = new Uint16Array(W);
  for (let y = 0; y < H; y++) {
    const o = y * W;
    for (let x = 0; x < W; x++) tel[x] = m[o + x] ? tel[x] + 1 : 0;
    const yy = y - (wMin - 1);
    if (yy >= 0) {
      const o2 = yy * W;
      for (let x = 0; x < W; x++) if (tel[x] >= wMin) e[o2 + x] = 1;
    }
  }
  // runur í hverri röð (gat ≤ gat dílar brúað), síðan samfelldar raðir með skarandi runur saman í rák
  type Rn = { y0: number; y1: number; a: number; b: number };
  const rakir: Rn[] = [];
  let opnar: Rn[] = [];
  for (let y = 0; y < H; y++) {
    const o = y * W;
    const runur: [number, number][] = [];
    let x = 0;
    while (x < W) {
      while (x < W && !e[o + x]) x++;
      if (x >= W) break;
      const a = x;
      let b = x;
      while (x < W) {
        if (e[o + x]) {
          b = x + 1;
          x++;
        } else {
          let g = 0;
          while (x + g < W && !e[o + x + g] && g <= gat) g++;
          if (g > gat || x + g >= W) break;
          x += g;
        }
      }
      if (b - a >= lagmark) runur.push([a, b]);
    }
    const naest: Rn[] = [];
    for (const [a, b] of runur) {
      const f = opnar.find((r) => r.y1 === y - 1 && Math.min(b, r.b) - Math.max(a, r.a) > 0.7 * Math.min(b - a, r.b - r.a));
      if (f) {
        f.y1 = y;
        f.a = Math.min(f.a, a);
        f.b = Math.max(f.b, b);
        naest.push(f);
      } else {
        const n: Rn = { y0: y, y1: y, a, b };
        rakir.push(n);
        naest.push(n);
      }
    }
    opnar = naest;
  }
  const ut: Rak[] = [];
  for (const r of rakir) {
    const th = r.y1 - r.y0 + 1 + (wMin - 1);
    if (th > hamarkThykkt) continue;
    ut.push({ a: r.a, b: r.b, c: (r.y0 + r.y1) / 2 + (wMin - 1) / 2 + 0.5, th });
  }
  return ut;
}

/** Brot sömu línu (c innan `thvert`, bil eða skörun í stefnunni ≤ `bil`) renna saman. */
function sameinaRaka(rs: Rak[], thvert: number, bil: number): Rak[] {
  const r = [...rs].sort((x, y) => x.c - y.c || x.a - y.a);
  const ut: Rak[] = [];
  for (const k of r) {
    const f = ut.find((u) => Math.abs(u.c - k.c) <= thvert && k.a <= u.b + bil && k.b >= u.a - bil);
    if (f) {
      const lu = f.b - f.a, lk = k.b - k.a;
      f.c = (f.c * lu + k.c * lk) / (lu + lk);
      f.th = Math.max(f.th, k.th);
      f.a = Math.min(f.a, k.a);
      f.b = Math.max(f.b, k.b);
    } else ut.push({ ...k });
  }
  return ut;
}

/** Þunnir, langir, láréttir og lóðréttir veggir á grátónamynd `gra` (W × H). Skilar [ax, ay, bx, by, þykkt] í dílum myndarinnar. */
export function finnaThunnaVeggi(gra: Uint8Array, W: number, H: number, o: ThunnirStillingar): ThunnVeggur[] {
  const dpm = o.dpm;
  if (!(dpm > 0) || W < 8 || H < 8) return [];
  const wMin = Math.max(3, Math.round((o.breiddM ?? 0.1) * dpm));
  const lagmark = Math.max(20, Math.round((o.lagmarkM ?? 6) * dpm));
  const gat = Math.max(2, Math.round(0.06 * dpm));
  const hamarkThykkt = Math.max(wMin + 2, Math.round((o.hamarksThykktM ?? 0.45) * dpm));
  const thr = bakgrunnsTonn(gra) - (o.munur ?? 16);
  const m = new Uint8Array(W * H);
  for (let i = 0; i < m.length; i++) m[i] = gra[i] < thr ? 1 : 0;
  const ut: ThunnVeggur[] = [];
  // láréttir: raðir eru y
  const h = sameinaRaka(leitaRaka(m, W, H, wMin, lagmark, gat, hamarkThykkt), Math.round(0.12 * dpm), Math.round(0.3 * dpm));
  for (const r of h) ut.push([r.a, r.c, r.b, r.c, r.th]);
  // lóðréttir: umsnúið (raðir eru x)
  const mt = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) mt[x * H + y] = m[y * W + x];
  const v = sameinaRaka(leitaRaka(mt, H, W, wMin, lagmark, gat, hamarkThykkt), Math.round(0.12 * dpm), Math.round(0.3 * dpm));
  for (const r of v) ut.push([r.c, r.a, r.c, r.b, r.th]);
  return ut;
}
