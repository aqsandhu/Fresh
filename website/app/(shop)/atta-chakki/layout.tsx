import { staticMetadata } from '@/lib/pageMetadata'

// This page is a client component; its title and description live here.
export const metadata = staticMetadata("Atta Chakki", "Send us your wheat; we grind it at the chakki and deliver fresh atta to your door.", {"path":"/atta-chakki"})

export default function ShopAttaChakkiLayout({ children }: { children: React.ReactNode }) {
  return children
}
