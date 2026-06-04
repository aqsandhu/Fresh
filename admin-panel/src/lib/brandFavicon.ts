/** Rasterize image: fixed height, width from aspect ratio. */
export async function rasterizeImageToHeight(
  imageUrl: string,
  targetHeight: number
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const nh = img.naturalHeight || targetHeight;
      const nw = img.naturalWidth || targetHeight;
      const width = Math.max(1, Math.round((nw / nh) * targetHeight));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.clearRect(0, 0, width, targetHeight);
      ctx.drawImage(img, 0, 0, width, targetHeight);
      resolve({
        dataUrl: canvas.toDataURL('image/png'),
        width,
        height: targetHeight,
      });
    };
    img.onerror = () => resolve(null);
    img.src = imageUrl;
  });
}

export const FAVICON_ICON_HEIGHTS = [16, 32, 48, 64, 96, 128, 192, 256, 512] as const;
export const FAVICON_APPLE_TOUCH_HEIGHT = 512;

export async function applyBrandFavicons(faviconUrl: string): Promise<() => void> {
  const created: HTMLLinkElement[] = [];

  const upsertLink = (rel: string, href: string, sizes: string) => {
    const selector = `link[rel="${rel}"][sizes="${sizes}"]`;
    let link = document.querySelector<HTMLLinkElement>(selector);
    if (!link) {
      link = document.createElement('link');
      link.rel = rel;
      link.setAttribute('sizes', sizes);
      document.head.appendChild(link);
      created.push(link);
    }
    link.type = 'image/png';
    link.href = href;
  };

  for (const height of FAVICON_ICON_HEIGHTS) {
    const raster = await rasterizeImageToHeight(faviconUrl, height);
    if (!raster) continue;
    upsertLink('icon', raster.dataUrl, `${raster.width}x${raster.height}`);
  }

  const touch = await rasterizeImageToHeight(faviconUrl, FAVICON_APPLE_TOUCH_HEIGHT);
  if (touch) {
    upsertLink('apple-touch-icon', touch.dataUrl, `${touch.width}x${touch.height}`);
  }

  if (created.length === 0) {
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
      created.push(link);
    }
    link.type = 'image/png';
    link.href = faviconUrl;
    link.removeAttribute('sizes');
  }

  return () => {
    for (const link of created) {
      link.remove();
    }
  };
}
