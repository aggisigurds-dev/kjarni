import type { TaekjaGerd } from "./hus3d";
import { kynningarDags, type KynningarLidur } from "./hus3d-kynning";
import { teiknaTaekistakn } from "./hus3d-takn";

function teiknaLykilikon(c: CanvasRenderingContext2D, gerd: TaekjaGerd | null, x: number, y: number, s = 28) {
  c.save();
  c.beginPath();
  c.roundRect(x, y, s, s, 6);
  c.fillStyle = "#fff";
  c.fill();
  c.strokeStyle = "rgba(26,24,20,0.12)";
  c.lineWidth = 1;
  c.stroke();
  if (gerd) {
    c.translate(x + (s - 48 * (s / 48)) / 2, y + (s - 48 * (s / 48)) / 2);
    c.scale(s / 48, s / 48);
    teiknaTaekistakn(c, gerd);
  } else {
    c.fillStyle = "#8a847a";
    c.beginPath();
    c.arc(x + s / 2, y + s / 2, s * 0.18, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

/** Blað utan um 3D-myndina — titill, lykill, dagsetning. Staðsetningar tækja breytast ekki. */
export function teiknaKynningarblad(opts: {
  mynd: CanvasImageSource;
  titill: string;
  undirtitill?: string;
  dags?: string;
  lykill: readonly KynningarLidur[];
  breidd?: number;
  haed?: number;
}): HTMLCanvasElement {
  const W = opts.breidd ?? 2400;
  const H = opts.haed ?? 1600;
  const dags = opts.dags ?? kynningarDags();
  const blad = document.createElement("canvas");
  blad.width = W;
  blad.height = H;
  const c = blad.getContext("2d");
  if (!c) return blad;

  c.fillStyle = "#f3efe6";
  c.fillRect(0, 0, W, H);
  c.fillStyle = "#1a1814";
  c.fillRect(0, 0, W, 8);
  c.fillStyle = "#c0271c";
  c.fillRect(0, 8, 18, H - 8);

  c.fillStyle = "#1a1814";
  c.font = "700 18px system-ui, sans-serif";
  c.fillText("SLÖKKVITÆKI EHF  ·  BRUNAVARNIR", 56, 56);
  c.font = "800 44px system-ui, sans-serif";
  c.fillText(opts.titill, 56, 112);
  c.fillStyle = "#5c574f";
  c.font = "600 20px system-ui, sans-serif";
  c.fillText([opts.undirtitill, dags].filter(Boolean).join("  ·  "), 56, 146);

  const lykilW = opts.lykill.length ? 360 : 0;
  const myndX = 56;
  const myndY = 176;
  const myndW = W - 56 - 48 - lykilW;
  const myndH = H - myndY - 72;
  c.fillStyle = "#fff";
  c.fillRect(myndX, myndY, myndW, myndH);
  const mw = "width" in opts.mynd ? Number(opts.mynd.width) : myndW;
  const mh = "height" in opts.mynd ? Number(opts.mynd.height) : myndH;
  const s = Math.min(myndW / Math.max(1, mw), myndH / Math.max(1, mh));
  const dw = mw * s;
  const dh = mh * s;
  c.drawImage(opts.mynd, myndX + (myndW - dw) / 2, myndY + (myndH - dh) / 2, dw, dh);
  c.strokeStyle = "rgba(26,24,20,0.08)";
  c.strokeRect(myndX + 0.5, myndY + 0.5, myndW - 1, myndH - 1);

  if (lykilW) {
    const lx = W - 40 - lykilW + 24;
    let ly = myndY + 8;
    c.fillStyle = "#1a1814";
    c.font = "700 16px system-ui, sans-serif";
    c.fillText("TÆKI Á TEIKNINGU", lx, ly);
    ly += 28;
    for (const lid of opts.lykill) {
      teiknaLykilikon(c, lid.gerd, lx, ly, 32);
      c.fillStyle = "#1a1814";
      c.font = "600 18px system-ui, sans-serif";
      c.fillText(lid.heiti, lx + 44, ly + 14);
      c.fillStyle = "#5c574f";
      c.font = "700 18px ui-monospace, monospace";
      c.fillText(String(lid.fjoldi), lx + 44, ly + 34);
      ly += 52;
    }
  }

  c.fillStyle = "#8a847a";
  c.font = "600 14px system-ui, sans-serif";
  c.fillText("TurboPaint  ·  staðsetningar óbreyttar  ·  Slökkvitæki ehf", 56, H - 28);
  return blad;
}

export function saekjaKynningarMynd(blad: HTMLCanvasElement, nafn: string) {
  const a = document.createElement("a");
  a.href = blad.toDataURL("image/png");
  a.download = nafn;
  a.click();
}
