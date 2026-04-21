'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Send, MessageCircle, Loader2, Wifi, WifiOff } from 'lucide-react'
import { chatApi } from '@/lib/api'
import {
  connectSocket,
  disconnectSocket,
  subscribeToOrder,
  unsubscribeFromOrder,
  sendChatMessage,
  onChatMessage,
  offChatMessage,
  emitTyping,
  onTyping,
} from '@/lib/socket'

interface Message {
  id: string
  message: string
  sender_type: 'customer' | 'rider'
  sender_name: string
  created_at: string
}

interface OrderChatBoxProps {
  orderId: string
}

export default function OrderChatBox({ orderId }: OrderChatBoxProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [typingUser, setTypingUser] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tokenRef = useRef<string>('')

  // Get token from localStorage
  useEffect(() => {
    const storedToken = localStorage.getItem('token')
    if (storedToken) {
      tokenRef.current = storedToken
    }
  }, [])

  // Fetch initial messages via REST
  const fetchMessages = useCallback(async () => {
    try {
      const res = await chatApi.getMessages(orderId)
      if (res?.success) {
        setMessages(res.data.messages || [])
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [orderId])

  // Setup socket for real-time chat
  useEffect(() => {
    fetchMessages()

    if (!tokenRef.current) return

    // Connect socket
    const socket = connectSocket(tokenRef.current)

    // Subscribe to order room
    subscribeToOrder(orderId, (data: any) => {
      console.log('[OrderChatBox] Order update:', data)
    })

    // Listen for incoming messages
    const handleIncomingMessage = (data: Message) => {
      setMessages((prev) => {
        // Avoid duplicates
        if (prev.some((m) => m.id === data.id)) return prev
        return [...prev, data]
      })
    }
    onChatMessage(handleIncomingMessage)

    // Listen for typing indicators
    const handleTypingEvent = (data: { orderId: string; isTyping: boolean; userId?: string }) => {
      if (data.orderId === orderId) {
        setTypingUser(data.isTyping ? 'Rider' : null)
      }
    }
    onTyping(handleTypingEvent)

    // Connection status
    const checkConnection = setInterval(() => {
      setIsConnected(socket.connected)
    }, 3000)

    return () => {
      unsubscribeFromOrder(orderId)
      offChatMessage(handleIncomingMessage)
      // Cleanup handled by disconnect on unmount of parent
      clearInterval(checkConnection)
    }
  }, [orderId, fetchMessages])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = newMessage.trim()
    if (!text || sending) return

    setSending(true)
    setNewMessage('')

    // Optimistically add message
    const optimisticMsg: Message = {
      id: `temp-${Date.now()}`,
      message: text,
      sender_type: 'customer',
      sender_name: 'You',
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, optimisticMsg])

    // Send via socket if connected, else fallback to REST
    const socket = connectSocket(tokenRef.current)
    if (socket.connected) {
      sendChatMessage(orderId, text)
      setSending(false)
    } else {
      try {
        const res = await chatApi.sendMessage(orderId, text)
        if (res?.success) {
          setMessages((prev) =>
            prev.map((m) => (m.id === optimisticMsg.id ? res.data : m))
          )
        }
      } catch {
        setNewMessage(text) // restore on failure
        setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id))
      } finally {
        setSending(false)
      }
    }
  }

  // Handle typing indicator with debounce
  const handleTypingChange = (text: string) => {
    setNewMessage(text)

    const socket = connectSocket(tokenRef.current)
    if (!socket.connected) return

    if (text.length > 0) {
      emitTyping(orderId, true)
    }

    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    // Stop typing after 2 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      emitTyping(orderId, false)
    }, 2000)
  }

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-6 py-4 border-b bg-primary-50">
        <MessageCircle className="w-5 h-5 text-primary-600" />
        <h2 className="text-lg font-semibold text-primary-900">Chat with Rider</h2>
        <div className="ml-auto flex items-center gap-2">
          {typingUser && (
            <span className="text-xs text-gray-500 italic">{typingUser} is typing...</span>
          )}
          {isConnected ? (
            <Wifi className="w-4 h-4 text-green-500" title="Online" />
          ) : (
            <WifiOff className="w-4 h-4 text-gray-400" title="Offline" />
          )}
        </div>
      </div>

      <div className="h-64 overflow-y-auto p-4 space-y-3 bg-gray-50">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <MessageCircle className="w-8 h-8 mb-2" />
            <p className="text-sm">No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.sender_type === 'customer'
            return (
              <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                    isMe
                      ? 'bg-primary-600 text-white rounded-br-sm'
                      : 'bg-white text-gray-900 border rounded-bl-sm'
                  }`}
                >
                  {!isMe && (
                    <p className="text-xs font-semibold text-primary-600 mb-0.5">{msg.sender_name}</p>
                  )}
                  <p className="text-sm">{msg.message}</p>
                  <p className={`text-[10px] mt-1 text-right ${isMe ? 'text-primary-100' : 'text-gray-400'}`}>
                    {formatTime(msg.created_at)}
                  </p>
                </div>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSend} className="flex items-center gap-2 p-3 border-t">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => handleTypingChange(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 px-4 py-2 rounded-full border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
          maxLength={500}
        />
        <button
          type="submit"
          disabled={!newMessage.trim() || sending}
          className="w-10 h-10 rounded-full bg-primary-600 text-white flex items-center justify-center hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          {sending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </form>
    </div>
  )
}
