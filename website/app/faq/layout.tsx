import { staticMetadata } from '@/lib/pageMetadata'

// This page is a client component; its title and description live here.
export const metadata = staticMetadata("Frequently asked questions", "Answers about delivery, payment, orders and returns at Fresh Bazar.", {"path":"/faq"})

export default function FaqLayout({ children }: { children: React.ReactNode }) {
  return children
}
