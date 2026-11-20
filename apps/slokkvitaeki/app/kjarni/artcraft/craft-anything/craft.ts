import type { Study } from "./study";

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Clean-room HTML from a study: structure, colours and labels — not the original scripts. */
export function craftHtml(study: Study, want: string): string {
  const ink = study.colors.find((c) => c.startsWith("#") && c.length >= 4) ?? "#102038";
  const paper = study.colors.find((c) => /^#f|^#e|^#fff/i.test(c)) ?? "#f6f7f9";
  const accent = study.colors[1] ?? "#1659c4";
  const font = study.fonts[0] ?? "Georgia, serif";
  const title = study.title || "Endurgerð";
  const nav = (study.nav.length ? study.nav : study.headings.slice(0, 5)).filter(Boolean);
  const sections = study.headings.length ? study.headings : ["Forsíða", "Um", "Hafa samband"];
  const note = want.trim() || "Hreinsmíði út frá því sem sést: fyrirsagnir, litir og valmynd — enginn upprunalegur kóði.";
  const navHtml = nav
    .map((label) => `<a href="#${esc(label.toLowerCase().replace(/\s+/g, "-").slice(0, 40))}">${esc(label)}</a>`)
    .join("");
  const body = sections
    .map((heading, i) => {
      const id = heading.toLowerCase().replace(/\s+/g, "-").slice(0, 40);
      return `<section id="${esc(id)}"><h2>${esc(heading)}</h2><p>${i === 0 ? esc(study.description || note) : "Pláss fyrir efni."}</p></section>`;
    })
    .join("\n");
  return `<!DOCTYPE html>
<html lang="${esc(study.lang || "is")}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <style>
    :root { --ink: ${esc(ink)}; --paper: ${esc(paper)}; --accent: ${esc(accent)}; }
    body { margin: 0; font: 18px/1.5 ${esc(font)}; color: var(--ink); background: var(--paper); }
    header { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; padding: 16px 24px; border-bottom: 1px solid color-mix(in srgb, var(--ink) 16%, transparent); }
    nav { display: flex; flex-wrap: wrap; gap: 12px; }
    nav a { color: inherit; min-height: 44px; display: inline-flex; align-items: center; }
    main { max-width: 44rem; margin: 0 auto; padding: 24px; }
    .note { padding: 12px 14px; background: color-mix(in srgb, var(--accent) 12%, var(--paper)); border-radius: 8px; }
  </style>
</head>
<body>
  <header>
    <strong>${esc(title)}</strong>
    <nav>${navHtml}</nav>
  </header>
  <main>
    <p class="note">${esc(note)}</p>
    ${body}
  </main>
</body>
</html>
`;
}
