// The status dialog offers only the moves the SERVER allows. This keeps the
// panel's map in step with backend/src/utils/orderStatus.ts — if someone
// changes one and not the other, the dialog would again offer a status the
// server refuses (or hide one it accepts).
import fs from 'fs';
import path from 'path';
import { NEXT_ORDER_STATUSES } from '@/lib/orderStatus';

function serverTransitions(): Record<string, string[]> {
  const file = path.join(__dirname, '..', '..', '..', '..', 'backend', 'src', 'utils', 'orderStatus.ts');
  const src = fs.readFileSync(file, 'utf8');
  const start = src.indexOf('ORDER_STATUS_TRANSITIONS');
  const body = src.slice(src.indexOf('{', start) + 1, src.indexOf('};', start));
  const map: Record<string, string[]> = {};
  for (const m of body.matchAll(/^\s*([a-z_]+):\s*\[([^\]]*)\]/gm)) {
    map[m[1]] = m[2].split(',').map((s) => s.trim().replace(/['"]/g, '')).filter(Boolean);
  }
  return map;
}

describe('order status dialog', () => {
  it('offers exactly the moves the server allows (refunds go through the complaint flow, not this dialog)', () => {
    const server = serverTransitions();
    expect(Object.keys(server).length).toBeGreaterThanOrEqual(7);
    for (const [from, to] of Object.entries(NEXT_ORDER_STATUSES)) {
      expect({ from, to: [...to].sort() }).toEqual({ from, to: (server[from] || []).filter((s) => s !== 'refunded').sort() });
    }
  });

  it('a finished order has no further move', () => {
    expect(NEXT_ORDER_STATUSES.delivered).toEqual([]);
    expect(NEXT_ORDER_STATUSES.cancelled).toEqual([]);
    expect(NEXT_ORDER_STATUSES.out_for_delivery).toEqual(['delivered']);
  });
});
