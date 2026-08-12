export function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className={`logo${light ? " logo-light" : ""}`}>
      <svg className="logo-flame" viewBox="0 0 28 36" aria-hidden="true">
        <path
          d="M14 1C10 9 4 12 4 21a10 10 0 0 0 20 0c0-5-3-9-7-11 .3 3.5-2 5.5-4 5.5C11 12 16 7 14 1Z"
          fill="#ef5a24"
        />
        <path
          d="M15.2 14c-.8 3-3.2 4.6-3.2 8a5 5 0 0 0 10 0c0-2.4-1.4-4.2-3.4-5.2.2 2.2-1.2 3.4-2.6 3.4C13.6 21.4 16.6 17 15.2 14Z"
          fill="#f7a934"
        />
      </svg>
      <span className="logo-text">
        <span className="logo-main">Brunahólf</span>
        <span className="logo-sub">Slökkvitæki ehf.</span>
      </span>
    </span>
  );
}
