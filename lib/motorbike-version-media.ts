export const MAX_MOTORBIKE_DETAIL_IMAGES = 20
export const MAX_MOTORBIKE_VERSION_DETAIL_IMAGES = MAX_MOTORBIKE_DETAIL_IMAGES

export function normalizeMotorbikeDetailImages(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  return Array.from(new Set(
    value
      .filter((url): url is string => typeof url === 'string')
      .map((url) => url.trim())
      .filter(Boolean),
  )).slice(0, MAX_MOTORBIKE_DETAIL_IMAGES)
}

export type MotorbikeVersionMedia = {
  version: string
  sku: string
  image_url: string
  detail_image_urls: string[]
}

type VersionLike = {
  name?: unknown
  version?: unknown
  sku?: unknown
  image_url?: unknown
  detail_image_urls?: unknown
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function uniqueUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  return Array.from(new Set(value.map(text).filter(Boolean)))
    .slice(0, MAX_MOTORBIKE_VERSION_DETAIL_IMAGES)
}

function normalizeEntry(value: unknown, fallbackVersion = ''): MotorbikeVersionMedia | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const entry = value as VersionLike
  const version = text(entry.version) || text(entry.name) || fallbackVersion.trim()
  const sku = text(entry.sku)
  const imageUrl = text(entry.image_url)
  const detailImageUrls = uniqueUrls(entry.detail_image_urls)

  if (!version && !sku) return null

  return {
    version,
    sku,
    image_url: imageUrl,
    detail_image_urls: detailImageUrls,
  }
}

export function normalizeMotorbikeVersionMedia(value: unknown): MotorbikeVersionMedia[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeEntry(entry))
      .filter((entry): entry is MotorbikeVersionMedia => entry !== null)
  }

  // Compatibility with the short-lived object-map format used by older drafts.
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([version, entry]) => normalizeEntry(entry, version))
      .filter((entry): entry is MotorbikeVersionMedia => entry !== null)
  }

  return []
}

export function buildMotorbikeVersionMedia(versions: unknown): MotorbikeVersionMedia[] {
  if (!Array.isArray(versions)) return []

  return versions
    .map((version) => normalizeEntry(version))
    .filter((entry): entry is MotorbikeVersionMedia => (
      entry !== null && Boolean(entry.image_url || entry.detail_image_urls.length)
    ))
}

export function findMotorbikeVersionMedia(
  media: MotorbikeVersionMedia[],
  version: { name?: unknown; sku?: unknown },
): MotorbikeVersionMedia | undefined {
  const sku = text(version.sku)
  const name = text(version.name)

  return (
    (sku ? media.find((entry) => entry.sku === sku) : undefined) ??
    (name ? media.find((entry) => entry.version === name) : undefined)
  )
}
