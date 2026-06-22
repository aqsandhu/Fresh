'use client'

import { useEffect, useRef, useState, Fragment } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageCircle, X, Send, Loader2, Bot } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { aiChatApi, type AiChatMessage } from '@/lib/api'

const GREETING: AiChatMessage = {
  role: 'assistant',
  content:
    "Assalam-o-Alaikum! 👋 I'm the FreshBazar assistant. Ask me about products, ordering, delivery, franchise, or anything else.",
}

const LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g

export default function AiChatWidget() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<AiChatMessage[]>([GREETING])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

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

  /** Render markdown links [label](url) as clickable links; rest as text. */
  const renderMessage = (text: string) => {
    const nodes: React.ReactNode[] = []
    let last = 0
    let m: RegExpExecArray | null
    let i = 0
    LINK_RE.lastIndex = 0
    while ((m = LINK_RE.exec(text)) !== null) {
      if (m.index > last) nodes.push(<Fragment key={`t${i}`}>{text.slice(last, m.index)}</Fragment>)
      const label = m[1]
      const url = m[2]
      if (url.startsWith('/')) {
        nodes.push(
          <Link
            key={`l${i}`}
            href={url}
            onClick={() => setOpen(false)}
            className="font-semibold text-primary-600 underline underline-offset-2"
          >
            {label}
          </Link>
        )
      } else {
        nodes.push(
          <a
            key={`l${i}`}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-primary-600 underline underline-offset-2"
          >
            {label}
          </a>
        )
      }
      last = LINK_RE.lastIndex
      i++
    }
    if (last < text.length) nodes.push(<Fragment key={`t${i}`}>{text.slice(last)}</Fragment>)
    return nodes
  }

  const send = async () => {
    const text = input.trim()
    if (!text || sending) return
    const next = [...messages, { role: 'user' as const, content: text }]
    setMessages(next)
    setInput('')
    setSending(true)
    try {
      const { reply } = await aiChatApi.sendMessage(next.slice(-8))
      setMessages((mm) => [...mm, { role: 'assistant', content: reply }])
    } catch {
      setMessages((mm) => [
        ...mm,
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
        className="fixed bottom-20 right-4 z-[81] flex h-14 w-14 items-center justify-center rounded-full bg-primary-600 text-white shadow-lg transition-colors hover:bg-primary-700 lg:bottom-6"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="fixed z-[80] flex flex-col overflow-hidden border border-gray-200 bg-white shadow-2xl
                       inset-x-3 bottom-3 top-16 rounded-3xl
                       lg:inset-auto lg:right-6 lg:bottom-24 lg:top-auto lg:h-[560px] lg:w-[380px] lg:rounded-2xl"
          >
            {/* Header */}
            <div className="flex items-center gap-3 bg-primary-600 px-4 py-3 text-white">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
                <Bot className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold leading-tight">FreshBazar Assistant</p>
                <p className="flex items-center gap-1 text-[11px] text-primary-100">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-300" /> Online
                </p>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close" className="rounded-lg p-1.5 hover:bg-white/10">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto overscroll-contain bg-gray-50 p-3">
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[14px] leading-relaxed shadow-sm ${
                      msg.role === 'user'
                        ? 'rounded-br-md bg-primary-600 text-white'
                        : 'rounded-bl-md border border-gray-100 bg-white text-gray-800'
                    }`}
                  >
                    {msg.role === 'assistant' ? renderMessage(msg.content) : msg.content}
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-bl-md border border-gray-100 bg-white px-3.5 py-2.5 shadow-sm">
                    <Loader2 className="h-4 w-4 animate-spin text-primary-500" />
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault()
                send()
              }}
              className="flex items-center gap-2 border-t border-gray-100 bg-white p-2.5"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your message…"
                className="min-w-0 flex-1 rounded-full border border-gray-200 px-4 py-2.5 text-[15px] focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-primary-600 text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
                aria-label="Send"
              >
                <Send className="h-5 w-5" />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
