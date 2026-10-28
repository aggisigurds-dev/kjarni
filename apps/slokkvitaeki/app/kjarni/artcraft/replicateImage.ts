/** Shrink a user-uploaded image to a data URL that fits inside Vercel's
 * ~4.5 MB serverless function body limit.
 *
 * Phone photos are routinely 5–10 MB JPEG; base64-encoded they are ~1.33×
 * that — enough to blow past the limit before Replicate even sees the
 * request. Everything that uploads a photo to a Replicate route should
 * route through this helper rather than `FileReader.readAsDataURL(file)`
 * (sem sendir allt óbreytt).
 *
 * `maxDim` er lengsta hliðin eftir skölun. Myndir sem eru nú þegar undir
 * markinu haldast óbreyttar nema `forceReencode` sé true (gagnlegt þegar
 * PNG-ar fara yfir þar sem JPEG-breyting nær þeim niður).
 *
 * Default MIME er JPEG + 0.92 quality — passar sjónrænt vel og endar oftast
 * nær 1.5–2.5 MB á 1024px myndum. Fyrir upscale sem þarf hámarksgæði er
 * hægt að velja PNG. */

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Gat ekki opnað myndina"));
    img.src = src;
  });
}

export type ShrinkOptions = {
  maxDim: number;
  mime?: "image/jpeg" | "image/png" | "image/webp";
  quality?: number; // 0..1, aðeins fyrir jpeg/webp
  forceReencode?: boolean;
};

export type ShrinkResult = {
  dataUrl: string;
  width: number;
  height: number;
  bytes: number; // áætlað base64-stærð
  shrunken: boolean; // satt ef við þurftum að skala
};

/** 4.5 MB * 0.9 öryggismörk, m.v. að JSON-pakkinn hefur fleiri reiti en bara myndina. */
export const MAX_UPLOAD_BYTES = 4_000_000;

function dataUrlBytes(dataUrl: string): number {
  // base64 → bytes: lengd efnis * 0.75 - padding
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return dataUrl.length;
  const body = dataUrl.slice(comma + 1);
  const padding = body.endsWith("==") ? 2 : body.endsWith("=") ? 1 : 0;
  return Math.floor((body.length * 3) / 4) - padding;
}

export async function shrinkImageForUpload(file: File, opts: ShrinkOptions): Promise<ShrinkResult> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const longest = Math.max(w, h);
    const scale = Math.min(1, opts.maxDim / longest);
    const needsResize = scale < 1;
    const mime = opts.mime ?? "image/jpeg";
    const quality = opts.quality ?? 0.92;

    // Ef myndin er nú þegar nógu lítil og við þurfum ekki að endurkóða,
    // notum við upprunalegu bætin til að forðast JPEG-tap á PNG-um.
    if (!needsResize && !opts.forceReencode && file.size < MAX_UPLOAD_BYTES) {
      const original = await fileToDataUrl(file);
      return { dataUrl: original, width: w, height: h, bytes: file.size, shrunken: false };
    }

    const tw = Math.round(w * scale);
    const th = Math.round(h * scale);
    const canvas = document.createElement("canvas");
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Gat ekki búið til canvas fyrir skölun");
    ctx.drawImage(img, 0, 0, tw, th);
    let dataUrl = canvas.toDataURL(mime, quality);
    let bytes = dataUrlBytes(dataUrl);

    // Reyna aftur með lægri gæðum ef JPEG er enn of stór — algeng ástæða er
    // mjög stór upprunamynd sem skilaði stórum data URL þrátt fyrir skölun.
    if (bytes > MAX_UPLOAD_BYTES && (mime === "image/jpeg" || mime === "image/webp")) {
      for (const q of [0.85, 0.78, 0.7, 0.6]) {
        dataUrl = canvas.toDataURL(mime, q);
        bytes = dataUrlBytes(dataUrl);
        if (bytes <= MAX_UPLOAD_BYTES) break;
      }
    }

    return { dataUrl, width: tw, height: th, bytes, shrunken: true };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Gat ekki lesið mynd"));
    reader.readAsDataURL(file);
  });
}
