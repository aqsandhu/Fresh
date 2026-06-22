'use client'

import { motion } from 'framer-motion'
import { Clock, type LucideIcon } from 'lucide-react'
import Link from 'next/link'

interface ComingSoonProps {
  /** Section heading (English). */
  titleEn?: string
  /** Optional Urdu heading shown under the English title. */
  titleUr?: string
  /** Large icon shown in the badge. */
  icon?: LucideIcon
  /** Main Urdu reassurance line. */
  messageUr?: string
  /** Optional English sub-line. */
  messageEn?: string
}

/**
 * A friendly "this feature is paused / coming soon" panel. Used to temporarily
 * pause a feature's UI (e.g. Atta Chakki) without removing any functionality —
 * flipping the related super-admin flag restores the real screen.
 */
export default function ComingSoon({
  titleEn = 'Coming Soon',
  titleUr,
  icon: Icon = Clock,
  messageUr = 'یہ سہولت بہت جلد آپ کے علاقے میں دستیاب ہوگی، انشاء اللّٰہ',
  messageEn,
}: ComingSoonProps) {
  return (
    <div className="min-h-[70vh] bg-gradient-to-br from-primary-50 to-white flex items-center justify-center px-4 py-16">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-lg w-full text-center bg-white rounded-3xl shadow-sm border border-gray-100 p-8 sm:p-12"
      >
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary-100 text-primary-700 mb-6">
          <Icon className="w-10 h-10" />
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">{titleEn}</h1>
        {titleUr && (
          <p className="text-lg text-primary-700 font-urdu mb-4" dir="rtl">
            {titleUr}
          </p>
        )}

        <p
          className="text-xl sm:text-2xl leading-relaxed text-gray-800 font-urdu mt-4"
          dir="rtl"
        >
          {messageUr}
        </p>

        {messageEn && <p className="text-gray-500 mt-4">{messageEn}</p>}

        <Link
          href="/"
          className="inline-flex items-center justify-center mt-8 px-6 py-3 rounded-xl bg-primary-600 text-white font-medium hover:bg-primary-700 transition-colors"
        >
          Back to Home
        </Link>
      </motion.div>
    </div>
  )
}
