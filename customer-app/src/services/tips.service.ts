import apiClient, { handleApiError } from './api';
import { withCityParams } from '@/lib/apiHelpers';

class TipsService {
  /** Active guidance tips for a page (admin-managed, global + city). */
  async forPage(page: string): Promise<string[]> {
    try {
      const res = await apiClient.get('/tips', { params: withCityParams({ page }) });
      const rows = (res.data?.data || []) as { id: string; text: string }[];
      return rows.map((r) => r.text);
    } catch (error) {
      throw handleApiError(error);
    }
  }
}

export const tipsService = new TipsService();
export default tipsService;
