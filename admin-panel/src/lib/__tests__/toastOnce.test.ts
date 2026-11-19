// The API client and the form both report a failed request: the same text
// must show once (same toast id), not as two stacked red toasts.
jest.mock('react-hot-toast', () => {
  const error = jest.fn();
  const success = jest.fn();
  return { __esModule: true, default: { error, success } };
});
import toast from 'react-hot-toast';

it('the same message gets the same toast id; a caller id is kept', () => {
  const originalError = (toast as unknown as { error: jest.Mock }).error;
  const { installToastOnce } = require('@/lib/toastOnce');
  installToastOnce();
  toast.error('Only the super admin can add a city.');
  toast.error('Only the super admin can add a city.');
  toast.error('x', { id: 'mine' });
  expect(originalError.mock.calls[0][1]).toEqual({ id: 'error:Only the super admin can add a city.' });
  expect(originalError.mock.calls[1][1]).toEqual({ id: 'error:Only the super admin can add a city.' });
  expect(originalError.mock.calls[2][1]).toEqual({ id: 'mine' });
});
