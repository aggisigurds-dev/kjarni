'use client';

/**
 * A planning board in the Partasafn (skipulagsborð): pictures — fittings to buy,
 * references — and notes, pinned where you put them. Paste a picture with
 * Ctrl+V, drop one on the board or pick one on the phone; drag a pin by its
 * strip to move it and by its corner to size it; mark each one printed, made or
 * bought. Every change goes into the library's document; the pictures
 * themselves, shrunk to WebP, go to the bucket next to the meshes.
 */

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { GripHorizontal, ImagePlus, Loader2, StickyNote, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  addBoardNote,
  addBoardPicture,
  changeBoardPin,
  loadBoardPicture,
  PART_STATUSES,
  removeBoardPin,
  type BoardPin,
  type PartStatus,
} from '@/lib/3dwork/favorites';
import { failureNote } from '@/lib/3dwork/parts-library';

const BOARD_W = 2400;
const BOARD_H = 1600;
const PIN_MIN = 120;
const PIN_MAX = 900;

export const STATUS_STYLE: Record<PartStatus, string> = {
  printed: 'bg-emerald-600 text-white',
  made: 'bg-sky-600 text-white',
  bought: 'bg-amber-500 text-white',
};

// Pictures already fetched this session, by bucket file id.
const pictureUrls = new Map<string, string>();

/** Shrink a pasted picture to at most 1600 px on its long side, as WebP. */
async function shrinkPicture(file: Blob, maxSide = 1600): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.85));
  return { blob: blob ?? file, width, height };
}

function PinPicture({ pin }: { pin: BoardPin }) {
  const [url, setUrl] = useState<string | null>(() => (pin.image ? pictureUrls.get(pin.image) ?? null : null));
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (url || !pin.image) return;
    let cancelled = false;
    void loadBoardPicture(pin).then((blob) => {
      if (cancelled) return;
      if (!blob) {
        setFailed(true);
        return;
      }
      const made = URL.createObjectURL(blob);
      pictureUrls.set(pin.image!, made);
      setUrl(made);
    });
    return () => {
      cancelled = true;
    };
  }, [pin, url]);
  const ratio = pin.naturalWidth && pin.naturalHeight ? pin.naturalHeight / pin.naturalWidth : 0.75;
  if (!url) {
    return (
      <div className="flex items-center justify-center bg-slate-100 text-[0.65rem] text-slate-500" style={{ height: pin.width * ratio }}>
        {failed ? 'Myndin fannst ekki' : <Loader2 className="h-4 w-4 animate-spin" />}
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- a blob URL from the bucket, not a static asset
  return <img src={url} alt={pin.text || 'Mynd á borði'} className="block w-full select-none" draggable={false} />;
}

interface BoardViewProps {
  sectionId: string;
  title: string;
  pins: BoardPin[];
  /** Tell the library what the board now holds (counts in the side list). */
  onPinsChange?: (pins: BoardPin[]) => void;
}

type Drag = { id: string; mode: 'move' | 'size'; startX: number; startY: number; x: number; y: number; width: number };

export function BoardView({ sectionId, title, pins: initial, onPinsChange }: BoardViewProps) {
  const [pins, setPins] = useState<BoardPin[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const drag = useRef<Drag | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const pinsRef = useRef(pins);
  pinsRef.current = pins;

  // Another board picked: start from what it holds.
  useEffect(() => setPins(initial), [sectionId, initial]);

  const publish = useCallback(
    (next: BoardPin[]) => {
      setPins(next);
      onPinsChange?.(next);
    },
    [onPinsChange]
  );

  /** Somewhere in view that the last pins did not take: a short cascade from the top-left of what is shown. */
  const freeSpot = useCallback(() => {
    const el = scroller.current;
    const step = (pinsRef.current.length % 6) * 28;
    return { x: (el?.scrollLeft ?? 0) + 24 + step, y: (el?.scrollTop ?? 0) + 24 + step };
  }, []);

  const addPictures = useCallback(
    async (files: File[]) => {
      const pictures = files.filter((file) => file.type.startsWith('image/'));
      if (pictures.length === 0) return;
      try {
        for (const [index, file] of pictures.entries()) {
          setBusy(`Set inn mynd ${index + 1}/${pictures.length}…`);
          const small = await shrinkPicture(file);
          const pin = await addBoardPicture(sectionId, small.blob, { width: small.width, height: small.height }, { ...freeSpot(), width: 240 });
          if (pin.image) pictureUrls.set(pin.image, URL.createObjectURL(small.blob));
          publish([...pinsRef.current, pin]);
        }
      } catch (error) {
        toast.error(failureNote(error, 'Náði ekki að setja myndina á borðið.'));
      } finally {
        setBusy(null);
      }
    },
    [sectionId, freeSpot, publish]
  );

  const addNote = useCallback(
    async (text = '') => {
      try {
        setBusy('Bý til miða…');
        const pin = await addBoardNote(sectionId, text, { ...freeSpot(), width: 200 });
        publish([...pinsRef.current, pin]);
      } catch (error) {
        toast.error(failureNote(error, 'Náði ekki að búa til miða.'));
      } finally {
        setBusy(null);
      }
    },
    [sectionId, freeSpot, publish]
  );

  // Paste: pictures become pins; plain text pasted outside a text field becomes a note.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('textarea, input, [contenteditable="true"]')) return;
      const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith('image/'));
      if (files.length > 0) {
        event.preventDefault();
        void addPictures(files);
        return;
      }
      const text = event.clipboardData?.getData('text/plain')?.trim();
      if (text) {
        event.preventDefault();
        void addNote(text);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addPictures, addNote]);

  const save = useCallback(
    async (id: string, change: Partial<BoardPin>) => {
      try {
        await changeBoardPin(sectionId, id, change);
      } catch (error) {
        toast.error(failureNote(error, 'Náði ekki að vista breytinguna á borðinu.'));
      }
    },
    [sectionId]
  );

  const patchLocal = (id: string, change: Partial<BoardPin>) =>
    setPins((current) => current.map((pin) => (pin.id === id ? { ...pin, ...change } : pin)));

  const startDrag = (event: ReactPointerEvent, pin: BoardPin, mode: Drag['mode']) => {
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    drag.current = { id: pin.id, mode, startX: event.clientX, startY: event.clientY, x: pin.x, y: pin.y, width: pin.width };
  };
  const moveDrag = (event: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = event.clientX - d.startX;
    const dy = event.clientY - d.startY;
    if (d.mode === 'move') {
      patchLocal(d.id, { x: Math.max(0, Math.min(BOARD_W - 60, d.x + dx)), y: Math.max(0, Math.min(BOARD_H - 40, d.y + dy)) });
    } else {
      patchLocal(d.id, { width: Math.max(PIN_MIN, Math.min(PIN_MAX, d.width + dx)) });
    }
  };
  const endDrag = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const pin = pinsRef.current.find((entry) => entry.id === d.id);
    if (!pin) return;
    if (pin.x !== d.x || pin.y !== d.y || pin.width !== d.width) {
      onPinsChange?.(pinsRef.current);
      void save(pin.id, { x: Math.round(pin.x), y: Math.round(pin.y), width: Math.round(pin.width) });
    }
  };

  const setStatus = (pin: BoardPin, status: PartStatus) => {
    const next = pin.status === status ? undefined : status;
    patchLocal(pin.id, { status: next });
    void save(pin.id, { status: next });
  };

  const remove = async (pin: BoardPin) => {
    try {
      await removeBoardPin(sectionId, pin.id);
      publish(pinsRef.current.filter((entry) => entry.id !== pin.id));
    } catch (error) {
      toast.error(failureNote(error, 'Náði ekki að taka af borðinu.'));
    }
  };

  return (
    <div className="flex h-full min-h-[420px] flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm font-bold text-[var(--wb-ink)]">{title}</span>
        <span className="text-[0.65rem] text-[var(--wb-ink-mute)]">
          {pins.length} á borðinu · límdu mynd inn með Ctrl+V eða dragðu hana hingað
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {busy && (
            <span className="flex items-center gap-1 text-[0.7rem] text-[var(--wb-ink-mute)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {busy}
            </span>
          )}
          <button
            type="button"
            className="inline-flex min-h-9 items-center gap-1 rounded border border-[var(--wb-tool-border)] bg-[var(--wb-tool-bg)] px-2.5 text-[0.7rem] font-bold text-[var(--wb-tool-ink)] hover:bg-[var(--wb-tool-hover)]"
            onClick={() => fileInput.current?.click()}
          >
            <ImagePlus className="h-3.5 w-3.5" />
            Mynd…
          </button>
          <button
            type="button"
            className="inline-flex min-h-9 items-center gap-1 rounded border border-[var(--wb-tool-border)] bg-[var(--wb-tool-bg)] px-2.5 text-[0.7rem] font-bold text-[var(--wb-tool-ink)] hover:bg-[var(--wb-tool-hover)]"
            onClick={() => void addNote()}
          >
            <StickyNote className="h-3.5 w-3.5" />
            Miði
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = '';
              void addPictures(files);
            }}
          />
        </div>
      </div>

      <div
        ref={scroller}
        className="relative min-h-0 flex-1 overflow-auto rounded border border-[var(--wb-panel-border)] bg-slate-50"
        style={{ backgroundImage: 'radial-gradient(circle, rgb(203 213 225) 1px, transparent 1px)', backgroundSize: '24px 24px' }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void addPictures(Array.from(event.dataTransfer.files));
        }}
      >
        <div className="relative" style={{ width: BOARD_W, height: BOARD_H }}>
          {pins.length === 0 && (
            <div className="absolute left-6 top-6 max-w-sm rounded border border-dashed border-slate-300 bg-white/80 p-4 text-[0.75rem] text-slate-600">
              Tómt borð. Límdu inn myndir af fittings og íhlutum (Ctrl+V), dragðu þær hingað eða veldu „Mynd…“ — og
              bættu við miðum. Dragðu á röndinni efst til að færa, á horninu til að stækka.
            </div>
          )}
          {pins.map((pin) => (
            <div
              key={pin.id}
              className="absolute flex flex-col overflow-hidden rounded-md border border-slate-300 bg-white shadow-md"
              style={{ left: pin.x, top: pin.y, width: pin.width, background: pin.kind === 'note' ? pin.color ?? '#fde68a' : undefined }}
            >
              <div
                className="flex h-6 shrink-0 cursor-grab touch-none items-center justify-between bg-black/5 px-1 active:cursor-grabbing"
                onPointerDown={(event) => startDrag(event, pin, 'move')}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                aria-label="Færa"
              >
                <GripHorizontal className="h-3.5 w-3.5 text-slate-500" />
                <button
                  type="button"
                  className="flex h-5 w-5 items-center justify-center rounded text-slate-500 hover:bg-white hover:text-rose-600"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => void remove(pin)}
                  aria-label="Taka af borðinu"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              {pin.kind === 'image' && <PinPicture pin={pin} />}
              <textarea
                className="w-full resize-none bg-transparent px-1.5 py-1 text-[0.72rem] leading-snug text-slate-800 outline-none"
                rows={pin.kind === 'note' ? 4 : 2}
                defaultValue={pin.text}
                placeholder={pin.kind === 'note' ? 'Miði…' : 'Hvað er þetta? (t.d. G1/4 hraðtengi, Byko)'}
                onBlur={(event) => {
                  const text = event.target.value;
                  if (text === pin.text) return;
                  patchLocal(pin.id, { text });
                  void save(pin.id, { text });
                }}
              />
              <div className="flex gap-1 px-1.5 pb-1.5">
                {PART_STATUSES.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className={`rounded px-1.5 py-0.5 text-[0.6rem] font-bold ${
                      pin.status === entry.id ? STATUS_STYLE[entry.id] : 'bg-black/5 text-slate-500 hover:bg-black/10'
                    }`}
                    onClick={() => setStatus(pin, entry.id)}
                    aria-pressed={pin.status === entry.id}
                  >
                    {entry.label}
                  </button>
                ))}
              </div>
              <div
                className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize touch-none"
                style={{ background: 'linear-gradient(135deg, transparent 50%, rgb(148 163 184) 50%)' }}
                onPointerDown={(event) => startDrag(event, pin, 'size')}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                aria-label="Stærð"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
