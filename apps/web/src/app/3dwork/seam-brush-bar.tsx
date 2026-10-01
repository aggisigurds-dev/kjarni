'use client';

/**
 * On-canvas seam brush strip: drag over a seam to level it. − shaves what
 * stands proud, highest first; + fills what lies low, deepest first. The work
 * happens on a copy of the part and becomes a new version on Vista.
 */

import { Hand, Undo2 } from 'lucide-react';

import type { SeamBrushMode } from '@/lib/3dwork/seam-brush';
import { ACTION_GHOST, ACTION_PRIMARY } from './ui';

const SEG = (on: boolean) =>
  `min-h-10 min-w-10 px-2.5 text-[0.7rem] font-bold ${
    on
      ? 'bg-[var(--wb-accent)] text-[var(--wb-accent-ink)]'
      : 'bg-[var(--wb-tool-bg)] text-[var(--wb-tool-ink)] hover:bg-[var(--wb-tool-hover)]'
  }`;

const GROUP = 'flex overflow-hidden rounded border border-[var(--wb-tool-border)]';
const CAP = 'px-1 text-[0.62rem] font-bold uppercase text-[var(--wb-ink-mute)]';

const RADII = [1, 2, 4, 8];

/** How far one pass lowers the ceiling or raises the floor, mm. */
const STRENGTHS: { mm: number; label: string }[] = [
  { mm: 0.02, label: 'Fínt' },
  { mm: 0.05, label: 'Mið' },
  { mm: 0.15, label: 'Gróft' },
];

interface SeamBrushBarProps {
  name: string;
  mode: SeamBrushMode;
  onMode: (mode: SeamBrushMode) => void;
  radiusMm: number;
  onRadius: (mm: number) => void;
  stepMm: number;
  onStep: (mm: number) => void;
  /** Drags turn the view instead of brushing. */
  turning: boolean;
  onTurning: (turning: boolean) => void;
  /** Strokes made so far that can be taken back. */
  strokes: number;
  onUndo: () => void;
  onSave: () => void;
  onCancel: () => void;
}

export function SeamBrushBar({
  name,
  mode,
  onMode,
  radiusMm,
  onRadius,
  stepMm,
  onStep,
  turning,
  onTurning,
  strokes,
  onUndo,
  onSave,
  onCancel,
}: SeamBrushBarProps) {
  return (
    <div className="pointer-events-auto absolute bottom-3 left-1/2 z-10 w-[min(100%-1.5rem,42rem)] -translate-x-1/2 rounded-xl border border-[var(--wb-accent)] bg-[var(--wb-panel)] p-2 shadow-lg">
      <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
        <span className="truncate text-[0.7rem] font-extrabold uppercase tracking-wide text-[var(--wb-label)]">
          Saumbursti · {name}
        </span>
        <span className="font-mono text-[0.65rem] text-[var(--wb-ink-mute)]">
          {strokes} {strokes === 1 ? 'stroka' : 'strokur'}
        </span>
      </div>
      <p className="px-1 pb-2 text-[0.62rem] leading-snug text-[var(--wb-ink-mute)]">
        Dragðu yfir sauminn. − Slípa tekur hæstu toppana fyrst, + Fylla lyftir dýpstu lægðunum
        fyrst. Strjúktu aftur þar til saumurinn er jafn fletinum í kring. Dragðu utan við hlutinn
        til að snúa honum.
      </p>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <div className={GROUP}>
          <button type="button" className={SEG(mode === 'shave')} onClick={() => onMode('shave')}>
            − Slípa
          </button>
          <button type="button" className={SEG(mode === 'fill')} onClick={() => onMode('fill')}>
            + Fylla
          </button>
        </div>

        <span className={CAP}>mm</span>
        <div className={GROUP}>
          {RADII.map((mm) => (
            <button
              key={mm}
              type="button"
              className={SEG(radiusMm === mm)}
              onClick={() => onRadius(mm)}
              aria-label={`Bursti ${mm} mm`}
            >
              {mm}
            </button>
          ))}
        </div>

        <span className={CAP}>Styrkur</span>
        <div className={GROUP}>
          {STRENGTHS.map((strength) => (
            <button
              key={strength.mm}
              type="button"
              className={SEG(stepMm === strength.mm)}
              onClick={() => onStep(strength.mm)}
              title={`${strength.mm} mm í hverri stroku`}
            >
              {strength.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          className={`${GROUP} ${SEG(turning)} inline-flex items-center gap-1`}
          onClick={() => onTurning(!turning)}
          title="Drag snýr sýninni í stað þess að bursta — fyrir snertiskjá"
          aria-pressed={turning}
        >
          <Hand className="h-3.5 w-3.5" />
          Snúa
        </button>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            className={`${ACTION_GHOST} inline-flex min-h-10 items-center gap-1 px-3`}
            disabled={strokes === 0}
            onClick={onUndo}
            title="Taka síðustu stroku til baka — ⌘Z"
          >
            <Undo2 className="h-3.5 w-3.5" />
            Afturkalla
          </button>
          <button
            type="button"
            className={`${ACTION_PRIMARY} min-h-10 px-3`}
            disabled={strokes === 0}
            onClick={onSave}
          >
            Vista
          </button>
          <button type="button" className={`${ACTION_GHOST} min-h-10 px-3`} onClick={onCancel}>
            {strokes === 0 ? 'Loka' : 'Hætta við'}
          </button>
        </div>
      </div>
    </div>
  );
}
