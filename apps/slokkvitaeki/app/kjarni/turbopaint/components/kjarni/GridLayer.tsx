"use client";

import { memo } from "react";
import { Shape } from "react-konva";
import type { Camera } from "../../lib/board/types";
import { effectiveGridGap } from "../../lib/board/geometry";

/** Minnisað (11.11.2026): sceneFunc var nýtt fall við hverja teikningu BoardCanvas, svo rúðunetið var teiknað upp á nýtt við
 * hverja hreyfingu á vegg (mælt: 59 teikningar á 60 hreyfingum). Það breytist aðeins með myndavélinni og stærð sviðsins. */
export const GridLayer = memo(GridLayerImpl);

function GridLayerImpl({
  camera,
  width,
  height,
}: {
  camera: Camera;
  width: number;
  height: number;
}) {
  return (
    <Shape
      perfectDrawEnabled={false}
      // Grindin er viðmót, ekki innihald — útflutningur (PNG/PDF/A4-flísar)
      // felur allt sem heitir ui-only, en grindin vantaði nafnið og prentaðist
      // því með á hvert einasta kort.
      name="ui-only"
      listening={false}
      sceneFunc={(ctx) => {
        const worldLeft = -camera.x / camera.scale;
        const worldTop = -camera.y / camera.scale;
        const worldRight = worldLeft + width / camera.scale;
        const worldBottom = worldTop + height / camera.scale;
        const gap = effectiveGridGap(camera, width, height);
        const startX = Math.floor(worldLeft / gap) * gap;
        const startY = Math.floor(worldTop / gap) * gap;
        const r = Math.max(0.7, 1.15 / camera.scale);
        ctx.fillStyle = "#d4cdc2";
        for (let x = startX; x <= worldRight; x += gap) {
          for (let y = startY; y <= worldBottom; y += gap) {
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }}
    />
  );
}
