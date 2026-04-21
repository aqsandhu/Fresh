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
  ArrowRight
} from 'lucide-react'
import { useCartStore, useAuthStore } from '@/store/cartStore'
import { cn, formatPriceShort } from '@/lib/utils'
import CartDropdown from './CartDropdown'
import { productsApi, categoriesApi, bannerApi } from '@/lib/api'
import { Product, Category } from '@/types'

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Product[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [hasMounted, setHasMounted] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const { getTotalItems, items } = useCartStore()
  const { isAuthenticated, user } = useAuthStore()

  useEffect(() => { setHasMounted(true) }, [])

  // Dynamic categories for navbar
  const [categories, setCategories] = useState<Category[]>([])
  useEffect(() => {
    categoriesApi.getAll().then(setCategories).catch(() => {})
  }, [])

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
    bannerApi.getSettings().then(data => {
      setBanner({
        leftText: data.banner_left_text || banner.leftText,
        middleText: data.banner_middle_text || banner.middleText,
        rightTextEn: data.banner_right_text_en || banner.rightTextEn,
        rightTextUr: data.banner_right_text_ur || banner.rightTextUr,
      })
    }).catch(() => {
      // Keep default values on error
    })
  }, [])
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchDebounceRef = useRef<NodeJS.Timeout>()

  const cartItemCount = hasMounted ? getTotalItems() : 0

  // Auto-open cart dropdown when items are added
  const prevItemCountRef = useRef(items.length)
  useEffect(() => {
    if (items.length > prevItemCountRef.current && pathname !== '/cart' && pathname !== '/checkout') {
      setIsCartOpen(true)
      const timer = setTimeout(() => setIsCartOpen(false), 4000)
      prevItemCountRef.current = items.length
      return () => clearTimeout(timer)
    }
    prevItemCountRef.current = items.length
  }, [items.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const closeCart = useCallback(() => setIsCartOpen(false), [])

  // Search functionality
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([])
      setShowResults(false)
      return
    }

    setIsSearching(true)
    setShowResults(true)

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

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`)
      setIsSearchOpen(false)
      setShowResults(false)
      setSearchQuery('')
    }
  }

  const handleResultClick = () => {
    setIsSearchOpen(false)
    setShowResults(false)
    setSearchQuery('')
  }

  return (
    <header className="sticky top-0 z-50 bg-white shadow-sm">
      {/* Top Bar */}
      <div className="bg-primary-700 text-white text-xs py-2">
        <div className="container mx-auto px-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <Phone className="w-3 h-3" />
              {banner.leftText}
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

      {/* Main Header */}
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between gap-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <div className="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xl">S</span>
            </div>
            <div className="hidden sm:block">
              <h1 className="font-bold text-xl text-gray-900">SabziWala</h1>
              <p className="text-xs text-primary-600 font-urdu" dir="rtl">سبزی والا</p>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'px-3 py-2 rounded-lg text-sm font-medium transition-colors',
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
                setIsSearchOpen(!isSearchOpen)
                if (!isSearchOpen) {
                  setTimeout(() => searchInputRef.current?.focus(), 100)
                }
              }}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <Search className="w-5 h-5 text-gray-600" />
            </button>

            {/* Orders */}
            {hasMounted && isAuthenticated && (
              <Link
                href="/orders"
                className="hidden sm:flex p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <Package className="w-5 h-5 text-gray-600" />
              </Link>
            )}

            {/* Cart */}
            <div className="relative">
              <button
                onClick={() => setIsCartOpen(!isCartOpen)}
                className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
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
              className="hidden sm:flex p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <User className="w-5 h-5 text-gray-600" />
            </Link>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="lg:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
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
              <div className="pt-4 relative">
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
                  {showResults && (searchResults.length > 0 || searchQuery.length >= 2) && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute left-0 right-0 top-full mt-2 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-50"
                    >
                      {searchResults.length > 0 ? (
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
                                    src={product.image}
                                    alt={product.name}
                                    fill
                                    className="object-cover"
                                  />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-gray-900 truncate">{product.name}</p>
                                  <p className="text-sm text-gray-500">{product.unit}</p>
                                </div>
                                <span className="font-semibold text-primary-600">
                                  {formatPriceShort(product.price)}
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
                      ) : searchQuery.length >= 2 && !isSearching ? (
                        <div className="p-6 text-center">
                          <p className="text-gray-500">No products found</p>
                          <p className="text-sm text-gray-400 mt-1">Try a different search term</p>
                        </div>
                      ) : null}
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
