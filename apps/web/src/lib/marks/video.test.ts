import { describe, expect, it } from 'vitest';
import { coverForLink, detectVideo, hoverVideoFor, youtubeId } from './video';

describe('detectVideo', () => {
  it('reads YouTube watch, share, embed, and shorts URLs', () => {
    const id = 'dQw4w9WgXcQ';
    const src = `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&controls=0&loop=1&playlist=${id}&modestbranding=1`;
    for (const url of [
      `https://www.youtube.com/watch?v=${id}`,
      `https://youtube.com/watch?v=${id}&t=12s`,
      `https://youtu.be/${id}`,
      `https://www.youtube.com/embed/${id}`,
      `https://www.youtube.com/shorts/${id}`,
      `https://m.youtube.com/watch?v=${id}`,
    ]) {
      expect(youtubeId(url)).toBe(id);
      expect(detectVideo(url)).toMatchObject({ kind: 'youtube', id, src });
    }
  });

  it('reads Vimeo page and player URLs', () => {
    const id = '148751763';
    const src = `https://player.vimeo.com/video/${id}?autoplay=1&muted=1&controls=0&loop=1&background=1`;
    expect(detectVideo(`https://vimeo.com/${id}`)).toMatchObject({ kind: 'vimeo', id, src });
    expect(detectVideo(`https://vimeo.com/${id}?fl=tl`)).toMatchObject({ kind: 'vimeo', id, src });
    expect(detectVideo(`https://player.vimeo.com/video/${id}`)).toMatchObject({ kind: 'vimeo', id, src });
  });

  it('reads direct video files including querystrings', () => {
    expect(detectVideo('https://cdn.example.com/clip.mp4')).toMatchObject({
      kind: 'file',
      src: 'https://cdn.example.com/clip.mp4',
    });
    expect(detectVideo('https://cdn.example.com/clip.webm?token=1')).toMatchObject({
      kind: 'file',
      src: 'https://cdn.example.com/clip.webm?token=1',
    });
    expect(detectVideo('https://cdn.example.com/clip.ogg#t=4')).toMatchObject({
      kind: 'file',
      src: 'https://cdn.example.com/clip.ogg#t=4',
    });
    expect(detectVideo('files.example.com/take.mp4')).toMatchObject({
      kind: 'file',
      src: 'https://files.example.com/take.mp4',
    });
  });

  it('returns null for ordinary pages', () => {
    expect(detectVideo('https://brunaholf.netlify.app')).toBeNull();
    expect(detectVideo('https://www.youtube.com')).toBeNull();
    expect(detectVideo('https://vimeo.com/channels/staffpicks')).toBeNull();
    expect(detectVideo('https://cdn.example.com/clip.mp4.exe')).toBeNull();
    expect(detectVideo('')).toBeNull();
  });
});

describe('hoverVideoFor / coverForLink', () => {
  it('derives video from the bookmark URL', () => {
    const source = hoverVideoFor({ url: 'https://youtu.be/aqz-KE-bpKQ' });
    expect(source).toMatchObject({ kind: 'youtube', id: 'aqz-KE-bpKQ' });
  });

  it('prefers an explicit videoUrl over the bookmark page', () => {
    expect(
      hoverVideoFor({
        url: 'https://brunaholf.netlify.app',
        videoUrl: 'https://vimeo.com/148751763',
      })
    ).toMatchObject({ kind: 'vimeo', id: '148751763' });
  });

  it('uses an explicit cover, else a YouTube thumbnail', () => {
    expect(
      coverForLink({
        url: 'https://youtu.be/aqz-KE-bpKQ',
        coverUrl: 'cdn.example.com/still.jpg',
      })
    ).toBe('https://cdn.example.com/still.jpg');
    expect(coverForLink({ url: 'https://youtu.be/aqz-KE-bpKQ' })).toBe(
      'https://i.ytimg.com/vi/aqz-KE-bpKQ/mqdefault.jpg'
    );
    expect(coverForLink({ url: 'https://brunaholf.netlify.app' })).toBe('');
  });
});
