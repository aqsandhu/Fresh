'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageCircle, X, Send, Loader2, Headphones, ShoppingCart } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { aiChatApi, type AiChatMessage } from '@/lib/api'
import { useAuthStore } from '@/store/cartStore'

/** Full name for a personal greeting — empty when not signed in. */
function customerName(u: { full_name?: string; name?: string } | null | undefined): string {
  return (u?.full_name || u?.name || '').trim()
}

/** Warm, human-sounding opening line (personalised when we know the name). */
function welcomeText(name: string): string {
  const salam = name ? `Assalam-o-Alaikum ${name}!` : 'Assalam-o-Alaikum!'
  return `${salam} FreshBazar mein khush-aamdeed. Agar aap ko FreshBazar istemal karne mein kisi bhi qisam ki rahnumai chahiye to mujhe batayein — main aap ki kis silsile mein madad karun?`
}

// Finds markdown links, bare product paths, and bare URLs in one pass.
const TOKEN_RE = /\[([^\]]+)\]\(([^)]+)\)|(\/product\/[A-Za-z0-9_-]+)|(https?:\/\/[^\s)]+)/g

/** Strip stray markdown so no "stars"/symbols leak into the chat. */
function cleanText(s: string): string {
  return s
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/__/g, '')
    .replace(/`/g, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-•]\s+/gm, '• ')
}

function productPathFromUrl(url: string): string | null {
  if (url.startsWith('/product/')) return url.split(/[?#]/)[0]
  try {
    const u = new URL(url)
    return u.pathname.startsWith('/product/') ? u.pathname : null
  } catch {
    return null
  }
}

export default function AiChatWidget() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<AiChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [welcoming, setWelcoming] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const { user, isAuthenticated } = useAuthStore()

  const { data: status } = useQuery({
    queryKey: ['ai-chat-status'],
    queryFn: aiChatApi.getStatus,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, open, sending, welcoming])

  // When the panel first opens, wait ~2s (showing a typing bubble) then greet the
  // customer by name if signed in — feels like a real person, not a canned bot.
  useEffect(() => {
    if (!open || messages.length > 0) return
    setWelcoming(true)
    const t = setTimeout(() => {
      setWelcoming(false)
      const name = isAuthenticated ? customerName(user) : ''
      setMessages((m) => (m.length === 0 ? [{ role: 'assistant', content: welcomeText(name) }] : m))
    }, 2000)
    return () => {
      clearTimeout(t)
      setWelcoming(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!status?.enabled) return null

  // Product links render as a self-contained "cart" chip (dir=ltr so the icon
  // always sits left of the name and the chip never reorders the surrounding
  // Urdu text). Other links stay as plain underlined links.
  const linkNode = (label: string, url: string, key: string) => {
    const productPath = productPathFromUrl(url)
    if (productPath) {
      const productLabel = /^https?:\/\//i.test(label) || label === url ? 'View product' : label
      return (
        <Link
          key={key}
          href={productPath}
          onClick={() => setOpen(false)}
          dir="ltr"
          className="my-0.5 inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1 text-[13px] font-semibold text-primary-700 transition-colors hover:bg-primary-100"
        >
          <ShoppingCart className="h-3.5 w-3.5 flex-shrink-0" />
          <span>{productLabel}</span>
        </Link>
      )
    }
    return url.startsWith('/') ? (
      <Link
        key={key}
        href={url}
        onClick={() => setOpen(false)}
        className="font-semibold text-primary-600 underline underline-offset-2"
      >
        {label}
      </Link>
    ) : (
      <a
        key={key}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold text-primary-600 underline underline-offset-2"
      >
        {label}
      </a>
    )
  }

  /** Render an assistant message: links clickable, markdown stripped. */
  const renderMessage = (raw: string): React.ReactNode[] => {
    const out: React.ReactNode[] = []
    let last = 0
    let m: RegExpExecArray | null
    let i = 0
    TOKEN_RE.lastIndex = 0
    while ((m = TOKEN_RE.exec(raw)) !== null) {
      if (m.index > last) out.push(cleanText(raw.slice(last, m.index)))
      if (m[1] && m[2]) out.push(linkNode(cleanText(m[1]).trim(), m[2], `l${i}`))
      else if (m[3]) out.push(linkNode('View product', m[3], `l${i}`))
      else if (m[4]) out.push(linkNode(m[4], m[4], `l${i}`))
      last = TOKEN_RE.lastIndex
      i++
    }
    if (last < raw.length) out.push(cleanText(raw.slice(last)))
    return out
  }

  const send = async () => {
    const text = input.trim()
    if (!text || sending) return
    const next = [...messages, { role: 'user' as const, content: text }]
    setMessages(next)
    setInput('')
    setSending(true)
    try {
      const page = typeof window !== 'undefined' ? window.location.pathname : undefined
      const { reply } = await aiChatApi.sendMessage(next.slice(-8), page)
      setMessages((mm) => [...mm, { role: 'assistant', content: reply }])
    } catch {
      setMessages((mm) => [
        ...mm,
        { role: 'assistant', content: 'Maazrat, abhi jawab nahi de paya. Bara karam thori der baad dobara message kar dijiye ga.' },
      ])
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      {/* Launcher — sits ABOVE the floating city button (no overlap) */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Chat with FreshBazar Support"
        className="fixed bottom-[8.5rem] right-4 z-[55] flex h-14 w-14 items-center justify-center rounded-full bg-primary-600 text-white shadow-lg transition-colors hover:bg-primary-700 lg:bottom-[5.25rem]"
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
            className="fixed z-[70] flex flex-col overflow-hidden border border-gray-200 bg-white shadow-2xl
                       inset-x-3 bottom-3 top-16 rounded-3xl
                       lg:inset-auto lg:right-6 lg:bottom-[5.25rem] lg:top-auto lg:h-[70vh] lg:max-h-[560px] lg:w-[380px] lg:rounded-2xl"
          >
            {/* Header */}
            <div className="flex items-center gap-3 bg-primary-600 px-4 py-3 text-white">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
                <Headphones className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold leading-tight">FreshBazar Support</p>
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
                    dir="auto"
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
              {(sending || welcoming) && (
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
