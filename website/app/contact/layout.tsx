import { staticMetadata } from '@/lib/pageMetadata'

// This page is a client component; its title and description live here.
export const metadata = staticMetadata("Contact us", "Phone, WhatsApp and email for Fresh Bazar customer care.", {"path":"/contact"})

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children
}
