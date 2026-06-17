// True on the restaurant storefront pages (post-login), where the consumer
// website chrome (header, mobile nav, footer) must be hidden so a logged-in
// restaurant only sees restaurant options. Login/register stay on the normal
// site so the "Home" + city switcher remain available before choosing.
export function hideConsumerChrome(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  return (
    pathname === '/restaurant' ||
    pathname.startsWith('/restaurant/shop') ||
    pathname.startsWith('/restaurant/orders') ||
    pathname.startsWith('/restaurant/profile')
  )
}
