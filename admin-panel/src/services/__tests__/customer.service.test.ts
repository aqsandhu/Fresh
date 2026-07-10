import { mockApi, resetApiMocks } from './testApiMock';

jest.mock('@/services/api', () => require('./testApiMock').apiModuleMock());

import { customerService } from '@/services/customer.service';

describe('customerService', () => {
  beforeEach(() => resetApiMocks());

  it('getCustomers passes filters and normalizes the shape', async () => {
    mockApi.get.mockResolvedValue({
      success: true,
      data: { customers: [{ id: 'c1' }], pagination: { page: 1, total: 1 } },
    });

    const result = await customerService.getCustomers({ search: 'ali' } as never);

    expect(mockApi.get).toHaveBeenCalledWith('/admin/customers', { search: 'ali' });
    expect(result.customers).toEqual([{ id: 'c1' }]);
    expect(result.pagination).toEqual({ page: 1, total: 1 });
  });

  it('getCustomers returns safe defaults when the payload is empty', async () => {
    mockApi.get.mockResolvedValue({ success: true, data: {} });

    const result = await customerService.getCustomers();

    expect(result.customers).toEqual([]);
    expect(result.pagination).toEqual({ page: 1, limit: 20, total: 0, totalPages: 0 });
  });

  it('getCustomerById unwraps the customer', async () => {
    mockApi.get.mockResolvedValue({ success: true, data: { id: 'c2', fullName: 'Sara' } });

    expect(await customerService.getCustomerById('c2')).toEqual({ id: 'c2', fullName: 'Sara' });
    expect(mockApi.get).toHaveBeenCalledWith('/admin/customers/c2');
  });

  it('getCustomerAddresses hits the nested addresses endpoint', async () => {
    mockApi.get.mockResolvedValue({ success: true, data: [{ id: 'a1' }] });

    expect(await customerService.getCustomerAddresses('c2')).toEqual([{ id: 'a1' }]);
    expect(mockApi.get).toHaveBeenCalledWith('/admin/customers/c2/addresses');
  });

  it('maps backend failures to friendly errors', async () => {
    mockApi.get.mockRejectedValue({ response: { data: { message: 'city scope denied' } } });
    await expect(customerService.getCustomers()).rejects.toThrow('city scope denied');

    mockApi.get.mockRejectedValue(new Error('socket hang up'));
    await expect(customerService.getCustomerById('c1')).rejects.toThrow('Failed to fetch customer');
  });
});
