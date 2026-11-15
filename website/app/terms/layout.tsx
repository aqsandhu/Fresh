import { staticMetadata } from '@/lib/pageMetadata'

// This page is a client component; its title and description live here.
export const metadata = staticMetadata("Terms & conditions", "The terms for using Fresh Bazar.", {"path":"/terms"})

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return children
}
