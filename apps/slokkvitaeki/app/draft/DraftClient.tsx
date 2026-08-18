"use client";

import { useEffect, useMemo, useState } from "react";
import { PageBlocks, type Block } from "../PageBlocks";
import { BLOCK_TYPES } from "../SidurEditor";

/* Draft workspace — a scratch sandbox to try blocks, themes and layout (skikt).
   Nothing is published; everything lives in localStorage. */

type Theme = { id: string; nafn: string; vars: Record<string, string> };

const THEMES: Theme[] = [
  {
    id: "ljost",
    nafn: "☀️ Ljóst",
    vars: { "--bg": "#ffffff", "--ink": "#14181d", "--ink-soft": "#4a5560", "--muted": "#6b7683", "--line": "#e6e9ec", "--paper-2": "#f6f8fa", "--charcoal": "#16233b", "--charcoal-2": "#1f3153", "--red": "#ef5a24", "--red-dark": "#d1481a" },
  },
  {
    id: "eldur",
    nafn: "🔥 Eldur",
    vars: { "--bg": "#fff8f3", "--ink": "#2a1206", "--ink-soft": "#6b3a25", "--muted": "#8a5540", "--line": "#f0d9cb", "--paper-2": "#fdeee4", "--charcoal": "#3a1408", "--charcoal-2": "#521d0c", "--red": "#ef5a24", "--red-dark": "#c6441a" },
  },
  {
    id: "haf",
    nafn: "🌊 Haf",
    vars: { "--bg": "#f3f8fc", "--ink": "#0c2233", "--ink-soft": "#365468", "--muted": "#5b7385", "--line": "#d5e5f0", "--paper-2": "#e8f2f9", "--charcoal": "#0c2f47", "--charcoal-2": "#123f5e", "--red": "#1b86c4", "--red-dark": "#1670a6" },
  },
  {
    id: "skogur",
    nafn: "🌲 Skógur",
    vars: { "--bg": "#f4f8f4", "--ink": "#14261a", "--ink-soft": "#3a5843", "--muted": "#5b7563", "--line": "#d7e6d9", "--paper-2": "#e8f1e9", "--charcoal": "#16311f", "--charcoal-2": "#1e442c", "--red": "#2f9152", "--red-dark": "#277a45" },
  },
  {
    id: "dokkt",
    nafn: "🌙 Dökkt",
    vars: { "--bg": "#14181d", "--ink": "#eef2f6", "--ink-soft": "#a9b4bf", "--muted": "#8592a0", "--line": "#2a323d", "--paper-2": "#1c222a", "--charcoal": "#0e1116", "--charcoal-2": "#1a2330", "--red": "#ff6a3d", "--red-dark": "#e5572c" },
  },
  {
    id: "nott",
    nafn: "🪻 Nótt",
    vars: { "--bg": "#171326", "--ink": "#ece8fb", "--ink-soft": "#b3a9d6", "--muted": "#8f83b8", "--line": "#2c2545", "--paper-2": "#201a35", "--charcoal": "#100c1d", "--charcoal-2": "#241b40", "--red": "#8b6dff", "--red-dark": "#7458e6" },
  },
];

const WIDTHS = [
  { id: "mjott", nafn: "Þröngt", v: "760px" },
  { id: "venju", nafn: "Venjulegt", v: "1120px" },
  { id: "breitt", nafn: "Breitt", v: "1440px" },
];

const SPACINGS = [
  { id: "thett", nafn: "Þétt" },
  { id: "venju", nafn: "Venjulegt" },
  { id: "rumt", nafn: "Rúmt" },
];

const STARTER: Block[] = [
  { gerd: "hero", fyrirsogn: "Prufusíða", undir: "Prófaðu blokkir, þemu og skikt — ekkert er birt.", hnapp_texti: "Hafa samband", hnapp_href: "#hafa-samband" },
  { gerd: "texti", fyrirsogn: "Um verkefnið", texti: "Skrifaðu hér. Bættu við blokkum vinstra megin, veldu þema og stilltu skikt (breidd/bil). Allt vistast sjálfkrafa í vafranum þínum." },
];

type Saved = { blocks: Block[]; theme: string; width: string; spacing: string };

export default function DraftClient() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [theme, setTheme] = useState("ljost");
  const [width, setWidth] = useState("venju");
  const [spacing, setSpacing] = useState("venju");
  const [sel, setSel] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("kjarni_draft");
      if (raw) {
        const d: Saved = JSON.parse(raw);
        setBlocks(Array.isArray(d.blocks) ? d.blocks : STARTER);
        setTheme(d.theme || "ljost");
        setWidth(d.width || "venju");
        setSpacing(d.spacing || "venju");
      } else {
        setBlocks(STARTER);
      }
    } catch {
      setBlocks(STARTER);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem("kjarni_draft", JSON.stringify({ blocks, theme, width, spacing }));
    } catch {}
  }, [blocks, theme, width, spacing, loaded]);

  function addBlock(gerd: string) {
    setBlocks((b) => [...b, { gerd }]);
    setSel(blocks.length);
  }
  function upd(i: number, k: string, v: string) {
    setBlocks((b) => b.map((x, ix) => (ix === i ? { ...x, [k]: v } : x)));
  }
  function del(i: number) {
    setBlocks((b) => b.filter((_, ix) => ix !== i));
    setSel(null);
  }
  function move(i: number, d: number) {
    setBlocks((b) => {
      const j = i + d;
      if (j < 0 || j >= b.length) return b;
      const c = b.slice();
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
    setSel(i + d);
  }
  function resetAll() {
    if (confirm("Hreinsa prufusíðuna og byrja upp á nýtt?")) {
      setBlocks(STARTER);
      setSel(null);
    }
  }
  async function copyJson() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(blocks, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  }

  const th = THEMES.find((t) => t.id === theme) || THEMES[0];
  const w = WIDTHS.find((x) => x.id === width) || WIDTHS[1];
  const previewStyle = useMemo(
    () => ({ ...th.vars, "--container": w.v }) as React.CSSProperties,
    [th, w],
  );

  return (
    <div className="dw">
      <aside className="dw-side">
        <div className="dw-brand">
          <span className="dw-badge">✎</span>
          <div>
            <h1>Prufusvæði</h1>
            <p>Blokkir · þemu · skikt — ekkert birt</p>
          </div>
        </div>

        <div className="dw-grp">
          <h2>🎨 Þema</h2>
          <div className="dw-chips">
            {THEMES.map((t) => (
              <button key={t.id} className={`dw-chip ${theme === t.id ? "on" : ""}`} onClick={() => setTheme(t.id)}>
                {t.nafn}
              </button>
            ))}
          </div>
        </div>

        <div className="dw-grp">
          <h2>📐 Skikt</h2>
          <div className="dw-row">
            <span className="dw-lbl">Breidd</span>
            <div className="dw-seg">
              {WIDTHS.map((x) => (
                <button key={x.id} className={width === x.id ? "on" : ""} onClick={() => setWidth(x.id)}>{x.nafn}</button>
              ))}
            </div>
          </div>
          <div className="dw-row">
            <span className="dw-lbl">Bil</span>
            <div className="dw-seg">
              {SPACINGS.map((x) => (
                <button key={x.id} className={spacing === x.id ? "on" : ""} onClick={() => setSpacing(x.id)}>{x.nafn}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="dw-grp">
          <h2>➕ Bæta við blokk</h2>
          <div className="dw-chips">
            {BLOCK_TYPES.map((t) => (
              <button key={t.gerd} className="dw-chip add" onClick={() => addBlock(t.gerd)}>+ {t.label}</button>
            ))}
          </div>
        </div>

        <div className="dw-grp">
          <h2>🧱 Blokkir ({blocks.length})</h2>
          {blocks.length === 0 ? (
            <p className="dw-empty">Engar blokkir — bættu við að ofan.</p>
          ) : (
            <div className="dw-layers">
              {blocks.map((b, i) => {
                const def = BLOCK_TYPES.find((t) => t.gerd === b.gerd);
                const open = sel === i;
                return (
                  <div className={`dw-layer ${open ? "open" : ""}`} key={i}>
                    <div className="dw-layer-h">
                      <button className="dw-layer-name" onClick={() => setSel(open ? null : i)}>
                        <span aria-hidden="true">{open ? "▾" : "▸"}</span> {def?.label || b.gerd}
                      </button>
                      <div className="dw-layer-btns">
                        <button onClick={() => move(i, -1)} aria-label="Upp" disabled={i === 0}>↑</button>
                        <button onClick={() => move(i, 1)} aria-label="Niður" disabled={i === blocks.length - 1}>↓</button>
                        <button onClick={() => del(i)} aria-label="Eyða">✕</button>
                      </div>
                    </div>
                    {open && (
                      <div className="dw-fields">
                        {def?.fields.map(([k, label, ta]) => (
                          <label className="dw-field" key={k}>
                            <span>{label}</span>
                            {ta ? (
                              <textarea rows={3} value={b[k] || ""} onChange={(e) => upd(i, k, e.target.value)} />
                            ) : (
                              <input value={b[k] || ""} onChange={(e) => upd(i, k, e.target.value)} />
                            )}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="dw-actions">
          <button className="dw-act" onClick={copyJson}>{copied ? "✓ Afritað" : "⧉ Afrita JSON"}</button>
          <button className="dw-act danger" onClick={resetAll}>↺ Hreinsa</button>
        </div>
        <p className="dw-hint">Afritaðu JSON og límdu inn í Stjórnborð → Síður til að gera úr þessu alvöru síðu.</p>
      </aside>

      <main className="dw-stage">
        <div className={`dw-preview draft-preview sp-${spacing}`} style={previewStyle}>
          {blocks.length === 0 ? (
            <div className="dw-blank">Bættu við blokk til að sjá forskoðun.</div>
          ) : (
            <PageBlocks blocks={blocks} />
          )}
        </div>
      </main>
    </div>
  );
}
