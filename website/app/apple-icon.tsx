import { renderBrandIcon } from '@/lib/brandIcon'

// Apple touch icon (iOS home screen) + an extra square icon source Google also
// accepts. Same square PNG pipeline as app/icon.tsx, at Apple's 180x180.
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'
// Edge runtime — see app/icon.tsx for why (@vercel/og WASM + build export).
export const runtime = 'edge'

export default function AppleIcon() {
  return renderBrandIcon(size.width)
}
