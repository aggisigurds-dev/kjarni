'use client';

/**
 * First paint of 3dwork: pictures and file picks only.
 *
 * The 3D bench (Three.js / WebGL) is a separate chunk. A slow machine can sit
 * here, pick one part, and only then pay for the table.
 */

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { Boxes } from 'lucide-react';
import { classifyPart } from '@/lib/3dwork/project';
import { KitBoard } from './kit-board';
import { PANEL } from './ui';

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
  const [showDrive, setShowDrive] = useState(false);

  if (engine) {
    return (
      <Workbench
        initialWorkspace={engine}
        pendingImport={pending}
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
          <span className="text-[0.65rem] text-slate-500">2D first — 3D starts when you open a part</span>
        </div>
        <div className="flex overflow-hidden rounded border border-slate-300">
          <button
            type="button"
            className="bg-sky-600 px-3 py-1.5 text-[0.65rem] font-extrabold uppercase tracking-[0.03em] text-white"
          >
            2D kits
          </button>
          <button
            type="button"
            onClick={() => setEngine('bench')}
            className="px-3 py-1.5 text-[0.65rem] font-extrabold uppercase tracking-[0.03em] text-slate-500 hover:text-slate-900"
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

      <div className="min-h-0 flex-1">
        <KitBoard
          driveOpen={showDrive}
          onConnectDrive={() => setShowDrive(true)}
          onOpenIn3dwork={(files, tags) => {
            setPending({ files, tags });
            setEngine('bench');
          }}
        />
      </div>

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
