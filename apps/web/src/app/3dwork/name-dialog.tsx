'use client';

/**
 * A small dialog that asks for a name — for "Vista sem…" on a part or a build.
 * Enter saves, Escape cancels.
 */

import { useState, type ReactNode } from 'react';

import { ACTION_GHOST, ACTION_PRIMARY, FIELD, LABEL, PANEL } from './ui';

interface NameDialogProps {
  open: boolean;
  title: string;
  /** What the name is for, in a line under the title. */
  hint?: string;
  defaultName: string;
  confirmLabel: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (name: string) => void | Promise<void>;
  /** Anything more to ask, under the name field. */
  children?: ReactNode;
}

export function NameDialog(props: NameDialogProps) {
  // Mounted afresh each time it opens, so it starts from the name offered then.
  return props.open ? <NameForm {...props} /> : null;
}

function NameForm({
  title,
  hint,
  defaultName,
  confirmLabel,
  busy,
  onCancel,
  onConfirm,
  children,
}: NameDialogProps) {
  const [name, setName] = useState(defaultName);
  const trimmed = name.trim();

  return (
    <div className="wb-theme fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-sm">
      <form
        className={`${PANEL} w-full max-w-sm space-y-3 p-4 shadow-2xl`}
        onSubmit={(event) => {
          event.preventDefault();
          if (trimmed && !busy) void onConfirm(trimmed);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel();
        }}
      >
        <div>
          <h2 className="text-sm font-bold text-[var(--wb-ink)]">{title}</h2>
          {hint ? <p className="text-[0.7rem] text-[var(--wb-ink-mute)]">{hint}</p> : null}
        </div>
        <label className="block space-y-1">
          <span className={LABEL}>Nafn</span>
          <input
            // Focused with the name selected, so typing replaces it.
            autoFocus
            onFocus={(event) => event.currentTarget.select()}
            className={FIELD}
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={busy}
            aria-label="Nafn"
          />
        </label>
        {children}
        <div className="flex justify-end gap-2">
          <button type="button" className={ACTION_GHOST} onClick={onCancel} disabled={busy}>
            Hætta við
          </button>
          <button type="submit" className={ACTION_PRIMARY} disabled={busy || !trimmed}>
            {busy ? 'Vista…' : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
