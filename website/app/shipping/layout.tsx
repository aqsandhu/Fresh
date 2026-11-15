import { staticMetadata } from '@/lib/pageMetadata'

// This page is a client component; its title and description live here.
export const metadata = staticMetadata("Delivery information", "Delivery areas, time slots and charges at Fresh Bazar.", {"path":"/shipping"})

export default function ShippingLayout({ children }: { children: React.ReactNode }) {
  return children
}
