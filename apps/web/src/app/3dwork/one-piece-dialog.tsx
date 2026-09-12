'use client';

/**
 * One printable piece — the dialog for the job the bench is for.
 *
 * Three steps in the order they happen: the bodies to join, the pipes to bore
 * through them, go. A pipe can be added from here without leaving, and the
 * settings that rarely need touching stay folded away with defaults that fit
 * printed halves. While the worker runs it shows how far along it is and for
 * how long. When it is done it says what happened to every body by name — so a
 * part the kernel had to rebuild is read about here, not discovered in the
 * slicer — and a result that came out in pieces runs again with wider seams in
 * one tap.
 */

import { useEffect, useRef, useState } from 'react';
import { CircleCheck, Cylinder, Download, Loader2, RotateCcw, TriangleAlert } from 'lucide-react';
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
  /** Put the result in place of the last one: a retry, not a second copy. */
  replaceResult?: boolean;
}

/** Wide enough for printed halves — the Valken receiver's sit up to 0.26 mm apart. */
const DEFAULT_SEAM_MM = 0.3;
/** What "try again" widens the seams to. Still thinner than a print layer. */
const RETRY_SEAM_MM = 0.5;

/** The worker's progress messages, in the order its stages run. */
const STAGES = [
  /^Loading the solid kernel/,
  /^Checking/,
  /^Joining/,
  /^(Boring|Cutting)/,
  /^Closing seams/,
  /^Sweeping/,
  /^Writing/,
];

const OUTCOME: Record<BodyOutcome, { label: string; className: string }> = {
  'as-is': { label: 'clean', className: 'bg-emerald-100 text-emerald-800' },
  capped: { label: 'holes capped', className: 'bg-sky-100 text-sky-800' },
  deduplicated: { label: 'faces tidied', className: 'bg-sky-100 text-sky-800' },
  rebuilt: { label: 'rebuilt', className: 'bg-amber-100 text-amber-800' },
  skipped: { label: 'left out', className: 'bg-rose-100 text-rose-800' },
};

const toggled = (list: string[], id: string) =>
  list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id];

function elapsedLabel(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  return `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, '0')} s`;
}

function Step({ number, title, count }: { number: number; title: string; count?: string }) {
  return (
    <div className="mb-1 flex items-center gap-2">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[0.65rem] font-bold text-white">
        {number}
      </span>
      <span className={`${LABEL} min-w-0 flex-1`}>{title}</span>
      {count && <span className="font-mono text-[0.6rem] text-slate-400">{count}</span>}
    </div>
  );
}

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
  const [seamMm, setSeamMm] = useState(DEFAULT_SEAM_MM);
  const [hideSources, setHideSources] = useState(true);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const seenPipes = useRef<string[]>([]);
  const running = progress !== null;

  // Each visit starts from the table as it is now: the chosen bodies, every pipe.
  useEffect(() => {
    if (!open) return;
    setBodyIds(preselectedBodyIds);
    setPipeIds(pipes.map((pipe) => pipe.id));
    seenPipes.current = pipes.map((pipe) => pipe.id);
    // Only on opening — ticks changed while it is open must survive re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // A pipe added from here while the dialog is open is ticked straight away.
  useEffect(() => {
    if (!open) return;
    const added = pipes.map((pipe) => pipe.id).filter((id) => !seenPipes.current.includes(id));
    if (added.length === 0) return;
    seenPipes.current = [...seenPipes.current, ...added];
    setPipeIds((list) => [...list, ...added]);
  }, [open, pipes]);

  // A clock for the wait: a whole receiver takes minutes, and a still spinner looks stuck.
  useEffect(() => {
    if (!running) {
      setStartedAt(null);
      return;
    }
    const started = Date.now();
    setStartedAt(started);
    setNow(started);
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  if (!open) return null;

  const stage = progress ? STAGES.findIndex((pattern) => pattern.test(progress)) : -1;
  const done = Math.max(0.04, (stage + 1) / STAGES.length);
  const elapsed = startedAt ? Math.max(0, Math.round((now - startedAt) / 1000)) : 0;

  const run = (seam: number, replaceResult = false) => {
    const settings: OnePieceSettings = {
      bodyIds,
      pipeIds,
      gapMm: Math.max(0, gapMm),
      crumbMm3: Math.max(0, crumbMm3),
      seamMm: Math.max(0, seam),
      hideSources,
      replaceResult,
    };
    setSeamMm(settings.seamMm);
    onRun(settings);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className={`${PANEL} flex max-h-[min(46rem,92dvh)] w-full max-w-lg flex-col bg-white p-4`}>
        <div className="mb-3 flex items-start gap-2">
          <Cylinder className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <div>
            <h2 className="text-sm font-bold text-slate-900">Make it one printable piece</h2>
            <p className="text-[0.7rem] text-slate-500">
              Joins the bodies, bores every pipe through with a fit gap, and closes the seams
              between printed halves. An exact cut: nothing is resampled, and the originals stay on
              the bench.
            </p>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {running ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
              <p className="text-sm font-semibold text-slate-700">{progress}</p>
              <div className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-emerald-600 transition-[width] duration-500"
                  style={{ width: `${Math.round(done * 100)}%` }}
                />
              </div>
              <p className="text-[0.7rem] text-slate-500">
                {elapsedLabel(elapsed)} · a whole receiver takes a few minutes. This can stay open.
              </p>
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
                    : `It came out in ${report.pieces} separate pieces`}
                </span>
              </div>
              {report.pieces > 1 && (
                <div className="space-y-2 rounded border border-amber-200 bg-amber-50/60 px-3 py-2">
                  <p className="text-[0.72rem] text-amber-900">
                    Usually the halves sit a little further apart than the seams it closed (
                    {seamMm} mm), or a pipe cut clean through a thin wall.
                  </p>
                  {seamMm < RETRY_SEAM_MM && (
                    <button
                      type="button"
                      className={`${ACTION_PRIMARY} inline-flex items-center gap-1`}
                      onClick={() => run(RETRY_SEAM_MM, true)}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Try again with seams up to {RETRY_SEAM_MM} mm
                    </button>
                  )}
                </div>
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
                <Stat label="Took" value={elapsedLabel(Math.round(report.ms / 1000))} />
              </dl>

              <details className="rounded border border-slate-200">
                <summary className="cursor-pointer px-2 py-1.5 text-[0.7rem] font-semibold text-slate-600">
                  What happened to each body
                </summary>
                <ul className="divide-y divide-slate-100 border-t border-slate-200">
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
              </details>
            </div>
          ) : (
            <div className="space-y-4">
              <section>
                <Step number={1} title="Bodies to join" count={`${bodyIds.length} of ${bodies.length}`} />
                <Checklist
                  items={bodies}
                  checked={bodyIds}
                  onToggle={(id) => setBodyIds((list) => toggled(list, id))}
                  empty="Nothing visible on the table to join."
                />
              </section>

              <section>
                <Step number={2} title="Pipes to bore through" count={`${pipeIds.length} of ${pipes.length}`} />
                <Checklist
                  items={pipes}
                  checked={pipeIds}
                  onToggle={(id) => setPipeIds((list) => toggled(list, id))}
                  empty="No pipes yet. Add one below, or just join the bodies."
                />
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-[0.65rem] text-slate-500">Add one down the bore:</span>
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

              <section>
                <Step number={3} title="Make it" />
                <details className="rounded border border-slate-200">
                  <summary className="cursor-pointer px-2 py-1.5 text-[0.7rem] text-slate-600">
                    Settings · fit gap {gapMm} mm · seams up to {seamMm} mm
                  </summary>
                  <div className="space-y-2 border-t border-slate-200 p-2">
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
                        hint="Printed halves rarely touch. Gaps this narrow are filled; the outside stays as modelled."
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
                  </div>
                </details>
              </section>

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
                onClick={() => run(seamMm)}
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
