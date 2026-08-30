'use client';

import { faviconUrl, previewFrameClass, type MarkLink, type MarksPreviewSize } from '@/lib/marks/model';
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

function hideBroken(event: { currentTarget: HTMLImageElement }) {
  event.currentTarget.style.display = 'none';
}

export function BookmarkMedia({
  link,
  video,
  hovering,
  size = 'm',
}: {
  link: MarkLink;
  video: HoverVideo | null;
  hovering: boolean;
  size?: MarksPreviewSize;
}) {
  const fav = faviconUrl(link.url);
  const cover = coverForLink(link);
  const idleImage = link.showImage
    ? cover
    : video?.kind === 'youtube'
      ? `https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`
      : '';
  const playPreview = Boolean(video && hovering);
  const showFrame = Boolean(link.showImage || video);

  if (!showFrame) return null;

  if (!video && !idleImage) {
    return fav ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={fav}
        alt=""
        className="h-5 w-5 shrink-0 rounded"
        onError={hideBroken}
      />
    ) : (
      <span className="h-5 w-5 shrink-0 rounded bg-emerald-100" />
    );
  }

  return (
    <span
      className={`relative aspect-square ${previewFrameClass(size)} shrink-0 overflow-hidden rounded-md bg-stone-200`}
      aria-hidden
      data-mark-cover={idleImage || undefined}
      data-mark-cover-shape="square"
    >
      {playPreview ? <PreviewPlayer video={video!} /> : null}
      {!playPreview && idleImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={idleImage}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          onError={hideBroken}
        />
      ) : null}
      {!playPreview && !idleImage && fav ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={fav} alt="" className="absolute inset-0 m-auto h-5 w-5 rounded" onError={hideBroken} />
      ) : null}
      {video && !playPreview ? (
        <span className="absolute bottom-0.5 left-0.5 rounded bg-stone-900/75 px-1 py-px text-[0.55rem] font-extrabold uppercase tracking-wide text-white">
          ▶ video
        </span>
      ) : null}
    </span>
  );
}
