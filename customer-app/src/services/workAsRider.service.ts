import apiClient, { handleApiError } from './api';
import { withCityParams } from '@/lib/apiHelpers';

export interface WorkAsRiderContent {
  intro: string;
  benefits: string;
  hours: string;
  terms: string;
}

export interface RiderApplicationInput {
  fullName: string;
  phone: string;
  city?: string;
  area?: string;
  vehicleType?: string;
  message?: string;
}

class WorkAsRiderService {
  async getContent(): Promise<WorkAsRiderContent> {
    try {
      const res = await apiClient.get('/work-as-rider');
      return (res.data?.data || res.data) as WorkAsRiderContent;
    } catch (error) {
      throw handleApiError(error);
    }
  }

  async apply(input: RiderApplicationInput): Promise<void> {
    try {
      await apiClient.post('/work-as-rider/apply', input, { params: withCityParams() });
    } catch (error) {
      throw handleApiError(error);
    }
  }
}

export const workAsRiderService = new WorkAsRiderService();
export default workAsRiderService;
