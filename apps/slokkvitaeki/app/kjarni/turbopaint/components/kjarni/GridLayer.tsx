"use client";

import { Shape } from "react-konva";
import type { Camera } from "../../lib/board/types";
import { GRID_GAP } from "../../lib/board/geometry";

export function GridLayer({
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
      listening={false}
      sceneFunc={(ctx) => {
        const worldLeft = -camera.x / camera.scale;
        const worldTop = -camera.y / camera.scale;
        const worldRight = worldLeft + width / camera.scale;
        const worldBottom = worldTop + height / camera.scale;
        let gap = GRID_GAP;
        const cols = (worldRight - worldLeft) / gap;
        const rows = (worldBottom - worldTop) / gap;
        while (cols * (GRID_GAP / gap) * rows * (GRID_GAP / gap) > 9000) {
          gap *= 2;
        }
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
