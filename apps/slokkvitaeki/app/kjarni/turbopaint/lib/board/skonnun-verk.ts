// Vinnuþráður skarprar skönnunar (lib/board/skonnun.ts): afkóðun TIF-frumritsins (~0,3 s á 35 MP), sýnataka fyrir val
// snúnings, skurður reita fyrir hliðrunarmælingu og endursýnataka í ramma JPEG-sins — allt utan aðalþráðarins svo
// TurboPaint frjósi ekki (síminn „stoppaði á miðri leið" þegar 9k TIF var afþjappað á aðalþræðinum). Þráðurinn geymir
// aðeins síðustu teikninguna (hrá gögn, ~1 bæti á díl í litaspjaldi) og er drepinn eftir hverja skönnun.

import * as UTIF from "utif";
import { birtStaerd, lesari, lesariBirt, synishornTif, teiknaIRamma, type Lesari, type TifIfd } from "./skonnun-kjarni";

type Skilabod =
  | { id: number; cmd: "saekja"; buf: ArrayBuffer }
  | { id: number; cmd: "syni"; n: number; c: { o: number }[] }
  | { id: number; cmd: "skera"; o: number; x: number; y: number; w: number; h: number }
  | {
      id: number;
      cmd: "teikna";
      o: number;
      w: number;
      h: number;
      frum: { b: number; h: number };
      vorpun: { kpx: number; kpy: number; fx: number; fy: number };
    };

const svid = self as unknown as {
  onmessage: ((e: MessageEvent<Skilabod>) => void) | null;
  postMessage: (m: unknown, flutt?: Transferable[]) => void;
};

let M: { les: Lesari; W: number; H: number; o: number } | null = null;

function birt(o: number): { les: Lesari; dW: number; dH: number } {
  if (!M) throw new Error("Engin teikning í vinnuþræðinum");
  const { dW, dH } = birtStaerd(o, M.W, M.H);
  return { les: lesariBirt(M.les, o, M.W, M.H), dW, dH };
}

svid.onmessage = (e) => {
  const q = e.data;
  try {
    if (q.cmd === "saekja") {
      M = null;
      const ifds = (UTIF.decode(q.buf) as unknown as (TifIfd & { t256?: number[]; t257?: number[] })[])
        .filter((f) => f.t256 && f.t257)
        .sort((a, c) => c.t256![0] * c.t257![0] - a.t256![0] * a.t257![0]);
      if (!ifds.length) throw new Error("Engin mynd í TIF-skránni");
      const f = ifds[0];
      UTIF.decodeImage(q.buf, f as unknown as UTIF.IFD);
      if (!f.width || !f.height || !f.data) throw new Error("TIF-myndin afkóðaðist ekki");
      const les = lesari(f, () => UTIF.toRGBA8(f as unknown as UTIF.IFD) as unknown as Uint8Array);
      M = { les, W: f.width, H: f.height, o: f.t274 ? f.t274[0] : 1 };
      svid.postMessage({ id: q.id, W: M.W, H: M.H, o: M.o, bps: f.t258?.[0] ?? null, ip: f.t262?.[0] ?? null });
      return;
    }
    if (q.cmd === "syni") {
      const ut = q.c.map((c) => {
        const b = birt(c.o);
        return synishornTif(b.les, b.dW, b.dH, { x: 0, y: 0, w: b.dW, h: b.dH }, q.n);
      });
      svid.postMessage({ id: q.id, ut }, ut.map((a) => a.buffer));
      return;
    }
    if (q.cmd === "skera") {
      const b = birt(q.o);
      const px = new Uint32Array(q.w * q.h);
      for (let y = 0; y < q.h; y++) {
        for (let x = 0; x < q.w; x++) {
          const sx = q.x + x, sy = q.y + y;
          px[y * q.w + x] = (sx < 0 || sy < 0 || sx >= b.dW || sy >= b.dH ? 0xffffff : b.les(sx, sy)) | 0xff000000;
        }
      }
      svid.postMessage({ id: q.id, w: q.w, h: q.h, px: px.buffer }, [px.buffer]);
      return;
    }
    if (q.cmd === "teikna") {
      const b = birt(q.o);
      const px = teiknaIRamma(b.les, b.dW, b.dH, { w: q.w, h: q.h }, q.frum, q.vorpun, (hl) =>
        svid.postMessage({ id: q.id, framvinda: hl })
      );
      M = null; // frumritið þarf ekki meir — losar ~35–70 MB
      svid.postMessage({ id: q.id, w: q.w, h: q.h, px: px.buffer }, [px.buffer]);
      return;
    }
  } catch (x) {
    svid.postMessage({ id: q.id, villa: x instanceof Error ? x.message : String(x) });
  }
};
