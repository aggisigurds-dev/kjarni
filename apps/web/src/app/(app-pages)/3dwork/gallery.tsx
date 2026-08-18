'use client';

/**
 * The parts gallery — one lane per mount point, every variant you have loaded
 * for it side by side. Clicking a card fits that variant to the blaster, which
 * is the same action as clicking the part out on the table.
 */

import { Eye, EyeOff, Layers, Trash2 } from 'lucide-react';
import type { Part, Project, Slot } from '@/lib/3dwork/project';
import { partsForSlot } from '@/lib/3dwork/project';
import { formatCount } from '@/lib/3dwork/format';
import { CHIP, LABEL, PANEL } from './ui';

interface GalleryProps {
  project: Project;
  selectedId: string | null;
  /** Parts picked out alongside the selected one, for group operations. */
  marked: Set<string>;
  onSelect: (partId: string) => void;
  onMark: (partId: string) => void;
  onFit: (slotId: string, partId: string | null) => void;
  onToggleVisible: (partId: string) => void;
  onDelete: (partId: string) => void;
  onAssignSlot: (partId: string, slotId: string) => void;
}

function PartCard({
  part,
  fitted,
  selected,
  marked,
  onSelect,
  onMark,
  onFit,
  onToggleVisible,
  onDelete,
}: {
  part: Part;
  fitted: boolean;
  selected: boolean;
  marked: boolean;
  onSelect: () => void;
  onMark: () => void;
  onFit: () => void;
  onToggleVisible: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`group relative shrink-0 rounded border p-1.5 transition-colors ${
        selected
          ? 'border-amber-400 bg-amber-50'
          : marked
            ? 'border-sky-500 bg-sky-50'
            : fitted
              ? 'border-emerald-500 bg-emerald-50'
              : 'border-slate-300 bg-slate-50 hover:border-slate-400'
      }`}
      style={{ width: 104 }}
    >
      <button
        type="button"
        // A modified click adds to the selection instead of replacing it,
        // which is what every other parts list works like.
        onClick={(event) => (event.metaKey || event.ctrlKey ? onMark() : onSelect())}
        onDoubleClick={onFit}
        className="block w-full text-left"
        title={`${part.name} — click to select, ⌘/Ctrl-click to add to the selection, double-click to fit`}
      >
        <div className="flex h-[74px] w-full items-center justify-center overflow-hidden rounded bg-slate-200">
          {part.thumbnail ? (
            // A data URL rendered in-browser; next/image would only add a hop.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={part.thumbnail} alt="" className="h-full w-full object-contain" />
          ) : (
            <Layers className="h-6 w-6 text-slate-400" />
          )}
        </div>
        <div className="mt-1 truncate text-[0.7rem] font-bold text-slate-800">{part.name}</div>
        <div className="font-mono text-[0.6rem] text-slate-500">
          {formatCount(part.triangles)} tri
        </div>
      </button>

      <div className="absolute right-1 top-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <button
          type="button"
          onClick={onToggleVisible}
          className="rounded bg-white/95 p-1 text-slate-500 hover:text-slate-900"
          title={part.visible ? 'Hide' : 'Show'}
        >
          {part.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded bg-white/95 p-1 text-slate-500 hover:text-rose-600"
          title="Remove part"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      {fitted && (
        <span className={`${CHIP} absolute left-1 top-1 bg-emerald-600 text-white`}>fitted</span>
      )}
    </div>
  );
}

function SlotLane({
  slot,
  parts,
  selectedId,
  marked,
  onSelect,
  onMark,
  onFit,
  onToggleVisible,
  onDelete,
}: {
  slot: Slot;
  parts: Part[];
  selectedId: string | null;
  marked: Set<string>;
  onSelect: (id: string) => void;
  onMark: (id: string) => void;
  onFit: (slotId: string, partId: string | null) => void;
  onToggleVisible: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="border-b border-slate-200 px-3 py-2 last:border-b-0">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className={LABEL}>{slot.name}</span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[0.6rem] text-slate-400">{parts.length}</span>
          {slot.activePartId && (
            <button
              type="button"
              onClick={() => onFit(slot.id, null)}
              className="text-[0.6rem] font-bold uppercase text-slate-500 hover:text-rose-600"
            >
              clear
            </button>
          )}
        </div>
      </div>

      {parts.length === 0 ? (
        <p className="py-1 text-[0.7rem] text-slate-400">No parts yet.</p>
      ) : (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {parts.map((part) => (
            <PartCard
              key={part.id}
              part={part}
              fitted={slot.activePartId === part.id}
              selected={selectedId === part.id}
              marked={marked.has(part.id)}
              onSelect={() => onSelect(part.id)}
              onMark={() => onMark(part.id)}
              onFit={() => onFit(slot.id, part.id)}
              onToggleVisible={() => onToggleVisible(part.id)}
              onDelete={() => onDelete(part.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function Gallery({
  project,
  selectedId,
  marked,
  onSelect,
  onMark,
  onFit,
  onToggleVisible,
  onDelete,
  onAssignSlot,
}: GalleryProps) {
  const loose = project.parts.filter(
    (part) => !project.slots.some((slot) => slot.id === part.slotId)
  );

  return (
    <div className={`${PANEL} flex h-full flex-col overflow-hidden`}>
      <div className="flex items-center justify-between border-b border-slate-300 px-3 py-2">
        <span className={LABEL}>Parts gallery</span>
        <span className="font-mono text-[0.6rem] text-slate-500">
          {formatCount(project.parts.length)} loaded
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {project.slots.map((slot) => (
          <SlotLane
            key={slot.id}
            slot={slot}
            parts={partsForSlot(project, slot.id)}
            selectedId={selectedId}
            marked={marked}
            onSelect={onSelect}
            onMark={onMark}
            onFit={onFit}
            onToggleVisible={onToggleVisible}
            onDelete={onDelete}
          />
        ))}

        {loose.length > 0 && (
          <div className="border-t border-slate-200 px-3 py-2">
            <div className="mb-1.5 flex items-center justify-between">
              <span className={LABEL}>Unassigned</span>
              <span className="font-mono text-[0.6rem] text-slate-400">{loose.length}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {loose.map((part) => (
                <div key={part.id} className="w-[104px]">
                  <PartCard
                    part={part}
                    fitted={false}
                    selected={selectedId === part.id}
                    marked={marked.has(part.id)}
                    onSelect={() => onSelect(part.id)}
                    onMark={() => onMark(part.id)}
                    onFit={() => onSelect(part.id)}
                    onToggleVisible={() => onToggleVisible(part.id)}
                    onDelete={() => onDelete(part.id)}
                  />
                  <select
                    value=""
                    onChange={(event) => onAssignSlot(part.id, event.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 bg-slate-200 px-1 py-1 text-[0.6rem] text-slate-700"
                    aria-label={`Assign ${part.name} to a slot`}
                  >
                    <option value="">Assign to…</option>
                    {project.slots.map((slot) => (
                      <option key={slot.id} value={slot.id}>
                        {slot.name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
