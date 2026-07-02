/**
 * Signature marquee band under the hero: bilingual freshness promises scrolling
 * slowly across a deep-green strip. Pure CSS animation (Tailwind `animate-marquee`),
 * paused on hover and disabled entirely under prefers-reduced-motion.
 *
 * Copy is deliberately number-free — thresholds vary per city and live in the
 * hero, which reads them from site settings.
 */

const ITEMS: Array<{ text: string; urdu?: boolean }> = [
  { text: 'Mandi-fresh every morning' },
  { text: 'تازہ سبزیاں اور پھل', urdu: true },
  { text: 'Same-day delivery' },
  { text: 'گھر بیٹھے آرڈر کریں', urdu: true },
  { text: 'Cash on delivery' },
  { text: 'مفت ڈیلیوری ٹائم سلاٹس', urdu: true },
  { text: 'Freshness guaranteed' },
  { text: 'تازگی کی ضمانت', urdu: true },
]

function TickerRow({ hidden = false }: { hidden?: boolean }) {
  return (
    <div
      className="flex shrink-0 items-center"
      aria-hidden={hidden || undefined}
    >
      {ITEMS.map((item, i) => (
        <span key={i} className="flex items-center">
          <span
            dir={item.urdu ? 'rtl' : undefined}
            className={`whitespace-nowrap text-sm font-semibold tracking-wide text-primary-50 ${
              item.urdu ? 'font-urdu leading-8' : 'uppercase'
            }`}
          >
            {item.text}
          </span>
          <span className="mx-6 text-secondary-400" aria-hidden="true">
            ✦
          </span>
        </span>
      ))}
    </div>
  )
}

export default function FreshTicker() {
  return (
    <div className="overflow-hidden border-y border-primary-800 bg-primary-900 py-3">
      <div className="flex w-max animate-marquee pause-on-hover">
        <TickerRow />
        <TickerRow hidden />
      </div>
    </div>
  )
}
