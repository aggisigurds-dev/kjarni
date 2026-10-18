'use client';

/**
 * First paint of 3dwork — the start page: one collection as a showcase first
 * (Söfn: the parts assembled as an AR-15, the parts by layer underneath — open
 * one, change it, save and close), then the Partasafn with room to sort it
 * (collections, layers you switch on and off, planning boards for pictures of
 * fittings, categories, printed / made / bought), and recent work small at the
 * bottom (17.10.2026: "not that important"). STL / 3MF dropped on the page go
 * straight into the library, no board needed.
 *
 * The 3D bench (Three.js / WebGL) is a separate chunk, so this page stays light
 * until the bench is asked for.
 */

import dynamic from 'next/dynamic';
import { useRef, useState } from 'react';
import { Boxes, ChevronDown, Cloud, Library, Plus, Upload } from 'lucide-react';
import { toast } from 'sonner';
import type { Favorite } from '@/lib/3dwork/favorites';
import { isPartFile, PART_FILE_ACCEPT } from '@/lib/3dwork/import-part';
import { buildBoard } from '@/lib/3dwork/parts-library';
import { classifyPart, type Project } from '@/lib/3dwork/project';
import { rememberOpenProject, saveGeometry, saveProject } from '@/lib/3dwork/storage';
import { CloudPicker } from './cloud-picker';
import { KitBoard } from './kit-board';
import './ragnarok/theme.css';
import { RecentBuilds } from './recent-builds';
import { ACTION_GHOST, LABEL, PANEL } from './ui';

const DriveBrowser = dynamic(
  () => import('./drive-browser').then((mod) => ({ default: mod.DriveBrowser })),
  { ssr: false }
);

// Draws its pictures with three.js, so it loads on the client only.
const PartsLibrary = dynamic(
  () => import('./parts-library').then((mod) => ({ default: mod.PartsLibrary })),
  { ssr: false, loading: () => <div className={`${PANEL} h-full p-4 text-sm text-slate-500`}>Opna Partasafnið…</div> }
);

// The assembled picture is drawn with three.js too.
const CollectionsView = dynamic(
  () => import('./collections-view').then((mod) => ({ default: mod.CollectionsView })),
  { ssr: false, loading: () => <div className={`${PANEL} p-4 text-sm text-slate-500`}>Opna Söfn…</div> }
);

const Workbench = dynamic(() => import('./workbench').then((mod) => ({ default: mod.Workbench })), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh items-center justify-center bg-slate-200 text-sm text-slate-600">
      Starting the 3D bench…
    </div>
  ),
});

export type PendingImport = {
  files: File[];
  tags: Record<string, { slotId: string; kitId: string }>;
};

type Engine = null | 'bench' | 'sketch';

const TOP_BUTTON =
  'inline-flex min-h-9 items-center gap-1 rounded border px-2.5 text-[0.7rem] font-extrabold uppercase tracking-[0.03em]';

export function KitsHome() {
  const [engine, setEngine] = useState<Engine>(null);
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [pendingCloudId, setPendingCloudId] = useState<string | null>(null);
  const [startFresh, setStartFresh] = useState(false);
  const [libraryEdit, setLibraryEdit] = useState<{ favoriteId: string; name: string; projectId: string } | null>(null);
  const [showDrive, setShowDrive] = useState(false);
  const [showCloud, setShowCloud] = useState(false);
  const [showKits, setShowKits] = useState(false);
  // Bumped on the way back from the bench, so the projects and the library are read again.
  const [visit, setVisit] = useState(0);
  const importInput = useRef<HTMLInputElement | null>(null);
  const libraryRef = useRef<HTMLDivElement | null>(null);

  const goHome = () => {
    setEngine(null);
    setPending(null);
    setPendingCloudId(null);
    setStartFresh(false);
    setLibraryEdit(null);
    setVisit((value) => value + 1);
  };

  /** A board made in the Partasafn: kept on this computer, then opened on the bench, which saves it to Supabase. */
  const openBoard = async (board: { project: Project; geometries: Map<string, Float32Array> }) => {
    for (const [id, soup] of board.geometries) await saveGeometry(id, soup);
    await saveProject(board.project, board.project.updatedAt);
    rememberOpenProject(board.project.id);
    toast.success(`Opna „${board.project.name}“ með ${board.project.parts.length} pörtum.`);
    setEngine('bench');
  };

  /** Gallery: one saved part on a scratch board, to change on the bench and save back to the library. */
  const editPart = async (favorite: Favorite, soup: Float32Array) => {
    const board = buildBoard(favorite.name, [
      {
        name: favorite.name,
        color: favorite.color,
        finishId: favorite.finishId,
        materialId: favorite.materialId,
        thumbnail: favorite.thumbnail,
        soup,
      },
    ]);
    for (const [id, part] of board.geometries) await saveGeometry(id, part);
    await saveProject(board.project, board.project.updatedAt);
    rememberOpenProject(board.project.id);
    setLibraryEdit({ favoriteId: favorite.id, name: favorite.name, projectId: board.project.id });
    setEngine('bench');
  };

  /** Part files into a new build on the bench. */
  const importToNewBuild = (files: File[]) => {
    const parts = files.filter((file) => isPartFile(file.name));
    if (parts.length === 0) {
      toast.error('Veldu STL- eða 3MF-skrár.');
      return;
    }
    const tags: PendingImport['tags'] = {};
    for (const file of parts) tags[file.name] = classifyPart(file.name);
    setPending({ files: parts, tags });
    setStartFresh(true);
    setEngine('bench');
  };

  if (engine) {
    return (
      <Workbench
        initialWorkspace={engine}
        pendingImport={pending}
        pendingCloudId={pendingCloudId}
        onPendingConsumed={() => setPending(null)}
        startFresh={startFresh}
        libraryEdit={libraryEdit}
        onExit={goHome}
      />
    );
  }

  return (
    <div className="wb-theme h-dvh overflow-y-auto bg-[var(--wb-ground)] text-[var(--wb-ink)]">
      <div className="flex min-h-full flex-col gap-2 p-2">
        <div className={`${PANEL} bench-chrome relative z-40 flex flex-wrap items-center gap-2 px-2 py-1.5`}>
          <div className="flex min-w-0 items-center gap-2">
            <span className="wb-mark" aria-hidden="true">
              <i />
              <i />
            </span>
            <Boxes className="h-5 w-5 shrink-0 text-[var(--wb-label)]" />
            <span className="text-sm font-bold tracking-[0.04em] text-[var(--wb-ink)]">3dwork</span>
            <span className="hidden text-[0.65rem] text-[var(--wb-ink-mute)] sm:inline">Verkefni og Partasafn</span>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              className={`${TOP_BUTTON} border-[var(--wb-accent)] bg-[var(--wb-accent)] text-[var(--wb-accent-ink)] hover:brightness-110`}
              onClick={() => {
                setStartFresh(true);
                setEngine('bench');
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              Nýtt verkefni
            </button>
            <button
              type="button"
              className={`${TOP_BUTTON} border-[var(--wb-tool-border)] bg-[var(--wb-tool-bg)] text-[var(--wb-tool-ink)] hover:bg-[var(--wb-tool-hover)]`}
              onClick={() => importInput.current?.click()}
              title="STL eða 3MF í nýtt verkefni á bekknum. Til að setja parta í Partasafnið: dragðu þá á það hér fyrir neðan."
            >
              <Upload className="h-3.5 w-3.5" />
              Flytja inn part
            </button>
            <input
              ref={importInput}
              type="file"
              accept={PART_FILE_ACCEPT}
              multiple
              className="hidden"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = '';
                importToNewBuild(files);
              }}
            />
            <div className="flex overflow-hidden rounded border border-[var(--wb-tool-border)]">
              <button
                type="button"
                onClick={() => setEngine('bench')}
                className="bg-[var(--wb-tool-bg)] px-3 py-1.5 text-[0.65rem] font-extrabold uppercase tracking-[0.03em] text-[var(--wb-tool-ink)] hover:bg-[var(--wb-tool-hover)]"
              >
                3D bench
              </button>
              <button
                type="button"
                onClick={() => setEngine('sketch')}
                className="border-l border-[var(--wb-tool-border)] px-3 py-1.5 text-[0.65rem] font-extrabold uppercase tracking-[0.03em] text-[var(--wb-ink-mute)] hover:text-[var(--wb-ink)]"
              >
                2D sketch
              </button>
            </div>
            <button type="button" className={`${ACTION_GHOST} inline-flex items-center gap-1`} onClick={() => setShowCloud(true)}>
              <Cloud className="h-3.5 w-3.5" />
              Öll verkefni
            </button>
            <button
              type="button"
              className={`${ACTION_GHOST} inline-flex items-center gap-1`}
              onClick={() => libraryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              <Library className="h-3.5 w-3.5" />
              Partasafn
            </button>
          </div>
        </div>

        <CollectionsView key={`sofn-${visit}`} onEditPart={editPart} />

        <div ref={libraryRef} className="scroll-mt-2 md:h-[calc(100dvh-1rem)] md:min-h-[560px]">
          <PartsLibrary
            key={`library-${visit}`}
            open
            layout="page"
            onClose={() => undefined}
            onOpenBoard={openBoard}
            onEditPart={editPart}
          />
        </div>

        <div className={PANEL}>
          <button
            type="button"
            onClick={() => setShowKits((value) => !value)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left"
            aria-expanded={showKits}
          >
            <span className={`${LABEL} flex-1`}>Parts from Drive, as pictures</span>
            <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${showKits ? 'rotate-180' : ''}`} />
          </button>
          {showKits && (
            <div className="h-[70dvh] border-t border-slate-200">
              <KitBoard
                driveOpen={showDrive}
                onConnectDrive={() => setShowDrive(true)}
                onOpenIn3dwork={(files, tags) => {
                  setPending({ files, tags });
                  setEngine('bench');
                }}
              />
            </div>
          )}
        </div>

        <div className={`${PANEL} p-2`}>
          <RecentBuilds
            key={`builds-${visit}`}
            compact
            onOpen={(entry) => {
              // A build this computer has opens from its own copy, and the bench
              // still checks Supabase for a newer one; one made elsewhere comes
              // straight from Supabase.
              if (entry.local) {
                rememberOpenProject(entry.id);
              } else {
                setPendingCloudId(entry.id);
              }
              setEngine('bench');
            }}
          />
        </div>
      </div>

      <CloudPicker
        open={showCloud}
        onClose={() => setShowCloud(false)}
        onOpen={(id) => {
          setPendingCloudId(id);
          setShowCloud(false);
          setEngine('bench');
        }}
      />

      {showDrive && (
        <DriveBrowser
          onClose={() => setShowDrive(false)}
          onImport={(files, folderHint) => {
            const tags: PendingImport['tags'] = {};
            for (const file of files) {
              tags[file.name] = classifyPart(file.name, folderHint);
            }
            setPending({ files, tags });
            setShowDrive(false);
            setEngine('bench');
          }}
        />
      )}
    </div>
  );
}
