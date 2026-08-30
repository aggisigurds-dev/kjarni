"use client";

import { toast } from "sonner";
import {
  Cloud,
  Crosshair,
  Download,
  Eraser,
  Flame,
  Link2,
  Grid3x3,
  HelpCircle,
  Layers,
  ListTree,
  Magnet,
  Redo2,
  RotateCcw,
  Undo2,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { boardBounds, cameraFit } from "../../lib/board/geometry";
import { IMPORT_FILE_ACCEPT, IMPORT_SIZE_HINT } from "../../lib/board/import-limits";
import {
  clearBoard,
  createBoard,
  deleteCurrentBoard,
  getCurrentBoardId,
  listBoards,
  listBoardsLocal,
  resetBoard,
  switchBoard,
  type BoardListEntry,
} from "../../lib/board/persistence";
import { useBoardStore } from "../../lib/board/store";
import { Button } from "../ui/button";
import { HeimilisfangLeit } from "./HeimilisfangLeit";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

/** Sjálfgefin borðanöfn — smellur í reitinn velur þá allan textann svo
 * innsláttur SKIPTIR nafninu út (annars lendir hann inni í miðju orði). */
const DEFAULT_BOARD_NAMES = new Set([
  "Nýtt borð",
  "Nýtt TurboPaint borð",
  "TurboPaint borð",
  "TurboPaint",
  "Ónefnt borð",
]);

export function TopBar({
  onImport,
  onExport,
  onHelp,
  onOpenSample,
  onMarkFirewalls,
  onStrip,
  onImportUrl,
  onVeljaTeikningu,
  onOpenLayers,
  viewSize,
}: {
  onImport: (files: File[]) => void;
  onExport: () => void;
  onHelp: () => void;
  onOpenSample?: () => void;
  onMarkFirewalls?: () => void;
  onStrip?: () => void;
  onImportUrl?: () => void;
  /** Teikning valin úr heimilisfangaleitinni — `.info` permalink. */
  onVeljaTeikningu?: (infoUrl: string) => void;
  /** Opna lög/eiginleika á síma — panellinn er falinn undir lg. */
  onOpenLayers?: () => void;
  viewSize: { width: number; height: number };
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const name = useBoardStore((s) => s.name);
  const setName = useBoardStore((s) => s.setName);
  const camera = useBoardStore((s) => s.camera);
  const grid = useBoardStore((s) => s.grid);
  const snap = useBoardStore((s) => s.snap);
  const quality = useBoardStore((s) => s.importQuality);
  const syncState = useBoardStore((s) => s.syncState);
  const [boards, setBoards] = useState<BoardListEntry[]>([]);

  // Eftir „Nýtt borð" á fókusinn að lenda Í nafnareitnum með textann valinn,
  // svo notandinn geti skírt borðið strax. base-ui skilar fókus á
  // valmyndar-takkann þegar valmyndin lokast — og tímasetning þess ræðst af
  // exit-animasjóninni, svo eitt skot dugar ekki: stiginn hér tekur fókusinn
  // aftur þar til hann helst. Select-að er BARA meðan nafnið er enn sjálfgefið,
  // svo endurtekningarnar geta aldrei étið það sem notandinn er byrjaður að skrifa.
  const focusNameSoon = () => {
    const delays = [0, 200, 400, 650, 900, 1150];
    for (const d of delays) {
      setTimeout(() => {
        const el = nameRef.current;
        if (!el || document.activeElement === el) return;
        el.focus();
        if (DEFAULT_BOARD_NAMES.has(el.value.trim())) el.select();
      }, d);
    }
  };

  const syncLook =
    syncState === "synced"
      ? { color: "text-emerald-400", label: "Vistað í ský — opnast á öllum tækjum" }
      : syncState === "saving"
        ? { color: "text-amber-300 animate-pulse", label: "Vistar í ský…" }
        : syncState === "error"
          ? { color: "text-red-400", label: "Ský-vistun mistókst — reynt aftur sjálfkrafa" }
          : { color: "text-stone-500", label: "Vistað á þessu tæki" };

  return (
    <header className="tp-topbar flex h-14 min-w-0 items-center gap-1 border-b border-white/8 bg-[#1a1d2e] px-2 text-stone-100 sm:gap-2 sm:px-3">
      <Link href="/kjarni" className="flex shrink-0 items-center gap-2.5 pr-1" title="Kjarni">
        <div className="flex size-8 items-center justify-center rounded-full bg-[#FE653F] text-white">
          <span className="text-sm font-bold leading-none">T</span>
        </div>
        <div className="hidden leading-tight 2xl:block">
          <div className="text-[11px] font-semibold tracking-[0.14em] text-[#FE653F]">TURBOPAINT</div>
          <div className="text-xs text-white/55">Kjarni · sjálfstæð síða</div>
        </div>
      </Link>
      <div className="hidden h-6 w-px bg-white/10 sm:block" />
      <DropdownMenu
        modal={false}
        onOpenChange={(open) => {
          if (!open) return;
          // Tækis-listinn birtist SAMSTUNDIS; ský-listinn sameinast þegar hann kemur
          // (var: „Sæki borð…" upp í 10–20 sek á hægu neti).
          void listBoardsLocal().then((local) => {
            setBoards((prev) => (prev.length && !local.length ? prev : local));
          });
          void listBoards().then(setBoards);
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
        {/* Hvítur flötur að ósk Agnars 29.08 — borðalistinn liggur ofan á
            teikningunni og var ólæsilegur. Rótarlagfæringin (body:has(.tp-root)
            í styles.css) gefur öllum portal-valmyndum dökka þemað aftur; þessi
            eina fær hvítt því hún er efnis-listi, ekki stjórntæki. */}
        <DropdownMenuContent
          align="start"
          className="max-h-[60vh] min-w-64 overflow-y-auto border border-stone-200 bg-white text-stone-900 shadow-xl [&_[data-slot=dropdown-menu-item]]:text-stone-900 [&_[data-slot=dropdown-menu-item]:hover]:bg-stone-100"
        >
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
          <DropdownMenuItem onClick={() => void createBoard().then(focusNameSoon)}>➕ Nýtt borð</DropdownMenuItem>
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
        ref={nameRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onFocus={(e) => {
          if (DEFAULT_BOARD_NAMES.has(e.target.value.trim())) e.target.select();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        enterKeyHint="done"
        className="min-w-[8rem] flex-1 basis-[8rem] truncate rounded-md bg-transparent px-1 text-base font-medium text-stone-100 outline-none placeholder:text-stone-500 focus:bg-white/8 sm:min-w-[12rem] sm:basis-[12rem] sm:text-sm"
        placeholder="Nafn á borði"
      />
      {onVeljaTeikningu && (
        <div className="min-w-0 shrink">
          <HeimilisfangLeit onVelja={onVeljaTeikningu} />
        </div>
      )}
      <span className={`hidden shrink-0 sm:inline ${syncLook.color}`} title={syncLook.label}>
        <Cloud className="size-4" />
      </span>
      <div className="hidden items-center gap-1 2xl:flex">
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
        className="hidden rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-stone-300 2xl:block"
        title="Innflutningsgæði. Stórar síður eru klemmdar í 40 MP (~160 MB) svo vafrinn fari ekki úr minni."
      >
        <option value="fast">Flýti · 3.2k</option>
        <option value="standard">Staðall · 7.2k</option>
        <option value="print">Há gæði · 12.5k</option>
      </select>
      <input
        id="tp-import-input"
        ref={fileRef}
        type="file"
        hidden
        multiple
        accept={IMPORT_FILE_ACCEPT}
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
        title={IMPORT_SIZE_HINT}
        onClick={() => fileRef.current?.click()}
      >
        <Upload className="size-4" />
        <span className="hidden sm:inline">Flytja inn</span>
        <span className="sm:hidden">PDF</span>
      </Button>
      <span className="hidden max-w-[10.5rem] text-[10px] leading-tight text-stone-500 2xl:inline">
        Í vafranum · engin 20 MB hömlun
      </span>
      {/* Á síma búa þessir þrír í ⟳ valmyndinni — annars kremja þeir nafnareitinn. */}
      <Button
        size="sm"
        variant="ghost"
        className="hidden text-stone-200 hover:bg-white/10 hover:text-white lg:inline-flex"
        onClick={() => onImportUrl?.()}
        title="Sækja af permalink (Reykjavík) eða PDF (Hafnarfjörður) — eða Ctrl+V á borðið"
      >
        <Link2 className="size-4" />
        <span className="hidden xl:inline">Af slóð</span>
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="hidden text-stone-200 hover:bg-white/10 hover:text-white sm:inline-flex"
        onClick={() => onMarkFirewalls?.()}
        title="Merkja E-30 / E-60 eldveggi og 165.BR1 búnað"
      >
        <Flame className="size-4 text-[#FE653F]" />
        <span className="hidden lg:inline">E-30 / E-60</span>
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="hidden text-stone-200 hover:bg-white/10 hover:text-white lg:inline-flex"
        onClick={() => {
          const n = useBoardStore.getState().refreshCrossings();
          if (n) toast.message(`Gegnumtök: ${n} krossar vegg`);
          else toast.message("Engin lagnir krossa vegg");
        }}
        title="Merkja þar sem lagnir krossa veggi — sterkari merki á EI-30 / EI-60"
      >
        <Crosshair className="size-4" />
        <span className="hidden xl:inline">Gegnumtök</span>
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="hidden text-stone-200 hover:bg-white/10 hover:text-white lg:inline-flex"
        onClick={() => onStrip?.()}
        title="Hreinsa teikningu — hvítur grunnur, bara veggir og blek"
      >
        <Eraser className="size-4" />
        <span className="hidden lg:inline">Hreinsa</span>
      </Button>
      <Button
        size="sm"
        className="hidden bg-[#FE653F] text-white hover:bg-[#E8553F] sm:inline-flex"
        title="Flytja út PNG / PDF / JSON"
        onClick={onExport}
      >
        <Download className="size-4" />
        <span className="hidden sm:inline">Flytja út</span>
      </Button>
      {/* modal={false}: annars leggst ósýnilegt bakdrop yfir allt appið meðan
          valmyndin er opin og fyrsti smellur á hvaða takka sem er "deyr". */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger
          render={<Button size="icon-sm" variant="ghost" className="text-stone-300 hover:bg-white/10 max-sm:size-9" title="Meira" />}
        >
          <RotateCcw className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          {/* Sjaldnotuðu stiku-hnapparnir (Undo/Redo, zoom, grind, segull) eru
              hidden md:flex í stikunni — á síma búa þeir hér í staðinn. */}
          <DropdownMenuItem className="2xl:hidden" onClick={() => useBoardStore.getState().undo()}>
            ↩ Afturkalla
          </DropdownMenuItem>
          <DropdownMenuItem className="2xl:hidden" onClick={() => useBoardStore.getState().redo()}>
            ↪ Endurtaka
          </DropdownMenuItem>
          <DropdownMenuItem
            className="2xl:hidden"
            onClick={() => {
              const cam = useBoardStore.getState().camera;
              useBoardStore.getState().setCamera({ ...cam, scale: Math.min(16, cam.scale * 1.3) });
            }}
          >
            Stækka ({Math.round(camera.scale * 100)}%)
          </DropdownMenuItem>
          <DropdownMenuItem
            className="2xl:hidden"
            onClick={() => {
              const cam = useBoardStore.getState().camera;
              useBoardStore.getState().setCamera({ ...cam, scale: Math.max(0.04, cam.scale / 1.3) });
            }}
          >
            Minnka
          </DropdownMenuItem>
          <DropdownMenuItem
            className="2xl:hidden"
            onClick={() => {
              const bounds = boardBounds(useBoardStore.getState().objects);
              useBoardStore.getState().setCamera(cameraFit(bounds, viewSize.width, viewSize.height));
            }}
          >
            Passa á skjá
          </DropdownMenuItem>
          <DropdownMenuItem className="2xl:hidden" onClick={() => useBoardStore.getState().toggleGrid()}>
            {grid ? "✓ " : ""}Grind
          </DropdownMenuItem>
          <DropdownMenuItem className="2xl:hidden" onClick={() => useBoardStore.getState().toggleSnap()}>
            {snap ? "✓ " : ""}Festa við grind
          </DropdownMenuItem>
          {/* Takkarnir sem eru faldir á síma / þröngu skjáborði. */}
          <DropdownMenuItem className="lg:hidden" onClick={() => onImportUrl?.()}>
            🔗 Sækja af slóð
          </DropdownMenuItem>
          <DropdownMenuItem className="lg:hidden" onClick={() => onStrip?.()}>
            🧹 Hreinsa teikningu
          </DropdownMenuItem>
          <DropdownMenuItem className="sm:hidden" onClick={onExport}>
            ⬇ Flytja út
          </DropdownMenuItem>
          {onOpenLayers ? (
            <DropdownMenuItem className="lg:hidden" onClick={onOpenLayers}>
              Lög og eiginleikar
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator className="2xl:hidden" />
          <DropdownMenuItem onClick={() => void resetBoard()}>Sækja dæmiborð</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onOpenSample?.()}>Opna gólfplön (PDF)</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onMarkFirewalls?.()}>
            Merkja eldveggi og 165.BR1 (SLT / slöngur / skilti)
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              const n = useBoardStore.getState().refreshCrossings();
              toast.message(n ? `Gegnumtök: ${n} krossar vegg` : "Engin lagnir krossa vegg");
            }}
          >
            Gegnumtök — krossar vegg
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void clearBoard()}>Tómt borð</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onHelp}>Flýtilyklar</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {onOpenLayers ? (
        <Button
          size="icon-sm"
          variant="ghost"
          className="text-stone-300 hover:bg-white/10 lg:hidden max-sm:size-9"
          title="Lög og eiginleikar"
          onClick={onOpenLayers}
        >
          <ListTree className="size-4" />
        </Button>
      ) : null}
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
