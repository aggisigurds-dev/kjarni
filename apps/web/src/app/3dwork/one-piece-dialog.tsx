'use client';

/**
 * One printable piece — the dialog for the job the bench is for.
 *
 * Tick the bodies to join and the pipes to bore through them, set the fit gap,
 * go. While the worker runs it says what it is doing, and when it is done it
 * says what happened to every body by name — so a part the kernel had to
 * rebuild from voxels is read about here, not discovered in the slicer.
 */

import { useEffect, useState } from 'react';
import { CircleCheck, Cylinder, Download, Loader2, TriangleAlert } from 'lucide-react';
import { formatCount, formatVolume } from '@/lib/3dwork/format';
import type { BodyOutcome, OnePieceReport } from '@/lib/3dwork/one-piece';
import { ACTION_GHOST, ACTION_PRIMARY, CHIP, FIELD, LABEL, PANEL } from './ui';

export interface OnePieceChoice {
  id: string;
  name: string;
  detail: string;
}

export interface OnePieceSettings {
  bodyIds: string[];
  pipeIds: string[];
  gapMm: number;
  crumbMm3: number;
  seamMm: number;
  hideSources: boolean;
}

const OUTCOME: Record<BodyOutcome, { label: string; className: string }> = {
  'as-is': { label: 'clean', className: 'bg-emerald-100 text-emerald-800' },
  capped: { label: 'holes capped', className: 'bg-sky-100 text-sky-800' },
  deduplicated: { label: 'faces tidied', className: 'bg-sky-100 text-sky-800' },
  rebuilt: { label: 'rebuilt', className: 'bg-amber-100 text-amber-800' },
  skipped: { label: 'left out', className: 'bg-rose-100 text-rose-800' },
};

const toggled = (list: string[], id: string) =>
  list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id];

function Checklist({
  items,
  checked,
  onToggle,
  empty,
}: {
  items: OnePieceChoice[];
  checked: string[];
  onToggle: (id: string) => void;
  empty: string;
}) {
  if (items.length === 0) return <p className="py-2 text-[0.7rem] text-slate-400">{empty}</p>;
  return (
    <ul className="max-h-40 divide-y divide-slate-100 overflow-y-auto rounded border border-slate-200">
      {items.map((item) => (
        <li key={item.id}>
          <label className="flex min-h-10 cursor-pointer items-center gap-2 px-2 py-1.5 hover:bg-slate-50">
            <input
              type="checkbox"
              className="h-4 w-4 shrink-0 accent-emerald-600"
              checked={checked.includes(item.id)}
              onChange={() => onToggle(item.id)}
            />
            <span
              className="min-w-0 flex-1 truncate text-[0.75rem] font-semibold text-slate-800"
              title={item.name}
            >
              {item.name}
            </span>
            <span className="shrink-0 font-mono text-[0.6rem] text-slate-500">{item.detail}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-slate-100 py-0.5">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-mono text-slate-900">{value}</dd>
    </div>
  );
}

function NumberInput({
  label,
  hint,
  value,
  step,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className={`${LABEL} mb-1 block`}>{label}</span>
      <input
        type="number"
        min={0}
        step={step}
        inputMode="decimal"
        className={FIELD}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
      />
      <span className="mt-0.5 block text-[0.6rem] leading-snug text-slate-400">{hint}</span>
    </label>
  );
}

export function OnePieceDialog({
  open,
  bodies,
  pipes,
  preselectedBodyIds,
  progress,
  report,
  error,
  massLabel,
  onRun,
  onDownload,
  onAddPipe,
  onClose,
}: {
  open: boolean;
  bodies: OnePieceChoice[];
  pipes: OnePieceChoice[];
  /** Ticked when the dialog opens: the selected bodies, or every body on the table. */
  preselectedBodyIds: string[];
  /** What the worker is doing right now; null when it is not running. */
  progress: string | null;
  report: OnePieceReport | null;
  error: string | null;
  /** Mass of the finished piece in its material, already formatted. */
  massLabel: string | null;
  onRun: (settings: OnePieceSettings) => void;
  onDownload: () => void;
  onAddPipe: (diameter: number) => void;
  onClose: () => void;
}) {
  const [bodyIds, setBodyIds] = useState<string[]>([]);
  const [pipeIds, setPipeIds] = useState<string[]>([]);
  const [gapMm, setGapMm] = useState(0.4);
  const [crumbMm3, setCrumbMm3] = useState(20);
  const [seamMm, setSeamMm] = useState(0.2);
  const [hideSources, setHideSources] = useState(true);

  // Each visit starts from the table as it is now: the chosen bodies, every pipe.
  useEffect(() => {
    if (!open) return;
    setBodyIds(preselectedBodyIds);
    setPipeIds(pipes.map((pipe) => pipe.id));
    // Only on opening — ticks changed while it is open must survive re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;
  const running = progress !== null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className={`${PANEL} flex max-h-[min(46rem,92dvh)] w-full max-w-lg flex-col bg-white p-4`}>
        <div className="mb-3 flex items-start gap-2">
          <Cylinder className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <div>
            <h2 className="text-sm font-bold text-slate-900">One printable piece</h2>
            <p className="text-[0.7rem] text-slate-500">
              Joins the bodies into one solid and bores every pipe through with a fit gap. An
              exact cut: edges stay sharp and nothing is resampled. The originals stay on the bench.
            </p>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {running ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
              <p className="text-sm font-semibold text-slate-700">{progress}</p>
            </div>
          ) : report ? (
            <div className="space-y-3">
              <div
                className={`flex items-center gap-2 rounded border px-3 py-2 ${
                  report.pieces === 1
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                    : 'border-amber-300 bg-amber-50 text-amber-900'
                }`}
              >
                {report.pieces === 1 ? (
                  <CircleCheck className="h-4 w-4 shrink-0" />
                ) : (
                  <TriangleAlert className="h-4 w-4 shrink-0" />
                )}
                <span className="text-[0.8rem] font-bold">
                  {report.pieces === 1
                    ? 'One solid, watertight piece — ready to print'
                    : `${report.pieces} separate pieces`}
                </span>
              </div>
              {report.pieces > 1 && (
                <p className="text-[0.7rem] text-amber-800">
                  Either a bore cut clean through a thin wall, or some bodies sit further apart
                  than the seam setting. Move the pipe or the bodies, or raise “Close seams up
                  to”, and run it again. If the extra pieces are only slivers, raise the
                  loose-bit size instead.
                </p>
              )}

              <dl className="grid grid-cols-1 gap-x-4 text-[0.72rem] sm:grid-cols-2">
                <Stat label="Volume" value={formatVolume(report.volume)} />
                {massLabel && <Stat label="Mass" value={massLabel} />}
                <Stat label="Triangles" value={formatCount(report.triangles)} />
                <Stat label="Pipes bored" value={String(report.pipes)} />
                <Stat
                  label="Seams closed"
                  value={
                    report.seamsBridged > 0
                      ? `${report.seamsBridged} · up to ${report.seamMm} mm`
                      : 'none needed'
                  }
                />
                <Stat
                  label="Loose bits dropped"
                  value={
                    report.crumbsRemoved > 0
                      ? `${report.crumbsRemoved} · ${formatVolume(report.crumbVolume)}`
                      : 'none'
                  }
                />
                <Stat label="Pockets filled" value={String(report.pocketsFilled)} />
                <Stat label="Took" value={`${(report.ms / 1000).toFixed(1)} s`} />
              </dl>

              <div>
                <span className={`${LABEL} mb-1 block`}>Each body</span>
                <ul className="divide-y divide-slate-100 rounded border border-slate-200">
                  {report.bodies.map((body, index) => (
                    <li key={`${body.name}-${index}`} className="px-2 py-1.5">
                      <div className="flex items-center gap-2">
                        <span
                          className="min-w-0 flex-1 truncate text-[0.72rem] font-semibold text-slate-800"
                          title={body.name}
                        >
                          {body.name}
                        </span>
                        <span className={`${CHIP} ${OUTCOME[body.outcome].className}`}>
                          {OUTCOME[body.outcome].label}
                        </span>
                      </div>
                      <div className="text-[0.65rem] text-slate-500">
                        {formatCount(body.triangles)} tri · {body.detail}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <section>
                <div className="mb-1 flex items-baseline justify-between">
                  <span className={LABEL}>Bodies to join</span>
                  <span className="font-mono text-[0.6rem] text-slate-400">
                    {bodyIds.length} of {bodies.length}
                  </span>
                </div>
                <Checklist
                  items={bodies}
                  checked={bodyIds}
                  onToggle={(id) => setBodyIds((list) => toggled(list, id))}
                  empty="Nothing visible on the table to join."
                />
              </section>

              <section>
                <div className="mb-1 flex items-baseline justify-between">
                  <span className={LABEL}>Pipes to bore through</span>
                  <span className="font-mono text-[0.6rem] text-slate-400">
                    {pipeIds.length} of {pipes.length}
                  </span>
                </div>
                <Checklist
                  items={pipes}
                  checked={pipeIds}
                  onToggle={(id) => setPipeIds((list) => toggled(list, id))}
                  empty="No pipes on the table yet — joining only."
                />
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-[0.65rem] text-slate-500">Add one through the middle:</span>
                  {[28, 20].map((diameter) => (
                    <button
                      key={diameter}
                      type="button"
                      className={ACTION_GHOST}
                      onClick={() => onAddPipe(diameter)}
                    >
                      + ⌀{diameter} pipe
                    </button>
                  ))}
                </div>
              </section>

              <div className="grid grid-cols-2 gap-2">
                <NumberInput
                  label="Fit gap, mm"
                  hint="Added to each pipe ⌀. 0.4 slides on most printers."
                  value={gapMm}
                  step={0.05}
                  onChange={setGapMm}
                />
                <NumberInput
                  label="Drop bits under, mm³"
                  hint="Slivers a cut leaves floating on their own."
                  value={crumbMm3}
                  step={1}
                  onChange={setCrumbMm3}
                />
                <NumberInput
                  label="Close seams up to, mm"
                  hint="Halves cut apart rarely touch. Gaps this narrow are filled; the outside stays exactly as modelled."
                  value={seamMm}
                  step={0.05}
                  onChange={setSeamMm}
                />
              </div>

              <label className="flex min-h-10 items-center gap-2 text-[0.72rem] text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-emerald-600"
                  checked={hideSources}
                  onChange={(event) => setHideSources(event.target.checked)}
                />
                Hide the original bodies afterwards
              </label>

              {error && (
                <p className="rounded border border-rose-300 bg-rose-50 px-2 py-1.5 text-[0.72rem] text-rose-800">
                  {error}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap justify-end gap-2">
          {report && !running ? (
            <>
              <button type="button" className={ACTION_GHOST} onClick={onClose}>
                Done
              </button>
              <button
                type="button"
                className={`${ACTION_PRIMARY} inline-flex items-center gap-1`}
                onClick={onDownload}
              >
                <Download className="h-3.5 w-3.5" />
                Download STL
              </button>
            </>
          ) : (
            <>
              <button type="button" className={ACTION_GHOST} onClick={onClose} disabled={running}>
                Cancel
              </button>
              <button
                type="button"
                className={ACTION_PRIMARY}
                disabled={running || bodyIds.length === 0}
                onClick={() =>
                  onRun({
                    bodyIds,
                    pipeIds,
                    gapMm: Math.max(0, gapMm),
                    crumbMm3: Math.max(0, crumbMm3),
                    seamMm: Math.max(0, seamMm),
                    hideSources,
                  })
                }
              >
                Make one piece
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
