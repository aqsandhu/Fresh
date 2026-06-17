'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Store, ClipboardList, User } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/restaurant/shop', label: 'Shop', icon: Store },
  { href: '/restaurant/orders', label: 'Orders', icon: ClipboardList },
  { href: '/restaurant/profile', label: 'Profile', icon: User },
]

/** Fixed bottom bar for the restaurant storefront (mobile only) — mirrors the
 *  consumer MobileNav but with restaurant-only options. */
export default function RestaurantMobileNav() {
  const pathname = usePathname()
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 lg:hidden">
      <div className="flex items-center justify-around">
        {navItems.map((item) => {
          const active = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center py-2 px-3 min-w-[64px]',
                active ? 'text-primary-600' : 'text-gray-500'
              )}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-[10px] mt-1">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
