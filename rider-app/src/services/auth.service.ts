import apiService, { ApiError } from './api';
import { LoginCredentials, LoginResponse, Rider, ApiResponse, RiderStatus } from '../types';
import { toNumber, toNumberOrNull } from '../utils/helpers';

const RIDER_STATUSES: readonly RiderStatus[] = ['available', 'busy', 'offline', 'on_leave'];

const normalizeRiderStatus = (raw: unknown): RiderStatus => {
  const s = String(raw || '').toLowerCase();
  return (RIDER_STATUSES as readonly string[]).includes(s) ? (s as RiderStatus) : 'offline';
};

export const mapRiderProfile = (raw: any): Rider => ({
  id: String(raw.id ?? raw.rider_id ?? ''),
  userId: raw.user_id ?? undefined,
  name: raw.full_name || raw.name || '',
  phone: raw.phone || '',
  email: raw.email || undefined,
  avatarUrl: raw.avatar_url || raw.avatar || undefined,
  vehicleType: raw.vehicle_type || undefined,
  vehicleNumber: raw.vehicle_number || undefined,
  cnic: raw.cnic || undefined,
  status: normalizeRiderStatus(raw.status ?? raw.rider_status),
  verificationStatus: raw.verification_status || undefined,
  rating: toNumberOrNull(raw.rating) ?? undefined,
  ratingCount: toNumberOrNull(raw.rating_count) ?? undefined,
  totalDeliveries: toNumber(raw.total_deliveries),
  totalEarnings: toNumber(raw.total_earnings),
});

class AuthService {
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    const response = await apiService.post<ApiResponse<any>>('/rider/login', credentials);
    if (!response?.success || !response.data) {
      throw new ApiError(response?.message || 'Login failed', null);
    }
    const { user, tokens } = response.data;
    return {
      rider: mapRiderProfile({
        id: user.rider_id || user.id,
        user_id: user.id,
        full_name: user.full_name,
        phone: user.phone,
        email: user.email,
        status: user.rider_status,
      }),
      token: tokens.accessToken || tokens.access_token,
      refreshToken: tokens.refreshToken || tokens.refresh_token || null,
    };
  }

  async getProfile(): Promise<Rider> {
    const response = await apiService.get<ApiResponse<any>>('/rider/profile');
    if (!response?.success || !response.data) {
      throw new ApiError(response?.message || 'Failed to fetch profile', null);
    }
    return mapRiderProfile(response.data);
  }

  /** Best-effort server-side session revocation. */
  async logout(): Promise<void> {
    await apiService.post<ApiResponse<void>>('/auth/logout');
  }

  async updateDutyStatus(onDuty: boolean): Promise<void> {
    const response = await apiService.put<ApiResponse<void>>('/rider/status', {
      status: onDuty ? 'available' : 'offline',
    });
    if (!response?.success) {
      throw new ApiError(response?.message || 'Failed to update status', null);
    }
  }

  async updateLocation(latitude: number, longitude: number, accuracy?: number): Promise<void> {
    const response = await apiService.put<ApiResponse<void>>('/rider/location', {
      latitude,
      longitude,
      accuracy,
      timestamp: Date.now(),
    });
    if (!response?.success) {
      throw new ApiError(response?.message || 'Failed to update location', null);
    }
  }

  async registerPushToken(token: string): Promise<void> {
    const response = await apiService.put<ApiResponse<void>>('/rider/fcm-token', { token });
    if (!response?.success) {
      throw new ApiError(response?.message || 'Failed to register push token', null);
    }
  }
}

export const authService = new AuthService();
export default authService;
