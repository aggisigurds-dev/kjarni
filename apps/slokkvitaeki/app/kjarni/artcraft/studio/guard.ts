/**
 * Private studio allows adult nudity. The only hard stop is sexual content
 * involving minors — that is illegal, including for private use.
 */

const MINOR_RE = new RegExp(
  [
    String.raw`\b(loli|lolita|shota|shotacon|lolicon)\b`,
    String.raw`\b(child(\s*porn)?|children|childhood\s+sex)\b`,
    String.raw`\b(kid|kids|kiddie|kiddy)\b`,
    String.raw`\b(pre[- ]?teen|tween|underage|under[- ]age|under[- ]18|u\.?18)\b`,
    String.raw`\b(minor|minors|underaged)\b`,
    String.raw`\b((one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen)[- ]year[- ]old)\b`,
    String.raw`\b([1-9]|1[0-7])\s*(y/?o|yr|yrs|year[- ]olds?)\b`,
    String.raw`\b(toddler|infant|baby\s+girl|baby\s+boy)\b`,
    String.raw`\b(young\s+(boy|girl|child|kid|minor))\b`,
    String.raw`\b(school[- ]?(boy|girl|kid)s?)\b`,
    String.raw`\b(barn|börnin?|barnið|barnung(ur|t)|krakki|krakkar|ólögráða|undir\s*18)\b`,
    String.raw`\b(ungling(ur|ar|inn)?)\b`,
  ].join("|"),
  "i",
);

export function normalizePrompt(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function blockedForMinors(text: string): string | null {
  const prompt = normalizePrompt(text);
  if (!prompt) return null;
  if (MINOR_RE.test(prompt)) {
    return "Einkastúdíóið leyfir fullorðinsmyndefni, en ekkert sem snýr að börnum eða ólögráða.";
  }
  return null;
}

export function assertAdultPrompt(...parts: Array<string | undefined>): void {
  for (const part of parts) {
    const reason = blockedForMinors(part || "");
    if (reason) throw new Error(reason);
  }
}
