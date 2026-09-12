'use client';

/**
 * The builds worked on lately, newest first, as cards with pictures of their
 * parts — so the start page shows recent work to pick up again, not an empty
 * folder browser.
 *
 * What this computer has shows at once; Supabase fills in builds made
 * elsewhere a moment later. Pictures come from this computer's copies: a build
 * that has only ever been opened from Supabase shows its part names instead.
 */

import { useEffect, useState } from 'react';
import { Boxes, Clock } from 'lucide-react';
import {
  buildLabel,
  cleanPartName,
  mergeProjectLists,
  sinceLabel,
  type ProjectListEntry,
} from '@/lib/3dwork/project-sync';
import { listProjects } from '@/lib/3dwork/storage';
import { listCloudProjects } from '@/lib/3dwork/supabase-sync';
import { LABEL } from './ui';

/** Cards on the start page before the rest wait for the Projects list. */
const SHOWN = 8;

function BuildCard({ entry, onOpen }: { entry: ProjectListEntry; onOpen: () => void }) {
  const names = (entry.partNames ?? []).map(cleanPartName);
  const pictures = (entry.thumbnails ?? []).slice(0, 3);
  return (
    <button
      type="button"
      onClick={onOpen}
      title={names.join('\n')}
      className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-slate-300 bg-white text-left shadow-sm transition hover:border-emerald-500 hover:shadow-md"
    >
      <span className="flex h-28 items-stretch gap-px bg-slate-100">
        {pictures.length > 0 ? (
          pictures.map((picture, index) => (
            <span
              key={index}
              className="min-w-0 flex-1 bg-contain bg-center bg-no-repeat"
              style={{ backgroundImage: `url(${picture})` }}
            />
          ))
        ) : (
          <Boxes className="m-auto h-8 w-8 text-slate-300" />
        )}
      </span>
      <span className="flex flex-1 flex-col gap-1 p-3">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 text-sm font-bold leading-snug text-slate-900 [overflow-wrap:anywhere]">
            {buildLabel(entry.name, entry.partNames)}
          </span>
          <span className="shrink-0 font-mono text-[0.65rem] text-slate-400">
            {sinceLabel(entry.updatedAt)}
          </span>
        </span>
        <span className="line-clamp-3 text-[0.7rem] leading-snug text-slate-500 [overflow-wrap:anywhere]">
          {entry.parts} part{entry.parts === 1 ? '' : 's'}
          {names.length > 0 ? `: ${names.join(' · ')}` : ''}
        </span>
        {!entry.cloud && (
          <span className="text-[0.65rem] font-semibold text-amber-600">On this computer only</span>
        )}
      </span>
    </button>
  );
}

export function RecentBuilds({ onOpen }: { onOpen: (entry: ProjectListEntry) => void }) {
  const [entries, setEntries] = useState<ProjectListEntry[] | null>(null);
  const [cloudFailed, setCloudFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const saved = await listProjects();
      const local = saved
        .filter((project) => project.parts.length > 0)
        .map((project) => ({
          id: project.id,
          name: project.name,
          parts: project.parts.length,
          updatedAt: project.updatedAt ?? 0,
          partNames: project.parts.map((part) => part.name),
          thumbnails: project.parts
            .map((part) => part.thumbnail)
            .filter((thumbnail): thumbnail is string => Boolean(thumbnail)),
        }));
      if (cancelled) return;
      setEntries(mergeProjectLists(local, []));
      try {
        const cloud = await listCloudProjects();
        if (!cancelled) setEntries(mergeProjectLists(local, cloud.filter((entry) => entry.parts > 0)));
      } catch {
        if (!cancelled) setCloudFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (entries === null) {
    return <p className="px-1 py-6 text-sm text-slate-500">Looking for your builds…</p>;
  }

  return (
    <section>
      <div className="mb-2 flex items-center gap-2 px-1">
        <Clock className="h-4 w-4 text-emerald-600" />
        <h2 className={LABEL}>Recent work</h2>
        {cloudFailed && (
          <span className="text-[0.65rem] text-amber-700">
            Supabase did not answer — showing this computer only.
          </span>
        )}
      </div>
      {entries.length === 0 ? (
        <p className="px-1 py-4 text-sm text-slate-500">
          Nothing yet. Open the 3D bench and drop an STL or 3MF on it, or pick parts from Drive below.
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-3">
          {entries.slice(0, SHOWN).map((entry) => (
            <BuildCard key={entry.id} entry={entry} onOpen={() => onOpen(entry)} />
          ))}
        </div>
      )}
    </section>
  );
}
