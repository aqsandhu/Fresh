// A39 (round 9): the delivery-area check now also runs on the server, so its
// point-in-polygon rule is tested here (it had no tests).
import { pointInPolygon, isValidPolygonRing, type LngLat } from '@/utils/geo';

// A square around Gujrat city centre (lng, lat).
const square: LngLat[] = [[74.0, 32.5], [74.1, 32.5], [74.1, 32.6], [74.0, 32.6]];
// A concave "L" shape.
const ell: LngLat[] = [[0, 0], [4, 0], [4, 1], [1, 1], [1, 4], [0, 4]];

describe('pointInPolygon', () => {
  it('inside / outside a square', () => {
    expect(pointInPolygon([74.05, 32.55], square)).toBe(true);
    expect(pointInPolygon([74.2, 32.55], square)).toBe(false);
    expect(pointInPolygon([74.05, 32.7], square)).toBe(false);
  });
  it('the notch of a concave shape is outside', () => {
    expect(pointInPolygon([0.5, 3], ell)).toBe(true);
    expect(pointInPolygon([3, 0.5], ell)).toBe(true);
    expect(pointInPolygon([3, 3], ell)).toBe(false);
  });
  it('a closed ring (first point repeated) gives the same answers', () => {
    const closed: LngLat[] = [...square, square[0]];
    expect(pointInPolygon([74.05, 32.55], closed)).toBe(true);
    expect(pointInPolygon([74.2, 32.55], closed)).toBe(false);
  });
  it('lat/lng swapped is a different place (guards the [lng, lat] order)', () => {
    expect(pointInPolygon([32.55, 74.05], square)).toBe(false);
  });
  it('fewer than 3 points is never inside', () => {
    expect(pointInPolygon([0, 0], [[0, 0], [1, 1]] as LngLat[])).toBe(false);
  });
});

describe('isValidPolygonRing', () => {
  it('accepts a proper ring and refuses bad input', () => {
    expect(isValidPolygonRing(square)).toBe(true);
    expect(isValidPolygonRing([[0, 0], [1, 1]])).toBe(false);
    expect(isValidPolygonRing([[0, 0], [1, 1], [200, 1]])).toBe(false);
    expect(isValidPolygonRing([[0, 0], [1, 1], ['a', 1]])).toBe(false);
  });
});
