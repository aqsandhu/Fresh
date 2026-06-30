'use client'

// Animates its own height to match its content. Wrap a multi-step area
// (e.g. an <AnimatePresence> stepper) so that when the active step changes and
// the content height changes, the container glides to the new height instead of
// snapping — which is what made the login / sign-up steps feel "jerky".
//
// Width is never animated (only height), so text never distorts. overflow is
// kept `visible` at rest so input focus rings / shadows are not clipped, and is
// only `hidden` during the brief height animation.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'

interface AutoHeightProps {
  children: ReactNode
  className?: string
  /** Height-tween duration in seconds. */
  duration?: number
}

export default function AutoHeight({ children, className = '', duration = 0.28 }: AutoHeightProps) {
  const innerRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number | 'auto'>('auto')
  const [animating, setAnimating] = useState(false)

  useEffect(() => {
    const el = innerRef.current
    if (!el) return
    const measure = () => setHeight(el.offsetHeight)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <motion.div
      className={className}
      // Don't animate on first paint — just adopt the measured height so there
      // is no opening flash (animating from "auto" is not possible anyway).
      initial={false}
      animate={{ height }}
      transition={{ duration, ease: [0.22, 1, 0.36, 1] }}
      onAnimationStart={() => setAnimating(true)}
      onAnimationComplete={() => setAnimating(false)}
      style={{ overflow: animating ? 'hidden' : 'visible' }}
    >
      <div ref={innerRef}>{children}</div>
    </motion.div>
  )
}
