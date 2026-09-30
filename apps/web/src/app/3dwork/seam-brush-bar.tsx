'use client';

/**
 * On-canvas seam brush strip: drag over a seam to level it. − shaves what
 * stands proud, highest first; + fills what lies low, deepest first; Klóna
 * copies a clean patch of the part over the seam, the way Photoshop's clone
 * stamp does. The work happens on a copy of the part and becomes a new
 * version on Vista.
 */

import { Crosshair, Hand, Undo2 } from 'lucide-react';

import { ACTION_GHOST, ACTION_PRIMARY } from './ui';

/** What the brush does: shave ridges, fill grooves, or clone a patch over them. */
export type SeamTool = 'shave' | 'fill' | 'clone';

/** How hard the brush works, from gentle to coarse. */
export type SeamStrength = 0 | 1 | 2;

const SEG = (on: boolean) =>
  `min-h-10 min-w-10 px-2.5 text-[0.7rem] font-bold ${
    on
      ? 'bg-[var(--wb-accent)] text-[var(--wb-accent-ink)]'
      : 'bg-[var(--wb-tool-bg)] text-[var(--wb-tool-ink)] hover:bg-[var(--wb-tool-hover)]'
  }`;

const GROUP = 'flex overflow-hidden rounded border border-[var(--wb-tool-border)]';
const CAP = 'px-1 text-[0.62rem] font-bold uppercase text-[var(--wb-ink-mute)]';

const RADII = [1, 2, 4, 8];

const TOOLS: { tool: SeamTool; label: string }[] = [
  { tool: 'shave', label: '− Slípa' },
  { tool: 'fill', label: '+ Fylla' },
  { tool: 'clone', label: 'Klóna' },
];

const STRENGTHS: { strength: SeamStrength; label: string; hint: string }[] = [
  { strength: 0, label: 'Fínt', hint: 'Varlega: lítið í hverri stroku' },
  { strength: 1, label: 'Mið', hint: 'Miðlungs' },
  { strength: 2, label: 'Gróft', hint: 'Mikið í hverri stroku' },
];

const HELP: Record<SeamTool, string> = {
  shave:
    '− Slípa tekur hæstu toppana fyrst. Strjúktu aftur þar til saumurinn er jafn fletinum í kring.',
  fill: '+ Fylla lyftir dýpstu lægðunum fyrst. Strjúktu aftur þar til saumurinn er jafn fletinum í kring.',
  clone:
    'Veldu hreint svæði sem uppruna (Alt-smelltu, eða Uppruni og svo smella). Dragðu svo yfir sauminn — uppruninn fylgir strokunni í sömu fjarlægð.',
};

interface SeamBrushBarProps {
  name: string;
  tool: SeamTool;
  onTool: (tool: SeamTool) => void;
  radiusMm: number;
  onRadius: (mm: number) => void;
  strength: SeamStrength;
  onStrength: (strength: SeamStrength) => void;
  /** Clone: whether a source has been picked, and whether the next tap picks one. */
  hasSource: boolean;
  pickingSource: boolean;
  onPickSource: (picking: boolean) => void;
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
  tool,
  onTool,
  radiusMm,
  onRadius,
  strength,
  onStrength,
  hasSource,
  pickingSource,
  onPickSource,
  turning,
  onTurning,
  strokes,
  onUndo,
  onSave,
  onCancel,
}: SeamBrushBarProps) {
  return (
    <div className="pointer-events-auto absolute bottom-3 left-1/2 z-10 w-[min(100%-1.5rem,44rem)] -translate-x-1/2 rounded-xl border border-[var(--wb-accent)] bg-[var(--wb-panel)] p-2 shadow-lg">
      <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
        <span className="truncate text-[0.7rem] font-extrabold uppercase tracking-wide text-[var(--wb-label)]">
          Saumbursti · {name}
        </span>
        <span className="font-mono text-[0.65rem] text-[var(--wb-ink-mute)]">
          {strokes} {strokes === 1 ? 'stroka' : 'strokur'}
        </span>
      </div>
      <p className="px-1 pb-2 text-[0.62rem] leading-snug text-[var(--wb-ink-mute)]">
        Dragðu yfir sauminn. {HELP[tool]} Dragðu utan við hlutinn til að snúa honum.
      </p>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <div className={GROUP}>
          {TOOLS.map((entry) => (
            <button
              key={entry.tool}
              type="button"
              className={SEG(tool === entry.tool)}
              onClick={() => onTool(entry.tool)}
              aria-pressed={tool === entry.tool}
            >
              {entry.label}
            </button>
          ))}
        </div>

        {tool === 'clone' && (
          <button
            type="button"
            className={`${GROUP} ${SEG(pickingSource)} inline-flex items-center gap-1`}
            onClick={() => onPickSource(!pickingSource)}
            aria-pressed={pickingSource}
          >
            <Crosshair className="h-3.5 w-3.5" />
            {pickingSource ? 'Smelltu á upprunann' : hasSource ? 'Uppruni ✓' : 'Uppruni'}
          </button>
        )}

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
          {STRENGTHS.map((entry) => (
            <button
              key={entry.strength}
              type="button"
              className={SEG(strength === entry.strength)}
              onClick={() => onStrength(entry.strength)}
              aria-label={entry.label}
              title={entry.hint}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          className={`${GROUP} ${SEG(turning)} inline-flex items-center gap-1`}
          onClick={() => onTurning(!turning)}
          aria-label="Snúa"
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
            aria-label="Afturkalla"
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
