"use client";

import { usePathname } from "next/navigation";
import { ARTCRAFT_INTERFACES, artcraftInterfaceFromPath } from "./apps";

export function ArtCraftDock() {
  const pathname = usePathname() || "";
  const current = artcraftInterfaceFromPath(pathname);

  return (
    <nav className="ac-dock" aria-label="ArtCraft-viðmót">
      {ARTCRAFT_INTERFACES.map((item) => (
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
    </nav>
  );
}
