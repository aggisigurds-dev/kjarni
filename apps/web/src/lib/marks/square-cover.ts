/** Center-crop screenshots and covers into the square image well. */

export const SQUARE_COVER_PX = 400;

export function squareCropRect(width: number, height: number): { sx: number; sy: number; size: number } {
  const w = Math.max(1, Math.round(Number.isFinite(width) ? width : 1));
  const h = Math.max(1, Math.round(Number.isFinite(height) ? height : 1));
  const size = Math.min(w, h);
  return {
    sx: Math.floor((w - size) / 2),
    sy: Math.floor((h - size) / 2),
    size,
  };
}

export function imageFileFromClipboard(data: DataTransfer | null): File | null {
  if (!data) return null;
  for (const item of Array.from(data.items)) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  return null;
}

export async function cropImageToSquare(
  file: Blob,
  px = SQUARE_COVER_PX
): Promise<{ blob: Blob; fileName: string }> {
  const fallbackName = file instanceof File && file.name ? file.name : 'cover.jpg';
  try {
    const bitmap = await createImageBitmap(file);
    const { sx, sy, size } = squareCropRect(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = px;
    canvas.height = px;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return { blob: file, fileName: fallbackName };
    }
    ctx.drawImage(bitmap, sx, sy, size, size, 0, 0, px, px);
    bitmap.close();
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (next) => (next ? resolve(next) : reject(new Error('Could not crop screenshot.'))),
        'image/jpeg',
        0.86
      );
    });
    return { blob, fileName: 'cover.jpg' };
  } catch {
    return { blob: file, fileName: fallbackName };
  }
}
