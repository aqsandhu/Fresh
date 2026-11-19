import { isOptimisableImage, optimizedImageSrc } from '@/lib/optimizedImage'

// Live site, 20 Nov: the admin's hero (4 MB), logo (656 KB) and favicon
// (610 KB) were downloaded as uploaded — 5.3 of the home page's 6.1 MB.
describe('optimizedImageSrc', () => {
  const up = 'https://abcxyz.supabase.co/storage/v1/object/public/uploads/hero/a b.jpeg'

  it('sends an allowed host through Next’s resizer', () => {
    expect(isOptimisableImage(up)).toBe(true)
    expect(optimizedImageSrc(up, 256)).toBe(`/_next/image?url=${encodeURIComponent(up)}&w=256&q=75`)
    expect(isOptimisableImage('https://images.unsplash.com/photo-1?w=800')).toBe(true)
  })

  it('leaves anything else alone (other hosts, http, data:, relative, empty)', () => {
    for (const u of ['https://cdn.example.com/a.png', 'http://abcxyz.supabase.co/a.png', 'data:image/png;base64,AAAA', '/logo.png', '']) {
      expect(optimizedImageSrc(u, 256)).toBe(u)
    }
    expect(isOptimisableImage(null)).toBe(false)
    expect(isOptimisableImage('https://evil-supabase.co.example.com/a.png')).toBe(false)
  })
})
