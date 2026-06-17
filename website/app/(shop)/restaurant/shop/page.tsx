'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { UtensilsCrossed, ShoppingCart, Plus, Minus, Trash2, Loader2, ClipboardList, LogOut } from 'lucide-react'
import toast from 'react-hot-toast'
import { resolveImageUrl } from '@/lib/utils'
import { getRestaurantInfo, clearRestaurantSession } from '@/lib/restaurantSession'
import { restaurantShopApi } from '@/lib/restaurantApi'
import {
  availableQualities, availableUnits, unitPrice, money, round2,
  type RestaurantProduct, type Quality, type Unit,
} from '@/lib/restaurantPricing'

const CART_KEY = 'restaurant_cart'

interface CartLine {
  key: string
  productId: string
  name: string
  image?: string | null
  quality: Quality
  unit: Unit
  unitShort: string
  qty: number
  unitPrice: number
}

export default function RestaurantShopPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState<any[]>([])
  const [products, setProducts] = useState<RestaurantProduct[]>([])
  const [activeCat, setActiveCat] = useState<string>('')
  const [delivery, setDelivery] = useState({ base_charge: 100, free_delivery_threshold: 2000 })
  const [cart, setCart] = useState<CartLine[]>([])
  const [notes, setNotes] = useState('')
  const [placing, setPlacing] = useState(false)

  // Guard + initial load
  useEffect(() => {
    if (!getRestaurantInfo()) {
      router.replace('/restaurant/login')
      return
    }
    setReady(true)
    try {
      const raw = localStorage.getItem(CART_KEY)
      if (raw) setCart(JSON.parse(raw))
    } catch {
      /* ignore */
    }
    ;(async () => {
      try {
        const [cats, prods, del] = await Promise.all([
          restaurantShopApi.getCategories(),
          restaurantShopApi.getProducts(),
          restaurantShopApi.getDelivery().catch(() => ({ base_charge: 100, free_delivery_threshold: 2000 })),
        ])
        setCategories(cats || [])
        setProducts(prods || [])
        if (del) setDelivery(del)
      } catch (e: any) {
        if (e?.status === 401) router.replace('/restaurant/login')
        else toast.error(e?.message || 'Could not load the restaurant catalog')
      } finally {
        setLoading(false)
      }
    })()
  }, [router])

  // Persist cart
  useEffect(() => {
    if (ready) {
      try {
        localStorage.setItem(CART_KEY, JSON.stringify(cart))
      } catch {
        /* ignore */
      }
    }
  }, [cart, ready])

  const loadCategory = async (catId: string) => {
    setActiveCat(catId)
    setLoading(true)
    try {
      const prods = await restaurantShopApi.getProducts(catId || undefined)
      setProducts(prods || [])
    } catch (e: any) {
      toast.error(e?.message || 'Could not load products')
    } finally {
      setLoading(false)
    }
  }

  const addToCart = (line: CartLine) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.key === line.key)
      if (existing) {
        return prev.map((l) => (l.key === line.key ? { ...l, qty: l.qty + line.qty } : l))
      }
      return [...prev, line]
    })
    toast.success('Added to cart')
  }

  const setQty = (key: string, qty: number) =>
    setCart((prev) => prev.map((l) => (l.key === key ? { ...l, qty: Math.max(1, qty) } : l)))
  const removeLine = (key: string) => setCart((prev) => prev.filter((l) => l.key !== key))

  const subtotal = useMemo(() => round2(cart.reduce((s, l) => s + round2(l.unitPrice * l.qty), 0)), [cart])
  const deliveryCharge = subtotal >= delivery.free_delivery_threshold ? 0 : (subtotal > 0 ? delivery.base_charge : 0)
  const total = round2(subtotal + deliveryCharge)
  const remainingForFree = Math.max(0, delivery.free_delivery_threshold - subtotal)

  const placeOrder = async () => {
    if (cart.length === 0) return toast.error('Your cart is empty')
    setPlacing(true)
    try {
      await restaurantShopApi.placeOrder(
        cart.map((l) => ({ product_id: l.productId, quantity: l.qty, unit: l.unit, quality: l.quality })),
        notes.trim() || undefined
      )
      setCart([])
      setNotes('')
      toast.success('Order placed!')
      router.push('/restaurant/orders')
    } catch (e: any) {
      toast.error(e?.message || 'Could not place the order')
    } finally {
      setPlacing(false)
    }
  }

  const logout = () => {
    clearRestaurantSession()
    router.replace('/restaurant/login')
  }

  if (!ready) return null
  const info = getRestaurantInfo()

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <UtensilsCrossed className="w-5 h-5 text-primary-600 shrink-0" />
            <span className="font-bold text-gray-900 truncate">{info?.business_name}</span>
            <span className="text-xs text-gray-400 hidden sm:inline">Restaurant store</span>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/restaurant/orders" className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-primary-600">
              <ClipboardList className="w-4 h-4" /> <span className="hidden sm:inline">My Orders</span>
            </Link>
            <button onClick={logout} className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-red-600">
              <LogOut className="w-4 h-4" /> <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 grid lg:grid-cols-3 gap-6">
        {/* Catalog */}
        <div className="lg:col-span-2">
          {/* Category chips */}
          <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
            <CatChip label="All" active={activeCat === ''} onClick={() => loadCategory('')} />
            {categories.map((c) => (
              <CatChip key={c.id} label={c.name_en} active={activeCat === c.id} onClick={() => loadCategory(c.id)} />
            ))}
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-7 h-7 animate-spin text-primary-600" />
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <UtensilsCrossed className="w-10 h-10 mx-auto mb-3 text-gray-300" />
              No products in this catalog yet.
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} onAdd={addToCart} />
              ))}
            </div>
          )}
        </div>

        {/* Cart */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 lg:sticky lg:top-20">
            <div className="flex items-center gap-2 border-b px-4 py-3">
              <ShoppingCart className="w-4 h-4 text-gray-500" />
              <span className="font-semibold text-gray-800">Cart ({cart.length})</span>
            </div>

            {cart.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gray-400">Your cart is empty.</p>
            ) : (
              <div className="max-h-[40vh] overflow-y-auto divide-y">
                {cart.map((l) => (
                  <div key={l.key} className="px-4 py-3">
                    <div className="flex justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{l.name}</p>
                        <p className="text-xs text-gray-500">
                          Quality {l.quality} · {l.unitShort} · {money(l.unitPrice)}
                        </p>
                      </div>
                      <button onClick={() => removeLine(l.key)} className="text-red-400 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center rounded-lg border border-gray-300">
                        <button onClick={() => setQty(l.key, l.qty - 1)} className="px-2 py-1 text-gray-600 hover:bg-gray-100">
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="w-8 text-center text-sm tabular-nums">{l.qty}</span>
                        <button onClick={() => setQty(l.key, l.qty + 1)} className="px-2 py-1 text-gray-600 hover:bg-gray-100">
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <span className="text-sm font-semibold text-gray-900">{money(round2(l.unitPrice * l.qty))}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="px-4 py-3 border-t space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-600">Subtotal</span><span className="font-medium">{money(subtotal)}</span></div>
              <div className="flex justify-between">
                <span className="text-gray-600">Delivery</span>
                <span className={deliveryCharge === 0 ? 'text-green-600 font-medium' : 'font-medium'}>
                  {subtotal === 0 ? '—' : deliveryCharge === 0 ? 'FREE' : money(deliveryCharge)}
                </span>
              </div>
              {subtotal > 0 && deliveryCharge > 0 && remainingForFree > 0 && (
                <p className="text-xs text-gray-500">Add {money(remainingForFree)} more for free delivery.</p>
              )}
              <div className="flex justify-between border-t pt-2">
                <span className="font-semibold text-gray-900">Total</span>
                <span className="text-lg font-bold text-primary-600">{money(total)}</span>
              </div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Order notes (optional)"
                className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
              />
              <button
                onClick={placeOrder}
                disabled={placing || cart.length === 0}
                className="w-full mt-1 rounded-lg bg-primary-600 px-4 py-2.5 font-semibold text-white hover:bg-primary-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {placing ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Place Order'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function CatChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
        active ? 'bg-primary-600 text-white' : 'bg-white text-gray-700 border border-gray-200 hover:border-primary-300'
      }`}
    >
      {label}
    </button>
  )
}

function ProductCard({ product, onAdd }: { product: RestaurantProduct; onAdd: (l: CartLine) => void }) {
  const qualities = availableQualities(product)
  const units = availableUnits(product)
  const [quality, setQuality] = useState<Quality>(qualities[0])
  const [unit, setUnit] = useState<Unit>(units[0].value)
  const [qty, setQty] = useState(1)

  const selectedUnit = units.find((u) => u.value === unit) || units[0]
  const price = unitPrice(product, quality, unit)
  const outOfStock = (product.stock_quantity ?? 0) <= 0
  const img = resolveImageUrl(product.primary_image || '')

  const add = () => {
    if (price == null) return
    onAdd({
      key: `${product.id}|${quality}|${unit}`,
      productId: product.id,
      name: product.name_en,
      image: product.primary_image,
      quality,
      unit,
      unitShort: selectedUnit.short,
      qty,
      unitPrice: price,
    })
    setQty(1)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
      <div className="flex gap-3 p-3">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt={product.name_en} className="h-16 w-16 rounded-lg object-cover border border-gray-100 shrink-0" />
        ) : (
          <div className="h-16 w-16 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
            <UtensilsCrossed className="w-6 h-6 text-gray-300" />
          </div>
        )}
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 leading-tight">{product.name_en}</p>
          {product.name_ur && <p className="text-sm text-gray-500" dir="rtl">{product.name_ur}</p>}
          {product.category_name && <p className="text-xs text-gray-400 mt-0.5">{product.category_name}</p>}
        </div>
      </div>

      <div className="px-3 pb-3 mt-auto space-y-2">
        <div className="flex gap-2">
          <select
            value={quality}
            onChange={(e) => setQuality(e.target.value as Quality)}
            disabled={qualities.length <= 1}
            className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 disabled:bg-gray-50"
          >
            {qualities.map((q) => (
              <option key={q} value={q}>Quality {q}</option>
            ))}
          </select>
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value as Unit)}
            disabled={units.length <= 1}
            className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 disabled:bg-gray-50"
          >
            {units.map((u) => (
              <option key={u.value} value={u.value}>{u.label}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2.5 py-1 text-sm font-semibold text-primary-700">
            {price != null ? money(price) : '—'} <span className="text-primary-400">/ {selectedUnit.short}</span>
          </span>
          <div className="flex items-center rounded-lg border border-gray-300">
            <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="px-2 py-1 text-gray-600 hover:bg-gray-100">
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="w-7 text-center text-sm tabular-nums">{qty}</span>
            <button onClick={() => setQty((q) => q + 1)} className="px-2 py-1 text-gray-600 hover:bg-gray-100">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <button
          onClick={add}
          disabled={outOfStock || price == null}
          className="w-full rounded-lg bg-primary-600 px-3 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {outOfStock ? 'Out of stock' : 'Add to cart'}
        </button>
      </div>
    </div>
  )
}
