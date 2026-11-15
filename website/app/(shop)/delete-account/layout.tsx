import { staticMetadata } from '@/lib/pageMetadata'

// This page is a client component; its title and description live here.
export const metadata = staticMetadata("Delete your account", "How to delete your Fresh Bazar account and data.", {"path":"/delete-account"})

export default function ShopDeleteAccountLayout({ children }: { children: React.ReactNode }) {
  return children
}
