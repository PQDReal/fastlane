const ALLOWED_KNOWLEDGE_MEDIA_HOSTS = new Set([
  'om.vinfastauto.com',
  'res.cloudinary.com',
  'fastlane.vn',
])

export function isAllowedKnowledgeMediaUrl(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return true

  try {
    const url = new URL(trimmed)
    if (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)) {
      return true
    }
    if (url.protocol !== 'https:') return false
    return ALLOWED_KNOWLEDGE_MEDIA_HOSTS.has(url.hostname)
      || url.hostname.endsWith('.fastlane.vn')
  } catch {
    return false
  }
}
