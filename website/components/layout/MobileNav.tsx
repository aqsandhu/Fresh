'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Grid3X3, ShoppingCart, Package, User } from 'lucide-react'
import { useCartStore } from '@/store/cartStore'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/products', label: 'Shop', icon: Grid3X3 },
  { href: '/cart', label: 'Cart', icon: ShoppingCart, showBadge: true },
  { href: '/orders', label: 'Orders', icon: Package },
  { href: '/profile', label: 'Profile', icon: User },
]

export default function MobileNav() {
  const pathname = usePathname()
  const { getTotalItems } = useCartStore()
  const [hasMounted, setHasMounted] = useState(false)
  useEffect(() => { setHasMounted(true) }, [])
  const cartItemCount = hasMounted ? getTotalItems() : 0

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 lg:hidden">
      <div className="flex items-center justify-around">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex flex-col items-center py-2 px-3 min-w-[64px]',
              pathname === item.href
                ? 'text-primary-600'
                : 'text-gray-500'
            )}
          >
            <div className="relative">
              <item.icon className="w-5 h-5" />
              {item.showBadge && cartItemCount > 0 && (
                <span className="absolute -top-2 -right-2 w-4 h-4 bg-primary-600 text-white text-[10px] font-medium rounded-full flex items-center justify-center">
                  {cartItemCount > 9 ? '9+' : cartItemCount}
                </span>
              )}
            </div>
            <span className="text-[10px] mt-1">{item.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  )
}
