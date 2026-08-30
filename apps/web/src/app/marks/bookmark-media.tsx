'use client';

import { faviconUrl, type MarkLink } from '@/lib/marks/model';
import { coverForLink, type HoverVideo } from '@/lib/marks/video';

function PreviewPlayer({ video }: { video: HoverVideo }) {
  if (video.kind === 'file') {
    return (
      <video
        src={video.src}
        muted
        autoPlay
        loop
        playsInline
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
      />
    );
  }

  return (
    <iframe
      src={video.src}
      title=""
      tabIndex={-1}
      aria-hidden
      allow="autoplay; encrypted-media"
      referrerPolicy="strict-origin-when-cross-origin"
      className="pointer-events-none absolute inset-0 h-full w-full border-0"
    />
  );
}

export function BookmarkMedia({
  link,
  video,
  hovering,
}: {
  link: MarkLink;
  video: HoverVideo | null;
  hovering: boolean;
}) {
  const fav = faviconUrl(link.url);
  const cover = coverForLink(link);
  const playPreview = Boolean(video && hovering);

  if (!video) {
    return fav ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={fav}
        alt=""
        className="h-5 w-5 shrink-0 rounded"
        onError={(event) => {
          event.currentTarget.style.visibility = 'hidden';
        }}
      />
    ) : (
      <span className="h-5 w-5 shrink-0 rounded bg-emerald-100" />
    );
  }

  return (
    <span
      className="relative h-11 w-[4.6rem] shrink-0 overflow-hidden rounded-md bg-stone-200"
      aria-hidden
    >
      {playPreview ? <PreviewPlayer video={video} /> : null}
      {!playPreview && cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : null}
      {!playPreview && !cover && fav ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={fav} alt="" className="absolute inset-0 m-auto h-5 w-5 rounded" />
      ) : null}
      {!playPreview ? (
        <span className="absolute bottom-0.5 left-0.5 rounded bg-stone-900/75 px-1 py-px text-[0.55rem] font-extrabold uppercase tracking-wide text-white">
          ▶ video
        </span>
      ) : null}
    </span>
  );
}
