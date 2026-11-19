// W17 (round 10): sign-in inside checkout — returning (PIN), account without a
// PIN (code), brand-new number (code → name + PIN, account created, PIN set),
// weak PIN refused BEFORE the account exists (B33), a wrong code sends the
// customer back to the code step, and the checkout stays put after sign-in.
import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

const mockPush = jest.fn()
let mockParams = new URLSearchParams()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }), useSearchParams: () => mockParams }))
jest.mock('framer-motion', () => {
  const Pass = ({ children, onSubmit, className }: any) => (onSubmit ? <form onSubmit={onSubmit} className={className}>{children}</form> : <div>{children}</div>)
  return { motion: { div: Pass, form: Pass }, AnimatePresence: ({ children }: any) => <>{children}</> }
})
jest.mock('react-hot-toast', () => {
  const t = Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() })
  return { __esModule: true, default: t }
})
jest.mock('firebase/auth', () => ({ RecaptchaVerifier: jest.fn(() => ({ clear: jest.fn() })), signInWithPhoneNumber: jest.fn() }))
jest.mock('@/lib/firebase', () => ({ getFirebaseAuth: () => ({}) }))
jest.mock('@/lib/otpBypass', () => ({
  isOtpBypassEnabled: () => false,
  isValidOtpBypassCode: (c: string) => c === '123789',
  otpBypassHint: () => 'Use the test code',
  resolveOtpMode: (m?: string) => (m === 'backend' || m === 'bypass' ? m : 'firebase'),
  isCodeEntryMode: (m: string) => m === 'backend' || m === 'bypass',
}))
jest.mock('@/lib/phoneStorage', () => ({ getLastPhone: () => null, setLastPhone: jest.fn(), maskPhone: (p: string) => p }))
jest.mock('@/components/ui/AutoHeight', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }))
jest.mock('@/components/guidance/GuidanceTips', () => ({ __esModule: true, default: () => null }))
const mockSetAuth = jest.fn()
jest.mock('@/store/cartStore', () => ({ useAuthStore: () => ({ setAuth: mockSetAuth }) }))
jest.mock('@/lib/api', () => ({
  authApi: {
    pinStatus: jest.fn(), sendOtp: jest.fn(), verifyPin: jest.fn(), verifyLoginWithCode: jest.fn(), verifyLogin: jest.fn(),
    verifyRegisterWithCode: jest.fn(), verifyRegister: jest.fn(), setPin: jest.fn(),
  },
}))

import CheckoutAuthPanel from '@/components/checkout/CheckoutAuthPanel'

/* eslint-disable @typescript-eslint/no-require-imports */
const { authApi } = require('@/lib/api')
const toast = require('react-hot-toast').default

const user = { id: 'u9', full_name: 'Sana', phone: '+923001230009', email: null, role: 'customer' }
const ok = { data: { user, tokens: { accessToken: 'at', refreshToken: 'rt' } } }

beforeEach(() => {
  mockParams = new URLSearchParams()
  authApi.sendOtp.mockResolvedValue({ data: { phone: '+923001230009', mode: 'backend', channel: 'sms' } })
  for (const fn of [authApi.verifyPin, authApi.verifyLoginWithCode, authApi.verifyRegisterWithCode]) fn.mockResolvedValue(ok)
  authApi.setPin.mockResolvedValue({ success: true })
})

const submitPhone = async (phone = '03001230009') => {
  fireEvent.change(screen.getByLabelText('Mobile number'), { target: { value: phone } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Continue/ })) })
}
const code = async (c = '123789') => {
  const el = await screen.findByLabelText('Code digit 1 of 6')
  await act(async () => { fireEvent.change(el, { target: { value: c } }) })
}

describe('CheckoutAuthPanel', () => {
  it('a wrong-looking number is refused without a call', async () => {
    render(<CheckoutAuthPanel />)
    await submitPhone('123')
    expect(screen.getByText(/Enter a valid Pakistani number/)).toBeInTheDocument()
    expect(authApi.pinStatus).not.toHaveBeenCalled()
  })

  it('a returning customer signs in with the PIN and stays on checkout', async () => {
    authApi.pinStatus.mockResolvedValue({ exists: true, hasPin: true, fullName: 'Sana' })
    render(<CheckoutAuthPanel />)
    await submitPhone()
    const el = await screen.findByLabelText('PIN digit 1 of 4')
  await act(async () => { fireEvent.change(el, { target: { value: '4826' } }) })
    await waitFor(() => expect(authApi.verifyPin).toHaveBeenCalledWith('03001230009', '4826'))
    expect(mockSetAuth).toHaveBeenCalledWith(expect.objectContaining({ id: 'u9', name: 'Sana' }), { accessToken: 'at', refreshToken: 'rt' })
    expect(mockPush).not.toHaveBeenCalled() // the checkout re-renders in place
  })

  it('an account without a PIN signs in with the code', async () => {
    authApi.pinStatus.mockResolvedValue({ exists: true, hasPin: false })
    render(<CheckoutAuthPanel />)
    await submitPhone()
    expect(authApi.sendOtp).toHaveBeenCalledWith('03001230009', undefined)
    await code('555111')
    await waitFor(() => expect(authApi.verifyLoginWithCode).toHaveBeenCalledWith('+923001230009', '555111'))
    expect(toast.success).toHaveBeenCalledWith('Signed in!')
  })

  it('a new number: code → name + PIN → account created and PIN saved; a weak PIN is refused first', async () => {
    authApi.pinStatus.mockResolvedValue({ exists: false, hasPin: false })
    render(<CheckoutAuthPanel />)
    await submitPhone()
    await code('424242')
    expect(await screen.findByLabelText('Full name')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Sana Khan' } })
    fireEvent.change(screen.getByLabelText('New PIN digit 1 of 4'), { target: { value: '1111' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Create account/ })) })
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/too easy to guess/))
    expect(authApi.verifyRegisterWithCode).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('New PIN digit 1 of 4'), { target: { value: '4826' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Create account/ })) })
    await waitFor(() => expect(authApi.verifyRegisterWithCode).toHaveBeenCalledWith({ phone: '+923001230009', code: '424242', full_name: 'Sana Khan' }))
    expect(authApi.setPin).toHaveBeenCalledWith('4826')
    expect(toast.success).toHaveBeenCalledWith('Account ready — you are signed in!')
  })

  it('a wrong code found at sign-up goes back to the code step', async () => {
    authApi.pinStatus.mockResolvedValue({ exists: false, hasPin: false })
    authApi.verifyRegisterWithCode.mockRejectedValueOnce({ response: { status: 400, data: { message: 'Incorrect verification code' } } })
    render(<CheckoutAuthPanel />)
    await submitPhone()
    await code('000000')
    fireEvent.change(await screen.findByLabelText('Full name'), { target: { value: 'Sana Khan' } })
    fireEvent.change(screen.getByLabelText('New PIN digit 1 of 4'), { target: { value: '4826' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Create account/ })) })
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Incorrect verification code'))
    expect(await screen.findByLabelText('Code digit 1 of 6')).toHaveValue('')
  })

  it('test-code mode: a wrong code is refused before the sign-up form', async () => {
    authApi.pinStatus.mockResolvedValue({ exists: false, hasPin: false })
    authApi.sendOtp.mockResolvedValue({ data: { phone: '+923001230009', mode: 'bypass' } })
    render(<CheckoutAuthPanel />)
    await submitPhone()
    await code('999999')
    expect(toast.error).toHaveBeenCalledWith('Invalid OTP. Please try again.')
    expect(screen.queryByLabelText('Full name')).toBeNull()
  })

  it('a wrong PIN says so; a non-checkout redirect is followed after sign-in', async () => {
    mockParams = new URLSearchParams({ redirect: '/orders' })
    authApi.pinStatus.mockResolvedValue({ exists: true, hasPin: true })
    authApi.verifyPin.mockRejectedValueOnce({ response: { status: 401, data: { message: 'Incorrect PIN' } } })
    render(<CheckoutAuthPanel />)
    await submitPhone()
    const el = await screen.findByLabelText('PIN digit 1 of 4')
  await act(async () => { fireEvent.change(el, { target: { value: '0000' } }) })
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    await act(async () => { fireEvent.change(screen.getByLabelText('PIN digit 1 of 4'), { target: { value: '4826' } }) })
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/orders'))
  })
})
