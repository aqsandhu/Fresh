'use client'

import { useLayoutEffect, useState } from 'react'
import { formatSlotTimeRange } from '@/lib/utils'

interface SlotTimeLabelProps {
  startTime: string
  endTime: string
  className?: string
}

/**
 * Formats slot times on the client so mobile 12h/24h system preference is read
 * after hydration (SSR cannot know the device clock setting).
 */
export default function SlotTimeLabel({ startTime, endTime, className }: SlotTimeLabelProps) {
  const [label, setLabel] = useState('')

  useLayoutEffect(() => {
    setLabel(formatSlotTimeRange(startTime, endTime))
  }, [startTime, endTime])

  return (
    <span className={className} suppressHydrationWarning>
      {label || `${startTime} - ${endTime}`}
    </span>
  )
}