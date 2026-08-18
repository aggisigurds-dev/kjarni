'use client';

/**
 * A small menu-bar primitive for the bench toolbar.
 *
 * Hand-rolled rather than pulled from the shared UI kit because those follow
 * the app's light/dark theme, and the bench deliberately keeps its own fixed
 * workshop palette. Behaviour is the bit that matters: only one menu open at a
 * time, closes on outside click, Escape, or picking an item.
 */

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

interface MenuBarState {
  openId: string | null;
  setOpenId: (id: string | null) => void;
}

const MenuBarContext = createContext<MenuBarState>({ openId: null, setOpenId: () => {} });

export function MenuBar({ children }: { children: React.ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!openId) return;

    const close = () => setOpenId(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenId(null);
    };

    // Fires after the menu's own click handler, so picking an item still works.
    window.addEventListener('click', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [openId]);

  return (
    <MenuBarContext.Provider value={{ openId, setOpenId }}>
      <div className="flex items-center gap-0.5">{children}</div>
    </MenuBarContext.Provider>
  );
}

export function Menu({
  label,
  children,
  width = 248,
}: {
  label: string;
  children: React.ReactNode;
  width?: number;
}) {
  const id = useId();
  const { openId, setOpenId } = useContext(MenuBarContext);
  const open = openId === id;
  const ref = useRef<HTMLDivElement | null>(null);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpenId(open ? null : id);
        }}
        // Hovering another title while a menu is open switches to it, the way
        // a desktop menu bar behaves.
        onPointerEnter={() => {
          if (openId !== null && !open) setOpenId(id);
        }}
        className={`flex items-center gap-1 rounded px-2.5 py-1.5 text-[0.7rem] font-extrabold uppercase tracking-[0.03em] transition-colors ${
          open ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
        }`}
      >
        {label}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1 overflow-hidden rounded border border-slate-300 bg-white py-1 shadow-lg"
          style={{ width }}
          onClick={(event) => event.stopPropagation()}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  children,
  onClick,
  disabled,
  shortcut,
  hint,
  icon: Icon,
  tone = 'normal',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  shortcut?: string;
  /** Shown under the label — used to say why something is unavailable. */
  hint?: string;
  icon?: React.ElementType;
  tone?: 'normal' | 'primary' | 'danger';
}) {
  const { setOpenId } = useContext(MenuBarContext);

  const toneClass =
    tone === 'primary'
      ? 'text-emerald-700'
      : tone === 'danger'
        ? 'text-rose-700'
        : 'text-slate-700';

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        setOpenId(null);
        onClick?.();
      }}
      className={`flex w-full items-start gap-2 px-3 py-1.5 text-left transition-colors ${
        disabled ? 'cursor-not-allowed opacity-45' : `${toneClass} hover:bg-slate-100`
      }`}
    >
      {Icon && <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-70" />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.75rem] font-semibold">{children}</span>
        {hint && <span className="block text-[0.65rem] text-slate-500">{hint}</span>}
      </span>
      {shortcut && (
        <span className="shrink-0 font-mono text-[0.6rem] text-slate-400">{shortcut}</span>
      )}
    </button>
  );
}

export function MenuCheckItem({
  children,
  checked,
  onClick,
  shortcut,
}: {
  children: React.ReactNode;
  checked: boolean;
  onClick: () => void;
  shortcut?: string;
}) {
  const { setOpenId } = useContext(MenuBarContext);

  return (
    <button
      type="button"
      onClick={() => {
        setOpenId(null);
        onClick();
      }}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-slate-700 transition-colors hover:bg-slate-100"
    >
      <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
        {checked && <Check className="h-3.5 w-3.5 text-emerald-600" />}
      </span>
      <span className="min-w-0 flex-1 truncate text-[0.75rem] font-semibold">{children}</span>
      {shortcut && (
        <span className="shrink-0 font-mono text-[0.6rem] text-slate-400">{shortcut}</span>
      )}
    </button>
  );
}

export function MenuSeparator() {
  return <div className="my-1 h-px bg-slate-200" />;
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pb-1 pt-2 text-[0.6rem] font-extrabold uppercase tracking-[0.06em] text-slate-400">
      {children}
    </div>
  );
}

/** Scrollable region for long lists (stock presets, project list). */
export function MenuScroll({ children }: { children: React.ReactNode }) {
  return <div className="max-h-64 overflow-y-auto">{children}</div>;
}

/** Hook that closes menus and runs an action, for use outside MenuItem. */
export function useCloseMenu() {
  const { setOpenId } = useContext(MenuBarContext);
  return useCallback(() => setOpenId(null), [setOpenId]);
}
