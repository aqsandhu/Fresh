import { pktDateString, pktDisplayDate, pktWallClock } from '@/lib/businessDate'

describe('Pakistan business date', () => {
  afterEach(() => jest.useRealTimers())

  it('uses the new PKT day between midnight and 5am PKT', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-10T20:30:00.000Z'))
    expect(pktDateString('today')).toBe('2026-07-11')
    expect(pktDateString('tomorrow')).toBe('2026-07-12')
    expect(pktDisplayDate('today')).toBe('Sat, 11 Jul')
    expect(pktWallClock().getHours()).toBe(1)
  })
})
