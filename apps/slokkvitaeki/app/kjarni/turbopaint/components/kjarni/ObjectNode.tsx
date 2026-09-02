"use client";

import type Konva from "konva";
import { useEffect, useState } from "react";
import {
  Arrow,
  Ellipse,
  Group,
  Image as KonvaImage,
  Line,
  Rect,
  Text as KonvaText,
} from "react-konva";
import { getAssetUrl } from "../../lib/board/assets";
import { dashArray, formatLength, formatM2, formatMm, lineLength } from "../../lib/board/geometry";
import { isDrawnVisible } from "../../lib/board/layers";
import { snapPoint, useBoardStore } from "../../lib/board/store";
import type { BoardObject } from "../../lib/board/types";
import { SymbolNode } from "./SymbolNode";

function useAsset(assetId: string) {
  const [image, setImage] = useState<HTMLImageElement | undefined>();
  useEffect(() => {
    const url = getAssetUrl(assetId);
    if (!url) return;
    const img = new window.Image();
    img.onload = () => setImage(img);
    img.src = url;
    return () => {
      img.onload = null;
    };
  }, [assetId]);
  return image;
}

function FloorplanImage({ obj }: { obj: Extract<BoardObject, { type: "image" }> }) {
  const image = useAsset(obj.assetId);
  return (
    <KonvaImage
      image={image}
      width={obj.width}
      height={obj.height}
      shadowColor="rgba(28,25,23,0.18)"
      shadowBlur={18}
      shadowOffsetY={6}
      shadowEnabled
    />
  );
}

export function ObjectNode({
  obj,
  isSelected = false,
  pixelsPerMeter,
  draggable,
  listening = draggable,
  onDragStart,
  onDragMove,
  onDragEnd,
  onTransformEnd,
  onClick,
  onDblClick,
}: {
  obj: BoardObject;
  isSelected?: boolean;
  pixelsPerMeter: number | null;
  draggable: boolean;
  listening?: boolean;
  onDragStart?: (id: string) => void;
  onDragMove?: (id: string, x: number, y: number) => void;
  onDragEnd: (id: string, x: number, y: number) => void;
  onTransformEnd: (id: string, node: { x: number; y: number; rotation: number; scaleX: number; scaleY: number; width?: number; height?: number }) => void;
  onClick: (id: string, shift: boolean) => void;
  onDblClick: (id: string) => void;
}) {
  const layers = useBoardStore((s) => s.layers);
  const symbolOpacity = useBoardStore((s) => s.symbolOpacity);
  const selGlow = isSelected
    ? { shadowColor: "#FE653F", shadowBlur: 22, shadowOpacity: 0.85, shadowEnabled: true }
    : { shadowEnabled: false };

  const common = {
    id: obj.id,
    name: obj.id,
    x: obj.x,
    y: obj.y,
    rotation: obj.rotation,
    opacity: obj.opacity,
    ...selGlow,
    visible: isDrawnVisible(obj, layers),
    draggable,
    listening,
    // „Festa við grind": hluturinn smellur á sýnilegu grindina MEÐAN dregið
    // er (ekki bara við sleppingu). dragBoundFunc fær absolute/skjá-hnit.
    dragBoundFunc(pos: { x: number; y: number }) {
      const s = useBoardStore.getState();
      if (!s.snap) return pos;
      const cam = s.camera;
      const sn = snapPoint((pos.x - cam.x) / cam.scale, (pos.y - cam.y) / cam.scale);
      return { x: sn.x * cam.scale + cam.x, y: sn.y * cam.scale + cam.y };
    },
    onClick: (e: { evt: MouseEvent; cancelBubble: boolean }) => {
      e.cancelBubble = true;
      onClick(obj.id, e.evt.shiftKey);
    },
    onTap: () => onClick(obj.id, false),
    onDblClick: () => onDblClick(obj.id),
    onDblTap: () => onDblClick(obj.id),
    onDragStart: () => onDragStart?.(obj.id),
    onDragMove: (e: { target: { x: () => number; y: () => number } }) =>
      onDragMove?.(obj.id, e.target.x(), e.target.y()),
    onDragEnd: (e: { target: { x: () => number; y: () => number } }) =>
      onDragEnd(obj.id, e.target.x(), e.target.y()),
    onTransformEnd: (e: Konva.KonvaEventObject<Event>) => {
      const node = e.target as Konva.Node;
      onTransformEnd(obj.id, {
        x: node.x(),
        y: node.y(),
        rotation: node.rotation(),
        scaleX: node.scaleX(),
        scaleY: node.scaleY(),
        width: node.width(),
        height: node.height(),
      });
      node.scaleX(1);
      node.scaleY(1);
    },
  };

  if (obj.type === "image") {
    return (
      <Group
        {...common}
        width={obj.width}
        height={obj.height}
        onMouseEnter={(e) => {
          if (!draggable) return;
          const container = e.target.getStage()?.container();
          if (container) container.style.cursor = "grab";
        }}
        onMouseLeave={(e) => {
          const container = e.target.getStage()?.container();
          if (container) container.style.cursor = "";
        }}
      >
        <FloorplanImage obj={obj} />
      </Group>
    );
  }

  if (obj.type === "rect") {
    // Gegnsær ferningur eða 🏠 rými á kvörðuðu borði sýnir b × h og m² —
    // litaðir venjulegir ferningar eru merking án mála.
    // "Frádráttur…" telst neikvætt; frátalin rými sýna "(frátalið)".
    const showDims = (obj.fill === "transparent" || obj.isRoom) && pixelsPerMeter && pixelsPerMeter > 0;
    const negative = obj.name.startsWith("Frádráttur");
    const roomName =
      obj.isRoom && obj.name && obj.name !== "Rými" && obj.name !== "Ferningur" ? obj.name : "";
    const wM = showDims ? obj.width / pixelsPerMeter : 0;
    const hM = showDims ? obj.height / pixelsPerMeter : 0;
    return (
      <Group {...common}>
        <Rect
          width={obj.width}
          height={obj.height}
          fill={obj.fill === "transparent" ? undefined : obj.fill}
          stroke={obj.stroke}
          strokeWidth={obj.strokeWidth}
          cornerRadius={obj.cornerRadius}
        />
        {showDims ? (
          <KonvaText
            width={Math.max(80, obj.width)}
            x={obj.width < 80 ? (obj.width - 80) / 2 : 0}
            y={Math.max(4, obj.height / 2 - (roomName ? 27 : 18))}
            text={`${roomName ? `${roomName}\n` : ""}${formatMm(wM)} × ${formatMm(hM)} mm\n${negative ? "−" : ""}${formatM2(wM * hM)}${obj.roomExcluded ? " (frátalið)" : ""}`}
            fontSize={15}
            fontStyle="bold"
            align="center"
            fill={negative ? "#dc2626" : obj.roomExcluded ? "#78716c" : obj.stroke}
            stroke="#ffffff"
            strokeWidth={3}
            fillAfterStrokeEnabled
            fontFamily="Inter, sans-serif"
            listening={false}
          />
        ) : null}
      </Group>
    );
  }

  if (obj.type === "ellipse") {
    return (
      <Group {...common} width={obj.width} height={obj.height}>
        <Ellipse
          x={obj.width / 2}
          y={obj.height / 2}
          radiusX={Math.max(4, obj.width / 2)}
          radiusY={Math.max(4, obj.height / 2)}
          fill={obj.fill === "transparent" ? undefined : obj.fill}
          stroke={obj.stroke}
          strokeWidth={obj.strokeWidth}
        />
      </Group>
    );
  }

  if (
    obj.type === "line" ||
    obj.type === "polyline" ||
    obj.type === "pen" ||
    obj.type === "measure"
  ) {
    const length = obj.type === "measure" ? lineLength(obj.points) : 0;
    return (
      <Group {...common}>
        <Line
          points={obj.points}
          stroke={obj.stroke}
          strokeWidth={obj.strokeWidth}
          lineCap="round"
          lineJoin="round"
          dash={dashArray(obj.dash, obj.strokeWidth)}
          hitStrokeWidth={Math.max(16, obj.strokeWidth * 3)}
        />
        {obj.type === "measure" ? (
          <KonvaText
            x={(obj.points[0] + obj.points[obj.points.length - 2]) / 2}
            y={(obj.points[1] + obj.points[obj.points.length - 1]) / 2 - 18}
            text={formatLength(length, pixelsPerMeter, obj.meters ?? null)}
            fontSize={16}
            fontStyle="bold"
            fill={obj.stroke}
            stroke="#ffffff"
            strokeWidth={3}
            fillAfterStrokeEnabled
            fontFamily="Inter, sans-serif"
          />
        ) : null}
      </Group>
    );
  }

  if (obj.type === "arrow") {
    return (
      <Group {...common}>
        <Arrow
          points={obj.points}
          stroke={obj.stroke}
          fill={obj.stroke}
          strokeWidth={obj.strokeWidth}
          pointerLength={14}
          pointerWidth={14}
          lineCap="round"
          lineJoin="round"
          dash={dashArray(obj.dash, obj.strokeWidth)}
          hitStrokeWidth={Math.max(16, obj.strokeWidth * 3)}
        />
      </Group>
    );
  }

  if (obj.type === "text") {
    return (
      <KonvaText
        {...common}
        text={obj.text}
        fontSize={obj.fontSize}
        fill={obj.fill}
        width={obj.width}
        fontStyle={obj.fontStyle}
        align={obj.align}
        fontFamily="Inter, sans-serif"
        lineHeight={1.25}
      />
    );
  }

  if (obj.type === "sticky") {
    return (
      <Group {...common}>
        <Rect
          width={obj.width}
          height={obj.height}
          fill={obj.fill}
          cornerRadius={4}
          shadowColor="rgba(28,25,23,0.22)"
          shadowBlur={10}
          shadowOffsetY={3}
        />
        <KonvaText
          x={12}
          y={12}
          width={obj.width - 24}
          height={obj.height - 24}
          text={obj.text}
          fontSize={obj.fontSize}
          fill="#1c1917"
          fontFamily="Inter, sans-serif"
          lineHeight={1.3}
        />
      </Group>
    );
  }

  if (obj.type === "symbol") {
    return (
      <Group
        {...common}
        // Sameiginlega dofnunin margfaldast við ógegnsæi hlutarins sjálfs, svo
        // tákn sem var handdofnað verður aldrei skýrara en það var.
        opacity={obj.opacity * symbolOpacity}
        onTransformEnd={(e) => {
          const node = e.target as Konva.Node;
          const scale = (Math.abs(node.scaleX()) + Math.abs(node.scaleY())) / 2;
          const size = Math.max(24, obj.size * scale);
          node.scaleX(1);
          node.scaleY(1);
          onTransformEnd(obj.id, {
            x: node.x(),
            y: node.y(),
            rotation: node.rotation(),
            scaleX: 1,
            scaleY: 1,
            width: size,
            height: size,
          });
        }}
      >
        <SymbolNode symbolId={obj.symbolId} size={obj.size} label={obj.label} />
      </Group>
    );
  }

  return null;
}
