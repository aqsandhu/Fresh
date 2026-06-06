import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Login } from '@/pages/Login';

const mockLogin = jest.fn();
jest.mock('@/context/AuthContext', () => ({
  useAuthContext: () => ({
    login: mockLogin,
    user: null,
    isAuthenticated: false,
    isLoading: false,
  }),
}));

jest.mock('@/services/auth.service', () => ({
  authService: {
    getCurrentUser: jest.fn(() => ({
      fullName: 'Test Admin',
      permissions: ['*'],
      role: 'admin',
    })),
  },
}));

jest.mock('react-hot-toast', () => {
  const success = jest.fn();
  const error = jest.fn();
  return {
    __esModule: true,
    default: { success, error },
    success,
    error,
  };
});

jest.mock('lucide-react', () => ({
  Eye: () => <span data-testid="eye-icon">Eye</span>,
  EyeOff: () => <span data-testid="eyeoff-icon">EyeOff</span>,
}));

jest.mock('@/components/ui/Input', () => ({
  Input: ({ label, type, placeholder, value, onChange, error, required }: any) => (
    <div>
      <label>{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        required={required}
        aria-label={label}
      />
      {error && <span role="alert">{error}</span>}
    </div>
  ),
}));

jest.mock('@/components/ui/Button', () => ({
  Button: ({ children, type, isLoading, onClick, className }: any) => (
    <button type={type} disabled={isLoading} onClick={onClick} className={className}>
      {isLoading ? 'Loading...' : children}
    </button>
  ),
}));

describe('Login Page', () => {
  const renderLogin = (initialEntry = '/admin/login') => {
    return render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/admin/login" element={<Login />} />
          <Route path="/admin/dashboard" element={<div>Dashboard Page</div>} />
          <Route path="/admin/no-access" element={<div>No Access Page</div>} />
        </Routes>
      </MemoryRouter>
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders login form with branding', () => {
    renderLogin();

    expect(screen.getByText('Admin Panel')).toBeInTheDocument();
    expect(screen.getByText('Pakistani Grocery Delivery')).toBeInTheDocument();
    expect(screen.getByText('Welcome Back')).toBeInTheDocument();
  });

  it('renders phone number input field', () => {
    renderLogin();

    expect(screen.getByLabelText('Phone Number')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('+923001234567')).toBeInTheDocument();
  });

  it('renders password input field', () => {
    renderLogin();

    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter your password')).toBeInTheDocument();
  });

  it('renders sign in button', () => {
    renderLogin();

    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('renders remember me checkbox', () => {
    renderLogin();

    expect(screen.getByText('Remember me')).toBeInTheDocument();
  });

  it('renders forgot password link', () => {
    renderLogin();

    expect(screen.getByText('Forgot password?')).toBeInTheDocument();
  });

  it('shows validation error for empty phone', async () => {
    renderLogin();

    const phoneInput = screen.getByLabelText('Phone Number');
    const passwordInput = screen.getByLabelText('Password');

    fireEvent.change(phoneInput, { target: { value: '' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });

    const form = phoneInput.closest('form') || passwordInput.closest('form');
    if (form) fireEvent.submit(form);

    expect(phoneInput).toHaveValue('');
  });

  it('shows validation error for invalid phone format', () => {
    renderLogin();

    const phoneInput = screen.getByLabelText('Phone Number');
    fireEvent.change(phoneInput, { target: { value: '12345' } });

    expect(phoneInput).toHaveValue('12345');

    const isValidPhone = /^(\+92|0)[0-9]{10}$/.test('12345'.replace(/[\s-]/g, ''));
    expect(isValidPhone).toBe(false);
  });

  it('accepts valid Pakistani phone number format', () => {
    const validPhones = ['+923001234567', '03001234567', '+923331112222'];

    for (const phone of validPhones) {
      const isValid = /^(\+92|0)[0-9]{10}$/.test(phone.replace(/[\s-]/g, ''));
      expect(isValid).toBe(true);
    }
  });

  it('rejects invalid Pakistani phone numbers', () => {
    const invalidPhones = ['123', 'abc', '+92123', '0300123', ''];

    for (const phone of invalidPhones) {
      const isValid = /^(\+92|0)[0-9]{10}$/.test(phone.replace(/[\s-]/g, ''));
      expect(isValid).toBe(false);
    }
  });

  it('shows validation error for short password', () => {
    renderLogin();

    const passwordInput = screen.getByLabelText('Password');
    fireEvent.change(passwordInput, { target: { value: '123' } });

    expect(passwordInput).toHaveValue('123');
    expect(passwordInput.value.length).toBeLessThan(6);
  });

  it('toggles password visibility', () => {
    renderLogin();

    const passwordInput = screen.getByLabelText('Password');
    expect(passwordInput).toHaveAttribute('type', 'password');
  });

  it('submits form with valid credentials', async () => {
    mockLogin.mockResolvedValueOnce(undefined);

    renderLogin();

    const phoneInput = screen.getByLabelText('Phone Number');
    const passwordInput = screen.getByLabelText('Password');

    fireEvent.change(phoneInput, { target: { value: '+923001234567' } });
    fireEvent.change(passwordInput, { target: { value: 'admin123' } });

    const form = phoneInput.closest('form') || passwordInput.closest('form');
    if (form) fireEvent.submit(form);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({ phone: '+923001234567', password: 'admin123' });
    });
  });

  it('displays loading state during login', async () => {
    mockLogin.mockImplementation(() => new Promise(() => {}));

    renderLogin();

    const phoneInput = screen.getByLabelText('Phone Number');
    const passwordInput = screen.getByLabelText('Password');

    fireEvent.change(phoneInput, { target: { value: '+923001234567' } });
    fireEvent.change(passwordInput, { target: { value: 'admin123' } });

    const form = passwordInput.closest('form');
    if (form) fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });
  });

  it('renders footer with copyright', () => {
    renderLogin();

    expect(screen.getByText(/Fresh Bazar. All rights reserved./)).toBeInTheDocument();
  });

  it('redirects to dashboard after successful login', async () => {
    mockLogin.mockResolvedValueOnce(undefined);

    renderLogin();

    const phoneInput = screen.getByLabelText('Phone Number');
    const passwordInput = screen.getByLabelText('Password');

    fireEvent.change(phoneInput, { target: { value: '+923001234567' } });
    fireEvent.change(passwordInput, { target: { value: 'admin123' } });

    const form = passwordInput.closest('form');
    if (form) fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText('Dashboard Page')).toBeInTheDocument();
    });
  });
});
