/** Canvas helpers — mirror customer-app DoorPhotoCropModal (center square or full JPEG). */

// Cap the longest side. Large source images (modern phone cameras are 12MP+)
// overflow the iOS Safari canvas area limit and draw as a BLACK/blank frame —
// the #1 cause of "the door photo is black". Downscaling to a sane max both
// fixes that and keeps uploads small. 1600px is plenty for a door photo.
const MAX_DIMENSION = 1600;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = async () => {
      // Some browsers fire onload before the bitmap is fully decoded; drawing
      // then yields a black frame. decode() guarantees it's paintable.
      try {
        if (typeof img.decode === 'function') await img.decode();
      } catch {
        /* decode() can reject on some formats — onload data is still usable */
      }
      resolve(img);
    };
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = src;
  });
}

/**
 * Draw a (optionally cropped) region of `img` onto a white-backed canvas at the
 * target output size. The white fill ensures a transparent source (e.g. PNG)
 * doesn't turn BLACK when encoded to JPEG (JPEG has no alpha channel).
 */
function drawToCanvas(
  img: HTMLImageElement,
  sx: number,
  sy: number,
  sWidth: number,
  sHeight: number,
  outW: number,
  outH: number
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, outW);
  canvas.height = Math.max(1, outH);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function canvasToFile(
  canvas: HTMLCanvasElement,
  fileName: string,
  quality = 0.85
): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Could not encode image'));
          return;
        }
        const safeName = fileName.replace(/\.\w+$/i, '') || 'door';
        resolve(new File([blob], `${safeName}.jpg`, { type: 'image/jpeg' }));
      },
      'image/jpeg',
      quality
    );
  });
}

/** Compress + downscale to JPEG without cropping. */
export async function compressDoorPhoto(file: File): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (w < 1 || h < 1) throw new Error('Invalid image');
    const scale = Math.min(1, MAX_DIMENSION / Math.max(w, h));
    const canvas = drawToCanvas(img, 0, 0, w, h, Math.round(w * scale), Math.round(h * scale));
    return canvasToFile(canvas, file.name);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Center square crop + downscale — same rule as the mobile app. */
export async function cropCenterSquareDoorPhoto(file: File): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    const size = Math.min(width, height);
    if (size < 1) return compressDoorPhoto(file);

    const originX = Math.max(0, Math.floor((width - size) / 2));
    const originY = Math.max(0, Math.floor((height - size) / 2));
    const outSize = Math.min(size, MAX_DIMENSION);

    const canvas = drawToCanvas(img, originX, originY, size, size, outSize, outSize);
    return canvasToFile(canvas, file.name);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function processDoorPhoto(file: File, doCrop: boolean): Promise<File> {
  return doCrop ? cropCenterSquareDoorPhoto(file) : compressDoorPhoto(file);
}
