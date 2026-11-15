import { staticMetadata } from '@/lib/pageMetadata'

// This page is a client component; its title and description live here.
export const metadata = staticMetadata("Privacy policy", "How Fresh Bazar collects, uses and protects your information.", {"path":"/privacy"})

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return children
}
