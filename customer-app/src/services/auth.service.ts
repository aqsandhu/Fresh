import apiClient, { handleApiError } from './api';
import { ApiResponse, User } from '@app-types';

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
  /** Delivery channel the backend actually used ('whatsapp' | 'sms'). */
  channel?: 'whatsapp' | 'sms';
  userExists: boolean;
  userName: string | null;
  otpBypass?: boolean;
  /** 'bypass' | 'backend' | 'firebase' — which system verifies the code. */
  mode?: string;
  expiresInSec?: number;
  resendInSec?: number;
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

  /** Permanently delete the signed-in customer's account (store requirement). */
  async deleteAccount(): Promise<ApiResponse<{ message: string }>> {
    try {
      const response = await apiClient.post('/auth/delete-account');
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  }

  // ─── 4-digit PIN flow ─────────────────────────────────────────────────
  // Mirrors the website's authApi PIN methods (commit fe406cc on web).
  // After the one-time OTP at registration the customer logs in with a PIN
  // forever — no more SMS per session. Used by:
  //   - RegisterScreen (set PIN after OTP success)
  //   - LoginScreen (PIN-or-OTP based on /pin-status)
  //   - SettingsScreen → "Change PIN"
  //   - Checkout re-auth (when inactive)
  // The screens themselves still need to be wired up; that's tracked in the
  // sync-audit doc and will land when the customer-app's OTP path is also
  // migrated to Firebase.

  async pinStatus(phone: string): Promise<ApiResponse<{ exists: boolean; hasPin: boolean; fullName?: string }>> {
    try {
      const response = await apiClient.get('/auth/pin-status', { params: { phone } });
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  }

  async setPin(
    pin: string,
    currentPin?: string
  ): Promise<ApiResponse<{ ok: boolean; sessions_revoked?: boolean }>> {
    try {
      // Contract C2: { pin, current_pin? } — current_pin is REQUIRED by the
      // backend when the user already has a PIN set.
      const response = await apiClient.post('/auth/set-pin', {
        pin,
        ...(currentPin ? { current_pin: currentPin } : {}),
      });
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  }

  async verifyPin(phone: string, pin: string): Promise<ApiResponse<AuthResponse>> {
    try {
      const response = await apiClient.post('/auth/verify-pin', { phone, pin });
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  }

  async resetPin(idToken: string, newPin: string): Promise<ApiResponse<{ ok: boolean }>> {
    try {
      const response = await apiClient.post('/auth/reset-pin', { idToken, newPin });
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  }

  async resetPinWithCode(
    phone: string,
    code: string,
    newPin: string
  ): Promise<ApiResponse<{ ok: boolean }>> {
    try {
      const response = await apiClient.post('/auth/reset-pin', { phone, code, newPin });
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  }
}

export const authService = new AuthService();
export default authService;
