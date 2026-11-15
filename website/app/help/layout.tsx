import { staticMetadata } from '@/lib/pageMetadata'

// This page is a client component; its title and description live here.
export const metadata = staticMetadata("Help", "How to order, pay and track your Fresh Bazar delivery.", {"path":"/help"})

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return children
}
