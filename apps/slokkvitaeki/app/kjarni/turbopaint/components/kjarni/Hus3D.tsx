"use client";

// 3D-sýn hússins (Agnar 03.10.2026): greindir veggir lyftast upp með sinni þykkt, teikningin er gólfið og tækin
// (slökkvitæki, brunaslöngur, …) standa á sínum stað — allar hæðir hver ofan á annarri, eða ein í einu.
// three.js kemur af cdnjs eins og í teikningaglugga Slökkvitækis (383) — engin ný háð í pakkanum.
//
// 3. áfangi (Agnar 06.10.2026 — TurboPaint verður eina vinnuborð grunnmynda): sama þrívídd og Teikning-glugginn
// (383 syna3d): raunhæð veggja (3,0 m í kvarða teikningarinnar), dökkar efri brúnir, gler sem hálfgagnsæir bláir
// fletir, hurðargöt með dyrakarmi og litaðri rönd, eldveggir í sínum lit (EI-60 rauður, EI-30 ljósrauður), tækjalíkön
// á næsta vegg með miðum í fastri skjástærð, gönguhamur („Ganga") og „Gegnsætt". Lýsingin er hrein og skörp — engir
// skuggar eða SSAO (Agnar hafnaði kornóttu útliti).

import { X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getAssetBlob } from "../../lib/board/assets";
import {
  bladDilarAMetra,
  bladSlod,
  festaAVegg,
  giskDilarAMetra,
  haedarNumer,
  husLengd,
  husUrBordi,
  pdfDilarAMetra,
  VEGGHAED_M,
  veljaDilarAMetra,
  type Haed3D,
  type KvardaHeimild,
  type TaekjaGerd,
} from "../../lib/board/hus3d";
import { saekjaKynningarMynd, teiknaKynningarblad } from "../../lib/board/hus3d-kynning-blad";
import { kynningarDags, kynningarLykill, kynningarSkrarnafn, kynningarTitill } from "../../lib/board/hus3d-kynning";
import { teiknaTaekistakn } from "../../lib/board/hus3d-takn";
import { useSkodun } from "../../lib/board/skodun";
import { saekjaBladstaerd } from "../../lib/board/teikn-thjonusta";
import type { BoardObject } from "../../lib/board/types";
import { useBoardStore } from "../../lib/board/store";
import { useUttektGogn } from "../../lib/board/uttekt-gogn";

const THREE_SLOD = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";

// three.js UMD-útgáfan hefur engar tegundir hér; þeir klasar sem eru notaðir eru meðhöndlaðir sem óþekktir hlutir.
// oxlint-disable-next-line no-explicit-any
type Three = any;

let threeBid: Promise<Three> | null = null;
function saekjaThree(): Promise<Three> {
  const w = window as unknown as { THREE?: Three };
  if (w.THREE) return Promise.resolve(w.THREE);
  if (threeBid) return threeBid;
  threeBid = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = THREE_SLOD;
    s.onload = () => res(w.THREE);
    s.onerror = () => {
      threeBid = null;
      rej(new Error("Náði ekki í three.js"));
    };
    document.head.appendChild(s);
  });
  return threeBid;
}

// Litir 383: ljósir veggir með dökkri efri brún (grunnmyndin lesist ofan frá), EI-60 rauður, EI-30 ljósrauður; hurðir
// sjást ofan frá á litaðri rönd — brunahurð appelsínugul, önnur brún.
const BAKGRUNNUR_3D = 0xe8e6e1;
/** Yfirlit eins og í Teikning: ofan frá, húsið lesist. Ekki ¾-horn sem sýnir aðeins efri brúnir veggja. */
const YFIRLIT_PHI = 0.34;
const YFIRLIT_THETA = -0.22;
const VEGGLITUR_3D = 0xf2eee6;
const TOPPLITUR_3D = 0x5c574f;
const ELDLITIR_3D: Record<number, number> = { 60: 0xd32f2f, 30: 0xe57373 };
const HURDALITUR_3D = 0x8d6e63;
const ELDHURD_3D = 0xf57c00;
const GLERLITUR_3D = 0x8fc3e8;

/** Gólfið sem áferð: sá hluti teikningarinnar sem gólfflöturinn nær yfir (hd.golf — húsið, eins og í Teikning). */
async function golfAferd(T: Three, hd: Haed3D, hamark: number) {
  const blob = getAssetBlob(hd.plan.assetId);
  if (!blob) return null;
  const bmp = await createImageBitmap(blob);
  const kx = bmp.width / hd.breidd, ky = bmp.height / hd.haed;
  const sx = (hd.golf.x0 + hd.breidd / 2) * kx, sy = (hd.golf.y0 + hd.haed / 2) * ky;
  const sw = (hd.golf.x1 - hd.golf.x0) * kx, sh = (hd.golf.y1 - hd.golf.y0) * ky;
  const s = Math.min(1, hamark / Math.max(sw, sh));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(sw * s));
  c.height = Math.max(1, Math.round(sh * s));
  const x = c.getContext("2d");
  if (x) {
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = "high";
    x.drawImage(bmp, sx, sy, sw, sh, 0, 0, c.width, c.height);
  }
  bmp.close();
  const t = new T.CanvasTexture(c);
  t.anisotropy = 8;
  return t;
}

/** Kvarði hæðar: borðdílar á metra og hvaðan hann kom (null = enginn trúverðugur — hlutfall af stærð teikningar). */
type Kvardi = { dilar: number; heimild: KvardaHeimild } | null;

const KVARDA_TEXTI: Record<KvardaHeimild, string> = {
  kvardi: "kvarði borðsins (K)",
  pdf: "PDF-blaðið í 1:100",
  blad: "blaðstærð skjalasafnsins í 1:100",
  gisk: "ágiskun: A1 í 1:100",
};

interface Props {
  objects: BoardObject[];
  pixelsPerMeter: number | null;
  onClose: () => void;
}

/** Handfang sviðsins — það sem takkarnir kalla á án þess að smíða sviðið upp á nýtt. */
interface Handfang {
  gegnsaett: (a: boolean) => void;
  ganga: (a: boolean) => boolean;
  kynning: (a: boolean) => void;
  vista: () => HTMLCanvasElement | null;
  stada: () => { ganga: boolean; x: number; y: number; z: number; fov: number; metri: number | null };
}

export default function Hus3D({ objects, pixelsPerMeter, onClose }: Props) {
  const gamur = useRef<HTMLDivElement>(null);
  const gogn = useUttektGogn((s) => s.gogn);
  const bordNafn = useBoardStore((s) => s.name);
  const skodunTitill = useSkodun((s) => (s.virk ? s.titill : ""));
  const haedir = useMemo(() => husUrBordi(objects, gogn?.taeki ?? []), [objects, gogn]);
  const [syna, setSyna] = useState<number | "allar">("allar");
  const [teikningAGolfi, setTeikningAGolfi] = useState(true);
  const [gegn, setGegn] = useState(false);
  const [ganga, setGanga] = useState(false);
  const [kynning, setKynning] = useState(false);
  const [villa, setVilla] = useState<string | null>(null);
  const [hledst, setHledst] = useState(true);
  const [kvardar, setKvardar] = useState<Kvardi[] | null>(null);
  const handfang = useRef<Handfang | null>(null);
  const gegnRef = useRef(gegn);
  gegnRef.current = gegn;
  const kynningRef = useRef(kynning);
  kynningRef.current = kynning;
  const loka = useRef(onClose);
  loka.current = onClose;

  // ── Kvarði hverrar hæðar: K → PDF-síðan → blaðstærð (teikn-blad) → A1-ágiskun, með trúverðugleikamörkum 383 ──
  useEffect(() => {
    let lifir = true;
    setKvardar(null);
    void (async () => {
      const ut: Kvardi[] = [];
      for (const hd of haedir) {
        const lengd = husLengd(hd);
        const fyrst = veljaDilarAMetra(
          [
            { gildi: pixelsPerMeter, heimild: "kvardi" },
            { gildi: pdfDilarAMetra(hd.plan), heimild: "pdf" },
          ],
          lengd
        );
        if (fyrst) {
          ut.push(fyrst);
          continue;
        }
        const bs = bladSlod(hd.plan, gogn?.haedir ?? []);
        const blad = bs ? bladDilarAMetra(await saekjaBladstaerd(bs.slod), bs) : null;
        if (!lifir) return;
        ut.push(
          veljaDilarAMetra(
            [
              { gildi: blad, heimild: "blad" },
              { gildi: giskDilarAMetra(hd.plan), heimild: "gisk" },
            ],
            lengd
          )
        );
      }
      if (lifir) setKvardar(ut);
    })();
    return () => {
      lifir = false;
    };
  }, [haedir, pixelsPerMeter, gogn]);

  // ── Sviðið ──
  useEffect(() => {
    const el = gamur.current;
    if (!el || !haedir.length || !kvardar) return;
    let lifir = true;
    let hreinsa = () => {};
    setGanga(false);
    void (async () => {
      try {
        const T = await saekjaThree();
        if (!lifir) return;
        const nrValdra = syna === "allar" ? haedir.map((_, i) => i) : [syna].filter((i) => haedir[i]);
        const valdar = nrValdra.map((i) => haedir[i]);
        const kvValdra = nrValdra.map((i) => kvardar[i] ?? null);
        // „Stærð hússins" (veggirnir) ræður römmun, stærð kúlna og miða; stærð blaðsins ræður fjarlægðarmörkum.
        const husStaerst = Math.max(...valdar.map((h) => husLengd(h)), 1);
        const bladStaerst = Math.max(...valdar.map((h) => Math.max(h.breidd, h.haed)), 1);

        const b = el.clientWidth || 800, h = el.clientHeight || 500;
        const teiknari = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        teiknari.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        teiknari.setSize(b, h);
        teiknari.setClearColor(BAKGRUNNUR_3D);
        const canvas: HTMLCanvasElement = teiknari.domElement;
        canvas.style.cssText = "display:block;width:100%;height:100%;touch-action:none;cursor:grab";
        el.appendChild(canvas);
        const svid = new T.Scene();
        // Hrein birta: himinljós + ein stefnuljós án skugga — skýrar hliðar, ekkert korn.
        svid.add(new T.HemisphereLight(0xffffff, 0xbdb8ae, 0.82));
        const sol = new T.DirectionalLight(0xffffff, 0.58);
        sol.position.set(-0.8, 1.5, 0.65);
        svid.add(sol);
        const losa: { dispose: () => void }[] = [];
        const veggEfni: Three[] = [];
        const sporM: Three[] = [];
        const lag: { hopur: Three; golfE: Three; nr: number; veggH: number; metri: number; hd: Haed3D }[] = [];
        const midar: { midi: Three; hlutfall: number }[] = [];
        const skraut: Three[] = [];
        const hamarkAferdar = Math.min(valdar.length > 2 ? 2048 : 4096, teiknari.capabilities.maxTextureSize || 2048);

        // Efni tækjalíkana — eitt eintak á lit (383 efni()).
        const efniL: Record<string, Three> = {};
        const efni = (lykill: string, litur: number, grunn?: boolean) => {
          if (!efniL[lykill]) {
            efniL[lykill] = grunn ? new T.MeshBasicMaterial({ color: litur }) : new T.MeshLambertMaterial({ color: litur });
            losa.push(efniL[lykill]);
          }
          return efniL[lykill];
        };
        const hlutur = (g: Three, geo: Three, e2: Three, x: number, y: number, z: number, rx?: number) => {
          const ms = new T.Mesh(geo, e2);
          ms.position.set(x, y, z);
          if (rx) ms.rotation.x = rx;
          g.add(ms);
          losa.push(geo);
          return ms;
        };
        // LÍKAN TÆKIS (383 taekjalikan): hópur með upphaf á gólfi við yfirborð veggjar, +z snýr út frá veggnum.
        // e = vegghæðin (mælieining líkansins — stærðirnar ýktar um það bil tvöfalt svo tækin sjáist í yfirliti).
        const taekjalikan = (gerd: TaekjaGerd, e: number, litur: Three) => {
          const g = new T.Group();
          const RAUTT = efni("rautt", 0xd0281f), SVART = efni("svart", 0x1d1d1d), HVITT = efni("hvitt", 0xf6f5f0), GRATT = efni("gratt", 0x8d939c);
          if (gerd === "slanga") {
            hlutur(g, new T.CylinderGeometry(0.3 * e, 0.3 * e, 0.012 * e, 30), HVITT, 0, 0.56 * e, 0.008 * e, Math.PI / 2);
            for (const hr of [[0.245, 0.036], [0.168, 0.034], [0.096, 0.03]]) hlutur(g, new T.TorusGeometry(hr[0] * e, hr[1] * e, 10, 40), RAUTT, 0, 0.56 * e, 0.055 * e);
            hlutur(g, new T.CylinderGeometry(0.058 * e, 0.058 * e, 0.075 * e, 18), HVITT, 0, 0.56 * e, 0.055 * e, Math.PI / 2);
            hlutur(g, new T.BoxGeometry(0.2 * e, 0.03 * e, 0.03 * e), efni("stal", 0xcfd8dc), 0, 0.56 * e, 0.1 * e);
            hlutur(g, new T.CylinderGeometry(0.034 * e, 0.034 * e, 0.24 * e, 10), RAUTT, -0.245 * e, 0.44 * e, 0.055 * e);
            hlutur(g, new T.CylinderGeometry(0.042 * e, 0.042 * e, 0.03 * e, 10), HVITT, -0.245 * e, 0.31 * e, 0.055 * e);
            hlutur(g, new T.CylinderGeometry(0.034 * e, 0.018 * e, 0.11 * e, 10), efni("stutur", 0x37474f), -0.245 * e, 0.24 * e, 0.055 * e);
          } else if (gerd === "reykskynjari") {
            hlutur(g, new T.CylinderGeometry(0.11 * e, 0.125 * e, 0.045 * e, 24), HVITT, 0, 0.98 * e, 0.15 * e);
            hlutur(g, new T.SphereGeometry(0.02 * e, 8, 6), efni("ljos", 0xff2d1f, true), 0.065 * e, 0.955 * e, 0.15 * e);
          } else if (gerd === "hitaskynjari") {
            hlutur(g, new T.CylinderGeometry(0.115 * e, 0.115 * e, 0.03 * e, 24), GRATT, 0, 0.985 * e, 0.15 * e);
            hlutur(g, new T.CylinderGeometry(0.118 * e, 0.118 * e, 0.022 * e, 24), SVART, 0, 0.96 * e, 0.15 * e);
            hlutur(g, new T.CylinderGeometry(0.11 * e, 0.075 * e, 0.045 * e, 24), GRATT, 0, 0.927 * e, 0.15 * e);
            hlutur(g, new T.SphereGeometry(0.055 * e, 14, 10), SVART, 0, 0.905 * e, 0.15 * e);
          } else if (gerd === "segull") {
            hlutur(g, new T.BoxGeometry(0.16 * e, 0.16 * e, 0.03 * e), GRATT, 0, 0.42 * e, 0.016 * e);
            hlutur(g, new T.CylinderGeometry(0.06 * e, 0.06 * e, 0.1 * e, 18), SVART, 0, 0.42 * e, 0.08 * e, Math.PI / 2);
            hlutur(g, new T.CylinderGeometry(0.045 * e, 0.045 * e, 0.012 * e, 18), RAUTT, 0, 0.42 * e, 0.135 * e, Math.PI / 2);
          } else if (gerd === "bjalla") {
            hlutur(g, new T.BoxGeometry(0.24 * e, 0.03 * e, 0.07 * e), SVART, 0, 0.575 * e, 0.036 * e);
            hlutur(g, new T.BoxGeometry(0.2 * e, 0.07 * e, 0.06 * e), efni("dokkrautt", 0xc62828), 0, 0.625 * e, 0.031 * e);
            hlutur(g, new T.BoxGeometry(0.07 * e, 0.06 * e, 0.04 * e), SVART, 0, 0.69 * e, 0.03 * e);
            hlutur(g, new T.CylinderGeometry(0.15 * e, 0.15 * e, 0.06 * e, 28), RAUTT, 0, 0.84 * e, 0.045 * e, Math.PI / 2);
            hlutur(g, new T.CylinderGeometry(0.085 * e, 0.085 * e, 0.07 * e, 22), efni("ljosrautt", 0xef5350), 0, 0.84 * e, 0.047 * e, Math.PI / 2);
            hlutur(g, new T.SphereGeometry(0.03 * e, 12, 8), efni("stal", 0xcfd8dc), 0, 0.84 * e, 0.09 * e);
            hlutur(g, new T.BoxGeometry(0.012 * e, 0.17 * e, 0.012 * e), efni("dokkrautt", 0xc62828), 0.2 * e, 0.73 * e, 0.045 * e);
            hlutur(g, new T.SphereGeometry(0.032 * e, 12, 8), RAUTT, 0.2 * e, 0.83 * e, 0.045 * e);
          } else if (gerd === "rafmagn") {
            hlutur(g, new T.BoxGeometry(0.36 * e, 0.5 * e, 0.075 * e), efni("skapur", 0x8e8e8e), 0, 0.62 * e, 0.038 * e);
            hlutur(g, new T.BoxGeometry(0.31 * e, 0.44 * e, 0.012 * e), efni("hurdskaps", 0xbdbdbd), 0, 0.62 * e, 0.08 * e);
            const eld3 = new T.Shape();
            [[0.035, 0.17], [-0.075, 0.0], [-0.012, 0.0], [-0.06, -0.15], [0.07, 0.04], [0.002, 0.04]].forEach((pt, i) => {
              if (i) eld3.lineTo(pt[0] * e, pt[1] * e);
              else eld3.moveTo(pt[0] * e, pt[1] * e);
            });
            hlutur(g, new T.ShapeGeometry(eld3), efni("elding", 0xf6c431, true), -0.02 * e, 0.63 * e, 0.088 * e);
            hlutur(g, new T.BoxGeometry(0.03 * e, 0.09 * e, 0.03 * e), efni("lamir", 0x7a7a7a), -0.185 * e, 0.74 * e, 0.06 * e);
            hlutur(g, new T.BoxGeometry(0.03 * e, 0.09 * e, 0.03 * e), efni("lamir", 0x7a7a7a), -0.185 * e, 0.5 * e, 0.06 * e);
            hlutur(g, new T.CylinderGeometry(0.016 * e, 0.016 * e, 0.012 * e, 12), efni("lamir", 0x7a7a7a), 0.115 * e, 0.62 * e, 0.09 * e, Math.PI / 2);
            hlutur(g, new T.BoxGeometry(0.08 * e, 0.045 * e, 0.006 * e), HVITT, 0.085 * e, 0.45 * e, 0.088 * e);
            for (const x of [-0.11, -0.05, 0.01, 0.11]) hlutur(g, new T.BoxGeometry(0.028 * e, 0.09 * e, 0.028 * e), SVART, x * e, 0.33 * e, 0.04 * e);
          } else if (gerd === "skilti" || gerd === "skilti-ut") {
            hlutur(g, new T.BoxGeometry(0.3 * e, 0.3 * e, 0.012 * e), HVITT, 0, 0.8 * e, 0.008 * e);
            hlutur(g, new T.BoxGeometry(0.25 * e, 0.25 * e, 0.014 * e), efni("skilti" + litur.getHexString(), litur.getHex()), 0, 0.8 * e, 0.012 * e);
          } else if (gerd === "teppi") {
            hlutur(g, new T.BoxGeometry(0.2 * e, 0.28 * e, 0.06 * e), RAUTT, 0, 0.6 * e, 0.031 * e);
          } else {
            hlutur(g, new T.CylinderGeometry(0.085 * e, 0.085 * e, 0.42 * e, 20), RAUTT, 0, 0.37 * e, 0.1 * e);
            hlutur(g, new T.SphereGeometry(0.085 * e, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), RAUTT, 0, 0.58 * e, 0.1 * e);
            hlutur(g, new T.CylinderGeometry(0.03 * e, 0.04 * e, 0.07 * e, 12), SVART, 0, 0.69 * e, 0.1 * e);
            hlutur(g, new T.BoxGeometry(0.15 * e, 0.024 * e, 0.04 * e), SVART, 0.04 * e, 0.735 * e, 0.1 * e);
            if (gerd === "co2") hlutur(g, new T.CylinderGeometry(0.028 * e, 0.07 * e, 0.2 * e, 14), SVART, 0.14 * e, 0.46 * e, 0.1 * e);
            else hlutur(g, new T.CylinderGeometry(0.016 * e, 0.016 * e, 0.26 * e, 8), SVART, 0.105 * e, 0.5 * e, 0.1 * e);
          }
          return g;
        };

        const kG = new T.BoxGeometry(1, 1, 1);
        losa.push(kG);
        const m4 = new T.Matrix4(), q = new T.Quaternion(), ofan = new T.Vector3(0, 1, 0), st3 = new T.Vector3(), kv3 = new T.Vector3();
        const lit = new T.Color();
        let haedY = 0;
        const fjoldi = { veggir: 0, gler: 0, hurdir: 0, brunahurdir: 0, e60: 0, e30: 0, taeki: 0, likon: 0 };

        for (let nr = 0; nr < valdar.length; nr++) {
          const hd = valdar[nr];
          const kv = kvValdra[nr];
          const lengd = husLengd(hd);
          // RAUNHÆÐ (383 vegghaed): 3,0 m í kvarða teikningarinnar; án trúverðugs kvarða gamla hlutfallið.
          const veggH = kv ? VEGGHAED_M * kv.dilar : Math.max(hd.breidd, hd.haed) * 0.03;
          const metri = veggH / VEGGHAED_M;
          const hopur = new T.Group();
          hopur.position.y = haedY;
          svid.add(hopur);

          // gólf: teikningin sem áferð (efri hæðir hálfgagnsæjar svo neðri sjáist), annars grá plata
          const aferd = teikningAGolfi ? await golfAferd(T, hd, hamarkAferdar) : null;
          if (!lifir) return;
          const gG = new T.PlaneGeometry(hd.golf.x1 - hd.golf.x0, hd.golf.y1 - hd.golf.y0);
          const gE = new T.MeshBasicMaterial({
            map: aferd,
            color: aferd ? 0xffffff : 0xc9c4ba,
            side: T.DoubleSide,
            transparent: nr > 0,
            opacity: nr > 0 ? 0.42 : 1,
            depthWrite: nr === 0,
          });
          const g = new T.Mesh(gG, gE);
          g.rotation.x = -Math.PI / 2;
          g.position.set((hd.golf.x0 + hd.golf.x1) / 2, 0, (hd.golf.y0 + hd.golf.y1) / 2);
          hopur.add(g);
          losa.push(gG, gE);
          if (aferd) losa.push(aferd);
          lag.push({ hopur, golfE: gE, nr, veggH, metri, hd });

          // Efni veggja: hvítt grunnefni (litur á hvert eintak) og dökk efri brún (efnisröð BoxGeometry: +x −x +y −y +z −z).
          const kE = new T.MeshLambertMaterial({ color: 0xffffff });
          kE.userData.litad = true;
          const kTopp = new T.MeshLambertMaterial({ color: TOPPLITUR_3D });
          kTopp.userData.toppur = true;
          const kEfni = [kE, kE, kTopp, kE, kE, kE];
          losa.push(kE, kTopp);
          veggEfni.push(kE, kTopp);
          const veggLitur = (v: Haed3D["veggir"][number]) =>
            v.eld && ELDLITIR_3D[v.eld] ? ELDLITIR_3D[v.eld] : v.merking ? lit.set(v.litur).getHex() : VEGGLITUR_3D;
          const sjalfg = lengd * 0.004;
          const kassi = (v: Haed3D["veggir"][number], y: number, hH: number, lengdAuki: number, thykktK = 1) => {
            q.setFromAxisAngle(ofan, -Math.atan2(v.by - v.ay, v.bx - v.ax));
            const th = Math.max(0.8, v.thykkt || sjalfg) * thykktK;
            m4.compose(st3.set((v.ax + v.bx) / 2, y, (v.ay + v.by) / 2), q, kv3.set(Math.hypot(v.bx - v.ax, v.by - v.ay) + (lengdAuki ? th : 0), hH, th));
            return m4;
          };

          const veggir = hd.veggir.filter((v) => v.tegund === "veggur");
          const gler = hd.veggir.filter((v) => v.tegund === "gler");
          const hurdir = hd.veggir.filter((v) => v.tegund === "hurd");
          fjoldi.veggir += veggir.length;
          fjoldi.gler += gler.length;
          fjoldi.hurdir += hurdir.length;
          if (veggir.length) {
            // HEILIR VEGGIR: einn kassi á bút, lengdur um hálfa þykkt í hvorn enda svo hornin fyllist.
            const mesh = new T.InstancedMesh(kG, kEfni, veggir.length);
            veggir.forEach((v, i) => {
              mesh.setMatrixAt(i, kassi(v, veggH / 2, veggH, 1));
              mesh.setColorAt(i, lit.setHex(veggLitur(v)));
              if (v.eld === 60) fjoldi.e60++;
              else if (v.eld === 30) fjoldi.e30++;
            });
            mesh.instanceMatrix.needsUpdate = true;
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
            hopur.add(mesh);
            // Spor veggjanna á gólfinu: dökk rönd sem sést aðeins þegar veggirnir eru gegnsæir.
            const spE = new T.MeshBasicMaterial({ color: 0x4a443c });
            const spor = new T.InstancedMesh(kG, spE, veggir.length);
            const flatt = new T.Matrix4().makeScale(1, 0.012, 1);
            for (let i = 0; i < veggir.length; i++) {
              mesh.getMatrixAt(i, m4);
              m4.premultiply(flatt);
              m4.elements[13] = Math.max(0.05, metri * 0.01);
              spor.setMatrixAt(i, m4);
            }
            spor.instanceMatrix.needsUpdate = true;
            spor.visible = false;
            hopur.add(spor);
            losa.push(spE);
            sporM.push(spor);
          }
          if (gler.length) {
            // Gler (gluggar, glerveggir): hálfgagnsæir bláleitir fletir — húsið lokast en sést í gegn.
            const glE = new T.MeshLambertMaterial({ color: GLERLITUR_3D, transparent: true, opacity: 0.42, depthWrite: false });
            const glM = new T.InstancedMesh(kG, glE, gler.length);
            gler.forEach((v, i) => glM.setMatrixAt(i, kassi(v, veggH / 2, veggH, 0, 0.45)));
            glM.instanceMatrix.needsUpdate = true;
            glM.renderOrder = 2;
            hopur.add(glM);
            losa.push(glE);
          }
          if (hurdir.length) {
            // Hurðargöt: veggurinn heldur áfram OFAN við hurðina (dyrakarmur, efsti fjórðungur vegghæðar) — gengt undir.
            const karmH = veggH * 0.26;
            const karmar = new T.InstancedMesh(kG, kEfni, hurdir.length);
            const rE = new T.MeshBasicMaterial({ color: 0xffffff });
            const rendur = new T.InstancedMesh(kG, rE, hurdir.length);
            hurdir.forEach((v, i) => {
              karmar.setMatrixAt(i, kassi(v, veggH - karmH / 2, karmH, 0));
              karmar.setColorAt(i, lit.setHex(v.eld && ELDLITIR_3D[v.eld] ? ELDLITIR_3D[v.eld] : VEGGLITUR_3D));
              // Lituð rönd ofan á karminum: hurðirnar sjást líka beint ofan frá og þegar veggir eru gegnsæir.
              rendur.setMatrixAt(i, kassi(v, veggH + veggH * 0.012, veggH * 0.024, 0, 1.25));
              rendur.setColorAt(i, lit.setHex(v.eld ? ELDHURD_3D : HURDALITUR_3D));
              if (v.eld) fjoldi.brunahurdir++;
            });
            karmar.instanceMatrix.needsUpdate = true;
            rendur.instanceMatrix.needsUpdate = true;
            if (karmar.instanceColor) karmar.instanceColor.needsUpdate = true;
            if (rendur.instanceColor) rendur.instanceColor.needsUpdate = true;
            hopur.add(karmar, rendur);
            losa.push(rE);
          }

          // Tæki: líkan á næsta vegg (snýr út frá honum) + stöng, kúla og miði. Miðinn heldur stærð sinni á skjánum og
          // tæki sem standa þétt fá misháar stangir svo miðarnir leggist ekki hver ofan á annan.
          const rad = lengd * 0.012, naerri = lengd * 0.07;
          hd.taeki.forEach((t, nrT) => {
            fjoldi.taeki++;
            const fest = festaAVegg(hd.veggir, t.x, t.y, 1.6 * metri);
            const litur = new T.Color(t.litur || "#c93c1d");
            if (t.gerd) {
              const lk = taekjalikan(t.gerd, veggH, litur);
              lk.position.set(fest.x, 0, fest.y);
              lk.rotation.y = Math.atan2(fest.nx, fest.ny);
              hopur.add(lk);
              fjoldi.likon++;
            }
            let grannar = 0;
            for (let j = 0; j < nrT; j++) if (Math.hypot(hd.taeki[j].x - t.x, hd.taeki[j].y - t.y) < naerri) grannar++;
            const toppur = veggH * (1.55 + grannar * 0.85);
            const sG = new T.CylinderGeometry(rad * 0.1, rad * 0.1, toppur, 8), sE = new T.MeshLambertMaterial({ color: litur });
            const stong = new T.Mesh(sG, sE);
            stong.position.set(fest.x, toppur / 2, fest.y);
            hopur.add(stong);
            const kG2 = new T.SphereGeometry(rad * 0.7, 18, 12);
            const kE2 = new T.MeshLambertMaterial({ color: litur, emissive: litur, emissiveIntensity: 0.35 });
            const kula = new T.Mesh(kG2, kE2);
            kula.position.set(fest.x, toppur + rad, fest.y);
            hopur.add(kula);
            losa.push(sG, sE, kG2, kE2);
            skraut.push(stong, kula);
            const txt = String(t.texti || t.stutt || "").slice(0, 18);
            if (!txt) return;
            const letur = "700 34px system-ui,sans-serif";
            const ms = document.createElement("canvas");
            let mc = ms.getContext("2d");
            if (!mc) return;
            mc.font = letur;
            const tAkn = t.gerd ? 54 : 0;
            ms.width = Math.ceil(mc.measureText(txt).width) + 46 + tAkn;
            ms.height = 64;
            mc = ms.getContext("2d");
            if (!mc) return;
            const bw = ms.width - 4, bh = 60, rr = 16;
            mc.beginPath();
            mc.moveTo(2 + rr, 2);
            mc.arcTo(2 + bw, 2, 2 + bw, 2 + bh, rr);
            mc.arcTo(2 + bw, 2 + bh, 2, 2 + bh, rr);
            mc.arcTo(2, 2 + bh, 2, 2, rr);
            mc.arcTo(2, 2, 2 + bw, 2, rr);
            mc.closePath();
            mc.fillStyle = "#" + litur.getHexString();
            mc.fill();
            mc.lineWidth = 3;
            mc.strokeStyle = "rgba(255,255,255,.9)";
            mc.stroke();
            mc.fillStyle = litur.r * 0.299 + litur.g * 0.587 + litur.b * 0.114 > 0.62 ? "#14120f" : "#fff";
            mc.font = letur;
            mc.textAlign = "center";
            mc.textBaseline = "middle";
            mc.fillText(txt, (ms.width + tAkn) / 2 - (tAkn ? 4 : 0), 34);
            if (t.gerd) {
              mc.beginPath();
              mc.arc(33, 32, 25.5, 0, Math.PI * 2);
              mc.fillStyle = "#ffffff";
              mc.fill();
              mc.save();
              mc.translate(33 - 24 * 0.9, 32 - 24 * 0.9);
              mc.scale(0.9, 0.9);
              try {
                teiknaTaekistakn(mc, t.gerd);
              } catch {
                /* táknið er skraut — miðinn stendur án þess */
              }
              mc.restore();
            }
            const mA = new T.CanvasTexture(ms);
            const mE = new T.SpriteMaterial({ map: mA, depthTest: false, sizeAttenuation: false });
            const midi = new T.Sprite(mE);
            midi.center.set(0.5, -0.2);
            midi.renderOrder = 10;
            midi.position.set(fest.x, toppur + rad * 2, fest.y);
            hopur.add(midi);
            losa.push(mA, mE);
            midar.push({ midi, hlutfall: ms.width / ms.height });
            skraut.push(midi);
          });
          haedY += syna === "allar" ? veggH * 3.2 : 0;
        }

        // ── Myndavél á braut um miðju hússins: draga = snúa · hjól/klípa = aðdráttur · hægri/shift-draga = færa ──
        const fyrsta = valdar[0];
        const u0 = fyrsta.umfang;
        const efstaY = lag.length ? lag[lag.length - 1].hopur.position.y : 0;
        {
          const skC = document.createElement("canvas");
          skC.width = 256;
          skC.height = 256;
          const skx = skC.getContext("2d");
          if (skx) {
            const grd = skx.createRadialGradient(128, 128, 16, 128, 128, 128);
            grd.addColorStop(0, "rgba(40,36,30,0.2)");
            grd.addColorStop(1, "rgba(40,36,30,0)");
            skx.fillStyle = grd;
            skx.fillRect(0, 0, 256, 256);
          }
          const skT = new T.CanvasTexture(skC);
          const skG = new T.PlaneGeometry(husStaerst * 1.4, husStaerst * 1.4);
          const skE = new T.MeshBasicMaterial({ map: skT, transparent: true, depthWrite: false });
          const skuggi = new T.Mesh(skG, skE);
          skuggi.rotation.x = -Math.PI / 2;
          skuggi.position.set(u0 ? (u0.x0 + u0.x1) / 2 : 0, -Math.max(0.4, husStaerst * 0.004), u0 ? (u0.y0 + u0.y1) / 2 : 0);
          svid.add(skuggi);
          losa.push(skT, skG, skE);
        }
        const vel = new T.PerspectiveCamera(42, b / h, Math.max(0.01, husStaerst * 0.001), bladStaerst * 20 + efstaY * 6);
        const midjaY = syna === "allar" ? efstaY * 0.5 : 0;
        const mid = new T.Vector3(u0 ? (u0.x0 + u0.x1) / 2 : 0, midjaY, u0 ? (u0.y0 + u0.y1) / 2 : 0);
        const upphafsFjarl = () =>
          Math.max(husStaerst * 1.25, efstaY * 2.3) * (b < h * 1.5 ? Math.min(2.6, (1.5 * h) / Math.max(1, b)) : 1);
        let theta = YFIRLIT_THETA, phi = YFIRLIT_PHI, fjarl = upphafsFjarl();
        const stillaVel = () => {
          phi = Math.min(1.5, Math.max(0.12, phi));
          fjarl = Math.min(bladStaerst * 6 + efstaY * 2, Math.max(husStaerst * 0.06, fjarl));
          vel.position.set(
            mid.x + fjarl * Math.sin(phi) * Math.sin(theta),
            mid.y + fjarl * Math.cos(phi),
            mid.z + fjarl * Math.sin(phi) * Math.cos(theta)
          );
          vel.lookAt(mid);
        };
        const bendlar = new Map<number, { x: number; y: number; faera: boolean }>();
        let klipa = 0;
        const faera = (dx: number, dy: number) => {
          const haegri = new T.Vector3().setFromMatrixColumn(vel.matrix, 0);
          const fram = new T.Vector3().crossVectors(new T.Vector3(0, 1, 0), haegri);
          const kv = (fjarl / (canvas.clientHeight || 500)) * 1.1;
          // „fram" = frá myndavélinni eftir gólfinu: draga niður → teikningin fylgir músinni niður (383, Agnar 05.10.2026)
          mid.addScaledVector(haegri, -dx * kv).addScaledVector(fram, dy * kv);
        };

        // ── GÖNGUHAMUR (383): augu í 1,6 m hæð á einni hæð. Draga = líta í kring · hjól / W S / ↑ ↓ = ganga ·
        // A D / ← → = til hliðar · shift = hraðar · tvísmella á gólf = fara þangað · Esc = hætta (og ekkert annað).
        type Ganga = { lg: (typeof lag)[number]; metri: number; pos: Three; yaw: number; pitch: number; mork: { x0: number; x1: number; z0: number; z1: number } };
        let gongu: Ganga | null = null;
        const takkar: Record<string, boolean> = {};
        const att = { fram: 0, hlid: 0 };
        const gangaVel = () => {
          if (!gongu) return;
          const cp = Math.cos(gongu.pitch);
          vel.position.copy(gongu.pos);
          vel.lookAt(gongu.pos.x + Math.sin(gongu.yaw) * cp, gongu.pos.y + Math.sin(gongu.pitch), gongu.pos.z + Math.cos(gongu.yaw) * cp);
        };
        const gangaFaera = (fram: number, hlid: number) => {
          if (!gongu) return;
          const sy = Math.sin(gongu.yaw), cy = Math.cos(gongu.yaw);
          gongu.pos.x += sy * fram - cy * hlid;
          gongu.pos.z += cy * fram + sy * hlid;
          gongu.pos.x = Math.min(gongu.mork.x1, Math.max(gongu.mork.x0, gongu.pos.x));
          gongu.pos.z = Math.min(gongu.mork.z1, Math.max(gongu.mork.z0, gongu.pos.z));
        };
        const stillaMida = () => {
          // Miðar eru 29 px háir á skjánum óháð aðdrætti, gluggastærð og sjónhorni (sizeAttenuation: false).
          const hh = Math.max(200, el.clientHeight || 500);
          const mh = (29 * 2 * Math.tan(((vel.fov / 2) * Math.PI) / 180)) / hh;
          midar.forEach((o) => o.midi.scale.set(mh * o.hlutfall, mh, 1));
        };
        const gangaByrja = () => {
          const lg = lag[0];
          if (!lg) return false;
          const hp = lg.hopur.position, metri = lg.metri, u = lg.hd.umfang;
          const p = metri * 2;
          const mork = u
            ? { x0: u.x0 - p, x1: u.x1 + p, z0: u.y0 - p, z1: u.y1 + p }
            : { x0: lg.hd.golf.x0, x1: lg.hd.golf.x1, z0: lg.hd.golf.y0, z1: lg.hd.golf.y1 };
          const bx = mork.x1 - mork.x0, bz = mork.z1 - mork.z0;
          gongu = {
            lg,
            metri,
            pos: new T.Vector3((mork.x0 + mork.x1) / 2, hp.y + 1.6 * metri, (mork.z0 + mork.z1) / 2),
            yaw: bx >= bz ? Math.PI / 2 : 0, // eftir lengri ásnum
            pitch: 0,
            mork,
          };
          lag.forEach((o) => {
            const ein = o === lg;
            o.hopur.visible = ein;
            if (ein) {
              o.golfE.opacity = 1;
              o.golfE.transparent = false;
              o.golfE.depthWrite = true;
              o.golfE.needsUpdate = true;
            }
          });
          vel.fov = 70;
          vel.near = Math.max(0.01, metri * 0.05);
          vel.updateProjectionMatrix();
          stillaMida();
          gangaVel();
          return true;
        };
        const gangaHaetta = () => {
          if (!gongu) return;
          gongu = null;
          lag.forEach((o) => {
            o.hopur.visible = true;
            o.golfE.transparent = o.nr > 0;
            o.golfE.opacity = o.nr > 0 ? 0.42 : 1;
            o.golfE.depthWrite = o.nr === 0;
            o.golfE.needsUpdate = true;
          });
          vel.fov = 42;
          vel.near = Math.max(0.01, husStaerst * 0.001);
          vel.updateProjectionMatrix();
          stillaMida();
          stillaVel();
        };
        const ATT: Record<string, ["fram" | "hlid", number]> = {
          w: ["fram", 1], arrowup: ["fram", 1], s: ["fram", -1], arrowdown: ["fram", -1],
          d: ["hlid", 1], arrowright: ["hlid", 1], a: ["hlid", -1], arrowleft: ["hlid", -1],
        };
        // Lyklaborðið er gripið FREMST (capture á glugganum) á meðan 3D er opið: flýtilyklar borðsins undir (W = veggur,
        // A = ör, Delete = eyða …) mega ekki kvikna. Esc í gönguham hættir AÐEINS að ganga; annars lokar það 3D.
        const lykill = (e: KeyboardEvent, nidri: boolean) => {
          const tg = e.target as HTMLElement | null;
          const tag = tg?.tagName;
          if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tg?.isContentEditable) return;
          const k = String(e.key || "").toLowerCase();
          e.stopImmediatePropagation();
          if (k === "escape") {
            e.preventDefault();
            if (!nidri) return;
            if (gongu) {
              gangaHaetta();
              setGanga(false);
            } else loka.current();
            return;
          }
          if (!gongu) return;
          if (k === "shift") {
            takkar.hratt = nidri;
            return;
          }
          const a = ATT[k];
          if (!a) return;
          e.preventDefault();
          takkar[k] = nidri;
          att.fram = (takkar.w || takkar.arrowup ? 1 : 0) - (takkar.s || takkar.arrowdown ? 1 : 0);
          att.hlid = (takkar.d || takkar.arrowright ? 1 : 0) - (takkar.a || takkar.arrowleft ? 1 : 0);
        };
        const lykNidur = (e: KeyboardEvent) => lykill(e, true);
        const lykUpp = (e: KeyboardEvent) => lykill(e, false);
        window.addEventListener("keydown", lykNidur, true);
        window.addEventListener("keyup", lykUpp, true);

        const geisli = new T.Raycaster(), ndc = new T.Vector2();
        const tvismella = (e: MouseEvent) => {
          if (!gongu) return;
          const r = canvas.getBoundingClientRect();
          ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
          geisli.setFromCamera(ndc, vel);
          const golfY = gongu.pos.y - 1.6 * gongu.metri, pt = new T.Vector3();
          if (geisli.ray.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), -golfY), pt)) {
            gongu.pos.x = pt.x;
            gongu.pos.z = pt.z;
            gangaFaera(0, 0);
            gangaVel();
          }
        };
        const nidur = (e: PointerEvent) => {
          canvas.setPointerCapture(e.pointerId);
          bendlar.set(e.pointerId, { x: e.clientX, y: e.clientY, faera: e.button === 2 || e.shiftKey });
          canvas.style.cursor = "grabbing";
        };
        const hreyfa = (e: PointerEvent) => {
          const p = bendlar.get(e.pointerId);
          if (!p) return;
          const dx = e.clientX - p.x, dy = e.clientY - p.y;
          p.x = e.clientX;
          p.y = e.clientY;
          if (gongu) {
            if (bendlar.size >= 2) {
              const [a2, c2] = [...bendlar.values()];
              const nuna = Math.hypot(a2.x - c2.x, a2.y - c2.y);
              if (klipa) gangaFaera((nuna - klipa) * gongu.metri * 0.03, 0);
              klipa = nuna;
            } else {
              // gripið um heiminn, eins og snúningurinn: draga til hægri → litið til vinstri
              gongu.yaw += dx * 0.004;
              gongu.pitch = Math.max(-1.2, Math.min(1.2, gongu.pitch + dy * 0.004));
            }
            gangaVel();
            return;
          }
          if (bendlar.size >= 2) {
            const [a, c] = [...bendlar.values()];
            const nuna = Math.hypot(a.x - c.x, a.y - c.y);
            if (klipa) fjarl *= klipa / Math.max(1, nuna);
            klipa = nuna;
            faera(dx / 2, dy / 2);
          } else if (p.faera) faera(dx, dy);
          else {
            theta -= dx * 0.006;
            phi -= dy * 0.006;
          }
          stillaVel();
        };
        const upp = (e: PointerEvent) => {
          bendlar.delete(e.pointerId);
          klipa = 0;
          canvas.style.cursor = "grab";
        };
        const hjol = (e: WheelEvent) => {
          e.preventDefault();
          if (gongu) {
            gangaFaera((e.deltaY < 0 ? 1 : -1) * 0.8 * gongu.metri, 0);
            gangaVel();
            return;
          }
          fjarl *= e.deltaY > 0 ? 1.12 : 0.89;
          stillaVel();
        };
        const samhengi = (e: Event) => e.preventDefault();
        canvas.addEventListener("pointerdown", nidur);
        canvas.addEventListener("pointermove", hreyfa);
        canvas.addEventListener("pointerup", upp);
        canvas.addEventListener("pointercancel", upp);
        canvas.addEventListener("wheel", hjol, { passive: false });
        canvas.addEventListener("contextmenu", samhengi);
        canvas.addEventListener("dblclick", tvismella);
        const staerd = () => {
          const w2 = el.clientWidth || 800, h2 = el.clientHeight || 500;
          teiknari.setSize(w2, h2);
          vel.aspect = w2 / h2;
          vel.updateProjectionMatrix();
          stillaMida();
        };
        window.addEventListener("resize", staerd);
        stillaMida();
        stillaVel();

        const gegnsaett = (a: boolean) => {
          veggEfni.forEach((e) => {
            e.transparent = a;
            e.opacity = a ? 0.4 : 1;
            e.depthWrite = !a;
            e.color.setHex(e.userData.toppur ? (a ? 0x8a847a : TOPPLITUR_3D) : a ? 0xb4b0a8 : 0xffffff);
            e.needsUpdate = true;
          });
          sporM.forEach((o) => {
            o.visible = a;
          });
        };
        gegnsaett(gegnRef.current);
        const synaKynningu = (a: boolean) => {
          skraut.forEach((o) => {
            o.visible = !a;
          });
          if (a && !gongu) {
            theta = YFIRLIT_THETA;
            phi = YFIRLIT_PHI;
            fjarl = upphafsFjarl();
            stillaVel();
          }
        };
        synaKynningu(kynningRef.current);
        handfang.current = {
          gegnsaett,
          ganga: (a) => {
            if (a) return gangaByrja();
            gangaHaetta();
            return false;
          },
          kynning: synaKynningu,
          vista: () => {
            teiknari.render(svid, vel);
            return canvas;
          },
          stada: () => ({
            ganga: !!gongu,
            x: vel.position.x,
            y: vel.position.y,
            z: vel.position.z,
            fov: vel.fov,
            metri: gongu ? gongu.metri : null,
          }),
        };

        let raf = 0;
        let sidast = performance.now();
        const lykkja = () => {
          if (!lifir) return;
          const nu = performance.now(), dt = Math.min(0.1, (nu - sidast) / 1000);
          sidast = nu;
          if (gongu) {
            if (att.fram || att.hlid) {
              const v = 1.6 * gongu.metri * dt * (takkar.hratt ? 2.5 : 1);
              gangaFaera(att.fram * v, att.hlid * v);
            }
            gangaVel();
          }
          teiknari.render(svid, vel);
          raf = requestAnimationFrame(lykkja);
        };
        lykkja();
        el.dataset.hus3d = JSON.stringify({
          haedir: valdar.length,
          kvardi: kvValdra.map((k) => (k ? { dilar: +k.dilar.toFixed(3), heimild: k.heimild } : null)),
          veggH: lag.map((l) => +l.veggH.toFixed(2)),
          ...fjoldi,
        });
        setHledst(false);
        hreinsa = () => {
          cancelAnimationFrame(raf);
          window.removeEventListener("resize", staerd);
          window.removeEventListener("keydown", lykNidur, true);
          window.removeEventListener("keyup", lykUpp, true);
          handfang.current = null;
          for (const x of losa) {
            try {
              x.dispose();
            } catch {
              /* þegar losað */
            }
          }
          teiknari.dispose();
          teiknari.forceContextLoss?.();
          canvas.remove();
        };
      } catch (err) {
        setVilla(err instanceof Error ? err.message : "3D mistókst");
      }
    })();
    return () => {
      lifir = false;
      hreinsa();
    };
  }, [haedir, syna, teikningAGolfi, kvardar]);

  // Esc áður en sviðið er tilbúið (three.js eða kvarðinn á leiðinni) lokar líka — sviðið tekur við þegar það kemur.
  useEffect(() => {
    if (!hledst && !villa) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", esc, true);
    return () => window.removeEventListener("keydown", esc, true);
  }, [hledst, villa, onClose]);

  useEffect(() => {
    handfang.current?.gegnsaett(gegn);
  }, [gegn]);

  useEffect(() => {
    handfang.current?.kynning(kynning);
  }, [kynning]);

  // Staða myndavélarinnar fyrir prófanir (tools/turbopaint-3d.cjs) — aðeins lesin, breytir engu.
  useEffect(() => {
    const w = window as unknown as { __hus3dStada?: () => ReturnType<Handfang["stada"]> | null };
    w.__hus3dStada = () => handfang.current?.stada() ?? null;
    return () => {
      delete w.__hus3dStada;
    };
  }, []);

  const veggjaFjoldi = haedir.reduce((s, h) => s + h.veggir.length, 0);
  const taekjaFjoldi = haedir.reduce((s, h) => s + h.taeki.length, 0);
  const synHaedir = syna === "allar" ? haedir : haedir[syna] ? [haedir[syna]] : [];
  const haedNafn =
    syna === "allar" && haedir.length > 1
      ? `${haedir.length} hæðir`
      : synHaedir[0] && haedarNumer(synHaedir[0].nafn) != null
        ? synHaedir[0].nafn
        : "";
  const kynningTitill = kynningarTitill(skodunTitill || gogn?.nafn || bordNafn, haedNafn);
  const kynningLykill = kynningarLykill(synHaedir.flatMap((h) => h.taeki));
  const kynningUndir = [gogn?.nafn && gogn.nafn !== kynningTitill ? gogn.nafn : "", kynningarDags()].filter(Boolean).join(" · ");
  const takki = "rounded-md px-2.5 py-1 text-[12px] font-semibold transition-colors";
  const virkur = "bg-[#FE653F] text-white";
  const ovirkur = "bg-white/10 hover:bg-white/20";
  const synd = syna === "allar" ? haedir.map((_, i) => i) : [syna];
  const kvTexti = kvardar
    ? [...new Set(synd.map((i) => kvardar[i]).map((k) => (k ? KVARDA_TEXTI[k.heimild] : "hlutfall af teikningu (enginn kvarði)")))].join(" · ")
    : "les kvarða…";

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#14120f]" role="dialog" aria-label="Hús í þrívídd">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2 text-stone-100">
        <span className="mr-2 text-[13px] font-bold">Hús í 3D</span>
        <button type="button" className={`${takki} ${syna === "allar" ? virkur : ovirkur}`} onClick={() => setSyna("allar")}>
          Allar hæðir
        </button>
        {haedir.map((h, i) => (
          <button
            key={h.plan.id}
            type="button"
            title={h.nafn}
            className={`${takki} ${syna === i ? virkur : ovirkur}`}
            onClick={() => setSyna(i)}
          >
            {i + 1}
          </button>
        ))}
        <label className="ml-2 flex items-center gap-1.5 text-[12px]">
          <input type="checkbox" checked={teikningAGolfi} onChange={(e) => setTeikningAGolfi(e.target.checked)} />
          Teikning á gólfi
        </label>
        <button
          type="button"
          aria-pressed={ganga}
          title="Ganga um hæðina í augnhæð (1,6 m) — draga = líta í kring, hjól / W S = ganga, A D = til hliðar, tvísmella á gólf = fara þangað, Esc = hætta"
          className={`${takki} ${ganga ? virkur : ovirkur}`}
          onClick={() => {
            const h = handfang.current;
            if (!h) return;
            if (ganga) {
              h.ganga(false);
              setGanga(false);
            } else setGanga(h.ganga(true));
          }}
        >
          Ganga
        </button>
        <button
          type="button"
          aria-pressed={gegn}
          title="Gera veggina gegnsæja svo tækin og teikningin sjáist í gegnum húsið"
          className={`${takki} ${gegn ? virkur : ovirkur}`}
          onClick={() => setGegn((g) => !g)}
        >
          Gegnsætt
        </button>
        <button
          type="button"
          aria-pressed={kynning}
          title="Kynning: fela miða á stöngum, sýna lykil og titil — tilbúið fyrir viðskiptavin"
          className={`${takki} ${kynning ? virkur : ovirkur}`}
          onClick={() => setKynning((k) => !k)}
        >
          Kynning
        </button>
        <button
          type="button"
          title="Vista 3D-myndina sem blað með heiti staðar og tækjalykli"
          className={`${takki} ${ovirkur}`}
          onClick={() => {
            const mynd = handfang.current?.vista();
            if (!mynd) return;
            const blad = teiknaKynningarblad({
              mynd,
              titill: kynningTitill,
              undirtitill: kynningUndir,
              lykill: kynningLykill,
            });
            saekjaKynningarMynd(blad, kynningarSkrarnafn(kynningTitill));
          }}
        >
          Vista mynd
        </button>
        <span className="ml-auto text-[11.5px] text-stone-400">
          {ganga
            ? "Ganga: draga = líta í kring · hjól / W S / ↑ ↓ = áfram og aftur · A D / ← → = til hliðar · shift = hraðar · tvísmella á gólf = fara þangað · Esc = hætta"
            : `${veggjaFjoldi} veggbútar · ${taekjaFjoldi} tæki · lofthæð ${VEGGHAED_M.toFixed(1).replace(".", ",")} m (${kvTexti}) · draga = snúa · hægri-draga = færa · hjól = nær/fjær`}
        </span>
        <button
          type="button"
          aria-label="Loka 3D"
          className="rounded-md p-1.5 text-stone-300 hover:bg-white/10 hover:text-white"
          onClick={onClose}
        >
          <X className="size-4" />
        </button>
      </div>
      <div ref={gamur} className="relative min-h-0 flex-1">
        {!haedir.length ? (
          <p className="p-6 text-sm text-stone-300">Engin teikning á borðinu — flyttu inn teikningu og greindu veggina fyrst.</p>
        ) : null}
        {haedir.length && !veggjaFjoldi ? (
          <p className="pointer-events-none absolute left-3 top-3 z-10 rounded bg-black/60 px-2 py-1 text-[12px] text-stone-200">
            Engir veggir enn — ýttu á „Veggir“ til að greina þá úr teikningunni
          </p>
        ) : null}
        {hledst && haedir.length && !villa ? (
          <p className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-stone-500">Byggi húsið…</p>
        ) : null}
        {villa ? <p className="p-6 text-sm text-red-300">{villa}</p> : null}
        {kynning && !hledst && !villa ? (
          <div className="pointer-events-none absolute inset-0 z-10 p-4 text-[#1a1814]">
            <div className="max-w-md rounded-lg bg-[#f3efe6]/92 px-4 py-3 shadow-sm ring-1 ring-black/10">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#5c574f]">
                Slökkvitæki ehf · Brunavarnir
              </p>
              <h2 className="mt-1 text-[20px] font-extrabold leading-tight">{kynningTitill}</h2>
              <p className="mt-1 text-[12px] font-semibold text-[#5c574f]">{kynningUndir}</p>
            </div>
            {kynningLykill.length > 0 ? (
              <div className="absolute bottom-4 left-4 min-w-[200px] rounded-lg bg-[#f3efe6]/92 px-3 py-2.5 shadow-sm ring-1 ring-black/10">
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#5c574f]">Tæki á teikningu</p>
                <ul className="space-y-0.5 text-[12.5px] font-semibold">
                  {kynningLykill.map((lid) => (
                    <li key={lid.heiti} className="flex justify-between gap-6">
                      <span>{lid.heiti}</span>
                      <span className="tabular-nums text-[#5c574f]">{lid.fjoldi}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
