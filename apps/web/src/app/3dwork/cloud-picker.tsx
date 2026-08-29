'use client';

/**
 * List builds saved on the company Supabase project so a phone or another
 * computer can open the same bench. GitHub is not involved.
 */

import { useEffect, useState } from 'react';
import { Cloud, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { listCloudProjects } from '@/lib/3dwork/supabase-sync';
import type { CloudProjectIndexEntry } from '@/lib/3dwork/github-sync';
import { ACTION_GHOST, ACTION_PRIMARY, LABEL, PANEL } from './ui';

export function CloudPicker({
  open,
  onClose,
  onOpen,
  onSave,
  note,
  saving,
  canSave,
}: {
  open: boolean;
  onClose: () => void;
  onOpen: (id: string) => void | Promise<void>;
  onSave?: () => void | Promise<void>;
  note?: string;
  saving?: boolean;
  canSave?: boolean;
}) {
  const [rows, setRows] = useState<CloudProjectIndexEntry[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setBusy('Loading saved builds…');
    void listCloudProjects()
      .then((list) => {
        if (!cancelled) setRows(list);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Could not list saved builds.');
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className={`${PANEL} flex max-h-[min(36rem,90dvh)] w-full max-w-md flex-col p-4`}>
        <div className="mb-2 flex items-start gap-2">
          <Cloud className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <div>
            <h2 className="text-sm font-bold text-slate-900">Saved on Supabase</h2>
            <p className="text-[0.7rem] text-slate-500">
              Same company project as the rest of kjarni. Open a build here on your phone or
              another computer. GitHub is only the website code — not the parts.
            </p>
          </div>
        </div>
        {note ? <p className={`${LABEL} mb-2 normal-case tracking-normal`}>{note}</p> : null}
        <div className="min-h-0 flex-1 overflow-auto">
          {busy ? (
            <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              {busy}
            </div>
          ) : rows.length === 0 ? (
            <p className="py-6 text-sm text-slate-500">
              Nothing in the cloud yet. Import parts on this bench, then save them here.
            </p>
          ) : (
            <ul className="divide-y divide-slate-200">
              {rows.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    className="flex w-full items-baseline justify-between gap-3 px-1 py-2 text-left hover:bg-slate-50"
                    onClick={() => void onOpen(row.id)}
                    disabled={saving}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-900">
                        {row.name}
                      </span>
                      <span className="text-[0.65rem] text-slate-500">
                        {row.parts} part{row.parts === 1 ? '' : 's'}
                      </span>
                    </span>
                    <span className="shrink-0 text-[0.65rem] text-slate-400">
                      {row.updatedAt ? new Date(row.updatedAt).toLocaleString() : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <button type="button" className={ACTION_GHOST} onClick={onClose} disabled={saving}>
            Close
          </button>
          {onSave ? (
            <button
              type="button"
              className={ACTION_PRIMARY}
              onClick={() => void onSave()}
              disabled={saving || !canSave}
            >
              {saving ? 'Saving…' : 'Save this build'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
