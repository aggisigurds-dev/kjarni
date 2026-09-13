'use client';

/**
 * The 3D Builder view's selection panel: pick several parts, then group them or
 * move them together. It carries the selection commands of Microsoft 3D
 * Builder's Object tab, floated over the table.
 */

import type { ElementType } from 'react';
import { Group, Move, Pin, Repeat2, SquareCheckBig, SquareDashed, Ungroup, X } from 'lucide-react';

interface BuilderPanelProps {
  /** Picked parts on the table. */
  picked: number;
  /** Parts the table shows. */
  total: number;
  /** Sticky selection: every tap adds a part instead of starting over. */
  sticky: boolean;
  onSticky: () => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onInvert: () => void;
  onGroup: () => void;
  canGroup: boolean;
  onUngroup: () => void;
  canUngroup: boolean;
  onMove: () => void;
  canMove: boolean;
  onClose: () => void;
}

const ROW =
  'flex min-h-9 shrink-0 items-center gap-2 rounded px-2 text-left text-[0.72rem] font-semibold transition-colors';

function Action({
  icon: Icon,
  label,
  shortcut,
  onClick,
  disabled,
}: {
  icon: ElementType;
  label: string;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${ROW} text-slate-700 hover:bg-sky-50 hover:text-sky-800 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1 whitespace-nowrap">{label}</span>
      {shortcut && (
        <span className="hidden font-mono text-[0.6rem] text-slate-400 md:inline">{shortcut}</span>
      )}
    </button>
  );
}

export function BuilderPanel({
  picked,
  total,
  sticky,
  onSticky,
  onSelectAll,
  onDeselectAll,
  onInvert,
  onGroup,
  canGroup,
  onUngroup,
  canUngroup,
  onMove,
  canMove,
  onClose,
}: BuilderPanelProps) {
  return (
    <div className="absolute inset-x-2 top-14 z-10 rounded-lg border border-slate-300 bg-white/95 p-1 shadow-lg backdrop-blur-sm md:inset-x-auto md:right-2 md:w-56">
      <div className="flex items-center gap-2 pl-2">
        <span className="text-[0.6rem] font-extrabold uppercase tracking-[0.06em] text-sky-700">
          3D Builder
        </span>
        <span className="ml-auto font-mono text-[0.62rem] text-slate-500">
          {picked} of {total} picked
        </span>
        <button
          type="button"
          onClick={onClose}
          title="Back to the plain view — B"
          aria-label="Close the 3D Builder view"
          className="flex h-8 w-8 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-800"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex gap-0.5 overflow-x-auto md:flex-col">
        <Action
          icon={SquareCheckBig}
          label="Select all"
          shortcut="⌘A"
          onClick={onSelectAll}
          disabled={total === 0}
        />
        <Action
          icon={SquareDashed}
          label="Deselect all"
          shortcut="Esc"
          onClick={onDeselectAll}
          disabled={picked === 0}
        />
        <Action icon={Repeat2} label="Invert selection" onClick={onInvert} disabled={total === 0} />
        <button
          type="button"
          role="switch"
          aria-checked={sticky}
          onClick={onSticky}
          title="When on, every tap adds a part or takes it away — no Ctrl needed"
          className={`${ROW} ${
            sticky ? 'bg-sky-50 text-sky-800' : 'text-slate-700 hover:bg-sky-50 hover:text-sky-800'
          }`}
        >
          <Pin className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1 whitespace-nowrap">Sticky selection</span>
          <span
            className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${
              sticky ? 'bg-sky-600' : 'bg-slate-300'
            }`}
          >
            <span
              className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${
                sticky ? 'left-3.5' : 'left-0.5'
              }`}
            />
          </span>
        </button>

        <div className="mx-2 my-0.5 hidden h-px bg-slate-200 md:block" />

        <Action icon={Group} label="Group" shortcut="⌘G" onClick={onGroup} disabled={!canGroup} />
        <Action
          icon={Ungroup}
          label="Ungroup"
          shortcut="⌘⇧G"
          onClick={onUngroup}
          disabled={!canUngroup}
        />
        <Action
          icon={Move}
          label={picked > 1 ? `Move ${picked} parts` : 'Move'}
          onClick={onMove}
          disabled={!canMove}
        />
      </div>

      <p className="hidden px-2 pb-1 pt-1 text-[0.62rem] leading-snug text-slate-500 md:block">
        Ctrl-click adds or removes a part. Drag any picked part and the rest come along.
      </p>
    </div>
  );
}
