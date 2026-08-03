const LOCAL_USER_PAGE_PREFIXES = [
  '/admin',
  '/checkout',
  '/deposit',
  '/profile',
] as const

export function requiresLocalUserValidation(pathname: string): boolean {
  return LOCAL_USER_PAGE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}
