'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageCircle, X, Send, Loader2, Bot } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { aiChatApi, type AiChatMessage } from '@/lib/api'

const GREETING: AiChatMessage = {
  role: 'assistant',
  content:
    "Assalam-o-Alaikum! I'm the FreshBazar assistant. Ask me about products, ordering, delivery, franchise, or anything else 🙂",
}

export default function AiChatWidget() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<AiChatMessage[]>([GREETING])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Only show the widget when an API key is configured (cheap status check).
  const { data: status } = useQuery({
    queryKey: ['ai-chat-status'],
    queryFn: aiChatApi.getStatus,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, open, sending])

  if (!status?.enabled) return null

  const send = async () => {
    const text = input.trim()
    if (!text || sending) return
    const next = [...messages, { role: 'user' as const, content: text }]
    setMessages(next)
    setInput('')
    setSending(true)
    try {
      // Send only the recent turns to keep tokens low.
      const { reply } = await aiChatApi.sendMessage(next.slice(-8))
      setMessages((m) => [...m, { role: 'assistant', content: reply }])
    } catch {
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: 'Sorry, I could not respond right now. Please try again.' },
      ])
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      {/* Launcher */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Chat with FreshBazar assistant"
        className="fixed bottom-20 lg:bottom-6 right-4 z-[80] flex h-14 w-14 items-center justify-center rounded-full bg-primary-600 text-white shadow-lg hover:bg-primary-700 transition-colors"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            className="fixed bottom-36 lg:bottom-24 right-4 z-[80] flex h-[60vh] max-h-[520px] w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-2xl bg-white shadow-2xl border border-gray-100"
          >
            <div className="flex items-center gap-2 bg-primary-600 px-4 py-3 text-white">
              <Bot className="h-5 w-5" />
              <div>
                <p className="text-sm font-semibold leading-tight">FreshBazar Assistant</p>
                <p className="text-[11px] text-primary-100">Here to help</p>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-gray-50 p-3">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                      m.role === 'user'
                        ? 'bg-primary-600 text-white rounded-br-sm'
                        : 'bg-white text-gray-800 border border-gray-100 rounded-bl-sm'
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-bl-sm border border-gray-100 bg-white px-3 py-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary-500" />
                  </div>
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                send()
              }}
              className="flex items-center gap-2 border-t border-gray-100 p-2"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your message…"
                className="flex-1 rounded-full border border-gray-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-600 text-white disabled:opacity-50"
                aria-label="Send"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
