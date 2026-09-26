'use client';

/**
 * On-canvas move / rotate / size strip. A compact panel over the viewport:
 * nudge a part, resize it to a measurement (free or keeping proportions), and
 * — for generated pipe/rod stock — toggle hollow (pipe) vs solid (rod) and set
 * the outer Ø and wall, without opening the inspector.
 */

import { useState } from 'react';
import {
  DEFAULT_MOVE_STEP,
  DEFAULT_ROTATE_STEP,
  MOVE_STEP_PRESETS,
  ROTATE_STEP_PRESETS,
} from '@/lib/3dwork/snap';

export type ManipMode = 'move' | 'rotate';
export type RotateAxis = 'free' | 'x' | 'y' | 'z';
export type MoveAxis = 'xyz' | 'x' | 'y' | 'z';

export interface ManipTube {
  /** true = pipe (hollow), false = rod / solid cylinder. */
  isPipe: boolean;
  outer: number;
  wall: number;
}

interface ManipBarProps {
  name: string;
  mode: ManipMode;
  onMode: (mode: ManipMode) => void;
  rotateAxis: RotateAxis;
  onRotateAxis: (axis: RotateAxis) => void;
  moveStep: number;
  rotateStep: number;
  onMoveStep: (step: number) => void;
  onRotateStep: (step: number) => void;
  onNudge: (axis: 'x' | 'y' | 'z', direction: 1 | -1) => void;
  /** Current size (mm) of the part, for the resize inputs. Null hides them. */
  size: { x: number; y: number; z: number } | null;
  /** Resize so one axis measures `mm`; keep = uniform (keep proportions). */
  onResize: (axis: 'x' | 'y' | 'z', mm: number, keep: boolean) => void;
  /** Generated pipe/rod stock (a hollow-able tube), or null. */
  tube: ManipTube | null;
  /** Toggle hollow pipe vs solid rod, or change the outer Ø / wall (mm). */
  onTube: (patch: { toPipe?: boolean; diameter?: number; wall?: number }) => void;
  onDone: () => void;
  snapHint: string | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Small numeric field that commits on blur / Enter, not on every keystroke. */
function MiniNum({
  value,
  onCommit,
  title,
}: {
  value: number;
  onCommit: (n: number) => void;
  title?: string;
}) {
  return (
    <input
      key={value}
      type="number"
      defaultValue={round1(value)}
      title={title}
      onKeyDown={(event) => {
        if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
      }}
      onBlur={(event) => {
        const n = parseFloat(event.target.value);
        if (Number.isFinite(n)) onCommit(n);
      }}
      className="h-7 w-14 rounded border border-slate-300 px-1 text-center font-mono text-[0.68rem] text-slate-700 focus:border-emerald-500 focus:outline-none"
    />
  );
}

export function ManipBar({
  name,
  mode,
  onMode,
  rotateAxis,
  onRotateAxis,
  moveStep,
  rotateStep,
  onMoveStep,
  onRotateStep,
  onNudge,
  size,
  onResize,
  tube,
  onTube,
  onDone,
  snapHint,
}: ManipBarProps) {
  const [keepProp, setKeepProp] = useState(true);
  const step = mode === 'move' ? moveStep : rotateStep;
  const unit = mode === 'move' ? 'mm' : '°';
  const stepOptions = mode === 'move' ? MOVE_STEP_PRESETS : ROTATE_STEP_PRESETS;
  const inner = tube ? Math.max(0, round1(tube.outer - 2 * tube.wall)) : 0;

  return (
    <div className="absolute bottom-2 left-1/2 z-10 max-h-[72%] w-[min(100%-0.75rem,24rem)] -translate-x-1/2 overflow-y-auto rounded-lg border border-slate-300 bg-white/95 p-1.5 text-slate-700 shadow-lg backdrop-blur-sm">
      {/* header: mode · name · done */}
      <div className="flex items-center gap-1.5">
        <div className="flex overflow-hidden rounded border border-slate-300">
          <button
            type="button"
            className={`h-7 px-2 text-[0.68rem] font-bold ${mode === 'move' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}
            onClick={() => onMode('move')}
          >
            Move
          </button>
          <button
            type="button"
            className={`h-7 px-2 text-[0.68rem] font-bold ${mode === 'rotate' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}
            onClick={() => onMode('rotate')}
          >
            Rotate
          </button>
        </div>
        <span className="min-w-0 flex-1 truncate text-[0.66rem] font-semibold text-slate-500">{name}</span>
        <button
          type="button"
          className="h-7 rounded border border-slate-300 px-2 text-[0.66rem] font-bold text-slate-600 hover:bg-slate-100"
          onClick={onDone}
        >
          Done
        </button>
      </div>

      {/* rotate axis (move needs no axis lock — the ± buttons already move one axis) + step */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {mode === 'rotate' && (
          <>
            {(['y', 'x', 'z', 'free'] as const).map((axis) => (
              <button
                key={axis}
                type="button"
                className={`h-7 min-w-7 rounded border px-1.5 font-mono text-[0.66rem] font-bold uppercase ${
                  rotateAxis === axis
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                    : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100'
                }`}
                onClick={() => onRotateAxis(axis)}
              >
                {axis}
              </button>
            ))}
            <span className="mx-0.5 h-4 w-px bg-slate-200" />
          </>
        )}
        {stepOptions.map((option) => (
          <button
            key={option}
            type="button"
            className={`h-7 rounded border px-1.5 font-mono text-[0.64rem] ${
              step === option
                ? 'border-emerald-500 bg-emerald-600 text-white'
                : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100'
            }`}
            onClick={() => (mode === 'move' ? onMoveStep(option) : onRotateStep(option))}
          >
            {option}
            {unit}
          </button>
        ))}
      </div>

      {/* nudge */}
      <div className="mt-1.5 flex items-center justify-center gap-1.5">
        {(['x', 'y', 'z'] as const).map((axis) => (
          <div key={axis} className="flex items-center gap-0.5">
            <button
              type="button"
              className="h-7 w-7 rounded border border-slate-300 font-mono text-base leading-none text-slate-700 hover:bg-slate-100"
              onClick={() => onNudge(axis, -1)}
              aria-label={`${axis.toUpperCase()} minus ${step} ${unit}`}
            >
              −
            </button>
            <span className="w-3 text-center text-[0.66rem] font-bold text-slate-500">{axis.toUpperCase()}</span>
            <button
              type="button"
              className="h-7 w-7 rounded border border-slate-300 font-mono text-base leading-none text-slate-700 hover:bg-slate-100"
              onClick={() => onNudge(axis, 1)}
              aria-label={`${axis.toUpperCase()} plus ${step} ${unit}`}
            >
              +
            </button>
          </div>
        ))}
      </div>

      {/* resize to a measurement, with a keep-proportions toggle */}
      {size && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 border-t border-slate-200 pt-1.5">
          <span className="text-[0.6rem] font-extrabold uppercase tracking-wide text-slate-400">Size</span>
          {(['x', 'y', 'z'] as const).map((axis) => (
            <label key={axis} className="flex items-center gap-0.5">
              <span className="text-[0.64rem] font-bold text-slate-500">{axis.toUpperCase()}</span>
              <MiniNum value={size[axis]} onCommit={(n) => onResize(axis, n, keepProp)} title={`${axis.toUpperCase()} size (mm)`} />
            </label>
          ))}
          <label
            className="flex items-center gap-1 text-[0.62rem] text-slate-500"
            title="On: resize all axes together (keep proportions). Off: free — the typed axis only."
          >
            <input
              type="checkbox"
              checked={keepProp}
              onChange={(event) => setKeepProp(event.target.checked)}
              className="h-3.5 w-3.5 accent-emerald-600"
            />
            keep proportions
          </label>
        </div>
      )}

      {/* pipe (hollow) vs rod (solid) + outer Ø / wall → inner Ø */}
      {tube && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 border-t border-slate-200 pt-1.5">
          <label className="flex items-center gap-1" title="On: hollow pipe. Off: solid rod / cylinder.">
            <input
              type="checkbox"
              checked={tube.isPipe}
              onChange={(event) => onTube({ toPipe: event.target.checked })}
              className="h-3.5 w-3.5 accent-emerald-600"
            />
            <span className="text-[0.6rem] font-extrabold uppercase tracking-wide text-slate-500">Pipe</span>
          </label>
          {tube.isPipe && (
            <>
              <label className="flex items-center gap-0.5" title="Outside diameter (mm)">
                <span className="text-[0.64rem] font-bold text-slate-500">⌀</span>
                <MiniNum value={tube.outer} onCommit={(n) => onTube({ diameter: Math.max(0.5, n) })} />
              </label>
              <label className="flex items-center gap-0.5" title="Wall thickness (mm)">
                <span className="text-[0.64rem] font-bold text-slate-500">wall</span>
                <MiniNum value={tube.wall} onCommit={(n) => onTube({ wall: Math.max(0.05, n) })} />
              </label>
              <span className="text-[0.62rem] text-slate-500">
                inner ⌀ <b className="font-mono text-slate-700">{inner}</b> mm
              </span>
            </>
          )}
        </div>
      )}

      <div className="mt-1 text-center text-[0.58rem] text-slate-400">
        drag · arrows · Esc
        {snapHint ? <span className="ml-1 font-semibold text-emerald-600">· snap {snapHint}</span> : null}
      </div>
    </div>
  );
}

export { DEFAULT_MOVE_STEP, DEFAULT_ROTATE_STEP };
