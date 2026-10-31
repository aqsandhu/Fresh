import { mockApi, resetApiMocks } from './testApiMock';

jest.mock('@/services/api', () => require('./testApiMock').apiModuleMock());

import { riderService } from '@/services/rider.service';

describe('riderService', () => {
  beforeEach(() => resetApiMocks());

  it('getRiders returns the riders array and passes the status filter', async () => {
    mockApi.get.mockResolvedValue({ success: true, data: { riders: [{ id: 'r1' }], pagination: {} } });

    const riders = await riderService.getRiders('available');

    expect(mockApi.get).toHaveBeenCalledWith('/admin/riders', { status: 'available' });
    expect(riders).toEqual([{ id: 'r1' }]);
  });

  it('getRiders omits params when no status given and defaults to []', async () => {
    mockApi.get.mockResolvedValue({ success: true, data: {} });

    const riders = await riderService.getRiders();

    expect(mockApi.get).toHaveBeenCalledWith('/admin/riders', undefined);
    expect(riders).toEqual([]);
  });

  it('getRiders maps failures to a friendly error', async () => {
    mockApi.get.mockRejectedValue({ response: { data: { message: 'nope' } } });
    await expect(riderService.getRiders()).rejects.toThrow('nope');
  });

  it('createRider posts multipart form data', async () => {
    mockApi.postForm.mockResolvedValue({ success: true, data: { id: 'r2' } });
    const form = new FormData();
    form.append('full_name', 'Rider Two');

    const rider = await riderService.createRider(form);

    expect(mockApi.postForm).toHaveBeenCalledWith('/admin/riders', form);
    expect(rider).toEqual({ id: 'r2' });
  });

  it('updateRider PUTs multipart form data to the rider id', async () => {
    mockApi.putForm.mockResolvedValue({ success: true, data: { id: 'r2' } });
    const form = new FormData();

    await riderService.updateRider('r2', form);

    expect(mockApi.putForm).toHaveBeenCalledWith('/admin/riders/r2', form);
  });

  it('getRiderById throws on an empty envelope', async () => {
    mockApi.get.mockResolvedValue({ success: true });

    await expect(riderService.getRiderById('r9')).rejects.toThrow();
  });

  it('getRiders sends filters (search, verification, online, limit) as query params', async () => {
    mockApi.get.mockResolvedValue({ success: true, data: { riders: [], pagination: {} } });

    await riderService.getRiders({ verificationStatus: 'verified', search: ' ali ', online: true, limit: 500 });

    expect(mockApi.get).toHaveBeenCalledWith('/admin/riders', {
      verificationStatus: 'verified',
      search: 'ali',
      online: 'true',
      limit: 500,
    });
  });

  it('getRiderTasks asks for the requested scope and page', async () => {
    mockApi.get.mockResolvedValue({ success: true, data: { tasks: [{ id: 't1' }], pagination: { page: 2, total: 31, totalPages: 2 } } });

    const out = await riderService.getRiderTasks('r1', 'history', 2);

    expect(mockApi.get).toHaveBeenCalledWith('/admin/riders/r1/tasks', { scope: 'history', page: 2, limit: 30 });
    expect(out.tasks).toEqual([{ id: 't1' }]);
    expect(out.pagination.totalPages).toBe(2);
  });

  it('verifyRider sends the block status', async () => {
    mockApi.patch.mockResolvedValue({ success: true, data: { id: 'r1', verificationStatus: 'rejected' } });

    await riderService.verifyRider('r1', 'rejected');

    expect(mockApi.patch).toHaveBeenCalledWith('/admin/riders/r1/verify', { verificationStatus: 'rejected' });
  });
});
