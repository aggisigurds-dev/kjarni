'use client';

/**
 * On-canvas add-volume strip: tap an inner corner on the part, then drag the
 * slider to grow the fillet. The corner is unioned into the part (watertight),
 * so it prints. Keep / Undo the last corner, Done exits.
 */

import { ACTION_GHOST, ACTION_PRIMARY } from './ui';

interface AddVolumeBarProps {
  name: string;
  sizeMm: number;
  onSize: (mm: number) => void;
  /** A corner is placed and being sized. */
  hasPending: boolean;
  placed: number;
  onCommit: () => void;
  onCancel: () => void;
  onDone: () => void;
  busy: boolean;
}

export function AddVolumeBar({
  name,
  sizeMm,
  onSize,
  hasPending,
  placed,
  onCommit,
  onCancel,
  onDone,
  busy,
}: AddVolumeBarProps) {
  return (
    <div className="pointer-events-auto absolute bottom-3 left-1/2 z-10 w-[min(100%-1.5rem,36rem)] -translate-x-1/2 rounded-xl border border-[var(--wb-accent)] bg-[var(--wb-panel)] p-2 shadow-lg">
      <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
        <span className="truncate text-[0.7rem] font-extrabold uppercase tracking-wide text-[var(--wb-label)]">
          Bæta efni · {name}
        </span>
        <span className="font-mono text-[0.65rem] text-[var(--wb-ink-mute)]">
          {placed} horn{busy ? ' · vinn…' : ''}
        </span>
      </div>
      <p className="px-1 pb-2 text-[0.62rem] leading-snug text-[var(--wb-ink-mute)]">
        Smelltu á innra horn (kverk) á hlutnum. Dragðu svo stikuna til að auka þykktina — efnið
        sameinast við stykkið svo það prentast.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="px-1 text-[0.62rem] font-bold uppercase text-[var(--wb-ink-mute)]">Þykkt</span>
        <input
          type="range"
          min={0.5}
          max={4}
          step={0.1}
          value={sizeMm}
          disabled={busy}
          onChange={(event) => onSize(Number(event.target.value))}
          className="h-2 min-w-40 flex-1 cursor-pointer accent-[var(--wb-accent)]"
          aria-label="Þykkt fillet (mm)"
        />
        <span className="w-14 text-right font-mono text-sm text-[var(--wb-ink)]">
          {sizeMm.toFixed(1)} mm
        </span>
        <button
          type="button"
          className={ACTION_PRIMARY}
          disabled={busy || !hasPending}
          onClick={onCommit}
        >
          Vista
        </button>
        <button
          type="button"
          className={ACTION_GHOST}
          disabled={busy || !hasPending}
          onClick={onCancel}
        >
          Hætta við
        </button>
        <button
          type="button"
          className="ml-auto min-h-10 rounded px-3 text-[0.7rem] font-bold text-[var(--wb-ink-mute)] hover:text-[var(--wb-ink)]"
          onClick={onDone}
        >
          Búið
        </button>
      </div>
    </div>
  );
}
