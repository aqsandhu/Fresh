// W17 (round 10): website sign-up — number → code → name (+ optional email)
// → PIN twice. A registered number goes to login; the code is checked (test
// code locally, the server's code at account creation — a wrong one returns
// to the code step); an easy PIN is refused before the second entry; the
// customer lands where they came from.
import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

const mockPush = jest.fn()
let mockParams = new URLSearchParams()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }), useSearchParams: () => mockParams }))
jest.mock('next/link', () => ({ __esModule: true, default: ({ children, href }: any) => <a href={href}>{children}</a> }))
jest.mock('framer-motion', () => ({
  motion: { div: ({ children }: any) => <div>{children}</div> },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))
jest.mock('react-hot-toast', () => {
  const t = Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() })
  return { __esModule: true, default: t }
})
const mockConfirm = jest.fn()
jest.mock('firebase/auth', () => ({
  RecaptchaVerifier: jest.fn(() => ({ clear: jest.fn() })),
  signInWithPhoneNumber: jest.fn(async () => ({ confirm: mockConfirm })),
}))
jest.mock('@/lib/firebase', () => ({ getFirebaseAuth: () => ({}) }))
jest.mock('@/lib/otpBypass', () => ({
  isOtpBypassEnabled: () => false,
  isValidOtpBypassCode: (c: string) => c === '123789',
  otpBypassHint: () => 'Use the test code',
  resolveOtpMode: (m?: string) => (m === 'backend' || m === 'bypass' ? m : 'firebase'),
  isCodeEntryMode: (m: string) => m === 'backend' || m === 'bypass',
}))
jest.mock('@/components/ui/BrandLogo', () => ({ __esModule: true, default: () => null }))
jest.mock('@/components/ui/AutoHeight', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }))
const mockSetAuth = jest.fn()
jest.mock('@/store/cartStore', () => ({ useAuthStore: () => ({ setAuth: mockSetAuth }) }))
jest.mock('@/lib/api', () => ({ authApi: { sendOtp: jest.fn(), verifyRegisterWithCode: jest.fn(), verifyRegister: jest.fn(), setPin: jest.fn() } }))

import RegisterPage from '@/app/(auth)/register/page'

/* eslint-disable @typescript-eslint/no-require-imports */
const { authApi } = require('@/lib/api')
const toast = require('react-hot-toast').default

const created = { data: { user: { id: 'u5', full_name: 'Sana Khan', phone: '+923001230005', email: 'sana@x.pk', role: 'customer' }, tokens: { accessToken: 'at', refreshToken: 'rt' } } }

beforeEach(() => {
  mockParams = new URLSearchParams()
  authApi.sendOtp.mockResolvedValue({ data: { userExists: false, phone: '+923001230005', mode: 'backend', channel: 'whatsapp' } })
  authApi.verifyRegisterWithCode.mockResolvedValue(created)
  authApi.verifyRegister.mockResolvedValue(created)
  authApi.setPin.mockResolvedValue({ success: true })
  mockConfirm.mockResolvedValue({ user: { getIdToken: async () => 'fb-token' } })
})

const phone = async (p = '03001230005') => {
  fireEvent.change(screen.getByLabelText('Phone Number'), { target: { value: p } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Send Verification Code/ })) })
}
const code = async (c = '424242') => {
  const el = await screen.findByLabelText('Code digit 1 of 6')
  await act(async () => { fireEvent.change(el, { target: { value: c } }) })
}
const profile = async (name = 'Sana Khan', email = 'sana@x.pk') => {
  fireEvent.change(await screen.findByLabelText('Full Name'), { target: { value: name } })
  fireEvent.change(screen.getByLabelText('Email (Optional)'), { target: { value: email } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Continue to PIN/ })) })
}
const pin = async (label: 'New PIN' | 'Confirm PIN', p: string) => {
  const el = await screen.findByLabelText(`${label} digit 1 of 4`)
  await act(async () => { fireEvent.change(el, { target: { value: p } }) })
}

describe('RegisterPage', () => {
  it('number → WhatsApp code → name + email → PIN twice → signed in and back where they came from', async () => {
    mockParams = new URLSearchParams({ redirect: '/checkout' })
    render(<RegisterPage />)
    await phone()
    expect(toast.success).toHaveBeenCalledWith('Code sent on WhatsApp')
    await code('424242')
    await profile()
    expect(authApi.verifyRegisterWithCode).toHaveBeenCalledWith({ phone: '+923001230005', code: '424242', full_name: 'Sana Khan', email: 'sana@x.pk' })
    expect(mockSetAuth).toHaveBeenCalledWith(expect.objectContaining({ id: 'u5', name: 'Sana Khan' }), { accessToken: 'at', refreshToken: 'rt' })
    await pin('New PIN', '4826')
    await pin('Confirm PIN', '4826')
    await waitFor(() => expect(authApi.setPin).toHaveBeenCalledWith('4826'))
    expect(mockPush).toHaveBeenCalledWith('/checkout')
  })

  it('an easy PIN is refused before the second entry; a mismatch starts again', async () => {
    render(<RegisterPage />)
    await phone()
    await code()
    await profile('Sana Khan', '')
    await pin('New PIN', '1234')
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/too easy to guess/))
    expect(screen.queryByLabelText('Confirm PIN digit 1 of 4')).toBeNull()
    await pin('New PIN', '4826')
    await pin('Confirm PIN', '4827')
    expect(toast.error).toHaveBeenCalledWith('PINs do not match. Please try again.')
    expect(await screen.findByLabelText('New PIN digit 1 of 4')).toBeInTheDocument()
    expect(authApi.setPin).not.toHaveBeenCalled()
  })

  it('a registered number goes to login with the number filled in', async () => {
    authApi.sendOtp.mockResolvedValue({ data: { userExists: true } })
    mockParams = new URLSearchParams({ redirect: '/orders' })
    render(<RegisterPage />)
    await phone()
    expect(mockPush).toHaveBeenCalledWith('/login?phone=03001230005&redirect=%2Forders')
  })

  it('arriving from login with ?autoOtp=1 sends the code straight away', async () => {
    mockParams = new URLSearchParams({ phone: '03001230005', autoOtp: '1' })
    render(<RegisterPage />)
    await waitFor(() => expect(authApi.sendOtp).toHaveBeenCalledWith('03001230005', undefined))
    expect(await screen.findByLabelText('Code digit 1 of 6')).toBeInTheDocument()
  })

  it('a wrong server code found at account creation returns to the code step', async () => {
    authApi.verifyRegisterWithCode.mockRejectedValueOnce({ response: { status: 400, data: { message: 'Incorrect verification code' } } })
    render(<RegisterPage />)
    await phone()
    await code('000000')
    await profile()
    expect(toast.error).toHaveBeenCalledWith('Incorrect verification code')
    expect(await screen.findByLabelText('Code digit 1 of 6')).toHaveValue('')
  })

  it('test-code mode refuses a wrong code locally; Firebase mode signs up with the token', async () => {
    authApi.sendOtp.mockResolvedValueOnce({ data: { userExists: false, phone: '+923001230005', mode: 'bypass' } })
    const { unmount } = render(<RegisterPage />)
    await phone()
    await code('999999')
    expect(toast.error).toHaveBeenCalledWith('Invalid OTP. Please try again.')
    expect(screen.queryByLabelText('Full Name')).toBeNull()
    unmount()
    authApi.sendOtp.mockResolvedValueOnce({ data: { userExists: false, phone: '+923001230005', mode: 'firebase' } })
    render(<RegisterPage />)
    await phone()
    await code('654321')
    await profile('Sana Khan', '')
    expect(authApi.verifyRegister).toHaveBeenCalledWith({ idToken: 'fb-token', full_name: 'Sana Khan', email: undefined })
  })

  it('the name is checked on the page', async () => {
    render(<RegisterPage />)
    await phone()
    await code()
    // (A malformed email is stopped by the browser's own email check first.)
    await profile('S', '')
    expect(await screen.findByText('Name must be at least 2 characters')).toBeInTheDocument()
    expect(authApi.verifyRegisterWithCode).not.toHaveBeenCalled()
  })
})
