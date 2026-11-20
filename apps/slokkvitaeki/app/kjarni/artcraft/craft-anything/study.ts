/** Clean-room study of HTML/JS/text in the browser. No DOM, so Node tests can run it. */

export const STUDY_HOSTS = [
  "slokkvitaeki.netlify.app",
  "brunaholf.netlify.app",
  "kjarni.vercel.app",
  "kjarni-3dwork.vercel.app",
  "getartcraft.com",
  "www.getartcraft.com",
] as const;

export const STUDY_SITES: ReadonlyArray<{ label: string; url: string }> = [
  { label: "Slökkvitæki", url: "https://slokkvitaeki.netlify.app/" },
  { label: "Brunahólf", url: "https://brunaholf.netlify.app/" },
  { label: "Kjarni", url: "https://kjarni.vercel.app/kjarni" },
  { label: "Craft Anything", url: "https://getartcraft.com/apps/craft-anything" },
];

export const MAX_STUDY_BYTES = 1_500_000;

export type StudyUrlOk = { ok: true; url: URL };
export type StudyUrlErr = { ok: false; error: string };

/** Extra hosts from the request Host header: this Kjarni deploy, or a Vercel preview. Never an arbitrary host. */
export function extraStudyHosts(hostHeader: string): string[] {
  const host = hostHeader.split(":")[0]?.toLowerCase().trim() ?? "";
  if (!host || host.startsWith(".") || host === "localhost" || host.endsWith(".local")) return [];
  if ((STUDY_HOSTS as readonly string[]).includes(host)) return [host];
  if (host.endsWith(".vercel.app") && host !== "vercel.app") return [host];
  return [];
}

export function parseStudyUrl(raw: string, extraHosts: readonly string[] = []): StudyUrlOk | StudyUrlErr {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "Slóð vantar" };
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: "Ógild slóð" };
  }
  if (url.username || url.password) return { ok: false, error: "Slóð má ekki bera aðgang" };
  if (url.protocol !== "https:") return { ok: false, error: "Aðeins https" };
  if (url.port && url.port !== "443") return { ok: false, error: "Óheimil gátt" };
  const host = url.hostname.toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".local")) {
    return { ok: false, error: "Innri vélar eru bannaðar" };
  }
  if (/^[\d.]+$/.test(host) || host.includes(":")) {
    return { ok: false, error: "IP-tölur eru bannaðar" };
  }
  const allowed = new Set<string>([...STUDY_HOSTS, ...extraHosts.map((h) => h.toLowerCase())]);
  if (!allowed.has(host)) {
    return { ok: false, error: "Slóðin er ekki á leyfðum lista (okkar vefir)" };
  }
  return { ok: true, url };
}

export type ScriptHit = { src: string } | { inline: string };
export type LinkHit = { href: string; text: string };

export type Study = {
  kind: "html" | "javascript" | "css" | "json" | "text" | "binary";
  fileName: string;
  summary: string;
  title: string;
  description: string;
  lang: string;
  generator: string;
  headings: string[];
  nav: string[];
  scripts: ScriptHit[];
  stylesheets: string[];
  colors: string[];
  fonts: string[];
  forms: number;
  images: number;
  links: LinkHit[];
  tech: string[];
  facts: Array<{ label: string; value: string }>;
};

const TECH: Array<[RegExp, string]> = [
  [/__NEXT_DATA__|\/_next\//i, "Next.js"],
  [/data-reactroot|react-dom|React\.createElement/i, "React"],
  [/data-v-|__vue__|Vue\.createApp/i, "Vue"],
  [/ng-version|ng-app/i, "Angular"],
  [/wp-content|wordpress/i, "WordPress"],
  [/cdn\.shopify/i, "Shopify"],
  [/supabase/i, "Supabase"],
  [/leaflet/i, "Leaflet"],
  [/tailwind|--tw-/i, "Tailwind"],
  [/webpackJsonp|__webpack_require__/i, "webpack"],
  [/vite|import\.meta\.hot/i, "Vite"],
  [/jquery/i, "jQuery"],
];

function stripTags(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function attr(tag: string, name: string): string {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match ? (match[2] ?? match[3] ?? match[4] ?? "").trim() : "";
}

function unique(items: string[], max = 24): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const value = item.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= max) break;
  }
  return out;
}

function metaContent(html: string, key: string): string {
  const named = html.match(new RegExp(`<meta[^>]+(?:name|property)\\s*=\\s*["']${key}["'][^>]*>`, "i"));
  if (named) return attr(named[0], "content");
  const reversed = html.match(new RegExp(`<meta[^>]+content\\s*=\\s*["']([^"']+)["'][^>]*(?:name|property)\\s*=\\s*["']${key}["']`, "i"));
  return reversed?.[1]?.trim() ?? "";
}

function collectColors(text: string): string[] {
  const hits = [
    ...(text.match(/#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})\b/gi) ?? []),
    ...(text.match(/rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(?:\s*,\s*[\d.]+)?\s*\)/gi) ?? []),
  ];
  return unique(hits, 12);
}

function collectFonts(text: string): string[] {
  const fonts: string[] = [];
  const re = /font-family\s*:\s*([^;!}]+)[;!}]/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    fonts.push(match[1].replace(/["']/g, "").split(",")[0] ?? "");
  }
  return unique(fonts, 8);
}

function detectTech(blob: string): string[] {
  return TECH.filter(([re]) => re.test(blob)).map(([, name]) => name);
}

export function sniffKind(fileName: string, bytes: Uint8Array): Study["kind"] {
  const head = bytes.slice(0, 16);
  const asText = String.fromCharCode(...head);
  if (bytes.length >= 4 && bytes[0] === 0x00 && bytes[1] === 0x61 && bytes[2] === 0x73 && bytes[3] === 0x6d) return "binary";
  if (asText.startsWith("\x89PNG") || asText.startsWith("GIF8") || asText.startsWith("%PDF") || asText.startsWith("PK")) {
    return "binary";
  }
  if (bytes[0] === 0x7f && asText.slice(1, 4) === "ELF") return "binary";
  if (asText.startsWith("MZ")) return "binary";
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html";
  if (lower.endsWith(".css")) return "css";
  if (lower.endsWith(".json")) return "json";
  if (/\.(js|mjs|cjs|ts|tsx)$/.test(lower)) return "javascript";
  const sample = new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, 800));
  if (/^\s*</.test(sample) && /<html|<body|<div|<script/i.test(sample)) return "html";
  if (/^\s*[{[]/.test(sample)) return "json";
  if (/function\s|=>|import\s|export\s/.test(sample)) return "javascript";
  const nul = bytes.slice(0, 800).includes(0);
  return nul ? "binary" : "text";
}

function emptyStudy(fileName: string, kind: Study["kind"], summary: string): Study {
  return {
    kind,
    fileName,
    summary,
    title: "",
    description: "",
    lang: "",
    generator: "",
    headings: [],
    nav: [],
    scripts: [],
    stylesheets: [],
    colors: [],
    fonts: [],
    forms: 0,
    images: 0,
    links: [],
    tech: [],
    facts: [],
  };
}

export function studyHtml(html: string, fileName = "index.html"): Study {
  const title = stripTags((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) ?? [])[1] ?? "");
  const description = metaContent(html, "description") || metaContent(html, "og:description");
  const lang = (html.match(/<html[^>]*lang\s*=\s*["']([^"']+)/i) ?? [])[1] ?? "";
  const generator = metaContent(html, "generator");
  const headings = unique(
    [...html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)].map((m) => stripTags(m[1] ?? "")),
    16,
  );
  const navBlock = (html.match(/<nav[\s\S]*?<\/nav>/i) ?? [])[0] ?? "";
  const nav = unique(
    [...navBlock.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => stripTags(m[1] ?? "")),
    16,
  );
  const scripts: ScriptHit[] = [];
  for (const m of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const src = attr(m[1] ?? "", "src");
    if (src) scripts.push({ src });
    else {
      const inline = stripTags(m[2] ?? "").slice(0, 80);
      if (inline) scripts.push({ inline });
    }
  }
  for (const m of html.matchAll(/<script([^>]*\/\s*)>/gi)) {
    const src = attr(m[1] ?? "", "src");
    if (src && !scripts.some((s) => "src" in s && s.src === src)) scripts.push({ src });
  }
  const stylesheets = unique(
    [...html.matchAll(/<link[^>]+>/gi)]
      .filter((m) => /rel\s*=\s*["']stylesheet["']/i.test(m[0]))
      .map((m) => attr(m[0], "href")),
  );
  const colors = collectColors(html);
  const fonts = collectFonts(html);
  const forms = (html.match(/<form[\s>]/gi) ?? []).length;
  const images = (html.match(/<img[\s>]/gi) ?? []).length;
  const links = unique(
    [...html.matchAll(/<a([^>]*)>([\s\S]*?)<\/a>/gi)].map((m) => {
      const href = attr(m[1] ?? "", "href");
      const text = stripTags(m[2] ?? "");
      return href ? `${href}\n${text}` : "";
    }),
    20,
  )
    .map((row) => {
      const i = row.indexOf("\n");
      return { href: row.slice(0, i), text: row.slice(i + 1) };
    })
    .filter((l) => l.href && !l.href.startsWith("javascript:"));
  const tech = detectTech(html);
  const facts = [
    title && { label: "Titill", value: title },
    lang && { label: "Tungumál", value: lang },
    generator && { label: "Generator", value: generator },
    { label: "Skriftur", value: String(scripts.length) },
    { label: "Stílsíður", value: String(stylesheets.length) },
    { label: "Fyrirsagnir", value: String(headings.length) },
    { label: "Tenglar", value: String(links.length) },
    { label: "Form", value: String(forms) },
    tech.length ? { label: "Stafli", value: tech.join(", ") } : null,
  ].filter(Boolean) as Study["facts"];
  const summary = title
    ? `${fileName} er HTML-síða „${title}“` + (tech.length ? ` sem notar ${tech.join(", ")}.` : ".")
    : `${fileName} er HTML-síða.` + (tech.length ? ` Stafli: ${tech.join(", ")}.` : "");
  return {
    kind: "html",
    fileName,
    summary,
    title,
    description,
    lang,
    generator,
    headings,
    nav,
    scripts: scripts.slice(0, 30),
    stylesheets,
    colors,
    fonts,
    forms,
    images,
    links,
    tech,
    facts,
  };
}

export function studyJavascript(text: string, fileName = "app.js"): Study {
  const functions = (text.match(/\bfunction\b/g) ?? []).length + (text.match(/=>/g) ?? []).length;
  const urls = unique(text.match(/https?:\/\/[^\s"'`]+/g) ?? [], 12);
  const map = /\/\/[#@]\s*sourceMappingURL=(\S+)/.exec(text)?.[1] ?? "";
  const tech = detectTech(text);
  const summary = `${fileName} er JavaScript` + (tech.length ? ` (${tech.join(", ")})` : "") + ` með um ${functions} föll/örvum.`;
  const facts = [
    { label: "Stærð", value: `${text.length} stafir` },
    { label: "Föll / örvar", value: String(functions) },
    tech.length ? { label: "Stafli", value: tech.join(", ") } : null,
    map ? { label: "Source map", value: map } : null,
    urls.length ? { label: "Slóðir", value: String(urls.length) } : null,
  ].filter(Boolean) as Study["facts"];
  return {
    ...emptyStudy(fileName, "javascript", summary),
    tech,
    links: urls.map((href) => ({ href, text: "" })),
    facts,
  };
}

export function studyCss(text: string, fileName = "styles.css"): Study {
  const colors = collectColors(text);
  const fonts = collectFonts(text);
  const rules = (text.match(/\{/g) ?? []).length;
  const summary = `${fileName} er CSS með ${rules} reglum` + (colors.length ? ` og ${colors.length} litum.` : ".");
  return {
    ...emptyStudy(fileName, "css", summary),
    colors,
    fonts,
    facts: [
      { label: "Reglur", value: String(rules) },
      colors.length ? { label: "Litir", value: colors.slice(0, 6).join(" ") } : null,
      fonts.length ? { label: "Letur", value: fonts.join(", ") } : null,
    ].filter(Boolean) as Study["facts"],
  };
}

export function studyBytes(fileName: string, bytes: Uint8Array): Study {
  const kind = sniffKind(fileName, bytes);
  if (kind === "binary") {
    const summary = `${fileName} er tvíundarskrá. Opnaðu hana í WASM-skoðaranum hér fyrir neðan.`;
    return {
      ...emptyStudy(fileName, "binary", summary),
      facts: [{ label: "Stærð", value: `${bytes.length} bæti` }],
    };
  }
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, MAX_STUDY_BYTES));
  if (kind === "html") return studyHtml(text, fileName);
  if (kind === "javascript") return studyJavascript(text, fileName);
  if (kind === "css") return studyCss(text, fileName);
  if (kind === "json") {
    let keys = 0;
    try {
      const parsed = JSON.parse(text) as unknown;
      keys = parsed && typeof parsed === "object" ? Object.keys(parsed as object).length : 0;
    } catch {
      keys = 0;
    }
    return {
      ...emptyStudy(fileName, "json", `${fileName} er JSON.`),
      facts: [
        { label: "Stærð", value: `${text.length} stafir` },
        { label: "Lyklar í rót", value: String(keys) },
      ],
    };
  }
  return {
    ...emptyStudy(fileName, "text", `${fileName} er texti.`),
    facts: [{ label: "Stærð", value: `${text.length} stafir` }],
  };
}
