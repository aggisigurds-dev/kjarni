'use client';

/**
 * Add a length of stock by its measurements: pick pipe / rod / bolt / screw,
 * type the numbers, then add — instead of dropping in a fixed size and
 * correcting it afterwards. A bolt or screw can take a real thread from the
 * standards list.
 */
import { useState } from 'react';

import {
  hardwareLabel,
  THREAD_STANDARDS,
  threadById,
  type HardwareKind,
  type HardwareSpec,
} from '@/lib/3dwork/hardware';
import { ACTION_GHOST, ACTION_PRIMARY, FIELD, LABEL, PANEL } from './ui';

const KINDS: HardwareKind[] = ['pipe', 'rod', 'bolt', 'screw'];
const KIND_LABEL: Record<HardwareKind, string> = { pipe: 'Pipe', rod: 'Rod', bolt: 'Bolt', screw: 'Screw' };

interface AddStockDialogProps {
  onAdd: (spec: HardwareSpec) => void;
  onClose: () => void;
}

/** What the dialog holds while the numbers are typed; `stockSpec` turns it into the part's spec. */
export interface StockDraft {
  kind: HardwareKind;
  length: number;
  diameter: number;
  wall: number;
  /** A thread standard's id, or '' for a plain shaft. */
  threadId: string;
}

export const DEFAULT_STOCK: StockDraft = { kind: 'pipe', length: 150, diameter: 25, wall: 2.5, threadId: '' };

const round1 = (n: number) => Math.round(n * 10) / 10;

/** The spec a draft stands for, or null while the numbers cannot make a part. */
export function stockSpec(draft: StockDraft): HardwareSpec | null {
  const { kind, length } = draft;
  const thread = kind === 'bolt' || kind === 'screw' ? threadById(draft.threadId) : undefined;
  const diameter = thread ? thread.majorDiameter : draft.diameter;
  if (!(length > 0) || !(diameter > 0)) return null;
  if (kind === 'pipe') {
    // A wall of half the diameter or more leaves no hole: that is a rod.
    if (!(draft.wall > 0) || draft.wall * 2 >= diameter) return null;
    return { kind, length, diameter, wall: draft.wall };
  }
  if (kind === 'rod') return { kind, length, diameter };
  // A hex head for a bolt, a wider, flatter one for a screw.
  const head =
    kind === 'bolt'
      ? { headDiameter: round1(diameter * 1.6), headHeight: round1(diameter * 0.65) }
      : { headDiameter: round1(diameter * 2), headHeight: round1(diameter * 0.75) };
  return thread
    ? { kind, length, diameter, threadPitch: thread.pitch, threaded: true, threadStandardId: thread.id, ...head }
    : { kind, length, diameter, ...head };
}

export function AddStockDialog({ onAdd, onClose }: AddStockDialogProps) {
  const [draft, setDraft] = useState<StockDraft>(DEFAULT_STOCK);
  const spec = stockSpec(draft);
  const threadable = draft.kind === 'bolt' || draft.kind === 'screw';
  const thread = threadable ? threadById(draft.threadId) : undefined;

  const number = (key: 'length' | 'diameter' | 'wall', label: string, step: number, disabled = false) => (
    <label className="block">
      <span className={`${LABEL} mb-1 block`}>{label}</span>
      <input
        type="number"
        className={FIELD}
        min={step}
        step={step}
        disabled={disabled}
        value={key === 'diameter' && thread ? thread.majorDiameter : draft[key]}
        onChange={(event) => setDraft((current) => ({ ...current, [key]: Number(event.target.value) }))}
      />
    </label>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/25 p-3 md:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Add stock by size"
        className={`${PANEL} w-full max-w-sm p-4 shadow-xl`}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="mb-1 text-sm font-bold text-slate-900">Add stock by size</h2>
        <p className="mb-3 text-[0.7rem] text-slate-500">
          Type the measurements first. The numbers stay editable on the part afterwards.
        </p>

        <div className="mb-3 grid grid-cols-4 gap-1">
          {KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              aria-pressed={draft.kind === kind}
              className={draft.kind === kind ? ACTION_PRIMARY : ACTION_GHOST}
              onClick={() => setDraft((current) => ({ ...current, kind }))}
            >
              {KIND_LABEL[kind]}
            </button>
          ))}
        </div>

        <div className="mb-3 grid grid-cols-3 gap-2">
          {number('length', 'Length mm', 1)}
          {number('diameter', 'Outside ⌀ mm', 0.1, Boolean(thread))}
          {draft.kind === 'pipe' && number('wall', 'Wall mm', 0.1)}
        </div>

        {threadable && (
          <label className="mb-3 block">
            <span className={`${LABEL} mb-1 block`}>Thread</span>
            <select
              className={FIELD}
              value={draft.threadId}
              onChange={(event) => setDraft((current) => ({ ...current, threadId: event.target.value }))}
            >
              <option value="">Plain shaft</option>
              {THREAD_STANDARDS.map((standard) => (
                <option key={standard.id} value={standard.id}>
                  {standard.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <p className="mb-3 min-h-[1.1rem] text-[0.72rem] text-slate-600">
          {spec ? (
            <>
              {hardwareLabel(spec)}
              {spec.kind === 'pipe' ? ` · inner ⌀ ${round1(spec.diameter - 2 * (spec.wall ?? 0))} mm` : ''}
            </>
          ) : draft.kind === 'pipe' && draft.wall * 2 >= draft.diameter ? (
            'The wall leaves no hole — make it thinner, or pick Rod.'
          ) : (
            'Length and diameter must be more than 0.'
          )}
        </p>

        <div className="flex justify-end gap-2">
          <button type="button" className={ACTION_GHOST} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={ACTION_PRIMARY} disabled={!spec} onClick={() => spec && onAdd(spec)}>
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
