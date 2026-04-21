import apiService from './api';
import { LoginCredentials, LoginResponse, Rider, ApiResponse } from '../types';

class AuthService {
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    const response = await apiService.post<ApiResponse<any>>('/rider/login', credentials);
    if (!response.success) {
      throw new Error(response.message || 'Login failed');
    }
    // Map backend response { user, tokens } → app format { rider, token }
    const { user, tokens } = response.data;
    return {
      rider: {
        id: user.rider_id || user.id,
        name: user.full_name || user.name,
        phone: user.phone,
        email: user.email,
        isOnline: user.rider_status === 'available',
        status: user.rider_status === 'available' ? 'online' : 'offline',
        totalDeliveries: 0,
        totalEarnings: 0,
        todayDeliveries: 0,
        todayEarnings: 0,
      },
      token: tokens.accessToken || tokens.access_token,
    };
  }

  async getProfile(): Promise<Rider> {
    const response = await apiService.get<ApiResponse<any>>('/rider/profile');
    if (!response.success) {
      throw new Error(response.message || 'Failed to fetch profile');
    }
    const raw = response.data;
    return {
      id: raw.id,
      name: raw.full_name || raw.name || '',
      phone: raw.phone || '',
      email: raw.email || '',
      avatar: raw.avatar_url || raw.avatar || undefined,
      vehicleType: raw.vehicle_type || undefined,
      vehicleNumber: raw.vehicle_number || undefined,
      isOnline: raw.status === 'available',
      status: raw.status === 'available' ? 'online' : 'offline',
      totalDeliveries: parseInt(raw.total_deliveries) || 0,
      totalEarnings: parseFloat(raw.total_earnings) || 0,
      todayDeliveries: 0,
      todayEarnings: 0,
      rating: parseFloat(raw.rating) || undefined,
      cnic: raw.cnic || undefined,
    };
  }

  async updateOnlineStatus(isOnline: boolean): Promise<void> {
    const status = isOnline ? 'available' : 'offline';
    const response = await apiService.put<ApiResponse<void>>('/rider/status', { status });
    if (!response.success) {
      throw new Error(response.message || 'Failed to update status');
    }
  }

  async updateLocation(latitude: number, longitude: number, accuracy?: number): Promise<void> {
    const response = await apiService.put<ApiResponse<void>>('/rider/location', {
      latitude,
      longitude,
      accuracy,
      timestamp: Date.now(),
    });
    if (!response.success) {
      throw new Error(response.message || 'Failed to update location');
    }
  }

  async updateFCMToken(token: string): Promise<void> {
    const response = await apiService.put<ApiResponse<void>>('/rider/fcm-token', {
      token,
    });
    if (!response.success) {
      throw new Error(response.message || 'Failed to update FCM token');
    }
  }
}

export const authService = new AuthService();
export default authService;
