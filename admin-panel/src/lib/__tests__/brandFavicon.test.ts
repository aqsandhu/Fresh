// G38 (round C screen sweep): the admin page had no icon at all — every load
// asked for /favicon.ico (404 in the console). A built-in icon is declared now;
// the brand icon from Settings replaces it while shown and gives it back.
import { applyBrandFavicons } from '../brandFavicon';

class FakeImage {
  onload: null | (() => void) = null;
  onerror: null | (() => void) = null;
  naturalWidth = 100;
  naturalHeight = 100;
  crossOrigin = '';
  set src(_v: string) { setTimeout(() => this.onload?.(), 0); }
}

beforeAll(() => {
  (global as unknown as { Image: unknown }).Image = FakeImage;
  HTMLCanvasElement.prototype.getContext = jest.fn(() => ({ clearRect: jest.fn(), drawImage: jest.fn() })) as never;
  HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,x';
});

it('the built-in icon steps aside for the brand icon and comes back afterwards', async () => {
  document.head.innerHTML = '<link id="default-favicon" rel="icon" type="image/svg+xml" href="/favicon.svg">';
  const undo = await applyBrandFavicons('/brand.png');
  expect(document.getElementById('default-favicon')).toBeNull();
  expect(document.head.querySelectorAll('link[rel="icon"]').length).toBeGreaterThan(0);
  undo();
  expect(document.getElementById('default-favicon')).not.toBeNull();
  expect(document.head.querySelectorAll('link[rel="icon"]')).toHaveLength(1);
});
