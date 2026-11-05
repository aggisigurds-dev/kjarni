/** Gervigreindartólin í Móta-ritlinum („Snjallt“-flipinn) — hrein gögn,
 *  prófuð í node. Sjálf köllin eru í ai.ts og nota sömu hjálparföll og
 *  sjálfstæðu tólin (Ljósmyndaviðgerð, Upplyfting, Breyta mynd, Bakgrunnur,
 *  Endurljós, Andlitsfegrun, Andlit). Fyrirmæli til líkananna eru á ensku —
 *  þau skilja hana best; heitin á skjánum eru íslensk. */

export type AiToolId =
  | "vidgerd"
  | "topaz"
  | "clarity"
  | "hradbreyta"
  | "bakgrunnur"
  | "endurljos"
  | "andlitsfegrun"
  | "andlit";

export const AI_TOOLS: Array<{ id: AiToolId; label: string; icon: string; hint: string; wait: string }> = [
  { id: "vidgerd", label: "Viðgerð", icon: "restorePhoto", hint: "Lagar gamlar, óskýrar eða rispaðar myndir og andlit", wait: "~15 sek" },
  { id: "topaz", label: "Topaz", icon: "upscale", hint: "Skerpir og hreinsar alla myndina (Topaz) — eða vistar hana beint í tvöfaldri upplausn", wait: "~30 sek" },
  { id: "clarity", label: "Clarity", icon: "sparkle", hint: "Bætir við smáatriðum og skýrleika (Clarity) — skapandi upplyfting", wait: "1–2 mín" },
  { id: "hradbreyta", label: "Hraðbreyta", icon: "wand", hint: "Segðu hvað á að breyta og gervigreindin gerir það", wait: "~10 sek" },
  { id: "bakgrunnur", label: "Bakgrunnur", icon: "background", hint: "Fjarlægja, gera hvítan eða óskýran, eða velja nýjan bakgrunn", wait: "~15 sek" },
  { id: "endurljos", label: "Endurljós", icon: "relight", hint: "Ný lýsing á myndina — gluggaljós, sólsetur, stúdíó …", wait: "~1 mín" },
  { id: "andlitsfegrun", label: "Andlitsfegrun", icon: "face", hint: "Jafnar húð, tekur bletti, hvíttar tennur — breytir engu öðru", wait: "~20 sek" },
  { id: "andlit", label: "Andlit", icon: "portrait", hint: "Ný mynd af sama andliti í öðru umhverfi", wait: "~30 sek" },
];

export type BackgroundChoice = {
  id: string;
  label: string;
  kind: "remove" | "white" | "blur" | "scene";
  prompt?: string;
  /** CSS-bakgrunnur fyrir smámyndina í listanum. */
  swatch: string;
};

export const BACKGROUND_CHOICES: BackgroundChoice[] = [
  { id: "remove", label: "Fjarlægja", kind: "remove", swatch: "repeating-conic-gradient(#d9d9de 0 25%, #fff 0 50%) 0 0 / 14px 14px" },
  { id: "white", label: "Hvítur", kind: "white", swatch: "#ffffff" },
  { id: "blur", label: "Óskýr", kind: "blur", swatch: "radial-gradient(circle at 40% 40%, #9fb7a0, #5d7b6b 60%, #3e4f48)" },
  { id: "haust", label: "Haustvegur", kind: "scene", prompt: "a quiet road through an autumn forest with orange, red and yellow trees, soft daylight, natural photo", swatch: "linear-gradient(160deg, #e9a046, #b5541c 55%, #5b4636)" },
  { id: "strond", label: "Strönd", kind: "scene", prompt: "a sandy beach at golden hour with soft ocean waves and a warm sunset sky, natural photo", swatch: "linear-gradient(180deg, #f6b26b, #f3d39b 45%, #6fa8c9 70%, #e8d2a6)" },
  { id: "fjoll", label: "Íslensk fjöll", kind: "scene", prompt: "Icelandic green valley with mountains and a dramatic cloudy sky, natural daylight photo", swatch: "linear-gradient(180deg, #8fa9bf, #c7d3db 40%, #5f7f5a 60%, #3f5a3c)" },
  { id: "nordurljos", label: "Norðurljós", kind: "scene", prompt: "Icelandic winter night with green northern lights over snowy mountains, starry sky", swatch: "linear-gradient(180deg, #0b1830, #1f6b5a 40%, #0d2340 70%, #d8e4ee)" },
  { id: "borg", label: "Borg að kvöldi", kind: "scene", prompt: "a city street at night with warm bokeh lights, shallow depth of field", swatch: "radial-gradient(circle at 30% 40%, #ffd27a 0 6%, transparent 7%), radial-gradient(circle at 70% 55%, #ff8f6b 0 5%, transparent 6%), linear-gradient(180deg, #1d2236, #3b2d4a)" },
  { id: "blom", label: "Blómagarður", kind: "scene", prompt: "a blooming flower garden in spring, soft sunlight, shallow depth of field", swatch: "radial-gradient(circle at 30% 60%, #f39ab0 0 8%, transparent 9%), radial-gradient(circle at 65% 45%, #ffd36b 0 7%, transparent 8%), linear-gradient(180deg, #a8d39b, #4f8a4a)" },
  { id: "studio", label: "Grátt stúdíó", kind: "scene", prompt: "seamless grey photo studio backdrop with soft even light", swatch: "radial-gradient(circle at 50% 40%, #c9c9cc, #8c8d92)" },
  { id: "jol", label: "Jól", kind: "scene", prompt: "a cozy living room at christmas with a decorated tree and warm fairy lights, bokeh", swatch: "radial-gradient(circle at 30% 35%, #ffd27a 0 5%, transparent 6%), radial-gradient(circle at 70% 60%, #ff6b6b 0 5%, transparent 6%), linear-gradient(180deg, #2f4a33, #6b2b26)" },
  { id: "kaffi", label: "Kaffihús", kind: "scene", prompt: "a cozy cafe interior with warm light and a blurred background", swatch: "linear-gradient(160deg, #c89b6d, #7a5236 60%, #3e2a1f)" },
];

export const QUICK_EDITS: Array<{ label: string; prompt: string }> = [
  { label: "Fjarlægja fólk í bakgrunni", prompt: "remove all other people in the background, keep the main person and everything else unchanged" },
  { label: "Hreinsa drasl", prompt: "remove clutter and distracting objects from the background, keep the main subject unchanged" },
  { label: "Sólríkur dagur", prompt: "make it a bright sunny day with a clear blue sky, keep the people and everything else the same" },
  { label: "Bros", prompt: "make the person smile naturally, keep the face identity, hair and everything else the same" },
  { label: "Svarthvít", prompt: "turn this into an elegant black and white photograph" },
  { label: "Fagleg myndataka", prompt: "make it look like a professional photo shoot with flattering light, keep the person identical" },
];

export const LIGHT_PRESETS: Array<{ label: string; prompt: string; swatch: string }> = [
  { label: "Gluggaljós", prompt: "soft natural window light, gentle shadows, natural skin tones", swatch: "linear-gradient(120deg, #fffaf0, #e7e2d6 60%, #b9b3a6)" },
  { label: "Sólsetur", prompt: "warm golden hour sunlight, soft glow", swatch: "linear-gradient(120deg, #ffcf7a, #f08a4b 60%, #8a3f2a)" },
  { label: "Stúdíó", prompt: "soft studio key light, warm rim light, professional portrait lighting", swatch: "radial-gradient(circle at 35% 35%, #ffffff, #b9bcc4 60%, #5f6168)" },
  { label: "Drama", prompt: "dramatic hard side light, deep shadows, cinematic", swatch: "linear-gradient(90deg, #f5e6c8 0 35%, #1c1c20 70%)" },
  { label: "Neon", prompt: "neon lights, pink and blue glow, night city", swatch: "linear-gradient(120deg, #ff4fa3, #6a5cff 60%, #1aa7ff)" },
  { label: "Kertaljós", prompt: "warm candle light, cozy, dark surroundings", swatch: "radial-gradient(circle at 50% 60%, #ffd27a, #b5651d 45%, #2a1608)" },
];

export const LIGHT_DIRECTIONS: Array<{ id: "Left Light" | "Right Light" | "Top Light" | "None"; label: string }> = [
  { id: "Left Light", label: "Vinstri" },
  { id: "Right Light", label: "Hægri" },
  { id: "Top Light", label: "Að ofan" },
  { id: "None", label: "Jafnt" },
];

export const PORTRAIT_PRESETS: Array<{ label: string; prompt: string }> = [
  { label: "Fagleg mynd", prompt: "professional business headshot, neutral studio background, soft light, sharp focus" },
  { label: "Úti í náttúrunni", prompt: "portrait outdoors in Icelandic nature, golden hour, natural light" },
  { label: "Kvikmyndaleg", prompt: "cinematic portrait, moody warm lighting, shallow depth of field" },
  { label: "Brúðkaup", prompt: "elegant wedding portrait, soft romantic light, flowers in the background" },
];

/** Ef villan er frá því að Replicate takmarkaði köll (429 — gerist þegar
 *  inneign er undir $5: 6 köll á mínútu, eitt í einu): hve margar sekúndur á
 *  að bíða áður en reynt er aftur. null = önnur villa, ekki reyna aftur. */
export function throttleDelaySeconds(message: string): number | null {
  if (!/\b429\b|throttled/i.test(message)) return null;
  const m = message.match(/retry_after"?\s*:\s*(\d+)/i) ?? message.match(/resets in ~?(\d+)\s*s/i);
  const seconds = m ? Number(m[1]) : 10;
  return Math.min(60, Math.max(2, seconds)) + 1;
}
