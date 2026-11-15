import { scrubBreadcrumb, scrubEvent, scrubText } from '@/lib/sentryScrub'

describe('Sentry scrub (admin)', () => {
  it('hides phone numbers and secret query values', () => {
    expect(scrubText('/api/users?search=03001234567&page=2')).toBe('/api/users?search=***&page=2')
    expect(scrubText('/login?phone=%2B923001234567&next=/cart')).toBe('/login?phone=***&next=/cart')
    expect(scrubText('order ORD-1001 for +92 300 1234567')).toBe('order ORD-1001 for ***')
    expect(scrubText('id 3a1b2c3d-4e5f-4a7b-8c9d-930012345678')).toBe('id 3a1b2c3d-4e5f-4a7b-8c9d-930012345678')
  })

  it('scrubs events and breadcrumbs', () => {
    const e = scrubEvent({
      type: undefined,
      message: 'no account for 03001234567',
      exception: { values: [{ value: 'POST /api/auth?otp=123789 failed' }] },
      request: { url: 'https://shop.test/track?phone=03001234567' },
      breadcrumbs: [{ category: 'fetch', data: { url: '/api/x?search=03001234567' } }],
    })
    expect(JSON.stringify(e)).not.toMatch(/3001234567|123789/)
    expect(scrubBreadcrumb({ message: 'typed 03001234567' }).message).toBe('typed ***')
  })

  it('console breadcrumbs lose their raw arguments; tokens, JSON secrets and emails are hidden', () => {
    const axiosLike = { message: 'Request failed', config: { headers: { Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJ4In0.sig' }, data: '{"phone":"03001234567","password":"Admin12345"}' } }
    const b = scrubBreadcrumb({ category: 'console', message: 'login failed {"password":"Admin12345"} for ali.khan@gmail.com', data: { arguments: ['login failed', axiosLike], logger: 'console' } })
    const text = JSON.stringify(b)
    expect(text).not.toMatch(/Admin12345|eyJhbGci|3001234567|ali\.khan/)
    expect(b.data).toEqual({ logger: 'console' })
    const e = scrubEvent({ type: undefined, extra: { body: '{"pin":"4826"}' }, request: { headers: { Authorization: 'Bearer abc.def', 'User-Agent': 'x' } } })
    expect(JSON.stringify(e)).not.toMatch(/4826|abc\.def/)
    expect(e.request?.headers?.['User-Agent']).toBe('x')
  })
})
