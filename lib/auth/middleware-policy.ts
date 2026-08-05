const LOCAL_USER_PAGE_PREFIXES = [
  '/admin',
  '/checkout',
  '/deposit',
  '/profile',
] as const

export function isCartMutationRequest(pathname: string, method: string): boolean {
  const isCartItemPath = pathname === '/api/v1/cart/items'
    || pathname.startsWith('/api/v1/cart/items/')
  return isCartItemPath && ['POST', 'PATCH', 'DELETE'].includes(method.toUpperCase())
}

export function requiresLocalUserValidation(pathname: string): boolean {
  return LOCAL_USER_PAGE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}
