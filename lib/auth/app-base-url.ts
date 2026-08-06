const WILDCARD_HOSTS = new Set(['0.0.0.0', '::', '[::]'])

function parsePublicHttpUrl(value: string | undefined): string | undefined {
  if (!value) return undefined

  try {
    const url = new URL(value.trim())
    if (!['http:', 'https:'].includes(url.protocol) || WILDCARD_HOSTS.has(url.hostname)) {
      return undefined
    }
    return url.origin
  } catch {
    return undefined
  }
}

/**
 * Resolve the browser-facing origin used by Auth0 redirects.
 * Railway's HOSTNAME/PORT describe the container listener and must never be
 * exposed to a browser as a callback or post-logout URL.
 */
export function resolveAppBaseUrl(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const configuredUrl = parsePublicHttpUrl(env.APP_BASE_URL)
  if (configuredUrl) return configuredUrl

  const railwayDomain = env.RAILWAY_PUBLIC_DOMAIN?.trim()
  const railwayUrl = railwayDomain
    ? parsePublicHttpUrl(`https://${railwayDomain}`)
    : undefined
  if (railwayUrl) return railwayUrl

  // Environment variables configured on Railway are runtime variables and may
  // be absent while the Docker builder runs `next build`. Returning undefined
  // lets the Auth0 SDK defer request-origin resolution until runtime.
  return undefined
}
