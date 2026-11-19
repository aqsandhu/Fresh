// A34 (round 7): three fast clicks on "Refund" booked three refunds. The panel
// now sends an identical write that is already on its way only once.
jest.mock('react-hot-toast', () => ({ __esModule: true, default: { success: jest.fn(), error: jest.fn() } }));

import { sendWriteOnce } from '@/services/api';

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

it('a triple click sends one request and every click gets its answer', async () => {
  const d = deferred<string>();
  const send = jest.fn(() => d.promise);
  const body = { amount: 300, reason: 'damaged' };
  const calls = [1, 2, 3].map(() => sendWriteOnce('POST', '/admin/complaints/c1/refund', body, send));
  expect(send).toHaveBeenCalledTimes(1);
  d.resolve('Refund recorded');
  await expect(Promise.all(calls)).resolves.toEqual(['Refund recorded', 'Refund recorded', 'Refund recorded']);
});

it('once the first finishes, a new identical request is sent again (a real second refund)', async () => {
  const send = jest.fn(async () => 'ok');
  await sendWriteOnce('POST', '/x', { a: 1 }, send);
  await sendWriteOnce('POST', '/x', { a: 1 }, send);
  expect(send).toHaveBeenCalledTimes(2);
});

it('different bodies or URLs are separate requests', async () => {
  const d = deferred<string>();
  const send = jest.fn(() => d.promise);
  sendWriteOnce('POST', '/x', { amount: 300 }, send);
  sendWriteOnce('POST', '/x', { amount: 400 }, send);
  sendWriteOnce('POST', '/y', { amount: 300 }, send);
  expect(send).toHaveBeenCalledTimes(3);
  d.resolve('done');
});

it('a failure is shared too, and the next try goes out', async () => {
  const d = deferred<string>();
  const send = jest.fn(() => d.promise);
  const a = sendWriteOnce('POST', '/z', { n: 1 }, send);
  const b = sendWriteOnce('POST', '/z', { n: 1 }, send);
  d.reject(new Error('400'));
  await expect(a).rejects.toThrow('400');
  await expect(b).rejects.toThrow('400');
  await sendWriteOnce('POST', '/z', { n: 1 }, async () => 'ok');
});

it('file uploads are never merged', async () => {
  const send = jest.fn(async () => 'ok');
  const f = new FormData();
  await Promise.all([sendWriteOnce('POST', '/f', f, send), sendWriteOnce('POST', '/f', f, send)]);
  expect(send).toHaveBeenCalledTimes(2);
});
