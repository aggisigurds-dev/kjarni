"use client";

import {
  Download,
  Flame,
  Grid3x3,
  HelpCircle,
  Magnet,
  Redo2,
  RotateCcw,
  Shield,
  Undo2,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useRef, type ReactNode } from "react";
import Link from "next/link";
import { boardBounds, cameraFit } from "../../lib/board/geometry";
import { clearBoard, resetBoard } from "../../lib/board/persistence";
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
  viewSize,
}: {
  onImport: (files: File[]) => void;
  onExport: () => void;
  onHelp: () => void;
  onOpenSample?: () => void;
  onMarkFirewalls?: () => void;
  viewSize: { width: number; height: number };
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const name = useBoardStore((s) => s.name);
  const setName = useBoardStore((s) => s.setName);
  const camera = useBoardStore((s) => s.camera);
  const grid = useBoardStore((s) => s.grid);
  const snap = useBoardStore((s) => s.snap);
  const quality = useBoardStore((s) => s.importQuality);

  return (
    <header className="flex h-14 items-center gap-3 border-b border-white/8 bg-[#1a1d2e] px-3 text-stone-100">
      <div className="flex items-center gap-2.5 pr-2">
        <div className="flex size-8 items-center justify-center rounded-full bg-[#FE653F] text-white">
          <span className="text-sm font-bold leading-none">T</span>
        </div>
        <Link href="/kjarni" className="leading-tight">
          <div className="text-[11px] font-semibold tracking-[0.14em] text-[#FE653F]">TURBOPAINT</div>
          <div className="text-xs text-white/55">Kjarni · sjálfstæð síða</div>
        </Link>
      </div>
      <div className="h-6 w-px bg-white/10" />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="min-w-0 flex-1 bg-transparent text-sm font-medium text-stone-100 outline-none placeholder:text-stone-500 sm:max-w-sm"
        placeholder="Nafn á borði"
      />
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
        <option value="fast">Flýti · 2.8k</option>
        <option value="standard">Staðall · 5.2k</option>
        <option value="print">Há gæði · 8.6k</option>
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
        className="text-stone-200 hover:bg-white/10 hover:text-white"
        onClick={() => fileRef.current?.click()}
      >
        <Upload className="size-4" />
        <span className="hidden sm:inline">Flytja inn</span>
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="text-stone-200 hover:bg-white/10 hover:text-white"
        onClick={() => onMarkFirewalls?.()}
        title="Merkja E-30 / E-60 eldveggi og 165.BR1 búnað"
      >
        <Flame className="size-4 text-[#FE653F]" />
        <span className="hidden sm:inline">E-30 / E-60</span>
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="text-stone-200 hover:bg-white/10 hover:text-white"
        onClick={() => onMarkFirewalls?.()}
        title="Staðsetja slökkvitæki, brunaslöngur og skilti skv. 165.BR1"
      >
        <Shield className="size-4 text-[#FE653F]" />
        <span className="hidden lg:inline">165.BR1</span>
      </Button>
      <Button size="sm" className="bg-[#FE653F] text-white hover:bg-[#E8553F]" onClick={onExport}>
        <Download className="size-4" />
        <span className="hidden sm:inline">Flytja út</span>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" className="text-stone-300 hover:bg-white/10" />}>
          <RotateCcw className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
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
      <Button size="icon-sm" variant="ghost" className="text-stone-300 hover:bg-white/10" onClick={onHelp}>
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
