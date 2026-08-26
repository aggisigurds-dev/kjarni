"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { SKINS, TOOLS, SKIN_KEY, readSkin, type SkinId, type ToolId } from "./skins";

const SkinCtx = createContext<{ skin: SkinId; setSkin: (id: SkinId) => void }>({
  skin: "command",
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
  const [skin, setSkin] = useState<SkinId>("command");
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
      <div className="stn" data-skin={skin} data-tool={tool}>
        <header className="stn-bar">
          <a className="stn-home" href="/kjarni">
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
    </SkinCtx.Provider>
  );
}
