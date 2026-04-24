import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Store, Eye, EyeOff } from 'lucide-react';
import { useAuthContext } from '@/context/AuthContext';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import toast from 'react-hot-toast';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuthContext();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ phone?: string; password?: string }>({});

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
    setLoginError(null);
    
    if (!validateForm()) return;
    
    setIsLoading(true);
    try {
      await login({ phone, password });
      toast.success('Login successful!');
      const redirectTo = searchParams.get('redirect') || '/admin/dashboard';
      navigate(redirectTo);
    } catch (error: any) {
      // API interceptor already shows toast for network/server errors.
      // Show inline error for auth/validation failures to avoid double notifications.
      const status = error?.response?.status;
      const msg = error?.response?.data?.message || error?.message || 'Login failed. Please try again.';
      if (status === 401 || status === 403 || status === 422) {
        setLoginError(msg);
      }
      // For 500+ errors, the api interceptor already shows a toast, so we only set inline state
      if (!status || status >= 500) {
        setLoginError('Server error. Please try again later.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = (e: React.MouseEvent) => {
    e.preventDefault();
    toast('Please contact your administrator to reset your password.', {
      icon: '🔒',
      duration: 5000,
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-600 rounded-2xl mb-4">
            <Store className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
          <p className="text-gray-600 mt-1">Pakistani Grocery Delivery</p>
        </div>

        {/* Login Form */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Welcome Back</h2>
          
          <form onSubmit={handleSubmit} className="space-y-5">
            {loginError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 animate-fadeIn">
                {loginError}
              </div>
            )}
            <Input
              label="Phone Number"
              type="tel"
              placeholder="+923001234567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              error={errors.phone}
              required
            />
            
            <div className="relative">
              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center">
                <input type="checkbox" className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                <span className="ml-2 text-gray-600">Remember me</span>
              </label>
              <button
                type="button"
                onClick={handleForgotPassword}
                className="text-primary-600 hover:text-primary-700 font-medium"
              >
                Forgot password?
              </button>
            </div>

            <Button
              type="submit"
              className="w-full"
              isLoading={isLoading}
              size="lg"
            >
              Sign In
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-500">
            <p>Demo credentials:</p>
            <p className="font-mono mt-1">+923001234567 / admin123</p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-gray-600 mt-8">
          © 2024 Fresh Bazar. All rights reserved.
        </p>
      </div>
    </div>
  );
};
