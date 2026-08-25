'use client';

/**
 * On-canvas paint strip: brush over a broken edge or hole, then Align / Fill.
 */

const SEG = (on: boolean) =>
  `min-h-10 min-w-10 px-2.5 text-[0.7rem] font-bold ${
    on ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'
  }`;

const RADII = [1, 2, 4, 8];

interface PaintBarProps {
  name: string;
  painted: number;
  radiusMm: number;
  onRadius: (mm: number) => void;
  onAlign: () => void;
  onFill: () => void;
  onClear: () => void;
  onDone: () => void;
  busy: boolean;
}

export function PaintBar({
  name,
  painted,
  radiusMm,
  onRadius,
  onAlign,
  onFill,
  onClear,
  onDone,
  busy,
}: PaintBarProps) {
  return (
    <div className="pointer-events-auto absolute bottom-3 left-1/2 z-10 w-[min(100%-1.5rem,36rem)] -translate-x-1/2 rounded-xl border border-emerald-400 bg-white/95 p-2 shadow-lg">
      <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
        <span className="truncate text-[0.7rem] font-extrabold uppercase tracking-wide text-emerald-800">
          Paint · {name}
        </span>
        <span className="font-mono text-[0.65rem] text-slate-500">{painted} corners</span>
      </div>
      <p className="px-1 pb-2 text-[0.62rem] leading-snug text-slate-500">
        Drag over a broken edge or a hole. Shift-drag erases. Align evens the edge. Fill hole
        packs the painted opening up to the highest point the brush covered.
      </p>
      <div className="flex flex-wrap items-center gap-1">
        <span className="px-1 text-[0.62rem] font-bold uppercase text-slate-400">mm</span>
        <div className="flex overflow-hidden rounded border border-slate-300">
          {RADII.map((mm) => (
            <button
              key={mm}
              type="button"
              className={SEG(radiusMm === mm)}
              onClick={() => onRadius(mm)}
            >
              {mm}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="min-h-10 rounded bg-emerald-600 px-3 text-[0.7rem] font-extrabold uppercase text-white disabled:bg-slate-300"
          disabled={busy || painted < 3}
          onClick={onAlign}
        >
          Align
        </button>
        <button
          type="button"
          className="min-h-10 rounded border border-emerald-500 px-3 text-[0.7rem] font-extrabold uppercase text-emerald-800 disabled:border-slate-200 disabled:text-slate-300"
          disabled={busy || painted < 3}
          onClick={onFill}
        >
          Fill hole
        </button>
        <button
          type="button"
          className="min-h-10 rounded border border-slate-300 px-3 text-[0.7rem] font-bold text-slate-600"
          disabled={painted === 0}
          onClick={onClear}
        >
          Clear
        </button>
        <button
          type="button"
          className="ml-auto min-h-10 rounded px-3 text-[0.7rem] font-bold text-slate-500 hover:text-slate-800"
          onClick={onDone}
        >
          Done
        </button>
      </div>
    </div>
  );
}
