'use client';

/**
 * The parts gallery — one lane per mount point, every variant you have loaded
 * for it side by side. Clicking a card fits that variant to the blaster, which
 * is the same action as clicking the part out on the table.
 */

import { Eye, EyeOff, Layers, Sparkles, Trash2 } from 'lucide-react';
import type { Part, Project, Slot } from '@/lib/3dwork/project';
import { partsForSlot } from '@/lib/3dwork/project';
import { formatCount } from '@/lib/3dwork/format';
import { CHIP, LABEL, PANEL } from './ui';

interface GalleryProps {
  project: Project;
  selectedId: string | null;
  /** Parts picked out alongside the selected one, for group operations. */
  marked: Set<string>;
  /** When true, a plain tap adds to the selection instead of replacing it. */
  multiSelect?: boolean;
  onSelect: (partId: string) => void;
  onMark: (partId: string) => void;
  onFit: (slotId: string, partId: string | null) => void;
  onToggleVisible: (partId: string) => void;
  onIsolate: (partId: string) => void;
  onShowAll: () => void;
  onDelete: (partId: string) => void;
  /** Repair this part only — never the rest of the bench. */
  onFix: (partId: string) => void;
  fixBusy?: boolean;
  onAssignSlot: (partId: string, slotId: string) => void;
  /** Part currently soloed on the table (View → Focus). */
  focusId?: string | null;
}

function PartCard({
  part,
  fitted,
  selected,
  marked,
  multiSelect,
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
  multiSelect?: boolean;
  onSelect: () => void;
  onMark: () => void;
  onFit: () => void;
  onToggleVisible: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`group relative shrink-0 rounded border p-1.5 transition-colors ${
        !part.visible
          ? 'border-slate-200 bg-slate-100 opacity-70'
          : selected
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
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || multiSelect) {
            onMark();
            onSelect();
          } else {
            onSelect();
          }
        }}
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
          {part.group ? `group · ${part.group.members.length}` : `${formatCount(part.triangles)} tri`}
        </div>
      </button>

      <div className="absolute right-1 top-1 flex gap-0.5">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleVisible();
          }}
          className={`flex h-8 w-8 items-center justify-center rounded border bg-white/95 ${
            part.visible
              ? 'border-slate-300 text-slate-600 hover:text-slate-900'
              : 'border-amber-400 text-amber-600'
          }`}
          title={part.visible ? 'Hide on the table' : 'Show on the table'}
          aria-pressed={!part.visible}
          aria-label={part.visible ? `Hide ${part.name}` : `Show ${part.name}`}
        >
          {part.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          className="flex h-8 w-8 items-center justify-center rounded border border-slate-300 bg-white/95 text-slate-500 hover:text-rose-600"
          title="Remove part"
          aria-label={`Remove ${part.name}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {!part.visible && (
        <span className={`${CHIP} absolute left-1 top-1 bg-slate-600 text-white`}>hidden</span>
      )}
      {fitted && part.visible && (
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
  multiSelect,
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
  multiSelect?: boolean;
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
              multiSelect={multiSelect}
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
  multiSelect,
  onSelect,
  onMark,
  onFit,
  onToggleVisible,
  onIsolate,
  onShowAll,
  onDelete,
  onFix,
  fixBusy,
  onAssignSlot,
  focusId = null,
}: GalleryProps) {
  const loose = project.parts.filter(
    (part) => !project.slots.some((slot) => slot.id === part.slotId)
  );
  const hiddenCount = project.parts.filter((part) => !part.visible).length;

  return (
    <div className={`${PANEL} flex h-full flex-col overflow-hidden`}>
      <div className="flex items-center justify-between gap-2 border-b border-slate-300 px-3 py-2">
        <span className={LABEL}>Parts gallery</span>
        <span className="font-mono text-[0.6rem] text-slate-500">
          {formatCount(project.parts.length)} loaded
          {hiddenCount > 0 ? ` · ${hiddenCount} hidden` : ''}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {project.parts.length > 0 && (
          <div className="border-b border-slate-200">
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <span className={LABEL}>On the table</span>
              <button
                type="button"
                onClick={onShowAll}
                disabled={hiddenCount === 0}
                className="min-h-8 rounded px-2 text-[0.6rem] font-extrabold uppercase tracking-wide text-slate-500 hover:text-slate-900 disabled:opacity-30"
              >
                Show all
              </button>
            </div>
            <p className="px-3 pb-1.5 text-[0.62rem] leading-snug text-slate-400">
              Eye hides a part. Sparkles repairs that one part only. View → Focus (or Alt-click the
              eye) looks at one part; uncheck Focus to bring the others back.
            </p>
            <ul className="pb-1">
              {project.parts.map((part) => {
                const selected = selectedId === part.id;
                const isMarked = marked.has(part.id);
                return (
                  <li key={part.id}>
                    <div
                      className={`flex items-center gap-0.5 px-2 py-0.5 ${
                        selected ? 'bg-amber-50' : isMarked ? 'bg-sky-50' : ''
                      } ${!part.visible ? 'opacity-70' : ''} ${
                        focusId && part.id !== focusId ? 'opacity-40' : ''
                      }`}
                    >
                      <button
                        type="button"
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded ${
                          part.visible
                            ? 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                            : 'text-amber-600 hover:bg-amber-50'
                        }`}
                        title={
                          part.visible
                            ? 'Hide on the table — Alt-click to focus this part'
                            : 'Show on the table'
                        }
                        aria-pressed={!part.visible}
                        aria-label={part.visible ? `Hide ${part.name}` : `Show ${part.name}`}
                        onClick={(event) => {
                          if (event.altKey) onIsolate(part.id);
                          else onToggleVisible(part.id);
                        }}
                      >
                        {part.visible ? (
                          <Eye className="h-4 w-4" />
                        ) : (
                          <EyeOff className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        type="button"
                        className="min-h-11 min-w-0 flex-1 truncate rounded px-1 text-left text-[0.75rem] font-semibold text-slate-800 hover:bg-slate-100"
                        onClick={(event) => {
                          if (event.metaKey || event.ctrlKey || event.shiftKey || multiSelect) {
                            onMark(part.id);
                          }
                          onSelect(part.id);
                        }}
                      >
                        {part.name}
                        {focusId === part.id ? (
                          <span className="ml-1 text-[0.6rem] font-bold uppercase tracking-wide text-emerald-700">
                            focus
                          </span>
                        ) : null}
                        {!part.visible ? (
                          <span className="ml-1 text-[0.6rem] font-bold uppercase tracking-wide text-amber-600">
                            hidden
                          </span>
                        ) : null}
                      </button>
                      <button
                        type="button"
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded text-emerald-700 hover:bg-emerald-50 disabled:text-slate-300"
                        title={`Repair ${part.name} only`}
                        aria-label={`Repair ${part.name} only`}
                        disabled={fixBusy}
                        onClick={(event) => {
                          event.stopPropagation();
                          onSelect(part.id);
                          onFix(part.id);
                        }}
                      >
                        <Sparkles className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {project.slots.map((slot) => (
          <SlotLane
            key={slot.id}
            slot={slot}
            parts={partsForSlot(project, slot.id)}
            selectedId={selectedId}
            marked={marked}
            multiSelect={multiSelect}
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
                    multiSelect={multiSelect}
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
