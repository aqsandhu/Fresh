// W17 (round 10): the customer ↔ rider chat — loads the history, live
// messages for THIS order only (I13), no duplicates, the server echo replaces
// the "sending" bubble, send by socket or (offline) by REST, a refused send
// is shown and the text given back, typing indicator, and everything the
// chat subscribed to is removed when it closes (the typing listener leaked).
import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

jest.mock('react-hot-toast', () => {
  const t = Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() })
  return { __esModule: true, default: t }
})
const mockAuth = { isAuthenticated: true }
jest.mock('@/store/cartStore', () => ({ useAuthStore: (sel: (s: typeof mockAuth) => unknown) => sel(mockAuth) }))
jest.mock('@/lib/api', () => ({ chatApi: { getMessages: jest.fn(), sendMessage: jest.fn() } }))
const mockSocket = { connected: true, on: jest.fn(), off: jest.fn() }
const mockHandlers: Record<string, (d: any) => void> = {}
jest.mock('@/lib/socket', () => ({
  resolveSocketAuthToken: jest.fn(async () => 'tok'),
  connectSocket: () => mockSocket,
  getSocket: () => mockSocket,
  subscribeToOrder: jest.fn(),
  unsubscribeFromOrder: jest.fn(),
  sendChatMessage: jest.fn(),
  onChatMessage: (cb: any) => { mockHandlers.message = cb },
  offChatMessage: jest.fn(),
  emitTyping: jest.fn(),
  onTyping: (cb: any) => { mockHandlers.typing = cb },
  offTyping: jest.fn(),
}))

import OrderChatBox from '@/components/ui/OrderChatBox'

// jsdom has no scrolling.
Element.prototype.scrollIntoView = jest.fn()

/* eslint-disable @typescript-eslint/no-require-imports */
const { chatApi } = require('@/lib/api')
const socketLib = require('@/lib/socket')
const toast = require('react-hot-toast').default

const msg = (id: string, text: string, who: 'customer' | 'rider' = 'rider', extra: Record<string, unknown> = {}) => ({
  id, message: text, sender_type: who, sender_name: who === 'rider' ? 'Bilal' : 'You', created_at: new Date().toISOString(), ...extra,
})

beforeEach(() => {
  mockAuth.isAuthenticated = true
  mockSocket.connected = true
  chatApi.getMessages.mockResolvedValue({ success: true, data: { messages: [msg('m1', 'On my way')] } })
  chatApi.sendMessage.mockResolvedValue({ success: true, data: msg('m9', 'Gate is open', 'customer') })
})

const ready = async () => {
  render(<OrderChatBox orderId="o1" />)
  await screen.findByText('On my way')
  await waitFor(() => expect(mockHandlers.message).toBeDefined())
}
const send = async (text: string) => {
  fireEvent.change(screen.getByPlaceholderText('Type a message...'), { target: { value: text } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send message' })) })
}

describe('OrderChatBox', () => {
  it('shows the history and live messages for this order only (I13), without duplicates', async () => {
    await ready()
    act(() => mockHandlers.message({ ...msg('m2', 'Reached the gate'), order_id: 'o1' }))
    act(() => mockHandlers.message({ ...msg('m3', 'Other customer'), order_id: 'o-other' }))
    act(() => mockHandlers.message({ ...msg('m2', 'Reached the gate'), order_id: 'o1' }))
    expect(screen.getAllByText('Reached the gate')).toHaveLength(1)
    expect(screen.queryByText('Other customer')).toBeNull()
  })

  it('online: sent over the socket; the server echo replaces the "sending" bubble', async () => {
    await ready()
    await send('Please ring the bell')
    expect(socketLib.sendChatMessage).toHaveBeenCalledWith('o1', 'Please ring the bell')
    act(() => mockHandlers.message({ ...msg('m5', 'Please ring the bell', 'customer'), order_id: 'o1' }))
    expect(screen.getAllByText('Please ring the bell')).toHaveLength(1)
  })

  it('offline: sent by REST; a failure says so and gives the text back', async () => {
    await ready()
    mockSocket.connected = false
    await send('Gate is open')
    expect(chatApi.sendMessage).toHaveBeenCalledWith('o1', 'Gate is open')
    expect(screen.getByText('Gate is open')).toBeInTheDocument()
    chatApi.sendMessage.mockRejectedValueOnce(new Error('offline'))
    await send('Second try')
    expect(toast.error).toHaveBeenCalledWith('Message not sent — check your connection and try again')
    expect(screen.getByPlaceholderText('Type a message...')).toHaveValue('Second try')
  })

  it('a send the server refuses (chat:error) drops the bubble and says why', async () => {
    await ready()
    await send('Hello?')
    const onError = mockSocket.on.mock.calls.find((c) => c[0] === 'chat:error')?.[1]
    act(() => onError({ message: 'This order is complete — chat is closed' }))
    expect(screen.queryByText('Hello?')).toBeNull()
    expect(toast.error).toHaveBeenCalledWith('This order is complete — chat is closed')
  })

  it('shows when the rider is typing; my typing is sent', async () => {
    await ready()
    act(() => mockHandlers.typing({ orderId: 'o1', isTyping: true }))
    expect(screen.getByText('Rider is typing...')).toBeInTheDocument()
    act(() => mockHandlers.typing({ orderId: 'o1', isTyping: false }))
    expect(screen.queryByText('Rider is typing...')).toBeNull()
    fireEvent.change(screen.getByPlaceholderText('Type a message...'), { target: { value: 'h' } })
    await waitFor(() => expect(socketLib.emitTyping).toHaveBeenCalledWith('o1', true))
  })

  it('closing the chat removes every listener it added (typing too)', async () => {
    const { unmount } = render(<OrderChatBox orderId="o1" />)
    await waitFor(() => expect(mockHandlers.typing).toBeDefined())
    unmount()
    expect(socketLib.offChatMessage).toHaveBeenCalled()
    expect(socketLib.offTyping).toHaveBeenCalledWith(mockHandlers.typing)
    expect(socketLib.unsubscribeFromOrder).toHaveBeenCalledWith('o1')
  })

  it('a guest gets the history but no live connection', async () => {
    mockAuth.isAuthenticated = false
    render(<OrderChatBox orderId="o1" />)
    await screen.findByText('On my way')
    expect(socketLib.subscribeToOrder).not.toHaveBeenCalled()
  })
})
