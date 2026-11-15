// Every public page has its own title/description; products and categories
// take theirs (and the share image) from the API.
import { metaText, staticMetadata } from '@/lib/pageMetadata'
import { generateMetadata as productMeta } from '@/app/(shop)/product/[id]/layout'
import { generateMetadata as categoryMeta } from '@/app/(shop)/category/[slug]/layout'

const respond = (data: unknown, ok = true) =>
  jest.fn(async () => ({ ok, json: async () => ({ data }) })) as unknown as typeof fetch

afterEach(() => {
  ;(global as { fetch?: unknown }).fetch = jest.fn()
})

describe('product page metadata', () => {
  it('uses the product name, its description and image', async () => {
    global.fetch = respond({
      name_en: 'Tomato', name_ur: 'ٹماٹر', short_description: '<b>Red</b>   and fresh', primary_image: 'https://cdn.test/t.jpg',
    })
    const m = await productMeta({ params: Promise.resolve({ id: 'p1' }) })
    expect(m.title).toBe('Tomato (ٹماٹر)')
    expect(m.description).toBe('Red and fresh')
    expect(m.alternates?.canonical).toBe('/product/p1')
    expect(JSON.stringify(m.openGraph)).toContain('https://cdn.test/t.jpg')
  })

  it('falls back quietly when the API is down', async () => {
    global.fetch = jest.fn(async () => { throw new Error('down') }) as unknown as typeof fetch
    expect((await productMeta({ params: Promise.resolve({ id: 'p1' }) })).title).toBe('Product')
  })

  it('writes a description when the product has none', async () => {
    global.fetch = respond({ name_en: 'Onion', category_name: 'Vegetables' })
    const m = await productMeta({ params: Promise.resolve({ id: 'p2' }) })
    expect(m.description).toMatch(/Buy fresh Onion — Vegetables online/)
  })
})

it('category page metadata', async () => {
  global.fetch = respond({ name_en: 'Fruits', name_ur: 'پھل' })
  const m = await categoryMeta({ params: Promise.resolve({ slug: 'fruits' }) })
  expect(m.title).toBe('Fruits (پھل)')
  expect(m.alternates?.canonical).toBe('/category/fruits')
})

it('static pages and long text', () => {
  expect(staticMetadata('Search', 'x', { noindex: true }).robots).toEqual({ index: false, follow: true })
  expect(metaText('a'.repeat(200), 'f')).toHaveLength(158)
  expect(metaText('', 'fallback')).toBe('fallback')
})
