"use client";

import type Konva from "konva";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Layer, Line, Rect, Stage, Transformer } from "react-konva";
import { dashArray, objectsOnDocument, rectFromPoints, simplifyPoints, translateObject, worldFromScreen } from "../../lib/board/geometry";
import { registerStage } from "../../lib/board/stage-ref";
import { newId, snapPoint, useBoardStore } from "../../lib/board/store";
import type { BoardObject, LineKind, Tool } from "../../lib/board/types";
import { GridLayer } from "./GridLayer";
import { ObjectNode } from "./ObjectNode";

type Draft =
  | { kind: "rect"; ax: number; ay: number; bx: number; by: number }
  | { kind: "ellipse"; ax: number; ay: number; bx: number; by: number }
  | { kind: "sticky"; ax: number; ay: number; bx: number; by: number }
  | { kind: LineKind; points: number[] }
  | { kind: "marquee"; ax: number; ay: number; bx: number; by: number };

function isTypingTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
}

export function BoardCanvas({
  width,
  height,
  onEditText,
  onFilesDropped,
  onSymbolDropped,
  onCalibrate,
}: {
  width: number;
  height: number;
  onEditText: (id: string) => void;
  onFilesDropped: (files: File[], world: { x: number; y: number }) => void;
  onSymbolDropped: (symbolId: string, world: { x: number; y: number }) => void;
  onCalibrate: (pixels: number) => void;
}) {
  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const objects = useBoardStore((s) => s.objects);
  const selectedIds = useBoardStore((s) => s.selectedIds);
  const tool = useBoardStore((s) => s.tool);
  const camera = useBoardStore((s) => s.camera);
  const grid = useBoardStore((s) => s.grid);
  const spacePan = useBoardStore((s) => s.spacePan);
  const style = useBoardStore((s) => s.style);
  const pixelsPerMeter = useBoardStore((s) => s.pixelsPerMeter);
  const [draft, setDraft] = useState<Draft | null>(null);
  const panRef = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const polyRef = useRef<number[] | null>(null);
  const documentDragRef = useRef<{
    imageId: string;
    originX: number;
    originY: number;
    followers: { id: string; x: number; y: number }[];
  } | null>(null);

  useEffect(() => {
    registerStage(stageRef.current);
    return () => registerStage(null);
  }, [width, height]);

  // Hand mode: left button behaves like select ("choose"), the pan itself
  // lives on right-button drag (touch/pen still pan with the primary pointer).
  const selectLike = tool === "select" || tool === "hand";

  const selectedNodes = useMemo(
    () => objects.filter((o) => selectedIds.includes(o.id) && !o.hidden),
    [objects, selectedIds]
  );

  useEffect(() => {
    const tr = trRef.current;
    const stage = stageRef.current;
    if (!tr || !stage) return;
    const nodes = selectedIds
      .map((id) => stage.findOne(`#${id}`))
      .filter((n): n is Konva.Node => Boolean(n));
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
  }, [selectedIds, objects, camera, width, height]);

  const draftRef = useRef<Draft | null>(null);

  const setDraftState = useCallback((next: Draft | null) => {
    draftRef.current = next;
    setDraft(next);
  }, []);

  const clientToWorld = useCallback((clientX: number, clientY: number) => {
    const stage = stageRef.current;
    if (!stage) return { x: 0, y: 0 };
    const rect = stage.container().getBoundingClientRect();
    return worldFromScreen(
      { x: clientX - rect.left, y: clientY - rect.top },
      useBoardStore.getState().camera
    );
  }, []);

  const commitShape = useCallback((d: Draft) => {
    const { style: st, addObjects } = useBoardStore.getState();
    if (d.kind === "marquee") return;
    if (d.kind === "rect" || d.kind === "ellipse" || d.kind === "sticky") {
      const box = rectFromPoints(d.ax, d.ay, d.bx, d.by);
      if (box.width < 4 && box.height < 4) return;
      if (d.kind === "rect") {
        addObjects([
          {
            id: newId(),
            type: "rect",
            ...box,
            fill: st.fill,
            stroke: st.stroke,
            strokeWidth: st.strokeWidth,
            cornerRadius: 0,
            rotation: 0,
            opacity: 1,
            locked: false,
            hidden: false,
            name: "Ferningur",
          },
        ]);
      } else if (d.kind === "ellipse") {
        addObjects([
          {
            id: newId(),
            type: "ellipse",
            ...box,
            fill: st.fill,
            stroke: st.stroke,
            strokeWidth: st.strokeWidth,
            rotation: 0,
            opacity: 1,
            locked: false,
            hidden: false,
            name: "Hringur",
          },
        ]);
      } else {
        addObjects([
          {
            id: newId(),
            type: "sticky",
            x: box.x,
            y: box.y,
            width: Math.max(160, box.width),
            height: Math.max(120, box.height),
            fill: st.stickyFill,
            text: "Minnispunktur",
            fontSize: 16,
            rotation: 0,
            opacity: 1,
            locked: false,
            hidden: false,
            name: "Minnispunktur",
          },
        ]);
      }
      return;
    }
    const pts = d.kind === "pen" ? simplifyPoints(d.points) : d.points;
    if (pts.length < 4) return;
    if (d.kind === "calibrate" as LineKind) return;
    // Manual eldveggur: same look as the auto-detected marks — wall-thin and
    // translucent so the plan shows through. Named "EI-veggur" on purpose:
    // "Eldveggur…" names are wiped by every auto-remark run.
    const firewall = d.kind === "polyline" && useBoardStore.getState().tool === "firewall";
    addObjects([
      {
        id: newId(),
        type: d.kind,
        x: 0,
        y: 0,
        points: pts,
        stroke: firewall ? "#e11d2e" : d.kind === "measure" ? "#2563eb" : st.stroke,
        strokeWidth: firewall ? 6 : d.kind === "pen" ? Math.max(2, st.strokeWidth) : st.strokeWidth,
        dash: firewall ? "solid" : st.dash,
        rotation: 0,
        opacity: firewall ? 0.55 : 1,
        locked: false,
        hidden: false,
        name: firewall
          ? "EI-veggur"
          : d.kind === "measure"
            ? "Mæling"
            : d.kind === "arrow"
              ? "Ör"
              : d.kind === "pen"
                ? "Penni"
                : d.kind === "polyline"
                  ? "Veggir"
                  : "Lína",
      },
    ]);
  }, []);

  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const cam = useBoardStore.getState().camera;
    const oldScale = cam.scale;
    const mousePointTo = {
      x: (pointer.x - cam.x) / oldScale,
      y: (pointer.y - cam.y) / oldScale,
    };
    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const factor = e.evt.ctrlKey || e.evt.metaKey ? 1.12 : 1.08;
    const newScale = Math.min(16, Math.max(0.04, oldScale * (direction > 0 ? factor : 1 / factor)));
    useBoardStore.getState().setCamera({
      scale: newScale,
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  };

  const applyPointerMove = useCallback(
    (clientX: number, clientY: number) => {
      if (panRef.current) {
        const dx = clientX - panRef.current.x;
        const dy = clientY - panRef.current.y;
        const cam = useBoardStore.getState().camera;
        useBoardStore.getState().setCamera({
          scale: cam.scale,
          x: panRef.current.cx + dx,
          y: panRef.current.cy + dy,
        });
        return;
      }
      const d = draftRef.current;
      if (!d) {
        if (polyRef.current && polyRef.current.length >= 2) {
          const world = snapPoint(clientToWorld(clientX, clientY).x, clientToWorld(clientX, clientY).y);
          setDraftState({ kind: "polyline", points: [...polyRef.current, world.x, world.y] });
        }
        return;
      }
      const world = clientToWorld(clientX, clientY);
      const snapped = snapPoint(world.x, world.y);
      if (d.kind === "rect" || d.kind === "ellipse" || d.kind === "sticky" || d.kind === "marquee") {
        setDraftState({ ...d, bx: snapped.x, by: snapped.y });
        return;
      }
      if (d.kind === "pen") {
        setDraftState({ kind: "pen", points: [...d.points, world.x, world.y] });
        return;
      }
      const pts = d.points.slice();
      pts[pts.length - 2] = snapped.x;
      pts[pts.length - 1] = snapped.y;
      setDraftState({ ...d, points: pts });
    },
    [clientToWorld, setDraftState]
  );

  const endGesture = useCallback(() => {
    panRef.current = null;
    const d = draftRef.current;
    if (!d) return;
    if (d.kind === "polyline") return;
    if (d.kind === "marquee") {
      const box = rectFromPoints(d.ax, d.ay, d.bx, d.by);
      if (box.width > 8 && box.height > 8) {
        const hits = useBoardStore
          .getState()
          .objects.filter((o) => {
            if (o.locked || o.hidden) return false;
            return o.x >= box.x && o.y >= box.y && o.x <= box.x + box.width && o.y <= box.y + box.height;
          })
          .map((o) => o.id);
        useBoardStore.getState().setSelected(hits);
      }
      setDraftState(null);
      return;
    }
    if (useBoardStore.getState().tool === "calibrate" && d.kind === "measure") {
      const dx = d.points[2] - d.points[0];
      const dy = d.points[3] - d.points[1];
      onCalibrate(Math.hypot(dx, dy));
      setDraftState(null);
      useBoardStore.getState().setTool("select");
      return;
    }
    commitShape(d);
    setDraftState(null);
    if (useBoardStore.getState().tool !== "pen") {
      useBoardStore.getState().setTool("select");
    }
  }, [commitShape, onCalibrate, setDraftState]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!panRef.current && !draftRef.current) return;
      applyPointerMove(e.clientX, e.clientY);
    };
    const onUp = () => endGesture();
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [applyPointerMove, endGesture]);

  const onPointerDown = (e: Konva.KonvaEventObject<PointerEvent>) => {
    const stage = stageRef.current;
    if (!stage) return;
    const world = clientToWorld(e.evt.clientX, e.evt.clientY);
    const snapped = snapPoint(world.x, world.y);
    const clickedEmpty = e.target === stage;
    const currentTool: Tool = useBoardStore.getState().tool;
    const cam = useBoardStore.getState().camera;

    const mousePointer = e.evt.pointerType === "mouse";
    if (
      e.evt.button === 1 ||
      useBoardStore.getState().spacePan ||
      (currentTool === "hand" && (!mousePointer || e.evt.button === 2))
    ) {
      e.evt.preventDefault();
      panRef.current = { x: e.evt.clientX, y: e.evt.clientY, cx: cam.x, cy: cam.y };
      return;
    }
    if (e.evt.button !== 0) return;

    if (currentTool === "select" || currentTool === "hand") {
      if (clickedEmpty) {
        useBoardStore.getState().setSelected([]);
        setDraftState({ kind: "marquee", ax: world.x, ay: world.y, bx: world.x, by: world.y });
      }
      return;
    }

    e.cancelBubble = true;

    if (currentTool === "symbol") {
      const { style: st, addObjects } = useBoardStore.getState();
      if (st.symbolId === "firewall") {
        useBoardStore.getState().setTool("firewall");
        polyRef.current = [snapped.x, snapped.y];
        setDraftState({ kind: "polyline", points: [snapped.x, snapped.y] });
        return;
      }
      addObjects([
        {
          id: newId(),
          type: "symbol",
          x: snapped.x - 28,
          y: snapped.y - 28,
          size: 56,
          symbolId: st.symbolId,
          label: "",
          rotation: 0,
          opacity: 1,
          locked: false,
          hidden: false,
          name: "Tákn",
        },
      ]);
      useBoardStore.getState().setTool("select");
      return;
    }

    if (currentTool === "text") {
      const { style: st, addObjects } = useBoardStore.getState();
      const id = newId();
      addObjects([
        {
          id,
          type: "text",
          x: snapped.x,
          y: snapped.y,
          text: "Texti",
          fontSize: st.fontSize,
          fill: st.stroke,
          width: 280,
          fontStyle: "normal",
          align: "left",
          rotation: 0,
          opacity: 1,
          locked: false,
          hidden: false,
          name: "Texti",
        },
      ]);
      onEditText(id);
      useBoardStore.getState().setTool("select");
      return;
    }

    if (currentTool === "polyline" || currentTool === "firewall") {
      if (!polyRef.current) {
        polyRef.current = [snapped.x, snapped.y];
        setDraftState({ kind: "polyline", points: [snapped.x, snapped.y] });
      } else {
        const next = [...polyRef.current, snapped.x, snapped.y];
        polyRef.current = next;
        setDraftState({ kind: "polyline", points: next });
      }
      return;
    }

    if (currentTool === "rect" || currentTool === "ellipse" || currentTool === "sticky") {
      setDraftState({ kind: currentTool, ax: snapped.x, ay: snapped.y, bx: snapped.x, by: snapped.y });
      return;
    }

    if (
      currentTool === "line" ||
      currentTool === "arrow" ||
      currentTool === "pen" ||
      currentTool === "measure" ||
      currentTool === "calibrate"
    ) {
      setDraftState({
        kind: currentTool === "calibrate" ? "measure" : currentTool,
        points: [snapped.x, snapped.y, snapped.x, snapped.y],
      });
    }
  };

  const finishPolyline = useCallback(() => {
    if (!polyRef.current || polyRef.current.length < 4) {
      polyRef.current = null;
      setDraftState(null);
      return;
    }
    commitShape({ kind: "polyline", points: polyRef.current });
    polyRef.current = null;
    setDraftState(null);
    useBoardStore.getState().setTool("select");
  }, [commitShape, setDraftState]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.key === "Escape") {
        polyRef.current = null;
        panRef.current = null;
        setDraftState(null);
        useBoardStore.getState().setSelected([]);
        useBoardStore.getState().setTool("select");
      }
      if ((e.key === "Enter" || e.key === " ") && polyRef.current) {
        e.preventDefault();
        finishPolyline();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finishPolyline, setDraftState]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    // The shell in WhiteboardApp has its own onDrop fallback; without this the
    // same drop fired both handlers and every file/symbol landed twice.
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const world = worldFromScreen(
      { x: e.clientX - rect.left, y: e.clientY - rect.top },
      useBoardStore.getState().camera
    );
    const symbolId = e.dataTransfer.getData("application/x-turbopaint-symbol");
    if (symbolId) {
      onSymbolDropped(symbolId, world);
      return;
    }
    const files = [...e.dataTransfer.files];
    if (files.length) onFilesDropped(files, world);
  };

  const applyTransform = (
    id: string,
    node: { x: number; y: number; rotation: number; scaleX: number; scaleY: number; width?: number; height?: number }
  ) => {
    const obj = useBoardStore.getState().objects.find((o) => o.id === id);
    if (!obj) return;
    useBoardStore.getState().commitHistory();
    if (obj.type === "symbol") {
      useBoardStore.getState().patchObject(
        id,
        { x: node.x, y: node.y, rotation: node.rotation, size: node.width ?? obj.size },
        false
      );
      return;
    }
    if (obj.type === "image" || obj.type === "rect" || obj.type === "sticky" || obj.type === "ellipse") {
      const next = {
        x: node.x,
        y: node.y,
        rotation: node.rotation,
        width: Math.max(8, obj.width * Math.abs(node.scaleX || 1)),
        height: Math.max(8, obj.height * Math.abs(node.scaleY || 1)),
      };
      if (obj.type === "image") {
        const dx = next.x - obj.x;
        const dy = next.y - obj.y;
        const followers = objectsOnDocument(obj, useBoardStore.getState().objects);
        const ids = [id, ...followers.map((f) => f.id)];
        useBoardStore.getState().updateObjects(
          ids,
          (item) => {
            if (item.id === id) return { ...item, ...next } as BoardObject;
            return translateObject(item, dx, dy);
          },
          false
        );
        return;
      }
      useBoardStore.getState().patchObject(id, next as Partial<BoardObject>, false);
      return;
    }
    if (obj.type === "text") {
      useBoardStore.getState().patchObject(
        id,
        {
          x: node.x,
          y: node.y,
          rotation: node.rotation,
          width: Math.max(40, (node.width ?? obj.width) * node.scaleX),
          fontSize: Math.max(10, obj.fontSize * node.scaleY),
        },
        false
      );
      return;
    }
    useBoardStore.getState().patchObject(id, { x: node.x, y: node.y, rotation: node.rotation }, false);
  };

  const beginDocumentDrag = (id: string) => {
    const objects = useBoardStore.getState().objects;
    const image = objects.find((o) => o.id === id);
    if (!image || image.type !== "image") {
      documentDragRef.current = null;
      return;
    }
    documentDragRef.current = {
      imageId: id,
      originX: image.x,
      originY: image.y,
      followers: objectsOnDocument(image, objects).map((o) => ({ id: o.id, x: o.x, y: o.y })),
    };
  };

  const moveDocumentFollowers = (id: string, x: number, y: number) => {
    const drag = documentDragRef.current;
    const stage = stageRef.current;
    if (!drag || drag.imageId !== id || !stage) return;
    const dx = x - drag.originX;
    const dy = y - drag.originY;
    for (const follower of drag.followers) {
      const node = stage.findOne(`#${follower.id}`);
      if (node) node.position({ x: follower.x + dx, y: follower.y + dy });
    }
    stage.batchDraw();
  };

  const endDocumentDrag = (id: string, x: number, y: number) => {
    const drag = documentDragRef.current;
    const snapped = snapPoint(x, y);
    useBoardStore.getState().commitHistory();
    if (!drag || drag.imageId !== id) {
      useBoardStore.getState().patchObject(id, { x: snapped.x, y: snapped.y }, false);
      documentDragRef.current = null;
      return;
    }
    const dx = snapped.x - drag.originX;
    const dy = snapped.y - drag.originY;
    const ids = [id, ...drag.followers.map((f) => f.id)];
    useBoardStore.getState().updateObjects(
      ids,
      (obj) => {
        if (obj.id === id) return { ...obj, x: snapped.x, y: snapped.y };
        return translateObject(obj, dx, dy);
      },
      false
    );
    documentDragRef.current = null;
  };

  const cursor = spacePan ? "grab" : selectLike ? "default" : "crosshair";

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ cursor }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = e.dataTransfer.types.includes("Files") ? "copy" : "copy";
      }}
      onDrop={onDrop}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Stage
        width={width}
        height={height}
        x={camera.x}
        y={camera.y}
        scaleX={camera.scale}
        scaleY={camera.scale}
        ref={(node) => {
          stageRef.current = node;
          registerStage(node);
        }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onDblClick={() => {
          if (polyRef.current) finishPolyline();
        }}
        className="kjarni-stage"
      >
        <Layer listening={false}>
          {grid ? <GridLayer camera={camera} width={width} height={height} /> : null}
        </Layer>
        <Layer>
          {objects.map((obj) => (
            <ObjectNode
              key={obj.id}
              obj={obj}
              pixelsPerMeter={pixelsPerMeter}
              draggable={selectLike && !spacePan && !obj.locked}
              listening={selectLike && !spacePan && (obj.type === "image" || !obj.locked)}
              onDragStart={(id) => {
                if (panRef.current) {
                  stageRef.current?.findOne(`#${id}`)?.stopDrag();
                  return;
                }
                beginDocumentDrag(id);
              }}
              onDragMove={(id, x, y) => moveDocumentFollowers(id, x, y)}
              onDragEnd={(id, x, y) => endDocumentDrag(id, x, y)}
              onTransformEnd={applyTransform}
              onClick={(id, shift) => {
                if (!selectLike) return;
                const current = useBoardStore.getState().selectedIds;
                if (shift) {
                  useBoardStore
                    .getState()
                    .setSelected(current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
                } else {
                  useBoardStore.getState().setSelected([id]);
                }
              }}
              onDblClick={(id) => {
                const obj = useBoardStore.getState().objects.find((o) => o.id === id);
                if (obj?.type === "text" || obj?.type === "sticky") onEditText(id);
              }}
            />
          ))}
          {draft && draft.kind !== "marquee" && draft.kind !== "rect" && draft.kind !== "ellipse" && draft.kind !== "sticky" ? (
            <Line
              points={draft.points}
              stroke={tool === "firewall" ? "#e11d2e" : style.stroke}
              strokeWidth={tool === "firewall" ? 6 : style.strokeWidth}
              dash={tool === "firewall" ? undefined : dashArray(style.dash, style.strokeWidth)}
              opacity={tool === "firewall" ? 0.55 : 1}
              lineCap="round"
              lineJoin="round"
              listening={false}
              name="ui-only"
            />
          ) : null}
          {draft && (draft.kind === "rect" || draft.kind === "ellipse" || draft.kind === "sticky") ? (
            <Rect
              {...rectFromPoints(draft.ax, draft.ay, draft.bx, draft.by)}
              stroke={style.stroke}
              strokeWidth={style.strokeWidth}
              dash={[8, 6]}
              fill={draft.kind === "sticky" ? style.stickyFill : style.fill === "transparent" ? undefined : style.fill}
              cornerRadius={draft.kind === "sticky" ? 4 : 0}
              listening={false}
              name="ui-only"
            />
          ) : null}
          {draft && draft.kind === "marquee" ? (
            <Rect
              {...rectFromPoints(draft.ax, draft.ay, draft.bx, draft.by)}
              stroke="#2563eb"
              strokeWidth={1 / camera.scale}
              fill="rgba(37,99,235,0.12)"
              listening={false}
              name="ui-only"
            />
          ) : null}
          <Transformer
            ref={trRef}
            rotateEnabled
            enabledAnchors={
              selectedNodes.some((o) => o.type === "line" || o.type === "pen" || o.type === "arrow" || o.type === "polyline" || o.type === "measure")
                ? []
                : undefined
            }
            boundBoxFunc={(oldBox, newBox) => {
              if (newBox.width < 8 || newBox.height < 8) return oldBox;
              return newBox;
            }}
            anchorSize={8}
            borderStroke="#FE653F"
            anchorStroke="#FE653F"
            anchorFill="#fff"
            name="ui-only"
          />
        </Layer>
      </Stage>
    </div>
  );
}

