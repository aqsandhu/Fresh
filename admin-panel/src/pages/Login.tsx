import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { useAuthContext } from '@/context/AuthContext';
import { authService } from '@/services/auth.service';
import { canAccessRoute, firstAccessibleRoute, safeAdminRedirect } from '@/lib/permissions';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import toast from 'react-hot-toast';
import type { LoginOtpChallenge } from '@/types';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuthContext();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ phone?: string; password?: string }>({});
  // Two-step login: set once the password is accepted and the server asks
  // for the one-time code.
  const [challenge, setChallenge] = useState<LoginOtpChallenge | null>(null);
  const [otp, setOtp] = useState('');

  const validateForm = (): boolean => {
    const newErrors: { phone?: string; password?: string } = {};
    
    if (!phone) {
      newErrors.phone = 'Phone number is required';
    } else if (!/^(\+92|0)[0-9]{10}$/.test(phone.replace(/[\s-]/g, ''))) {
      newErrors.phone = 'Please enter a valid Pakistani phone number';
    }
    
    if (!password) {
      newErrors.password = 'Password is required';
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    if (challenge && !/^\d{4,8}$/.test(otp.trim())) {
      toast.error('Enter the verification code');
      return;
    }
    
    setIsLoading(true);
    try {
      const result = await login(challenge ? { phone, password, otp: otp.trim() } : { phone, password });
      if (result && result.requiresOtp) {
        setChallenge(result);
        setOtp('');
        return;
      }
      toast.success('Login successful!');
      const user = authService.getCurrentUser();
      const redirectParam = safeAdminRedirect(searchParams.get('redirect'));
      const dest =
        redirectParam && canAccessRoute(redirectParam, user?.permissions)
          ? redirectParam
          : firstAccessibleRoute(user?.permissions) || '/admin/no-access';
      navigate(dest);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Login failed';
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo & Title */}
        <div className="flex flex-col items-center mb-8">
          <BrandLogo size="lg" className="mb-3" />
          <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
          <p className="text-gray-600 mt-1">Pakistani Grocery Delivery</p>
        </div>

        {/* Login Form */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Welcome Back</h2>
          
          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              label="Phone Number"
              type="tel"
              placeholder="+923001234567"
              value={phone}
              onChange={(e) => { setPhone(e.target.value); setChallenge(null); }}
              error={errors.phone}
              required
            />
            
            <div className="relative">
              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setChallenge(null); }}
                error={errors.password}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-[34px] text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>

            {/* "Remember me" / "Forgot password?" were removed — neither was
                wired to anything (href="#", uncontrolled checkbox). Re-add when
                a real password-reset flow exists. */}

            {challenge && (
              <div className="rounded-lg border border-primary-200 bg-primary-50 p-3 space-y-2">
                <p className="text-sm text-gray-800">
                  {challenge.otpBypass
                    ? 'Password accepted. Enter the verification code to finish signing in.'
                    : `Password accepted. We sent a code to ${challenge.phoneHint || 'your phone'}${challenge.channel ? ` by ${challenge.channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}` : ''}.`}
                </p>
                <Input
                  label="Verification Code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="6-digit code"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  autoFocus
                  required
                />
                {challenge.resendIn ? (
                  <p className="text-xs text-gray-500">A code was sent a moment ago and is still valid.</p>
                ) : null}
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              isLoading={isLoading}
              size="lg"
            >
              {challenge ? 'Verify & Sign In' : 'Sign In'}
            </Button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-gray-600 mt-8">
          © {new Date().getFullYear()} Fresh Bazar. All rights reserved.
        </p>
      </div>
    </div>
  );
};
