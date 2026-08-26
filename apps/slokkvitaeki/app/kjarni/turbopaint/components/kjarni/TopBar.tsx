"use client";

import {
  Cloud,
  Download,
  Eraser,
  Flame,
  Link2,
  Grid3x3,
  HelpCircle,
  Layers,
  Magnet,
  Redo2,
  RotateCcw,
  Shield,
  Undo2,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { boardBounds, cameraFit } from "../../lib/board/geometry";
import {
  clearBoard,
  createBoard,
  deleteCurrentBoard,
  getCurrentBoardId,
  listBoards,
  resetBoard,
  switchBoard,
  type BoardListEntry,
} from "../../lib/board/persistence";
import { useBoardStore } from "../../lib/board/store";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

export function TopBar({
  onImport,
  onExport,
  onHelp,
  onOpenSample,
  onMarkFirewalls,
  onStrip,
  onImportUrl,
  viewSize,
}: {
  onImport: (files: File[]) => void;
  onExport: () => void;
  onHelp: () => void;
  onOpenSample?: () => void;
  onMarkFirewalls?: () => void;
  onStrip?: () => void;
  onImportUrl?: () => void;
  viewSize: { width: number; height: number };
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const name = useBoardStore((s) => s.name);
  const setName = useBoardStore((s) => s.setName);
  const camera = useBoardStore((s) => s.camera);
  const grid = useBoardStore((s) => s.grid);
  const snap = useBoardStore((s) => s.snap);
  const quality = useBoardStore((s) => s.importQuality);
  const syncState = useBoardStore((s) => s.syncState);
  const [boards, setBoards] = useState<BoardListEntry[]>([]);

  const syncLook =
    syncState === "synced"
      ? { color: "text-emerald-400", label: "Vistað í ský — opnast á öllum tækjum" }
      : syncState === "saving"
        ? { color: "text-amber-300 animate-pulse", label: "Vistar í ský…" }
        : syncState === "error"
          ? { color: "text-red-400", label: "Ský-vistun mistókst — reynt aftur sjálfkrafa" }
          : { color: "text-stone-500", label: "Vistað á þessu tæki" };

  return (
    <header className="flex h-14 items-center gap-1 border-b border-white/8 bg-[#1a1d2e] px-2 text-stone-100 sm:gap-3 sm:px-3">
      <Link href="/kjarni" className="flex shrink-0 items-center gap-2.5 pr-1 sm:pr-2">
        <div className="flex size-8 items-center justify-center rounded-full bg-[#FE653F] text-white">
          <span className="text-sm font-bold leading-none">T</span>
        </div>
        <div className="hidden leading-tight sm:block">
          <div className="text-[11px] font-semibold tracking-[0.14em] text-[#FE653F]">TURBOPAINT</div>
          <div className="text-xs text-white/55">Kjarni · sjálfstæð síða</div>
        </div>
      </Link>
      <div className="hidden h-6 w-px bg-white/10 sm:block" />
      <DropdownMenu
        onOpenChange={(open) => {
          if (open) void listBoards().then(setBoards);
        }}
      >
        <DropdownMenuTrigger
          render={
            <Button
              size="icon-sm"
              variant="ghost"
              className="shrink-0 text-stone-300 hover:bg-white/10 max-sm:size-9"
              title="Borðin mín — hoppa á milli verkefna"
            />
          }
        >
          <Layers className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-[60vh] min-w-64 overflow-y-auto">
          {boards.length ? (
            boards.map((b) => (
              <DropdownMenuItem key={b.id} onClick={() => void switchBoard(b.id)}>
                <span className="min-w-0 flex-1 truncate">
                  {b.id === getCurrentBoardId() ? "● " : ""}
                  {b.name || "Ónefnt borð"}
                </span>
                <span className="pl-3 text-[10px] text-muted-foreground">
                  {b.updatedAt ? b.updatedAt.slice(0, 10).split("-").reverse().join(".") : ""}
                  {b.remote ? " ☁" : ""}
                </span>
              </DropdownMenuItem>
            ))
          ) : (
            <DropdownMenuItem disabled>Sæki borð…</DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => void createBoard()}>➕ Nýtt borð</DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              if (window.confirm("Eyða þessu borði? (Það hverfur af öllum tækjum)")) {
                void deleteCurrentBoard();
              }
            }}
          >
            🗑 Eyða þessu borði
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="min-w-0 flex-1 bg-transparent text-base font-medium text-stone-100 outline-none placeholder:text-stone-500 sm:max-w-sm sm:text-sm"
        placeholder="Nafn á borði"
      />
      <span className={`shrink-0 ${syncLook.color}`} title={syncLook.label}>
        <Cloud className="size-4" />
      </span>
      <div className="hidden items-center gap-1 md:flex">
        <IconBtn title="Afturkalla (⌘Z)" onClick={() => useBoardStore.getState().undo()}>
          <Undo2 className="size-4" />
        </IconBtn>
        <IconBtn title="Endurtaka (⌘⇧Z)" onClick={() => useBoardStore.getState().redo()}>
          <Redo2 className="size-4" />
        </IconBtn>
        <IconBtn title="Grind" active={grid} onClick={() => useBoardStore.getState().toggleGrid()}>
          <Grid3x3 className="size-4" />
        </IconBtn>
        <IconBtn title="Festa við grind" active={snap} onClick={() => useBoardStore.getState().toggleSnap()}>
          <Magnet className="size-4" />
        </IconBtn>
        <IconBtn
          title="Minnka"
          onClick={() => {
            const cam = useBoardStore.getState().camera;
            useBoardStore.getState().setCamera({ ...cam, scale: Math.max(0.04, cam.scale / 1.15) });
          }}
        >
          <ZoomOut className="size-4" />
        </IconBtn>
        <button
          type="button"
          className="min-w-12 rounded-md px-1 text-center text-xs text-stone-300 hover:bg-white/8"
          onClick={() => {
            const bounds = boardBounds(useBoardStore.getState().objects);
            useBoardStore.getState().setCamera(cameraFit(bounds, viewSize.width, viewSize.height));
          }}
        >
          {Math.round(camera.scale * 100)}%
        </button>
        <IconBtn
          title="Stækka"
          onClick={() => {
            const cam = useBoardStore.getState().camera;
            useBoardStore.getState().setCamera({ ...cam, scale: Math.min(16, cam.scale * 1.15) });
          }}
        >
          <ZoomIn className="size-4" />
        </IconBtn>
      </div>
      <select
        value={quality}
        onChange={(e) =>
          useBoardStore.getState().setImportQuality(e.target.value as typeof quality)
        }
        className="hidden rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-stone-300 lg:block"
        title="Innflutningsgæði fyrir stór PDF/TIF"
      >
        <option value="fast">Flýti · 3.2k</option>
        <option value="standard">Staðall · 7.2k</option>
        <option value="print">Há gæði · 12.5k</option>
      </select>
      <input
        ref={fileRef}
        type="file"
        hidden
        multiple
        accept=".pdf,.tif,.tiff,.png,.jpg,.jpeg,.webp,.svg,.gif,.kjarni.json,application/pdf,image/*"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          if (files.length) onImport(files);
          e.target.value = "";
        }}
      />
      <Button
        size="sm"
        variant="ghost"
        className="text-stone-200 hover:bg-white/10 hover:text-white max-sm:size-9 max-sm:px-0"
        title="Flytja inn PDF, TIF eða mynd"
        onClick={() => fileRef.current?.click()}
      >
        <Upload className="size-4" />
        <span className="hidden sm:inline">Flytja inn</span>
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="text-stone-200 hover:bg-white/10 hover:text-white max-sm:size-9 max-sm:px-0"
        onClick={() => onImportUrl?.()}
        title="Sækja af permalink (skjalasafn.reykjavik.is) — eða bara Ctrl+V á borðið"
      >
        <Link2 className="size-4" />
        <span className="hidden lg:inline">Af slóð</span>
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="text-stone-200 hover:bg-white/10 hover:text-white max-sm:size-9 max-sm:px-0"
        onClick={() => onMarkFirewalls?.()}
        title="Merkja E-30 / E-60 eldveggi og 165.BR1 búnað"
      >
        <Flame className="size-4 text-[#FE653F]" />
        <span className="hidden sm:inline">E-30 / E-60</span>
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="hidden text-stone-200 hover:bg-white/10 hover:text-white md:inline-flex"
        onClick={() => onMarkFirewalls?.()}
        title="Staðsetja slökkvitæki, brunaslöngur og skilti skv. 165.BR1"
      >
        <Shield className="size-4 text-[#FE653F]" />
        <span className="hidden lg:inline">165.BR1</span>
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="text-stone-200 hover:bg-white/10 hover:text-white max-sm:size-9 max-sm:px-0"
        onClick={() => onStrip?.()}
        title="Hreinsa teikningu — hvítur grunnur, bara veggir og blek"
      >
        <Eraser className="size-4" />
        <span className="hidden lg:inline">Hreinsa</span>
      </Button>
      <Button
        size="sm"
        className="bg-[#FE653F] text-white hover:bg-[#E8553F] max-sm:size-9 max-sm:px-0"
        title="Flytja út PNG / PDF / JSON"
        onClick={onExport}
      >
        <Download className="size-4" />
        <span className="hidden sm:inline">Flytja út</span>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" className="text-stone-300 hover:bg-white/10 max-sm:size-9" />}>
          <RotateCcw className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          {/* Sjaldnotuðu stiku-hnapparnir (Undo/Redo, zoom, grind, segull) eru
              hidden md:flex í stikunni — á síma búa þeir hér í staðinn. */}
          <DropdownMenuItem className="md:hidden" onClick={() => useBoardStore.getState().undo()}>
            ↩ Afturkalla
          </DropdownMenuItem>
          <DropdownMenuItem className="md:hidden" onClick={() => useBoardStore.getState().redo()}>
            ↪ Endurtaka
          </DropdownMenuItem>
          <DropdownMenuItem
            className="md:hidden"
            onClick={() => {
              const cam = useBoardStore.getState().camera;
              useBoardStore.getState().setCamera({ ...cam, scale: Math.min(16, cam.scale * 1.3) });
            }}
          >
            Stækka ({Math.round(camera.scale * 100)}%)
          </DropdownMenuItem>
          <DropdownMenuItem
            className="md:hidden"
            onClick={() => {
              const cam = useBoardStore.getState().camera;
              useBoardStore.getState().setCamera({ ...cam, scale: Math.max(0.04, cam.scale / 1.3) });
            }}
          >
            Minnka
          </DropdownMenuItem>
          <DropdownMenuItem
            className="md:hidden"
            onClick={() => {
              const bounds = boardBounds(useBoardStore.getState().objects);
              useBoardStore.getState().setCamera(cameraFit(bounds, viewSize.width, viewSize.height));
            }}
          >
            Passa á skjá
          </DropdownMenuItem>
          <DropdownMenuItem className="md:hidden" onClick={() => useBoardStore.getState().toggleGrid()}>
            {grid ? "✓ " : ""}Grind
          </DropdownMenuItem>
          <DropdownMenuItem className="md:hidden" onClick={() => useBoardStore.getState().toggleSnap()}>
            {snap ? "✓ " : ""}Festa við grind
          </DropdownMenuItem>
          <DropdownMenuSeparator className="md:hidden" />
          <DropdownMenuItem onClick={() => void resetBoard()}>Sækja dæmiborð</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onOpenSample?.()}>Opna gólfplön (PDF)</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onMarkFirewalls?.()}>
            Merkja eldveggi og 165.BR1 (SLT / slöngur / skilti)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void clearBoard()}>Tómt borð</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onHelp}>Flýtilyklar</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        size="icon-sm"
        variant="ghost"
        className="hidden text-stone-300 hover:bg-white/10 sm:inline-flex"
        onClick={onHelp}
      >
        <HelpCircle className="size-4" />
      </Button>
    </header>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  active,
}: {
  children: ReactNode;
  onClick: () => void;
  title: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`flex size-8 items-center justify-center rounded-lg ${
        active ? "bg-white/15 text-white" : "text-stone-300 hover:bg-white/8 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}
