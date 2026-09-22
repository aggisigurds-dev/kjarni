'use client';

/**
 * On-canvas move / rotate / size strip. A compact panel over the viewport:
 * nudge a part, resize it to a measurement, and — for a generated pipe — set
 * its outer Ø and wall (which sets the inner Ø) without opening the inspector.
 */

import {
  DEFAULT_MOVE_STEP,
  DEFAULT_ROTATE_STEP,
  MOVE_STEP_PRESETS,
  ROTATE_STEP_PRESETS,
} from '@/lib/3dwork/snap';

export type ManipMode = 'move' | 'rotate';
export type RotateAxis = 'free' | 'x' | 'y' | 'z';
export type MoveAxis = 'xyz' | 'x' | 'y' | 'z';

export interface ManipPipe {
  outer: number;
  wall: number;
}

interface ManipBarProps {
  name: string;
  mode: ManipMode;
  onMode: (mode: ManipMode) => void;
  rotateAxis: RotateAxis;
  onRotateAxis: (axis: RotateAxis) => void;
  moveAxis: MoveAxis;
  onMoveAxis: (axis: MoveAxis) => void;
  moveStep: number;
  rotateStep: number;
  onMoveStep: (step: number) => void;
  onRotateStep: (step: number) => void;
  onNudge: (axis: 'x' | 'y' | 'z', direction: 1 | -1) => void;
  /** Current size (mm) of the part, for the resize inputs. Null hides them. */
  size: { x: number; y: number; z: number } | null;
  /** Resize the part so one axis measures `mm` (keeps its proportions). */
  onResize: (axis: 'x' | 'y' | 'z', mm: number) => void;
  /** Generated-pipe spec, or null when the part is not a pipe. */
  pipe: ManipPipe | null;
  /** Change the pipe's outer Ø and/or wall (mm). */
  onPipe: (patch: { diameter?: number; wall?: number }) => void;
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

const CHIP = (on: boolean) =>
  `h-7 min-w-7 rounded border px-1.5 font-mono text-[0.66rem] font-bold uppercase ${
    on
      ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
      : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100'
  }`;

export function ManipBar({
  name,
  mode,
  onMode,
  rotateAxis,
  onRotateAxis,
  moveAxis,
  onMoveAxis,
  moveStep,
  rotateStep,
  onMoveStep,
  onRotateStep,
  onNudge,
  size,
  onResize,
  pipe,
  onPipe,
  onDone,
  snapHint,
}: ManipBarProps) {
  const step = mode === 'move' ? moveStep : rotateStep;
  const unit = mode === 'move' ? 'mm' : '°';
  const stepOptions = mode === 'move' ? MOVE_STEP_PRESETS : ROTATE_STEP_PRESETS;
  const inner = pipe ? Math.max(0, round1(pipe.outer - 2 * pipe.wall)) : 0;

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

      {/* axis lock/rotate + step, one row */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {mode === 'rotate'
          ? (['y', 'x', 'z', 'free'] as const).map((axis) => (
              <button key={axis} type="button" className={CHIP(rotateAxis === axis)} onClick={() => onRotateAxis(axis)}>
                {axis}
              </button>
            ))
          : (['xyz', 'x', 'y', 'z'] as const).map((axis) => (
              <button key={axis} type="button" className={CHIP(moveAxis === axis)} onClick={() => onMoveAxis(axis)}>
                {axis === 'xyz' ? 'all' : axis}
              </button>
            ))}
        <span className="mx-0.5 h-4 w-px bg-slate-200" />
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

      {/* resize to a measurement */}
      {size && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 border-t border-slate-200 pt-1.5">
          <span className="text-[0.6rem] font-extrabold uppercase tracking-wide text-slate-400">Size</span>
          {(['x', 'y', 'z'] as const).map((axis) => (
            <label key={axis} className="flex items-center gap-0.5">
              <span className="text-[0.64rem] font-bold text-slate-500">{axis.toUpperCase()}</span>
              <MiniNum value={size[axis]} onCommit={(n) => onResize(axis, n)} title={`${axis.toUpperCase()} size (mm)`} />
            </label>
          ))}
          <span className="text-[0.6rem] text-slate-400">mm · keeps proportions</span>
        </div>
      )}

      {/* pipe: outer Ø + wall → inner Ø */}
      {pipe && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 border-t border-slate-200 pt-1.5">
          <span className="text-[0.6rem] font-extrabold uppercase tracking-wide text-slate-400">Pipe</span>
          <label className="flex items-center gap-0.5" title="Outside diameter (mm)">
            <span className="text-[0.64rem] font-bold text-slate-500">⌀</span>
            <MiniNum value={pipe.outer} onCommit={(n) => onPipe({ diameter: Math.max(0.5, n) })} />
          </label>
          <label className="flex items-center gap-0.5" title="Wall thickness (mm)">
            <span className="text-[0.64rem] font-bold text-slate-500">wall</span>
            <MiniNum value={pipe.wall} onCommit={(n) => onPipe({ wall: Math.max(0.05, n) })} />
          </label>
          <span className="text-[0.62rem] text-slate-500">
            inner ⌀ <b className="font-mono text-slate-700">{inner}</b> mm
          </span>
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
