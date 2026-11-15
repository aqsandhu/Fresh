import { staticMetadata } from '@/lib/pageMetadata'

// This page is a client component; its title and description live here.
export const metadata = staticMetadata("Returns & refunds", "Our return and refund policy for fresh groceries.", {"path":"/returns"})

export default function ReturnsLayout({ children }: { children: React.ReactNode }) {
  return children
}
