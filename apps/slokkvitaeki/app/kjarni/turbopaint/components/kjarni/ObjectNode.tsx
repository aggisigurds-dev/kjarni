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
import {
  listRooms,
  primaryRoomBoxId,
  roomCounterIndex,
  roomKeyOf,
} from "../../lib/board/rooms";
import { snapPoint, useBoardStore } from "../../lib/board/store";
import { checkboxBadge, checkboxPaint, isCheckbox, tickPoints } from "../../lib/board/checkbox";
import type { BoardObject } from "../../lib/board/types";
import { merkiMyndar } from "../../lib/board/margar-haedir";
import { bladIBordi } from "../../lib/board/uttekt";
import { useUttektGogn } from "../../lib/board/uttekt-gogn";
import { erVeggur } from "../../lib/board/veggja-leidretting";
import { synilegurVegglitur, useVeggjaSyn } from "../../lib/board/veggja-syn";
import { SkarptPdfLag } from "./SkarptPdfLag";
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
    <>
      <KonvaImage
        image={image}
        width={obj.width}
        height={obj.height}
        shadowColor="rgba(28,25,23,0.18)"
        shadowBlur={18}
        shadowOffsetY={6}
        shadowEnabled
      />
      {/* Vigur-PDF: sýnilegi hlutinn teiknaður skarpt þegar þysjað er nær en myndin dugar (aðeins á skjánum). */}
      <SkarptPdfLag obj={obj} raster={image} />
    </>
  );
}

/** Úttektarteikning: blaðið utan við skurð hæðarinnar (húsið) dekkist lítillega — aðeins á skjánum (ui-only fer ekki í
 * útflutning) og myndin sjálf er ósnert, svo hnit merkja og veggja haldast. */
function SkurdarSkuggi({ obj }: { obj: Extract<BoardObject, { type: "image" }> }) {
  const t = obj.uttekt;
  const sk = t?.skurdur;
  if (!t || !sk || !(sk.w > 8) || !(sk.h > 8) || !(t.frumB > 0) || !(t.frumH > 0)) return null;
  // Skorin mynd („Croppa oft"): blaðið nær út fyrir hana — skurðurinn miðast við allt blaðið (sýndarblaðið).
  const blad = bladIBordi(obj, { b: t.frumB, h: t.frumH }, t.myndSkurdur);
  const kx = blad.width / t.frumB, ky = blad.height / t.frumH;
  const ox = blad.x - obj.x, oy = blad.y - obj.y;
  const x0 = Math.max(0, ox + sk.x * kx), y0 = Math.max(0, oy + sk.y * ky);
  const x1 = Math.min(obj.width, ox + (sk.x + sk.w) * kx), y1 = Math.min(obj.height, oy + (sk.y + sk.h) * ky);
  if (x1 <= x0 || y1 <= y0) return null;
  // Myndin croppuð (nánast) að skurði hæðarinnar: ekkert utan hússins að skyggja — örmjóar ræmur sýndust bara sem rammi.
  const tolX = obj.width * 0.03, tolY = obj.height * 0.03;
  if (x0 <= tolX && y0 <= tolY && obj.width - x1 <= tolX && obj.height - y1 <= tolY) return null;
  const fill = "rgba(28,25,23,0.16)";
  const reitir = [
    { x: 0, y: 0, width: obj.width, height: y0 },
    { x: 0, y: y1, width: obj.width, height: obj.height - y1 },
    { x: 0, y: y0, width: x0, height: y1 - y0 },
    { x: x1, y: y0, width: obj.width - x1, height: y1 - y0 },
  ].filter((r) => r.width > 0 && r.height > 0);
  return (
    <>
      {reitir.map((r, i) => (
        <Rect key={i} {...r} fill={fill} listening={false} name="ui-only" />
      ))}
    </>
  );
}

/** Merkið á mynd („Croppa oft"): hæðin sem hlutinn er tengdur („2. hæð") eða „Hluti 2 · ótengdur". Fast í skjástærð,
 * efst til vinstri á myndinni — aðeins á skjánum (ui-only). */
function HaedarMerki({ obj }: { obj: Extract<BoardObject, { type: "image" }> }) {
  const scale = useBoardStore((s) => s.camera.scale);
  const gogn = useUttektGogn((s) => s.gogn);
  if (!obj.bladhluti) return null;
  const cid = obj.uttekt?.companyId ?? obj.bladhluti.companyId;
  const texti = merkiMyndar(obj, gogn && gogn.companyId === cid ? gogn.haedir : null);
  if (!texti) return null;
  const k = 1 / Math.max(scale, 0.01);
  const fs = 14 * k, pad = 6 * k;
  const breidd = (texti.length * 7.6 + 2 * 6) * k;
  const tengd = !!obj.uttekt;
  return (
    <Group x={8 * k} y={8 * k} listening={false} name="ui-only">
      <Rect width={breidd} height={fs + 2 * pad} fill={tengd ? "#FE653F" : "#44403c"} opacity={0.95} cornerRadius={5 * k} />
      <KonvaText x={pad} y={pad} text={texti} fontSize={fs} fontStyle="bold" fill="#ffffff" />
    </Group>
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
  // „Lita veggi" (F): veggir teiknaðir í skærum lit eftir tegund — aðeins sýn, geymdi liturinn breytist ekki.
  const litaVeggi = useVeggjaSyn((s) => s.lita);
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
      // Tákn festast ALDREI við grindina. Grindarbilið tvöfaldast eftir því sem
      // þysjað er út (effectiveGridGap heldur punktafjöldanum í skefjum), svo á
      // heilli hústeikningu var stökkið orðið margir metrar — ómögulegt að hitta
      // á vegg eða hurð. Veggir og form halda festingunni óbreyttri.
      if (!s.snap || obj.type === "symbol") return pos;
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
        <SkurdarSkuggi obj={obj} />
        <HaedarMerki obj={obj} />
      </Group>
    );
  }

  if (isCheckbox(obj)) {
    const paint = checkboxPaint(obj);
    const badge = checkboxBadge(obj.width, obj.height);
    const toggle = (e: { cancelBubble: boolean }) => {
      e.cancelBubble = true;
      useBoardStore.getState().toggleChecked(obj.id);
    };
    return (
      <Group {...common} width={obj.width} height={obj.height}>
        <Rect
          width={obj.width}
          height={obj.height}
          fill={paint.fill}
          stroke={paint.stroke}
          strokeWidth={obj.strokeWidth}
          cornerRadius={obj.cornerRadius}
        />
        {/* Hakreiturinn í horninu — smellur hér hakar við án þess að velja/draga. */}
        <Group x={badge.x} y={badge.y} name="checkbox-badge" onClick={toggle} onTap={toggle}>
          <Rect
            width={badge.size}
            height={badge.size}
            cornerRadius={Math.round(badge.size / 5)}
            fill={paint.badgeFill}
            stroke={paint.badgeStroke}
            strokeWidth={1.5}
          />
          <Line
            points={tickPoints(badge.size)}
            stroke={paint.tick}
            strokeWidth={Math.max(2, badge.size / 8)}
            lineCap="round"
            lineJoin="round"
            listening={false}
          />
        </Group>
      </Group>
    );
  }

  if (obj.type === "rect") {
    const objects = useBoardStore.getState().objects;
    const room =
      obj.isRoom ? listRooms(objects).find((r) => r.ids.includes(obj.id)) : undefined;
    const isPrimary = room ? primaryRoomBoxId(objects, room.ids) === obj.id : true;
    const counter = room?.counted ? roomCounterIndex(objects, roomKeyOf(obj)) : null;
    // Gegnsær ferningur eða 🏠 rými á kvörðuðu borði sýnir b × h og m² —
    // litaðir venjulegir ferningar eru merking án mála.
    // "Frádráttur…" telst neikvætt; frátalin rými sýna "(frátalið)".
    const showDims =
      isPrimary &&
      (obj.fill === "transparent" || obj.isRoom) &&
      pixelsPerMeter &&
      pixelsPerMeter > 0;
    const negative = obj.name.startsWith("Frádráttur");
    const roomName =
      isPrimary && obj.isRoom && obj.name && obj.name !== "Rými" && obj.name !== "Ferningur"
        ? obj.name
        : "";
    const wM = showDims && pixelsPerMeter ? obj.width / pixelsPerMeter : 0;
    const hM = showDims && pixelsPerMeter ? obj.height / pixelsPerMeter : 0;
    const areaM2 =
      showDims && pixelsPerMeter && room
        ? objects
            .filter((o): o is typeof obj => o.type === "rect" && room.ids.includes(o.id))
            .reduce((s, r) => s + (r.width / pixelsPerMeter) * (r.height / pixelsPerMeter), 0)
        : wM * hM;
    const labelLines = [
      roomName,
      showDims && !(room && room.ids.length > 1) ? `${formatMm(wM)} × ${formatMm(hM)} mm` : "",
      showDims
        ? `${negative ? "−" : ""}${formatM2(areaM2)}${obj.roomExcluded ? " (frátalið)" : ""}`
        : "",
    ].filter(Boolean);
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
        {counter != null && isPrimary ? (
          <>
            <Rect
              x={8}
              y={8}
              width={24}
              height={24}
              cornerRadius={12}
              fill={obj.stroke || "#FE653F"}
              listening={false}
            />
            <KonvaText
              x={8}
              y={12}
              width={24}
              text={String(counter)}
              fontSize={13}
              fontStyle="bold"
              align="center"
              fill="#ffffff"
              fontFamily="Inter, sans-serif"
              listening={false}
            />
          </>
        ) : null}
        {labelLines.length ? (
          <KonvaText
            width={Math.max(80, obj.width)}
            x={obj.width < 80 ? (obj.width - 80) / 2 : 0}
            y={Math.max(counter != null ? 36 : 4, obj.height / 2 - labelLines.length * 9)}
            text={labelLines.join("\n")}
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
    const vegglitur = litaVeggi && erVeggur(obj) ? synilegurVegglitur(obj.stroke, obj.veggTegund, true) : null;
    return (
      <Group {...common} opacity={vegglitur ? 1 : common.opacity}>
        <Line
          points={obj.points}
          stroke={vegglitur ?? obj.stroke}
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
        <SymbolNode symbolId={obj.symbolId} size={obj.size} label={obj.label} litur={obj.uttektLitur} />
      </Group>
    );
  }

  return null;
}
