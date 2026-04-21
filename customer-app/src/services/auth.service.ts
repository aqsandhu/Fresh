import apiClient, { handleApiError } from './api';
import { ApiResponse, User } from '@types';

export interface SendOtpRequest {
  phone: string;
  channel?: 'sms' | 'whatsapp' | 'call';
}

export interface VerifyLoginRequest {
  phone: string;
  code: string;
}

export interface RegisterRequest {
  phone: string;
  code: string;
  full_name: string;
  email?: string;
  password?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface SendOtpResponse {
  phone: string;
  channel: string;
  userExists: boolean;
  userName: string | null;
}

export interface AuthResponse {
  user: User;
  tokens: AuthTokens;
}

class AuthService {
  async sendOtp(data: SendOtpRequest): Promise<ApiResponse<SendOtpResponse>> {
    try {
      const response = await apiClient.post('/auth/send-otp', data);
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  }

  async verifyLogin(data: VerifyLoginRequest): Promise<ApiResponse<AuthResponse>> {
    try {
      const response = await apiClient.post('/auth/verify-login', data);
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  }

  async register(data: RegisterRequest): Promise<ApiResponse<AuthResponse>> {
    try {
      const response = await apiClient.post('/auth/verify-register', data);
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  }

  async getProfile(): Promise<ApiResponse<User>> {
    try {
      const response = await apiClient.get('/auth/me');
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  }

  async updateProfile(data: Partial<User>): Promise<ApiResponse<User>> {
    try {
      const response = await apiClient.put('/auth/profile', data);
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  }

  async logout(): Promise<ApiResponse<{ message: string }>> {
    try {
      const response = await apiClient.post('/auth/logout');
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  }
}

export const authService = new AuthService();
export default authService;
