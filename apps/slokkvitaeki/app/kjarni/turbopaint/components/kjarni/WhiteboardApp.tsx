"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Settings2 } from "lucide-react";
import { toast } from "sonner";
import { downloadBlob, exportBoardJson, exportCleanPlan, exportPdf, exportPngBlob, slug } from "../../lib/board/export-board";
import { boardBounds, cameraFit, objectsOnDocument, screenFromWorld, worldFromScreen } from "../../lib/board/geometry";
import {
  canvasToAsset,
  isFirewallLabelWord,
  isNameWord,
  stripToInk,
  whiteOutWords,
} from "../../lib/board/strip";
import { cropPlanAsset } from "../../lib/board/crop";
import { classifyFile, importFiles } from "../../lib/board/import-files";
import { makeSymbol, markupKitForPlan, SYMBOL_DRAG_TYPE } from "../../lib/board/markup-kit";
import { detectFirewallsOnPlan, isFirewallMark } from "../../lib/board/detect-firewalls";
import { isCleanWall, redrawWallsFromPlan } from "../../lib/board/simplify-plan";
import { isMvsMark, placeMvs165Equipment } from "../../lib/board/mvs165";
import type { OcrWord } from "../../lib/board/firewall-rating";
import { clearBoard, loadBoard, migrateBoardObjects, schedulePersist } from "../../lib/board/persistence";
import { dataUrlToBlob, putAsset } from "../../lib/board/assets";
import { getRegisteredStage } from "../../lib/board/stage-ref";
import { newId, snapPoint, useBoardStore } from "../../lib/board/store";
import type { BoardDocument, BoardObject } from "../../lib/board/types";
import { BoardCanvas } from "./BoardCanvas";
import { CountTable } from "./CountTable";
import { RightPanel } from "./RightPanel";
import { StyleStrip, Toolbar } from "./Toolbar";
import { SymbolTray } from "./SymbolTray";
import { PlanLayerToggle } from "./PlanLayerToggle";
import { TopBar } from "./TopBar";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";

type ExportScale = 1 | 2 | 3 | 4;

function isTyping(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
}

export function WhiteboardApp() {
  const shellRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 1200, height: 800 });
  const [exportOpen, setExportOpen] = useState(false);
  const [exportTarget, setExportTarget] = useState<"board" | "viewport" | "selection">("board");
  const [helpOpen, setHelpOpen] = useState(false);
  const [calibrateDraft, setCalibrateDraft] = useState<{ px: number; points: number[] } | null>(null);
  const [calibrateMeters, setCalibrateMeters] = useState("10");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  // Eiginleika-panellinn sem yfirlag á síma/spjaldtölvu (< lg) — á desktop er
  // hann fastur dálkur til hægri eins og áður.
  const [panelOpen, setPanelOpen] = useState(false);
  const markBusyRef = useRef(false);
  const hydrated = useBoardStore((s) => s.hydrated);
  const importProgress = useBoardStore((s) => s.importProgress);
  const objects = useBoardStore((s) => s.objects);
  const camera = useBoardStore((s) => s.camera);
  const selectedIds = useBoardStore((s) => s.selectedIds);

  useEffect(() => {
    void loadBoard();
    // Prófunar-krókur: reykprófin (tools/turbopaint-smoke.cjs) lesa raun-stöðu
    // borðsins gegnum window.__tpStore í stað þess að giska út frá DOM.
    (window as unknown as { __tpStore?: typeof useBoardStore }).__tpStore = useBoardStore;
  }, []);

  // Lag-smellur á hlut utan skjás: miðja myndavélina á hann (sama zoom).
  const focusObject = useCallback(
    (id: string) => {
      const st = useBoardStore.getState();
      const obj = st.objects.find((o) => o.id === id);
      if (!obj) return;
      const b = boardBounds([obj]);
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      const cam = st.camera;
      const sx = cx * cam.scale + cam.x;
      const sy = cy * cam.scale + cam.y;
      const margin = 40;
      const inView =
        sx >= margin && sy >= margin && sx <= size.width - margin && sy <= size.height - margin;
      if (inView) return;
      st.setCamera({
        scale: cam.scale,
        x: size.width / 2 - cx * cam.scale,
        y: size.height / 2 - cy * cam.scale,
      });
    },
    [size.width, size.height]
  );

  useEffect(() => {
    if (!hydrated) return;
    const unsub = useBoardStore.subscribe(schedulePersist);
    // Breytingar sem notandinn gerði MEÐAN hleðslan stóð yfir (t.d. skírði
    // borðið á hægu neti) gerðust fyrir áskriftina — grípum þær núna.
    schedulePersist();
    return unsub;
  }, [hydrated]);

  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const measure = () => {
      setSize({ width: el.clientWidth, height: el.clientHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [hydrated]);

  const markFirewalls = useCallback(
    async (
      plans: typeof objects,
      textByObjectId: Record<string, OcrWord[]> = {}
    ) => {
      const images = plans.filter((o): o is Extract<typeof o, { type: "image" }> => o.type === "image");
      if (!images.length) {
        toast.message("Ekkert gólfplön á borðinu til að merkja");
        return;
      }
      // Tvísmellur á E-30/E-60 meðan greining keyrir tvöfaldaði minnisálagið
      // og átti sinn þátt í frystingunni — ein keyrsla í einu.
      if (markBusyRef.current) {
        toast.message("Eldveggja-greining er þegar í gangi — augnablik…");
        return;
      }
      markBusyRef.current = true;
      const existing = useBoardStore
        .getState()
        .objects.filter((o) => isFirewallMark(o) || isMvsMark(o))
        .map((o) => o.id);
      if (existing.length) useBoardStore.getState().deleteIds(existing);
      let total = 0;
      let gear = 0;
      try {
        for (let i = 0; i < images.length; i++) {
          const plan = images[i];
          useBoardStore.getState().setImportProgress({
            fileName: plan.name,
            percent: 8,
            message: `Les teikningu og 165.BR1 (${i + 1}/${images.length})…`,
          });
          const { objects: marks, hits, words } = await detectFirewallsOnPlan(plan, {
            extraWords: textByObjectId[plan.id],
            onProgress: (message, percent) =>
              useBoardStore.getState().setImportProgress({
                fileName: plan.name,
                percent,
                message,
              }),
          });
          const equipment = placeMvs165Equipment(plan, words, {
            pixelsPerMeter: useBoardStore.getState().pixelsPerMeter,
          });
          if (equipment.pixelsPerMeter && !useBoardStore.getState().pixelsPerMeter) {
            useBoardStore.getState().setPixelsPerMeter(equipment.pixelsPerMeter);
          }
          const incomingMarks = [...marks, ...equipment.objects];
          if (incomingMarks.length) useBoardStore.getState().addObjects(incomingMarks, false);
          total += hits.length;
          gear += equipment.objects.filter((o) => o.type === "symbol").length;
          // Öndun milli teikninga — látum React mála framvinduna og GC hreinsa
          await new Promise((resolve) => setTimeout(resolve, 60));
        }
        useBoardStore.getState().setImportProgress(null);
        if (total || gear) {
          toast.success(
            `Merkti ${total} eldveggi og staðsetti slökkvitæki / slöngur / skilti skv. 165.BR1`
          );
        } else {
          toast.message("Fann engin E-30 / E-60 eða SLT/BRSL merki á teikningunni");
        }
      } catch (err) {
        useBoardStore.getState().setImportProgress(null);
        toast.error(err instanceof Error ? err.message : "Gat ekki merkt eldveggi");
      } finally {
        markBusyRef.current = false;
      }
    },
    []
  );

  const runImport = useCallback(async (files: File[], world?: { x: number; y: number }) => {
    const json = files.find((f) => f.name.endsWith(".kjarni.json") || f.name.endsWith(".json"));
    if (json) {
      await importKjarniJson(json);
      return;
    }
    const supported = files.filter((f) => classifyFile(f) !== "unknown");
    if (!supported.length) {
      toast.error("Stuðningur er við PDF, TIF, PNG, JPG og SVG.");
      return;
    }
    const origin = world ?? {
      x: boardBounds(useBoardStore.getState().objects).x,
      y: boardBounds(useBoardStore.getState().objects).y + boardBounds(useBoardStore.getState().objects).height + 80,
    };
    try {
      const { objects: incoming, warnings, textByObjectId } = await importFiles(
        supported,
        useBoardStore.getState().importQuality,
        origin,
        (fileName, percent, message) =>
          useBoardStore.getState().setImportProgress({ fileName, percent, message })
      );
      useBoardStore.getState().setImportProgress(null);
      if (!incoming.length) {
        toast.error(warnings[0] || "Ekkert kom inn");
        return;
      }
      const isPlan = supported.some((f) => {
        const kind = classifyFile(f);
        return kind === "pdf" || kind === "tiff";
      });
      const kit = isPlan ? incoming.flatMap((img) => markupKitForPlan(img)) : [];
      useBoardStore.getState().addObjects([...incoming, ...kit], false);
      useBoardStore.getState().setTool("select");
      const bounds = boardBounds([...incoming, ...kit]);
      const view = shellRef.current;
      if (view) {
        useBoardStore.getState().setCamera(cameraFit(bounds, view.clientWidth, view.clientHeight));
      }
      toast.success(
        isPlan
          ? "Gólfplön tilbúið — merki nú E-30 / E-60 eldveggi"
          : incoming.length === 1
            ? `${incoming[0].name} er á borðinu`
            : `${incoming.length} síður settar á borðið`
      );
      warnings.forEach((w) => toast.message(w));
      if (isPlan) {
        await markFirewalls(incoming, textByObjectId);
      }
    } catch (err) {
      useBoardStore.getState().setImportProgress(null);
      toast.error(err instanceof Error ? err.message : "Innflutningur mistókst");
    }
  }, [markFirewalls]);

  const dropSymbol = useCallback((symbolId: string, world: { x: number; y: number }) => {
    if (symbolId === "firewall") {
      // Eldveggur is drawn along the wall, not stamped as a badge.
      useBoardStore.getState().startFirewall();
      toast.message("Eldveggur: smelltu horn af horni — Enter lýkur vegg, Esc hættir og heldur veggnum");
      return;
    }
    const spot = snapPoint(world.x - 32, world.y - 32);
    const obj = makeSymbol(symbolId, spot.x, spot.y);
    useBoardStore.getState().addObjects([obj], true);
    useBoardStore.getState().setTool("select");
  }, []);

  const [stripPlanId, setStripPlanId] = useState<string | null>(null);

  const resolvePlan = useCallback(() => {
    const state = useBoardStore.getState();
    const images = state.objects.filter(
      (o): o is Extract<typeof o, { type: "image" }> => o.type === "image" && !o.hidden
    );
    const selected = images.find((img) => state.selectedIds.includes(img.id));
    if (selected) return selected;
    if (state.selectedIds.length) {
      const chosen = state.objects.filter((o) => state.selectedIds.includes(o.id));
      const host = images.find((img) => objectsOnDocument(img, chosen).length > 0);
      if (host) return host;
    }
    return images.length === 1 ? images[0] : null;
  }, []);

  const runStrip = useCallback(
    async (planId: string, opts: { threshold: number; keepNames: boolean; keepFw: boolean }) => {
      const plan = useBoardStore.getState().objects.find((o) => o.id === planId);
      if (!plan || plan.type !== "image") return;
      try {
        useBoardStore.getState().setImportProgress({
          fileName: plan.name,
          percent: 4,
          message: "Hreinsa bakgrunn — geri hvítt á bak við…",
        });
        const { canvas } = await stripToInk(plan, opts.threshold, (p) =>
          useBoardStore.getState().setImportProgress({
            fileName: plan.name,
            percent: Math.round(p * 0.55),
            message: "Hreinsa bakgrunn — geri hvítt á bak við…",
          })
        );
        let assetId = await canvasToAsset(canvas);
        // Eitt ⌘Z skilar upprunalegu myndinni (asset-skipti í einni sögufærslu).
        useBoardStore.getState().patchObject(plan.id, { assetId }, true);
        const needOcr = opts.keepFw || !opts.keepNames;
        if (needOcr) {
          const updated = useBoardStore.getState().objects.find((o) => o.id === plan.id);
          if (updated && updated.type === "image") {
            const res = await detectFirewallsOnPlan(updated, {
              onProgress: (message, percent) =>
                useBoardStore.getState().setImportProgress({
                  fileName: plan.name,
                  percent: 55 + Math.round(percent * 0.4),
                  message,
                }),
            });
            const toErase = res.words.filter(
              (w) =>
                (!opts.keepNames && isNameWord(w.text) && !isFirewallLabelWord(w.text)) ||
                (!opts.keepFw && isFirewallLabelWord(w.text))
            );
            if (toErase.length) {
              whiteOutWords(canvas, toErase);
              assetId = await canvasToAsset(canvas);
              useBoardStore.getState().patchObject(plan.id, { assetId }, false);
            }
            if (opts.keepFw && res.objects.length) {
              const stale = useBoardStore
                .getState()
                .objects.filter((o) => isFirewallMark(o) && o.parentId === plan.id)
                .map((o) => o.id);
              if (stale.length) useBoardStore.getState().deleteIds(stale);
              useBoardStore.getState().addObjects(res.objects, false);
            }
          }
        }
        canvas.width = 0;
        canvas.height = 0;
        useBoardStore.getState().setImportProgress(null);
        toast.success(
          opts.keepFw
            ? "Teikningin hreinsuð — hvítur grunnur, eldveggir merktir"
            : "Teikningin hreinsuð — hvítur grunnur"
        );
      } catch (err) {
        useBoardStore.getState().setImportProgress(null);
        toast.error(err instanceof Error ? err.message : "Hreinsun mistókst");
      }
    },
    []
  );

  const runRedrawWalls = useCallback(async (planId: string) => {
    const plan = useBoardStore.getState().objects.find((o) => o.id === planId);
    if (!plan || plan.type !== "image") return;
    try {
      useBoardStore.getState().setImportProgress({
        fileName: plan.name,
        percent: 6,
        message: "Endurteikna veggi — les teikningu…",
      });
      const { objects: walls } = await redrawWallsFromPlan(plan, {
        onProgress: (message, percent) =>
          useBoardStore.getState().setImportProgress({
            fileName: plan.name,
            percent,
            message,
          }),
      });
      const stale = useBoardStore
        .getState()
        .objects.filter((o) => isCleanWall(o) && o.parentId === plan.id)
        .map((o) => o.id);
      if (stale.length) useBoardStore.getState().deleteIds(stale);
      if (!walls.length) {
        useBoardStore.getState().setImportProgress(null);
        toast.message("Fann enga þykka veggi — prófaðu hærri innflutningsgæði");
        return;
      }
      useBoardStore.getState().addObjects(walls, false);
      useBoardStore.getState().patchObject(plan.id, { hidden: true }, false);
      useBoardStore.getState().setImportProgress(null);
      toast.success(
        `Hreint grunnplan — ${walls.length} veggir. Fela/sýna teikningu og veggi í lagalistanum.`
      );
    } catch (err) {
      useBoardStore.getState().setImportProgress(null);
      toast.error(err instanceof Error ? err.message : "Gat ekki endurteiknað veggi");
    }
  }, []);

  const runCrop = useCallback(
    async (rect: { x: number; y: number; width: number; height: number }) => {
      const state = useBoardStore.getState();
      const images = state.objects.filter(
        (o): o is Extract<typeof o, { type: "image" }> => o.type === "image" && !o.hidden
      );
      // Efsta planið sem ramminn sker (aftar í listanum = ofar á borðinu).
      const plan = [...images]
        .reverse()
        .find(
          (img) =>
            rect.x < img.x + img.width &&
            rect.x + rect.width > img.x &&
            rect.y < img.y + img.height &&
            rect.y + rect.height > img.y
        );
      if (!plan) {
        toast.error("Ramminn nær ekki yfir neina teikningu");
        return;
      }
      if (Math.abs(plan.rotation % 360) > 0.5) {
        toast.error("Snúðu teikningunni í 0° áður en croppað er");
        return;
      }
      try {
        const res = await cropPlanAsset(plan, rect);
        useBoardStore.getState().patchObject(plan.id, res, true);
        toast.success("Króppað — ⌘Z afturkallar");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Cropp mistókst");
      }
    },
    []
  );

  // Sækja teikningu beint af permalink (t.d. skjalasafn.reykjavik.is FotoWeb)
  // gegnum /api/turbopaint/fetch-plan proxy-ið — CORS bannar beina sókn.
  const runUrlImport = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim();
      if (!/^https?:\/\//i.test(trimmed)) {
        toast.error("Þetta lítur ekki út eins og slóð");
        return;
      }
      try {
        useBoardStore.getState().setImportProgress({
          fileName: "permalink",
          percent: 10,
          message: "Sæki teikningu af skjalasafninu…",
        });
        const res = await fetch(`/api/turbopaint/fetch-plan?url=${encodeURIComponent(trimmed)}`);
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error || `Gat ekki sótt af slóðinni (${res.status})`);
        }
        const blob = await res.blob();
        const encoded = res.headers.get("x-plan-filename");
        const name = encoded
          ? decodeURIComponent(encoded)
          : trimmed.split("/").pop() || "teikning";
        useBoardStore.getState().setImportProgress(null);
        const file = new File([blob], name, { type: blob.type || "image/tiff" });
        await runImport([file]);
      } catch (err) {
        useBoardStore.getState().setImportProgress(null);
        toast.error(err instanceof Error ? err.message : "Gat ekki sótt af slóðinni");
      }
    },
    [runImport]
  );

  // Copy → paste permalink beint á borðið.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData("text")?.trim() ?? "";
      if (!/^https?:\/\//i.test(text)) return;
      let host = "";
      try {
        host = new URL(text).hostname;
      } catch {
        return;
      }
      const archive = host === "skjalasafn.reykjavik.is";
      // Skjalasafns-permalink er ALLTAF innflutningur — líka þótt fókusinn
      // sitji óvart í nafnareitnum (slóðin límdist þar inn og skemmdi nafnið).
      if (isTyping(e.target) && !archive) return;
      const fileLike = /\.(tiff?|pdf|png|jpe?g|webp|info)([?#]|$)/i.test(text);
      if (archive || fileLike) {
        e.preventDefault();
        void runUrlImport(text);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [runUrlImport]);

  const openSamplePlan = useCallback(async () => {
    try {
      useBoardStore.getState().setImportProgress({
        fileName: "golfplan.pdf",
        percent: 4,
        message: "Sæki gólfplön…",
      });
      const res = await fetch("/samples/golfplan.pdf");
      if (!res.ok) throw new Error("Gat ekki sótt PDF skrána");
      const blob = await res.blob();
      const file = new File([blob], "golfplan.pdf", { type: "application/pdf" });
      await clearBoard();
      await runImport([file], { x: 80, y: 80 });
      useBoardStore.getState().setName("Gólfplön");
    } catch (err) {
      useBoardStore.getState().setImportProgress(null);
      toast.error(err instanceof Error ? err.message : "Gat ekki opnað PDF");
    }
  }, [runImport]);

  const sampleOpened = useRef(false);
  useEffect(() => {
    if (!hydrated || sampleOpened.current) return;
    if (new URLSearchParams(window.location.search).get("open") !== "golfplan") return;
    sampleOpened.current = true;
    window.history.replaceState({}, "", window.location.pathname);
    void openSamplePlan();
  }, [hydrated, openSamplePlan]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const meta = e.metaKey || e.ctrlKey;
      const store = useBoardStore.getState();
      if (e.code === "Space") {
        e.preventDefault();
        store.setSpacePan(true);
      }
      if (meta && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
      }
      if (meta && e.key.toLowerCase() === "y") {
        e.preventDefault();
        store.redo();
      }
      if (meta && e.key.toLowerCase() === "d") {
        e.preventDefault();
        store.duplicateSelected();
      }
      if (meta && e.key.toLowerCase() === "g") {
        e.preventDefault();
        if (e.shiftKey) store.ungroupSelected();
        else store.groupSelected();
      }
      if (meta && e.key.toLowerCase() === "a") {
        e.preventDefault();
        store.setSelected(store.objects.filter((o) => !o.locked && !o.hidden).map((o) => o.id));
      }
      if (meta && e.key === "0") {
        e.preventDefault();
        const view = shellRef.current;
        if (view) store.setCamera(cameraFit(boardBounds(store.objects), view.clientWidth, view.clientHeight));
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        store.deleteIds(store.selectedIds.filter((id) => !store.objects.find((o) => o.id === id)?.locked));
      }
      if (!meta && !e.altKey) {
        const map: Record<string, Parameters<typeof store.setTool>[0]> = {
          v: "select",
          h: "hand",
          r: "rect",
          o: "ellipse",
          l: "line",
          a: "arrow",
          w: "polyline",
          p: "pen",
          t: "text",
          n: "sticky",
          m: "measure",
          s: "symbol",
          k: "calibrate",
          e: "eraser",
        };
        const tool = map[e.key.toLowerCase()];
        if (tool) store.setTool(tool);
      }
      if (e.key === "?") setHelpOpen(true);
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code === "Space") useBoardStore.getState().setSpacePan(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  const editing = objects.find((o) => o.id === editingId);

  return (
    <div
      className="tp-root dark flex h-full min-h-0 flex-1 flex-col bg-[#0f1117] text-stone-100"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const symbolId = e.dataTransfer.getData(SYMBOL_DRAG_TYPE);
        if (symbolId) {
          const shell = shellRef.current;
          if (!shell) return;
          const rect = shell.getBoundingClientRect();
          const world = worldFromScreen(
            { x: e.clientX - rect.left, y: e.clientY - rect.top },
            useBoardStore.getState().camera
          );
          dropSymbol(symbolId, world);
          return;
        }
        const files = [...e.dataTransfer.files];
        if (files.length) void runImport(files);
      }}
    >
      <TopBar
        onImport={(files) => void runImport(files)}
        onVeljaTeikningu={(infoUrl) => void runUrlImport(infoUrl)}
        onImportUrl={() => {
          const raw = window.prompt(
            "Límdu inn permalink af skjalasafn.reykjavik.is (…tif.info) eða beina skráaslóð:"
          );
          if (raw) void runUrlImport(raw);
        }}
        onExport={() => {
          setExportTarget("board");
          setExportOpen(true);
        }}
        onHelp={() => setHelpOpen(true)}
        onOpenSample={() => void openSamplePlan()}
        onMarkFirewalls={() => {
          // Sé teikning valin er AÐEINS hún greind — annars allar á borðinu.
          const st = useBoardStore.getState();
          const chosen = st.objects.filter((o) => o.type === "image" && st.selectedIds.includes(o.id));
          void markFirewalls(chosen.length ? chosen : st.objects);
        }}
        onStrip={() => {
          const plan = resolvePlan();
          if (!plan) {
            toast.error("Engin teikning fannst — veldu teikninguna fyrst");
            return;
          }
          setStripPlanId(plan.id);
        }}
        onRedrawWalls={() => {
          const plan = resolvePlan();
          if (!plan) {
            toast.error("Engin teikning fannst — veldu teikninguna fyrst");
            return;
          }
          void runRedrawWalls(plan.id);
        }}
        onOpenLayers={() => setPanelOpen(true)}
        viewSize={size}
      />
      <div className="flex min-h-0 flex-1">
        <div
          ref={shellRef}
          className="relative min-w-0 flex-1 bg-[#ece7de]"
          onDragEnter={(e) => {
            if (e.dataTransfer?.types?.includes("Files")) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
        >
          {hydrated ? (
            <BoardCanvas
              width={size.width}
              height={size.height}
              onEditText={setEditingId}
              onFilesDropped={(files, world) => {
                setDragOver(false);
                void runImport(files, world);
              }}
              onSymbolDropped={(symbolId, world) => {
                setDragOver(false);
                dropSymbol(symbolId, world);
              }}
              onCalibrate={(px, points) => setCalibrateDraft({ px, points })}
              onCropRect={(rect) => void runCrop(rect)}
              onRequestStrip={(planId) => setStripPlanId(planId)}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-stone-500">
              <div className="text-center">
                <div className="mb-3 text-3xl font-bold text-[#FE653F]">T</div>
                <div className="text-lg font-medium text-stone-700">TurboPaint</div>
                <div className="mt-1 text-sm">Hleð borði…</div>
              </div>
            </div>
          )}
          <div className="pointer-events-none absolute inset-0">
            {/* Verkfærasúlan var lóðrétt MIÐJUÐ (top-1/2 + -translate-y-1/2).
                Á síma er hún hærri en borðið, svo hún klipptist af að ofan OG
                lenti ofan í Táknaborðinu + Stílborðinu neðst (Agnar 27.08).
                Núna: bundin milli topps og neðri borðanna og miðjuð INNAN þess
                bils — hún getur því hvorki farið upp fyrir né niður í borðin.
                Súlan sjálf skrunar ef hún kemst enn ekki fyrir (sjá styles.css). */}
            <div className="absolute top-2 bottom-28 left-2 flex items-center sm:left-3">
              <Toolbar />
            </div>
            <div className="pointer-events-auto absolute top-3 right-3">
              <CountTable />
            </div>
            {selectedIds.length ? (
              <div className="pointer-events-auto absolute right-3 bottom-28 lg:hidden">
                <button
                  type="button"
                  title="Eiginleikar valins hlutar"
                  onClick={() => setPanelOpen(true)}
                  className="flex size-11 items-center justify-center rounded-full bg-[#FE653F] text-white shadow-xl shadow-black/40 active:translate-y-px"
                >
                  <Settings2 className="size-5" />
                </button>
              </div>
            ) : null}
            <div className="absolute top-3 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
              <PlanLayerToggle />
              <SelectionBar
                onExportSelection={() => {
                  setExportTarget("selection");
                  setExportOpen(true);
                }}
              />
            </div>
            <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
              <SymbolTray />
              <StyleStrip />
            </div>
          </div>
          {dragOver ? (
            <div className="pointer-events-none absolute inset-4 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed border-[#FE653F] bg-[#FE653F]/10">
              <div className="rounded-xl bg-[#1a1d2e] px-6 py-4 text-center text-sm text-white shadow-xl">
                Sleppið PDF, TIF eða mynd hér
                <div className="mt-1 text-xs text-stone-400">Stórar skrár 5–30 MB eru unnar í vafranum</div>
              </div>
            </div>
          ) : null}
          {importProgress ? (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#0f1117]/50 backdrop-blur-[2px]">
              <div className="w-[min(92vw,420px)] rounded-2xl border border-white/10 bg-[#1a1d2e] p-5 shadow-2xl">
                <div className="text-sm font-medium">Flyt inn {importProgress.fileName}</div>
                <div className="mt-1 text-xs text-stone-400">{importProgress.message}</div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full bg-[#FE653F] transition-all"
                    style={{ width: `${importProgress.percent}%` }}
                  />
                </div>
              </div>
            </div>
          ) : null}
          {editing && (editing.type === "text" || editing.type === "sticky") ? (
            <TextEditor obj={editing} camera={camera} onClose={() => setEditingId(null)} />
          ) : null}
          {!objects.length && hydrated ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="rounded-2xl border border-stone-300 bg-white/90 px-8 py-6 text-center shadow-lg">
                <div className="text-base font-medium text-stone-800">Tómt hvítu borð</div>
                <div className="mt-1 max-w-sm text-sm text-stone-500">
                  Dragðu inn gólfplön sem PDF eða TIF — síðan teiknarðu línur, örvar og brunavarnatákn ofan á.
                </div>
              </div>
            </div>
          ) : null}
        </div>
        <div className="hidden lg:block">
          <RightPanel onFocusObject={focusObject} />
        </div>
      </div>
      {panelOpen ? (
        <div className="lg:hidden">
          <div
            className="fixed inset-0 z-40 bg-black/50"
            aria-label="Loka eiginleikum"
            onClick={() => setPanelOpen(false)}
          />
          <div className="fixed inset-y-0 right-0 z-40 flex w-[300px] max-w-[85vw] flex-col shadow-2xl shadow-black/60 [&>aside]:h-full [&>aside]:w-full">
            <button
              type="button"
              className="absolute left-0 top-3 z-10 -translate-x-full rounded-l-md bg-[#12141c] px-2 py-2 text-xs text-stone-300"
              onClick={() => setPanelOpen(false)}
            >
              Loka
            </button>
            <RightPanel onFocusObject={focusObject} />
          </div>
        </div>
      ) : null}
      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} initialTarget={exportTarget} />
      <StripDialog
        planId={stripPlanId}
        planName={
          stripPlanId
            ? (objects.find((o) => o.id === stripPlanId)?.name ?? "teikning")
            : ""
        }
        onClose={() => setStripPlanId(null)}
        onRun={(opts) => {
          const id = stripPlanId;
          setStripPlanId(null);
          if (id) void runStrip(id, opts);
        }}
      />
      <HelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
      <Dialog open={calibrateDraft !== null} onOpenChange={(o) => !o && setCalibrateDraft(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Kvarða gólfplön</DialogTitle>
            <DialogDescription>
              Sláðu inn raunlengdina sem þú mældir (t.d. 4,28 eða 4280 mm) — línan vistast á
              teikninguna með tölunni og allar mælingar sýnast í millimetrum.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={calibrateMeters}
            onChange={(e) => setCalibrateMeters(e.target.value)}
            inputMode="decimal"
            placeholder="Lengd í metrum (eða mm)"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCalibrateDraft(null)}>
              Hætta við
            </Button>
            <Button
              onClick={() => {
                const raw = Number(calibrateMeters.replace(",", "."));
                if (!calibrateDraft || !raw) return;
                // 100+ án kommu = innslegið í millimetrum (byggingavenja)
                const meters = raw >= 100 ? raw / 1000 : raw;
                useBoardStore.getState().setPixelsPerMeter(calibrateDraft.px / meters);
                // Innslegna mælingin HELST á teikningunni — merkt raun-lengdinni
                useBoardStore.getState().addObjects(
                  [
                    {
                      id: newId(),
                      type: "measure",
                      x: 0,
                      y: 0,
                      points: calibrateDraft.points,
                      stroke: "#2563eb",
                      strokeWidth: 2,
                      dash: "solid",
                      meters,
                      rotation: 0,
                      opacity: 1,
                      locked: false,
                      hidden: false,
                      name: "Mæling (innslegin)",
                    },
                  ],
                  false
                );
                toast.success("Kvarði stilltur — mælingin vistuð á teikninguna");
                setCalibrateDraft(null);
              }}
            >
              Vista kvarða
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StripDialog({
  planId,
  planName,
  onClose,
  onRun,
}: {
  planId: string | null;
  planName: string;
  onClose: () => void;
  onRun: (opts: { threshold: number; keepNames: boolean; keepFw: boolean }) => void;
}) {
  const [threshold, setThreshold] = useState(0.62);
  const [keepNames, setKeepNames] = useState(true);
  const [keepFw, setKeepFw] = useState(true);
  return (
    <Dialog open={planId !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Hreinsa teikningu</DialogTitle>
          <DialogDescription>
            „{planName}" verður einfölduð: gulur/grár bakgrunnur og litaðar merkingar hverfa —
            eftir standa veggir og svart blek á hvítum grunni. ⌘Z skilar upprunalegu myndinni.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 text-sm">
          <label className="grid gap-1.5">
            <span className="text-muted-foreground">
              Næmi — hærra heldur fleiri daufum línum ({Math.round(threshold * 100)}%)
            </span>
            <input
              type="range"
              min={35}
              max={80}
              value={Math.round(threshold * 100)}
              onChange={(e) => setThreshold(Number(e.target.value) / 100)}
            />
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={keepNames}
              onChange={(e) => setKeepNames(e.target.checked)}
            />
            <span>Halda rýmisheitum (annars strokast fundin heiti út)</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={keepFw}
              onChange={(e) => setKeepFw(e.target.checked)}
            />
            <span>Brunaveggir — lesa E-30 / E-60 og merkja þá á teikninguna</span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Hætta við
          </Button>
          <Button onClick={() => onRun({ threshold, keepNames, keepFw })}>Hreinsa</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SelectionBar({ onExportSelection }: { onExportSelection: () => void }) {
  const selectedIds = useBoardStore((s) => s.selectedIds);
  const objects = useBoardStore((s) => s.objects);
  const selected = objects.filter((o) => selectedIds.includes(o.id));
  const hasGroup = selected.some((o) => o.groupId);
  if (selected.length < 2 && !hasGroup) return null;
  const btn =
    "rounded-lg px-2 py-1 text-[11px] text-stone-200 hover:bg-white/10";
  return (
    <div className="pointer-events-auto flex items-center gap-0.5 rounded-xl border border-white/10 bg-[#1a1d2e]/95 px-1.5 py-1 shadow-xl">
      <span className="px-1.5 text-[11px] text-white/45">{selected.length} valin</span>
      {selected.length >= 2 ? (
        <button type="button" className={btn} onClick={() => useBoardStore.getState().groupSelected()}>
          Hópa (⌘G)
        </button>
      ) : null}
      {hasGroup ? (
        <button type="button" className={btn} onClick={() => useBoardStore.getState().ungroupSelected()}>
          Afhópa
        </button>
      ) : null}
      <button type="button" className={btn} onClick={onExportSelection}>
        Flytja út val
      </button>
    </div>
  );
}

function TextEditor({
  obj,
  camera,
  onClose,
}: {
  obj: Extract<BoardObject, { type: "text" | "sticky" }>;
  camera: { x: number; y: number; scale: number };
  onClose: () => void;
}) {
  const pos = screenFromWorld({ x: obj.x, y: obj.y }, camera);
  const [value, setValue] = useState(obj.text);
  return (
    <textarea
      autoFocus
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
        useBoardStore.getState().patchObject(obj.id, { text: e.target.value }, false);
      }}
      onBlur={onClose}
      className="absolute z-20 resize-none rounded-md border border-[#FE653F] bg-white p-2 text-stone-900 shadow-xl outline-none"
      style={{
        left: pos.x,
        top: pos.y,
        width: Math.max(160, obj.width * camera.scale),
        height: obj.type === "sticky" ? obj.height * camera.scale : 80,
        fontSize: (obj.type === "sticky" ? obj.fontSize : obj.fontSize) * camera.scale,
        background: obj.type === "sticky" ? obj.fill : "#fff",
      }}
    />
  );
}

function ExportDialog({
  open,
  onOpenChange,
  initialTarget = "board",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTarget?: "board" | "viewport" | "selection";
}) {
  const [target, setTarget] = useState<"board" | "viewport" | "selection">("board");
  const [scale, setScale] = useState<ExportScale>(3);
  const [busy, setBusy] = useState(false);
  const name = useBoardStore((s) => s.name);
  const hasSelection = useBoardStore((s) => s.selectedIds.length > 0);

  useEffect(() => {
    if (open) setTarget(initialTarget === "selection" && !hasSelection ? "board" : initialTarget);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialTarget]);

  async function run(kind: "png" | "pdf" | "json" | "clean-json" | "clean-svg") {
    const stage = getRegisteredStage();
    const state = useBoardStore.getState();
    const exportObjects =
      target === "selection"
        ? state.objects.filter((o) => state.selectedIds.includes(o.id) && !o.hidden)
        : state.objects;
    if (target === "selection" && !exportObjects.length) {
      toast.error("Ekkert valið til að flytja út");
      return;
    }
    setBusy(true);
    try {
      if (kind === "json") {
        await exportBoardJson(
          {
            version: 1,
            name: state.name,
            objects: state.objects,
            camera: state.camera,
            pixelsPerMeter: state.pixelsPerMeter,
            grid: state.grid,
            snap: state.snap,
            assetIds: [],
          },
          state.objects
        );
      } else if (kind === "clean-json" || kind === "clean-svg") {
        exportCleanPlan(
          {
            version: 2,
            name: state.name,
            objects: state.objects,
            camera: state.camera,
            pixelsPerMeter: state.pixelsPerMeter,
            grid: state.grid,
            snap: state.snap,
            assetIds: [],
          },
          state.objects,
          kind === "clean-svg" ? "svg" : "json"
        );
      } else if (!stage) {
        toast.error("Borðið er ekki tilbúið");
      } else if (kind === "png") {
        const blob = await exportPngBlob(stage, exportObjects, target, scale);
        downloadBlob(blob, `${slug(name)}.png`);
      } else {
        await exportPdf(stage, exportObjects, target, scale, name);
      }
      toast.success("Útflutningur tilbúinn");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Útflutningur mistókst");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Flytja út</DialogTitle>
          <DialogDescription>
            PNG og PDF eru rastar. JSON með innfelldum teikningum er þungt. Fyrir fyrirtækjasnið:
            vistaðu hreint plan án frumteikningar (vektorar, tuga KB).
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 text-sm">
          <label className="grid gap-1">
            <span className="text-muted-foreground">Svæði</span>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value as typeof target)}
              className="h-8 rounded-lg border bg-background px-2"
            >
              <option value="board">Allt borðið</option>
              <option value="viewport">Sýnilegt svæði</option>
              <option value="selection" disabled={!hasSelection}>
                Valið (hópur / valdir hlutir)
              </option>
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-muted-foreground">Upplausn</span>
            <select
              value={scale}
              onChange={(e) => setScale(Number(e.target.value) as ExportScale)}
              className="h-8 rounded-lg border bg-background px-2"
            >
              <option value={1}>1× skjár</option>
              <option value={2}>2× skörp</option>
              <option value={3}>3× prentgæði</option>
              <option value={4}>4× hámark</option>
            </select>
          </label>
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-col sm:justify-stretch">
          <Button
            variant="default"
            disabled={busy}
            className="w-full bg-[#FE653F] text-white hover:bg-[#E8553F]"
            onClick={() => void run("clean-json")}
          >
            Vista hreint plan (án frumteikningar)
          </Button>
          <Button variant="outline" disabled={busy} className="w-full" onClick={() => void run("clean-svg")}>
            Hreint plan sem SVG
          </Button>
          <div className="flex w-full flex-wrap justify-end gap-2">
            <Button variant="outline" disabled={busy} onClick={() => void run("json")}>
              JSON með teikningu
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => void run("pdf")}>
              PDF
            </Button>
            <Button disabled={busy} onClick={() => void run("png")}>
              PNG
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Flýtilyklar</DialogTitle>
          <DialogDescription>Sama hugsun og á Miro — borðið er óendanlegt, hold space til að færa.</DialogDescription>
        </DialogHeader>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
          {[
            ["V", "Velja"],
            ["H / space", "Færa borð (✋: hægri-drag færir, vinstri velur)"],
            ["R / O", "Ferningur / hringur"],
            ["L / A", "Lína / ör"],
            ["W", "Veggir (smelltu, Enter til að loka)"],
            ["P / T / N", "Penni / texti / minnismiði"],
            ["S", "Brunavarnatákn"],
            ["M / K", "Mæla / kvarða (stimpla inn raunlengd)"],
            ["E", "Strokleður — strjúka yfir til að eyða"],
            ["Esc", "Hætta í tóli (veggur í vinnslu helst)"],
            ["⌘Z / ⌘⇧Z", "Afturkalla / endurtaka"],
            ["⌘D", "Afrita val"],
            ["⌘G / ⌘⇧G", "Hópa / afhópa val"],
            ["Delete", "Eyða"],
            ["⌘0", "Passa á skjá"],
            ["Hjól", "Aðdráttur"],
            ["Velja + draga", "Færa innflutt skjal"],
          ].map(([k, v]) => (
            <li key={k} className="flex justify-between gap-3">
              <span className="font-mono text-xs text-muted-foreground">{k}</span>
              <span>{v}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          Flæðið er Teikning → Endurteikna veggi → Hreint grunnplan. Veggirnir eru vektorar sem hægt
          er að vista án frumteikningar (létt fyrir mörg fyrirtæki). Við innflutning merkir TurboPaint
          E-30/E-60 eldveggi og staðsetur slökkvitæki, brunaslöngur og skilti skv. leiðbeiningum
          Brunamálastofnunar{" "}
          <a className="underline" href="/docs/MVS-165_BR1.pdf" target="_blank" rel="noreferrer">
            165.BR1
          </a>
          : nærri útgöngum, mest 25&nbsp;m göngufjarlægð, varnarstaður (slanga + tæki), og skilti ef tæki
          sést ekki. Handfang í 70–80&nbsp;cm.
        </p>
        <DialogFooter>
          <Button onClick={() => {
            useBoardStore.getState().setTool("calibrate");
            onOpenChange(false);
            toast.message("Teiknaðu línu á þekkta lengd á gólfplaninu");
          }}>
            Stilltu kvarða
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

async function importKjarniJson(file: File) {
  const data = JSON.parse(await file.text()) as BoardDocument & {
    images?: Record<string, string>;
  };
  if (!Array.isArray(data.objects)) throw new Error("Ógild borðskrá");
  if (data.images) {
    for (const [id, url] of Object.entries(data.images)) {
      await putAsset(id, await dataUrlToBlob(url));
    }
  }
  useBoardStore.getState().replaceBoard({
    name: data.name || file.name,
    objects: (data.version ?? 1) < 2 ? migrateBoardObjects(data.objects) : data.objects,
    camera: data.camera,
    pixelsPerMeter: data.pixelsPerMeter,
    grid: data.grid ?? true,
    snap: data.snap ?? true,
  });
  toast.success("Borð opnað");
}
