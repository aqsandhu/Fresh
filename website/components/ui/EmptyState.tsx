'use client'

import { Package, ShoppingCart, Search, MapPin } from 'lucide-react'
import Button from './Button'

interface EmptyStateProps {
  type?: 'cart' | 'orders' | 'search' | 'address' | 'generic'
  title?: string
  description?: string
  actionLabel?: string
  onAction?: () => void
}

const icons = {
  cart: ShoppingCart,
  orders: Package,
  search: Search,
  address: MapPin,
  generic: Package,
}

const defaultContent = {
  cart: {
    title: 'Your cart is empty',
    description: 'Looks like you haven\'t added anything to your cart yet.',
    actionLabel: 'Start Shopping',
  },
  orders: {
    title: 'No orders yet',
    description: 'You haven\'t placed any orders yet. Start shopping to see your orders here.',
    actionLabel: 'Shop Now',
  },
  search: {
    title: 'No results found',
    description: 'We couldn\'t find any products matching your search.',
    actionLabel: 'Clear Search',
  },
  address: {
    title: 'No addresses saved',
    description: 'You haven\'t saved any delivery addresses yet.',
    actionLabel: 'Add Address',
  },
  generic: {
    title: 'Nothing here yet',
    description: 'There are no items to display at the moment.',
    actionLabel: 'Go Back',
  },
}

export default function EmptyState({
  type = 'generic',
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  const Icon = icons[type]
  const content = defaultContent[type]

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-20 h-20 bg-primary-50 rounded-full flex items-center justify-center mb-4">
        <Icon className="w-10 h-10 text-primary-500" />
      </div>
      <h3 className="text-xl font-semibold text-gray-900 mb-2">
        {title || content.title}
      </h3>
      <p className="text-gray-500 max-w-sm mb-6">
        {description || content.description}
      </p>
      {onAction && (
        <Button onClick={onAction}>
          {actionLabel || content.actionLabel}
        </Button>
      )}
    </div>
  )
}
