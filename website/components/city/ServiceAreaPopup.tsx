'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { MapPinOff, X, MessageCircle } from 'lucide-react'
import { buildWhatsAppUrl } from '@/lib/whatsapp'
import type { ServiceAreaMessage } from '@/lib/serviceArea'

interface ServiceAreaPopupProps {
  open: boolean
  onClose: () => void
  message: ServiceAreaMessage
  /** Optional detected city/area name ("You're in X"). */
  detectedPlace?: string | null
}

/**
 * Shown when a customer's chosen delivery pin falls outside the city's active
 * service-area polygon. Reassures them service is coming and invites WhatsApp
 * feedback (number/link is super-admin configurable).
 */
export default function ServiceAreaPopup({
  open,
  onClose,
  message,
  detectedPlace,
}: ServiceAreaPopupProps) {
  const waUrl = message.whatsapp ? buildWhatsAppUrl(message.whatsapp) : null

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute right-3 top-3 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
              <MapPinOff className="h-8 w-8" />
            </div>

            <h2 className="text-center text-xl font-bold text-gray-900">
              {message.title || "We're not in your area yet"}
            </h2>

            {detectedPlace && (
              <p className="mt-1 text-center text-sm text-gray-500">
                It looks like you’re in {detectedPlace}.
              </p>
            )}

            {message.message_en && (
              <p className="mt-3 text-center text-gray-600">{message.message_en}</p>
            )}
            {message.message_ur && (
              <p className="mt-3 text-center text-lg leading-relaxed text-gray-800 font-urdu" dir="rtl">
                {message.message_ur}
              </p>
            )}

            {waUrl && (
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-3 font-medium text-white transition-colors hover:bg-green-700"
              >
                <MessageCircle className="h-5 w-5" />
                Send feedback on WhatsApp
              </a>
            )}

            <button
              onClick={onClose}
              className="mt-3 w-full rounded-xl border border-gray-200 px-4 py-2.5 font-medium text-gray-600 hover:bg-gray-50"
            >
              Choose a different location
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
