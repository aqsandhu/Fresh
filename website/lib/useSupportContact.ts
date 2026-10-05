'use client'

import { useQuery } from '@tanstack/react-query'
import { bannerApi } from '@/lib/api'
import { useCityContext } from '@/context/CityContext'
import { phoneToTelHref } from '@/lib/phoneStorage'
import { buildWhatsAppUrl } from '@/lib/whatsapp'

export const SUPPORT_EMAIL = 'support@freshbazar.pk'

export interface SupportContact {
  /** Admin-configured support phone (banner "left text"); '' when not set. */
  phone: string
  /** `tel:` href for `phone`; '' when not set. */
  telHref: string
  /** WhatsApp deep link from the admin's WhatsApp-order setting or the phone; null when neither is set. */
  whatsappUrl: string | null
  email: string
  isLoading: boolean
}

/**
 * Single source of truth for the support phone / WhatsApp shown across the
 * site. Reads the per-city banner settings the admin manages; NEVER falls
 * back to a placeholder number — callers hide the control when unset.
 */
export function useSupportContact(): SupportContact {
  const { selectedCityId } = useCityContext()
  const { data, isLoading } = useQuery({
    queryKey: ['banner-settings', selectedCityId],
    queryFn: bannerApi.getSettings,
    enabled: !!selectedCityId,
    staleTime: 5 * 60 * 1000,
  })

  const phone = String(data?.banner_left_text || '').trim()
  const whatsappSource = String(data?.whatsapp_order_url || data?.whatsappOrderUrl || '').trim() || phone
  return {
    phone,
    telHref: phone ? phoneToTelHref(phone) : '',
    whatsappUrl: whatsappSource ? buildWhatsAppUrl(whatsappSource) : null,
    email: SUPPORT_EMAIL,
    isLoading,
  }
}
