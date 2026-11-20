// W17 (round 10): website sign-in — new numbers go to register, PIN sign-in,
// OTP sign-in (server code or Firebase), forgot PIN → code → new PIN (weak /
// mismatched PINs refused before sending), returning numbers, and where the
// customer lands afterwards.
import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

const mockPush = jest.fn()
let mockParams = new URLSearchParams()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }), useSearchParams: () => mockParams }))
jest.mock('next/link', () => ({ __esModule: true, default: ({ children, href }: any) => <a href={href}>{children}</a> }))
jest.mock('framer-motion', () => ({
  m: { div: ({ children }: any) => <div>{children}</div> },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))
jest.mock('react-hot-toast', () => {
  const t = Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() })
  return { __esModule: true, default: t }
})
const mockConfirm = jest.fn()
jest.mock('firebase/auth', () => ({
  RecaptchaVerifier: jest.fn().mockImplementation(() => ({ clear: jest.fn() })),
  signInWithPhoneNumber: jest.fn(async () => ({ confirm: mockConfirm })),
}))
jest.mock('@/lib/firebase', () => ({ getFirebaseAuth: () => ({}) }))
jest.mock('@/lib/otpBypass', () => ({
  isOtpBypassEnabled: () => false,
  otpBypassHint: () => 'Use the test code',
  resolveOtpMode: (m?: string) => (m === 'backend' || m === 'bypass' ? m : 'firebase'),
  isCodeEntryMode: (m: string) => m === 'backend' || m === 'bypass',
}))
const mockLastPhone = { value: null as string | null }
jest.mock('@/lib/phoneStorage', () => ({
  getLastPhone: () => mockLastPhone.value,
  setLastPhone: jest.fn((p: string) => { mockLastPhone.value = p }),
  clearLastPhone: jest.fn(() => { mockLastPhone.value = null }),
  maskPhone: (p: string) => `${p.slice(0, 4)}***${p.slice(-2)}`,
}))
jest.mock('@/components/ui/BrandLogo', () => ({ __esModule: true, default: () => null }))
jest.mock('@/components/ui/AutoHeight', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }))
const mockSetAuth = jest.fn()
jest.mock('@/store/cartStore', () => ({ useAuthStore: () => ({ setAuth: mockSetAuth }) }))
jest.mock('@/lib/api', () => ({
  authApi: {
    pinStatus: jest.fn(), sendOtp: jest.fn(), verifyPin: jest.fn(), verifyLoginWithCode: jest.fn(),
    verifyLogin: jest.fn(), resetPinWithCode: jest.fn(), resetPin: jest.fn(),
  },
}))

import LoginPage from '@/app/(auth)/login/page'

/* eslint-disable @typescript-eslint/no-require-imports */
const { authApi } = require('@/lib/api')
const toast = require('react-hot-toast').default

const user = { id: 'u1', full_name: 'Ali Raza', phone: '+923451230001', email: null, role: 'customer' }
const signedIn = { data: { user, tokens: { accessToken: 'at', refreshToken: 'rt' } } }

beforeEach(() => {
  mockParams = new URLSearchParams()
  mockLastPhone.value = null
  authApi.pinStatus.mockResolvedValue({ exists: true, hasPin: true, fullName: 'Ali Raza' })
  authApi.sendOtp.mockResolvedValue({ data: { userExists: true, phone: '+923451230001', userName: 'Ali Raza', mode: 'backend', channel: 'whatsapp' } })
  authApi.verifyPin.mockResolvedValue(signedIn)
  authApi.verifyLoginWithCode.mockResolvedValue(signedIn)
  authApi.verifyLogin.mockResolvedValue(signedIn)
  authApi.resetPinWithCode.mockResolvedValue({ success: true })
  mockConfirm.mockResolvedValue({ user: { getIdToken: async () => 'firebase-id-token' } })
})

const enterPhone = async (phone = '03451230001') => {
  fireEvent.change(await screen.findByLabelText('Phone Number'), { target: { value: phone } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Continue/ })) })
}
const typeCode = async (code = '123789') => {
  const el = await screen.findByLabelText('Code digit 1 of 6')
  await act(async () => { fireEvent.change(el, { target: { value: code } }) })
}
const typePin = async (label: string, pin: string) => {
  await act(async () => { fireEvent.change(screen.getByLabelText(`${label} digit 1 of 4`), { target: { value: pin } }) })
}

describe('phone step', () => {
  it('a wrong-looking number is refused on the spot', async () => {
    render(<LoginPage />)
    await enterPhone('12345')
    expect(await screen.findByText(/Enter a valid Pakistani phone number/)).toBeInTheDocument()
    expect(authApi.pinStatus).not.toHaveBeenCalled()
  })

  it('a number with no account goes to register (code sent there), keeping the way back', async () => {
    mockParams = new URLSearchParams({ redirect: '/checkout' })
    authApi.pinStatus.mockResolvedValue({ exists: false, hasPin: false })
    render(<LoginPage />)
    await enterPhone()
    expect(mockPush).toHaveBeenCalledWith('/register?phone=03451230001&autoOtp=1&redirect=%2Fcheckout')
  })
})

describe('PIN sign-in', () => {
  it('the right PIN signs in, remembers the number and goes back where the customer came from', async () => {
    mockParams = new URLSearchParams({ redirect: '/checkout' })
    render(<LoginPage />)
    await enterPhone()
    expect(await screen.findByText('Welcome, Ali Raza')).toBeInTheDocument()
    await typePin('PIN', '4826')
    await waitFor(() => expect(authApi.verifyPin).toHaveBeenCalledWith('03451230001', '4826'))
    expect(mockSetAuth).toHaveBeenCalledWith(expect.objectContaining({ id: 'u1', name: 'Ali Raza' }), { accessToken: 'at', refreshToken: 'rt' })
    expect(mockLastPhone.value).toBe('+923451230001')
    expect(mockPush).toHaveBeenCalledWith('/checkout')
  })

  it('an outside redirect is ignored (no open redirect)', async () => {
    mockParams = new URLSearchParams({ redirect: 'https://evil.example/steal' })
    render(<LoginPage />)
    await enterPhone()
    await typePin('PIN', '4826')
    await waitFor(() => expect(mockPush).toHaveBeenCalled())
    expect(mockPush.mock.calls[0][0]).not.toMatch(/evil/)
  })

  it('a wrong PIN says so and clears the boxes', async () => {
    authApi.verifyPin.mockRejectedValueOnce({ response: { status: 401, data: { message: 'Incorrect PIN' } } })
    render(<LoginPage />)
    await enterPhone()
    await typePin('PIN', '1111')
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(screen.getByLabelText('PIN digit 1 of 4')).toHaveValue('')
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('a returning number opens straight on the PIN; "another number" forgets it', async () => {
    mockLastPhone.value = '03451230001'
    render(<LoginPage />)
    expect(await screen.findByText('Welcome, Ali Raza')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Login with another number' }))
    expect(await screen.findByLabelText('Phone Number')).toBeInTheDocument()
    expect(mockLastPhone.value).toBeNull()
  })
})

describe('code sign-in', () => {
  it('no PIN yet → the server sends a WhatsApp code; the code signs in', async () => {
    authApi.pinStatus.mockResolvedValue({ exists: true, hasPin: false, fullName: 'Ali Raza' })
    render(<LoginPage />)
    await enterPhone()
    await waitFor(() => expect(authApi.sendOtp).toHaveBeenCalledWith('03451230001', undefined))
    expect(toast.success).toHaveBeenCalledWith('Code sent on WhatsApp')
    expect(screen.getByText('Hi, Ali Raza!')).toBeInTheDocument()
    await typeCode('123789')
    await waitFor(() => expect(authApi.verifyLoginWithCode).toHaveBeenCalledWith('+923451230001', '123789'))
    expect(mockPush).toHaveBeenCalledWith('/')
  })

  it('Firebase mode: the SMS code is confirmed and its token signs in', async () => {
    authApi.pinStatus.mockResolvedValue({ exists: true, hasPin: false })
    authApi.sendOtp.mockResolvedValue({ data: { userExists: true, phone: '+923451230001', mode: 'firebase' } })
    render(<LoginPage />)
    await enterPhone()
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('OTP sent via SMS'))
    await typeCode('654321')
    await waitFor(() => expect(authApi.verifyLogin).toHaveBeenCalledWith('firebase-id-token'))
    expect(mockConfirm).toHaveBeenCalledWith('654321')
  })

  it('a wrong code shows the reason and empties the boxes', async () => {
    authApi.pinStatus.mockResolvedValue({ exists: true, hasPin: false })
    authApi.verifyLoginWithCode.mockRejectedValueOnce({ response: { data: { message: 'Incorrect or expired code' } } })
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
    render(<LoginPage />)
    await enterPhone()
    await typeCode('000000')
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Incorrect or expired code', { duration: 8000 }))
    expect(screen.getByLabelText('Code digit 1 of 6')).toHaveValue('')
  })
})

describe('forgot PIN', () => {
  it('code → new PIN: a mismatch and a weak PIN are refused before sending; a good PIN resets and signs in', async () => {
    render(<LoginPage />)
    await enterPhone()
    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: /Forgot PIN/ })) })
    await typeCode('123789')
    expect(await screen.findByText('Set New PIN')).toBeInTheDocument()
    await typePin('New PIN', '4826')
    await typePin('Confirm PIN', '4827')
    fireEvent.click(screen.getByRole('button', { name: /Save PIN/ }))
    expect(toast.error).toHaveBeenCalledWith('PINs do not match. Please try again.')
    await typePin('New PIN', '1234')
    await typePin('Confirm PIN', '1234')
    fireEvent.click(screen.getByRole('button', { name: /Save PIN/ }))
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/too easy to guess/))
    expect(authApi.resetPinWithCode).not.toHaveBeenCalled()
    await typePin('New PIN', '4826')
    await typePin('Confirm PIN', '4826')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Save PIN/ })) })
    await waitFor(() => expect(authApi.resetPinWithCode).toHaveBeenCalledWith('+923451230001', '123789', '4826'))
    expect(authApi.verifyLoginWithCode).toHaveBeenCalledWith('+923451230001', '123789')
    expect(toast.success).toHaveBeenCalledWith('PIN updated. You are now logged in.')
  })
})
