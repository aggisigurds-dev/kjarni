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
import type { BackgroundChoice } from "./aiPresets";

export type AiRequest =
  | { tool: "vidgerd" }
  | { tool: "topaz"; face: boolean }
  | { tool: "clarity"; creativity: number }
  | { tool: "hradbreyta"; prompt: string; preserveFace: boolean }
  | { tool: "bakgrunnur"; choice: BackgroundChoice; prompt?: string }
  | { tool: "endurljos"; prompt: string; light: LightSource; keepBackground: boolean }
  | { tool: "andlitsfegrun"; options: Pick<RetouchSettings, "skinSmooth" | "blemishes" | "teeth" | "underEye"> }
  | { tool: "andlit"; prompt: string };

export type AiResult = { blob: Blob; alpha: boolean };

function first(blobs: Blob[], what: string): Blob {
  const b = blobs[0];
  if (!b) throw new Error(`${what} skilaði engri mynd`);
  return b;
}

/** Myndin (`source`) með óskýrum bakgrunni: útklippt manneskja yfir óskýrt frumrit. */
async function blurBehind(source: Blob, cutout: Blob, radiusFraction = 0.012): Promise<Blob> {
  const [orig, cut] = await Promise.all([createImageBitmap(source), createImageBitmap(cutout)]);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = orig.width;
    canvas.height = orig.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Gat ekki teiknað á striga");
    const r = Math.max(4, Math.round(Math.max(orig.width, orig.height) * radiusFraction));
    // Stækkað aðeins svo óskýru brúnirnar dragi ekki inn gegnsæi frá jaðrinum.
    ctx.filter = `blur(${r}px)`;
    ctx.drawImage(orig, -r * 2, -r * 2, orig.width + r * 4, orig.height + r * 4);
    ctx.filter = "none";
    ctx.drawImage(cut, 0, 0, orig.width, orig.height);
    return await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Gat ekki vistað mynd"))), "image/jpeg", 0.95),
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
