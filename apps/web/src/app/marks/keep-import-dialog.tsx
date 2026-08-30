'use client';

import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { formatKeepSummary, type KeepImportSummary } from '@/lib/marks/keep';
import { ACTION_GHOST, ACTION_PRIMARY, FIELD, LABEL, PANEL } from './ui';

export function KeepImportDialog({
  pasted,
  setPasted,
  busy,
  summary,
  error,
  onClose,
  onFiles,
  onPaste,
}: {
  pasted: string;
  setPasted: (value: string) => void;
  busy: boolean;
  summary: KeepImportSummary | null;
  error: string;
  onClose: () => void;
  onFiles: (files: File[]) => void;
  onPaste: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const take = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    onFiles(Array.from(list));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/40 p-0 sm:items-center sm:p-4">
      <div className={`${PANEL} max-h-[92dvh] w-full max-w-lg overflow-y-auto p-4`}>
        <h2 className="text-sm font-bold">Import Google Keep</h2>
        <p className="mt-1 text-sm text-stone-500">
          Google Takeout → deselect all → select Keep → export. Upload the zip here (or the Keep folder /
          individual .json files). Labels become folders; existing Marks stay put.
        </p>
        <button
          type="button"
          className={`${PANEL} mt-3 flex w-full flex-col items-center gap-2 border-dashed px-4 py-8 text-sm ${
            dragOver ? 'border-emerald-600 text-emerald-800' : 'text-stone-500 hover:border-emerald-600 hover:text-emerald-800'
          }`}
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            take(event.dataTransfer.files);
          }}
        >
          <Upload className="h-5 w-5" />
          {busy ? 'Importing…' : 'Drop a Takeout zip, or pick Keep files'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".zip,.json,.html,.htm,application/zip,application/json,text/html"
          multiple
          className="hidden"
          onChange={(event) => {
            take(event.target.files);
            event.target.value = '';
          }}
        />
        <input
          ref={folderRef}
          type="file"
          // @ts-expect-error webkitdirectory is the folder-picker attribute
          webkitdirectory=""
          className="hidden"
          onChange={(event) => {
            take(event.target.files);
            event.target.value = '';
          }}
        />
        <button
          type="button"
          className={`${ACTION_GHOST} mt-2`}
          disabled={busy}
          onClick={() => folderRef.current?.click()}
        >
          Choose Keep folder
        </button>
        <label className="mt-3 block">
          <span className={`${LABEL} mb-1 block`}>Paste Keep notes</span>
          <textarea
            className={`${FIELD} min-h-24`}
            value={pasted}
            onChange={(event) => setPasted(event.target.value)}
            placeholder={'Title on a line, URL on the next\n\nhttps://brunaholf.netlify.app'}
          />
        </label>
        {summary ? (
          <p className="mt-3 text-sm text-emerald-800">{formatKeepSummary(summary)}</p>
        ) : null}
        {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={ACTION_GHOST} onClick={onClose}>
            Close
          </button>
          <button type="button" className={ACTION_PRIMARY} disabled={busy} onClick={onPaste}>
            Add pasted notes
          </button>
        </div>
      </div>
    </div>
  );
}
