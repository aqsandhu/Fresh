import { staticMetadata } from '@/lib/pageMetadata'

// This page is a client component; its title and description live here.
export const metadata = staticMetadata("Search", "Search Fresh Bazar products.", {"noindex":true})

export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return children
}
