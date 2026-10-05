'use client'

import Link from 'next/link'
import { Phone, Mail } from 'lucide-react'
import { useSupportContact } from '@/lib/useSupportContact'
import WhatsAppIcon from '@/components/ui/WhatsAppIcon'

const PRIMARY =
  'flex items-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors'
const OUTLINE =
  'flex items-center gap-2 px-6 py-3 border border-primary-600 text-primary-600 rounded-lg hover:bg-primary-50 transition-colors'

/**
 * "Call us / WhatsApp / Contact page" button row used by the static help
 * pages. Renders only the channels the admin has configured.
 */
export function SupportActionButtons({ contactHref = '/contact' }: { contactHref?: string }) {
  const { phone, telHref, whatsappUrl } = useSupportContact()
  return (
    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
      {phone && telHref ? (
        <a href={telHref} className={PRIMARY}>
          <Phone className="w-5 h-5" />
          Call {phone}
        </a>
      ) : null}
      {whatsappUrl ? (
        <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className={phone ? OUTLINE : PRIMARY}>
          <WhatsAppIcon className="w-5 h-5" />
          WhatsApp
        </a>
      ) : null}
      <Link href={contactHref} className={OUTLINE}>
        <Mail className="w-5 h-5" />
        Contact Us
      </Link>
    </div>
  )
}

/** Inline "Phone: 03xx…" line for policy pages; renders nothing when unset. */
export function SupportPhoneLine({ className = 'text-gray-600' }: { className?: string }) {
  const { phone, telHref } = useSupportContact()
  if (!phone || !telHref) return null
  return (
    <p className={className}>
      <span className="font-medium">Phone:</span>{' '}
      <a href={telHref} className="text-primary-600 hover:underline">
        {phone}
      </a>
    </p>
  )
}
