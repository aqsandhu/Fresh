import { staticMetadata } from '@/lib/pageMetadata'

// This page is a client component; its title and description live here.
export const metadata = staticMetadata("Support & complaints", "Get help with an order or file a complaint with Fresh Bazar.", {"path":"/support"})

export default function ShopSupportLayout({ children }: { children: React.ReactNode }) {
  return children
}
