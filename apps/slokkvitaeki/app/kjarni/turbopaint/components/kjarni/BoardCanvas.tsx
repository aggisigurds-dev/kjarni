"use client";

import type Konva from "konva";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Group, Layer, Line, Rect, Stage, Text as KonvaText, Transformer } from "react-konva";
import { toast } from "sonner";
import { boardBounds, cameraFit, dashArray, effectiveGridGap, objectsOnDocument, rectFromPoints, simplifyPoints, translateObject, worldFromScreen } from "../../lib/board/geometry";
import { registerStage } from "../../lib/board/stage-ref";
import { isDrawnLocked, isDrawnVisible, isLayerLocked, selectableIds } from "../../lib/board/layers";
import { newId, snapPoint, useBoardStore } from "../../lib/board/store";
import { useVeggjaRitill } from "../../lib/board/veggja-ritill-stada";
import { serializeClipboard } from "../../lib/board/clipboard";
import {
  CHECKBOX_FILL,
  CHECKBOX_STROKE,
  checkboxBoxFromClick,
} from "../../lib/board/checkbox";
import { getSymbol } from "../../lib/board/symbols";
import { getStampSize } from "../../lib/board/symbol-settings";
import { TAEKI_DRAG_TYPE } from "../../lib/board/markup-kit";
import { stimpilStaerdBords } from "../../lib/board/uttekt";
import { raesaFjolcrop, useFjolcrop } from "../../lib/board/fjolcrop";
import { getHamur, useHamur } from "../../lib/board/hamir";
import type { BoardObject, LineKind, Tool } from "../../lib/board/types";
import { FIREWALL_OPACITY, FIREWALL_PALETTE } from "../../lib/board/firewall-rating";
import { DEFAULT_ROOM_NAME, fillAlpha, roomOfSelection } from "../../lib/board/rooms";
import { isRightMouseButton, shouldPanView } from "../../lib/board/pan";
import { GridLayer } from "./GridLayer";
import { ObjectNode } from "./ObjectNode";
import { RoomGataOverlays } from "./RoomGataStepper";

/** Brunahólfun er RAUÐ og hálfgegnsæ — sjá FIREWALL_PALETTE í firewall-rating.
 * Litirnir koma ÞAÐAN svo handvirku takkarnir og sjálfvirka greiningin noti
 * sömu töflu; áður voru þeir tvíteknir hér og gátu rekið í sundur.
 * Nafnið heldur "EI-veggur"-forskeytinu svo Magntaflan telji flokkana og
 * sjálfvirka endur-merkingin hreinsi þá aldrei. */
const FIREWALL_CLASSES: { label: string; color: string; dash: "solid" | "dashed"; width: number }[] = [
  { label: "EI-60", ...FIREWALL_PALETTE.ei60 },
  { label: "EI-30", ...FIREWALL_PALETTE.ei30 },
  { label: "EI-CS", ...FIREWALL_PALETTE.smoke },
  { label: "AREIM", ...FIREWALL_PALETTE.areim },
];

/* HORNALÆSING — hreinir, hornréttir veggir (Agnar 28.08: "bara svona teiknaða
 * veggi", með Drafted-teikniforritið sem fyrirmynd).
 *
 * Veggir í húsum eru nær undantekningalaust lóðréttir eða láréttir. Án læsingar
 * verður handdregin lína alltaf örlítið skökk og teikningin lítur út fyrir að
 * vera krot fremur en uppdráttur. Hér smellur hver hluti í næsta rétta horn —
 * og Shift heldur inni gefur frjálsan halla þegar veggurinn er í raun skakkur.
 *
 * 45° eru höfð með því skáveggir og horn-afskurðir eru algengir í eldri húsum. */
function orthoSnap(px: number, py: number, x: number, y: number, free: boolean) {
  if (free) return { x, y };
  const dx = x - px;
  const dy = y - py;
  const ang = Math.atan2(dy, dx);
  const step = Math.PI / 4;                       // 45°
  const snapped = Math.round(ang / step) * step;
  const len = Math.hypot(dx, dy);
  // Á réttu hornunum er hnitið látið standa nákvæmt (engin fljótandi skekkja).
  const c = Math.cos(snapped);
  const sn = Math.sin(snapped);
  return {
    x: Math.abs(c) < 1e-9 ? px : px + len * c,
    y: Math.abs(sn) < 1e-9 ? py : py + len * sn,
  };
}

type Draft =
  | { kind: "rect"; ax: number; ay: number; bx: number; by: number }
  | { kind: "ellipse"; ax: number; ay: number; bx: number; by: number }
  | { kind: "sticky"; ax: number; ay: number; bx: number; by: number }
  | { kind: LineKind; points: number[] }
  | { kind: "marquee"; ax: number; ay: number; bx: number; by: number }
  | { kind: "crop"; ax: number; ay: number; bx: number; by: number }
  | { kind: "fjolcrop"; ax: number; ay: number; bx: number; by: number }
  | { kind: "hvitta"; ax: number; ay: number; bx: number; by: number }
  | { kind: "hvitpensill"; points: number[]; breidd: number };

function isTypingTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
}

/** Selecting any member of a group selects the whole group. */
function expandGroups(ids: string[]) {
  const all = useBoardStore.getState().objects;
  const idSet = new Set(ids);
  const gids = new Set(
    all.filter((o) => idSet.has(o.id) && o.groupId).map((o) => o.groupId as string)
  );
  if (!gids.size) return ids;
  all.forEach((o) => {
    if (o.groupId && gids.has(o.groupId)) idSet.add(o.id);
  });
  return [...idSet];
}

export function BoardCanvas({
  width,
  height,
  onEditText,
  onFilesDropped,
  onSymbolDropped,
  onCalibrate,
  onCropRect,
  onHvittaRect,
  onHvitPensill,
  onEydaLinu,
  onEydaLinuSveima,
  ljosLina,
  onRequestStrip,
  onSetjaVal,
  onTaekiDropped,
  onFjolcrop,
  onFinnaGrunnmyndir,
}: {
  /** „Croppa oft": skera blaðið í hlutana sem kassarnir sýna (Enter / „Croppa"). */
  onFjolcrop?: () => void;
  /** „Croppa oft → Finna sjálfkrafa": stinga upp á kössum utan um grunnmyndirnar. */
  onFinnaGrunnmyndir?: () => void;
  width: number;
  height: number;
  onEditText: (id: string) => void;
  onFilesDropped: (files: File[], world: { x: number; y: number }) => void;
  onSymbolDropped: (symbolId: string, world: { x: number; y: number }) => void;
  /** Smellur á teikninguna meðan tæki/stimpill úr tækjalistanum er valið — true = smellurinn var notaður. */
  onSetjaVal?: (world: { x: number; y: number }) => boolean;
  /** Röð úr tækjalistanum dregin á teikninguna (JSON af TaekjaVal). */
  onTaekiDropped?: (data: string, world: { x: number; y: number }) => void;
  onCalibrate: (pixels: number, points: number[]) => void;
  onCropRect?: (rect: { x: number; y: number; width: number; height: number }) => void;
  onHvittaRect?: (rect: { x: number; y: number; width: number; height: number }) => void;
  /** Hvítur pensill: slóð (heimshnit) og breidd (heimseiningar). */
  onHvitPensill?: (points: number[], breidd: number) => void;
  /** „Eyða línu": smellt á punkt (heimshnit) með vikmörkum (heimseiningar). */
  onEydaLinu?: (pt: { x: number; y: number }, vik: number) => void;
  /** Músin yfir teikningu í „Eyða línu" — kallandinn finnur línuna og skilar henni í `ljosLina`. */
  onEydaLinuSveima?: (pt: { x: number; y: number }, vik: number) => void;
  /** Línan sem „Eyða línu" myndi fjarlægja: strik [ax, ay, bx, by] í heimshnitum, teiknuð rauð. */
  ljosLina?: number[][] | null;
  onRequestStrip?: (planId: string) => void;
}) {
  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const trFjolRef = useRef<Konva.Transformer>(null);
  const fjolKassar = useFjolcrop((s) => s.kassar);
  const fjolValinn = useFjolcrop((s) => s.valinn);
  const hamur = useHamur((s) => s.hamur);
  const objects = useBoardStore((s) => s.objects);
  const layers = useBoardStore((s) => s.layers);
  const selectedIds = useBoardStore((s) => s.selectedIds);
  const tool = useBoardStore((s) => s.tool);
  const camera = useBoardStore((s) => s.camera);
  const grid = useBoardStore((s) => s.grid);
  const spacePan = useBoardStore((s) => s.spacePan);
  const style = useBoardStore((s) => s.style);
  const roomStyle = useBoardStore((s) => s.roomStyle);
  const pixelsPerMeter = useBoardStore((s) => s.pixelsPerMeter);
  const ritillVirkur = useVeggjaRitill((s) => s.virkur);
  /* Shift = frjáls halli meðan hornalæsingin er á. Hreyfi-handlerinn fær aðeins
   * hnitin, ekki atburðinn, svo staðan er geymd hér og uppfærð af glugganum. */
  const shiftRef = useRef(false);
  useEffect(() => {
    const dn = (ev: KeyboardEvent) => { if (ev.key === "Shift") shiftRef.current = true; };
    const up = (ev: KeyboardEvent) => { if (ev.key === "Shift") shiftRef.current = false; };
    const blur = () => { shiftRef.current = false; };
    window.addEventListener("keydown", dn);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", dn);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);
  const [draft, setDraft] = useState<Draft | null>(null);
  const panRef = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const pinchRef = useRef<{ dist: number; midWorld: { x: number; y: number } } | null>(null);
  const eraseRef = useRef(false);
  const rightDownRef = useRef<{ x: number; y: number } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; targetId: string | null } | null>(null);
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

  // Snap notar sama bil og grindin TEIKNAST með á núverandi zoomi.
  useEffect(() => {
    useBoardStore.getState().setGridGap(effectiveGridGap(camera, width, height));
  }, [camera, width, height]);

  // Hand mode: left button behaves like select ("choose"). Right-button drag
  // always pans the board in any tool (touch/pen still pan with the primary
  // pointer while the hand tool is active).
  const selectLike = tool === "select" || tool === "hand";

  const selectedNodes = useMemo(
    () => objects.filter((o) => selectedIds.includes(o.id) && isDrawnVisible(o, layers)),
    [objects, selectedIds, layers]
  );

  useEffect(() => {
    const tr = trRef.current;
    const stage = stageRef.current;
    if (!tr || !stage) return;
    // Veggjaritillinn teiknar sitt eigið val (útlínur + endapunkta) — umbreytingarramminn myndi aðeins skyggja á
    const nodes = ritillVirkur
      ? []
      : selectedIds
          .map((id) => stage.findOne(`#${id}`))
          .filter((n): n is Konva.Node => Boolean(n));
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
  }, [selectedIds, objects, camera, width, height, ritillVirkur]);

  // „Croppa oft": valinn kassi fær handföng (stækka/minnka), aðeins meðan tólið er virkt.
  useEffect(() => {
    const tr = trFjolRef.current;
    const stage = stageRef.current;
    if (!tr || !stage) return;
    const node = tool === "fjolcrop" && fjolValinn != null ? stage.findOne(`#fjolkassi-${fjolValinn}`) : null;
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  }, [tool, fjolValinn, fjolKassar, camera, width, height]);

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

  const commitShape = useCallback((d: Draft, firewallWall = false) => {
    const { style: st, addObjects } = useBoardStore.getState();
    if (d.kind === "marquee" || d.kind === "crop" || d.kind === "fjolcrop" || d.kind === "hvitta" || d.kind === "hvitpensill") return;
    if (d.kind === "rect" || d.kind === "ellipse" || d.kind === "sticky") {
      let box = rectFromPoints(d.ax, d.ay, d.bx, d.by);
      const asCheckbox = d.kind === "rect" && useBoardStore.getState().tool === "checkbox";
      // A plain click with the Gátreitur tool stamps a default-size box.
      if (asCheckbox && box.width < 4 && box.height < 4) box = checkboxBoxFromClick(d.ax, d.ay);
      if (box.width < 4 && box.height < 4) return;
      if (asCheckbox) {
        addObjects([
          {
            id: newId(),
            type: "rect",
            ...box,
            fill: CHECKBOX_FILL,
            stroke: CHECKBOX_STROKE,
            strokeWidth: 2,
            cornerRadius: 8,
            rotation: 0,
            opacity: 1,
            locked: false,
            hidden: false,
            name: "Gátreitur",
            isCheckbox: true,
            checked: false,
          },
        ]);
        return;
      }
      if (d.kind === "rect") {
        const live = useBoardStore.getState();
        const asRoom = live.tool === "room" || Boolean(live.roomDraftGroupId);
        if (asRoom) {
          let gid = live.roomDraftGroupId;
          if (!gid) {
            gid = newId();
            useBoardStore.setState({ roomDraftGroupId: gid, tool: "room" });
          }
          const { roomStyle: rs, addObjects, objects: liveObjects } = useBoardStore.getState();
          const sibling = liveObjects.find(
            (o) => o.type === "rect" && o.isRoom && o.groupId === gid
          );
          addObjects(
            [
              {
                id: newId(),
                type: "rect",
                ...box,
                fill: fillAlpha(rs.color, rs.opacity),
                stroke: rs.color,
                strokeWidth: 2,
                cornerRadius: 0,
                rotation: 0,
                opacity: 1,
                locked: false,
                hidden: false,
                name: sibling?.name || DEFAULT_ROOM_NAME,
                isRoom: true,
                groupId: gid,
                roomCounted: rs.counted,
                roomOpacity: rs.opacity,
                roomGataCount:
                  sibling && sibling.type === "rect" ? sibling.roomGataCount ?? 0 : 0,
              },
            ],
            false
          );
          return;
        }
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
    let pts = d.kind === "pen" ? simplifyPoints(d.points) : d.points;
    if (d.kind === "polyline") {
      // Tvísmellur til að ljúka bætti við tveimur auka-punktum á nánast sama
      // stað — fella saman samliggjandi punkta nær en 6px svo enginn
      // "auka-krókur" verði til í lok veggjar.
      const clean: number[] = [];
      for (let i = 0; i < pts.length; i += 2) {
        const n = clean.length;
        if (n >= 2 && Math.hypot(pts[i] - clean[n - 2], pts[i + 1] - clean[n - 1]) < 6) continue;
        clean.push(pts[i], pts[i + 1]);
      }
      pts = clean;
    }
    if (pts.length < 4) return;
    if (d.kind === "calibrate" as LineKind) return;
    // Manual eldveggur: translucent so the plan shows through, but colour,
    // width and dash come from the StyleStrip so both are user-choosable.
    // Named "EI-veggur" on purpose: "Eldveggur…" names are wiped by every
    // auto-remark run.
    const firewall = d.kind === "polyline" && firewallWall;
    addObjects([
      {
        id: newId(),
        type: d.kind,
        x: 0,
        y: 0,
        points: pts,
        stroke: d.kind === "measure" ? "#2563eb" : st.stroke,
        strokeWidth: d.kind === "pen" ? Math.max(2, st.strokeWidth) : st.strokeWidth,
        dash: st.dash,
        rotation: 0,
        opacity: firewall ? FIREWALL_OPACITY : 1,
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

  // Strokleður: eyðir hlutnum undir bendlinum (aldrei innfluttum plönum eða
  // læstum hlutum) — smellt eða strokið yfir.
  const eraseAt = useCallback((clientX: number, clientY: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.container().getBoundingClientRect();
    const hit = stage.getIntersection({ x: clientX - rect.left, y: clientY - rect.top });
    if (!hit) return;
    const objects = useBoardStore.getState().objects;
    let node: Konva.Node | null = hit;
    while (node && node !== (stage as unknown as Konva.Node)) {
      const id = node.id();
      if (id) {
        const obj = objects.find((o) => o.id === id);
        if (obj) {
          const st = useBoardStore.getState();
          if (obj.type !== "image" && !isDrawnLocked(obj, st.layers)) {
            st.deleteIds([obj.id]);
          }
          return;
        }
      }
      node = node.getParent();
    }
  }, []);

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
      const liveTool = useBoardStore.getState().tool;
      const freehand =
        liveTool === "firewall" || liveTool === "measure" || liveTool === "calibrate";
      const d = draftRef.current;
      if (!d) {
        if (polyRef.current && polyRef.current.length >= 2) {
          const raw = clientToWorld(clientX, clientY);
          const world = freehand ? raw : snapPoint(raw.x, raw.y);
          {
            const pr = polyRef.current;
            const px = pr[pr.length - 2];
            const py = pr[pr.length - 1];
            const sp = orthoSnap(px, py, world.x, world.y, shiftRef.current);
            setDraftState({ kind: "polyline", points: [...pr, sp.x, sp.y] });
          }
        }
        return;
      }
      const world = clientToWorld(clientX, clientY);
      const snapped = freehand ? world : snapPoint(world.x, world.y);
      if (
        d.kind === "rect" ||
        d.kind === "ellipse" ||
        d.kind === "sticky" ||
        d.kind === "marquee" ||
        d.kind === "crop" ||
        d.kind === "fjolcrop" ||
        d.kind === "hvitta"
      ) {
        const pt = d.kind === "crop" || d.kind === "fjolcrop" || d.kind === "hvitta" ? world : snapped;
        setDraftState({ ...d, bx: pt.x, by: pt.y });
        return;
      }
      if (d.kind === "hvitpensill") {
        setDraftState({ ...d, points: [...d.points, world.x, world.y] });
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
    if (wrapRef.current) wrapRef.current.style.cursor = "";
    eraseRef.current = false;
    const d = draftRef.current;
    if (!d) return;
    if (d.kind === "polyline") return;
    if (d.kind === "crop") {
      const box = rectFromPoints(d.ax, d.ay, d.bx, d.by);
      setDraftState(null);
      useBoardStore.getState().setTool("select");
      if (box.width > 24 && box.height > 24) onCropRect?.(box);
      return;
    }
    if (d.kind === "fjolcrop") {
      // Tólið helst virkt: dragðu næsta kassa (2, 3 …); Enter sker, Esc hættir.
      const box = rectFromPoints(d.ax, d.ay, d.bx, d.by);
      setDraftState(null);
      const lagm = 12 / useBoardStore.getState().camera.scale;
      if (box.width > lagm && box.height > lagm) useFjolcrop.getState().baeta(box);
      return;
    }
    if (d.kind === "hvitpensill") {
      setDraftState(null);
      if (d.points.length >= 2) onHvitPensill?.(d.points, d.breidd);
      return;
    }
    if (d.kind === "hvitta") {
      // Tólið helst virkt svo hreinsa megi mörg svæði í röð; Esc / V hættir.
      const box = rectFromPoints(d.ax, d.ay, d.bx, d.by);
      setDraftState(null);
      if (box.width > 4 && box.height > 4) onHvittaRect?.(box);
      return;
    }
    if (d.kind === "marquee") {
      const box = rectFromPoints(d.ax, d.ay, d.bx, d.by);
      if (box.width > 8 && box.height > 8) {
        const st = useBoardStore.getState();
        const hits = st.objects
          .filter((o) => {
            if (isDrawnLocked(o, st.layers) || !isDrawnVisible(o, st.layers)) return false;
            return o.x >= box.x && o.y >= box.y && o.x <= box.x + box.width && o.y <= box.y + box.height;
          })
          .map((o) => o.id);
        useBoardStore.getState().setSelected(expandGroups(hits));
      } else {
        // Tiny marquee = tap on empty canvas → deselect (deferred from pointerdown).
        useBoardStore.getState().setSelected([]);
      }
      setDraftState(null);
      return;
    }
    if (useBoardStore.getState().tool === "calibrate" && d.kind === "measure") {
      const dx = d.points[2] - d.points[0];
      const dy = d.points[3] - d.points[1];
      // Línan fylgir með svo innslegna mælingin VISTIST á teikninguna
      // (áður hvarf hún og talan með — "hélt að mælistikan myndi haldast").
      onCalibrate(Math.hypot(dx, dy), d.points.slice(0, 4));
      setDraftState(null);
      useBoardStore.getState().setTool("select");
      return;
    }
    commitShape(d);
    setDraftState(null);
    const nextTool = useBoardStore.getState().tool;
    if (nextTool !== "pen" && nextTool !== "room") {
      useBoardStore.getState().setTool("select");
    }
  }, [commitShape, onCalibrate, onCropRect, onHvittaRect, onHvitPensill, setDraftState]);

  // Two-finger pinch: zoom around the fingers' midpoint, pan as it moves.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const dist = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const mid = (t: TouchList, rect: DOMRect) => ({
      x: (t[0].clientX + t[1].clientX) / 2 - rect.left,
      y: (t[0].clientY + t[1].clientY) / 2 - rect.top,
    });
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      panRef.current = null;
      setDraftState(null);
      const rect = el.getBoundingClientRect();
      const cam = useBoardStore.getState().camera;
      const m = mid(e.touches, rect);
      pinchRef.current = {
        dist: dist(e.touches),
        midWorld: { x: (m.x - cam.x) / cam.scale, y: (m.y - cam.y) / cam.scale },
      };
    };
    const onMove = (e: TouchEvent) => {
      const p = pinchRef.current;
      if (!p || e.touches.length !== 2) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cam = useBoardStore.getState().camera;
      const d = dist(e.touches);
      const m = mid(e.touches, rect);
      const scale = Math.min(16, Math.max(0.04, cam.scale * (d / p.dist)));
      p.dist = d;
      useBoardStore.getState().setCamera({
        scale,
        x: m.x - p.midWorld.x * scale,
        y: m.y - p.midWorld.y * scale,
      });
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinchRef.current = null;
    };
    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [setDraftState]);

  const sveimaRef = useRef(onEydaLinuSveima);
  sveimaRef.current = onEydaLinuSveima;
  const sveimaRaf = useRef(0);
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (pinchRef.current) return;
      if (eraseRef.current) {
        eraseAt(e.clientX, e.clientY);
        return;
      }
      if (useBoardStore.getState().tool === "eydalinu" && sveimaRef.current && !panRef.current) {
        const cx = e.clientX, cy = e.clientY;
        cancelAnimationFrame(sveimaRaf.current);
        sveimaRaf.current = requestAnimationFrame(() => {
          const w = clientToWorld(cx, cy);
          sveimaRef.current?.(w, 8 / useBoardStore.getState().camera.scale);
        });
      }
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
  }, [applyPointerMove, endGesture, eraseAt]);

  const onPointerDown = (e: Konva.KonvaEventObject<PointerEvent>) => {
    const stage = stageRef.current;
    if (!stage || pinchRef.current) return;
    if (e.evt.button === 2) {
      // Kyrrstæður hægri-smellur opnar hraðvalmyndina (sjá onContextMenu);
      // hægri-DRAG færir borðið í allar áttir, óháð tóli — fjarlægðin sker úr.
      rightDownRef.current = { x: e.evt.clientX, y: e.evt.clientY };
    }
    const world = clientToWorld(e.evt.clientX, e.evt.clientY);
    const clickedEmpty = e.target === stage;
    const currentTool: Tool = useBoardStore.getState().tool;
    const cam = useBoardStore.getState().camera;
    // Eldveggur, mæling og kvarði elta teikninguna sjálfa, ekki grindina —
    // grid-snap togaði hvern smell á næsta 20px-punkt ("hoppar til manns").
    const freehand =
      currentTool === "firewall" || currentTool === "measure" || currentTool === "calibrate";
    const snapped = freehand ? world : snapPoint(world.x, world.y);

    if (
      shouldPanView({
        button: e.evt.button,
        pointerType: e.evt.pointerType,
        tool: currentTool,
        spacePan: useBoardStore.getState().spacePan,
      })
    ) {
      e.evt.preventDefault();
      panRef.current = { x: e.evt.clientX, y: e.evt.clientY, cx: cam.x, cy: cam.y };
      if (wrapRef.current) wrapRef.current.style.cursor = "grabbing";
      return;
    }
    if (e.evt.button !== 0) return;

    if (currentTool === "eraser") {
      e.cancelBubble = true;
      eraseRef.current = true;
      eraseAt(e.evt.clientX, e.evt.clientY);
      return;
    }

    if (currentTool === "crop") {
      setDraftState({ kind: "crop", ax: world.x, ay: world.y, bx: world.x, by: world.y });
      return;
    }
    if (currentTool === "fjolcrop") {
      // Smellur á kassa eða handfang hans = færa/stækka hann (Konva sér um það); annars nýr kassi.
      if (!clickedEmpty) return;
      useFjolcrop.getState().velja(null);
      setDraftState({ kind: "fjolcrop", ax: world.x, ay: world.y, bx: world.x, by: world.y });
      return;
    }
    if (currentTool === "eydalinu") {
      // 8 skjápixla vikmörk, óháð aðdrætti
      onEydaLinu?.(world, 8 / camera.scale);
      return;
    }
    if (currentTool === "hvitpensill") {
      // Pensilbreidd fylgir línuþykkt stílstikunnar (2/4/8/12 px → 12/24/48/72 skjápixlar), óháð aðdrætti.
      const breidd = (Math.max(2, useBoardStore.getState().style.strokeWidth) * 6) / camera.scale;
      setDraftState({ kind: "hvitpensill", points: [world.x, world.y, world.x + 0.01, world.y], breidd });
      return;
    }
    if (currentTool === "hvitta") {
      setDraftState({ kind: "hvitta", ax: world.x, ay: world.y, bx: world.x, by: world.y });
      return;
    }

    if (currentTool === "select" || currentTool === "hand") {
      if (clickedEmpty) {
        // Deselect is deferred to endGesture (on tiny-tap marquee) so an
        // accidental near-miss touch does NOT immediately drop the selection.
        setDraftState({ kind: "marquee", ax: world.x, ay: world.y, bx: world.x, by: world.y });
      }
      return;
    }

    e.cancelBubble = true;

    const board = useBoardStore.getState();
    if (isLayerLocked(board.layers, board.activeLayerId)) {
      toast.message("Lagið er læst — aflæstu því til að teikna");
      return;
    }

    if (currentTool === "symbol") {
      // Tæki eða stimpill úr tækjalistanum: tengt tákn (eða tækið fært), ekki laust tákn.
      if (onSetjaVal?.(world)) return;
      const { style: st, addObjects } = useBoardStore.getState();
      if (st.symbolId === "firewall") {
        useBoardStore.getState().startFirewall();
        polyRef.current = [world.x, world.y];
        setDraftState({ kind: "polyline", points: [world.x, world.y] });
        return;
      }
      const stampPx = stimpilStaerdBords(useBoardStore.getState().objects, getStampSize(), world);
      // Stimplað þar sem smellt var, ekki á næsta grindarpunkt — sama regla og
      // í drættinum: tákn eru sett á vegg eða hurð, ekki á grind.
      const at = world;
      addObjects([
        {
          id: newId(),
          type: "symbol",
          x: at.x - stampPx / 2,
          y: at.y - stampPx / 2,
          size: stampPx,
          symbolId: st.symbolId,
          label: "",
          rotation: 0,
          opacity: 1,
          locked: false,
          hidden: false,
          name: getSymbol(st.symbolId).name,
        },
      ]);
      // Stimpil-hamur: tólið helst virkt svo hægt sé að stimpla mörg í röð —
      // Esc eða annað tól hættir (áður datt það úr sambandi eftir eitt stykki).
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
        const pr = polyRef.current;
        const sp = orthoSnap(
          pr[pr.length - 2],
          pr[pr.length - 1],
          snapped.x,
          snapped.y,
          shiftRef.current
        );
        const next = [...pr, sp.x, sp.y];
        polyRef.current = next;
        setDraftState({ kind: "polyline", points: next });
      }
      return;
    }

    if (
      currentTool === "rect" ||
      currentTool === "room" ||
      currentTool === "checkbox" ||
      currentTool === "ellipse" ||
      currentTool === "sticky"
    ) {
      setDraftState({
        kind: currentTool === "room" || currentTool === "checkbox" ? "rect" : currentTool,
        ax: snapped.x,
        ay: snapped.y,
        bx: snapped.x,
        by: snapped.y,
      });
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
    commitShape(
      { kind: "polyline", points: polyRef.current },
      useBoardStore.getState().tool === "firewall"
    );
    polyRef.current = null;
    setDraftState(null);
    // Eldveggs-tólið helst virkt svo næsti veggur byrjar strax; Esc/V hættir.
    if (useBoardStore.getState().tool !== "firewall") {
      useBoardStore.getState().setTool("select");
    }
  }, [commitShape, setDraftState]);

  // Skipt um tól í miðjum vegg (V, toolbar, tákn-bakkinn) → veggurinn sem er
  // í vinnslu committast í stað þess að týnast.
  const prevToolRef = useRef(tool);
  useEffect(() => {
    const prev = prevToolRef.current;
    prevToolRef.current = tool;
    if (
      prev !== tool &&
      (prev === "polyline" || prev === "firewall") &&
      tool !== "polyline" &&
      tool !== "firewall" &&
      polyRef.current &&
      polyRef.current.length >= 4
    ) {
      commitShape({ kind: "polyline", points: polyRef.current }, prev === "firewall");
      polyRef.current = null;
      setDraftState(null);
    }
  }, [tool, commitShape, setDraftState]);

  const fjolcropRef = useRef(onFjolcrop);
  fjolcropRef.current = onFjolcrop;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (useBoardStore.getState().tool === "fjolcrop") {
        // Croppa oft: Enter sker, Delete/Backspace eyðir völdum kassa, Esc hættir (neðar — kassarnir hverfa með tólinu).
        if (e.key === "Enter") {
          e.preventDefault();
          fjolcropRef.current?.();
          return;
        }
        if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          const v = useFjolcrop.getState().valinn;
          if (v != null) useFjolcrop.getState().eyda(v);
          return;
        }
      }
      if (e.key === "Escape") {
        if (useBoardStore.getState().tool === "room") {
          polyRef.current = null;
          panRef.current = null;
          eraseRef.current = false;
          setDraftState(null);
          useBoardStore.getState().cancelRoomDraft();
          return;
        }
        // Esc heldur veggnum sem er í vinnslu — lýkur honum og fer í Velja
        // (áður datt allt út).
        if (polyRef.current && polyRef.current.length >= 4) {
          finishPolyline();
        }
        polyRef.current = null;
        panRef.current = null;
        eraseRef.current = false;
        setDraftState(null);
        useBoardStore.getState().setSelected([]);
        useBoardStore.getState().setTool("select");
      }
      if ((e.key === "Enter" || e.key === " ") && polyRef.current) {
        e.preventDefault();
        finishPolyline();
      }
      if (e.key === "Enter" && useBoardStore.getState().tool === "room") {
        e.preventDefault();
        useBoardStore.getState().commitRoomDraft();
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
    const taeki = e.dataTransfer.getData(TAEKI_DRAG_TYPE);
    if (taeki && onTaekiDropped) {
      onTaekiDropped(taeki, world);
      return;
    }
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
        // Fylgihlutirnir voru áður aðeins hliðraðir með teikningunni; nú
        // kvarðast þeir líka svo þeir haldi stað á plani (store.resizeDocument).
        useBoardStore.getState().resizeDocument(id, next);
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
    // LÍNU-ÆTTIN (line · arrow · pen · polyline · MÆLING).
    //
    // Villan (Agnar 27.08: „ég næ einhvern veginn að draga þetta í sundur —
    // mælingarnar"): Transformer skalar hnútinn sjónrænt og ObjectNode
    // núllstillir svo scale aftur í 1 — en hér var scaleX/scaleY HENT. Staða og
    // snúningur festust því á meðan LENGDIN fór alltaf í fyrra horf. Mælingin
    // sat eftir skökk ofan á teikningunni, ekki lengur á veggnum sem hún mældi,
    // og talan lýsti ekki því sem sást. Ferningar/hringir baka skalann inn
    // (obj.width * scaleX) — línur gerðu það ekki.
    //
    // Núna bökum við skalann inn í points, svo geómetrían fylgi því sem
    // notandinn dró og merkimiðinn (reiknaður af lengdinni) fylgi með.
    if ("points" in obj && Array.isArray(obj.points) && obj.points.length >= 4) {
      const sx = node.scaleX || 1;
      const sy = node.scaleY || 1;
      const stretched = Math.abs(sx - 1) > 0.001 || Math.abs(sy - 1) > 0.001;
      const patch: Partial<BoardObject> = {
        x: node.x,
        y: node.y,
        rotation: node.rotation,
        ...(stretched
          ? { points: obj.points.map((v, i) => (i % 2 === 0 ? v * sx : v * sy)) }
          : null),
      } as Partial<BoardObject>;
      // Innslegin raun-lengd (Kvarði) lýsir EKKI nýrri lengd. Væri henni haldið
      // sýndi merkimiðinn áfram gömlu töluna á lengdri línu — talan lygi. Við
      // sleppum henni svo mælingin reiknist aftur af því sem er teiknað.
      // (Óteygð lína heldur sinni innslegnu tölu óbreyttri.)
      if (stretched && obj.type === "measure" && obj.meters != null) {
        (patch as { meters?: number }).meters = undefined;
      }
      useBoardStore.getState().patchObject(id, patch, false);
      useBoardStore.getState().refreshCrossings(false);
      return;
    }
    useBoardStore.getState().patchObject(id, { x: node.x, y: node.y, rotation: node.rotation }, false);
    useBoardStore.getState().refreshCrossings(false);
  };

  const beginDocumentDrag = (id: string) => {
    const objects = useBoardStore.getState().objects;
    const dragged = objects.find((o) => o.id === id);
    if (!dragged) {
      documentDragRef.current = null;
      return;
    }
    // Followers move with the dragged object: everything on a dragged plan,
    // plus every group member (and whatever sits on grouped plans).
    const followers = new Map<string, { id: string; x: number; y: number }>();
    const add = (o: BoardObject) => {
      if (o.id !== id && !followers.has(o.id)) followers.set(o.id, { id: o.id, x: o.x, y: o.y });
    };
    if (dragged.type === "image") objectsOnDocument(dragged, objects).forEach(add);
    if (dragged.groupId) {
      for (const member of objects) {
        if (member.groupId !== dragged.groupId) continue;
        add(member);
        if (member.type === "image" && member.id !== id) {
          objectsOnDocument(member, objects).forEach(add);
        }
      }
    }
    if (!followers.size) {
      documentDragRef.current = null;
      return;
    }
    documentDragRef.current = {
      imageId: id,
      originX: dragged.x,
      originY: dragged.y,
      followers: [...followers.values()],
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
    // Tákn festast ekki við grindina — sama regla og í dragBoundFunc. Þetta var
    // hinn helmingur festingarinnar: dragBoundFunc stýrir hreyfingunni MEÐAN
    // dregið er, en þessi vistar lokastöðuna, svo táknið small aftur á grind
    // við sleppingu þótt hitt væri lagað.
    const isSymbol =
      useBoardStore.getState().objects.find((o) => o.id === id)?.type === "symbol";
    const snapped = isSymbol ? { x, y } : snapPoint(x, y);
    useBoardStore.getState().commitHistory();
    if (!drag || drag.imageId !== id) {
      useBoardStore.getState().patchObject(id, { x: snapped.x, y: snapped.y }, false);
      useBoardStore.getState().refreshCrossings(false);
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
    useBoardStore.getState().refreshCrossings(false);
    documentDragRef.current = null;
  };

  // Loka hraðvalmyndinni við smell utan hennar, skrun eða Esc.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("wheel", close, { passive: true });
    window.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("wheel", close);
      window.removeEventListener("keydown", onEsc);
    };
  }, [menu]);

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const down = rightDownRef.current;
    rightDownRef.current = null;
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.container().getBoundingClientRect();
    const hit = stage.getIntersection({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    let targetId: string | null = null;
    if (hit) {
      const all = useBoardStore.getState().objects;
      let node: Konva.Node | null = hit;
      while (node && node !== (stage as unknown as Konva.Node)) {
        const id = node.id();
        if (id && all.some((o) => o.id === id)) {
          targetId = id;
          break;
        }
        node = node.getParent();
      }
    }
    if (targetId && !useBoardStore.getState().selectedIds.includes(targetId)) {
      useBoardStore.getState().setSelected(expandGroups([targetId]));
    }
    setMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top, targetId });
  };

  const cursor = spacePan ? "grab" : selectLike ? "default" : "crosshair";

  return (
    <div
      ref={wrapRef}
      className="tp-sheet relative h-full w-full overflow-hidden"
      style={{ cursor, touchAction: "none" }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = e.dataTransfer.types.includes("Files") ? "copy" : "copy";
      }}
      onDrop={onDrop}
      onContextMenu={onContextMenu}
      onPointerDownCapture={(e) => {
        if (!isRightMouseButton(e.button, e.pointerType)) return;
        // Catch the right button before Konva objects start a left-style drag,
        // so pan works over symbols, lines, and empty canvas alike.
        e.preventDefault();
        e.stopPropagation();
        rightDownRef.current = { x: e.clientX, y: e.clientY };
        const cam = useBoardStore.getState().camera;
        panRef.current = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y };
        e.currentTarget.style.cursor = "grabbing";
      }}
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
              isSelected={selectedIds.includes(obj.id)}
              pixelsPerMeter={pixelsPerMeter}
              draggable={selectLike && !spacePan && !isDrawnLocked(obj, layers)}
              listening={
                (selectLike || tool === "eraser") &&
                !spacePan &&
                isDrawnVisible(obj, layers) &&
                (obj.type === "image" || !isDrawnLocked(obj, layers))
              }
              onDragStart={(id) => {
                if (panRef.current || pinchRef.current) {
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
                const unit = new Set(expandGroups([id]));
                if (shift) {
                  useBoardStore
                    .getState()
                    .setSelected(
                      current.includes(id)
                        ? current.filter((x) => !unit.has(x))
                        : expandGroups([...current, id])
                    );
                } else {
                  useBoardStore.getState().setSelected([...unit]);
                }
              }}
              onDblClick={(id) => {
                const obj = useBoardStore.getState().objects.find((o) => o.id === id);
                if (obj?.type === "text" || obj?.type === "sticky") onEditText(id);
              }}
            />
          ))}
          {draft &&
          draft.kind !== "marquee" &&
          draft.kind !== "crop" && draft.kind !== "fjolcrop" &&
          draft.kind !== "hvitta" &&
          draft.kind !== "hvitpensill" &&
          draft.kind !== "rect" &&
          draft.kind !== "ellipse" &&
          draft.kind !== "sticky" ? (
            <Line
              points={draft.points}
              stroke={style.stroke}
              strokeWidth={style.strokeWidth}
              dash={dashArray(style.dash, style.strokeWidth)}
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
              stroke={tool === "room" ? roomStyle.color : tool === "checkbox" ? CHECKBOX_STROKE : style.stroke}
              strokeWidth={tool === "room" || tool === "checkbox" ? 2 : style.strokeWidth}
              dash={[8, 6]}
              fill={
                draft.kind === "sticky"
                  ? style.stickyFill
                  : tool === "room"
                    ? fillAlpha(roomStyle.color, roomStyle.opacity)
                    : tool === "checkbox"
                      ? CHECKBOX_FILL
                      : style.fill === "transparent"
                        ? undefined
                        : style.fill
              }
              cornerRadius={draft.kind === "sticky" ? 4 : tool === "checkbox" ? 8 : 0}
              listening={false}
              name="ui-only"
            />
          ) : null}
          {draft && draft.kind === "crop" ? (
            <Rect
              {...rectFromPoints(draft.ax, draft.ay, draft.bx, draft.by)}
              stroke="#FE653F"
              strokeWidth={2 / camera.scale}
              dash={[10, 6]}
              fill="rgba(254,101,63,0.08)"
              listening={false}
              name="ui-only"
            />
          ) : null}
          {tool === "fjolcrop"
            ? fjolKassar.map((k, i) => (
                <Rect
                  key={`fjol-${i}`}
                  id={`fjolkassi-${i}`}
                  x={k.x}
                  y={k.y}
                  width={k.width}
                  height={k.height}
                  stroke="#FE653F"
                  strokeWidth={(i === fjolValinn ? 3 : 2) / camera.scale}
                  dash={[12 / camera.scale, 7 / camera.scale]}
                  fill={i === fjolValinn ? "rgba(254,101,63,0.16)" : "rgba(254,101,63,0.07)"}
                  draggable
                  name="ui-only fjolkassi"
                  onPointerDown={(e) => {
                    e.cancelBubble = true;
                    useFjolcrop.getState().velja(i);
                  }}
                  onDragMove={(e) => {
                    const n = e.target;
                    useFjolcrop.getState().setja(i, { x: n.x(), y: n.y(), width: k.width, height: k.height });
                  }}
                  onDragEnd={(e) => {
                    const n = e.target;
                    useFjolcrop.getState().setja(i, { x: n.x(), y: n.y(), width: k.width, height: k.height });
                  }}
                  onTransformEnd={(e) => {
                    const n = e.target;
                    const ny = { x: n.x(), y: n.y(), width: Math.max(8, n.width() * n.scaleX()), height: Math.max(8, n.height() * n.scaleY()) };
                    n.scaleX(1);
                    n.scaleY(1);
                    useFjolcrop.getState().setja(i, ny);
                  }}
                />
              ))
            : null}
          {tool === "fjolcrop"
            ? fjolKassar.map((k, i) => {
                const s = 1 / camera.scale;
                return (
                  <Group key={`fjolnr-${i}`} x={k.x + 6 * s} y={k.y + 6 * s} listening={false} name="ui-only">
                    <Rect width={30 * s} height={30 * s} cornerRadius={15 * s} fill="#FE653F" />
                    <KonvaText width={30 * s} height={30 * s} align="center" verticalAlign="middle" text={String(i + 1)} fontSize={17 * s} fontStyle="bold" fill="#ffffff" />
                  </Group>
                );
              })
            : null}
          {draft && draft.kind === "fjolcrop" ? (
            <Rect
              {...rectFromPoints(draft.ax, draft.ay, draft.bx, draft.by)}
              stroke="#FE653F"
              strokeWidth={2 / camera.scale}
              dash={[12 / camera.scale, 7 / camera.scale]}
              fill="rgba(254,101,63,0.1)"
              listening={false}
              name="ui-only"
            />
          ) : null}
          <Transformer
            ref={trFjolRef}
            rotateEnabled={false}
            keepRatio={false}
            boundBoxFunc={(oldBox, newBox) => (newBox.width < 16 || newBox.height < 16 ? oldBox : newBox)}
            anchorSize={12}
            borderStroke="#FE653F"
            anchorStroke="#FE653F"
            anchorFill="#fff"
            name="ui-only"
          />
          {ljosLina && tool === "eydalinu"
            ? ljosLina.map((s, i) => (
                <Line
                  key={`ljos-${i}`}
                  points={s}
                  stroke="#e11d2e"
                  strokeWidth={4 / camera.scale}
                  lineCap="round"
                  opacity={0.85}
                  listening={false}
                  name="ui-only"
                />
              ))
            : null}
          {draft && draft.kind === "hvitpensill" ? (
            <Line
              points={draft.points}
              stroke="#ffffff"
              strokeWidth={draft.breidd}
              lineCap="round"
              lineJoin="round"
              opacity={0.92}
              listening={false}
              name="ui-only"
            />
          ) : null}
          {draft && draft.kind === "hvitta" ? (
            <Rect
              {...rectFromPoints(draft.ax, draft.ay, draft.bx, draft.by)}
              stroke="#FE653F"
              strokeWidth={2 / camera.scale}
              dash={[6, 4]}
              fill="rgba(255,255,255,0.85)"
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
            anchorSize={14}
            borderStroke="#FE653F"
            borderStrokeWidth={2}
            anchorStroke="#FE653F"
            anchorFill="#fff"
            anchorCornerRadius={3}
            name="ui-only"
          />
        </Layer>
      </Stage>
      <RoomGataOverlays width={width} height={height} />
      {tool === "room" ? (
        <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full border border-white/10 bg-[#1a1d2e]/90 px-3 py-1.5 text-[12px] text-stone-100 shadow-lg">
          Teiknaðu kassa fyrir rýmið · Enter = búa til · Esc = hætta
        </div>
      ) : null}
      {tool === "fjolcrop" ? (
        <div
          data-fjolcrop
          // Neðst, ofan við stílstikuna (og táknaslána þegar hún sést) — efst skyggði spjaldið á efstu grunnmyndina.
          className={`absolute left-1/2 z-20 flex max-w-[calc(100%-1rem)] -translate-x-1/2 flex-wrap items-center gap-1.5 rounded-2xl border border-white/10 bg-[#1a1d2e]/95 px-3 py-2 text-[12px] text-stone-100 shadow-xl select-none ${
            getHamur(hamur).takn ? "bottom-36" : "bottom-[4.25rem]"
          }`}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <span className="font-semibold text-[#FE653F]">✂ Croppa oft</span>
          <span className="text-stone-300">
            {fjolKassar.length ? "Dragðu næsta kassa — eða færðu/stækkaðu kassa" : "Dragðu kassa yfir hverja grunnmynd (1., 2., 3. hæð …)"}
          </span>
          {fjolKassar.map((_, i) => (
            <button
              key={i}
              type="button"
              data-fjolkassi={i + 1}
              title={`Eyða kassa ${i + 1}`}
              onClick={() => useFjolcrop.getState().eyda(i)}
              className={`rounded-full px-2 py-0.5 font-semibold ${i === fjolValinn ? "bg-[#FE653F] text-white" : "bg-white/10 text-stone-100 hover:bg-white/20"}`}
            >
              {i + 1} ✕
            </button>
          ))}
          {onFinnaGrunnmyndir ? (
            <button
              type="button"
              onClick={() => onFinnaGrunnmyndir()}
              title="Stinga upp á kössum utan um aðskildar grunnmyndir á blaðinu — lagaðu þá eða eyddu áður en þú croppar"
              className="rounded-md border border-white/15 bg-white/5 px-2 py-1 hover:bg-white/12"
            >
              Finna sjálfkrafa
            </button>
          ) : null}
          <button
            type="button"
            disabled={!fjolKassar.length}
            onClick={() => onFjolcrop?.()}
            className="rounded-md bg-[#FE653F] px-2.5 py-1 font-semibold text-white hover:bg-[#ff7a58] disabled:opacity-50"
          >
            Croppa {fjolKassar.length || ""} (Enter)
          </button>
          <button
            type="button"
            onClick={() => useBoardStore.getState().setTool("select")}
            className="rounded-md px-2 py-1 text-stone-300 hover:bg-white/10"
          >
            Hætta (Esc)
          </button>
        </div>
      ) : null}
      {menu
        ? (() => {
            const target = objects.find((o) => o.id === menu.targetId) ?? null;
            const selCount = selectedIds.length;
            const hasGroup = objects.some((o) => selectedIds.includes(o.id) && o.groupId);
            const act = (fn: () => void) => () => {
              setMenu(null);
              fn();
            };
            const item =
              "block w-full rounded-md px-2.5 py-1.5 text-left text-[12px] text-stone-200 hover:bg-white/10";
            return (
              <div
                className="absolute z-30 w-52 rounded-xl border border-white/10 bg-[#1a1d2e]/95 p-1 shadow-2xl backdrop-blur-md"
                style={{
                  left: Math.max(4, Math.min(menu.x, width - 216)),
                  top: Math.max(4, Math.min(menu.y, height - 280)),
                }}
                onPointerDown={(e) => e.stopPropagation()}
                onContextMenu={(e) => e.preventDefault()}
              >
                {useBoardStore.getState().clipboard.length ? (
                  <button
                    type="button"
                    className={item}
                    onClick={act(() => {
                      const { camera } = useBoardStore.getState();
                      useBoardStore.getState().pasteObjects(undefined, {
                        x: (menu.x - camera.x) / camera.scale,
                        y: (menu.y - camera.y) / camera.scale,
                      });
                    })}
                  >
                    📥 Líma hér (⌘V)
                  </button>
                ) : null}
                {target ? (
                  <>
                    <button
                      type="button"
                      className={item}
                      onClick={act(() => {
                        const copied = useBoardStore.getState().copySelected();
                        if (copied.length) void navigator.clipboard?.writeText(serializeClipboard(copied)).catch(() => {});
                      })}
                    >
                      📋 Afrita (⌘C)
                    </button>
                    <button
                      type="button"
                      className={item}
                      onClick={act(() => {
                        const copied = useBoardStore.getState().cutSelected();
                        if (copied.length) void navigator.clipboard?.writeText(serializeClipboard(copied)).catch(() => {});
                      })}
                    >
                      ✂ Klippa (⌘X)
                    </button>
                    <button
                      type="button"
                      className={item}
                      onClick={act(() =>
                        useBoardStore.getState().deleteIds(useBoardStore.getState().selectedIds)
                      )}
                    >
                      🗑 Eyða
                    </button>
                    <button
                      type="button"
                      className={item}
                      onClick={act(() => useBoardStore.getState().duplicateSelected())}
                    >
                      ⧉ Tvöfalda (⌘D)
                    </button>
                    {target.type === "rect" && target.isCheckbox ? (
                      <button
                        type="button"
                        className={item}
                        onClick={act(() => useBoardStore.getState().toggleChecked(target.id))}
                      >
                        {target.checked ? "☐ Afhaka" : "☑ Haka við"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className={item}
                      onClick={act(() => useBoardStore.getState().lockSelected(!target.locked))}
                    >
                      {target.locked ? "🔓 Aflæsa" : "🔒 Læsa"}
                    </button>
                    <button
                      type="button"
                      className={item}
                      onClick={act(() => useBoardStore.getState().bringForward())}
                    >
                      ⬆ Færa fram
                    </button>
                    <button
                      type="button"
                      className={item}
                      onClick={act(() => useBoardStore.getState().sendBackward())}
                    >
                      ⬇ Færa aftar
                    </button>
                    {selCount >= 2 ? (
                      <button
                        type="button"
                        className={item}
                        onClick={act(() => useBoardStore.getState().groupSelected())}
                      >
                        Hópa saman (⌘G)
                      </button>
                    ) : null}
                    {hasGroup ? (
                      <button
                        type="button"
                        className={item}
                        onClick={act(() => useBoardStore.getState().ungroupSelected())}
                      >
                        Afhópa
                      </button>
                    ) : null}
                    {target.type === "polyline" || target.type === "line" || target.type === "pen" ? (
                      <>
                        <div className="my-1 h-px bg-white/10" />
                        <div className="px-2.5 pb-1 pt-0.5 text-[10px] font-medium tracking-wide text-white/40">
                          FLOKKA SEM ELDVEGG
                        </div>
                        <div className="flex gap-1 px-1.5 pb-1">
                          {FIREWALL_CLASSES.map((c) => (
                            <button
                              key={c.label}
                              type="button"
                              className="flex-1 rounded-md px-1 py-1 text-[10px] font-semibold text-white hover:opacity-85"
                              style={{ background: c.color }}
                              onClick={act(() => {
                                const ids = useBoardStore.getState().selectedIds;
                                useBoardStore.getState().updateObjects(ids, (o) =>
                                  o.type === "polyline" || o.type === "line" || o.type === "pen"
                                    ? {
                                        ...o,
                                        stroke: c.color,
                                        dash: c.dash,
                                        strokeWidth: c.width,
                                        opacity: FIREWALL_OPACITY,
                                        name: `EI-veggur ${c.label}`,
                                      }
                                    : o
                                );
                              })}
                            >
                              {c.label}
                            </button>
                          ))}
                        </div>
                      </>
                    ) : null}
                    {target.type === "rect" ? (
                      <>
                        <button
                          type="button"
                          className={item}
                          onClick={act(() => {
                            const on = !target.isRoom;
                            const room = roomOfSelection(useBoardStore.getState().objects, [target.id]);
                            if (!on && room) {
                              useBoardStore.getState().updateObjects(room.ids, (o) =>
                                o.type === "rect" ? { ...o, isRoom: false } : o
                              );
                              return;
                            }
                            useBoardStore.getState().patchObject(target.id, {
                              isRoom: true,
                              roomCounted: true,
                              roomOpacity: 0.22,
                              ...(target.name === "Ferningur" || !target.name ? { name: "Rými" } : {}),
                              ...(target.fill === "transparent" || !target.fill
                                ? { fill: "#FE653F38", stroke: "#FE653F" }
                                : {}),
                            } as never);
                          })}
                        >
                          {target.isRoom ? "🏠 Fjarlægja úr rýmum" : "🏠 Gera að rými (fermetrar)"}
                        </button>
                        {target.isRoom ? (
                          <button
                            type="button"
                            className={item}
                            onClick={act(() => {
                              const room = roomOfSelection(useBoardStore.getState().objects, [target.id]);
                              useBoardStore.getState().setRoomExcluded(
                                room?.key ?? target.id,
                                !target.roomExcluded
                              );
                            })}
                          >
                            {target.roomExcluded
                              ? "☑ Telja með í nettó"
                              : "☐ Frátelja úr nettó (svalir o.þ.h.)"}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className={item}
                          onClick={act(() => {
                            // Frádráttar-svæði (stigahús, skaft …) dregst frá
                            // nýtanlegu fermetrunum í Magntöflunni.
                            const neg = !target.name.startsWith("Frádráttur");
                            useBoardStore.getState().patchObject(target.id, {
                              name: neg ? "Frádráttur" : "Flatarmál",
                              fill: "transparent",
                              stroke: neg ? "#dc2626" : "#16a34a",
                            } as never);
                          })}
                        >
                          {target.name.startsWith("Frádráttur")
                            ? "➕ Telja sem nýtanlegt flatarmál"
                            : "➖ Telja sem frádrátt (stigahús o.þ.h.)"}
                        </button>
                      </>
                    ) : null}
                    {target.type === "image" ? (
                      <>
                        <div className="my-1 h-px bg-white/10" />
                        <button
                          type="button"
                          className={item}
                          onClick={act(() => {
                            // Tengd úttektarmynd má croppa: skurðurinn fylgir (uttekt.myndSkurdur, sjá skurdurEftirCrop)
                            useBoardStore.getState().setTool("crop");
                            toast.message(
                              "Dragðu ramma yfir svæðið sem á að HALDA — restin sníðst af"
                            );
                          })}
                        >
                          ✂ Croppa teikningu
                        </button>
                        <button
                          type="button"
                          className={item}
                          title="Margar grunnmyndir á einu blaði: dragðu kassa yfir hverja og skerðu þær allar í einu"
                          onClick={act(() => raesaFjolcrop())}
                        >
                          ✂ Croppa oft — margar hæðir
                        </button>
                        <button
                          type="button"
                          className={item}
                          onClick={act(() => onRequestStrip?.(target.id))}
                        >
                          🧹 Hreinsa teikningu
                        </button>
                      </>
                    ) : null}
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className={item}
                      onClick={act(() => {
                        const s = useBoardStore.getState();
                        s.setSelected(selectableIds(s.objects, s.layers));
                      })}
                    >
                      Velja allt (⌘A)
                    </button>
                    <button
                      type="button"
                      className={item}
                      onClick={act(() => {
                        const s = useBoardStore.getState();
                        s.setCamera(cameraFit(boardBounds(s.objects), width, height));
                      })}
                    >
                      Passa á skjá (⌘0)
                    </button>
                    <div className="my-1 h-px bg-white/10" />
                    <button
                      type="button"
                      className={item}
                      onClick={act(() => useBoardStore.getState().startFirewall())}
                    >
                      🔥 Eldveggur
                    </button>
                    <button
                      type="button"
                      className={item}
                      onClick={act(() => useBoardStore.getState().setTool("calibrate"))}
                    >
                      📏 Kvarði
                    </button>
                    <button
                      type="button"
                      className={item}
                      onClick={act(() => useBoardStore.getState().setTool("eraser"))}
                    >
                      Strokleður (E)
                    </button>
                  </>
                )}
              </div>
            );
          })()
        : null}
    </div>
  );
}

