"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { DesktopView } from "./DesktopView";
import { SKINS, TOOLS, SKIN_KEY, DEFAULT_SKIN, readSkin, type SkinId, type ToolId } from "./skins";
import { rgFont, rgMono } from "./ragnarok/fonts";
import "./ragnarok/ragnarok.css";
import "./ragnarok/kjarni-ragnarok.css";

const SkinCtx = createContext<{ skin: SkinId; setSkin: (id: SkinId) => void }>({
  skin: DEFAULT_SKIN,
  setSkin: () => {},
});

export function useStationSkin() {
  return useContext(SkinCtx);
}

export function StationChrome({
  tool,
  children,
}: {
  tool: ToolId;
  children: ReactNode;
}) {
  const [skin, setSkin] = useState<SkinId>(DEFAULT_SKIN);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSkin(readSkin());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(SKIN_KEY, skin);
    document.documentElement.dataset.kjarniSkin = skin;
    return () => {
      delete document.documentElement.dataset.kjarniSkin;
    };
  }, [skin, ready]);

  return (
    <SkinCtx.Provider value={{ skin, setSkin }}>
      <DesktopView enabled={tool !== "turbopaint" && tool !== "bord"}>
        <div className={`stn ${rgFont.variable} ${rgMono.variable}`} data-skin={skin} data-tool={tool}>
          <header className="stn-bar">
            <a className="stn-home" href="/kjarni">
              <span className="stn-mark" aria-hidden="true"><i /><i /></span>
              <span aria-hidden="true">◉</span> Kjarni
            </a>
            <nav className="stn-tools" aria-label="Kjarni-tól">
              {TOOLS.map((item) => (
                <a
                  key={item.id}
                  href={item.href}
                  className={item.id === tool ? "on" : ""}
                  aria-current={item.id === tool ? "page" : undefined}
                  {...("ext" in item && item.ext ? { target: "_blank", rel: "noreferrer" } : {})}
                >
                  {item.label}
                  {"ext" in item && item.ext ? " ↗" : ""}
                </a>
              ))}
            </nav>
            {skin === "ragnarok" && <Klukka />}
            <div className="stn-skins" role="tablist" aria-label="Þema og útlit">
              {SKINS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="tab"
                  data-id={option.id}
                  aria-selected={skin === option.id}
                  aria-label={`${option.label} — ${option.hint}`}
                  title={option.hint}
                  className={skin === option.id ? "on" : ""}
                  onClick={() => setSkin(option.id)}
                >
                  <i className="ms-skin-pip" aria-hidden="true" />
                  {option.label}
                </button>
              ))}
            </div>
          </header>
          <div className="stn-body">{children}</div>
        </div>
      </DesktopView>
    </SkinCtx.Provider>
  );
}

/* Klukkan í Ragnarök-stikunni — eigin state svo aðeins hún teiknast á sekúndu fresti. */
function Klukka() {
  const [nu, setNu] = useState("");
  useEffect(() => {
    const tik = () =>
      setNu(new Date().toLocaleTimeString("is-IS", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }));
    tik();
    const id = window.setInterval(tik, 1000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className="stn-clock" aria-label="Klukka">
      <i aria-hidden="true" />
      <span suppressHydrationWarning>{nu || "--:--:--"}</span>
    </div>
  );
}
