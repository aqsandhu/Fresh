// W17 (round 10): the browser image helpers — door photos are shrunk to at
// most 1600 px on a white background (a huge phone photo drew BLACK on iOS) and
// saved as .jpg, the square crop takes the centre; the brand favicon is drawn
// at every icon size, or used as is when it cannot be drawn.
import { compressDoorPhoto, cropCenterSquareDoorPhoto, processDoorPhoto } from '@/lib/doorPhoto'
import { applyBrandFavicons, FAVICON_ICON_HEIGHTS, rasterizeImageToHeight } from '@/lib/brandFavicon'

const img = { w: 4000, h: 3000, fail: false }
class FakeImage {
  onload: null | (() => unknown) = null
  onerror: null | (() => unknown) = null
  crossOrigin = ''
  naturalWidth = 0
  naturalHeight = 0
  width = 0
  height = 0
  decode = jest.fn(async () => undefined)
  set src(_v: string) {
    this.naturalWidth = img.w
    this.naturalHeight = img.h
    setTimeout(() => (img.fail ? this.onerror?.() : this.onload?.()), 0)
  }
}
const ctx = { fillRect: jest.fn(), drawImage: jest.fn(), clearRect: jest.fn(), fillStyle: '' }
let noCanvas = false
let noBlob = false

beforeAll(() => {
  ;(global as unknown as { Image: unknown }).Image = FakeImage
  URL.createObjectURL = jest.fn(() => 'blob:x')
  URL.revokeObjectURL = jest.fn()
  HTMLCanvasElement.prototype.getContext = jest.fn(() => (noCanvas ? null : ctx)) as never
  HTMLCanvasElement.prototype.toBlob = function (cb: (b: Blob | null) => void) { cb(noBlob ? null : new Blob(['x'], { type: 'image/jpeg' })) }
  HTMLCanvasElement.prototype.toDataURL = function (this: HTMLCanvasElement) { return `data:${this.width}x${this.height}` }
})
beforeEach(() => {
  Object.assign(img, { w: 4000, h: 3000, fail: false })
  noCanvas = false
  noBlob = false
  ctx.drawImage.mockClear()
  document.head.innerHTML = ''
})

const photo = () => new File(['x'], 'IMG_1.HEIC.png', { type: 'image/png' })

describe('door photo', () => {
  it('a huge photo is shrunk to 1600 px, on white, saved as .jpg', async () => {
    const out = await compressDoorPhoto(photo())
    expect(out.name).toBe('IMG_1.HEIC.jpg')
    expect(out.type).toBe('image/jpeg')
    expect(ctx.fillStyle).toBe('#ffffff')
    expect(ctx.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 4000, 3000, 0, 0, 1600, 1200)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x')
  })

  it('the square crop takes the centre', async () => {
    img.w = 3000; img.h = 1000
    await processDoorPhoto(photo(), true)
    expect(ctx.drawImage).toHaveBeenCalledWith(expect.anything(), 1000, 0, 1000, 1000, 0, 0, 1000, 1000)
    await processDoorPhoto(photo(), false)
    expect(ctx.drawImage).toHaveBeenLastCalledWith(expect.anything(), 0, 0, 3000, 1000, 0, 0, 1600, 533)
  })

  it('an unreadable photo, an empty one, no canvas or no encoder → a clear error', async () => {
    img.fail = true
    await expect(compressDoorPhoto(photo())).rejects.toThrow('Could not load image')
    img.fail = false; img.w = 0; img.h = 0
    await expect(cropCenterSquareDoorPhoto(photo())).rejects.toThrow('Invalid image')
    img.w = 10; img.h = 10; noCanvas = true
    await expect(compressDoorPhoto(photo())).rejects.toThrow('Canvas not supported')
    noCanvas = false; noBlob = true
    await expect(compressDoorPhoto(photo())).rejects.toThrow('Could not encode image')
  })
})

describe('brand favicon', () => {
  it('drawn at a height with the width from the shape', async () => {
    img.w = 200; img.h = 100
    await expect(rasterizeImageToHeight('/logo.png', 32)).resolves.toEqual({ dataUrl: 'data:64x32', width: 64, height: 32 })
    noCanvas = true
    await expect(rasterizeImageToHeight('/logo.png', 32)).resolves.toBeNull()
  })

  it('every icon size + the Apple touch icon; removing puts the page back', async () => {
    img.w = 100; img.h = 100
    const undo = await applyBrandFavicons('/logo.png')
    expect(document.head.querySelectorAll('link[rel="icon"]')).toHaveLength(FAVICON_ICON_HEIGHTS.length)
    expect(document.head.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('sizes')).toBe('512x512')
    undo()
    expect(document.head.querySelectorAll('link')).toHaveLength(0)
  })

  it('an image that cannot be drawn is used as the icon directly', async () => {
    img.fail = true
    const undo = await applyBrandFavicons('/logo.svg')
    const link = document.head.querySelector('link[rel="icon"]') as HTMLLinkElement
    expect(link.href).toContain('/logo.svg')
    expect(link.hasAttribute('sizes')).toBe(false)
    undo()
    const existing = document.createElement('link')
    existing.rel = 'icon'
    document.head.appendChild(existing)
    await applyBrandFavicons('/logo2.svg')
    expect(document.head.querySelectorAll('link[rel="icon"]')).toHaveLength(1)
    expect(existing.href).toContain('/logo2.svg')
  })
})
