import { staticMetadata } from '@/lib/pageMetadata'

// This page is a client component; its title and description live here.
export const metadata = staticMetadata("All products", "Fresh vegetables, fruits, dry fruits and chicken — browse everything Fresh Bazar delivers in your city.", {"path":"/products"})

export default function ShopProductsLayout({ children }: { children: React.ReactNode }) {
  return children
}
