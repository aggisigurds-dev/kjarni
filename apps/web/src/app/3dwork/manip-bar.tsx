'use client';

/**
 * On-canvas move / rotate strip. Lives over the viewport so a part can be
 * nudged 1 mm (or 1°) without hunting through the inspector.
 */

import {
  DEFAULT_MOVE_STEP,
  DEFAULT_ROTATE_STEP,
  MOVE_STEP_PRESETS,
  ROTATE_STEP_PRESETS,
} from '@/lib/3dwork/snap';

export type ManipMode = 'move' | 'rotate';
export type RotateAxis = 'free' | 'x' | 'y' | 'z';

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
  onDone: () => void;
  snapHint: string | null;
}

const SEG = (on: boolean) =>
  `min-h-11 min-w-11 px-3 text-[0.72rem] font-bold ${
    on ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'
  }`;

function StepPicker({
  value,
  options,
  suffix,
  onChange,
}: {
  value: number;
  options: readonly number[];
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex overflow-hidden rounded border border-slate-300">
      {options.map((step) => (
        <button
          key={step}
          type="button"
          className={`min-h-11 px-2 font-mono text-[0.68rem] ${
            value === step ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'
          }`}
          onClick={() => onChange(step)}
        >
          {step}
          {suffix}
        </button>
      ))}
    </div>
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
  onDone,
  snapHint,
}: ManipBarProps) {
  const step = mode === 'move' ? moveStep : rotateStep;
  const unit = mode === 'move' ? 'mm' : '°';

  return (
    <div className="absolute bottom-3 left-1/2 z-10 w-[min(100%-1rem,34rem)] -translate-x-1/2 rounded-lg border border-slate-300 bg-white/95 p-2 shadow-lg backdrop-blur-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded border border-slate-300">
          <button type="button" className={SEG(mode === 'move')} onClick={() => onMode('move')}>
            ✥ Move
          </button>
          <button type="button" className={SEG(mode === 'rotate')} onClick={() => onMode('rotate')}>
            ⟳ Rotate
          </button>
        </div>

        <span className="max-w-[140px] truncate text-[0.72rem] font-semibold text-slate-500">{name}</span>

        <button
          type="button"
          className="ml-auto min-h-11 rounded border border-slate-300 px-3 text-[0.72rem] font-bold text-slate-600 hover:bg-slate-100"
          onClick={onDone}
        >
          Done
        </button>
      </div>

      {mode === 'rotate' && (
        <div className="mb-2 flex flex-wrap items-center gap-1">
          <span className="text-[0.62rem] font-extrabold uppercase tracking-wide text-slate-400">Axis</span>
          {(['free', 'x', 'y', 'z'] as const).map((axis) => (
            <button
              key={axis}
              type="button"
              className={`min-h-11 min-w-11 rounded border border-slate-300 px-2 font-mono text-[0.72rem] font-bold uppercase ${
                rotateAxis === axis
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                  : 'bg-white text-slate-600 hover:bg-slate-100'
              }`}
              onClick={() => onRotateAxis(axis)}
            >
              {axis}
            </button>
          ))}
        </div>
      )}

      <div className="mb-2">
        <StepPicker
          value={mode === 'move' ? moveStep : rotateStep}
          options={mode === 'move' ? MOVE_STEP_PRESETS : ROTATE_STEP_PRESETS}
          suffix={mode === 'move' ? 'mm' : '°'}
          onChange={mode === 'move' ? onMoveStep : onRotateStep}
        />
      </div>

      <div className="flex items-center justify-center gap-3">
        {(['x', 'y', 'z'] as const).map((axis) => (
          <div key={axis} className="flex items-center gap-1">
            <button
              type="button"
              className="h-11 w-11 rounded border border-slate-300 font-mono text-lg text-slate-700 hover:bg-slate-100"
              onClick={() => onNudge(axis, -1)}
              aria-label={`${axis.toUpperCase()} minus ${step} ${unit}`}
            >
              −
            </button>
            <span className="w-4 text-center text-[0.75rem] font-bold text-slate-500">{axis.toUpperCase()}</span>
            <button
              type="button"
              className="h-11 w-11 rounded border border-slate-300 font-mono text-lg text-slate-700 hover:bg-slate-100"
              onClick={() => onNudge(axis, 1)}
              aria-label={`${axis.toUpperCase()} plus ${step} ${unit}`}
            >
              +
            </button>
          </div>
        ))}
      </div>

      <div className="mt-1.5 text-center text-[0.65rem] text-slate-400">
        ±{step} {unit}
        {mode === 'rotate' && rotateAxis !== 'free' ? ` · ${rotateAxis.toUpperCase()} only` : ''}
        {' · '}
        drag the part · arrows nudge · Esc to exit
        {snapHint ? <span className="ml-1 font-semibold text-emerald-600">· snap {snapHint}</span> : null}
      </div>
    </div>
  );
}

export { DEFAULT_MOVE_STEP, DEFAULT_ROTATE_STEP };
