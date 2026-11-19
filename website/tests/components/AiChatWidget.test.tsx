// W17 (round 10): the AI help chat — hidden when switched off, greets the
// customer by name, sends the last 8 messages with the page, product links
// become "View product" chips, unsafe links stay plain text, markdown symbols
// are stripped, and a failure gives a polite apology.
import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

jest.mock('next/link', () => ({ __esModule: true, default: ({ children, href, onClick }: any) => <a href={href} onClick={onClick}>{children}</a> }))
jest.mock('framer-motion', () => ({
  motion: { div: ({ children, className }: any) => <div className={className}>{children}</div> },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))
const mockDrawer = { chatOpen: true, setChatOpen: jest.fn() }
jest.mock('@/store/rightDrawer', () => ({ useRightDrawer: (sel: (s: typeof mockDrawer) => unknown) => sel(mockDrawer) }))
const mockAuth: any = { user: { full_name: 'Ali Raza' }, isAuthenticated: true }
jest.mock('@/store/cartStore', () => ({ useAuthStore: () => mockAuth }))
jest.mock('@/lib/api', () => ({ aiChatApi: { getStatus: jest.fn(), sendMessage: jest.fn() } }))

import AiChatWidget from '@/components/ai/AiChatWidget'

/* eslint-disable @typescript-eslint/no-require-imports */
const { aiChatApi } = require('@/lib/api')

beforeEach(() => {
  mockDrawer.chatOpen = true
  aiChatApi.getStatus.mockResolvedValue({ enabled: true })
  aiChatApi.sendMessage.mockResolvedValue({ reply: 'Yeh dekhein: **Aloo** [Aloo 1kg](/product/aloo-1kg) aur [bura](javascript:alert(1))' })
  Element.prototype.scrollIntoView = jest.fn()
  Element.prototype.scrollTo = jest.fn() as unknown as typeof Element.prototype.scrollTo
})

const renderWidget = () =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AiChatWidget /></QueryClientProvider>)

const say = async (text: string) => {
  fireEvent.change(screen.getByLabelText('Message to FreshBazar support'), { target: { value: text } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send' })) })
}

describe('AiChatWidget', () => {
  it('switched off → nothing is shown', async () => {
    aiChatApi.getStatus.mockResolvedValue({ enabled: false })
    const { container } = renderWidget()
    await waitFor(() => expect(aiChatApi.getStatus).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('greets the signed-in customer by name', async () => {
    renderWidget()
    expect(await screen.findByText(/Assalam-o-Alaikum Ali Raza!/, {}, { timeout: 4000 })).toBeInTheDocument()
  })

  it('sends with the page; a product link becomes a chip, an unsafe link stays text, ** is stripped', async () => {
    renderWidget()
    await screen.findByText(/Assalam-o-Alaikum/, {}, { timeout: 4000 })
    await say('Aloo kahan milega?')
    expect(aiChatApi.sendMessage).toHaveBeenCalledWith(
      [expect.objectContaining({ role: 'assistant' }), { role: 'user', content: 'Aloo kahan milega?' }],
      window.location.pathname,
    )
    const chip = await screen.findByRole('link', { name: /Aloo 1kg/ })
    expect(chip).toHaveAttribute('href', '/product/aloo-1kg')
    expect(screen.queryByRole('link', { name: 'bura' })).toBeNull()
    expect(screen.getByText('bura')).toBeInTheDocument()
    expect(screen.queryByText(/\*\*/)).toBeNull()
    fireEvent.click(chip)
    expect(mockDrawer.setChatOpen).toHaveBeenCalledWith(false)
  })

  it('a failure gives a polite apology', async () => {
    aiChatApi.sendMessage.mockRejectedValueOnce(new Error('down'))
    renderWidget()
    await screen.findByText(/Assalam-o-Alaikum/, {}, { timeout: 4000 })
    await say('Hello')
    expect(await screen.findByText(/Maazrat, abhi jawab nahi de paya/)).toBeInTheDocument()
  })

  it('only the last 8 messages are sent', async () => {
    renderWidget()
    await screen.findByText(/Assalam-o-Alaikum/, {}, { timeout: 4000 })
    aiChatApi.sendMessage.mockResolvedValue({ reply: 'ok' })
    for (let i = 1; i <= 5; i++) await say(`question ${i}`)
    const sent = aiChatApi.sendMessage.mock.calls[4][0]
    expect(sent).toHaveLength(8)
    expect(sent[sent.length - 1]).toEqual({ role: 'user', content: 'question 5' })
  })
})
