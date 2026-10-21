"use client";

// „Greina veggi" (Agnar 06.10.2026). Áður henti „Veggir" innfluttu veggjunum (62 á Fiskislóð 41, með gleri og
// leiðréttingum) og setti 98 hráa PDF-búta í staðinn (ekkert gler, 18 m styttri). Nú:
//   • vigur-PDF: notandinn velur LÍNUFLOKKA (þykkt í pt, einn eða fleiri) og sér á borðinu hvaða línur verða veggir
//     (appelsínugular) og veggina sem verða til (grænir, gler blátt) — sama heildarferli og innflutningur hæðar;
//   • mynd (skönnun/TIF — og SKÖNNUÐ PDF, sem er ein mynd án vigurstrika): sama greining og Teikning-glugginn (383,
//     skonnun-veggir.ts) — Agnar 07.10.2026: „kerfið fann enga veggi á efri hæð" (Álfaborg 2. hæð, FotoWeb-PDF: PDF-ið
//     var lesið, enginn línuflokkur fannst og útkoman var 0 veggir). Eldri myndgreiningin er varaleið;
//   • séu veggir fyrir er spurt: Bæta við (sjálfgefið — tvítekningar felldar, leiðréttingar haldast) / Skipta út / Hætta við.
//   • „Veggjavél (skrifstofutölvan)" (Agnar 07.10.2026): eigið veggjalíkan Slökkvitækis keyrir á skrifstofutölvunni um
//     luna-bridge (lib/board/veggjavel.ts) — beiðni í automation_triggers, framvinda á skjánum, niðurstaðan fer í SAMA
//     flæði (Bæta við / Skipta út, ⌘Z, „Eyða síðustu greiningu"); gler verður gler. Síðasta niðurstaða hæðarinnar opnast
//     strax (samanburður við greininguna í vafranum); „Greina aftur" sendir nýja beiðni.

import { Cpu, ScanSearch, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  flokkaYfirlit,
  GREINDUR_VEGGUR_HAMARK_CM,
  greiningKrefstStadfestingar,
  klemmaGreindaThykkt,
  pdfErSkonnun,
  ptIBord,
  skurdurIPt,
  strikValinna,
  veggirUrStrikumPt,
  type PdfFlokkur,
} from "../../lib/board/pdf-veggjaflokkar";
import { lesaOgFestaEi } from "../../lib/board/ei-lestur";
import { greinaVeggiTeikningar, lesaPdfSidu, type PdfSida } from "../../lib/board/strip";
import { greinaVeggiSkonnunar } from "../../lib/board/skonnun-veggir-mynd";
import { newId, useBoardStore } from "../../lib/board/store";
import type { BoardObject, ImageObject, LineObject } from "../../lib/board/types";
import { erVeggur } from "../../lib/board/veggja-leidretting";
import { nyGreiningarLota, nyrVeggur, sameinaVidVeggi, semButur, talningTexti, veggjaTalning, type Butur } from "../../lib/board/veggja-ritill";
import { ritillDilarAMetra, skiptaUt } from "../../lib/board/veggja-ritill-adgerdir";
import { useUttektGogn } from "../../lib/board/uttekt-gogn";
import { forskodunLykill, useVeggjaRitill } from "../../lib/board/veggja-ritill-stada";
import { neikvaedarVisar, saekjaNeikvaett, skraNeikvaett, type NLina } from "../../lib/board/veggja-neikvaett";
import { kvardiTeikningar, vinnaLinur, virkVikmork } from "../../lib/board/sjalfvirkt";
import { maelaThekju } from "../../lib/board/veggja-thekja";
import { bladMyndar } from "../../lib/board/margar-haedir";
import { useErSimi } from "../../lib/board/simi";
import { getSupabase, supabaseUrl } from "../../lib/board/supabase";
import {
  beidniGogn,
  dagsTexti,
  lesaNidurstodu,
  lesaVeggjavelJson,
  leyfdSlod,
  metaStodu,
  VEGGJAVEL_HAMARK_MS,
  VEGGJAVEL_SVARAR_EKKI_MS,
  VEGGJAVEL_WORKFLOW,
  velLinurIBord,
  velMinni,
  velMinniLykill,
  type VelMinni,
} from "../../lib/board/veggjavel";

/** Þúsundapunktar: 23.363 */
const fjoldi = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

type Nidurstada = { veggir: Butur[]; linur: number; thekja: number | null; aths?: string };

/** Staða „Veggjavél (skrifstofutölvan)" á skjánum. */
type VelUI =
  | { s: "sendi" }
  | { s: "bida"; upptekin: string | null; hafnad: boolean }
  | { s: "vinnur"; texti: string; pros: number | null }
  | { s: "saekir" }
  | { s: "lokid"; kl: number; veggir: number; gler: number; sek: number | null; fyrri: boolean }
  | { s: "villa"; texti: string };

const VEL_BIL_MS = 3000;
const klukka = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Veggir borðsins sem tilheyra teikningunni: festir við hana, eða lausir með miðju á henni. */
function veggirTeikningar(objects: BoardObject[], plan: ImageObject): LineObject[] {
  return objects.filter((o): o is LineObject => {
    if (!erVeggur(o) || o.hidden) return false;
    if (o.parentId) return o.parentId === plan.id;
    const n = o.points.length;
    const cx = o.x + (o.points[0] + o.points[n - 2]) / 2, cy = o.y + (o.points[1] + o.points[n - 1]) / 2;
    return cx >= plan.x && cy >= plan.y && cx <= plan.x + plan.width && cy <= plan.y + plan.height;
  });
}

export function VeggjaGreining({ planId, tillogur = false }: { planId: string; tillogur?: boolean }) {
  const objects = useBoardStore((s) => s.objects);
  const pixelsPerMeter = useBoardStore((s) => s.pixelsPerMeter);
  const plan = objects.find((o): o is ImageObject => o.id === planId && o.type === "image") ?? null;
  const [hamur, setHamur] = useState<"les" | "pdf" | "mynd" | "villa" | "vel">("les");
  const [villa, setVilla] = useState("");
  const [sida, setSida] = useState<PdfSida | null>(null);
  const [flokkar, setFlokkar] = useState<PdfFlokkur[]>([]);
  const [valdir, setValdir] = useState<string[]>([]);
  const [innanHuss, setInnanHuss] = useState(true);
  const [gler, setGler] = useState(true);
  const [stakar, setStakar] = useState(true);
  const [fleiri, setFleiri] = useState(false);
  // „Combo" (Agnar 21.10.2026: lesa EI-60/30 + hurðarop og tengja): vigur-PDF-línurnar fá sömu hreinsun og hurðaleit og skönnun/Veggjavél áður en
  // þær eru settar inn, og EI-merkin eru lesin og fest á veggina eftir innsetningu (vegghjálp úr Búnaðargreiningu eða OCR) — eins og „Sjálfvirkt".
  const [vinnaPdf, setVinnaPdf] = useState(true);
  const [lesaEi, setLesaEi] = useState(true);
  const [nid, setNid] = useState<Nidurstada | null>(null);
  const [reiknar, setReiknar] = useState(false);
  // Staðfesting áður en mjög mörgum veggjum er beitt (Agnar 07.10.2026: 599 svartar klessur af 0,24 + 0,48 pt).
  const [stadfesta, setStadfesta] = useState<{ ham: "baeta" | "skipta"; n: number } | null>(null);
  // Veggjavél (skrifstofutölvan): staðan, hvaðan var komið (til að fara til baka) og greining vafrans til samanburðar.
  const [vel, setVel] = useState<VelUI | null>(null);
  const [adurHamur, setAdurHamur] = useState<"pdf" | "mynd" | "villa" | null>(null);
  const [nidVafri, setNidVafri] = useState<Nidurstada | null>(null);
  const [nu, setNu] = useState(() => Date.now());
  const beidni = useRef<{ id: number; byrjad: number; hafnadFra: number | null; lykill: string } | null>(null);
  const velTimi = useRef<number | null>(null);
  const loka = () => {
    skraTekidUt();
    useVeggjaRitill.getState().lokaGreiningu();
  };
  // ÞJÁLFUNARMINNI (Agnar 11.10.2026: „þegar kerfið merkir eitthvað skrítið sem vegg og ég ýti fjarlægja, að kerfið muni að
  // gera það ekki aftur á svona akkúrat stað"): línur sem áður voru teknar út á þessari hæð eru faldar úr nýrri greiningu,
  // og það sem tekið er út núna skráist (veggja-neikvaett.ts) þegar glugganum er lokað eða veggirnir settir inn.
  const [neikv, setNeikv] = useState<NLina[] | null>(null);
  const [autoVel, setAutoVel] = useState(false);
  const [munad, setMunad] = useState(0);
  const munadRef = useRef<Set<string>>(new Set());
  const skradRef = useRef<Set<string>>(new Set());
  const nidRef = useRef<Nidurstada | null>(null);
  /** Sama vinnuaðferð og sjálfvirka ferlið á niðurstöðuna (Agnar 11.10.2026: „hurðirnar þurfa kannski bara að vera með
   * inni í veggjaleitarvélinni" · „hurðamerkingar hafi forgangsrétt"): hreinsun (stakir bútar, smella, rétta), hurðir úr
   * hurðabogum sem skera vegginn undir sér, gluggar → gler, og nýtt utan útlínu hússins fer. Bregðist það: óbreytt. */
  async function vinnuadferd(p: ImageObject, veggir: Butur[], vigur = false): Promise<Butur[]> {
    if (!veggir.length) return veggir;
    try {
      const st = useBoardStore.getState();
      const m = await kvardiTeikningar(p, useUttektGogn.getState().gogn?.haedir ?? []);
      const fastar = veggirTeikningar(st.objects, p).map(semButur);
      const mynd = () => useBoardStore.getState().objects.find((o): o is ImageObject => o.id === p.id && o.type === "image") ?? null;
      st.setImportProgress({ fileName: p.name, percent: 92, message: "Hreinsa og finn hurðir (sama og Sjálfvirkt)…" });
      const v = await vinnaLinur(mynd, veggir, fastar, m, vigur, virkVikmork(), {});
      return v.lokaNy;
    } catch (err) {
      console.warn("[veggir] vinnuaðferð sjálfvirka ferlisins brást — óunnin niðurstaða", err);
      return veggir;
    } finally {
      useBoardStore.getState().setImportProgress(null);
    }
  }
  function skraTekidUt() {
    const n = nidRef.current;
    const p = useBoardStore.getState().objects.find((o): o is ImageObject => o.id === planId && o.type === "image");
    if (!n || !p) return;
    const b = new Set(useVeggjaRitill.getState().forskodunBurt.flat());
    const nyjar = n.veggir.filter((v) => {
      const k = forskodunLykill(v);
      return b.has(k) && !munadRef.current.has(k) && !skradRef.current.has(k);
    });
    if (!nyjar.length) return;
    nyjar.forEach((v) => skradRef.current.add(forskodunLykill(v)));
    void skraNeikvaett(p, nyjar.map((v) => ({ p: v.p, t: v.t, tegund: v.tegund })), "forskodun").then((k) => {
      if (k) toast.message(`${k} ${k === 1 ? "lína skráð" : "línur skráðar"} í þjálfunarminni — kemur ekki aftur á þessum stað`, { duration: 2500 });
    });
  }
  useEffect(() => {
    let lifir = true;
    const p = useBoardStore.getState().objects.find((o): o is ImageObject => o.id === planId && o.type === "image");
    if (!p) return;
    saekjaNeikvaett(p).then(
      (n) => lifir && setNeikv(n),
      () => lifir && setNeikv([])
    );
    return () => {
      lifir = false;
    };
  }, [planId]);
  /** Kvarði borðsins núna (dílar á metra) — fyrir þykktarþakið. */
  const kvardiNu = () => {
    const s = useBoardStore.getState();
    return ritillDilarAMetra(s.objects, s.pixelsPerMeter);
  };

  // 1) lesa: vigur-PDF ef til, annars myndgreining
  useEffect(() => {
    const p = useBoardStore.getState().objects.find((o): o is ImageObject => o.id === planId && o.type === "image");
    if (!p) {
      loka();
      return;
    }
    let haett = false;
    void (async () => {
      const framvinda = (message: string) => (percent: number) =>
        useBoardStore.getState().setImportProgress({ fileName: p.name, percent, message });
      let s: PdfSida | null = null;
      try {
        s = await lesaPdfSidu(p, framvinda("Les línur úr PDF-vigrum…"));
      } catch (err) {
        console.warn("[veggir] PDF-lestur mistókst — myndgreining í staðinn", err);
      }
      if (haett) return;
      // Skönnuð PDF (ein mynd, nær engin strik) er mynd — ekki „Engar strokaðar línur" og 0 veggir.
      const skonnudPdf = !!s && pdfErSkonnun(s.flokkar);
      if (s && !skonnudPdf) {
        useBoardStore.getState().setImportProgress(null);
        const y = flokkaYfirlit(s.flokkar, s.breidd, s.haed);
        setSida(s);
        setFlokkar(y);
        const t = y.find((f) => f.tillaga);
        setValdir(t ? [t.breidd] : []);
        setHamur("pdf");
        return;
      }
      try {
        // 1) sama greining og Teikning-glugginn (383): húsið (skurður hæðarinnar), fastur kvarði blaðsins
        let veggir: Butur[] = [];
        let aths: string | undefined;
        try {
          const g = await greinaVeggiSkonnunar(p, framvinda("Greini veggi úr myndinni (eins og Teikning)…"), kvardiNu());
          veggir = g.veggir;
          const t = g.talning;
          console.info(`[veggir] skönnun: ${JSON.stringify(t)}`);
          aths = (skonnudPdf ? "PDF-ið er skönnun (mynd) — " : "") + `greint eins og í Teikning · ${t.metrar ?? 0} m${t.gler ? ` · ${t.gler} gler` : ""}`;
        } catch (err) {
          console.warn("[veggir] skönnunargreining mistókst — eldri myndgreining í staðinn", err);
        }
        // 2) varaleið: eldri myndgreiningin (holir/fylltir veggir á fullri upplausn)
        if (!veggir.length) {
          const m = await greinaVeggiTeikningar(p, 1, framvinda("Greini veggi úr myndinni…"));
          const sx = p.width / m.breidd, sy = p.height / m.haed;
          veggir = m.midlinur.map((l) => ({ p: l.punktar.map((v, i) => (i % 2 === 0 ? p.x + v * sx : p.y + v * sy)), t: Math.max(1, l.thykkt * sx) }));
          aths = m.holir ? `${m.holir} holir veggir` : undefined;
        }
        useBoardStore.getState().setImportProgress(null);
        if (haett) return;
        const unnid = await vinnuadferd(p, klemmaGreindaThykkt(veggir, kvardiNu()));
        if (haett) return;
        setNid({ veggir: unnid, linur: 0, thekja: null, aths });
        setHamur("mynd");
        // Skönnun: Veggjavélin (skrifstofutölvan) tekur við sjálfkrafa — myndgreining vafrans setti veggi á texta,
        // húsgögn og tröppur (Agnar 11.10.2026, DRA). Greining vafrans stendur sem varaleið svari vélin ekki.
        if (!("astaeda" in beidniGogn(p))) setAutoVel(true);
      } catch (err) {
        useBoardStore.getState().setImportProgress(null);
        if (haett) return;
        setVilla(err instanceof Error ? err.message : "Veggjagreining mistókst");
        setHamur("villa");
      }
    })();
    return () => {
      haett = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId]);

  // 2) PDF: valdir flokkar → veggir (forskoðun á borðinu)
  useEffect(() => {
    if (hamur !== "pdf" || !sida || !plan) return;
    if (!valdir.length) {
      setNid({ veggir: [], linur: 0, thekja: null });
      useVeggjaRitill.getState().setForskodun(null);
      return;
    }
    setReiknar(true);
    const t = window.setTimeout(() => {
      try {
        const t0 = performance.now();
        const sv = innanHuss && plan.uttekt ? skurdurIPt(plan.uttekt.skurdur, { b: plan.uttekt.frumB, h: plan.uttekt.frumH }, sida.breidd, sida.haed) : null;
        const strik = strikValinna(sida.flokkar, valdir, { svaedi: sv, burt: plan.hvittad, bladB: sida.breidd, bladH: sida.haed });
        if (strik.length > 60000) {
          setNid({ veggir: [], linur: strik.length, thekja: null, aths: "Of margar línur (> 60 000) — veldu færri flokka" });
          useVeggjaRitill.getState().setForskodun(null);
          return;
        }
        const pt = veggirUrStrikumPt(strik, sida.breidd, sida.haed, { gler, stakar });
        // þekja: hlutfall valinna lína sem veggirnir ná yfir (mælt í ≤ 2,5× pt, ristin ≤ 5 MP)
        let thekja: number | null = null;
        if (strik.length <= 40000) {
          let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
          for (const s of strik) {
            x0 = Math.min(x0, s[0], s[2]);
            y0 = Math.min(y0, s[1], s[3]);
            x1 = Math.max(x1, s[0], s[2]);
            y1 = Math.max(y1, s[1], s[3]);
          }
          const q = Math.min(2.5, Math.sqrt(5e6 / Math.max(1, (x1 - x0 + 80) * (y1 - y0 + 80))));
          thekja = maelaThekju(
            strik.map((s) => s.map((n) => n * q)),
            pt.map((v) => ({ ...v, p: v.p.map((n) => n * q), t: v.t * q }))
          ).thekja;
        }
        // Þykktarþak (≤ 35 cm): skástrikun pöruð í „veggi" verður aldrei að þykkum svörtum klessum.
        const bord = klemmaGreindaThykkt(ptIBord(pt, plan, sida.breidd, sida.haed), kvardiNu());
        setNid({ veggir: bord, linur: strik.length, thekja });
        const kx = plan.width / sida.breidd, ky = plan.height / sida.haed;
        useVeggjaRitill.getState().setForskodun({
          linur: strik.map((s) => [plan.x + s[0] * kx, plan.y + s[1] * ky, plan.x + s[2] * kx, plan.y + s[3] * ky]),
          veggir: bord,
        });
        console.info(`[veggir] ${valdir.join("+")} pt: ${strik.length} línur → ${bord.length} veggir á ${Math.round(performance.now() - t0)} ms`);
      } finally {
        setReiknar(false);
      }
    }, 30);
    return () => window.clearTimeout(t);
    // plan breytist við hverja breytingu á borðinu — aðeins id/staða skipta máli hér
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hamur, sida, valdir, innanHuss, gler, stakar, plan?.id, plan?.x, plan?.y, plan?.width, plan?.height]);

  // Ný niðurstaða (annað val) = spurt upp á nýtt; línur úr þjálfunarminni hæðarinnar faldar strax.
  useEffect(() => {
    nidRef.current = nid;
    setStadfesta(null);
    const R = useVeggjaRitill.getState();
    R.hreinsaBurt();
    munadRef.current = new Set();
    skradRef.current = new Set();
    if (nid && neikv && neikv.length) {
      const st = useBoardStore.getState();
      const m = ritillDilarAMetra(st.objects, st.pixelsPerMeter);
      const idx = neikvaedarVisar(nid.veggir, neikv, m && m > 0 ? 0.15 * m : 8);
      const lyklar = idx.map((i) => forskodunLykill(nid.veggir[i]));
      munadRef.current = new Set(lyklar);
      if (lyklar.length) R.burtUrForskodun(lyklar);
      setMunad(lyklar.length);
    } else setMunad(0);
  }, [nid, neikv]);
  // Skönnun: Veggjavélin ræst sjálfkrafa þegar greining vafrans er komin (hún verður varaleiðin).
  useEffect(() => {
    if (!autoVel || hamur !== "mynd" || !nid || vel) return;
    setAutoVel(false);
    void byrjaVel(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoVel, hamur, nid, vel]);
  // Meðan niðurstaðan sést má taka línur úr henni beint á borðinu: smellur / kassi (Agnar 11.10.2026).
  useEffect(() => {
    useVeggjaRitill.getState().setForskodunEyding(!!nid && !tillogur && hamur !== "les");
  }, [nid, tillogur, hamur]);

  // myndgreining / veggjavél: forskoðun veggjanna
  useEffect(() => {
    if ((hamur === "mynd" || hamur === "vel") && nid) useVeggjaRitill.getState().setForskodun({ linur: [], veggir: nid.veggir });
    else if (hamur === "vel") useVeggjaRitill.getState().setForskodun(null);
  }, [hamur, nid]);

  // ── Veggjavél (skrifstofutölvan) ────────────────────────────────────────────────────────────────────────────
  const velGogn = plan ? beidniGogn(plan) : null;
  const stoppaVel = () => {
    beidni.current = null;
    if (velTimi.current != null) window.clearTimeout(velTimi.current);
    velTimi.current = null;
  };
  // Lokað á meðan unnið er: hætt að spyrja (verkið heldur áfram á skrifstofutölvunni og opnast aftur við næsta smell).
  useEffect(() => stoppaVel, []);
  // Klukkan í biðröðinni hreyfist milli fyrirspurna.
  useEffect(() => {
    if (!vel || (vel.s !== "bida" && vel.s !== "vinnur" && vel.s !== "sendi")) return;
    const t = window.setInterval(() => setNu(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [vel]);

  /** Niðurstaða vélarinnar (dílar frummyndar) → veggir á borðinu, í sama flæði og greining vafrans. */
  const synaVel = async (m: VelMinni, fyrri: boolean) => {
    const p = useBoardStore.getState().objects.find((o): o is ImageObject => o.id === planId && o.type === "image");
    if (!p) return;
    const blad = bladMyndar(p);
    const veggir = klemmaGreindaThykkt(velLinurIBord(m.linur, p, blad.frum, blad.svaedi), kvardiNu());
    setNid({ veggir: await vinnuadferd(p, veggir), linur: 0, thekja: null });
    setVel({ s: "lokid", kl: m.kl, veggir: m.veggir, gler: m.gler, sek: m.sek, fyrri });
  };

  const saekjaNidurstodu = async (id: number, n: NonNullable<ReturnType<typeof lesaNidurstodu>>, kl: number, fyrri: boolean, lykill: string) => {
    setVel({ s: "saekir" });
    if (!leyfdSlod(n.slod, supabaseUrl())) throw new Error("niðurstaðan er ekki í geymslu TurboPaint");
    const r = await fetch(n.slod, { cache: "no-store" });
    if (!r.ok) throw new Error(`niðurstaðan fékkst ekki (${r.status})`);
    const linur = lesaVeggjavelJson(await r.json());
    const m: VelMinni = { id, kl, linur, veggir: n.veggir, gler: n.gler, sek: n.sek };
    velMinni.setja(lykill, m);
    if (beidni.current && beidni.current.id !== id) return;
    await synaVel(m, fyrri);
  };

  const kannaVel = async () => {
    const b = beidni.current;
    const sb = getSupabase();
    if (!b || !sb) return;
    let naesta = true;
    try {
      const r = await sb.from("automation_triggers").select("status,result,requested_at").eq("id", b.id).limit(1);
      if (beidni.current !== b) return;
      const rod = (r.data as { status: string; result: string | null }[] | null)?.[0];
      if (rod) {
        if (rod.status === "error" && /^Unknown workflow/i.test(String(rod.result || "")) && b.hafnadFra == null) b.hafnadFra = Date.now();
        let upptekin: string | null = null;
        const bidur = rod.status === "bida" || rod.status === "pending";
        if (bidur && Date.now() - b.byrjad > VEGGJAVEL_SVARAR_EKKI_MS) {
          // Annað verk í gangi á brúnni (t.d. Blender, 8–10 mín)? Þá bíður beiðnin — skrifstofutölvan er í gangi.
          const u = await sb
            .from("automation_triggers")
            .select("workflow,started_at")
            .eq("status", "running")
            .gt("started_at", new Date(Date.now() - 15 * 60_000).toISOString())
            .limit(3);
          upptekin = ((u.data as { workflow: string }[] | null) || [])[0]?.workflow ?? null;
          if (beidni.current !== b) return;
        }
        const st = metaStodu(rod, { nu: Date.now(), byrjad: b.byrjad, hafnadFra: b.hafnadFra, upptekin });
        if (st.s === "lokid") {
          naesta = false;
          await saekjaNidurstodu(b.id, st.nid, Date.now(), false, b.lykill);
          return;
        }
        if (st.s === "villa") {
          naesta = false;
          stoppaVel();
          setVel({ s: "villa", texti: st.texti });
          return;
        }
        setVel(st.s === "bida" ? { s: "bida", upptekin: st.upptekin, hafnad: st.hafnad } : { s: "vinnur", texti: st.texti, pros: st.pros });
      }
    } catch (err) {
      if (!naesta) {
        stoppaVel();
        setVel({ s: "villa", texti: err instanceof Error ? err.message : "niðurstaðan fékkst ekki" });
        return;
      }
      console.warn("[veggjavél] staða", err);
    }
    if (naesta && beidni.current === b) velTimi.current = window.setTimeout(() => void kannaVel(), VEL_BIL_MS);
  };

  /** „Veggjavél (skrifstofutölvan)": síðasta niðurstaða hæðarinnar strax (eða verk í gangi), annars ný beiðni. */
  const byrjaVel = async (nytt: boolean) => {
    if (!plan || !velGogn || !("gogn" in velGogn)) return;
    const gogn = velGogn.gogn;
    const sb = getSupabase();
    if (!sb) {
      setVel({ s: "villa", texti: "Engin tenging við gagnagrunninn" });
      return;
    }
    stoppaVel();
    if (hamur !== "vel") {
      setAdurHamur(hamur === "pdf" || hamur === "mynd" || hamur === "villa" ? hamur : null);
      setNidVafri(nid);
      setHamur("vel");
    }
    setNid(null);
    setVel({ s: "sendi" });
    setNu(Date.now());
    const lykill = velMinniLykill(gogn);
    try {
      if (!nytt) {
        const m = velMinni.fa(lykill);
        if (m) {
          await synaVel(m, true);
          return;
        }
        const r = await sb
          .from("automation_triggers")
          .select("id,status,result,requested_at,finished_at")
          .eq("workflow", VEGGJAVEL_WORKFLOW)
          .eq("gogn->>company_id", String(gogn.company_id))
          .eq("gogn->>haed_id", gogn.haed_id)
          .eq("gogn->>image_url", gogn.image_url)
          .order("id", { ascending: false })
          .limit(6);
        if (!r.error) {
          const radir = (r.data || []) as { id: number; status: string; result: string | null; requested_at: string; finished_at: string | null }[];
          const iGangi = radir.find(
            (x) => (x.status === "bida" || x.status === "pending" || x.status === "running") && Date.now() - Date.parse(x.requested_at) < VEGGJAVEL_HAMARK_MS
          );
          if (iGangi) {
            beidni.current = { id: iGangi.id, byrjad: Date.parse(iGangi.requested_at) || Date.now(), hafnadFra: null, lykill };
            setVel({ s: "bida", upptekin: null, hafnad: false });
            void kannaVel();
            return;
          }
          for (const x of radir) {
            const n = x.status === "done" ? lesaNidurstodu(x.result) : null;
            if (!n) continue;
            beidni.current = { id: x.id, byrjad: Date.parse(x.requested_at) || Date.now(), hafnadFra: null, lykill };
            await saekjaNidurstodu(x.id, n, Date.parse(x.finished_at || "") || Date.now(), true, lykill);
            beidni.current = null;
            return;
          }
        }
      }
      const ins = await sb.from("automation_triggers").insert({ workflow: VEGGJAVEL_WORKFLOW, status: "bida", requested_by: "turbopaint", gogn }).select("id");
      const id = (ins.data as { id: number }[] | null)?.[0]?.id;
      if (ins.error || !id) throw new Error("beiðnin vistaðist ekki (" + (ins.error?.message || "ekkert auðkenni") + ")");
      beidni.current = { id, byrjad: Date.now(), hafnadFra: null, lykill };
      setVel({ s: "bida", upptekin: null, hafnad: false });
      velTimi.current = window.setTimeout(() => void kannaVel(), VEL_BIL_MS);
    } catch (err) {
      stoppaVel();
      setVel({ s: "villa", texti: err instanceof Error ? err.message : "Veggjavélin náðist ekki" });
    }
  };

  /** Aftur í greiningu vafrans (samanburður) — verk í gangi heldur áfram á skrifstofutölvunni. */
  const tilVafra = () => {
    stoppaVel();
    setVel(null);
    setHamur(adurHamur ?? "mynd");
    setNid(nidVafri);
  };

  const fyrir = useMemo(() => (plan ? veggirTeikningar(objects, plan) : []), [objects, plan]);
  const dpm = ritillDilarAMetra(objects, pixelsPerMeter);
  // Veggir sem notandinn eyddi úr forskoðuninni (smellur / kassi á borðinu meðan viðvörunin er opin) teljast ekki með.
  const burt = useVeggjaRitill((s) => s.forskodunBurt);
  const nidV = useMemo(() => {
    if (!nid) return [];
    if (!burt.length) return nid.veggir;
    const b = new Set(burt.flat());
    return nid.veggir.filter((v) => !b.has(forskodunLykill(v)));
  }, [nid, burt]);
  const samruni = useMemo(() => {
    if (!nid) return null;
    const m = dpm && dpm > 0 ? dpm : null;
    const tMed = nidV.length ? nidV.map((v) => v.t).sort((a, b) => a - b)[nidV.length >> 1] : 4;
    return sameinaVidVeggi(fyrir.map(semButur), nidV, {
      vik: m ? 0.1 * m : tMed,
      lagmark: m ? 0.25 * m : tMed * 2,
    });
  }, [fyrir, nid, nidV, dpm]);

  /** EI-merkin lesin og fest á veggina sem komu inn (aðrir veggir teikningarinnar læstir) — keyrir áfram eftir að glugginn lokast. */
  const keyraEi = async (planId: string, lota: string) => {
    const dpmNu = kvardiNu();
    if (!dpmNu || dpmNu <= 0) {
      toast.message("EI ekki lesið — kvarði teikningarinnar er óþekktur (settu hann með K)", { duration: 3500 });
      return;
    }
    const id = toast.loading("Les EI-merki…");
    try {
      const r = await lesaOgFestaEi(planId, dpmNu, lota, (t) => toast.loading(t, { id }));
      toast.success(r.texti, { id, duration: 4500 });
    } catch (err) {
      console.warn("[veggir] EI-lestur mistókst", err);
      toast.error("EI-lestur mistókst — " + (err instanceof Error ? err.message : "óþekkt villa") + " (veggirnir eru komnir inn)", { id, duration: 5000 });
    }
  };

  const beita = async (ham: "baeta" | "skipta", stadfest = false) => {
    if (!plan || !nid || !samruni) return;
    let listi = ham === "baeta" ? samruni.baeta : nidV;
    if (hamur === "pdf" && vinnaPdf) {
      // vigur-PDF: sama hreinsun (stakir bútar, smella, rétta) og hurðaleit (hurðabogar skera veggi) og skönnun/Veggjavél fá — áður settust hráu línurnar inn
      const unnid = await vinnuadferd(plan, nidV, true);
      if (unnid.length) {
        const m = dpm && dpm > 0 ? dpm : null;
        const tMed = unnid.map((v) => v.t).sort((a, b) => a - b)[unnid.length >> 1] ?? 4;
        const sam = sameinaVidVeggi(fyrir.map(semButur), unnid, { vik: m ? 0.1 * m : tMed, lagmark: m ? 0.25 * m : tMed * 2 });
        listi = ham === "baeta" ? sam.baeta : unnid;
      }
    }
    // Mörg hundruð veggir í einu (eða > 3× þeir sem fyrir eru) er nær alltaf skástrikun / húsgögn — skýrt já fyrst.
    if (!stadfest && greiningKrefstStadfestingar(listi.length, fyrir.length)) {
      setStadfesta({ ham, n: listi.length });
      return;
    }
    setStadfesta(null);
    // Ein lota: veggirnir merktir svo „Eyða síðustu greiningu" í ritlinum taki þá alla (og ⌘Z afturkallar í einu skrefi).
    const lota = nyGreiningarLota();
    const nyir = listi.map((v) => nyrVeggur(v.p, { id: newId(), thykkt: v.t, tegund: v.tegund ?? "veggur", parentId: plan.id, greining: lota }));
    const eyda = ham === "skipta" ? fyrir.map((o) => o.id) : [];
    if (!nyir.length && !eyda.length) {
      toast.message("Ekkert nýtt — allir greindu veggirnir eru þegar á teikningunni");
      loka();
      return;
    }
    skiptaUt(eyda, nyir, []);
    const planId = plan.id;
    const t = veggjaTalning(useBoardStore.getState().objects);
    toast.success(
      (ham === "baeta"
        ? `${nyir.length} veggir bættust við` + (samruni.tviteknir ? ` (${samruni.tviteknir} tvíteknir slepptir)` : "")
        : `${eyda.length} veggjum skipt út fyrir ${nyir.length}`) +
        ` · alls ${talningTexti(t)} · ⌘Z afturkallar alla greininguna í einu skrefi`
    );
    loka();
    if (lesaEi) void keyraEi(planId, lota);
  };

  /** Veggir-hamur: niðurstaðan verður TILLÖGUR (punktalínur) — aðeins samþykktar verða veggir. */
  const synaTillogur = () => {
    if (!plan || !samruni) return;
    const veggir = samruni.baeta;
    if (!veggir.length) {
      toast.message("Ekkert nýtt — allir greindu veggirnir eru þegar á teikningunni");
      loka();
      return;
    }
    useVeggjaRitill.getState().setTillogur({ planId: plan.id, lota: nyGreiningarLota(), veggir });
    if (useVeggjaRitill.getState().tol !== "velja") useVeggjaRitill.getState().setTol("velja");
    toast.success(`${veggir.length} tillögur — smelltu á punktalínu til að samþykkja, Shift+smellur hafnar`, { duration: 3500 });
    loka();
  };

  const fjoldiTegunda = (v: Butur[]) => {
    const g = v.filter((x) => x.tegund === "gler").length;
    return `${v.length - g} ${v.length - g === 1 ? "veggur" : "veggir"}` + (g ? ` · ${g} gler` : "");
  };
  const valdirEkkiVeggir = flokkar.filter((f) => f.ekkiVeggir && valdir.includes(f.breidd));
  // Flokkur sem ekki eru veggir og er valinn sést alltaf (líka utan átta efstu) — svo viðvörunin vísi á eitthvað.
  const synd = fleiri ? flokkar : flokkar.filter((f, i) => i < 8 || valdir.includes(f.breidd));
  const btn = "rounded-md px-2.5 py-1.5 text-[12px] font-semibold";
  // 14.10.2026 (Agnar, í síma: „stórkassi með óþarfa rugli"): í síma sýnir kassinn aðeins það sem þarf til að ákveða —
  // fjölda og takkana. Skýringarnar, Veggjavélin og þekjan eru tölvuhlutir; þær standa áfram þar.
  const simi = useErSimi();

  return (
    <div
      role="dialog"
      aria-label="Greina veggi"
      className={`pointer-events-auto absolute z-30 flex flex-col rounded-xl border border-white/10 bg-[#1a1d2e]/97 p-3 text-stone-100 shadow-2xl ${
        simi ? "top-14 right-2 left-16 max-h-[calc(100%-9rem)] w-auto" : "top-16 right-3 max-h-[calc(100%-5rem)] w-[344px]"
      }`}
    >
      <div className="flex items-center gap-1.5">
        <ScanSearch className="size-4 text-[#FE653F]" />
        <span className="text-[13px] font-semibold">Greina veggi</span>
        <button type="button" aria-label="Loka" onClick={loka} className="ml-auto rounded p-1 hover:bg-white/10">
          <X className="size-3.5" />
        </button>
      </div>
      <div className="mt-0.5 truncate text-[11px] text-white/50">{plan?.name}</div>

      <div className="mt-2 min-h-0 flex-1 overflow-auto">
        {hamur !== "les" && hamur !== "vel" ? (
          <div data-veggjavel-val className="mb-2 flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
            <button
              type="button"
              data-veggjavel
              disabled={!velGogn || !("gogn" in velGogn)}
              onClick={() => void byrjaVel(false)}
              title={
                velGogn && "astaeda" in velGogn
                  ? velGogn.astaeda
                  : "Eigið veggjalíkan Slökkvitækis greinir hæðina á skrifstofutölvunni (oftast 1–3 mín). Síðasta niðurstaða hæðarinnar opnast strax."
              }
              className={`${btn} inline-flex shrink-0 items-center gap-1.5 bg-white/10 hover:bg-white/15 disabled:opacity-40`}
            >
              <Cpu className="size-3.5" />
              Veggjavél (skrifstofutölvan)
            </button>
            <span className={`text-[10.5px] leading-tight text-white/50 ${simi && !(velGogn && "astaeda" in velGogn) ? "hidden" : ""}`}>
              {velGogn && "astaeda" in velGogn ? velGogn.astaeda : "Eigið líkan Slökkvitækis · gler verður gler"}
            </span>
          </div>
        ) : null}
        {hamur === "vel" && vel ? (
          <div data-veggjavel-stada={vel.s} className="text-[12px] text-white/80">
            {vel.s === "sendi" ? <div className="font-semibold">Sendi beiðni til skrifstofutölvunnar…</div> : null}
            {vel.s === "bida" ? (
              <>
                <div className="font-semibold">
                  Í biðröð — bíð eftir skrifstofutölvunni… <span className="tabular-nums text-white/60">{klukka(nu - (beidni.current?.byrjad ?? nu))}</span>
                </div>
                {vel.upptekin ? (
                  <div className="mt-1 text-[11.5px] text-amber-300">
                    Skrifstofutölvan er upptekin við annað verk ({vel.upptekin}) — beiðnin bíður á eftir því.
                  </div>
                ) : vel.hafnad ? (
                  <div className="mt-1 text-[11.5px] text-amber-300">Eldri brúartölva hafnaði beiðninni — skrifstofutölvan tekur við henni…</div>
                ) : null}
              </>
            ) : null}
            {vel.s === "vinnur" ? (
              <>
                <div className="font-semibold">
                  {vel.texti.split(" — ")[0]}{" "}
                  <span className="tabular-nums text-white/60">{klukka(nu - (beidni.current?.byrjad ?? nu))}</span>
                </div>
                {vel.texti.includes(" — ") ? <div className="text-[11px] text-white/55">{vel.texti.split(" — ").slice(1).join(" — ")}</div> : null}
              </>
            ) : null}
            {vel.s === "saekir" ? <div className="font-semibold">Sæki veggina frá skrifstofutölvunni…</div> : null}
            {vel.s === "sendi" || vel.s === "bida" || vel.s === "vinnur" || vel.s === "saekir" ? (
              <div className="mt-1.5 h-1.5 overflow-hidden rounded bg-white/10">
                <div
                  data-veggjavel-pros={vel.s === "vinnur" ? vel.pros ?? "" : ""}
                  className="h-full rounded bg-[#FE653F] transition-[width] duration-500"
                  style={{ width: `${vel.s === "vinnur" ? vel.pros ?? 8 : vel.s === "saekir" ? 98 : 3}%` }}
                />
              </div>
            ) : null}
            {vel.s === "villa" ? (
              <div role="alert" data-veggjavel-villa className="rounded-lg border border-red-400/50 bg-red-500/15 px-2 py-1.5 text-[12px] font-semibold text-red-200">
                {vel.texti}
              </div>
            ) : null}
            {vel.s === "lokid" ? (
              <div className="text-[11.5px] text-white/65">
                Veggjavél · greint á skrifstofutölvunni {dagsTexti(vel.kl)}
                {vel.sek != null ? ` (${vel.sek} s)` : ""}
                {vel.fyrri ? " — síðasta niðurstaða hæðarinnar" : ""}
              </div>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {vel.s === "lokid" || vel.s === "villa" ? (
                <button type="button" onClick={() => void byrjaVel(true)} className={`${btn} bg-white/10 hover:bg-white/15`} title="Ný greining á skrifstofutölvunni">
                  {vel.s === "villa" ? "Reyna aftur" : "Greina aftur"}
                </button>
              ) : null}
              <button type="button" onClick={tilVafra} className={`${btn} bg-white/5 hover:bg-white/10`} title="Greiningin í vafranum (til samanburðar)">
                ← Greining í vafranum{nidVafri ? ` (${nidVafri.veggir.length})` : ""}
              </button>
            </div>
          </div>
        ) : null}
        {hamur === "les" ? <div className="py-3 text-[12px] text-white/70">Les teikninguna…</div> : null}
        {hamur === "villa" ? <div className="py-3 text-[12px] text-red-300">{villa}</div> : null}
        {hamur === "mynd" && !simi ? (
          <div className="text-[12px] text-white/75">
            Teikningin er mynd (skönnun / TIF / skönnuð PDF) — engar vigurlínur að lesa. Veggirnir eru greindir úr myndinni, eins og
            Teikning-glugginn gerir (grænt = veggir, blátt = gler).
          </div>
        ) : null}
        {hamur === "pdf" ? (
          <>
            <div className={`text-[11.5px] text-white/70 ${simi ? "hidden" : ""}`}>
              Línuflokkar í PDF-inu eftir þykkt. Veldu þá sem eru veggir — einn eða fleiri. Appelsínugular línur á teikningunni = valdar,
              grænt = veggirnir sem verða til (gler blátt).
            </div>
            <div className="mt-2 flex flex-col gap-1" role="group" aria-label="Línuflokkar">
              {synd.map((f) => {
                const a = valdir.includes(f.breidd);
                return (
                  <button
                    key={f.breidd}
                    type="button"
                    aria-pressed={a}
                    data-flokkur={f.breidd}
                    onClick={() => setValdir((v) => (v.includes(f.breidd) ? v.filter((x) => x !== f.breidd) : [...v, f.breidd]))}
                    className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-[11.5px] ${
                      a ? "border-[#FE653F] bg-[#FE653F]/15" : "border-white/10 bg-white/5 hover:bg-white/10"
                    }`}
                  >
                    <span className={`inline-flex size-3.5 items-center justify-center rounded-sm border ${a ? "border-[#FE653F] bg-[#FE653F] text-white" : "border-white/30"}`}>
                      {a ? "✓" : ""}
                    </span>
                    <span className="w-14 font-semibold tabular-nums">{f.breidd.replace(".", ",")} pt</span>
                    <span className="text-white/60 tabular-nums">
                      {fjoldi(f.strik)} strik · {fjoldi(f.lengdM)} m
                    </span>
                    <span
                      data-ekki-veggir={f.ekkiVeggir ? "" : undefined}
                      title={f.astaeda}
                      className={`ml-auto text-[10px] ${f.ekkiVeggir ? "font-semibold text-red-300" : "text-white/45"}`}
                    >
                      {f.tillaga ? "tillaga" : f.ekkiVeggir ? "ekki veggir" : ""}
                    </span>
                  </button>
                );
              })}
              {valdirEkkiVeggir.length ? (
                <div
                  role="alert"
                  data-vidvorun-flokkar
                  className="rounded-lg border border-red-400/50 bg-red-500/15 px-2 py-1.5 text-[11.5px] leading-snug text-red-200"
                >
                  ⚠{" "}
                  {valdirEkkiVeggir.map((f) => `${f.breidd.replace(".", ",")} pt (${fjoldi(f.strik)} strik — ${f.astaeda})`).join(" · ")}{" "}
                  lítur ekki út eins og veggir. Línur úr {valdirEkkiVeggir.length === 1 ? "honum" : "þeim"} verða að klessum — taktu
                  hakið af nema þú sért viss.
                </div>
              ) : null}
              {flokkar.length > 8 ? (
                <button type="button" onClick={() => setFleiri(!fleiri)} className="text-left text-[11px] text-white/50 hover:text-white/80">
                  {fleiri ? "Færri flokkar" : `Sýna alla ${flokkar.length} flokka`}
                </button>
              ) : null}
              {!flokkar.length ? <div className="text-[12px] text-white/60">Engar strokaðar línur í PDF-inu.</div> : null}
            </div>
            <div className="mt-2 flex flex-col gap-1 text-[11.5px] text-white/75">
              {plan?.uttekt?.skurdur ? (
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={innanHuss} onChange={(e) => setInnanHuss(e.target.checked)} />
                  Aðeins innan hússins (skurður hæðarinnar)
                </label>
              ) : null}
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={gler} onChange={(e) => setGler(e.target.checked)} />
                Gler úr þunnum pörum í línu veggja
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={stakar} onChange={(e) => setStakar(e.target.checked)} />
                Stakar línur (≥ 1,2 m) verða veggir
              </label>
              <label className="flex items-center gap-1.5" title="Sama hreinsun og hurðaleit og „Sjálfvirkt“ og skannaðar teikningar fá: stakir bútar burt, hurðabogar skera veggi">
                <input type="checkbox" checked={vinnaPdf} onChange={(e) => setVinnaPdf(e.target.checked)} />
                Hreinsa og finna hurðir (sama og Sjálfvirkt)
              </label>
            </div>
          </>
        ) : null}

        {nid && hamur !== "les" ? (
          <div data-greining-nidurstada className="mt-2 rounded-lg bg-white/5 px-2 py-1.5 text-[12px]">
            {reiknar ? (
              <span className="text-white/60">Reikna…</span>
            ) : (
              <>
                <div>
                  <b>{fjoldiTegunda(nid.veggir)}</b>
                  {nid.linur ? <span className="text-white/60"> úr {fjoldi(nid.linur)} línum</span> : null}
                </div>
                {nid.thekja != null && !simi ? (
                  <div className="text-white/60">Þekja: {(nid.thekja * 100).toFixed(1).replace(".", ",")} % valinna lína liggja í veggjum</div>
                ) : null}
                {nid.aths && !simi ? <div className="text-amber-300">{nid.aths}</div> : null}
              </>
            )}
          </div>
        ) : null}
      </div>

      {stadfesta && nid && samruni && hamur !== "les" ? (
        <div role="alertdialog" aria-label="Staðfesta greiningu" data-stadfesta-greiningu className="mt-2 rounded-lg border border-red-400/60 bg-red-500/15 p-2">
          <div className="text-[12.5px] font-semibold text-red-100">
            {stadfesta.ham === "baeta"
              ? `Bæta við ${fjoldi(samruni.baeta.length)} veggjum?`
              : `Skipta ${fjoldi(fyrir.length)} veggjum út fyrir ${fjoldi(nidV.length)}?`}{" "}
            Þetta lítur út eins og skástrikun.
          </div>
          <div className="mt-1 text-[11.5px] leading-snug text-red-200/90">
            {fyrir.length ? `Á teikningunni eru ${fjoldi(fyrir.length)} veggir. ` : ""}
            Svona margir veggir í einu koma nær alltaf úr skástrikun, húsgögnum eða málstrikum — veldu aðeins veggjalínurnar (oftast
            tillöguna). Þykkt hvers veggjar er þó aldrei meiri en {GREINDUR_VEGGUR_HAMARK_CM} cm og ⌘Z afturkallar allt í einu skrefi.
          </div>
          <div data-forsk-eyding className="mt-1.5 rounded bg-black/25 px-2 py-1 text-[11.5px] leading-snug text-red-50">
            <b>Eyða fyrst:</b> smelltu á græna línu á teikningunni til að taka hana úr tillögunni, eða dragðu kassa utan um margar
            (hægri-dráttur færir borðið).
            {burt.length ? ` · ${burt.reduce((s, l) => s + l.length, 0)} teknar úr` : ""}
          </div>
          <div className="mt-2 flex gap-1.5">
            <button type="button" autoFocus onClick={() => setStadfesta(null)} className={`${btn} bg-white/15 ring-1 ring-white/40 hover:bg-white/20`}>
              Hætta við
            </button>
            {burt.length ? (
              <button type="button" onClick={() => useVeggjaRitill.getState().afturkallaBurt()} className={`${btn} bg-white/10 hover:bg-white/15`} title="Setja síðustu eyðingu aftur í tillöguna">
                Afturkalla
              </button>
            ) : null}
            <button type="button" onClick={() => void beita(stadfesta.ham, true)} className={`${btn} bg-red-600/80 text-white hover:bg-red-600`}>
              {stadfesta.ham === "baeta" ? `Já, bæta við ${fjoldi(samruni.baeta.length)}` : `Já, skipta út`}
            </button>
          </div>
        </div>
      ) : null}

      {tillogur && nid && samruni && hamur !== "les" ? (
        <div className="mt-2 flex flex-wrap gap-1.5 border-t border-white/10 pt-2">
          <button
            type="button"
            autoFocus
            data-synatillogur
            disabled={reiknar || !samruni.baeta.length}
            onClick={synaTillogur}
            className={`${btn} bg-teal-600 text-white hover:bg-teal-500 disabled:opacity-50`}
            title={`${samruni.baeta.length} nýir veggir sem tillögur · ${samruni.tviteknir} tvíteknir slepptir — ekkert fer á teikninguna fyrr en þú samþykkir`}
          >
            Sýna sem tillögur ({samruni.baeta.length})
          </button>
          <button type="button" onClick={loka} className={`${btn} bg-white/5 hover:bg-white/10`}>
            Hætta við
          </button>
        </div>
      ) : null}
      {!tillogur && nid && samruni && hamur !== "les" && !stadfesta ? (
        <div className="mt-2 border-t border-white/10 pt-2">
          <div data-forsk-eyding className={`mb-2 rounded bg-white/5 px-2 py-1 text-[11.5px] leading-snug text-white/75 ${simi && !burt.length ? "hidden" : ""}`}>
            {simi ? (
              <span>{burt.reduce((s, l) => s + l.length, 0)} línur teknar úr.</span>
            ) : (
              <>
                <b>Taka úr:</b> smelltu á græna línu eða dragðu kassa á teikningunni (líka „Eyða í kassa" í ritlinum). Það sem þú
                tekur út skráist í þjálfunarminni og kemur ekki aftur á sama stað.
                {munad ? ` ${munad} ${munad === 1 ? "lína sem þú hefur áður tekið út er falin" : "línur sem þú hefur áður tekið út eru faldar"}.` : ""}
              </>
            )}
            {burt.length ? (
              <button type="button" onClick={() => useVeggjaRitill.getState().afturkallaBurt()} className="ml-1.5 rounded bg-white/10 px-1.5 py-0.5 text-[11px] hover:bg-white/15">
                Afturkalla
              </button>
            ) : null}
          </div>
          <label
            data-lesa-ei
            className="mb-1.5 flex items-center gap-1.5 text-[11.5px] text-white/75"
            title="EI-30 / EI-60 merkin á teikningunni lesin og fest á veggina sem komu inn (úr textalagi PDF ef það er til, annars OCR). Þínir eigin veggir haldast óbreyttir. ⌘Z afturkallar."
          >
            <input type="checkbox" checked={lesaEi} onChange={(e) => setLesaEi(e.target.checked)} />
            Lesa EI-60 / EI-30 og festa á veggina
          </label>
          {fyrir.length ? (
            <>
              <div className="text-[11.5px] text-white/70">
                {simi ? (
                  <>Á teikningunni eru þegar <b>{fyrir.length}</b> veggir.</>
                ) : (
                  <>
                    Á teikningunni eru þegar <b>{fyrir.length}</b> veggir. Bæta við sleppir tvíteknum — veggirnir sem fyrir eru (og
                    leiðréttingar á þeim) haldast.
                  </>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  autoFocus
                  disabled={reiknar}
                  onClick={() => void beita("baeta")}
                  className={`${btn} bg-[#FE653F] text-white hover:bg-[#ff7a58] disabled:opacity-50`}
                  title={`${samruni.baeta.length} nýir bútar · ${samruni.tviteknir} tvíteknir slepptir · ${samruni.styttir} styttir`}
                >
                  Bæta við (+{samruni.baeta.length})
                </button>
                <button
                  type="button"
                  disabled={reiknar}
                  onClick={() => void beita("skipta")}
                  className={`${btn} bg-white/10 hover:bg-white/15 disabled:opacity-50`}
                  title={`Eyðir ${fyrir.length} veggjum teikningarinnar og setur ${nidV.length} í staðinn`}
                >
                  Skipta út ({fyrir.length} → {nidV.length})
                </button>
                <button type="button" onClick={loka} className={`${btn} bg-white/5 hover:bg-white/10`}>
                  Hætta við
                </button>
                <button
                  type="button"
                  onClick={() => {
                    loka();
                    useVeggjaRitill.getState().kveikja("teikna");
                  }}
                  className={`${btn} bg-white/10 hover:bg-white/15`}
                  title="Teikna veggina sem vantar: haltu inni vinstri músartakkanum og dragðu"
                >
                  + Teikna vegg
                </button>
              </div>
              {samruni.baeta.length === 0 ? (
                <div className="mt-1.5 text-[11px] text-amber-300">Greiningin fann ekkert nýtt — teiknaðu veggina sem vantar með „+ Teikna vegg".</div>
              ) : null}
            </>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                autoFocus
                disabled={reiknar || !nidV.length}
                onClick={() => void beita("baeta")}
                className={`${btn} bg-[#FE653F] text-white hover:bg-[#ff7a58] disabled:opacity-50`}
              >
                Setja inn {nidV.length} veggi
              </button>
              <button type="button" onClick={loka} className={`${btn} bg-white/5 hover:bg-white/10`}>
                Hætta við
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
