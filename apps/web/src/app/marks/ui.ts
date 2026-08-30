export const SURFACE = 'bg-stone-100';

export const PANEL = 'rounded-xl border border-stone-200 bg-white shadow-sm';

export const LABEL =
  'text-[0.65rem] font-extrabold uppercase tracking-[0.06em] text-stone-500';

export const ACTION =
  'inline-flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-[0.7rem] font-extrabold uppercase tracking-[0.04em] transition-colors disabled:cursor-not-allowed disabled:opacity-40';

export const ACTION_PRIMARY = `${ACTION} bg-emerald-700 text-white hover:bg-emerald-600`;

export const ACTION_GHOST = `${ACTION} border border-stone-300 bg-white text-stone-600 hover:border-stone-400 hover:text-stone-900`;

export const FIELD =
  'w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-emerald-600';

export const CHIP =
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.65rem] font-extrabold uppercase tracking-[0.04em] transition-colors';

export const CHIP_IDLE = `${CHIP} border-stone-300 bg-white text-stone-500 hover:border-stone-400 hover:text-stone-800`;

export const CHIP_ON = `${CHIP} border-emerald-700 bg-emerald-700 text-white`;

export const BOARD =
  'relative min-h-[70dvh] min-w-[52rem] overflow-visible bg-[radial-gradient(circle_at_1px_1px,#d6d3d1_1px,transparent_0)] [background-size:22px_22px]';

export const ACTION_TINY =
  'inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[0.65rem] font-bold text-stone-400 hover:bg-stone-50 hover:text-emerald-800';

export const BUTTON_CHIP =
  'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.7rem] font-bold text-white shadow-sm';
