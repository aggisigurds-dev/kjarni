"use client";

import { Circle, Group, Line, Rect, Text as KonvaText } from "react-konva";
import { getSymbol, symbolColors } from "../../lib/board/symbols";

function Glyph({
  id,
  color,
}: {
  id: string;
  color: string;
}) {
  const s = { stroke: color, strokeWidth: 1.6, fillEnabled: false, lineCap: "round" as const, lineJoin: "round" as const };
  const f = { fill: color, strokeEnabled: false };

  switch (id) {
    case "extinguisher":
      return (
        <Group>
          <Rect x={9} y={6} width={7} height={13} cornerRadius={1} {...f} />
          <Rect x={10.5} y={3} width={4} height={3} {...f} />
          <Line points={[14.5, 3, 18, 1.5, 18, 5]} {...s} />
          <Rect x={11} y={19} width={3} height={2} {...f} />
        </Group>
      );
    case "sign-extinguisher":
      return (
        <Group>
          <Rect x={10} y={6} width={4} height={8} {...f} />
          <Rect x={11} y={4.5} width={2.2} height={2} {...f} />
        </Group>
      );
    case "sign-hose":
      return (
        <Group>
          <Circle x={12} y={11} radius={5} {...s} />
        </Group>
      );
    case "hose":
      return (
        <Group>
          <Circle x={12} y={13} radius={6.5} {...s} />
          <Circle x={12} y={13} radius={2.2} {...f} />
          <Line points={[12, 6.5, 12, 3, 16, 3]} {...s} />
        </Group>
      );
    case "hydrant":
      return (
        <Group>
          <Rect x={8} y={8} width={8} height={11} {...f} />
          <Rect x={6} y={11} width={12} height={3} {...f} />
          <Rect x={10} y={4} width={4} height={4} {...f} />
        </Group>
      );
    case "alarm":
      return (
        <Group>
          <Rect x={6} y={6} width={12} height={12} {...s} />
          <Circle x={12} y={12} radius={3} {...f} />
        </Group>
      );
    case "detector":
      return (
        <Group>
          <Circle x={12} y={12} radius={7} {...s} />
          <Circle x={12} y={12} radius={2.4} {...f} />
        </Group>
      );
    case "sprinkler":
      return (
        <Group>
          <Line points={[12, 4, 12, 10]} {...s} />
          <Line points={[6, 10, 18, 10]} {...s} />
          <Line points={[7, 10, 4, 18]} {...s} />
          <Line points={[12, 10, 12, 19]} {...s} />
          <Line points={[17, 10, 20, 18]} {...s} />
        </Group>
      );
    case "blanket":
      return (
        <Group>
          <Rect x={6} y={5} width={12} height={14} cornerRadius={1} {...s} />
          <Line points={[9, 9, 15, 9, 15, 15, 9, 15]} {...s} />
        </Group>
      );
    case "firedoor":
      return (
        <Group>
          <Rect x={6} y={4} width={12} height={16} {...s} />
          <Circle x={15} y={12} radius={1.1} {...f} />
          <Line points={[8, 4, 8, 20]} {...s} />
        </Group>
      );
    case "firewall":
      return (
        <Group>
          <Line points={[5, 6, 19, 6]} {...s} />
          <Line points={[5, 12, 8, 12, 10, 12, 13, 12, 16, 12, 19, 12]} {...s} />
          <Line points={[5, 18, 19, 18]} {...s} />
        </Group>
      );
    case "exit":
      return (
        <Group>
          <Rect x={4} y={6} width={8} height={12} {...s} />
          <Line points={[10, 12, 19, 12]} {...s} />
          <Line points={[15, 8, 19, 12, 15, 16]} {...s} />
        </Group>
      );
    case "route":
      return (
        <Group>
          <Line points={[5, 17, 10, 7, 14, 14, 19, 6]} {...s} />
        </Group>
      );
    case "assembly":
      return (
        <Group>
          <Circle x={8} y={9} radius={2} {...f} />
          <Circle x={16} y={9} radius={2} {...f} />
          <Line points={[8, 12, 8, 19]} {...s} />
          <Line points={[16, 12, 16, 19]} {...s} />
          <Line points={[8, 14, 16, 14]} {...s} />
        </Group>
      );
    case "stairs":
      return (
        <Group>
          <Line points={[5, 18, 9, 18, 9, 14, 13, 14, 13, 10, 17, 10, 17, 6, 20, 6]} {...s} />
        </Group>
      );
    case "e-light":
      return (
        <Group>
          <Rect x={6} y={8} width={12} height={8} {...s} />
          <Line points={[12, 8, 12, 5, 16, 5]} {...s} />
          <Line points={[9, 12, 15, 12]} {...s} />
        </Group>
      );
    case "firstaid":
      return (
        <Group>
          <Rect x={10} y={5} width={4} height={14} {...f} />
          <Rect x={5} y={10} width={14} height={4} {...f} />
        </Group>
      );
    case "phone":
      return (
        <Group>
          <Rect x={8} y={4} width={8} height={16} cornerRadius={1.5} {...s} />
          <Line points={[10, 7, 14, 7]} {...s} />
        </Group>
      );
    case "nosmoke":
      return (
        <Group>
          <Circle x={12} y={12} radius={7.5} {...s} />
          <Line points={[7, 7, 17, 17]} {...s} />
        </Group>
      );
    case "electric":
      return (
        <Group>
          {/* Konva fills a Line only when closed — without it the bolt was invisible */}
          <Line points={[13, 4, 8, 13, 12, 13, 11, 20, 16, 10, 12, 10, 13, 4]} closed {...f} />
        </Group>
      );
    case "water":
      return (
        <Group>
          <Line points={[12, 5, 12, 14]} {...s} />
          <Circle x={12} y={17} radius={2.4} {...f} />
          <Line points={[8, 8, 16, 8]} {...s} />
        </Group>
      );
    case "gas":
      return (
        <Group>
          <Rect x={8} y={8} width={8} height={11} {...s} />
          <Circle x={12} y={6} radius={2.2} {...s} />
        </Group>
      );
    case "elevator":
      return (
        <Group>
          <Rect x={6} y={4} width={12} height={16} {...s} />
          <Line points={[12, 4, 12, 20]} {...s} />
          <Line points={[8, 10, 10, 8, 10, 12]} {...s} />
          <Line points={[16, 14, 14, 16, 14, 12]} {...s} />
        </Group>
      );
    case "wc":
      return (
        <Group>
          <Circle x={12} y={8} radius={2.4} {...f} />
          <Line points={[12, 11, 12, 16, 9, 20]} {...s} />
          <Line points={[12, 16, 15, 20]} {...s} />
          <Line points={[9, 13, 15, 13]} {...s} />
        </Group>
      );
    case "pin":
      return (
        <Group>
          <Circle x={12} y={9} radius={5} {...f} />
          <Line points={[12, 14, 12, 20]} {...s} />
        </Group>
      );
    default:
      return <Circle x={12} y={12} radius={5} {...f} />;
  }
}

export function SymbolNode({
  symbolId,
  size,
  label,
}: {
  symbolId: string;
  size: number;
  label: string;
}) {
  const def = getSymbol(symbolId);
  const colors = symbolColors(def.kind);
  const scale = size / 24;
  if (def.id === "firewall") {
    // Eldveggur is a wall overlay, not a badge: a thin translucent bar so the
    // plan's own wall stays visible underneath.
    return (
      <Group>
        <Rect
          width={size}
          height={Math.max(4, size * 0.16)}
          y={size * 0.42}
          fill="#e11d2e"
          opacity={0.55}
          cornerRadius={Math.max(1, size * 0.03)}
        />
        {label ? (
          <KonvaText
            y={size * 0.42 + Math.max(4, size * 0.16) + 4}
            width={size + 28}
            x={-14}
            text={label}
            fontSize={Math.max(10, size * 0.2)}
            fontFamily="Inter, sans-serif"
            fill="#1c1917"
            stroke="#ffffff"
            strokeWidth={3}
            fillAfterStrokeEnabled
            align="center"
          />
        ) : null}
      </Group>
    );
  }
  return (
    <Group>
      <Rect
        width={size}
        height={size}
        fill={colors.bg}
        cornerRadius={size * 0.12}
        shadowColor="rgba(28,25,23,0.28)"
        shadowBlur={8}
        shadowOffsetY={2}
        shadowEnabled
      />
      <Group x={0} y={0} scaleX={scale} scaleY={scale}>
        <Glyph id={def.id} color={colors.fg} />
      </Group>
      {label ? (
        <KonvaText
          y={size + 4}
          width={size + 28}
          x={-14}
          text={label}
          fontSize={Math.max(10, size * 0.22)}
          fontFamily="Inter, sans-serif"
          fill="#1c1917"
          stroke="#ffffff"
          strokeWidth={3}
          fillAfterStrokeEnabled
          align="center"
        />
      ) : null}
    </Group>
  );
}
