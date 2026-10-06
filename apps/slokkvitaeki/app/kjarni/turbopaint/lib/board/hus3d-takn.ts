// Tákn tækis á miðanum í 3D — 383 teiknaTaekistakn fluttur óbreyttur (Agnar 04.10.2026 sendi 🧯, 🔔 og mynd af rauðu
// slöngukefli með stút: tákn í þeim stíl, í lit, svo tegundin sjáist án þess að lesa). Teiknað í 48 × 48 reit með
// upphaf efst til vinstri.

import type { TaekjaGerd } from "./hus3d";

export function teiknaTaekistakn(c: CanvasRenderingContext2D, gerd: TaekjaGerd) {
  const fy = (l: string) => {
    c.fillStyle = l;
    c.fill();
  };
  const st = (l: string, w: number) => {
    c.strokeStyle = l;
    c.lineWidth = w;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.stroke();
  };
  const rr = (x: number, y: number, w: number, h: number, r: number) => {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  };
  const RAUTT = "#e53935", DOKKT = "#263238";
  if (gerd === "slanga") {
    // slöngukefli: rauð spóla, hvít nöf með slá, slanga niður og stútur
    c.beginPath(); c.moveTo(10.5, 21); c.lineTo(10.5, 35); st(RAUTT, 6);
    c.beginPath(); c.arc(27, 21, 16.5, 0, Math.PI * 2); st(RAUTT, 6);
    c.beginPath(); c.arc(27, 21, 9.5, 0, Math.PI * 2); st(RAUTT, 5);
    c.beginPath(); c.arc(27, 21, 5, 0, Math.PI * 2); fy("#ffffff"); st(DOKKT, 1.4);
    rr(20.5, 19.4, 13, 3.2, 1.5); fy("#cfd8dc"); st(DOKKT, 1);
    rr(6.5, 34.5, 8, 3.2, 1); fy("#eceff1"); st(DOKKT, 1);
    c.beginPath(); c.moveTo(7.6, 38); c.lineTo(13.4, 38); c.lineTo(12, 46); c.lineTo(9, 46); c.closePath(); fy("#37474f");
  } else if (gerd === "reykskynjari") {
    // reykskynjari: rauð skífa við loft, reykur undir
    c.beginPath(); c.moveTo(5, 19); c.lineTo(5, 14); c.quadraticCurveTo(24, 2, 43, 14); c.lineTo(43, 19); c.quadraticCurveTo(24, 10, 5, 19); c.closePath(); fy(RAUTT);
    c.beginPath(); c.moveTo(6.5, 21.5); c.quadraticCurveTo(24, 12.5, 41.5, 21.5); c.lineTo(37, 27); c.quadraticCurveTo(24, 20, 11, 27); c.closePath(); fy(RAUTT);
    c.beginPath(); c.ellipse(24, 28.5, 11.5, 5.2, 0, 0, Math.PI * 2); fy(RAUTT);
    c.beginPath(); c.ellipse(24, 28.5, 5, 2, 0, 0, Math.PI * 2); st("#ffffff", 1.2);
    for (const dx of [-5.5, 0, 5.5]) {
      c.beginPath(); c.moveTo(24 + dx, dx ? 37.5 : 36); c.quadraticCurveTo(21 + dx, 39.5, 24 + dx, 41.5); c.quadraticCurveTo(27 + dx, 43.5, 24 + dx, 47); st(RAUTT, 2);
    }
  } else if (gerd === "hitaskynjari") {
    // hitaskynjari: grár skynjari við loft, hitastjarna, hitamælir og bylgjur
    rr(11, 3.5, 26, 6, 3); fy("#9e9e9e");
    rr(11, 7, 26, 5, 1.5); fy("#333333");
    c.beginPath(); c.moveTo(12, 12); c.lineTo(36, 12); c.lineTo(32, 19); c.lineTo(16, 19); c.closePath(); fy("#9e9e9e");
    c.beginPath(); c.ellipse(24, 19.5, 6.5, 3.6, 0, 0, Math.PI * 2); fy("#333333");
    c.beginPath();
    for (let i = 0; i < 16; i++) {
      const r0 = i % 2 ? 3.4 : 9, h0 = (i * Math.PI) / 8 - Math.PI / 2, x = 21 + Math.cos(h0) * r0, y = 35.5 + Math.sin(h0) * r0;
      if (i) c.lineTo(x, y);
      else c.moveTo(x, y);
    }
    c.closePath(); fy("#f9d976");
    c.beginPath(); c.arc(22, 35.5, 12.2, Math.PI * 0.78, Math.PI * 1.22); st("#757575", 1.5);
    c.beginPath(); c.arc(27, 35.5, 12.2, -Math.PI * 0.22, Math.PI * 0.22); st("#757575", 1.5);
    rr(29, 26.5, 4.4, 15, 2.2); fy("#b0bec5"); st("#78909c", 0.8);
    c.beginPath(); c.arc(31.2, 42.2, 3.6, 0, Math.PI * 2); fy("#b0bec5"); st("#78909c", 0.8);
    c.beginPath(); c.rect(30.5, 31.5, 1.4, 9.5); fy("#d32f2f");
    c.beginPath(); c.arc(31.2, 42.2, 2.2, 0, Math.PI * 2); fy("#d32f2f");
  } else if (gerd === "segull") {
    // segulloki á eldvarnarhurð: skeifusegull á ská, ljósir pólar, tvær eldingar
    c.save(); c.translate(24, 22); c.rotate(-Math.PI / 4); c.translate(-24, -22);
    c.beginPath(); c.moveTo(14.5, 33); c.lineTo(14.5, 19); c.arc(24, 19, 9.5, Math.PI, 0); c.lineTo(33.5, 33);
    c.strokeStyle = RAUTT; c.lineWidth = 8.5; c.lineCap = "butt"; c.lineJoin = "round"; c.stroke();
    c.beginPath(); c.rect(10.2, 28.5, 8.6, 5.5); fy("#eceff1"); c.strokeStyle = DOKKT; c.lineWidth = 1; c.stroke();
    c.beginPath(); c.rect(29.2, 28.5, 8.6, 5.5); fy("#eceff1"); c.strokeStyle = DOKKT; c.lineWidth = 1; c.stroke();
    c.restore();
    for (const o of [[25, 33], [35.5, 22.5]]) {
      c.beginPath(); c.moveTo(o[0], o[1]); c.lineTo(o[0] + 4.6, o[1] + 5.2); c.lineTo(o[0] + 2.6, o[1] + 6); c.lineTo(o[0] + 7.4, o[1] + 12); c.lineTo(o[0] + 0.8, o[1] + 7.6); c.lineTo(o[0] + 2.8, o[1] + 6.6); c.closePath(); fy("#f6c431");
    }
  } else if (gerd === "bjalla") {
    // viðvörunarbjalla: rauð bjalla á fæti með kólfi
    c.beginPath(); c.moveTo(33, 38); c.quadraticCurveTo(43.5, 33, 43.5, 23); st("#b71c1c", 2);
    c.beginPath(); c.arc(43.5, 20.5, 3.4, 0, Math.PI * 2); fy(RAUTT);
    c.beginPath(); c.rect(19, 29, 10, 8); fy(DOKKT);
    c.beginPath(); c.arc(24, 18, 15, 0, Math.PI * 2); fy("#d32f2f"); st("#b71c1c", 1.6);
    c.beginPath(); c.arc(24, 18, 8.5, 0, Math.PI * 2); fy("#ef5350");
    c.beginPath(); c.arc(24, 18, 11.6, Math.PI * 1.05, Math.PI * 1.45); st("rgba(255,255,255,.75)", 1.8);
    c.beginPath(); c.arc(24, 18, 3.2, 0, Math.PI * 2); fy("#cfd8dc"); st("#b71c1c", 1);
    rr(11, 35.5, 26, 7, 2.5); fy("#c62828");
    rr(9, 42, 30, 4, 2); fy(DOKKT);
  } else if (gerd === "rafmagn") {
    // rafmagnstafla: grár skápur með lömum, gul elding, lás, miði og strengir
    for (const x of [14, 19, 24, 33]) { c.beginPath(); c.rect(x, 40, 2.6, 6.5); fy("#424242"); }
    rr(8, 5, 32, 36, 4); fy("#8e8e8e");
    rr(10.5, 7.5, 27, 31, 2.5); fy("#bdbdbd");
    rr(6.2, 12, 3.2, 7, 1.2); fy("#7a7a7a"); rr(6.2, 27, 3.2, 7, 1.2); fy("#7a7a7a");
    c.beginPath(); c.moveTo(27.5, 12); c.lineTo(18.5, 23.5); c.lineTo(23.6, 23.5); c.lineTo(19.5, 33.5); c.lineTo(30, 20.5); c.lineTo(24.6, 20.5); c.closePath(); fy("#f6c431");
    c.beginPath(); c.arc(34, 23, 1.6, 0, Math.PI * 2); fy("#7a7a7a");
    rr(29, 32.5, 7, 4, 0.6); fy("#f5f5f5");
  } else if (gerd === "skilti-ut") {
    // útgönguskilti: grænt með ör
    rr(7, 11, 34, 26, 4); fy("#2e7d32");
    c.beginPath(); c.moveTo(14, 24); c.lineTo(32, 24); c.moveTo(26, 17.5); c.lineTo(33, 24); c.lineTo(26, 30.5); st("#ffffff", 3);
  } else if (gerd === "skilti") {
    // skilti: rauð plata með hvítum ramma
    rr(9, 9, 30, 30, 4); fy(RAUTT);
    rr(13, 13, 22, 22, 2); st("#ffffff", 2.2);
    rr(21, 19, 6, 11, 1.5); fy("#ffffff");
  } else if (gerd === "teppi") {
    // eldvarnarteppi: rauður kassi með tveimur flipum
    rr(12, 7, 24, 30, 3); fy(RAUTT);
    rr(15, 37, 5, 8, 1); fy(DOKKT); rr(28, 37, 5, 8, 1); fy(DOKKT);
    rr(15, 12, 18, 4, 1); fy("#ffffff");
  } else {
    // handslökkvitæki: rauður kútur, svartur haus, handfang og slanga
    c.beginPath(); c.moveTo(29, 12); c.quadraticCurveTo(39, 11, 39, 20); c.lineTo(39, 30); st(DOKKT, 2.6);
    rr(16, 15, 16, 30, 5); fy(RAUTT);
    c.beginPath(); c.rect(16, 26, 16, 7); fy("#ffffff");
    rr(20.5, 8.5, 7, 7.5, 1.2); fy(DOKKT);
    c.beginPath(); c.moveTo(19, 8); c.lineTo(32, 5); st(DOKKT, 3);
    if (gerd === "co2") {
      c.beginPath(); c.moveTo(36, 29); c.lineTo(42, 29); c.lineTo(44.5, 40); c.lineTo(33.5, 40); c.closePath(); fy(DOKKT);
    } else {
      c.beginPath(); c.moveTo(36.6, 30); c.lineTo(41.4, 30); c.lineTo(39, 35.5); c.closePath(); fy(DOKKT);
    }
  }
}
