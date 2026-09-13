'use client';

/**
 * One build in the Projects list, told apart before it is opened: pictures of
 * its parts when this computer has them, its name, when it last changed, and
 * the names of everything in it — wrapped, not cut off.
 */

import { Boxes, Check } from 'lucide-react';
import {
  buildLabel,
  cleanPartName,
  sinceLabel,
  type ProjectListEntry,
} from '@/lib/3dwork/project-sync';
import { useCloseMenu } from './menu';

/** Part names spelled out under a build before the rest are counted. */
const NAMED_PARTS = 8;

export function ProjectListItem({
  entry,
  current,
  onOpen,
}: {
  entry: ProjectListEntry;
  current: boolean;
  onOpen: () => void;
}) {
  const closeMenu = useCloseMenu();
  const names = (entry.partNames ?? []).map(cleanPartName);
  const named = names.slice(0, NAMED_PARTS);
  const pictures = (entry.thumbnails ?? []).slice(0, 3);

  return (
    <button
      type="button"
      onClick={() => {
        closeMenu();
        onOpen();
      }}
      title={names.join('\n')}
      className="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-slate-100"
    >
      <span className="mt-1 flex h-3.5 w-3.5 shrink-0 items-center justify-center">
        {current && <Check className="h-3.5 w-3.5 text-emerald-600" />}
      </span>
      <span className="flex h-11 w-20 shrink-0 items-stretch gap-px overflow-hidden rounded border border-slate-200 bg-slate-50">
        {pictures.length > 0 ? (
          pictures.map((picture, index) => (
            <span
              key={index}
              className="min-w-0 flex-1 bg-contain bg-center bg-no-repeat"
              style={{ backgroundImage: `url(${picture})` }}
            />
          ))
        ) : (
          <Boxes className="m-auto h-4 w-4 text-slate-300" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 text-[0.78rem] font-semibold leading-snug text-slate-800 [overflow-wrap:anywhere]">
            {buildLabel(entry.name, entry.partNames)}
          </span>
          <span className="shrink-0 font-mono text-[0.6rem] text-slate-400">
            {sinceLabel(entry.updatedAt)}
          </span>
        </span>
        <span className="mt-0.5 block text-[0.66rem] leading-snug text-slate-500 [overflow-wrap:anywhere]">
          {entry.parts} part{entry.parts === 1 ? '' : 's'}
          {named.length > 0 ? `: ${named.join(' · ')}` : ''}
          {names.length > named.length ? ` · +${names.length - named.length} more` : ''}
        </span>
        {!entry.cloud && (
          <span className="mt-0.5 block text-[0.6rem] font-semibold text-amber-600">
            On this computer only
          </span>
        )}
      </span>
    </button>
  );
}
