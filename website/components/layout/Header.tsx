'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ShoppingCart,
  User,
  Menu,
  X,
  Search,
  Phone,
  MapPin,
  Package,
  Home,
  Info,
  PhoneCall,
  Wheat,
  Loader2,
  ArrowRight,
} from 'lucide-react'
import { useCartStore, useAuthStore } from '@/store/cartStore'
import { cn, formatPriceShort, formatProductUnitSuffix } from '@/lib/utils'
import CartDropdown from './CartDropdown'
import { productsApi, categoriesApi, bannerApi } from '@/lib/api'
import { useCityContext } from '@/context/CityContext'
import { Product, Category } from '@/types'
import { phoneToTelHref } from '@/lib/phoneStorage'
import NotificationBell from '@/components/notifications/NotificationBell'
import BrandLogo from '@/components/ui/BrandLogo'

export default function Header() {
  const pathname = usePathname()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Product[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [hasMounted, setHasMounted] = useState(false)
  const router = useRouter()
  const { getTotalItems, items, hasHydrated: cartHasHydrated } = useCartStore()
  const { isAuthenticated, user } = useAuthStore()

  useEffect(() => { setHasMounted(true) }, [])

  const { selectedCityId } = useCityContext()

  // Dynamic categories for navbar (scoped to selected service city)
  const [categories, setCategories] = useState<Category[]>([])
  useEffect(() => {
    if (!selectedCityId) {
      setCategories([])
      return
    }
    categoriesApi.getAll().then(setCategories).catch(() => {})
  }, [selectedCityId])

  const navLinks = [
    { href: '/', label: 'Home', icon: Home },
    ...categories.map(cat => ({ href: `/category/${cat.slug}`, label: cat.name, icon: null })),
    { href: '/atta-chakki', label: 'Atta Chakki', icon: Wheat },
  ]

  // Banner settings from API
  const [banner, setBanner] = useState({
    leftText: '0300-1234567',
    middleText: 'Free Delivery 10AM-2PM',
    rightTextEn: 'Fresh Sabzi at Your Doorstep',
    rightTextUr: 'تازہ سبزیاں آپ کے دروازے پر',
  })

  useEffect(() => {
    if (!selectedCityId) return
    bannerApi.getSettings().then((data) => {
      setBanner({
        leftText: data.banner_left_text || '0300-1234567',
        middleText: data.banner_middle_text || 'Free Delivery 10AM-2PM',
        rightTextEn: data.banner_right_text_en || 'Fresh Sabzi at Your Doorstep',
        rightTextUr: data.banner_right_text_ur || 'تازہ سبزیاں آپ کے دروازے پر',
      })
    }).catch(() => {
      // Keep default values on error
    })
  }, [selectedCityId])
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const searchAreaRef = useRef<HTMLDivElement>(null)
  const mobileMenuRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  const cartItemCount = hasMounted ? getTotalItems() : 0

  // Auto-open cart dropdown when items are added — but NOT on hydration,
  // cart/checkout/login pages, or when navigating away (avoids the annoying
  // auto-open on refresh / login redirect from cart).
  const prevItemCountRef = useRef<number | null>(null)
  useEffect(() => {
    if (!cartHasHydrated) return

    const blockedPaths = ['/cart', '/checkout', '/login']
    const isBlockedPath = blockedPaths.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`)
    )

    const prev = prevItemCountRef.current
    prevItemCountRef.current = items.length

    if (prev == null) return
    if (isBlockedPath) return
    if (items.length <= prev) return

    setIsCartOpen(true)
    const timer = setTimeout(() => setIsCartOpen(false), 2000)
    return () => clearTimeout(timer)
  }, [items.length, cartHasHydrated, pathname])

  const closeCart = useCallback(() => setIsCartOpen(false), [])

  // Close mobile nav when tapping outside the drawer or pressing Escape.
  useEffect(() => {
    if (!isMenuOpen) return

    const handlePointer = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node
      if (mobileMenuRef.current?.contains(target)) return
      if (menuButtonRef.current?.contains(target)) return
      setIsMenuOpen(false)
    }

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMenuOpen(false)
    }

    document.addEventListener('mousedown', handlePointer)
    document.addEventListener('touchstart', handlePointer)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handlePointer)
      document.removeEventListener('touchstart', handlePointer)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [isMenuOpen])

  // Close search when clicking outside — only if user has not started searching (query < 2 chars).
  useEffect(() => {
    if (!isSearchOpen) return

    const handlePointer = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node
      if (searchAreaRef.current?.contains(target)) return
      if (searchQuery.trim().length >= 2) return
      setIsSearchOpen(false)
      setSearchQuery('')
      setSearchResults([])
    }

    document.addEventListener('mousedown', handlePointer)
    document.addEventListener('touchstart', handlePointer)
    return () => {
      document.removeEventListener('mousedown', handlePointer)
      document.removeEventListener('touchstart', handlePointer)
    }
  }, [isSearchOpen, searchQuery])

  // Search functionality
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([])
      setIsSearching(false)
      return
    }

    setIsSearching(true)

    // Debounce search
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current)
    }

    searchDebounceRef.current = setTimeout(async () => {
      try {
        const response = await productsApi.getAll({ search: searchQuery, limit: 5 })
        setSearchResults(response.products)
      } catch (error) {
        console.error('Search error:', error)
        setSearchResults([])
      } finally {
        setIsSearching(false)
      }
    }, 300)

    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current)
      }
    }
  }, [searchQuery])

  const showSearchDropdown = isSearchOpen && searchQuery.trim().length >= 2

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`)
      setIsSearchOpen(false)
      setSearchQuery('')
    }
  }

  const handleResultClick = () => {
    setIsSearchOpen(false)
    setSearchQuery('')
  }

  // The early return must come AFTER every hook — bailing out before them
  // changes the hook count between renders and corrupts React state when
  // navigating to/from /select-city (rules-of-hooks).
  if (pathname?.startsWith('/select-city')) {
    return null
  }

  return (
    <header className="sticky top-0 z-50 bg-white shadow-sm">
      {/* Top Bar */}
      <div className="bg-primary-700 text-white text-xs py-2">
        <div className="container mx-auto px-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <Phone className="w-3 h-3" />
              {(() => {
                const tel = phoneToTelHref(banner.leftText)
                return tel ? (
                  <a href={tel} className="hover:underline active:opacity-80">
                    {banner.leftText}
                  </a>
                ) : (
                  banner.leftText
                )
              })()}
            </span>
            <span className="hidden sm:flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {banner.middleText}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden sm:inline">{banner.rightTextEn}</span>
            <span className="font-urdu" dir="rtl">{banner.rightTextUr}</span>
          </div>
        </div>
      </div>

      {/* Main Header + search (click-outside closes idle search) */}
      <div
        ref={searchAreaRef}
        className="container mx-auto px-3 sm:px-4 h-9 lg:h-[43px] flex items-center py-0"
      >
        <div className="flex items-center justify-between gap-2 sm:gap-3 w-full h-full min-h-0">
          <Link
            href="/"
            className="shrink-0 flex items-center h-full leading-none p-0 m-0"
            aria-label="Home"
          >
            <BrandLogo size="nav" className="h-full" />
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-0.5">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors',
                  pathname === link.href
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Right Actions */}
          <div className="flex items-center gap-2">
            {/* Search Button */}
            <button
              onClick={() => {
                if (isSearchOpen && searchQuery.trim().length < 2) {
                  setIsSearchOpen(false)
                  setSearchQuery('')
                  setSearchResults([])
                  return
                }
                setIsSearchOpen(!isSearchOpen)
                if (!isSearchOpen) {
                  setTimeout(() => searchInputRef.current?.focus(), 100)
                }
              }}
              className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <Search className="w-5 h-5 text-gray-600" />
            </button>

            {/* Notifications */}
            {hasMounted && isAuthenticated && <NotificationBell />}

            {/* Orders */}
            {hasMounted && isAuthenticated && (
              <Link
                href="/orders"
                className="hidden sm:flex p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <Package className="w-5 h-5 text-gray-600" />
              </Link>
            )}

            {/* Cart */}
            <div className="relative">
              <button
                onClick={() => setIsCartOpen(!isCartOpen)}
                className="relative p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <ShoppingCart className="w-5 h-5 text-gray-600" />
                {cartItemCount > 0 && (
                  <motion.span
                    key={cartItemCount}
                    initial={{ scale: 0.5 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-primary-600 text-white text-xs font-medium rounded-full flex items-center justify-center"
                  >
                    {cartItemCount > 9 ? '9+' : cartItemCount}
                  </motion.span>
                )}
              </button>
              <CartDropdown isOpen={isCartOpen} onClose={closeCart} />
            </div>

            {/* Profile */}
            <Link
              href={hasMounted && isAuthenticated ? '/profile' : `/login?redirect=${pathname}`}
              className="hidden sm:flex p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <User className="w-5 h-5 text-gray-600" />
            </Link>

            {/* Mobile Menu Button */}
            <button
              ref={menuButtonRef}
              onClick={() => setIsMenuOpen((open) => !open)}
              className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={isMenuOpen}
            >
              {isMenuOpen ? (
                <X className="w-5 h-5 text-gray-600" />
              ) : (
                <Menu className="w-5 h-5 text-gray-600" />
              )}
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <AnimatePresence>
          {isSearchOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="pt-2 pb-1 relative">
                <form onSubmit={handleSearchSubmit}>
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search for fresh vegetables, fruits..."
                      className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      autoFocus
                    />
                    {isSearching && (
                      <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 animate-spin" />
                    )}
                  </div>
                </form>

                {/* Search Results Dropdown */}
                <AnimatePresence>
                  {showSearchDropdown && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute left-0 right-0 top-full mt-2 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-50 min-h-[3.5rem]"
                    >
                      {isSearching ? (
                        <div className="flex items-center justify-center gap-2 px-4 py-4 text-sm text-gray-500">
                          <Loader2 className="w-4 h-4 animate-spin text-primary-500" />
                          Searching products...
                        </div>
                      ) : searchResults.length > 0 ? (
                        <>
                          <div className="max-h-80 overflow-y-auto">
                            {searchResults.map((product) => (
                              <Link
                                key={product.id}
                                href={`/product/${product.id}`}
                                onClick={handleResultClick}
                                className="flex items-center gap-4 p-3 hover:bg-gray-50 transition-colors"
                              >
                                <div className="relative w-12 h-12 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                                  <Image
                                    src={product.image || '/placeholder-product.jpg'}
                                    alt={product.name}
                                    fill
                                    className="object-cover"
                                  />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-gray-900 truncate">{product.name}</p>
                                </div>
                                <span className="font-semibold text-primary-600 inline-flex items-baseline gap-0.5">
                                  {formatPriceShort(product.price)}
                                  <span className="text-[10px] font-normal text-gray-500">
                                    {formatProductUnitSuffix(product.unit)}
                                  </span>
                                </span>
                              </Link>
                            ))}
                          </div>
                          <div className="p-3 border-t border-gray-100 bg-gray-50">
                            <button
                              onClick={handleSearchSubmit}
                              className="w-full flex items-center justify-center gap-2 text-primary-600 font-medium hover:text-primary-700"
                            >
                              View all results
                              <ArrowRight className="w-4 h-4" />
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="p-6 text-center">
                          <p className="text-gray-500">No products found</p>
                          <p className="text-sm text-gray-400 mt-1">Try a different search term</p>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            ref={mobileMenuRef}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="lg:hidden overflow-hidden border-t border-gray-100"
          >
            <nav className="container mx-auto px-4 py-4 space-y-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsMenuOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-lg transition-colors',
                    pathname === link.href
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-gray-600 hover:bg-gray-50'
                  )}
                >
                  {link.icon && <link.icon className="w-5 h-5" />}
                  {link.label}
                </Link>
              ))}
              <hr className="my-2" />
              <Link
                href="/orders"
                onClick={() => setIsMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-600 hover:bg-gray-50"
              >
                <Package className="w-5 h-5" />
                My Orders
              </Link>
              <Link
                href={hasMounted && isAuthenticated ? '/profile' : `/login?redirect=${pathname}`}
                onClick={() => setIsMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-600 hover:bg-gray-50"
              >
                <User className="w-5 h-5" />
                {hasMounted && isAuthenticated ? 'My Profile' : 'Login / Register'}
              </Link>
              <Link
                href="/about"
                onClick={() => setIsMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-600 hover:bg-gray-50"
              >
                <Info className="w-5 h-5" />
                About Us
              </Link>
              <Link
                href="/contact"
                onClick={() => setIsMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-600 hover:bg-gray-50"
              >
                <PhoneCall className="w-5 h-5" />
                Contact Us
              </Link>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
