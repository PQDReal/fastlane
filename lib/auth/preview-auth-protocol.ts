export const PREVIEW_AUTH_REQUIRED_CODE = 'PREVIEW_AUTH_REQUIRED'
export const PREVIEW_AUTH_REQUIRED_HEADER = 'x-fastlane-auth-error'
export const PREVIEW_AUTH_RETRY_PATH = '/preview-auth/retry'
export const PREVIEW_AUTH_STATUS_PATH = '/api/preview-auth/status'
export const PREVIEW_AUTH_EXPIRY_STORAGE_KEY = 'fastlane:preview-auth-expires-at'
export const PREVIEW_AUTH_RENEWED_EVENT = 'fastlane:preview-auth-renewed'

export function canReplayAfterPreviewAuth(method: string) {
  const normalizedMethod = method.toUpperCase()
  return normalizedMethod === 'GET' || normalizedMethod === 'HEAD'
}

export function isPreviewAuthRequiredResponse(response: Response) {
  return response.status === 401
    && response.headers.get(PREVIEW_AUTH_REQUIRED_HEADER) === PREVIEW_AUTH_REQUIRED_CODE
}

export function createPreviewAuthRetryHref(currentLocation: Pick<Location, 'pathname' | 'search' | 'hash'>) {
  const returnTo = `${currentLocation.pathname}${currentLocation.search}${currentLocation.hash}`
  return `${PREVIEW_AUTH_RETRY_PATH}?returnTo=${encodeURIComponent(returnTo)}`
}
