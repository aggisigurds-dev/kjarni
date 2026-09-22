'use client';

/**
 * The 3D-Builder selection bar: a thin vertical icon strip docked to the right
 * edge of the viewport (like Microsoft 3D Builder's Object tools). Pick parts,
 * then group / move / split them together. Icons only — hover for the name.
 */

import type { ElementType } from 'react';
import {
  Eye,
  Focus,
  Group,
  Move,
  Pin,
  Repeat2,
  Split,
  Star,
  SquareCheckBig,
  SquareDashed,
  Target,
  Ungroup,
  X,
} from 'lucide-react';

interface BuilderPanelProps {
  picked: number;
  total: number;
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
  onSplit: () => void;
  canSplit: boolean;
  onFavorite: () => void;
  canFavorite: boolean;
  onCoaxial: () => void;
  canCoaxial: boolean;
  onIsolate: () => void;
  canIsolate: boolean;
  isolated: boolean;
  onShowAll: () => void;
  canShowAll: boolean;
  onClose: () => void;
}

function Tool({
  icon: Icon,
  label,
  onClick,
  disabled,
  on,
  tone,
}: {
  icon: ElementType;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  on?: boolean;
  tone?: 'primary';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent ${
        on
          ? 'bg-sky-100 text-sky-700'
          : tone === 'primary'
            ? 'text-emerald-700 hover:bg-emerald-50'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      <Icon className="h-4 w-4" />
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
  onSplit,
  canSplit,
  onFavorite,
  canFavorite,
  onCoaxial,
  canCoaxial,
  onIsolate,
  canIsolate,
  isolated,
  onShowAll,
  canShowAll,
  onClose,
}: BuilderPanelProps) {
  const rule = <div className="my-0.5 h-px w-5 shrink-0 bg-slate-200" />;
  return (
    <div className="pointer-events-auto absolute right-2 top-2 z-10 flex max-h-[calc(100%-1rem)] w-10 flex-col items-center gap-0.5 overflow-y-auto rounded-xl border border-slate-300 bg-white/95 py-1.5 shadow-lg backdrop-blur-sm">
      <span
        title={`${picked} of ${total} picked`}
        className="shrink-0 pb-0.5 font-mono text-[0.55rem] font-bold text-sky-700"
      >
        {picked}/{total}
      </span>
      {rule}
      <Tool icon={SquareCheckBig} label="Select all" onClick={onSelectAll} disabled={total === 0} />
      <Tool icon={SquareDashed} label="Deselect all" onClick={onDeselectAll} disabled={picked === 0} />
      <Tool icon={Repeat2} label="Invert selection" onClick={onInvert} disabled={total === 0} />
      <Tool icon={Pin} label="Multi-select — every tap adds a part" on={sticky} onClick={onSticky} />
      {rule}
      <Tool icon={Group} label="Group" onClick={onGroup} disabled={!canGroup} tone="primary" />
      <Tool icon={Ungroup} label="Ungroup" onClick={onUngroup} disabled={!canUngroup} />
      <Tool icon={Target} label="Line up coaxial — concentric on one axis" onClick={onCoaxial} disabled={!canCoaxial} />
      <Tool icon={Move} label="Move" onClick={onMove} disabled={!canMove} />
      <Tool icon={Split} label="Split in half" onClick={onSplit} disabled={!canSplit} />
      {rule}
      <Tool icon={Focus} label="Isolate — show only the selected part" on={isolated} onClick={onIsolate} disabled={!canIsolate} />
      <Tool icon={Eye} label="Show all parts" onClick={onShowAll} disabled={!canShowAll} />
      <Tool icon={Star} label="Save to favorites" onClick={onFavorite} disabled={!canFavorite} />
      {rule}
      <Tool icon={X} label="Close 3D Builder" onClick={onClose} />
    </div>
  );
}
