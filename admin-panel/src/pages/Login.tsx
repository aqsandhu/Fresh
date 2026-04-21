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
    
    if (!validateForm()) return;
    
    setIsLoading(true);
    try {
      await login({ phone, password });
      toast.success('Login successful!');
      const redirectTo = searchParams.get('redirect') || '/admin/dashboard';
      navigate(redirectTo);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Login failed');
    } finally {
      setIsLoading(false);
    }
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
              <a href="#" className="text-primary-600 hover:text-primary-700 font-medium">
                Forgot password?
              </a>
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
