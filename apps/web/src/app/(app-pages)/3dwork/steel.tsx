'use client';

/**
 * Steel take-off: a cut list of stock sections with weights and totals.
 *
 * This is the side of the bench that has nothing to do with the mesh — you type
 * in the pipe and bar you are going to cut, and it tells you what it weighs and
 * how much surface there is to paint.
 */

import { Plus, Trash2, X } from 'lucide-react';
import {
  MATERIALS,
  PROFILE_FIELDS,
  PROFILE_LABELS,
  bendLength,
  evaluateCutItem,
  type CutItem,
  type ProfileKind,
} from '@/lib/3dwork/measure';
import { formatLength, formatMass } from '@/lib/3dwork/format';
import { ACTION_GHOST, ACTION_PRIMARY, FIELD, LABEL, PANEL, VALUE } from './ui';

interface SteelProps {
  items: CutItem[];
  onChange: (items: CutItem[]) => void;
  onExportCsv: () => void;
  onClose: () => void;
  /** Seeds a row from whatever the pipe analyser measured on the selected part. */
  onAddFromSelection: (() => void) | null;
}

const PROFILE_KINDS = Object.keys(PROFILE_LABELS) as ProfileKind[];

export function makeCutItem(seed: Partial<CutItem> = {}): CutItem {
  return {
    id: `cut_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    label: 'New item',
    profile: { kind: 'round-pipe', a: 33.7, t: 3.2 },
    length: 1000,
    quantity: 1,
    materialId: 'steel',
    ...seed,
  };
}

function CutRow({
  item,
  onPatch,
  onRemove,
}: {
  item: CutItem;
  onPatch: (patch: Partial<CutItem>) => void;
  onRemove: () => void;
}) {
  const result = evaluateCutItem(item);
  const fields = PROFILE_FIELDS[item.profile.kind];

  const patchProfile = (patch: Partial<CutItem['profile']>) =>
    onPatch({ profile: { ...item.profile, ...patch } });

  return (
    <div className="border-b border-slate-800 px-3 py-2 last:border-b-0">
      <div className="mb-2 flex items-center gap-2">
        <input
          className={`${FIELD} flex-1`}
          value={item.label}
          onChange={(event) => onPatch({ label: event.target.value })}
          aria-label="Item name"
        />
        <button
          type="button"
          onClick={onRemove}
          className="rounded border border-slate-700 p-1.5 text-slate-500 hover:border-rose-500 hover:text-rose-400"
          aria-label={`Remove ${item.label}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <label className="block">
          <span className={`${LABEL} mb-1 block`}>Profile</span>
          <select
            className={FIELD}
            value={item.profile.kind}
            onChange={(event) => patchProfile({ kind: event.target.value as ProfileKind })}
          >
            {PROFILE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {PROFILE_LABELS[kind]}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className={`${LABEL} mb-1 block`}>{fields.a} (mm)</span>
          <input
            type="number"
            className={FIELD}
            value={item.profile.a}
            onChange={(event) => patchProfile({ a: Number(event.target.value) })}
          />
        </label>

        {fields.b !== undefined && (
          <label className="block">
            <span className={`${LABEL} mb-1 block`}>{fields.b} (mm)</span>
            <input
              type="number"
              className={FIELD}
              value={item.profile.b ?? 0}
              onChange={(event) => patchProfile({ b: Number(event.target.value) })}
            />
          </label>
        )}

        {fields.t !== undefined && (
          <label className="block">
            <span className={`${LABEL} mb-1 block`}>{fields.t} (mm)</span>
            <input
              type="number"
              step="0.1"
              className={FIELD}
              value={item.profile.t ?? 0}
              onChange={(event) => patchProfile({ t: Number(event.target.value) })}
            />
          </label>
        )}

        <label className="block">
          <span className={`${LABEL} mb-1 block`}>Length (mm)</span>
          <input
            type="number"
            className={FIELD}
            value={item.length}
            onChange={(event) => onPatch({ length: Number(event.target.value) })}
          />
        </label>

        <label className="block">
          <span className={`${LABEL} mb-1 block`}>Qty</span>
          <input
            type="number"
            min={1}
            className={FIELD}
            value={item.quantity}
            onChange={(event) => onPatch({ quantity: Math.max(1, Number(event.target.value)) })}
          />
        </label>

        <label className="block">
          <span className={`${LABEL} mb-1 block`}>Material</span>
          <select
            className={FIELD}
            value={item.materialId}
            onChange={(event) => onPatch({ materialId: event.target.value })}
          >
            {MATERIALS.filter((material) => material.group === 'metal').map((material) => (
              <option key={material.id} value={material.id}>
                {material.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1 font-mono text-[0.7rem] text-slate-400">
        {item.profile.kind !== 'plate' && (
          <span>
            <span className={LABEL}>kg/m </span>
            <span className={VALUE}>{result.massPerMetre.toFixed(3)}</span>
          </span>
        )}
        <span>
          <span className={LABEL}>each </span>
          <span className={VALUE}>{formatMass(result.massEach * 1000)}</span>
        </span>
        <span>
          <span className={LABEL}>total </span>
          <span className="font-mono text-sm text-emerald-400">
            {formatMass(result.massTotal * 1000)}
          </span>
        </span>
        <span>
          <span className={LABEL}>cut </span>
          <span className={VALUE}>{formatLength(result.totalLength)}</span>
        </span>
        <span>
          <span className={LABEL}>paint </span>
          <span className={VALUE}>{result.surfaceTotal.toFixed(3)} m²</span>
        </span>
      </div>
    </div>
  );
}

export function SteelPanel({ items, onChange, onExportCsv, onClose, onAddFromSelection }: SteelProps) {
  const results = items.map(evaluateCutItem);
  const totalMass = results.reduce((sum, result) => sum + result.massTotal, 0);
  const totalLength = results.reduce((sum, result) => sum + result.totalLength, 0);
  const totalSurface = results.reduce((sum, result) => sum + result.surfaceTotal, 0);

  const patchItem = (id: string, patch: Partial<CutItem>) =>
    onChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  return (
    <div className={`${PANEL} flex h-full flex-col overflow-hidden`}>
      <div className="flex items-center justify-between border-b border-slate-700/60 px-3 py-2">
        <span className={LABEL}>Steel take-off · cut list</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-slate-500 hover:text-slate-200"
          aria-label="Close cut list"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <p className="p-4 text-center text-[0.75rem] text-slate-500">
            No items yet. Add a row for each length of pipe, tube or bar you need to cut.
          </p>
        ) : (
          items.map((item) => (
            <CutRow
              key={item.id}
              item={item}
              onPatch={(patch) => patchItem(item.id, patch)}
              onRemove={() => onChange(items.filter((other) => other.id !== item.id))}
            />
          ))
        )}
      </div>

      <div className="border-t border-slate-700/60 px-3 py-2">
        <div className="mb-2 flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <span>
            <span className={LABEL}>Total mass </span>
            <span className="font-mono text-base font-bold text-emerald-400">
              {formatMass(totalMass * 1000)}
            </span>
          </span>
          <span>
            <span className={LABEL}>Total cut </span>
            <span className={VALUE}>{(totalLength / 1000).toFixed(2)} m</span>
          </span>
          <span>
            <span className={LABEL}>Paint area </span>
            <span className={VALUE}>{totalSurface.toFixed(2)} m²</span>
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <button
            type="button"
            className={ACTION_PRIMARY}
            onClick={() => onChange([...items, makeCutItem()])}
          >
            <Plus className="mr-1 inline h-3 w-3" />
            Add item
          </button>
          {onAddFromSelection && (
            <button type="button" className={ACTION_GHOST} onClick={onAddFromSelection}>
              From selected part
            </button>
          )}
          <button
            type="button"
            className={ACTION_GHOST}
            onClick={onExportCsv}
            disabled={items.length === 0}
          >
            Export CSV
          </button>
          <button
            type="button"
            className={ACTION_GHOST}
            onClick={() => onChange([])}
            disabled={items.length === 0}
          >
            Clear list
          </button>
        </div>

        <p className="mt-2 text-[0.65rem] text-slate-500">
          Sections are calculated from nominal dimensions with square corners, so hollow profiles
          read slightly heavy against a mill certificate. A 90° bend on {formatLength(100)} centreline
          radius adds {formatLength(bendLength(100, 90))} of material.
        </p>
      </div>
    </div>
  );
}
