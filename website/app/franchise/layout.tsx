import { staticMetadata } from '@/lib/pageMetadata'

// This page is a client component; its title and description live here.
export const metadata = staticMetadata("Franchise", "Open a Fresh Bazar franchise in your city.", {"path":"/franchise"})

export default function FranchiseLayout({ children }: { children: React.ReactNode }) {
  return children
}
