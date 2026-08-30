'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { type MarkTable } from '@/lib/marks/model';
import {
  cellKey,
  colIndexToLetters,
  evaluateSheet,
  formatExcelValue,
  isExcelError,
  parseA1,
} from '@/lib/marks/excel';
import { ACTION_TINY } from './ui';

function shiftKey(key: string, dCol: number, dRow: number, colCount: number, rowCount: number): string {
  const parsed = parseA1(key);
  if (!parsed) return key;
  const col = Math.max(0, Math.min(colCount - 1, parsed.col + dCol));
  const row = Math.max(0, Math.min(rowCount - 1, parsed.row + dRow));
  return cellKey(col, row);
}

function parseTsv(text: string): string[][] {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((line, index, rows) => line.length > 0 || index < rows.length - 1)
    .map((line) => line.split('\t'));
}

export function TableGrid({
  table,
  onCell,
  onCells,
  onAddRow,
  onAddCol,
  onRemoveRow,
  onRemoveCol,
  onRename,
}: {
  table: MarkTable;
  onCell: (key: string, raw: string) => void;
  onCells?: (entries: Record<string, string>) => void;
  onAddRow?: () => void;
  onAddCol?: () => void;
  onRemoveRow?: () => void;
  onRemoveCol?: () => void;
  onRename?: (title: string) => void;
}) {
  const [selected, setSelected] = useState('A1');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [bar, setBar] = useState('');
  const gridRef = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing == null) setBar(table.cells[selected]?.raw ?? '');
  }, [editing, selected, table.cells]);

  const values = useMemo(
    () =>
      evaluateSheet({
        colCount: table.colCount,
        rowCount: table.rowCount,
        cells: table.cells,
      }),
    [table.cells, table.colCount, table.rowCount]
  );

  const rawOf = (key: string) => table.cells[key]?.raw ?? '';
  const displayOf = (key: string) => {
    const computed = values[key];
    if (computed === undefined) {
      const raw = rawOf(key);
      return raw.startsWith('=') ? raw : raw;
    }
    return formatExcelValue(computed);
  };

  const select = (key: string) => {
    setSelected(key);
    setEditing(null);
    setBar(rawOf(key));
  };

  const beginEdit = (key: string, next = rawOf(key)) => {
    setSelected(key);
    setEditing(key);
    setDraft(next);
    setBar(next);
    requestAnimationFrame(() => editRef.current?.focus());
  };

  const commit = (move: 'down' | 'right' | 'up' | 'left' | 'stay' = 'stay') => {
    const key = editing ?? selected;
    const raw = editing != null ? draft : bar;
    if (raw !== rawOf(key)) onCell(key, raw);
    const next =
      move === 'down'
        ? shiftKey(key, 0, 1, table.colCount, table.rowCount)
        : move === 'right'
          ? shiftKey(key, 1, 0, table.colCount, table.rowCount)
          : move === 'up'
            ? shiftKey(key, 0, -1, table.colCount, table.rowCount)
            : move === 'left'
              ? shiftKey(key, -1, 0, table.colCount, table.rowCount)
              : key;
    setEditing(null);
    setSelected(next);
    setBar(rawOf(next) || (next === key ? raw : rawOf(next)));
    if (next === key) setBar(raw);
    gridRef.current?.focus();
  };

  const cancel = () => {
    setEditing(null);
    setBar(rawOf(selected));
    gridRef.current?.focus();
  };

  const onGridKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (editing) return;
    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      beginEdit(selected);
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      select(shiftKey(selected, event.shiftKey ? -1 : 1, 0, table.colCount, table.rowCount));
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setBar(rawOf(selected));
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      onCell(selected, '');
      setBar('');
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      select(shiftKey(selected, 0, 1, table.colCount, table.rowCount));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      select(shiftKey(selected, 0, -1, table.colCount, table.rowCount));
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      select(shiftKey(selected, 1, 0, table.colCount, table.rowCount));
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      select(shiftKey(selected, -1, 0, table.colCount, table.rowCount));
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      beginEdit(selected, event.key);
    }
  };

  const onEditKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit(event.shiftKey ? 'up' : 'down');
    } else if (event.key === 'Tab') {
      event.preventDefault();
      commit(event.shiftKey ? 'left' : 'right');
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
    }
  };

  const pasteAt = (text: string) => {
    const rows = parseTsv(text);
    if (rows.length === 0) return;
    const origin = parseA1(selected);
    if (!origin) return;
    if (rows.length === 1 && (rows[0]?.length ?? 0) <= 1) {
      const raw = rows[0]?.[0] ?? '';
      if (editing) {
        setDraft(raw);
        setBar(raw);
      } else {
        onCell(selected, raw);
        setBar(raw);
      }
      return;
    }
    const entries: Record<string, string> = {};
    rows.forEach((cols, r) => {
      cols.forEach((value, c) => {
        const col = origin.col + c;
        const row = origin.row + r;
        if (col >= table.colCount || row >= table.rowCount) return;
        entries[cellKey(col, row)] = value;
      });
    });
    onCells?.(entries);
    setBar(entries[selected] ?? rawOf(selected));
  };

  const preventWindowDrag = (event: ReactPointerEvent) => {
    event.stopPropagation();
  };

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-white"
      data-marks-table={table.id}
      data-no-drag
      onPointerDown={preventWindowDrag}
    >
      <div className="flex flex-wrap items-center gap-1 border-b border-stone-100 px-2 py-1">
        {onRename ? (
          <input
            className="min-w-[7rem] max-w-[10rem] rounded border border-transparent px-1 py-0.5 text-xs font-semibold outline-none hover:border-stone-300 focus:border-emerald-600"
            value={table.title}
            aria-label="Table name"
            onChange={(event) => onRename(event.target.value)}
          />
        ) : null}
        <button type="button" className={ACTION_TINY} onClick={onAddRow}>
          + Row
        </button>
        <button type="button" className={ACTION_TINY} onClick={onAddCol}>
          + Col
        </button>
        <button type="button" className={ACTION_TINY} onClick={onRemoveRow}>
          − Row
        </button>
        <button type="button" className={ACTION_TINY} onClick={onRemoveCol}>
          − Col
        </button>
        <span className="ml-auto text-[0.6rem] tabular-nums text-stone-400">
          {table.rowCount}×{table.colCount}
        </span>
      </div>
      <div className="flex items-center gap-2 border-b border-stone-100 px-2 py-1">
        <span className="w-10 shrink-0 text-center text-[0.65rem] font-extrabold text-stone-400">{selected}</span>
        <span className="text-[0.65rem] font-extrabold text-stone-400">fx</span>
        <input
          className="min-w-0 flex-1 rounded border border-stone-200 bg-white px-2 py-1 font-mono text-xs outline-none focus:border-emerald-600"
          data-marks-formula-bar={table.id}
          value={editing != null ? draft : bar}
          aria-label="Formula bar"
          onFocus={() => {
            if (editing == null) {
              setEditing(selected);
              setDraft(rawOf(selected) || bar);
            }
          }}
          onChange={(event) => {
            setBar(event.target.value);
            if (editing) setDraft(event.target.value);
            else {
              setEditing(selected);
              setDraft(event.target.value);
            }
          }}
          onKeyDown={onEditKey}
        />
      </div>
      <div
        ref={gridRef}
        tabIndex={0}
        className="min-h-0 flex-1 overflow-auto outline-none"
        data-marks-grid={table.id}
        onKeyDown={onGridKey}
        onCopy={(event) => {
          event.clipboardData.setData('text/plain', editing != null ? draft : rawOf(selected) || displayOf(selected));
          event.preventDefault();
        }}
        onPaste={(event) => {
          const text = event.clipboardData.getData('text/plain');
          if (!text) return;
          event.preventDefault();
          pasteAt(text);
        }}
      >
        <table className="border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-20 h-6 w-8 bg-stone-100 text-[0.6rem] font-bold text-stone-400" />
              {Array.from({ length: table.colCount }, (_, col) => (
                <th
                  key={col}
                  className="sticky top-0 z-10 min-w-[4.5rem] border border-stone-200 bg-stone-50 px-1 py-0.5 text-center text-[0.65rem] font-bold text-stone-500"
                >
                  {colIndexToLetters(col)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: table.rowCount }, (_, row) => (
              <tr key={row}>
                <th className="sticky left-0 z-10 w-8 border border-stone-200 bg-stone-50 text-[0.65rem] font-bold text-stone-500">
                  {row + 1}
                </th>
                {Array.from({ length: table.colCount }, (_, col) => {
                  const key = cellKey(col, row);
                  const raw = rawOf(key);
                  const display = displayOf(key);
                  const computed = values[key];
                  const err = computed !== undefined && isExcelError(computed);
                  const isSelected = selected === key;
                  const isEditing = editing === key;
                  return (
                    <td
                      key={key}
                      data-marks-cell={key}
                      className={`relative h-7 min-w-[4.5rem] border border-stone-200 px-1 ${
                        isSelected ? 'z-10 ring-2 ring-emerald-600' : ''
                      } ${err ? 'text-rose-600' : 'text-stone-800'}`}
                      onClick={() => select(key)}
                      onDoubleClick={() => beginEdit(key)}
                    >
                      {isEditing ? (
                        <input
                          ref={editRef}
                          className="absolute inset-0 w-full bg-white px-1 font-mono text-xs outline-none"
                          value={draft}
                          onChange={(event) => {
                            setDraft(event.target.value);
                            setBar(event.target.value);
                          }}
                          onKeyDown={onEditKey}
                          onBlur={() => commit('stay')}
                        />
                      ) : (
                        <span className={`block truncate ${raw.startsWith('=') ? 'text-right' : ''} ${err ? 'font-semibold' : ''}`}>
                          {display}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
