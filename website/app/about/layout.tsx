import { staticMetadata } from '@/lib/pageMetadata'

// This page is a client component; its title and description live here.
export const metadata = staticMetadata("About us", "Fresh Bazar delivers fresh groceries across Pakistan — who we are and how we work.", {"path":"/about"})

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children
}
