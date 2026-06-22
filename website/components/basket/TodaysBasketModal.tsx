'use client'

import { useState } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ShoppingBasket, Plus, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useQuery } from '@tanstack/react-query'
import { basketApi, productsApi, type BasketPublic } from '@/lib/api'
import { useCityContext } from '@/context/CityContext'
import { useCartStore } from '@/store/cartStore'
import { useBasketUi } from '@/store/basketUi'
import { formatPriceShort } from '@/lib/utils'
import { ProductUnit, ProductQuality } from '@/types'

const ALLOWED_UNITS: ProductUnit[] = ['full', 'half_kg', 'quarter_kg', 'half_dozen']

function normalizeUnit(unit: string): ProductUnit {
  return (ALLOWED_UNITS as string[]).includes(unit) ? (unit as ProductUnit) : 'full'
}
function normalizeQuality(q: string): ProductQuality {
  return (['A', 'B', 'C'] as string[]).includes(q) ? (q as ProductQuality) : 'A'
}

export default function TodaysBasketModal() {
  const { isOpen, close } = useBasketUi()
  const { selectedCityId } = useCityContext()
  const addItem = useCartStore((s) => s.addItem)
  const [addingId, setAddingId] = useState<string | null>(null)

  const { data: baskets = [], isLoading } = useQuery({
    queryKey: ['baskets', selectedCityId],
    queryFn: basketApi.getAll,
    enabled: Boolean(selectedCityId) && isOpen,
    staleTime: 5 * 60 * 1000,
  })

  const addBasketToCart = async (basket: BasketPublic) => {
    setAddingId(basket.id)
    try {
      let added = 0
      for (const item of basket.items) {
        try {
          const product = await productsApi.getById(item.product_id)
          addItem(product, item.quantity, normalizeUnit(item.unit), normalizeQuality(item.quality))
          added += 1
        } catch {
          // Skip an item that can no longer be fetched (e.g. removed product).
        }
      }
      if (added > 0) {
        toast.success(`${basket.name} added to cart`)
        close()
      } else {
        toast.error('These products are no longer available')
      }
    } finally {
      setAddingId(null)
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
          onClick={close}
        >
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
            className="relative w-full sm:max-w-lg max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
                <ShoppingBasket className="h-5 w-5 text-primary-600" /> Today&apos;s Basket
              </h2>
              <button onClick={close} aria-label="Close" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            {isLoading ? (
              <div className="py-12 flex justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
              </div>
            ) : baskets.length === 0 ? (
              <p className="py-10 text-center text-gray-500">No baskets available right now.</p>
            ) : (
              <div className="space-y-4">
                {baskets.map((basket) => (
                  <div key={basket.id} className="rounded-xl border border-gray-100 p-4">
                    <div className="flex items-start gap-3">
                      {basket.image_url && (
                        <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
                          <Image src={basket.image_url} alt={basket.name} fill className="object-cover" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900">{basket.name}</h3>
                        {basket.description && (
                          <p className="text-sm text-gray-500 line-clamp-2">{basket.description}</p>
                        )}
                        <p className="mt-1 font-bold text-primary-700">
                          {formatPriceShort(basket.total_price)}
                        </p>
                      </div>
                    </div>

                    <ul className="mt-3 space-y-1 text-sm text-gray-600">
                      {basket.items.map((it) => (
                        <li key={it.product_id + it.quality} className="flex justify-between">
                          <span>
                            {it.name} <span className="text-gray-400">×{it.quantity}</span>
                          </span>
                          <span className="text-xs text-gray-400">Quality {it.quality}</span>
                        </li>
                      ))}
                    </ul>

                    <button
                      onClick={() => addBasketToCart(basket)}
                      disabled={addingId === basket.id}
                      className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-60"
                    >
                      {addingId === basket.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}
                      Add basket to cart
                    </button>
                  </div>
                ))}
                <p className="text-center text-xs text-gray-400">
                  Items are added to your cart at live prices.
                </p>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
