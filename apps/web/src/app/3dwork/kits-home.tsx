'use client';

/**
 * First paint of 3dwork: recent work first, then parts from Drive as pictures.
 *
 * The 3D bench (Three.js / WebGL) is a separate chunk, so this page stays light:
 * it shows the builds worked on lately with pictures of their parts, and only a
 * click on one — or on 3D bench — pays for the table.
 */

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { Boxes, ChevronDown, Cloud } from 'lucide-react';
import { classifyPart } from '@/lib/3dwork/project';
import { rememberOpenProject } from '@/lib/3dwork/storage';
import { CloudPicker } from './cloud-picker';
import { KitBoard } from './kit-board';
import { RecentBuilds } from './recent-builds';
import { ACTION_GHOST, LABEL, PANEL } from './ui';

const DriveBrowser = dynamic(
  () => import('./drive-browser').then((mod) => ({ default: mod.DriveBrowser })),
  { ssr: false }
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

export function KitsHome() {
  const [engine, setEngine] = useState<Engine>(null);
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [pendingCloudId, setPendingCloudId] = useState<string | null>(null);
  const [showDrive, setShowDrive] = useState(false);
  const [showCloud, setShowCloud] = useState(false);
  const [showKits, setShowKits] = useState(false);

  if (engine) {
    return (
      <Workbench
        initialWorkspace={engine}
        pendingImport={pending}
        pendingCloudId={pendingCloudId}
        onPendingConsumed={() => setPending(null)}
      />
    );
  }

  return (
    <div className="flex h-dvh max-h-dvh flex-col gap-2 bg-slate-200 p-2 text-slate-800">
      <div className={`${PANEL} relative z-40 flex flex-wrap items-center gap-2 px-2 py-1.5`}>
        <div className="flex min-w-0 items-center gap-2">
          <Boxes className="h-5 w-5 shrink-0 text-emerald-600" />
          <span className="text-sm font-bold text-slate-900">3dwork</span>
          <span className="text-[0.65rem] text-slate-500">Pick up recent work, or start from parts</span>
        </div>
        <button
          type="button"
          className={`${ACTION_GHOST} inline-flex items-center gap-1`}
          onClick={() => setShowCloud(true)}
        >
          <Cloud className="h-3.5 w-3.5" />
          All saved builds
        </button>
        <div className="flex overflow-hidden rounded border border-slate-300">
          <button
            type="button"
            onClick={() => setEngine('bench')}
            className="bg-emerald-600 px-3 py-1.5 text-[0.65rem] font-extrabold uppercase tracking-[0.03em] text-white hover:bg-emerald-500"
          >
            3D bench
          </button>
          <button
            type="button"
            onClick={() => setEngine('sketch')}
            className="px-3 py-1.5 text-[0.65rem] font-extrabold uppercase tracking-[0.03em] text-slate-500 hover:text-slate-900"
          >
            2D sketch
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        <div className={`${PANEL} p-3`}>
          <RecentBuilds
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
