"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ARTCRAFT_INTERFACES, artcraftInterfaceFromPath, type ArtcraftInterfaceId } from "./apps";

// Mest notuðu Kjarni-tólin birtast beint í fliparöðinni. Hin
// (installed CraftApps, local-first/less-used og Leiðarvísir) fara í
// „Fleiri ▾" dropdown svo mobile-flipabarinn er ekki 29 atriði á lengd.
const PRIMARY_IDS: ReadonlyArray<ArtcraftInterfaceId> = [
  "hub",
  "vinnslur",
  "tol",
  "skyjastudio",
  "skyjahreyfimynd",
  "upplyfting",
  "breyta",
  "tonsmid",
  "bakgrunnur",
  "studio",
];

const PRIMARY_SET = new Set<ArtcraftInterfaceId>(PRIMARY_IDS);

export function ArtCraftDock() {
  const pathname = usePathname() || "";
  const current = artcraftInterfaceFromPath(pathname);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDetailsElement>(null);

  // Primary í skilgreindri röð; secondary í þeirri röð sem þau birtast
  // í ARTCRAFT_INTERFACES (CraftApps saman, local tools saman).
  const primary = PRIMARY_IDS.map((id) => ARTCRAFT_INTERFACES.find((i) => i.id === id)).filter(
    (i): i is (typeof ARTCRAFT_INTERFACES)[number] => i !== undefined,
  );
  const secondary = ARTCRAFT_INTERFACES.filter((i) => !PRIMARY_SET.has(i.id));
  const currentInSecondary = secondary.some((i) => i.id === current);

  // Loka dropdown þegar user klikkar í burtu, eða við route-breytingu.
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    function onDocClick(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [moreOpen]);

  return (
    <nav className="ac-dock" aria-label="ArtCraft-viðmót">
      {primary.map((item) => (
        <a
          key={item.id}
          href={item.href}
          className={item.id === current ? "on" : undefined}
          aria-current={item.id === current ? "page" : undefined}
        >
          <span aria-hidden="true">{item.icon}</span>
          {item.name}
        </a>
      ))}
      <details
        ref={moreRef}
        className={`ac-dock-more ${currentInSecondary ? "on" : ""}`}
        open={moreOpen}
        onToggle={(e) => setMoreOpen((e.currentTarget as HTMLDetailsElement).open)}
      >
        <summary>
          <span aria-hidden="true">⋯</span>
          Fleiri
        </summary>
        <div className="ac-dock-more-panel" role="menu">
          {secondary.map((item) => (
            <a
              key={item.id}
              href={item.href}
              className={item.id === current ? "on" : undefined}
              aria-current={item.id === current ? "page" : undefined}
              role="menuitem"
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.name}
            </a>
          ))}
        </div>
      </details>
    </nav>
  );
}
