/** Línutákn Móta-ritilsins (24×24, currentColor). Eigin teikningar. */

const PATHS: Record<string, string> = {
  // Viðmót
  back: "M15 5l-7 7 7 7",
  undo: "M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11",
  redo: "M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13",
  compare: "M12 3v18M5 5h14v14H5z",
  hand: "M8 13V6.5a1.5 1.5 0 0 1 3 0V12M11 11V4.5a1.5 1.5 0 0 1 3 0V12M14 11.5V6a1.5 1.5 0 0 1 3 0v8c0 4-2.5 7-6 7-2.6 0-4.2-1.3-5.6-3.6L4 14.6a1.4 1.4 0 0 1 2.3-1.6L8 15",
  close: "M6 6l12 12M18 6L6 18",
  check: "M4 12.5l5 5L20 6.5",
  more: "M12 5.5v.01M12 12v.01M12 18.5v.01",
  reset: "M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5",
  target: "M12 3v4M12 17v4M3 12h4M17 12h4M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8z",
  image: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15.5 9.5v.01",
  // Líkami
  auto: "M4 20L15 9M13 5.5l1-2.5 1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1zM19 13l.6 1.4L21 15l-1.4.6L19 17l-.6-1.4L17 15l1.4-.6z",
  slim: "M8 3c0 5 2 7 1 10s-2 5-1 8M16 3c0 5-2 7-1 10s2 5 1 8M4 12h2.5M20 12h-2.5",
  waist: "M7 3c3 5 3 13 0 18M17 3c-3 5-3 13 0 18M10.5 12h3",
  hips: "M8 3c0 5-3 7-2 11l2 7M16 3c0 5 3 7 2 11l-2 7M9 12h6",
  bust: "M4 9c0 6 7 6 7 1.5M13 10.5c0 4.5 7 4.5 7-1.5M6 4L4 9M18 4l2 5",
  shoulders: "M3 15c1.5-5 5-6 9-6s7.5 1 9 6M12 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4z",
  legs: "M9 3l-1 18M15 3l1 18M4 7l2-2 2 2M4 17l2 2 2-2M6 5v14",
  head: "M12 4a5 5 0 1 1 0 10 5 5 0 0 1 0-10zM8 21c0-3 1.8-5 4-5s4 2 4 5",
  // Burstar
  shrink: "M3 12h6M7 9l3 3-3 3M21 12h-6M17 9l-3 3 3 3",
  expand: "M10 12H3M6 9l-3 3 3 3M14 12h7M18 9l3 3-3 3",
  drag: "M5 12h11M12 8l4 4-4 4M19 5v14",
  restore: "M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5M12 8v4l3 2",
  smooth: "M3 9c3-3 6 3 9 0s6-3 9 0M3 15c3-3 6 3 9 0s6-3 9 0",
  heal: "M4.9 14.1l9.2-9.2a3 3 0 0 1 4.2 4.2l-9.2 9.2a3 3 0 0 1-4.2-4.2zM10 10v.01M12 12v.01M14 14v.01M12 8v.01M8 12v.01",
  clone: "M9 3h6v4l-1.5 2v2H20v4H4v-4h6.5V9L9 7zM5 19h14",
  lighten: "M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8",
  darken: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z",
  sharpen: "M12 3l9 9-9 9-9-9zM12 3v18",
  contrast: "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM12 3v18M12 7h4M12 11h6M12 15h5",
  // Ljós og litir
  brightness: "M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8",
  highlights: "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM5 8h14M3.5 12h17M5 16h6",
  shadows: "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM12 12h8.5M12 16h7M12 8h7",
  warmth: "M10 4a2 2 0 0 1 4 0v10a4 4 0 1 1-4 0zM12 11v6",
  saturation: "M12 3s-7 8-7 12a7 7 0 0 0 14 0c0-4-7-12-7-12zM9 15a3 3 0 0 0 3 3",
  skinEven: "M3 9c3-3 6 3 9 0s6-3 9 0M3 15c3-3 6 3 9 0s6-3 9 0",
  skinTone: "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM9 10v.01M15 10v.01M8.5 14.5c2 2 5 2 7 0",
  skinLight: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18 16l.8 2.2L21 19l-2.2.8L18 22l-.8-2.2L15 19l2.2-.8z",
  // Snjallt (gervigreind)
  restorePhoto: "M4 5h16v14H4zM4 15l4-4 3 3 3-3 6 6M8 3.5l1 1.5M16 3.5l-1 1.5M12 9v.01",
  upscale: "M4 14h6v6H4zM10 14l9-9M13 5h6v6",
  sparkle: "M12 3l1.6 4.8L18.5 9.4l-4.9 1.6L12 16l-1.6-5-4.9-1.6 4.9-1.6zM5 16l.8 2.2L8 19l-2.2.8L5 22l-.8-2.2L2 19l2.2-.8zM19 15l.6 1.5 1.4.5-1.4.5-.6 1.5-.6-1.5L17 17l1.4-.5z",
  wand: "M4 20L14.5 9.5M13 6l1-3 1 3 3 1-3 1-1 3-1-3-3-1zM18.5 12.5l.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5L16.5 14l1.5-.5z",
  background: "M3 5h18v14H3zM3 15l5-5 4 4M14 12l2-2 5 5M12 8.5a2 2 0 1 1 0 4",
  relight: "M9 18h6M10 21h4M12 3a6 6 0 0 1 3.5 10.9c-.6.4-1 1.2-1 2.1H9.5c0-.9-.4-1.7-1-2.1A6 6 0 0 1 12 3z",
  face: "M12 3a8 8 0 1 1 0 18 8 8 0 0 1 0-18zM9 10v.01M15 10v.01M8.5 14.5c2 2 5 2 7 0M17.5 4.5l1-1.5M19.5 6.5l1.5-.5",
  portrait: "M4 4h16v16H4zM12 7.5a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM6.5 20c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5",
};

export function Icon({ name, size = 24, fill }: { name: string; size?: number; fill?: boolean }) {
  const d = PATHS[name];
  if (!d) return <span aria-hidden="true" style={{ fontSize: size * 0.8, lineHeight: 1 }}>•</span>;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}
