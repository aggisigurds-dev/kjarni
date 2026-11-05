/** Keyrir gervigreindartólin á myndinni sem er opin í Móta. Hvert kall notar
 *  sama hjálparfall og sjálfstæða tólið (sama API-leið, sama upphleðsla í
 *  eigin geymslu), svo hegðun og kostnaður eru eins. Skilar nýrri mynd sem
 *  ritillinn setur inn sem afturkallanlegt skref. */

import { uploadForReplicate } from "../uploadToStorage";
import { enhancePhotoViaCloud } from "../vidgerd/cloud";
import { DEFAULT_TOPAZ_SETTINGS, upscaleWithTopaz } from "../upplyfting/topaz";
import { DEFAULT_CLARITY_SETTINGS, upscaleWithClarity } from "../upplyfting/clarity";
import { DEFAULT_PRUNA_SETTINGS, runBackground, DEFAULT_BACKGROUND_SETTINGS, runPruna } from "../breyta/models";
import { cutProductBackgroundViaCloud } from "../bakgrunnur/cloud";
import { placeOnWhite } from "../bakgrunnur/cut";
import { DEFAULT_ENDURLJOS_SETTINGS, relightImage, type LightSource } from "../endurljos/model";
import { DEFAULT_RETOUCH_SETTINGS, buildRetouchPrompt, generateRetouch, type RetouchSettings } from "../andlitsfegrun/retouch";
import { DEFAULT_ANDLIT_SETTINGS, generateAndlit } from "../andlit/model";
import { eraseObject } from "../fjarlaegjahlut/eraser";
import { DEFAULT_SKY_SETTINGS, generateSky } from "../himinn/sky";
import { DEFAULT_UTVIKKA_SETTINGS, outpaintImage, type UtvikkaAmount, type UtvikkaDirection } from "../utvikka/model";
import { DEFAULT_LITUN_SETTINGS, colorizeImage } from "../litun/model";
import type { BackgroundChoice } from "./aiPresets";

export type AiRequest =
  | { tool: "vidgerd" }
  | { tool: "topaz"; face: boolean }
  | { tool: "clarity"; creativity: number }
  | { tool: "hradbreyta"; prompt: string; preserveFace: boolean }
  | { tool: "bakgrunnur"; choice: BackgroundChoice; prompt?: string }
  | { tool: "endurljos"; prompt: string; light: LightSource; keepBackground: boolean }
  | { tool: "andlitsfegrun"; options: Pick<RetouchSettings, "skinSmooth" | "blemishes" | "teeth" | "underEye"> }
  | { tool: "andlit"; prompt: string }
  | { tool: "fjarlaegja"; mask: Blob }
  | { tool: "himinn"; prompt: string; mask: Blob }
  | { tool: "utvikka"; direction: UtvikkaDirection; amount: UtvikkaAmount; prompt: string }
  | { tool: "litun" };

export type AiResult = { blob: Blob; alpha: boolean };

function first(blobs: Blob[], what: string): Blob {
  const b = blobs[0];
  if (!b) throw new Error(`${what} skilaði engri mynd`);
  return b;
}

/** Myndin (`source`) með óskýrum bakgrunni: útklippt manneskja yfir óskýrt
 *  frumrit. Manneskjan er fyrst klippt ÚR bakgrunninum áður en hann er gerður
 *  óskýr — annars smitast hún út í bakgrunninn sem daufur skuggi. Óskýrleiki á
 *  mynd með gati er „normaliseraður“ af striganum sjálfum (forþáttað alfa), svo
 *  litir bakgrunnsins renna inn í gatið; dýpra inni fyllir sterkari óskýrleiki. */
async function blurBehind(source: Blob, cutout: Blob, radiusFraction = 0.012): Promise<Blob> {
  const [orig, cut] = await Promise.all([createImageBitmap(source), createImageBitmap(cutout)]);
  try {
    const w = orig.width;
    const h = orig.height;
    const r = Math.max(4, Math.round(Math.max(w, h) * radiusFraction));
    const layer = (fn: (ctx: CanvasRenderingContext2D) => void) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      if (!ctx) throw new Error("Gat ekki teiknað á striga");
      fn(ctx);
      return c;
    };
    // Bakgrunnurinn einn: frumritið með manneskjuna klippta út (gat).
    const bgOnly = layer((ctx) => {
      ctx.drawImage(orig, 0, 0);
      ctx.globalCompositeOperation = "destination-out";
      ctx.drawImage(cut, 0, 0, w, h);
    });
    const out = layer((ctx) => {
      // Stækkað aðeins svo óskýru brúnirnar dragi ekki inn gegnsæi frá jaðrinum.
      for (const radius of [r * 4, r * 2, r]) {
        ctx.filter = `blur(${radius}px)`;
        ctx.drawImage(bgOnly, -radius * 2, -radius * 2, w + radius * 4, h + radius * 4);
      }
      ctx.filter = "none";
      ctx.drawImage(cut, 0, 0, w, h);
    });
    return await new Promise((resolve, reject) =>
      out.toBlob((b) => (b ? resolve(b) : reject(new Error("Gat ekki vistað mynd"))), "image/jpeg", 0.95),
    );
  } finally {
    orig.close();
    cut.close();
  }
}

export async function runAi(req: AiRequest, source: Blob, onStatus: (text: string) => void): Promise<AiResult> {
  let uploaded: string | null = null;
  const url = async () => {
    if (!uploaded) {
      onStatus("Sendi myndina…");
      uploaded = await uploadForReplicate(source, "reference-images");
    }
    return uploaded;
  };

  switch (req.tool) {
    case "vidgerd":
      onStatus("Geri við myndina…");
      return { blob: await enhancePhotoViaCloud(source), alpha: false };

    case "topaz": {
      const image = await url();
      onStatus("Topaz vinnur…");
      const blob = await upscaleWithTopaz(
        { ...DEFAULT_TOPAZ_SETTINGS, upscaleFactor: "2x", faceEnhancement: req.face, outputFormat: "jpg" },
        image,
      );
      return { blob, alpha: false };
    }

    case "clarity": {
      const image = await url();
      onStatus("Clarity vinnur…");
      const blob = await upscaleWithClarity(
        { ...DEFAULT_CLARITY_SETTINGS, creativity: req.creativity, scaleFactor: 2, outputFormat: "jpg" },
        image,
        {
          onStatus: (p) =>
            onStatus(p.percent != null ? `Clarity vinnur… ${Math.round(p.percent)}%` : `Clarity vinnur… ${p.elapsedSeconds} sek`),
        },
      );
      return { blob, alpha: false };
    }

    case "hradbreyta": {
      if (!req.prompt.trim()) throw new Error("Segðu hvað á að breyta fyrst.");
      const image = await url();
      onStatus("Breyti myndinni…");
      const blobs = await runPruna({ ...DEFAULT_PRUNA_SETTINGS, prompt: req.prompt.trim(), preserveFace: req.preserveFace }, image);
      return { blob: first(blobs, "Hraðbreyta"), alpha: false };
    }

    case "bakgrunnur": {
      const choice = req.choice;
      if (choice.kind === "scene") {
        const prompt = (req.prompt ?? choice.prompt ?? "").trim();
        if (!prompt) throw new Error("Lýstu bakgrunninum fyrst.");
        const image = await url();
        onStatus(`Bý til bakgrunn: ${choice.label}…`);
        const blobs = await runBackground({ ...DEFAULT_BACKGROUND_SETTINGS, prompt, numResults: 1 }, image);
        return { blob: first(blobs, "Bakgrunnur"), alpha: false };
      }
      onStatus("Klippi manneskjuna út…");
      const cutout = await cutProductBackgroundViaCloud(source);
      if (choice.kind === "remove") return { blob: cutout, alpha: true };
      if (choice.kind === "white") return { blob: await placeOnWhite(cutout), alpha: false };
      onStatus("Geri bakgrunninn óskýran…");
      return { blob: await blurBehind(source, cutout), alpha: false };
    }

    case "endurljos": {
      const image = await url();
      onStatus("Lýsi myndina upp á nýtt…");
      const blobs = await relightImage(
        { ...DEFAULT_ENDURLJOS_SETTINGS, prompt: req.prompt, lightSource: req.light, preserveBackground: req.keepBackground, numResults: 1 },
        image,
        req.prompt,
      );
      return { blob: first(blobs, "Endurljós"), alpha: false };
    }

    case "andlitsfegrun": {
      const settings: RetouchSettings = { ...DEFAULT_RETOUCH_SETTINGS, ...req.options, extra: "" };
      if (!buildRetouchPrompt(settings)) throw new Error("Veldu að minnsta kosti eina lagfæringu.");
      onStatus("Fegra andlitið…");
      return { blob: await generateRetouch(settings, source), alpha: false };
    }

    case "fjarlaegja":
      onStatus("Fjarlægi og fylli í…");
      return { blob: await eraseObject(source, req.mask), alpha: false };

    case "himinn": {
      if (!req.prompt.trim()) throw new Error("Veldu nýjan himin fyrst.");
      onStatus("Skipti um himin…");
      const blobs = await generateSky({ ...DEFAULT_SKY_SETTINGS, prompt: req.prompt }, { image: source, mask: req.mask });
      return { blob: first(blobs, "Himinn"), alpha: false };
    }

    case "utvikka": {
      onStatus("Útvíkka rammann…");
      const objectUrl = URL.createObjectURL(source);
      try {
        const { blobs } = await outpaintImage(
          { ...DEFAULT_UTVIKKA_SETTINGS, direction: req.direction, amount: req.amount, prompt: req.prompt.trim(), numOutputs: 1 },
          objectUrl,
        );
        return { blob: first(blobs, "Útvíkka"), alpha: false };
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    }

    case "litun": {
      const image = await url();
      onStatus("Lita myndina…");
      const blobs = await colorizeImage({ ...DEFAULT_LITUN_SETTINGS }, image);
      return { blob: first(blobs, "Litun"), alpha: false };
    }

    case "andlit": {
      if (!req.prompt.trim()) throw new Error("Lýstu myndinni fyrst.");
      const image = await url();
      onStatus("Bý til nýja mynd af andlitinu…");
      const blobs = await generateAndlit({ ...DEFAULT_ANDLIT_SETTINGS, prompt: req.prompt.trim(), numOutputs: 1 }, image, req.prompt.trim());
      return { blob: first(blobs, "Andlit"), alpha: false };
    }
  }
}

/** Topaz 2× beint í skrá — fram hjá ritlinum, sem vinnur í mest 2560 px. */
export async function topazFullResolution(source: Blob, face: boolean, onStatus: (text: string) => void): Promise<Blob> {
  onStatus("Sendi myndina…");
  const image = await uploadForReplicate(source, "reference-images");
  onStatus("Topaz tvöfaldar upplausnina…");
  return upscaleWithTopaz({ ...DEFAULT_TOPAZ_SETTINGS, upscaleFactor: "2x", faceEnhancement: face, outputFormat: "jpg" }, image);
}
